import { useCallback, useEffect, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Link } from 'react-router-dom';
import {
  fetchTour,
  fetchTourStops,
  fetchTourStopCategories,
  reorderTourStops,
  removeTourStop,
  updateTour,
  updateTourStop,
  deleteTour,
} from '../../hooks/useTours';
import type { Tour, TourStopCategory, TourStopWithSiteSubmit } from '../../lib/tourTypes';

// ---------------------------------------------------------------------------
// TourDetailPanel — overlay-first, drop-in tour editor.
// Takes a tourId prop (no useParams), so it renders identically inside a page
// (/tours/:id) or a slideout body. Handles: header edit (name/date/archive/delete),
// drag-and-drop stop reordering, and per-stop category + notes + remove.
// ---------------------------------------------------------------------------

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

interface TourDetailPanelProps {
  tourId: string;
  /** Called after any change that alters the tour list (rename, archive, delete). */
  onChanged?: () => void;
  /** Called after the tour is deleted, so a host page/slideout can close/navigate. */
  onDeleted?: () => void;
}

export function TourDetailPanel({ tourId, onChanged, onDeleted }: TourDetailPanelProps) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [stops, setStops] = useState<TourStopWithSiteSubmit[]>([]);
  const [categories, setCategories] = useState<TourStopCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, s, c] = await Promise.all([
        fetchTour(tourId),
        fetchTourStops(tourId),
        fetchTourStopCategories(),
      ]);
      setTour(t);
      setNameDraft(t?.tour_name ?? '');
      setStops(s);
      setCategories(c);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tour');
    } finally {
      setLoading(false);
    }
  }, [tourId]);

  useEffect(() => {
    load();
  }, [load]);

  const patchTour = async (fields: Partial<Tour>) => {
    if (!tour) return;
    const prev = tour;
    setTour({ ...tour, ...fields }); // optimistic
    const res = await updateTour(tour.id, fields as any);
    if (!res.ok) {
      setTour(prev);
      setError(res.error ?? 'Failed to update tour');
    } else {
      onChanged?.();
    }
  };

  const handleNameBlur = async () => {
    const name = nameDraft.trim();
    if (!tour || !name || name === tour.tour_name) {
      setNameDraft(tour?.tour_name ?? '');
      return;
    }
    setSavingName(true);
    await patchTour({ tour_name: name });
    setSavingName(false);
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source } = result;
    if (!destination || destination.index === source.index) return;

    const reordered = Array.from(stops);
    const [moved] = reordered.splice(source.index, 1);
    reordered.splice(destination.index, 0, moved);
    setStops(reordered); // optimistic

    const res = await reorderTourStops(reordered.map((s) => s.id));
    if (!res.ok) {
      setError(res.error ?? 'Failed to save new order');
      load(); // resync from server
    }
  };

  const handleCategoryChange = async (stopId: string, categoryId: string) => {
    const value = categoryId || null;
    setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, category_id: value } : s)));
    const res = await updateTourStop(stopId, { category_id: value });
    if (!res.ok) setError(res.error ?? 'Failed to update category');
  };

  const handleNotesBlur = async (stopId: string, notes: string) => {
    const value = notes.trim() || null;
    const res = await updateTourStop(stopId, { notes: value });
    if (!res.ok) setError(res.error ?? 'Failed to save notes');
  };

  const handleRemove = async (stopId: string) => {
    const prev = stops;
    setStops((s) => s.filter((x) => x.id !== stopId));
    const res = await removeTourStop(stopId);
    if (res.ok) {
      onChanged?.();
    } else {
      setStops(prev);
      setError(res.error ?? 'Failed to remove stop');
    }
  };

  const handleDeleteTour = async () => {
    if (!tour) return;
    if (!window.confirm(`Delete tour "${tour.tour_name}"? This removes its ${stops.length} stop(s). This cannot be undone.`)) {
      return;
    }
    const res = await deleteTour(tour.id);
    if (res.ok) {
      onChanged?.();
      onDeleted?.();
    } else {
      setError(res.error ?? 'Failed to delete tour');
    }
  };

  if (loading) return <div style={{ padding: 24, color: SLATE }}>Loading tour…</div>;
  if (!tour) return <div style={{ padding: 24, color: TERRACOTTA }}>{error ?? 'Tour not found.'}</div>;

  return (
    <div style={{ padding: 20 }}>
      {error && (
        <div style={{ padding: 10, border: `1px solid ${TERRACOTTA}`, borderRadius: 6, color: TERRACOTTA, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{
            width: '100%',
            fontSize: 20,
            fontWeight: 700,
            color: MIDNIGHT,
            border: 'none',
            borderBottom: '1px solid transparent',
            outline: 'none',
            padding: '2px 0',
          }}
          onFocus={(e) => (e.currentTarget.style.borderBottomColor = SLATE)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: STEEL }}>
            Date:{' '}
            <input
              type="date"
              value={tour.tour_date ?? ''}
              onChange={(e) => patchTour({ tour_date: e.target.value || null })}
              style={{ border: `1px solid ${SLATE}`, borderRadius: 4, padding: '3px 6px', fontSize: 13 }}
            />
          </label>
          <label style={{ fontSize: 13, color: STEEL, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={tour.is_archived}
              onChange={(e) => patchTour({ is_archived: e.target.checked })}
            />
            Archived
          </label>
          {savingName && <span style={{ fontSize: 12, color: SLATE }}>saving…</span>}
          <button
            type="button"
            onClick={handleDeleteTour}
            style={{ marginLeft: 'auto', border: `1px solid ${TERRACOTTA}`, color: TERRACOTTA, background: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
          >
            Delete tour
          </button>
        </div>
      </div>

      {/* Stops */}
      <div style={{ fontSize: 13, fontWeight: 600, color: MIDNIGHT, marginBottom: 8 }}>
        Stops ({stops.length}) — drag to reorder
      </div>

      {stops.length === 0 ? (
        <div style={{ color: SLATE, fontSize: 14, padding: '12px 0' }}>
          No stops yet. Use “Add to tour” on a site submit to stage stops here.
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="tour-stops">
            {(dropProvided) => (
              <div ref={dropProvided.innerRef} {...dropProvided.droppableProps}>
                {stops.map((stop, index) => (
                  <Draggable key={stop.id} draggableId={stop.id} index={index}>
                    {(dragProvided, dragSnapshot) => (
                      <div
                        ref={dragProvided.innerRef}
                        {...dragProvided.draggableProps}
                        style={{
                          border: `1px solid ${SLATE}`,
                          borderRadius: 8,
                          padding: 12,
                          marginBottom: 8,
                          background: dragSnapshot.isDragging ? '#F0F4FA' : '#FFFFFF',
                          boxShadow: dragSnapshot.isDragging ? '0 4px 16px rgba(0,33,71,0.15)' : 'none',
                          ...dragProvided.draggableProps.style,
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          {/* Drag handle + order number */}
                          <div
                            {...dragProvided.dragHandleProps}
                            title="Drag to reorder"
                            style={{
                              cursor: 'grab',
                              color: '#FFFFFF',
                              background: MIDNIGHT,
                              borderRadius: 6,
                              width: 26,
                              height: 26,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 13,
                              fontWeight: 700,
                              flexShrink: 0,
                            }}
                          >
                            {index + 1}
                          </div>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, color: MIDNIGHT, fontSize: 14 }}>
                              {stop.site_submit?.id ? (
                                <Link to={`/site-submit/${stop.site_submit.id}`} style={{ color: MIDNIGHT, textDecoration: 'none' }}>
                                  {stop.site_submit?.site_submit_name || '(unnamed site submit)'}
                                </Link>
                              ) : (
                                stop.site_submit?.site_submit_name || '(unnamed site submit)'
                              )}
                            </div>

                            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                              <select
                                value={stop.category_id ?? ''}
                                onChange={(e) => handleCategoryChange(stop.id, e.target.value)}
                                style={{ border: `1px solid ${SLATE}`, borderRadius: 4, padding: '3px 6px', fontSize: 12, color: STEEL }}
                              >
                                <option value="">— category —</option>
                                {categories.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>

                              <input
                                defaultValue={stop.notes ?? ''}
                                placeholder="Notes…"
                                onBlur={(e) => handleNotesBlur(stop.id, e.target.value)}
                                style={{ flex: 1, minWidth: 120, border: `1px solid ${SLATE}`, borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
                              />
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleRemove(stop.id)}
                            title="Remove from tour"
                            style={{ border: 'none', background: 'transparent', color: TERRACOTTA, fontSize: 12, cursor: 'pointer', flexShrink: 0 }}
                          >
                            remove
                          </button>
                        </div>
                      </div>
                    )}
                  </Draggable>
                ))}
                {dropProvided.placeholder}
              </div>
            )}
          </Droppable>
        </DragDropContext>
      )}
    </div>
  );
}

export default TourDetailPanel;
