import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import TourDetailSlideout from '../components/tours/TourDetailSlideout';

// ---------------------------------------------------------------------------
// ToursListPage — lists tours the current (internal) user can see, with stop
// counts. Tour name links to the full page (/tours/:id); "Open" reveals the same
// detail panel in a slideout (overlay-first). See docs/TOUR_FEATURE_PLAN.md.
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
  const [slideoutTourId, setSlideoutTourId] = useState<string | null>(null);

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

  return (
    <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ color: MIDNIGHT, fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Tours</h1>
      <p style={{ color: STEEL, fontSize: 13, marginBottom: 20 }}>
        Stage site submits onto a tour with “Add to tour”, then open a tour to reorder stops and
        set categories. Route optimization, map rendering, and PDF export come next.
      </p>

      {error && (
        <div style={{ padding: 12, border: '1px solid #A27B5C', borderRadius: 6, color: '#A27B5C', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ color: SLATE }}>Loading tours…</div>
      ) : tours.length === 0 ? (
        <div style={{ color: SLATE }}>No tours yet. Use “Add to tour” on a site submit to create one.</div>
      ) : (
        <div style={{ border: `1px solid ${SLATE}`, borderRadius: 8, overflow: 'hidden' }}>
          {tours.map((t, i) => (
            <div
              key={t.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderTop: i === 0 ? 'none' : '1px solid #E5EAF1',
                background: t.is_archived ? '#F8FAFC' : '#FFFFFF',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Link to={`/tours/${t.id}`} style={{ color: MIDNIGHT, fontWeight: 600, textDecoration: 'none' }}>
                  {t.tour_name}
                </Link>
                {t.is_archived && <span style={{ color: SLATE, fontSize: 12, marginLeft: 8 }}>archived</span>}
                <div style={{ color: STEEL, fontSize: 12, marginTop: 2 }}>
                  {t.client?.client_name ?? 'Unknown client'}
                  {t.tour_date ? ` · ${t.tour_date}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                <span style={{ color: STEEL, fontSize: 13 }}>
                  {t.stop_count} stop{t.stop_count === 1 ? '' : 's'}
                </span>
                <button
                  type="button"
                  onClick={() => setSlideoutTourId(t.id)}
                  style={{ border: `1px solid ${MIDNIGHT}`, color: MIDNIGHT, background: 'white', borderRadius: 6, padding: '4px 12px', fontSize: 13, cursor: 'pointer' }}
                >
                  Open
                </button>
                <Link
                  to={`/tours/${t.id}/map`}
                  style={{ border: `1px solid ${MIDNIGHT}`, color: '#fff', background: MIDNIGHT, borderRadius: 6, padding: '4px 12px', fontSize: 13, textDecoration: 'none' }}
                >
                  Map
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <TourDetailSlideout
        tourId={slideoutTourId}
        isOpen={!!slideoutTourId}
        onClose={() => setSlideoutTourId(null)}
        onChanged={load}
      />
    </div>
  );
}

export default ToursListPage;
