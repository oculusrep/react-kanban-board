import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import type {
  Tour,
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
  }) => Promise<Tour | null>;
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

  const createTour = useCallback(
    async (input: { tour_name: string; description?: string | null; tour_date?: string | null }) => {
      if (!clientId) return null;
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
        return null;
      }
      await refresh();
      return data as Tour;
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
  return { ok: true };
}

export async function removeTourStop(stopId: string): Promise<{ ok: boolean; error?: string }> {
  const { error: err } = await supabase.from('tour_stop').delete().eq('id', stopId);
  return err ? { ok: false, error: err.message } : { ok: true };
}

// Persist a full reordering: pass stop ids in their new order.
export async function reorderTourStops(orderedStopIds: string[]): Promise<{ ok: boolean; error?: string }> {
  // Update each stop's position to its index. Kept simple (Phase 1); batch if needed later.
  for (let i = 0; i < orderedStopIds.length; i++) {
    const { error: err } = await supabase
      .from('tour_stop')
      .update({ position: i })
      .eq('id', orderedStopIds[i]);
    if (err) return { ok: false, error: err.message };
  }
  return { ok: true };
}

export async function fetchTourStops(tourId: string): Promise<TourStopWithSiteSubmit[]> {
  const { data, error: err } = await supabase
    .from('tour_stop')
    .select(
      `*,
       site_submit:site_submit_id ( id, site_submit_name, submit_stage_id, property_id ),
       category:category_id ( id, name, sort_order, is_active )`
    )
    .eq('tour_id', tourId)
    .order('position', { ascending: true });

  if (err) throw err;
  return (data || []) as unknown as TourStopWithSiteSubmit[];
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

export type { Tour, TourStop, TourStopCategory, TourStopWithSiteSubmit, TourWithStopCount };
