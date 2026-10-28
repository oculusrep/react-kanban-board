import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Link } from 'react-router-dom';
import {
  fetchTour,
  fetchTourStops,
  fetchTourStopCategories,
  fetchTourDays,
  createTourDay,
  updateTourDay,
  deleteTourDay,
  persistStopPlacements,
  removeTourStop,
  updateTour,
  updateTourStop,
  deleteTour,
} from '../../hooks/useTours';
import type { Tour, TourDay, TourStopCategory, TourStopWithSiteSubmit } from '../../lib/tourTypes';
import { dayColor, effectiveApproach, formatClock12, formatTime12, resolveStopCoord, stopDisplayName, type StopTiming } from '../../lib/tourRouting';
import {
  ApproachTag,
  ArriveText,
  DayTotalsFooter,
  DriveConnector,
  NoLocationTag,
  TOUR_COLORS,
  TourStopCard,
  categoryPillStyle,
  type DayTotals,
} from './TourStopCard';
import { geocodingService } from '../../services/geocodingService';

// ---------------------------------------------------------------------------
// TourDetailPanel — overlay-first, drop-in tour editor with multi-day scheduling.
// Takes a tourId prop (no useParams); renders identically in a page or slideout.
// Day sections (each with start/end time) + an Unscheduled bucket; drag stops
// between days and reorder within a day. Per-stop duration defaults to the
// category default (Flyby = 0), overridable per stop. Per-day total service time
// is shown; arrival + drive-to-next appear when hosted by the tour map (stopSchedule).
// Stops are numbered 1..n within each day — the same numbers as the map pins.
// ---------------------------------------------------------------------------

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';
const UNSCHEDULED = 'unscheduled';

interface TourDetailPanelProps {
  tourId: string;
  onChanged?: () => void;
  onDeleted?: () => void;
  /** Per-stop arrival (clock minutes) + drive minutes to next stop, computed by the
   *  map host. Absent in non-map contexts (list/detail page) — fields hide then. */
  stopSchedule?: Record<string, StopTiming>;
  /** Per-day Drive/Stops/Finish from the map host; without it the footer shows Stops only. */
  daySummaries?: Record<string, DayTotals>;
}

const dayDroppableId = (dayId: string) => `day:${dayId}`;
const parseDayDroppableId = (id: string): string | null => (id === UNSCHEDULED ? null : id.slice(4));
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : '');

// 15-minute options for the day start/end pickers, labeled 12-hour ("9:30 AM").
// Stored value stays "HH:MM"; an off-grid stored value is kept as an extra option.
const TIME_OPTIONS = Array.from({ length: 96 }, (_, i) => {
  const min = i * 15;
  return { value: `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`, label: formatClock12(min) };
});

function TimeSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const v = hhmm(value);
  const offGrid = v && !TIME_OPTIONS.some((o) => o.value === v);
  return (
    <select
      value={v}
      onChange={(e) => onChange(e.target.value || null)}
      style={{ border: `1px solid ${SLATE}`, borderRadius: 4, padding: '2px 5px', fontSize: 12, color: MIDNIGHT }}
    >
      <option value="">—</option>
      {offGrid && <option value={v}>{formatTime12(v)}</option>}
      {TIME_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

export function TourDetailPanel({ tourId, onChanged, onDeleted, stopSchedule, daySummaries }: TourDetailPanelProps) {
  const [tour, setTour] = useState<Tour | null>(null);
  const [days, setDays] = useState<TourDay[]>([]);
  const [stops, setStops] = useState<TourStopWithSiteSubmit[]>([]);
  const [categories, setCategories] = useState<TourStopCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [geocoding, setGeocoding] = useState<string | null>(null); // `${dayId}:start|end`
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const cancelLabelRef = useRef(false); // Escape: blur without saving

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [t, d, s, c] = await Promise.all([
        fetchTour(tourId),
        fetchTourDays(tourId),
        fetchTourStops(tourId),
        fetchTourStopCategories(),
      ]);
      setTour(t);
      setNameDraft(t?.tour_name ?? '');
      setDays(d);
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

  const categoryById = useMemo(() => {
    const m: Record<string, TourStopCategory> = {};
    categories.forEach((c) => (m[c.id] = c));
    return m;
  }, [categories]);

  const effectiveDuration = useCallback(
    (stop: TourStopWithSiteSubmit): number => {
      if (stop.stop_duration_minutes != null) return stop.stop_duration_minutes;
      const cat = stop.category_id ? categoryById[stop.category_id] : undefined;
      return cat?.default_stop_duration_minutes ?? 5;
    },
    [categoryById]
  );

  // Stops grouped by section id (day:<id> or 'unscheduled'), each sorted by position.
  const sections = useMemo(() => {
    const ids = [...days.map((d) => dayDroppableId(d.id)), UNSCHEDULED];
    const map: Record<string, TourStopWithSiteSubmit[]> = {};
    ids.forEach((id) => (map[id] = []));
    stops.forEach((s) => {
      const id = s.tour_day_id ? dayDroppableId(s.tour_day_id) : UNSCHEDULED;
      (map[id] ??= []).push(s);
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.position - b.position));
    return map;
  }, [days, stops]);

  // ---- tour header ----
  const patchTour = async (fields: Partial<Tour>) => {
    if (!tour) return;
    const prev = tour;
    setTour({ ...tour, ...fields });
    const res = await updateTour(tour.id, fields as any);
    if (!res.ok) {
      setTour(prev);
      setError(res.error ?? 'Failed to update tour');
    } else onChanged?.();
  };

  const handleNameBlur = async () => {
    const name = nameDraft.trim();
    if (!tour || !name || name === tour.tour_name) {
      setNameDraft(tour?.tour_name ?? '');
      return;
    }
    await patchTour({ tour_name: name });
  };

  const handleDeleteTour = async () => {
    if (!tour) return;
    if (!window.confirm(`Delete tour "${tour.tour_name}"? This removes its ${stops.length} stop(s). This cannot be undone.`)) return;
    const res = await deleteTour(tour.id);
    if (res.ok) {
      onChanged?.();
      onDeleted?.();
    } else setError(res.error ?? 'Failed to delete tour');
  };

  // ---- days ----
  const handleAddDay = async () => {
    const nextNumber = days.reduce((max, d) => Math.max(max, d.day_number), 0) + 1;
    const res = await createTourDay(tourId, nextNumber);
    if (res.day) {
      setDays((prev) => [...prev, res.day!]);
      onChanged?.();
    } else setError(res.error ?? 'Failed to add day');
  };

  const patchDay = async (dayId: string, fields: Partial<TourDay>) => {
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...fields } : d)));
    const res = await updateTourDay(dayId, fields as any);
    if (!res.ok) setError(res.error ?? 'Failed to update day');
    else onChanged?.();
  };

  // Geocode a typed start/end address and store address + lat/lng on the day.
  const handleEndpointBlur = async (day: TourDay, which: 'start' | 'end', raw: string) => {
    const trimmed = raw.trim();
    const addrCol = which === 'start' ? 'start_location_address' : 'end_location_address';
    const latCol = which === 'start' ? 'start_latitude' : 'end_latitude';
    const lngCol = which === 'start' ? 'start_longitude' : 'end_longitude';
    const current = which === 'start' ? day.start_location_address : day.end_location_address;
    if (trimmed === (current ?? '')) return;

    if (!trimmed) {
      await patchDay(day.id, { [addrCol]: null, [latCol]: null, [lngCol]: null } as any);
      return;
    }
    setGeocoding(`${day.id}:${which}`);
    const result = await geocodingService.geocodeAddress(trimmed);
    setGeocoding(null);
    if ('error' in result) {
      setError(`Couldn't locate "${trimmed}" — saved the text, but it won't route until fixed.`);
      await patchDay(day.id, { [addrCol]: trimmed, [latCol]: null, [lngCol]: null } as any);
      return;
    }
    await patchDay(day.id, {
      [addrCol]: result.formatted_address,
      [latCol]: result.latitude,
      [lngCol]: result.longitude,
    } as any);
  };

  const handleDeleteDay = async (day: TourDay) => {
    const count = sections[dayDroppableId(day.id)]?.length ?? 0;
    if (count > 0 && !window.confirm(`Delete Day ${day.day_number}? Its ${count} stop(s) move back to Unscheduled.`)) return;
    const res = await deleteTourDay(day.id);
    if (res.ok) {
      // Stops FK-set-null to unscheduled; reload to resync.
      await load();
      onChanged?.();
    } else setError(res.error ?? 'Failed to delete day');
  };

  // ---- stops ----
  const handleDragEnd = async (result: DropResult) => {
    const { source, destination } = result;
    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sectionIds = [...days.map((d) => dayDroppableId(d.id)), UNSCHEDULED];
    const clone: Record<string, TourStopWithSiteSubmit[]> = {};
    sectionIds.forEach((id) => (clone[id] = Array.from(sections[id] ?? [])));

    const [moved] = clone[source.droppableId].splice(source.index, 1);
    if (!moved) return;
    clone[destination.droppableId].splice(destination.index, 0, moved);

    const rebuilt: TourStopWithSiteSubmit[] = [];
    const placements: { id: string; tour_day_id: string | null; position: number }[] = [];
    sectionIds.forEach((id) => {
      const dayId = parseDayDroppableId(id);
      clone[id].forEach((s, idx) => {
        rebuilt.push({ ...s, tour_day_id: dayId, position: idx });
        placements.push({ id: s.id, tour_day_id: dayId, position: idx });
      });
    });
    setStops(rebuilt); // optimistic
    const res = await persistStopPlacements(tourId, placements);
    if (!res.ok) {
      setError(res.error ?? 'Failed to save new order');
      load();
    } else onChanged?.();
  };

  const handleCategoryChange = async (stopId: string, categoryId: string) => {
    const value = categoryId || null;
    setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, category_id: value } : s)));
    const res = await updateTourStop(stopId, { category_id: value });
    if (!res.ok) setError(res.error ?? 'Failed to update category');
    else onChanged?.();
  };

  const handleDurationChange = async (stopId: string, raw: string) => {
    const value = raw === '' ? null : Math.max(0, parseInt(raw, 10) || 0);
    setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, stop_duration_minutes: value } : s)));
    const res = await updateTourStop(stopId, { stop_duration_minutes: value });
    if (!res.ok) setError(res.error ?? 'Failed to update duration');
    else onChanged?.();
  };

  const startLabelEdit = (stop: TourStopWithSiteSubmit) => {
    setEditingLabelId(stop.id);
    setLabelDraft(stop.display_label ?? '');
  };

  // Empty label => back to the auto name (city · street / property name).
  const commitLabel = async (stopId: string) => {
    setEditingLabelId(null);
    if (cancelLabelRef.current) {
      cancelLabelRef.current = false;
      return;
    }
    const value = labelDraft.trim() || null;
    const prev = stops.find((s) => s.id === stopId)?.display_label ?? null;
    if (value === prev) return;
    setStops((all) => all.map((s) => (s.id === stopId ? { ...s, display_label: value } : s)));
    const res = await updateTourStop(stopId, { display_label: value });
    if (!res.ok) {
      setStops((all) => all.map((s) => (s.id === stopId ? { ...s, display_label: prev } : s)));
      setError(res.error ?? 'Failed to save label');
    } else onChanged?.();
  };

  const handleNotesBlur = async (stopId: string, notes: string) => {
    const res = await updateTourStop(stopId, { notes: notes.trim() || null });
    if (!res.ok) setError(res.error ?? 'Failed to save notes');
  };

  const handleRemove = async (stopId: string) => {
    const prev = stops;
    setStops((s) => s.filter((x) => x.id !== stopId));
    const res = await removeTourStop(stopId);
    if (res.ok) onChanged?.();
    else {
      setStops(prev);
      setError(res.error ?? 'Failed to remove stop');
    }
  };

  if (loading) return <div style={{ padding: 24, color: SLATE }}>Loading tour…</div>;
  if (!tour) return <div style={{ padding: 24, color: TERRACOTTA }}>{error ?? 'Tour not found.'}</div>;

  const renderStop = (stop: TourStopWithSiteSubmit, index: number, color: string) => {
    const { name, subtext } = stopDisplayName({
      display_label: stop.display_label,
      site_submit_name: stop.site_submit?.site_submit_name,
      property: stop.site_submit?.property,
    });
    const mapped = !!resolveStopCoord(stop.site_submit);
    const sched = mapped ? stopSchedule?.[stop.id] : undefined;
    const categoryName = stop.category_id ? categoryById[stop.category_id]?.name : null;
    const ssLink = (text: string, linkColor: string) =>
      stop.site_submit?.id ? (
        <Link to={`/site-submit/${stop.site_submit.id}`} style={{ color: linkColor, textDecoration: 'none' }}>{text}</Link>
      ) : (
        text
      );

    return (
      <Draggable key={stop.id} draggableId={stop.id} index={index}>
        {(dp, snap) => (
          <div ref={dp.innerRef} {...dp.draggableProps} style={dp.draggableProps.style}>
            <TourStopCard
              number={index + 1}
              color={mapped ? color : TERRACOTTA}
              badgeProps={dp.dragHandleProps ?? undefined}
              badgeTitle="Drag to reorder / move between days"
              dragging={snap.isDragging}
              title={
                editingLabelId === stop.id ? (
                  <input
                    autoFocus
                    value={labelDraft}
                    placeholder={stopDisplayName({ site_submit_name: stop.site_submit?.site_submit_name, property: stop.site_submit?.property }).name}
                    onChange={(e) => setLabelDraft(e.target.value)}
                    onBlur={() => commitLabel(stop.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                      if (e.key === 'Escape') {
                        cancelLabelRef.current = true;
                        (e.target as HTMLInputElement).blur();
                      }
                    }}
                    style={{ width: '100%', fontWeight: 700, color: MIDNIGHT, fontSize: 15, border: `1px solid ${SLATE}`, borderRadius: 4, padding: '1px 4px' }}
                  />
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
                    <span>{subtext ? name : ssLink(name, MIDNIGHT)}</span>
                    <button
                      type="button"
                      onClick={() => startLabelEdit(stop)}
                      title="Rename this stop (blank = automatic name)"
                      style={{ border: 'none', background: 'transparent', color: SLATE, fontSize: 12, cursor: 'pointer', padding: 0, fontWeight: 400 }}
                    >
                      ✎
                    </button>
                  </span>
                )
              }
              meta={
                <>
                  <ArriveText arrivalMin={sched?.arrivalMin} />
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <input
                      type="number"
                      min={0}
                      value={effectiveDuration(stop)}
                      onChange={(e) => handleDurationChange(stop.id, e.target.value)}
                      title="Minutes at this stop"
                      style={{ width: 44, border: `1px solid ${SLATE}`, borderRadius: 4, padding: '1px 4px', fontSize: 12, color: MIDNIGHT }}
                    />
                    min
                  </label>
                  <select
                    value={stop.category_id ?? ''}
                    onChange={(e) => handleCategoryChange(stop.id, e.target.value)}
                    title="Category"
                    style={{ ...categoryPillStyle(categoryName), border: 'none', cursor: 'pointer', appearance: 'none', paddingRight: 10 }}
                  >
                    <option value="">— category —</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  {!mapped && <NoLocationTag />}
                  <ApproachTag source={effectiveApproach(stop.approach_waypoints_override, stop.site_submit?.approach_waypoints).source} />
                </>
              }
              subtext={subtext ? ssLink(subtext, '#9CA3AF') : null}
              footer={
                <input
                  defaultValue={stop.notes ?? ''}
                  placeholder="Notes…"
                  onBlur={(e) => handleNotesBlur(stop.id, e.target.value)}
                  style={{ width: '100%', marginTop: 6, border: `1px solid ${TOUR_COLORS.cardBorder}`, borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
                />
              }
              aside={
                <button
                  type="button"
                  onClick={() => handleRemove(stop.id)}
                  title="Remove from tour"
                  style={{ border: 'none', background: 'transparent', color: TERRACOTTA, fontSize: 12, cursor: 'pointer' }}
                >
                  remove
                </button>
              }
            />
            {snap.isDragging ? null : <DriveConnector minutes={sched?.minsToNext} toEnd={sched?.nextIsEnd} color={color} />}
          </div>
        )}
      </Draggable>
    );
  };

  const renderSection = (opts: { id: string; title: React.ReactNode; subtitle?: React.ReactNode; color: string; totals?: DayTotals }) => {
    const list = sections[opts.id] ?? [];
    return (
      <div style={{ border: `1px solid ${SLATE}`, borderRadius: 8, marginBottom: 12, background: '#F8FAFC' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '8px 10px', flexWrap: 'wrap' }}>
          {opts.title}
          <span style={{ fontSize: 12, color: STEEL }}>
            {list.length} stop{list.length === 1 ? '' : 's'}
          </span>
        </div>
        {opts.subtitle}
        <Droppable droppableId={opts.id}>
          {(dp, snap) => (
            <div
              ref={dp.innerRef}
              {...dp.droppableProps}
              style={{ padding: '6px 10px 10px', minHeight: 44, background: snap.isDraggingOver ? '#EAF0F8' : 'transparent', borderRadius: 8 }}
            >
              {list.length === 0 && (
                <div style={{ color: SLATE, fontSize: 12, padding: '8px 0' }}>Drag stops here…</div>
              )}
              {list.map((stop, idx) => renderStop(stop, idx, opts.color))}
              {dp.placeholder}
            </div>
          )}
        </Droppable>
        {opts.totals && list.length > 0 && (
          <div style={{ padding: '0 10px 10px' }}>
            <DayTotalsFooter totals={opts.totals} />
          </div>
        )}
      </div>
    );
  };

  const dayTotal = (dayId: string) =>
    (sections[dayDroppableId(dayId)] ?? []).reduce((sum, s) => sum + effectiveDuration(s), 0);

  return (
    <div style={{ padding: 20 }}>
      {error && (
        <div style={{ padding: 10, border: `1px solid ${TERRACOTTA}`, borderRadius: 6, color: TERRACOTTA, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Tour header */}
      <div style={{ marginBottom: 18 }}>
        <input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={handleNameBlur}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          style={{ width: '100%', fontSize: 20, fontWeight: 700, color: MIDNIGHT, border: 'none', borderBottom: '1px solid transparent', outline: 'none', padding: '2px 0' }}
          onFocus={(e) => (e.currentTarget.style.borderBottomColor = SLATE)}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 13, color: STEEL, display: 'flex', alignItems: 'center', gap: 6 }}>
            <input type="checkbox" checked={tour.is_archived} onChange={(e) => patchTour({ is_archived: e.target.checked })} />
            Archived
          </label>
          <button type="button" onClick={handleDeleteTour} style={{ marginLeft: 'auto', border: `1px solid ${TERRACOTTA}`, color: TERRACOTTA, background: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            Delete tour
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: MIDNIGHT }}>Schedule — drag stops between days</div>
        <button type="button" onClick={handleAddDay} style={{ border: `1px solid ${MIDNIGHT}`, color: MIDNIGHT, background: 'white', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
          + Add day
        </button>
      </div>

      <DragDropContext onDragEnd={handleDragEnd}>
        {days.map((day, di) =>
          renderSection({
            id: dayDroppableId(day.id),
            color: dayColor(di),
            totals: daySummaries?.[day.id] ?? { driveMin: null, stopMin: dayTotal(day.id), finishMin: null, overEnd: false },
            title: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, color: MIDNIGHT, fontSize: 14 }}>Day {day.day_number}</span>
                  <input type="date" value={day.day_date ?? ''} onChange={(e) => patchDay(day.id, { day_date: e.target.value || null })} style={{ border: `1px solid ${SLATE}`, borderRadius: 4, padding: '2px 5px', fontSize: 12 }} />
                  <label style={{ fontSize: 12, color: STEEL, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Start
                    <TimeSelect value={day.start_time} onChange={(v) => patchDay(day.id, { start_time: v })} />
                  </label>
                  <label style={{ fontSize: 12, color: STEEL, display: 'flex', alignItems: 'center', gap: 4 }}>
                    End
                    <TimeSelect value={day.end_time} onChange={(v) => patchDay(day.id, { end_time: v })} />
                  </label>
                  <button type="button" onClick={() => handleDeleteDay(day)} title="Delete day" style={{ border: 'none', background: 'transparent', color: TERRACOTTA, fontSize: 11, cursor: 'pointer' }}>
                    delete day
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input
                    key={`start-${day.id}-${day.start_location_address ?? ''}`}
                    defaultValue={day.start_location_address ?? ''}
                    placeholder="Start at (airport, hotel…) — optional"
                    onBlur={(e) => handleEndpointBlur(day, 'start', e.target.value)}
                    title={day.start_latitude == null && day.start_location_address ? 'Not geocoded — won’t route' : undefined}
                    style={{ flex: 1, minWidth: 150, border: `1px solid ${day.start_location_address && day.start_latitude == null ? TERRACOTTA : SLATE}`, borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
                  />
                  <input
                    key={`end-${day.id}-${day.end_location_address ?? ''}`}
                    defaultValue={day.end_location_address ?? ''}
                    placeholder="End at — optional"
                    onBlur={(e) => handleEndpointBlur(day, 'end', e.target.value)}
                    title={day.end_latitude == null && day.end_location_address ? 'Not geocoded — won’t route' : undefined}
                    style={{ flex: 1, minWidth: 150, border: `1px solid ${day.end_location_address && day.end_latitude == null ? TERRACOTTA : SLATE}`, borderRadius: 4, padding: '3px 6px', fontSize: 12 }}
                  />
                  {(geocoding === `${day.id}:start` || geocoding === `${day.id}:end`) && (
                    <span style={{ fontSize: 11, color: SLATE }}>locating…</span>
                  )}
                </div>
              </div>
            ),
          })
        )}

        {renderSection({
          id: UNSCHEDULED,
          color: SLATE,
          title: <span style={{ fontWeight: 700, color: STEEL, fontSize: 14 }}>Unscheduled</span>,
        })}
      </DragDropContext>

      <div style={{ fontSize: 11, color: SLATE, marginTop: 4 }}>
        Stop time is per-category default (Flyby 0 min), editable per stop. Arrival and drive
        times show when this panel is opened from the tour’s Map view.
      </div>
    </div>
  );
}

export default TourDetailPanel;
