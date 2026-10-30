import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  Tour,
  TourDay,
  TourStop,
  TourStopCategory,
  TourStopWithSiteSubmit,
  TourWithStopCount,
} from '../lib/tourTypes';

// ---------------------------------------------------------------------------
// useTours — list/create tours for a client, and manage their stops.
// Overlay-first: takes clientId as an arg, does not read useParams.
// ---------------------------------------------------------------------------

interface UseToursResult {
  tours: TourWithStopCount[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  createTour: (input: {
    tour_name: string;
    description?: string | null;
    tour_date?: string | null;
  }) => Promise<{ tour: Tour | null; error?: string }>;
}

export function useTours(clientId: string | null | undefined): UseToursResult {
  const [tours, setTours] = useState<TourWithStopCount[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!clientId) {
      setTours([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      // Fetch tours + a lightweight stop count via the embedded aggregate.
      const { data, error: err } = await supabase
        .from('tour')
        .select('*, tour_stop(count)')
        .eq('client_id', clientId)
        .order('is_archived', { ascending: true })
        .order('created_at', { ascending: false });

      if (err) throw err;

      const mapped: TourWithStopCount[] = (data || []).map((row: any) => ({
        ...row,
        stop_count: row.tour_stop?.[0]?.count ?? 0,
      }));
      setTours(mapped);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tours');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Stop counts change whenever any stop is added/removed elsewhere.
  useEffect(() => onTourStopsChanged(null, () => void refresh()), [refresh]);

  const createTour = useCallback(
    async (input: { tour_name: string; description?: string | null; tour_date?: string | null }) => {
      if (!clientId) return { tour: null, error: 'No client selected' };
      const { data: userData } = await supabase.auth.getUser();
      const { data, error: err } = await supabase
        .from('tour')
        .insert({
          client_id: clientId,
          tour_name: input.tour_name,
          description: input.description ?? null,
          tour_date: input.tour_date ?? null,
          created_by_id: userData?.user?.id ?? null,
        })
        .select('*')
        .single();

      if (err) {
        setError(err.message);
        return { tour: null, error: err.message };
      }
      await refresh();
      return { tour: data as Tour };
    },
    [clientId, refresh]
  );

  return { tours, loading, error, refresh, createTour };
}

// ---------------------------------------------------------------------------
// Stop management (standalone helpers — usable from staging button, tour page, map)
// ---------------------------------------------------------------------------

// Stage a site submit onto a tour at the end of the ordered list.
export async function addSiteSubmitToTour(
  tourId: string,
  siteSubmitId: string,
  categoryId?: string | null
): Promise<{ ok: boolean; error?: string; alreadyStaged?: boolean }> {
  // Next position = current max + 1.
  const { data: existing, error: posErr } = await supabase
    .from('tour_stop')
    .select('position')
    .eq('tour_id', tourId)
    .order('position', { ascending: false })
    .limit(1);

  if (posErr) return { ok: false, error: posErr.message };
  const nextPosition = (existing?.[0]?.position ?? -1) + 1;

  const { error: insErr } = await supabase.from('tour_stop').insert({
    tour_id: tourId,
    site_submit_id: siteSubmitId,
    position: nextPosition,
    category_id: categoryId ?? null,
  });

  if (insErr) {
    // Unique (tour_id, site_submit_id) violation => already staged.
    if (insErr.code === '23505') return { ok: false, alreadyStaged: true };
    return { ok: false, error: insErr.message };
  }
  notifyTourStopsChanged(tourId);
  return { ok: true };
}

// Delete a stop, then renumber what's left in its day (or the unscheduled bucket) 0..n-1
// through the atomic placement RPC. The renumber is cosmetic — order is by position, so a
// failed renumber leaves a gap, not a wrong order — but it's reported as an error.
export async function removeTourStop(stopId: string): Promise<{ ok: boolean; error?: string }> {
  const { data: gone, error: err } = await supabase
    .from('tour_stop')
    .delete()
    .eq('id', stopId)
    .select('tour_id, tour_day_id')
    .maybeSingle();
  if (err) return { ok: false, error: err.message };
  if (!gone) return { ok: false, error: 'Stop not found (already removed?)' };

  let q = supabase.from('tour_stop').select('id, position').eq('tour_id', gone.tour_id);
  q = gone.tour_day_id ? q.eq('tour_day_id', gone.tour_day_id) : q.is('tour_day_id', null);
  const { data: rest, error: restErr } = await q.order('position', { ascending: true });
  let result: { ok: boolean; error?: string } = { ok: true };
  if (restErr) result = { ok: false, error: `Removed, but couldn't renumber: ${restErr.message}` };
  else {
    const placements = (rest ?? []).map((r: { id: string }, i: number) => ({
      id: r.id,
      tour_day_id: gone.tour_day_id as string | null,
      position: i,
    }));
    const res = await persistStopPlacements(gone.tour_id, placements);
    if (!res.ok) result = { ok: false, error: `Removed, but couldn't renumber: ${res.error}` };
  }
  notifyTourStopsChanged(gone.tour_id);
  return result;
}

// Which tours already contain this site submit (one row per tour; unique tour_id+site_submit_id).
export interface SiteSubmitTourMembership {
  id: string; // tour_stop id
  tour_id: string;
  notes: string | null;
  display_label: string | null;
  approach_waypoints_override: unknown;
  actual_departure_at: string | null;
}
export async function fetchSiteSubmitTourStops(siteSubmitId: string): Promise<SiteSubmitTourMembership[]> {
  const { data, error: err } = await supabase
    .from('tour_stop')
    .select('id, tour_id, notes, display_label, approach_waypoints_override, actual_departure_at')
    .eq('site_submit_id', siteSubmitId);
  if (err) throw err;
  return (data ?? []) as SiteSubmitTourMembership[];
}

// ---- Change notifications ----
// Any stop add/remove announces its tour so an open tour panel, tour map, or another
// AddToTourButton refreshes without prop drilling (same pattern as packageTracker).
const TOUR_STOPS_EVENT = 'ovis:tour-stops-changed';
export function notifyTourStopsChanged(tourId: string) {
  window.dispatchEvent(new CustomEvent(TOUR_STOPS_EVENT, { detail: { tourId } }));
}
/** tourId null = listen to every tour. Returns an unsubscribe. */
export function onTourStopsChanged(tourId: string | null, fn: (tourId: string) => void): () => void {
  const h = (e: Event) => {
    const id = (e as CustomEvent).detail?.tourId as string;
    if (tourId === null || id === tourId) fn(id);
  };
  window.addEventListener(TOUR_STOPS_EVENT, h);
  return () => window.removeEventListener(TOUR_STOPS_EVENT, h);
}

export async function updateTour(
  tourId: string,
  fields: Partial<Pick<Tour, 'tour_name' | 'description' | 'tour_date' | 'is_archived'>>
): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour').update(fields).eq('id', tourId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

export async function deleteTour(tourId: string): Promise<{ ok: boolean; error?: string }> {
  // tour_stop rows cascade-delete via FK.
  const { error: err } = await supabase.from('tour').delete().eq('id', tourId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

export async function updateTourStop(
  stopId: string,
  fields: Partial<Pick<TourStop, 'category_id' | 'notes' | 'stop_duration_minutes' | 'display_label'>>
): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour_stop').update(fields).eq('id', stopId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// Persist a full day/position layout (drag, Optimize) in ONE atomic write via the
// set_tour_stop_placements RPC. Each entry sets a stop's day (null = unscheduled) and
// its position within that day. All-or-nothing: a stale/foreign id rejects the batch.
export async function persistStopPlacements(
  tourId: string,
  placements: { id: string; tour_day_id: string | null; position: number }[]
): Promise<{ ok: boolean; error?: string }> {
  if (placements.length === 0) return { ok: true };
  const { error: err } = await supabase.rpc('set_tour_stop_placements', {
    p_tour_id: tourId,
    p_placements: placements,
  });
  return err ? { ok: false, error: err.message } : { ok: true };
}

// ---- Live day departures ----

// Stamp (ISO) or clear (null) when the tour left a stop.
export async function setStopDeparture(stopId: string, at: string | null): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour_stop').update({ actual_departure_at: at }).eq('id', stopId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// "Reset to plan": clear every stamp on a day in one statement.
export async function resetDayDepartures(dayId: string): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase
    .from('tour_stop')
    .update({ actual_departure_at: null })
    .eq('tour_day_id', dayId)
    .not('actual_departure_at', 'is', null);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// ---- Site approach routes ----

// Site default approach (site_submit.approach_waypoints). null clears it. Note: bumps the
// site submit's updated_at/updated_by (audit trigger).
export async function setSiteApproach(
  siteSubmitId: string,
  points: { lat: number; lng: number }[] | null
): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase
    .from('site_submit')
    .update({ approach_waypoints: points && points.length ? points : null })
    .eq('id', siteSubmitId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// Per-tour override (tour_stop.approach_waypoints_override). null = fall back to the site
// default; [] = explicitly no approach on this tour.
export async function setStopApproachOverride(
  stopId: string,
  points: { lat: number; lng: number }[] | null
): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour_stop').update({ approach_waypoints_override: points }).eq('id', stopId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// ---- Tour days ----

export async function fetchTourDays(tourId: string): Promise<TourDay[]> {
  const { data, error: err } = await supabase
    .from('tour_day')
    .select('*')
    .eq('tour_id', tourId)
    .order('day_number', { ascending: true });
  if (err) throw err;
  return (data || []) as TourDay[];
}

export async function createTourDay(
  tourId: string,
  dayNumber: number,
  defaults?: { start_time?: string | null; end_time?: string | null }
): Promise<{ day: TourDay | null; error?: string }> {
  const { data, error: err } = await supabase
    .from('tour_day')
    .insert({
      tour_id: tourId,
      day_number: dayNumber,
      start_time: defaults?.start_time ?? '09:00',
      end_time: defaults?.end_time ?? '17:00',
    })
    .select('*')
    .single();
  if (err) return { day: null, error: err.message };
  return { day: data as TourDay };
}

export async function updateTourDay(
  dayId: string,
  fields: Partial<
    Pick<
      TourDay,
      | 'day_date'
      | 'start_time'
      | 'end_time'
      | 'day_number'
      | 'start_location_address'
      | 'start_latitude'
      | 'start_longitude'
      | 'end_location_address'
      | 'end_latitude'
      | 'end_longitude'
    >
  >
): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour_day').update(fields).eq('id', dayId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// Delete a day; its stops fall back to unscheduled (FK ON DELETE SET NULL).
export async function deleteTourDay(dayId: string): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour_day').delete().eq('id', dayId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

export async function fetchTour(tourId: string): Promise<Tour | null> {
  const { data, error: err } = await supabase.from('tour').select('*').eq('id', tourId).single();
  if (err) throw err;
  return (data as Tour) ?? null;
}

export async function fetchTourStops(tourId: string): Promise<TourStopWithSiteSubmit[]> {
  const { data, error: err } = await supabase
    .from('tour_stop')
    .select(
      `*,
       site_submit:site_submit_id (
         id, site_submit_name, submit_stage_id, property_id, approach_waypoints,
         verified_latitude, verified_longitude, sf_property_latitude, sf_property_longitude,
         property:property_id ( property_name, address, city, latitude, longitude, verified_latitude, verified_longitude )
       ),
       category:category_id ( id, name, sort_order, is_active, default_stop_duration_minutes )`
    )
    .eq('tour_id', tourId)
    .order('position', { ascending: true });

  if (err) throw err;
  return (data || []) as unknown as TourStopWithSiteSubmit[];
}

// Stops with resolved lat/lng + effective duration, for the map/route view.
export async function fetchTourStopsForMap(tourId: string): Promise<import('../lib/tourTypes').TourStopGeo[]> {
  const { resolveStopCoord, stopDisplayName, effectiveApproach, parseApproach } = await import('../lib/tourRouting');
  const { data, error: err } = await supabase
    .from('tour_stop')
    .select(
      `id, tour_day_id, position, site_submit_id, category_id, stop_duration_minutes, display_label,
       approach_waypoints_override, actual_departure_at, notes,
       category:category_id ( name, default_stop_duration_minutes ),
       site_submit:site_submit_id (
         id, site_submit_name, submit_stage_id, property_id, approach_waypoints,
         verified_latitude, verified_longitude, sf_property_latitude, sf_property_longitude,
         property:property_id ( property_name, address, city, latitude, longitude, verified_latitude, verified_longitude )
       )`
    )
    .eq('tour_id', tourId)
    .order('position', { ascending: true });

  if (err) throw err;

  return (data || []).map((row: any) => {
    const coord = resolveStopCoord(row.site_submit);
    const effective =
      row.stop_duration_minutes != null
        ? row.stop_duration_minutes
        : row.category?.default_stop_duration_minutes ?? 5;
    const approach = effectiveApproach(row.approach_waypoints_override, row.site_submit?.approach_waypoints);
    const label = stopDisplayName({
      display_label: row.display_label,
      site_submit_name: row.site_submit?.site_submit_name,
      property: row.site_submit?.property,
    });
    return {
      id: row.id,
      tour_day_id: row.tour_day_id,
      position: row.position,
      site_submit_id: row.site_submit_id,
      site_submit_name: row.site_submit?.site_submit_name ?? null,
      display_name: label.name,
      display_subtext: label.subtext,
      category_id: row.category_id,
      category_name: row.category?.name ?? null,
      effective_duration_minutes: effective,
      lat: coord?.lat ?? null,
      lng: coord?.lng ?? null,
      approach: approach.points,
      approach_source: approach.source,
      approach_override: parseApproach(row.approach_waypoints_override),
      site_has_approach: (parseApproach(row.site_submit?.approach_waypoints)?.length ?? 0) > 0,
      actual_departure_at: row.actual_departure_at ?? null,
      notes: row.notes ?? null,
      address:
        [row.site_submit?.property?.address, row.site_submit?.property?.city].filter((x: string | null) => x && String(x).trim()).join(', ') ||
        null,
    };
  });
}

// Client display name for the tour PDF cover.
export async function fetchClientName(clientId: string | null | undefined): Promise<string | null> {
  if (!clientId) return null;
  const { data } = await supabase.from('client').select('client_name').eq('id', clientId).maybeSingle();
  return (data as { client_name?: string | null } | null)?.client_name ?? null;
}

export async function fetchTourStopCategories(): Promise<TourStopCategory[]> {
  const { data, error: err } = await supabase
    .from('tour_stop_category')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (err) throw err;
  return (data || []) as TourStopCategory[];
}

export type { Tour, TourDay, TourStop, TourStopCategory, TourStopWithSiteSubmit, TourWithStopCount };
