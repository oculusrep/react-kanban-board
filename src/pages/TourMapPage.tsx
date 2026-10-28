/// <reference types="google.maps" />
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader } from '@googlemaps/js-api-loader';
import { fetchTour, fetchTourDays, fetchTourStopsForMap, persistStopPlacements } from '../hooks/useTours';
import type { Tour, TourDay, TourStopGeo } from '../lib/tourTypes';
import {
  computeDaySchedule,
  dayColor,
  departureFor,
  formatClock12,
  formatMinutesDuration,
  formatTime12,
  parseTimeToMinutes,
  routeKey,
  solveOpenPath,
  type DaySchedule,
} from '../lib/tourRouting';
import { MAX_ROUTE_STOPS, clearDayRoute, getDayRoute, getDriveMatrix, getTrafficLegs } from '../lib/tourRouteService';

// ---------------------------------------------------------------------------
// TourMapPage (/tours/:id/map) — self-contained tour route view.
// Each day: numbered markers (same numbers as the panel), a driving polyline and
// per-leg drive times from ONE cached Directions request, an optional traffic-aware
// pass (Distance Matrix, future departures only), and a schedule computed locally.
// Supabase data reloads on every edit; Google is only re-asked when a day's route
// key (ordered stop ids + coords + start/end) changes. Problems are shown per day
// instead of degrading silently. Deliberately standalone (not the LayerManager map).
// ---------------------------------------------------------------------------

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

interface NumberedStop extends TourStopGeo {
  number: number; // 1-based position within the day, counting stops without coordinates
}

interface DayRender {
  day: TourDay;
  color: string;
  stops: NumberedStop[]; // every stop in the day, in order
  ordered: NumberedStop[]; // the ones with coordinates (routed)
  schedule: DaySchedule | null; // over `ordered`
  routeOk: boolean; // drive legs known (or nothing to route)
  routeKey: string | null;
  traffic: 'live' | 'unavailable' | null; // null = no future departure set
  issues: string[];
  startCoord: google.maps.LatLngLiteral | null;
  endCoord: google.maps.LatLngLiteral | null;
}

type StopSchedule = Record<string, { arrivalMin: number | null; minsToNext: number | null }>;

