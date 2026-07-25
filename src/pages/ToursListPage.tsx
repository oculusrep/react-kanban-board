import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchTourStops, removeTourStop } from '../hooks/useTours';
import type { TourStopWithSiteSubmit } from '../lib/tourTypes';

// ---------------------------------------------------------------------------
// ToursListPage — bare Phase 1 page to verify staging produces real rows.
// Lists all tours the current (internal) user can see, with stop counts;
// expand a tour to see its ordered stops. Drag-and-drop, map, PDF, and route
// optimization arrive in later phases (see docs/TOUR_FEATURE_PLAN.md).
// ---------------------------------------------------------------------------

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';

interface TourRow {
  id: string;
  tour_name: string;
  tour_date: string | null;
  is_archived: boolean;
  created_at: string;
  client: { client_name: string | null } | null;
  stop_count: number;
}

export function ToursListPage() {
  const [tours, setTours] = useState<TourRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stops, setStops] = useState<TourStopWithSiteSubmit[]>([]);
  const [stopsLoading, setStopsLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('tour')
        .select('id, tour_name, tour_date, is_archived, created_at, client:client_id(client_name), tour_stop(count)')
        .order('is_archived', { ascending: true })
        .order('created_at', { ascending: false });
      if (err) throw err;
      setTours(
        (data || []).map((r: any) => ({
          ...r,
          stop_count: r.tour_stop?.[0]?.count ?? 0,
        }))
      );
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tours');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleExpand = async (tourId: string) => {
    if (expandedId === tourId) {
      setExpandedId(null);
      setStops([]);
      return;
    }
    setExpandedId(tourId);
    setStopsLoading(true);
    try {
      setStops(await fetchTourStops(tourId));
    } catch (e: any) {
      setError(e.message ?? 'Failed to load stops');
    } finally {
      setStopsLoading(false);
    }
  };

  const handleRemoveStop = async (stopId: string) => {
    const res = await removeTourStop(stopId);
    if (res.ok) {
      setStops((prev) => prev.filter((s) => s.id !== stopId));
      load();
    } else {
      setError(res.error ?? 'Failed to remove stop');
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ color: MIDNIGHT, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Tours</h1>
      <p style={{ color: STEEL, fontSize: 13, marginBottom: 20 }}>
        Phase 1 — verify staging. Stage site submits onto a tour from a site submit, then confirm
        them here. Drag-and-drop reordering, map route, and PDF export come next.
      </p>

      {error && (
        <div style={{ padding: 12, border: `1px solid #A27B5C`, borderRadius: 6, color: '#A27B5C', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: SLATE }}>Loading tours…</div>
      ) : tours.length === 0 ? (
        <div style={{ color: SLATE }}>
          No tours yet. Use “Add to tour” on a site submit to create one.
        </div>
      ) : (
        <div style={{ border: `1px solid ${SLATE}`, borderRadius: 8, overflow: 'hidden' }}>
          {tours.map((t, i) => (
            <div key={t.id} style={{ borderTop: i === 0 ? 'none' : `1px solid #E5EAF1` }}>
              <button
                type="button"
                onClick={() => toggleExpand(t.id)}
                style={{
                  display: 'flex',
                  width: '100%',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 16px',
                  background: t.is_archived ? '#F8FAFC' : '#FFFFFF',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <span style={{ color: MIDNIGHT, fontWeight: 600 }}>{t.tour_name}</span>
                  {t.is_archived && <span style={{ color: SLATE, fontSize: 12, marginLeft: 8 }}>archived</span>}
                  <div style={{ color: STEEL, fontSize: 12, marginTop: 2 }}>
                    {t.client?.client_name ?? 'Unknown client'}
                    {t.tour_date ? ` · ${t.tour_date}` : ''}
                  </div>
                </div>
                <span style={{ color: STEEL, fontSize: 13 }}>
                  {t.stop_count} stop{t.stop_count === 1 ? '' : 's'} {expandedId === t.id ? '▲' : '▼'}
                </span>
              </button>

              {expandedId === t.id && (
                <div style={{ padding: '0 16px 12px 16px', background: '#F8FAFC' }}>
                  {stopsLoading ? (
                    <div style={{ color: SLATE, padding: '8px 0' }}>Loading stops…</div>
                  ) : stops.length === 0 ? (
                    <div style={{ color: SLATE, padding: '8px 0' }}>No stops staged yet.</div>
                  ) : (
                    <ol style={{ margin: 0, paddingLeft: 20 }}>
                      {stops.map((s) => (
                        <li key={s.id} style={{ padding: '4px 0', color: MIDNIGHT, fontSize: 14 }}>
                          <span>{s.site_submit?.site_submit_name ?? '(unnamed site submit)'}</span>
                          {s.category?.name && (
                            <span style={{ color: STEEL, fontSize: 12, marginLeft: 8 }}>· {s.category.name}</span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveStop(s.id)}
                            style={{
                              marginLeft: 10,
                              border: 'none',
                              background: 'transparent',
                              color: '#A27B5C',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            remove
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default ToursListPage;
