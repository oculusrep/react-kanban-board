/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader } from '@googlemaps/js-api-loader';
import { fetchTour, fetchTourDays, fetchTourStopsForMap, persistStopPlacements } from '../hooks/useTours';
import type { Tour, TourDay, TourStopGeo } from '../lib/tourTypes';
import {
  computeDaySchedule,
  dayColor,
  formatMinutesDuration,
  minutesToHHMM,
  parseTimeToMinutes,
  type DaySchedule,
} from '../lib/tourRouting';

// ---------------------------------------------------------------------------
// TourMapPage (/tours/:id/map) — self-contained tour route view.
// Renders each day's ordered stops as numbered markers + a driving polyline
// (DirectionsService), computes a per-day schedule (day start + drive legs +
// stop durations vs end time), and lets you reorder in a slideout — the map and
// times redraw on change. Deliberately standalone (not the LayerManager map).
// ---------------------------------------------------------------------------

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

interface DayRender {
  day: TourDay;
  color: string;
  ordered: TourStopGeo[]; // geocoded stops in order
  missingCoords: number;
  schedule: DaySchedule | null;
  driveUnavailable: boolean;
  startCoord: google.maps.LatLngLiteral | null;
  endCoord: google.maps.LatLngLiteral | null;
}

export function TourMapPage() {
  const { tourId } = useParams<{ tourId: string }>();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<{ markers: any[]; lines: google.maps.Polyline[] }>({ markers: [], lines: [] });
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);

  const [tour, setTour] = useState<Tour | null>(null);
  const [dayRenders, setDayRenders] = useState<DayRender[]>([]);
  const [unscheduledCount, setUnscheduledCount] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [SlideoutComp, setSlideoutComp] = useState<any>(null);
  // stopId -> computed arrival (clock minutes, if day has a start) + drive minutes to next stop
  const [stopSchedule, setStopSchedule] = useState<Record<string, { arrivalMin: number | null; minsToNext: number | null }>>({});

  // Load the reorder slideout lazily (keeps map bundle lean).
  useEffect(() => {
    import('../components/tours/TourDetailSlideout').then((m) => setSlideoutComp(() => m.default));
  }, []);

  // ---- init map once ----
  useEffect(() => {
    let cancelled = false;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
    const mapId = import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined;
    // The Loader is a process-wide singleton — its options MUST match every other
    // caller (GoogleMapContainer uses these exact libraries) or it throws
    // "Loader must not be called again with different options". Pull marker/routes
    // via importLibrary (on-demand, independent of the Loader options) instead.
    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['places', 'geometry', 'drawing'] });
    loader
      .load()
      .then(async () => {
        await google.maps.importLibrary('marker');
        await google.maps.importLibrary('routes');
        if (cancelled || !mapDivRef.current) return;
        const opts: google.maps.MapOptions = {
          center: { lat: 33.749, lng: -84.388 }, // Atlanta default
          zoom: 10,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
          gestureHandling: 'greedy',
        };
        if (mapId) opts.mapId = mapId;
        mapRef.current = new google.maps.Map(mapDivRef.current, opts);
        dirServiceRef.current = new google.maps.DirectionsService();
        setMapReady(true);
      })
      .catch((e) => setError(`Failed to load Google Maps: ${e?.message ?? e}`));
    return () => {
      cancelled = true;
    };
  }, []);

  const clearOverlays = () => {
    overlaysRef.current.markers.forEach((m) => (m.map = null));
    overlaysRef.current.lines.forEach((l) => l.setMap(null));
    overlaysRef.current = { markers: [], lines: [] };
  };

  const makeMarker = (map: google.maps.Map, pos: google.maps.LatLngLiteral, label: string, color: string, title: string) => {
    const { AdvancedMarkerElement } = google.maps.marker;
    const pin = document.createElement('div');
    pin.style.cssText = `background:${color};color:#fff;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff;`;
    const span = document.createElement('span');
    span.textContent = label;
    span.style.cssText = 'transform:rotate(45deg);font-size:11px;font-weight:700;line-height:1;';
    pin.appendChild(span);
    return new AdvancedMarkerElement({ map, position: pos, content: pin, title });
  };

  // ---- load + draw ----
  const draw = useCallback(async () => {
    if (!tourId || !mapRef.current || !dirServiceRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const [t, days, stops] = await Promise.all([
        fetchTour(tourId),
        fetchTourDays(tourId),
        fetchTourStopsForMap(tourId),
      ]);
      setTour(t);

      const map = mapRef.current;
      clearOverlays();
      const bounds = new google.maps.LatLngBounds();
      let anyPoint = false;

      const byDay = (dayId: string | null) =>
        stops.filter((s) => s.tour_day_id === dayId).sort((a, b) => a.position - b.position);

      const renders: DayRender[] = [];
      const stopSched: Record<string, { arrivalMin: number | null; minsToNext: number | null }> = {};

      for (let di = 0; di < days.length; di++) {
        const day = days[di];
        const color = dayColor(di);
        const dayStops = byDay(day.id);
        const geocoded = dayStops.filter((s) => s.lat != null && s.lng != null);
        const missing = dayStops.length - geocoded.length;

        const startCoord: google.maps.LatLngLiteral | null =
          day.start_latitude != null && day.start_longitude != null
            ? { lat: day.start_latitude, lng: day.start_longitude }
            : null;
        const endCoord: google.maps.LatLngLiteral | null =
          day.end_latitude != null && day.end_longitude != null
            ? { lat: day.end_latitude, lng: day.end_longitude }
            : null;

        // Numbered site markers
        geocoded.forEach((s, idx) => {
          const pos = { lat: s.lat!, lng: s.lng! };
          overlaysRef.current.markers.push(
            makeMarker(map, pos, String(idx + 1), color, `Day ${day.day_number} · ${idx + 1}. ${s.site_submit_name ?? 'Site submit'}`)
          );
          bounds.extend(pos);
          anyPoint = true;
        });

        // Non-site start / end markers (A = start, B = end)
        if (startCoord) {
          overlaysRef.current.markers.push(makeMarker(map, startCoord, 'A', '#2E7D32', `Day ${day.day_number} start · ${day.start_location_address ?? ''}`));
          bounds.extend(startCoord);
          anyPoint = true;
        }
        if (endCoord) {
          overlaysRef.current.markers.push(makeMarker(map, endCoord, 'B', '#B00020', `Day ${day.day_number} end · ${day.end_location_address ?? ''}`));
          bounds.extend(endCoord);
          anyPoint = true;
        }

        // Ordered route points: [start?] + stops + [end?]
        const routePts: google.maps.LatLngLiteral[] = [
          ...(startCoord ? [startCoord] : []),
          ...geocoded.map((s) => ({ lat: s.lat!, lng: s.lng! })),
          ...(endCoord ? [endCoord] : []),
        ];

        let legSeconds: number[] = []; // between consecutive STOPS only
        let leadSeconds = 0; // start address → first stop
        let tailSeconds = 0; // last stop → end address
        let driveUnavailable = false;

        if (routePts.length >= 2) {
          try {
            const res = await dirServiceRef.current.route({
              origin: routePts[0],
              destination: routePts[routePts.length - 1],
              waypoints: routePts.slice(1, -1).map((p) => ({ location: p, stopover: true })),
              travelMode: google.maps.TravelMode.DRIVING,
            });
            const route = res.routes[0];
            const allLegs = route.legs.map((l) => l.duration?.value ?? 0); // length routePts.length - 1
            const sOff = startCoord ? 1 : 0;
            if (startCoord) leadSeconds = allLegs[0] ?? 0;
            if (endCoord) tailSeconds = allLegs[allLegs.length - 1] ?? 0;
            for (let k = 0; k < Math.max(0, geocoded.length - 1); k++) legSeconds.push(allLegs[sOff + k] ?? 0);
            overlaysRef.current.lines.push(
              new google.maps.Polyline({ path: route.overview_path, map, strokeColor: color, strokeOpacity: 0.85, strokeWeight: 4, zIndex: 10 })
            );
          } catch {
            // Fall back to a straight geodesic line through the route points; drive times unknown.
            driveUnavailable = true;
            legSeconds = new Array(Math.max(0, geocoded.length - 1)).fill(0);
            overlaysRef.current.lines.push(
              new google.maps.Polyline({ path: routePts, map, strokeColor: color, strokeOpacity: 0.5, strokeWeight: 3, geodesic: true, zIndex: 10 })
            );
          }
        }

        const schedule =
          geocoded.length > 0
            ? computeDaySchedule(
                parseTimeToMinutes(day.start_time),
                legSeconds,
                geocoded.map((s) => s.effective_duration_minutes),
                { leadSeconds, tailSeconds }
              )
            : null;

        geocoded.forEach((s, idx) => {
          const isLast = idx === geocoded.length - 1;
          stopSched[s.id] = {
            arrivalMin: schedule?.hasStart ? schedule.stops[idx].arrivalMin : null,
            minsToNext: driveUnavailable
              ? null
              : isLast
              ? endCoord
                ? Math.round(tailSeconds / 60)
                : null
              : Math.round((legSeconds[idx] ?? 0) / 60),
          };
        });

        renders.push({ day, color, ordered: geocoded, missingCoords: missing, schedule, driveUnavailable, startCoord, endCoord });
      }

      // Unscheduled stops → gray markers, no route.
      const unsched = byDay(null).filter((s) => s.lat != null && s.lng != null);
      unsched.forEach((s) => {
        const pos = { lat: s.lat!, lng: s.lng! };
        overlaysRef.current.markers.push(makeMarker(map, pos, '•', SLATE, `Unscheduled · ${s.site_submit_name ?? 'Site submit'}`));
        bounds.extend(pos);
        anyPoint = true;
      });
      setUnscheduledCount(byDay(null).length);

      setDayRenders(renders);
      setStopSchedule(stopSched);
      if (anyPoint) {
        map.fitBounds(bounds, 80);
        if (stops.length === 1) map.setZoom(14);
      }
    } catch (e: any) {
      setError(e.message ?? 'Failed to load tour route');
    } finally {
      setBusy(false);
    }
  }, [tourId]);

  // Debounced redraw on data changes (reorder / duration keystrokes / times).
  useEffect(() => {
    if (!mapReady) return;
    const h = setTimeout(() => draw(), refreshKey === 0 ? 0 : 500);
    return () => clearTimeout(h);
  }, [mapReady, refreshKey, draw]);

  const [optimizingDayId, setOptimizingDayId] = useState<string | null>(null);

  // True when a day has enough optimizable waypoints to reorder.
  // With a start address, all stops are waypoints; without one, stop 1 is the
  // fixed origin so only the rest are waypoints.
  const canOptimizeDay = (dr: DayRender) => (dr.startCoord ? dr.ordered.length : dr.ordered.length - 1) >= 2;

  // Reorder a day's stops for the shortest driving route (Google Directions
  // waypoint optimization). A start/end address (airport, hotel…) anchors the
  // route as a fixed origin/destination so ALL sites in between get optimized;
  // with no start address, stop 1 stays the origin; with no end address the
  // route loops back to the origin.
  const optimizeDay = async (dr: DayRender) => {
    if (!dirServiceRef.current) return;
    const stops = dr.ordered;
    const stop0 = stops[0] ? { lat: stops[0].lat!, lng: stops[0].lng! } : null;
    if (!stop0) return;
    const hasStart = !!dr.startCoord;
    const hasEnd = !!dr.endCoord;

    const leadFixed = hasStart ? [] : stops.slice(0, 1);
    const wp = hasStart ? stops : stops.slice(1);
    if (wp.length < 2) return; // nothing meaningful to reorder

    const origin = hasStart ? dr.startCoord! : stop0;
    const destination = hasEnd ? dr.endCoord! : hasStart ? dr.startCoord! : stop0;

    setOptimizingDayId(dr.day.id);
    setError(null);
    try {
      const res = await dirServiceRef.current.route({
        origin,
        destination,
        waypoints: wp.map((s) => ({ location: { lat: s.lat!, lng: s.lng! }, stopover: true })),
        optimizeWaypoints: true,
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const order = res.routes[0].waypoint_order || [];
      const newOrder = [...leadFixed, ...order.map((i) => wp[i])];
      const placements = newOrder.map((s, idx) => ({ id: s.id, tour_day_id: dr.day.id, position: idx }));
      const r = await persistStopPlacements(placements);
      if (!r.ok) setError(r.error ?? 'Failed to save optimized order');
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(`Optimize failed: ${e?.message ?? e}`);
    } finally {
      setOptimizingDayId(null);
    }
  };

  const overEnd = (day: TourDay, sched: DaySchedule | null) => {
    const end = parseTimeToMinutes(day.end_time);
    return sched?.hasStart && end != null && sched.finishMin > end;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '10px 16px', borderBottom: `1px solid ${SLATE}`, background: '#FFFFFF' }}>
        <Link to="/tours" style={{ color: STEEL, fontSize: 13, textDecoration: 'none' }}>← Tours</Link>
        <div style={{ fontSize: 16, fontWeight: 700, color: MIDNIGHT }}>{tour?.tour_name ?? 'Tour'} — Route</div>
        {tour && (
          <Link to={`/tours/${tour.id}`} style={{ color: STEEL, fontSize: 13, textDecoration: 'none' }}>edit details</Link>
        )}
        <button
          type="button"
          onClick={() => setReorderOpen(true)}
          style={{ marginLeft: 'auto', border: `1px solid ${MIDNIGHT}`, color: '#fff', background: MIDNIGHT, borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
        >
          Reorder stops
        </button>
      </div>

      {error && (
        <div style={{ padding: 10, color: TERRACOTTA, background: '#FBF3EE', fontSize: 13 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Map */}
        <div ref={mapDivRef} style={{ flex: 1, minWidth: 0 }} />

        {/* Schedule readout */}
        <div style={{ width: 360, borderLeft: `1px solid ${SLATE}`, overflowY: 'auto', padding: 16, background: '#F8FAFC' }}>
          {busy && <div style={{ color: SLATE, fontSize: 13, marginBottom: 8 }}>Calculating route…</div>}

          {dayRenders.length === 0 && !busy && (
            <div style={{ color: SLATE, fontSize: 13 }}>
              No days yet. Use “Reorder stops” to add days and place stops.
            </div>
          )}

          {dayRenders.map((dr) => (
            <div key={dr.day.id} style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: dr.color, display: 'inline-block' }} />
                <span style={{ fontWeight: 700, color: MIDNIGHT, fontSize: 14 }}>Day {dr.day.day_number}</span>
                <span style={{ fontSize: 12, color: STEEL }}>
                  {dr.day.start_time ? minutesToHHMM(parseTimeToMinutes(dr.day.start_time)!) : '—'}
                  {dr.day.end_time ? `–${minutesToHHMM(parseTimeToMinutes(dr.day.end_time)!)}` : ''}
                </span>
                {canOptimizeDay(dr) && (
                  <button
                    type="button"
                    onClick={() => optimizeDay(dr)}
                    disabled={optimizingDayId === dr.day.id}
                    title="Reorder this day's stops for the shortest drive (respects any start/end address)"
                    style={{ marginLeft: 'auto', border: `1px solid ${dr.color}`, color: '#fff', background: dr.color, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: optimizingDayId === dr.day.id ? 'wait' : 'pointer', opacity: optimizingDayId === dr.day.id ? 0.6 : 1 }}
                  >
                    {optimizingDayId === dr.day.id ? 'Optimizing…' : 'Optimize'}
                  </button>
                )}
              </div>

              {(dr.startCoord || dr.endCoord) && (
                <div style={{ fontSize: 11, color: STEEL, paddingLeft: 20, marginBottom: 4 }}>
                  {dr.startCoord && <div>▶ Start: {dr.day.start_location_address ?? 'set'}</div>}
                  {dr.endCoord && <div>■ End: {dr.day.end_location_address ?? 'set'}</div>}
                </div>
              )}

              {dr.ordered.length === 0 ? (
                <div style={{ fontSize: 12, color: SLATE, paddingLeft: 20 }}>No mappable stops.</div>
              ) : (
                <ol style={{ margin: 0, paddingLeft: 20 }}>
                  {dr.ordered.map((s, idx) => (
                    <li key={s.id} style={{ fontSize: 13, color: MIDNIGHT, padding: '2px 0' }}>
                      <span style={{ fontWeight: 500 }}>{s.site_submit_name ?? 'Site submit'}</span>
                      <span style={{ color: STEEL, fontSize: 12 }}>
                        {dr.schedule?.hasStart ? ` · arr ${minutesToHHMM(dr.schedule.stops[idx].arrivalMin)}` : ''}
                        {` · ${s.effective_duration_minutes}m`}
                        {s.category_name ? ` · ${s.category_name}` : ''}
                      </span>
                    </li>
                  ))}
                </ol>
              )}

              {dr.schedule && (
                <div style={{ fontSize: 12, color: STEEL, paddingLeft: 20, marginTop: 4 }}>
                  Drive {dr.driveUnavailable ? 'n/a' : formatMinutesDuration(dr.schedule.totalDriveMin)} · Stops{' '}
                  {formatMinutesDuration(dr.schedule.totalStopMin)}
                  {dr.schedule.hasStart && (
                    <>
                      {' '}· Finish{' '}
                      <span style={{ color: overEnd(dr.day, dr.schedule) ? TERRACOTTA : STEEL, fontWeight: overEnd(dr.day, dr.schedule) ? 700 : 400 }}>
                        {minutesToHHMM(dr.schedule.finishMin)}
                      </span>
                      {overEnd(dr.day, dr.schedule) ? ' (past end time)' : ''}
                    </>
                  )}
                </div>
              )}
              {dr.missingCoords > 0 && (
                <div style={{ fontSize: 11, color: TERRACOTTA, paddingLeft: 20, marginTop: 2 }}>
                  {dr.missingCoords} stop(s) have no coordinates and aren’t on the map.
                </div>
              )}
            </div>
          ))}

          {unscheduledCount > 0 && (
            <div style={{ fontSize: 12, color: STEEL, borderTop: `1px solid ${SLATE}`, paddingTop: 8 }}>
              {unscheduledCount} unscheduled stop(s) — shown as gray pins, not routed.
            </div>
          )}

          {!tour?.tour_date && dayRenders.some((d) => !d.day.start_time) && (
            <div style={{ fontSize: 11, color: SLATE, marginTop: 8 }}>
              Set a day start time (in “Reorder stops”) to see arrival/finish times.
            </div>
          )}
        </div>
      </div>

      {SlideoutComp && (
        <SlideoutComp
          tourId={reorderOpen ? tourId ?? null : null}
          isOpen={reorderOpen}
          onClose={() => setReorderOpen(false)}
          onChanged={() => setRefreshKey((k) => k + 1)}
          stopSchedule={stopSchedule}
        />
      )}
    </div>
  );
}

export default TourMapPage;
