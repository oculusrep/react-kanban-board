// Tour-aware Packages dashboard (2026-10-30). Reads tours and their stops so the
// dashboard can show one row per stop, in stop order. Read-only: tour / tour_day /
// tour_stop are internal-readable already (20260725170000, 20260726120000).
//
// Stop order = day_number, then position within the day; unscheduled stops last.
// Stop label matches the tour map's per-day numbering: "D1·3"; unscheduled = "—".

import { supabase } from './supabaseClient';

export interface TourOption {
  id: string;
  tour_name: string;
  tour_date: string | null;
  is_archived: boolean;
}

export interface TourStopSite {
  stopId: string;
  stopLabel: string;            // "D1·3", or "—" when unscheduled
  siteSubmitId: string;
  dealId: string | null;
  name: string;
  city: string | null;
  stageName: string | null;     // submit_stage.name
}

// Stages that end a site's pursuit: dimmed at the bottom of the tour view, no Start
// Package, left out of the header counts (decision 2026-10-30).
export const CLOSED_STAGES = ['Pass', 'Lost / Killed', 'Use Declined', 'Not Available'];
export const isClosedStage = (stage: string | null | undefined) => !!stage && CLOSED_STAGES.includes(stage);

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

// Active tours first, then newest tour date, then newest created.
export async function fetchTourOptions(): Promise<TourOption[]> {
  const { data, error } = await supabase
    .from('tour')
    .select('id, tour_name, tour_date, is_archived, created_at')
    .order('is_archived', { ascending: true })
    .order('tour_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as TourOption[]) ?? [];
}

export async function fetchTourStopSites(tourId: string): Promise<TourStopSite[]> {
  const [daysRes, stopsRes] = await Promise.all([
    supabase.from('tour_day').select('id, day_number').eq('tour_id', tourId),
    supabase.from('tour_stop').select('id, site_submit_id, tour_day_id, position').eq('tour_id', tourId),
  ]);
  if (daysRes.error) throw daysRes.error;
  if (stopsRes.error) throw stopsRes.error;
  const dayNum = new Map(((daysRes.data as { id: string; day_number: number }[]) ?? []).map((d) => [d.id, d.day_number]));
  const stops = ((stopsRes.data as { id: string; site_submit_id: string; tour_day_id: string | null; position: number }[]) ?? [])
    .map((s) => ({ ...s, day: s.tour_day_id ? dayNum.get(s.tour_day_id) ?? null : null }));
  stops.sort((a, b) =>
    (a.day ?? Number.MAX_SAFE_INTEGER) - (b.day ?? Number.MAX_SAFE_INTEGER) || a.position - b.position);
  if (!stops.length) return [];

  // One batched read for the stops' sites (a tour is tens of stops, not thousands).
  const { data: sites, error } = await supabase
    .from('site_submit')
    .select('id, site_submit_name, deal_id, stage:submit_stage!site_submit_submit_stage_id_fkey ( name ), property:property!site_submit_property_id_fkey ( property_name, city )')
    .in('id', stops.map((s) => s.site_submit_id));
  if (error) throw error;
  const byId = new Map(((sites as any[]) ?? []).map((s) => [s.id, s]));

  const perDay = new Map<number, number>();
  return stops.map((s) => {
    const site = byId.get(s.site_submit_id);
    const prop = one(site?.property) as { property_name: string | null; city: string | null } | null;
    let stopLabel = '—';
    if (s.day != null) {
      const n = (perDay.get(s.day) ?? 0) + 1;
      perDay.set(s.day, n);
      stopLabel = `D${s.day}·${n}`;
    }
    return {
      stopId: s.id,
      stopLabel,
      siteSubmitId: s.site_submit_id,
      dealId: site?.deal_id ?? null,
      name: prop?.property_name || site?.site_submit_name || 'Site submit',
      city: prop?.city ?? null,
      stageName: (one(site?.stage) as { name: string | null } | null)?.name ?? null,
    };
  });
}