export function TourMapPage() {
  const { tourId } = useParams<{ tourId: string }>();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<{ markers: any[]; lines: google.maps.Polyline[] }>({ markers: [], lines: [] });
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const matrixServiceRef = useRef<google.maps.DistanceMatrixService | null>(null);
  const drawSeqRef = useRef(0);
  const fittedRef = useRef(false);

  const [tour, setTour] = useState<Tour | null>(null);
  const [dayRenders, setDayRenders] = useState<DayRender[]>([]);
  const [unscheduledCount, setUnscheduledCount] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [SlideoutComp, setSlideoutComp] = useState<any>(null);
  const [stopSchedule, setStopSchedule] = useState<StopSchedule>({});

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
        matrixServiceRef.current = new google.maps.DistanceMatrixService();
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

  // ---- load + compute (Google only on cache miss) + draw ----
  const draw = useCallback(async () => {
    if (!tourId || !mapRef.current || !dirServiceRef.current || !matrixServiceRef.current) return;
    const seq = ++drawSeqRef.current;
    setBusy(true);
    setError(null);
    try {
      const [t, days, stops] = await Promise.all([
        fetchTour(tourId),
        fetchTourDays(tourId),
        fetchTourStopsForMap(tourId),
      ]);

      const byDay = (dayId: string | null) =>
        stops.filter((s) => s.tour_day_id === dayId).sort((a, b) => a.position - b.position);

      const renders: DayRender[] = [];
      const routes: { color: string; path: google.maps.LatLng[] }[] = [];
      const stopSched: StopSchedule = {};

      for (let di = 0; di < days.length; di++) {
        const day = days[di];
        const color = dayColor(di);
        const issues: string[] = [];
        const dayStops: NumberedStop[] = byDay(day.id).map((s, i) => ({ ...s, number: i + 1 }));
        const ordered = dayStops.filter((s) => s.lat != null && s.lng != null);

        const unmapped = dayStops.filter((s) => s.lat == null || s.lng == null);
        if (unmapped.length > 0) {
          issues.push(
            `Stop${unmapped.length === 1 ? '' : 's'} ${unmapped.map((s) => `#${s.number}`).join(', ')} ha${unmapped.length === 1 ? 's' : 've'} no map location — not on the map or in the route.`
          );
        }

        const startCoord =
          day.start_latitude != null && day.start_longitude != null ? { lat: day.start_latitude, lng: day.start_longitude } : null;
        const endCoord =
          day.end_latitude != null && day.end_longitude != null ? { lat: day.end_latitude, lng: day.end_longitude } : null;
        if (day.start_location_address && !startCoord) {
          issues.push(`Start address “${day.start_location_address}” couldn’t be located — the route starts at stop 1 instead. Fix it in “Reorder stops”.`);
        }
        if (day.end_location_address && !endCoord) {
          issues.push(`End address “${day.end_location_address}” couldn’t be located — the route ends at the last stop instead. Fix it in “Reorder stops”.`);
        }

        const routePts = [
          ...(startCoord ? [{ id: 'start', ...startCoord }] : []),
          ...ordered.map((s) => ({ id: s.id, lat: s.lat!, lng: s.lng! })),
          ...(endCoord ? [{ id: 'end', ...endCoord }] : []),
        ];

        let legSeconds: number[] = []; // between consecutive STOPS only
        let leadSeconds = 0; // start address → first stop
        let tailSeconds = 0; // last stop → end address
        let routeOk = routePts.length < 2; // nothing to route counts as OK
        let key: string | null = null;
        let traffic: DayRender['traffic'] = null;

        if (dayStops.length > MAX_ROUTE_STOPS) {
          issues.push(
            `${dayStops.length} stops — Google routes at most ${MAX_ROUTE_STOPS} per day. Move some stops to another day to get the route and drive times.`
          );
          routeOk = false;
        } else if (routePts.length >= 2) {
          key = routeKey(routePts);
          const latLngs = routePts.map(({ lat, lng }) => ({ lat, lng }));
          const res = await getDayRoute(dirServiceRef.current, key, latLngs);
          if (res.ok) {
            routeOk = true;
            let allLegs = res.legSeconds;
            const departure = departureFor(day.day_date, day.start_time);
            if (departure) {
              const live = await getTrafficLegs(matrixServiceRef.current, key, latLngs, departure);
              if (live) {
                allLegs = live;
                traffic = 'live';
              } else traffic = 'unavailable';
            }
            const sOff = startCoord ? 1 : 0;
            if (startCoord) leadSeconds = allLegs[0] ?? 0;
            if (endCoord) tailSeconds = allLegs[allLegs.length - 1] ?? 0;
            for (let k = 0; k < Math.max(0, ordered.length - 1); k++) legSeconds.push(allLegs[sOff + k] ?? 0);
            routes.push({ color, path: res.path });
          } else {
            issues.push(`Google couldn’t build the driving route (${res.status}). Drive times and arrivals are unavailable for this day.`);
          }
        }

        const schedule =
          routeOk && ordered.length > 0
            ? computeDaySchedule(
                parseTimeToMinutes(day.start_time),
                legSeconds,
                ordered.map((s) => s.effective_duration_minutes),
                { leadSeconds, tailSeconds }
              )
            : null;

        ordered.forEach((s, idx) => {
          const isLast = idx === ordered.length - 1;
          stopSched[s.id] = {
            arrivalMin: schedule?.hasStart ? schedule.stops[idx].arrivalMin : null,
            minsToNext: !routeOk
              ? null
              : isLast
              ? endCoord
                ? Math.round(tailSeconds / 60)
                : null
              : Math.round((legSeconds[idx] ?? 0) / 60),
          };
        });

        renders.push({ day, color, stops: dayStops, ordered, schedule, routeOk, routeKey: key, traffic, issues, startCoord, endCoord });
      }

      if (seq !== drawSeqRef.current) return; // a newer draw superseded this one

      // ---- paint ----
      const map = mapRef.current;
      clearOverlays();
      const bounds = new google.maps.LatLngBounds();
      let anyPoint = false;
      const extend = (p: google.maps.LatLngLiteral) => {
        bounds.extend(p);
        anyPoint = true;
      };
      for (const dr of renders) {
        dr.ordered.forEach((s) => {
          const pos = { lat: s.lat!, lng: s.lng! };
          overlaysRef.current.markers.push(
            makeMarker(map, pos, String(s.number), dr.color, `Day ${dr.day.day_number} · ${s.number}. ${s.display_name}`)
          );
          extend(pos);
        });
        if (dr.startCoord) {
          overlaysRef.current.markers.push(makeMarker(map, dr.startCoord, 'A', '#2E7D32', `Day ${dr.day.day_number} start · ${dr.day.start_location_address ?? ''}`));
          extend(dr.startCoord);
        }
        if (dr.endCoord) {
          overlaysRef.current.markers.push(makeMarker(map, dr.endCoord, 'B', '#B00020', `Day ${dr.day.day_number} end · ${dr.day.end_location_address ?? ''}`));
          extend(dr.endCoord);
        }
      }
      routes.forEach((r) =>
        overlaysRef.current.lines.push(
          new google.maps.Polyline({ path: r.path, map, strokeColor: r.color, strokeOpacity: 0.85, strokeWeight: 4, zIndex: 10 })
        )
      );
      // Unscheduled stops → gray markers, no route.
      byDay(null)
        .filter((s) => s.lat != null && s.lng != null)
        .forEach((s) => {
          const pos = { lat: s.lat!, lng: s.lng! };
          overlaysRef.current.markers.push(makeMarker(map, pos, '•', SLATE, `Unscheduled · ${s.display_name}`));
          extend(pos);
        });

      setTour(t);
      setUnscheduledCount(byDay(null).length);
      setDayRenders(renders);
      setStopSchedule(stopSched);
      // Fit once on first load; later edits keep the user's pan/zoom.
      if (anyPoint && !fittedRef.current) {
        fittedRef.current = true;
        map.fitBounds(bounds, 80);
        if (stops.length === 1) map.setZoom(14);
      }
    } catch (e: any) {
      if (seq === drawSeqRef.current) setError(e.message ?? 'Failed to load tour route');
    } finally {
      if (seq === drawSeqRef.current) setBusy(false);
    }
  }, [tourId]);

  // Debounced redraw on data changes. Cheap: Supabase reads always, Google only on
  // a route-key change (see tourRouteService cache).
  useEffect(() => {
    if (!mapReady) return;
    const h = setTimeout(() => draw(), refreshKey === 0 ? 0 : 500);
    return () => clearTimeout(h);
  }, [mapReady, refreshKey, draw]);

  const retryDay = (dr: DayRender) => {
    if (dr.routeKey) clearDayRoute(dr.routeKey);
    setRefreshKey((k) => k + 1);
  };

  const [optimizingDayId, setOptimizingDayId] = useState<string | null>(null);

  // Optimizable stops: with a start address all mapped stops are free; without one,
  // stop 1 stays first and only the rest are free.
  const freeCount = (dr: DayRender) => (dr.startCoord ? dr.ordered.length : dr.ordered.length - 1);
  const canOptimizeDay = (dr: DayRender) => freeCount(dr) >= 2 && dr.stops.length <= MAX_ROUTE_STOPS;

  // Reorder a day's mapped stops for the shortest drive and save in one atomic write.
  //  - End address set: Directions waypoint optimization between fixed origin and end.
  //  - No end address: one-way (open path) — Distance Matrix drive times + exact/heuristic
  //    solve in the browser; the last stop is free. Never a round trip.
  // Stops without coordinates keep their relative order at the end of the day.
  const optimizeDay = async (dr: DayRender) => {
    if (!dirServiceRef.current || !matrixServiceRef.current || !canOptimizeDay(dr)) return;
    const pt = (s: NumberedStop) => ({ lat: s.lat!, lng: s.lng! });
    const fixedFirst = dr.startCoord ? [] : dr.ordered.slice(0, 1);
    const free = dr.startCoord ? dr.ordered : dr.ordered.slice(1);
    const origin = dr.startCoord ?? pt(dr.ordered[0]);

    setOptimizingDayId(dr.day.id);
    setError(null);
    try {
      let freeOrder: number[];
      if (dr.endCoord) {
        const res = await dirServiceRef.current.route({
          origin,
          destination: dr.endCoord,
          waypoints: free.map((s) => ({ location: pt(s), stopover: true })),
          optimizeWaypoints: true,
          travelMode: google.maps.TravelMode.DRIVING,
        });
        freeOrder = res.routes[0].waypoint_order || free.map((_, i) => i);
      } else {
        const freePts = free.map(pt);
        const matrix = await getDriveMatrix(matrixServiceRef.current, [origin, ...freePts], freePts);
        freeOrder = solveOpenPath(matrix[0], matrix.slice(1));
      }
      const unmapped = dr.stops.filter((s) => s.lat == null || s.lng == null);
      const newOrder = [...fixedFirst, ...freeOrder.map((i) => free[i]), ...unmapped];
      const r = await persistStopPlacements(
        dr.day.tour_id,
        newOrder.map((s, idx) => ({ id: s.id, tour_day_id: dr.day.id, position: idx }))
      );
      if (!r.ok) setError(`Optimize couldn’t save the new order: ${r.error}`);
      setRefreshKey((k) => k + 1);
    } catch (e: any) {
      setError(`Optimize failed for Day ${dr.day.day_number}: ${e?.code ?? e?.message ?? e}`);
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
        <div style={{ width: 380, borderLeft: `1px solid ${SLATE}`, overflowY: 'auto', padding: 16, background: '#F8FAFC' }}>
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
                  {formatTime12(dr.day.start_time) || '—'}
                  {dr.day.end_time ? ` – ${formatTime12(dr.day.end_time)}` : ''}
                </span>
                {canOptimizeDay(dr) && (
                  <button
                    type="button"
                    onClick={() => optimizeDay(dr)}
                    disabled={optimizingDayId === dr.day.id}
                    title={
                      dr.endCoord
                        ? "Reorder this day's stops for the shortest drive to the end address"
                        : dr.startCoord
                        ? "Reorder this day's stops for the shortest one-way drive from the start address"
                        : "Keep stop 1 first and reorder the rest for the shortest one-way drive"
                    }
                    style={{ marginLeft: 'auto', border: `1px solid ${dr.color}`, color: '#fff', background: dr.color, borderRadius: 6, padding: '3px 8px', fontSize: 11, cursor: optimizingDayId === dr.day.id ? 'wait' : 'pointer', opacity: optimizingDayId === dr.day.id ? 0.6 : 1 }}
                  >
                    {optimizingDayId === dr.day.id ? 'Optimizing…' : 'Optimize'}
                  </button>
                )}
              </div>

              {dr.issues.length > 0 && (
                <div style={{ border: `1px solid ${TERRACOTTA}`, borderRadius: 6, padding: '6px 8px', margin: '0 0 6px 20px', background: '#FFFFFF' }}>
                  {dr.issues.map((msg, i) => (
                    <div key={i} style={{ fontSize: 12, color: TERRACOTTA, padding: '1px 0' }}>⚠ {msg}</div>
                  ))}
                  {!dr.routeOk && dr.routeKey && (
                    <button
                      type="button"
                      onClick={() => retryDay(dr)}
                      style={{ marginTop: 4, border: `1px solid ${TERRACOTTA}`, color: TERRACOTTA, background: 'white', borderRadius: 4, padding: '2px 8px', fontSize: 11, cursor: 'pointer' }}
                    >
                      Retry route
                    </button>
                  )}
                </div>
              )}

              {(dr.startCoord || dr.endCoord) && (
                <div style={{ fontSize: 11, color: STEEL, paddingLeft: 20, marginBottom: 4 }}>
                  {dr.startCoord && <div>▶ Start: {dr.day.start_location_address ?? 'set'}</div>}
                  {dr.endCoord && <div>■ End: {dr.day.end_location_address ?? 'set'}</div>}
                </div>
              )}

              {dr.stops.length === 0 ? (
                <div style={{ fontSize: 12, color: SLATE, paddingLeft: 20 }}>No stops.</div>
              ) : (
                <div style={{ paddingLeft: 4 }}>
                  {dr.stops.map((s) => {
                    const mapped = s.lat != null && s.lng != null;
                    const arr = stopSchedule[s.id]?.arrivalMin;
                    return (
                      <div key={s.id} style={{ display: 'flex', gap: 6, fontSize: 13, color: MIDNIGHT, padding: '3px 0' }}>
                        <span style={{ width: 16, textAlign: 'right', fontWeight: 700, color: mapped ? dr.color : TERRACOTTA, flexShrink: 0 }}>{s.number}.</span>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 500 }}>{s.display_name}</span>
                          <span style={{ color: STEEL, fontSize: 12 }}>
                            {mapped && arr != null ? ` · arr ${formatClock12(arr)}` : ''}
                            {` · ${s.effective_duration_minutes}m`}
                            {s.category_name ? ` · ${s.category_name}` : ''}
                          </span>
                          {!mapped && <span style={{ color: TERRACOTTA, fontSize: 11 }}> · no location</span>}
                          {s.display_subtext && (
                            <div style={{ color: '#9CA3AF', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.display_subtext}</div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {dr.schedule && (
                <div style={{ fontSize: 12, color: STEEL, paddingLeft: 20, marginTop: 4 }}>
                  Drive {formatMinutesDuration(dr.schedule.totalDriveMin)} · Stops {formatMinutesDuration(dr.schedule.totalStopMin)}
                  {dr.schedule.hasStart && (
                    <>
                      {' '}· Finish{' '}
                      <span style={{ color: overEnd(dr.day, dr.schedule) ? TERRACOTTA : STEEL, fontWeight: overEnd(dr.day, dr.schedule) ? 700 : 400 }}>
                        {formatClock12(dr.schedule.finishMin)}
                      </span>
                      {overEnd(dr.day, dr.schedule) ? ' (past end time)' : ''}
                    </>
                  )}
                  <div style={{ fontSize: 11, color: SLATE }}>
                    {dr.traffic === 'live'
                      ? `Traffic-aware, departing ${formatTime12(dr.day.start_time)} ${dr.day.day_date}`
                      : dr.traffic === 'unavailable'
                      ? 'Traffic data unavailable — typical drive times'
                      : 'Typical drive times (set a future day date + start for traffic)'}
                  </div>
                </div>
              )}
            </div>
          ))}

          {unscheduledCount > 0 && (
            <div style={{ fontSize: 12, color: STEEL, borderTop: `1px solid ${SLATE}`, paddingTop: 8 }}>
              {unscheduledCount} unscheduled stop(s) — shown as gray pins, not routed.
            </div>
          )}

          {dayRenders.some((d) => !d.day.start_time) && (
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
