/// <reference types="google.maps" />
import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Loader } from '@googlemaps/js-api-loader';
import {
  fetchTour,
  fetchTourDays,
  fetchTourStopsForMap,
  notifyTourStopsChanged,
  onTourStopsChanged,
  persistStopPlacements,
  resetDayDepartures,
  setSiteApproach,
  setStopApproachOverride,
  setStopDeparture,
} from '../hooks/useTours';
import type { Tour, TourDay, TourStopGeo } from '../lib/tourTypes';
import SiteSubmitSidebar from '../components/shared/SiteSubmitSidebar';
import {
  MAX_APPROACH_POINTS,
  buildDayRoutePoints,
  computeDaySchedule,
  computeLiveSchedule,
  dayColor,
  departureFor,
  etClockMinutes,
  formatTime12,
  liveAnchorIndex,
  parseTimeToMinutes,
  routeKey,
  solveOpenPath,
  todayET,
  type ApproachPoint,
  type DaySchedule,
  type RoutePoint,
  type StopTiming,
} from '../lib/tourRouting';
import {
  ApproachTag,
  ArriveText,
  CategoryPill,
  DayTotalsFooter,
  DriveConnector,
  LeavingNowButton,
  NoLocationTag,
  OpenSiteLink,
  StampedDeparture,
  TourStopCard,
  useIsNarrow,
  type DayTotals,
} from '../components/tours/TourStopCard';
import {
  clearRouteChunks,
  getApproachTailSeconds,
  getChainedTrafficLegs,
  getDayRoute,
  getDriveMatrix,
  seedRouteChunk,
  type DayChunk,
} from '../lib/tourRouteService';
import {
  INBOUND_COLOR as INBOUND,
  OUTBOUND_COLOR as OUTBOUND,
  RouteFocusController,
  type DragEvent,
  type FocusEntry,
} from '../lib/tourRouteFocus';

// ---------------------------------------------------------------------------
// TourMapPage (/tours/:id/map) — self-contained tour route view.
// Each day: numbered markers (same numbers as the panel), a draggable driving route
// (one DirectionsRenderer per Directions chunk — days longer than 25 waypoints are split
// into chained requests and stitched), per-leg drive times, an optional traffic-aware pass
// (Distance Matrix, future departures only, chained leg-by-leg departures), and a schedule
// computed locally. Stops can have an approach — pass-through points routed just before
// the stop — captured by dragging the leg into that stop.
// Supabase data reloads on every edit; Google is only re-asked when a chunk's key
// (ordered stop ids + coords + endpoints + approach points) changes.
// Deliberately standalone (not the LayerManager map).
// ---------------------------------------------------------------------------

const MIDNIGHT = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

// Repeating chevrons along a route line, pointing in the direction of travel.
const arrowIcons = (color: string, opacity: number): google.maps.IconSequence[] => [
  {
    icon: { path: google.maps.SymbolPath.FORWARD_OPEN_ARROW, scale: 2, strokeColor: color, strokeOpacity: opacity, strokeWeight: 2 },
    offset: '40px',
    repeat: '80px',
  },
];

interface NumberedStop extends TourStopGeo {
  number: number; // 1-based position within the day, counting stops without coordinates
}

interface DayRender {
  day: TourDay;
  color: string;
  stops: NumberedStop[]; // every stop in the day, in order
  ordered: NumberedStop[]; // the ones with coordinates (routed)
  points: RoutePoint[]; // routed sequence incl. approach points
  chunks: DayChunk[];
  schedule: DaySchedule | null; // over `ordered`
  routeOk: boolean; // drive legs known (or nothing to route)
  traffic: 'live' | 'unavailable' | null; // null = no future departure set
  issues: string[];
  startCoord: google.maps.LatLngLiteral | null;
  endCoord: google.maps.LatLngLiteral | null;
  isLive: boolean; // day_date is today (Eastern)
  anchorStopId: string | null; // latest stamped stop in route order
  currentStopId: string | null; // live: the stop we're at now (first mapped stop after the anchor)
  liveSchedule: DaySchedule | null; // re-projected from the anchor's departure
  liveTraffic: 'live' | 'unavailable' | null;
}

// A dragged leg waiting for Save / Use for this tour / Discard.
interface PendingApproach {
  stop: NumberedStop;
  points: ApproachPoint[];
  chunkPoints: RoutePoint[]; // the dragged chunk's points before the drag
  result: google.maps.DirectionsResult; // what Google rendered for the drag
}

type StopSchedule = Record<string, StopTiming>;

type DirResult = google.maps.DirectionsResult;

// ---- per-user map preferences (localStorage; every access guarded) ----
type MapTypeChoice = 'roadmap' | 'hybrid' | 'terrain';
interface MapPrefs {
  mapType: MapTypeChoice;
  places: boolean;
}
const PREFS_KEY = 'ovis.tourMap.prefs.v1';
const DEFAULT_PREFS: MapPrefs = { mapType: 'roadmap', places: true };
function loadPrefs(): MapPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
    return {
      mapType: ['roadmap', 'hybrid', 'terrain'].includes(raw?.mapType) ? raw.mapType : DEFAULT_PREFS.mapType,
      places: typeof raw?.places === 'boolean' ? raw.places : DEFAULT_PREFS.places,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
function savePrefs(p: MapPrefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p));
  } catch {
    /* private mode / blocked storage: preference just isn't remembered */
  }
}

// Places (Google POI icons) on/off = which cloud-styled Map ID the map uses. A Map ID can't
// change on a live map, so toggling recreates it (same approach as GoogleMapContainer; see
// docs/MAP_ID_POI_TOGGLE.md). Verified 2026-10-28: with VITE_GOOGLE_MAP_ID, POI icons show
// at site zoom in roadmap, hybrid and terrain.
const MAP_ID_PLACES = import.meta.env.VITE_GOOGLE_MAP_ID as string | undefined;
const MAP_ID_NO_PLACES = import.meta.env.VITE_GOOGLE_MAP_ID_NO_POI as string | undefined;

function tourMapOptions(prefs: MapPrefs, view?: { center: google.maps.LatLng | google.maps.LatLngLiteral; zoom: number }): google.maps.MapOptions {
  const opts: google.maps.MapOptions = {
    center: view?.center ?? { lat: 33.749, lng: -84.388 }, // Atlanta default
    zoom: view?.zoom ?? 10,
    mapTypeId: prefs.mapType,
    mapTypeControl: false, // our own Map / Satellite / Terrain control, top-left
    streetViewControl: true, // pegman — drop into Street View at any stop
    streetViewControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
    fullscreenControl: false,
    clickableIcons: true, // POI icons open Google's place card
    gestureHandling: 'greedy',
  };
  const mapId = prefs.places ? MAP_ID_PLACES : MAP_ID_NO_PLACES ?? MAP_ID_PLACES;
  if (mapId) opts.mapId = mapId;
  return opts;
}

function TourMapPageInner() {
  const { tourId } = useParams<{ tourId: string }>();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const overlaysRef = useRef<{ markers: any[]; renderers: google.maps.DirectionsRenderer[] }>({ markers: [], renderers: [] });
  const dayByEntryRef = useRef(new Map<FocusEntry<DirResult>, DayRender>());
  const onDragRef = useRef<(e: DragEvent<DirResult>) => void>(() => {});
  // Renderer styling + stop focus + drag detection (see tourRouteFocus for why).
  const [focusCtl] = useState(
    () =>
      new RouteFocusController<DirResult>({
      makeLine: ({ path, color, arrowsColor }) =>
        new google.maps.Polyline({
          map: mapRef.current,
          path: path as google.maps.LatLng[],
          clickable: false, // drags must reach the renderer underneath
          strokeColor: color,
          strokeOpacity: 0.95,
          strokeWeight: 8,
          zIndex: 12,
          icons: arrowIcons(arrowsColor, 1),
        }),
      rendererStyle: (color, opacity) => ({ strokeColor: color, strokeOpacity: opacity, strokeWeight: 5, zIndex: 10, icons: arrowIcons(color, opacity) }),
      onDrag: (e) => onDragRef.current(e),
    })
  );
  const focusRef = useRef<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const markerClickAtRef = useRef(0); // a pin click must not also count as a map click
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const matrixServiceRef = useRef<google.maps.DistanceMatrixService | null>(null);
  const drawSeqRef = useRef(0);
  const fittedRef = useRef(false);

  const [tour, setTour] = useState<Tour | null>(null);
  const [dayRenders, setDayRenders] = useState<DayRender[]>([]);
  const [unscheduledCount, setUnscheduledCount] = useState(0);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [SlideoutComp, setSlideoutComp] = useState<any>(null);
  const [stopSchedule, setStopSchedule] = useState<StopSchedule>({});
  const [pending, setPending] = useState<PendingApproach | null>(null);
  const [savingApproach, setSavingApproach] = useState(false);
  const [focusStopId, setFocusStopId] = useState<string | null>(null);
  const [siteSidebarId, setSiteSidebarId] = useState<string | null>(null);
  const siteSidebarRef = useRef<string | null>(null);
  const openSiteRef = useRef<(siteSubmitId: string, stopId: string) => void>(() => {});
  const stopPosRef = useRef(new Map<string, { lat: number; lng: number }>());
  const [prefs, setPrefs] = useState<MapPrefs>(loadPrefs);
  const prefsRef = useRef(prefs);
  const [mapVersion, setMapVersion] = useState(0); // bumps when the map is recreated
  const narrow = useIsNarrow(); // iPhone width: stack map over schedule
  const toggleFocus = (stopId: string) => setFocusStopId((cur) => (cur === stopId ? null : stopId));
  const redraw = () => setRefreshKey((k) => k + 1);
  // Stop added/removed from outside the map (e.g. a sidebar's Add to tour menu).
  useEffect(() => (tourId ? onTourStopsChanged(tourId, () => setRefreshKey((k) => k + 1)) : undefined), [tourId]);

  // Load the reorder slideout lazily (keeps map bundle lean).
  useEffect(() => {
    import('../components/tours/TourDetailSlideout').then((m) => setSlideoutComp(() => m.default));
  }, []);

  // ---- init map once ----
  useEffect(() => {
    let cancelled = false;
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
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
        mapRef.current = new google.maps.Map(mapDivRef.current, tourMapOptions(prefsRef.current));
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
    overlaysRef.current.renderers.forEach((renderer) => {
      google.maps.event.clearInstanceListeners(renderer);
      renderer.setMap(null);
    });
    overlaysRef.current = { markers: [], renderers: [] };
    focusCtl.reset();
    dayByEntryRef.current.clear();
  };

  useEffect(() => {
    focusRef.current = focusStopId;
    if (mapRef.current) focusCtl.setFocus(focusStopId);
    // Not while the site sidebar covers the schedule: closing it must return to the
    // schedule exactly where it was.
    if (focusStopId && !siteSidebarRef.current)
      cardRefs.current[focusStopId]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusStopId, focusCtl]);

  // ---- site submit sidebar (overlay over the schedule) ----
  // Opening focuses the stop and pans to it; with the sidebar open, a pin or card click
  // switches it to that site. Marker listeners are bound inside draw(), so they read
  // the open state and the opener through refs.
  const openSite = (siteSubmitId: string, stopId: string) => {
    siteSidebarRef.current = siteSubmitId;
    setSiteSidebarId(siteSubmitId);
    setFocusStopId(stopId);
    const pos = stopPosRef.current.get(stopId);
    const map = mapRef.current;
    if (pos && map) {
      map.panTo(pos);
      // Center the stop in the part of the map the 500px sidebar leaves visible.
      const rect = map.getDiv().getBoundingClientRect();
      const sidebarW = Math.min(500, window.innerWidth * 0.9);
      const overlap = Math.max(0, sidebarW - (window.innerWidth - rect.right));
      if (overlap > 0 && overlap < rect.width) map.panBy(overlap / 2, 0);
    }
  };
  openSiteRef.current = openSite;
  const closeSite = () => {
    siteSidebarRef.current = null;
    setSiteSidebarId(null);
    if (tourId) notifyTourStopsChanged(tourId); // safety net for edits that don't report back
  };

  // Esc clears focus; so does a click on the map itself.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setFocusStopId(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const l = mapRef.current.addListener('click', () => {
      if (Date.now() - markerClickAtRef.current > 300) setFocusStopId(null);
    });
    return () => l.remove();
  }, [mapReady, mapVersion]);

  // Map type: applied live, remembered per user.
  const setMapType = (mapType: MapTypeChoice) => {
    const next = { ...prefsRef.current, mapType };
    prefsRef.current = next;
    setPrefs(next);
    savePrefs(next);
    mapRef.current?.setMapTypeId(mapType);
  };

  // Places: recreate the map with the other Map ID, keeping the view; redraw from cache
  // (0 Google routing calls).
  const setPlaces = (places: boolean) => {
    const next = { ...prefsRef.current, places };
    prefsRef.current = next;
    setPrefs(next);
    savePrefs(next);
    const old = mapRef.current;
    if (!old || !mapDivRef.current) return;
    const view = { center: old.getCenter() ?? { lat: 33.749, lng: -84.388 }, zoom: old.getZoom() ?? 10 };
    clearOverlays();
    google.maps.event.clearInstanceListeners(old);
    mapRef.current = new google.maps.Map(mapDivRef.current, tourMapOptions(next, view));
    setMapVersion((v) => v + 1);
    redraw();
  };

  const makeMarker = (map: google.maps.Map, pos: google.maps.LatLngLiteral, label: string, color: string, title: string) => {
    const { AdvancedMarkerElement } = google.maps.marker;
    const pin = document.createElement('div');
    pin.style.cssText = `background:${color};color:#fff;width:26px;height:26px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,.4);border:2px solid #fff;`;
    const span = document.createElement('span');
    span.textContent = label;
    span.style.cssText = 'transform:rotate(45deg);font-size:11px;font-weight:700;line-height:1;';
    pin.appendChild(span);
    return new AdvancedMarkerElement({ map, position: pos, content: pin, title, zIndex: 20 });
  };

  // Small hollow circle for an approach point.
  const makeApproachMarker = (map: google.maps.Map, pos: google.maps.LatLngLiteral, color: string, title: string) => {
    const { AdvancedMarkerElement } = google.maps.marker;
    const dot = document.createElement('div');
    dot.style.cssText = `width:10px;height:10px;border-radius:50%;border:2px solid ${color};background:transparent;box-shadow:0 0 0 1px #fff;transform:translateY(50%);`;
    return new AdvancedMarkerElement({ map, position: pos, content: dot, title, zIndex: 15 });
  };

  // ---- a dragged leg (delivered by focusCtl, outside Google's event): propose an approach ----
  onDragRef.current = (ev) => {
    try {
      const dr = dayByEntryRef.current.get(ev.entry);
      if (!dr) return;
      const stop = ev.target.role === 'stop' ? dr.stops.find((s) => s.id === ev.target.stopId) : undefined;
      if (!stop) {
        setNotice('Approaches apply to stops — drag a leg that ends at a stop (not the day’s end address).');
        redraw();
        return;
      }
      if (ev.vias.length > MAX_APPROACH_POINTS) {
        setNotice(`An approach can have at most ${MAX_APPROACH_POINTS} points (this drag made ${ev.vias.length}). Try a simpler path.`);
        redraw();
        return;
      }
      setNotice(null);
      setPending({ stop, points: ev.vias, chunkPoints: ev.entry.points, result: ev.result });
      // Show in vs out for the stop whose approach was just dragged. (The renderer reports
      // a drag only on drop, so focus switches when you let go.)
      setFocusStopId(stop.id);
    } catch (e: any) {
      setError(`Couldn’t read the dragged route: ${e?.message ?? e}`);
      redraw();
    }
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

      stopPosRef.current = new Map(
        stops.filter((s) => s.lat != null && s.lng != null).map((s) => [s.id, { lat: s.lat!, lng: s.lng! }])
      );
      const byDay = (dayId: string | null) =>
        stops.filter((s) => s.tour_day_id === dayId).sort((a, b) => a.position - b.position);

      const renders: DayRender[] = [];
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

        // An approach on the day's very first stop (no start address) has nothing to route
        // from, so it's left out of the sequence.
        const points = buildDayRoutePoints(
          startCoord,
          ordered.map((s, i) => ({ id: s.id, lat: s.lat!, lng: s.lng!, approach: i === 0 && !startCoord ? [] : s.approach })),
          endCoord
        );
        const stopovers = points.filter((p) => !p.via);

        let legSeconds: number[] = []; // between consecutive STOPS only
        let leadSeconds = 0; // start address → first stop
        let tailSeconds = 0; // last stop → end address
        let routeOk = stopovers.length < 2; // nothing to route counts as OK
        let traffic: DayRender['traffic'] = null;
        let chunks: DayChunk[] = [];
        let typicalLegs: number[] = [];

        if (stopovers.length >= 2) {
          const res = await getDayRoute(dirServiceRef.current, points);
          chunks = res.chunks;
          if (res.ok) {
            routeOk = true;
            typicalLegs = res.legSeconds;
            let allLegs = res.legSeconds;
            const dayStart = departureFor(day.day_date, day.start_time);
            if (dayStart) {
              const minutesById = new Map(ordered.map((s) => [s.id, s.effective_duration_minutes]));
              const serviceMinutes = points.map((p) => (p.role === 'stop' ? minutesById.get(p.id) ?? 0 : 0));
              const live = await getChainedTrafficLegs(matrixServiceRef.current, points, serviceMinutes, dayStart, res.legSeconds);
              if (live) {
                allLegs = live;
                traffic = 'live';
              } else traffic = 'unavailable';
            }
            const sOff = startCoord ? 1 : 0;
            if (startCoord) leadSeconds = allLegs[0] ?? 0;
            if (endCoord) tailSeconds = allLegs[allLegs.length - 1] ?? 0;
            for (let k = 0; k < Math.max(0, ordered.length - 1); k++) legSeconds.push(allLegs[sOff + k] ?? 0);
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

        // ---- live day: re-project the rest of the day from the latest departure stamp ----
        const isLive = day.day_date === todayET();
        const anchorIdx = isLive ? liveAnchorIndex(ordered.map((s) => s.actual_departure_at)) : -1;
        let liveSchedule: DaySchedule | null = null;
        let liveLegs: number[] = [];
        let liveTraffic: DayRender['liveTraffic'] = null;
        if (anchorIdx >= 0 && routeOk) {
          const anchor = ordered[anchorIdx];
          const departAt = new Date(anchor.actual_departure_at!);
          const sOff = startCoord ? 1 : 0;
          const typicalFrom = typicalLegs.slice(sOff + anchorIdx);
          const pi = points.findIndex((p) => p.role === 'stop' && p.id === anchor.id);
          liveLegs = typicalFrom;
          if (pi >= 0 && pi < points.length - 1) {
            const sub = points.slice(pi);
            const minutesById = new Map(ordered.map((s) => [s.id, s.effective_duration_minutes]));
            // The anchor's own stop time is already spent: the chain starts AT its departure.
            const svc = sub.map((p, i) => (i === 0 ? 0 : p.role === 'stop' ? minutesById.get(p.id) ?? 0 : 0));
            const live = await getChainedTrafficLegs(matrixServiceRef.current, sub, svc, departAt, typicalFrom);
            liveTraffic = live ? 'live' : 'unavailable';
            if (live) liveLegs = live;
          }
          liveSchedule = computeLiveSchedule({
            anchorDepartMin: etClockMinutes(departAt),
            legSecondsFromAnchor: liveLegs,
            suffixDurations: ordered.slice(anchorIdx + 1).map((s) => s.effective_duration_minutes),
            hasEnd: !!endCoord,
          });
        }

        ordered.forEach((s, idx) => {
          const isLast = idx === ordered.length - 1;
          if (liveSchedule) {
            const k = idx - anchorIdx - 1; // index into the re-projected suffix
            stopSched[s.id] = {
              arrivalMin: k >= 0 ? liveSchedule.stops[k].arrivalMin : null,
              minsToNext: idx < anchorIdx ? null : liveLegs[idx - anchorIdx] != null && (!isLast || endCoord) ? Math.round(liveLegs[idx - anchorIdx] / 60) : null,
              nextIsEnd: isLast && !!endCoord,
              minsFromStart: null,
              done: idx <= anchorIdx,
            };
            return;
          }
          stopSched[s.id] = {
            arrivalMin: schedule?.hasStart ? schedule.stops[idx].arrivalMin : null,
            minsToNext: !routeOk
              ? null
              : isLast
              ? endCoord
                ? Math.round(tailSeconds / 60)
                : null
              : Math.round((legSeconds[idx] ?? 0) / 60),
            nextIsEnd: isLast && !!endCoord,
            minsFromStart: idx === 0 && startCoord && routeOk ? Math.round(leadSeconds / 60) : null,
          };
        });

        renders.push({
          day,
          color,
          stops: dayStops,
          ordered,
          points,
          chunks,
          schedule,
          routeOk,
          traffic,
          issues,
          startCoord,
          endCoord,
          isLive,
          anchorStopId: anchorIdx >= 0 ? ordered[anchorIdx].id : null,
          currentStopId: isLive ? ordered[anchorIdx + 1]?.id ?? null : null,
          liveSchedule,
          liveTraffic,
        });
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
        if (dr.routeOk) {
          for (const chunk of dr.chunks) {
            if (!chunk.result) continue;
            const renderer = new google.maps.DirectionsRenderer({ map, draggable: true, suppressMarkers: true, preserveViewport: true });
            const entry = focusCtl.add(renderer, chunk.points, dr.color, chunk.result);
            dayByEntryRef.current.set(entry, dr);
            renderer.addListener('directions_changed', () => focusCtl.handleDirectionsChanged(entry));
            overlaysRef.current.renderers.push(renderer);
          }
        }
        dr.ordered.forEach((s) => {
          const pos = { lat: s.lat!, lng: s.lng! };
          const marker = makeMarker(map, pos, String(s.number), dr.color, `Day ${dr.day.day_number} · ${s.number}. ${s.display_name}`);
          marker.addListener('click', () => {
            markerClickAtRef.current = Date.now();
            if (siteSidebarRef.current) openSiteRef.current(s.site_submit_id, s.id);
            else toggleFocus(s.id);
          });
          overlaysRef.current.markers.push(marker);
          extend(pos);
        });
        dr.points
          .filter((p) => p.via)
          .forEach((p) => {
            const stop = dr.stops.find((s) => s.id === p.stopId);
            overlaysRef.current.markers.push(
              makeApproachMarker(map, { lat: p.lat, lng: p.lng }, dr.color, `Approach into #${stop?.number ?? '?'} ${stop?.display_name ?? ''}`)
            );
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
      // Unscheduled stops → gray markers, no route.
      byDay(null)
        .filter((s) => s.lat != null && s.lng != null)
        .forEach((s) => {
          const pos = { lat: s.lat!, lng: s.lng! };
          const marker = makeMarker(map, pos, '•', SLATE, `Unscheduled · ${s.display_name}`);
          marker.addListener('click', () => {
            markerClickAtRef.current = Date.now();
            if (siteSidebarRef.current) openSiteRef.current(s.site_submit_id, s.id);
          });
          overlaysRef.current.markers.push(marker);
          extend(pos);
        });

      focusCtl.setFocus(focusRef.current);

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
  }, [tourId, focusCtl]);

  // Debounced redraw on data changes. Cheap: Supabase reads always, Google only on
  // a chunk-key change (see tourRouteService cache).
  useEffect(() => {
    if (!mapReady) return;
    const h = setTimeout(() => draw(), refreshKey === 0 ? 0 : 500);
    return () => clearTimeout(h);
  }, [mapReady, refreshKey, draw]);

  const retryDay = (dr: DayRender) => {
    clearRouteChunks(dr.chunks.map((c) => c.key));
    redraw();
  };

  // ---- approach save / discard / clear ----

  const saveApproach = async (scope: 'site' | 'tour') => {
    if (!pending) return;
    setSavingApproach(true);
    setError(null);
    const { stop, points } = pending;
    let r: { ok: boolean; error?: string };
    if (scope === 'site') {
      r = await setSiteApproach(stop.site_submit_id, points);
      // A tour override would keep hiding the new site approach on this tour — drop it.
      if (r.ok && stop.approach_override != null) r = await setStopApproachOverride(stop.id, null);
    } else {
      r = await setStopApproachOverride(stop.id, points);
    }
    setSavingApproach(false);
    if (!r.ok) {
      setError(`Couldn’t save the approach: ${r.error}`);
      return;
    }
    // Reuse the route Google already rendered for the drag: same chunk with this stop's
    // approach replaced → no extra Directions call (unless the day re-chunks differently).
    const others = pending.chunkPoints.filter((p) => !(p.via && p.stopId === stop.id));
    const at = others.findIndex((p) => p.role === 'stop' && p.id === stop.id);
    const vias: RoutePoint[] = points.map((a, i) => ({ id: `${stop.id}#a${i}`, lat: a.lat, lng: a.lng, via: true, role: 'via', stopId: stop.id }));
    seedRouteChunk(routeKey([...others.slice(0, at), ...vias, ...others.slice(at)]), pending.result);
    setPending(null);
    redraw();
  };

  // ---- live day: departure stamps ----
  const [stampingId, setStampingId] = useState<string | null>(null);
  const stampStop = async (s: NumberedStop, iso: string | null) => {
    setStampingId(s.id);
    const r = await setStopDeparture(s.id, iso);
    setStampingId(null);
    if (!r.ok) setError(`Couldn’t save the departure time: ${r.error}`);
    redraw();
  };
  const resetDay = async (dr: DayRender) => {
    if (!window.confirm(`Clear every departure time on Day ${dr.day.day_number} and go back to the plan?`)) return;
    const r = await resetDayDepartures(dr.day.id);
    if (!r.ok) setError(`Couldn’t reset the day: ${r.error}`);
    redraw();
  };

  const discardApproach = () => {
    setPending(null);
    redraw(); // re-renders from cache: 0 Google calls
  };

  const clearTourApproach = async (s: NumberedStop) => {
    const r = await setStopApproachOverride(s.id, null);
    if (!r.ok) setError(`Couldn’t clear the approach: ${r.error}`);
    redraw();
  };
  const skipSiteApproachOnTour = async (s: NumberedStop) => {
    const r = await setStopApproachOverride(s.id, []);
    if (!r.ok) setError(`Couldn’t update the approach: ${r.error}`);
    redraw();
  };
  const clearSiteApproach = async (s: NumberedStop) => {
    if (!window.confirm(`Delete the saved approach for “${s.display_name}”? This affects every tour that visits this site.`)) return;
    const r = await setSiteApproach(s.site_submit_id, null);
    if (!r.ok) setError(`Couldn’t clear the approach: ${r.error}`);
    redraw();
  };

  // ---- optimize ----

  const [optimizingDayId, setOptimizingDayId] = useState<string | null>(null);

  // Optimizable stops: with a start address all mapped stops are free; without one,
  // stop 1 stays first and only the rest are free.
  const freeCount = (dr: DayRender) => (dr.startCoord ? dr.ordered.length : dr.ordered.length - 1);
  const canOptimizeDay = (dr: DayRender) => freeCount(dr) >= 2;

  // Reorder a day's mapped stops for the shortest drive and save in one atomic write.
  // Open path from the start address (or stop 1), optionally ending at the end address.
  // Each stop's approach is a fixed tail: the matrix targets the approach's FIRST point and
  // the fixed approach time (first point → … → stop) is added to that stop. Approach points
  // are never reordered or dropped. Stops without coordinates keep their relative order at
  // the end of the day.
  const optimizeDay = async (dr: DayRender) => {
    if (!dirServiceRef.current || !matrixServiceRef.current || !canOptimizeDay(dr)) return;
    const pt = (s: NumberedStop) => ({ lat: s.lat!, lng: s.lng! });
    const fixedFirst = dr.startCoord ? [] : dr.ordered.slice(0, 1);
    const free = dr.startCoord ? dr.ordered : dr.ordered.slice(1);
    const origin = dr.startCoord ?? pt(dr.ordered[0]);

    setOptimizingDayId(dr.day.id);
    setError(null);
    try {
      const tails = await Promise.all(free.map((s) => getApproachTailSeconds(dirServiceRef.current!, s.approach, pt(s))));
      const entries = free.map((s) => (s.approach.length ? s.approach[0] : pt(s)));
      const n = free.length;
      const M = await getDriveMatrix(matrixServiceRef.current, [origin, ...free.map(pt)], [...entries, ...(dr.endCoord ? [dr.endCoord] : [])]);
      const fromOrigin = free.map((_, j) => M[0][j] + tails[j]);
      const m = free.map((_, i) => free.map((_, j) => M[i + 1][j] + tails[j]));
      const toEnd = dr.endCoord ? free.map((_, i) => M[i + 1][n]) : undefined;
      const freeOrder = solveOpenPath(fromOrigin, m, toEnd);

      const unmapped = dr.stops.filter((s) => s.lat == null || s.lng == null);
      const newOrder = [...fixedFirst, ...freeOrder.map((i) => free[i]), ...unmapped];
      const r = await persistStopPlacements(
        dr.day.tour_id,
        newOrder.map((s, idx) => ({ id: s.id, tour_day_id: dr.day.id, position: idx }))
      );
      if (!r.ok) setError(`Optimize couldn’t save the new order: ${r.error}`);
      redraw();
    } catch (e: any) {
      setError(`Optimize failed for Day ${dr.day.day_number}: ${e?.code ?? e?.message ?? e}`);
    } finally {
      setOptimizingDayId(null);
    }
  };

  const overEnd = (day: TourDay, sched: DaySchedule | null) => {
    const end = parseTimeToMinutes(day.end_time);
    return !!(sched?.hasStart && end != null && sched.finishMin > end);
  };

  const dayTotalsFor = (dr: DayRender): DayTotals => ({
    driveMin: dr.schedule ? dr.schedule.totalDriveMin : null,
    stopMin: dr.schedule ? dr.schedule.totalStopMin : dr.stops.reduce((sum, s) => sum + s.effective_duration_minutes, 0),
    finishMin: dr.liveSchedule ? dr.liveSchedule.finishMin : dr.schedule?.hasStart ? dr.schedule.finishMin : null,
    plannedFinishMin: dr.liveSchedule && dr.schedule?.hasStart ? dr.schedule.finishMin : null,
    overEnd: dr.liveSchedule ? overEnd(dr.day, dr.liveSchedule) : overEnd(dr.day, dr.schedule),
    note: !dr.schedule
      ? null
      : dr.liveSchedule
      ? dr.liveTraffic === 'live'
        ? 'Live — remaining legs traffic-aware from the last departure'
        : 'Live — remaining legs at typical drive times'
      : dr.traffic === 'live'
      ? `Traffic-aware — each leg timed from its own departure (day starts ${formatTime12(dr.day.start_time)} ${dr.day.day_date})`
      : dr.traffic === 'unavailable'
      ? 'Traffic data unavailable — typical drive times'
      : 'Typical drive times (set a future day date + start for traffic)',
  });
  const daySummaries: Record<string, DayTotals> = Object.fromEntries(dayRenders.map((dr) => [dr.day.id, dayTotalsFor(dr)]));

  const btn = (bg: string, fg: string, border: string) => ({
    border: `1px solid ${border}`,
    color: fg,
    background: bg,
    borderRadius: 6,
    padding: '5px 10px',
    fontSize: 12,
    cursor: savingApproach ? 'wait' : 'pointer',
    opacity: savingApproach ? 0.6 : 1,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: narrow ? 'auto' : 'calc(100vh - 64px)', minHeight: narrow ? 'calc(100vh - 64px)' : undefined }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: narrow ? 8 : 16, flexWrap: 'wrap', padding: narrow ? '8px 12px' : '10px 16px', borderBottom: `1px solid ${SLATE}`, background: '#FFFFFF' }}>
        <Link to="/tours" style={{ color: STEEL, fontSize: 13, textDecoration: 'none' }}>← Tours</Link>
        <div style={{ fontSize: 16, fontWeight: 700, color: MIDNIGHT }}>{tour?.tour_name ?? 'Tour'} — Route</div>
        {tour && (
          <Link to={`/tours/${tour.id}`} style={{ color: STEEL, fontSize: 13, textDecoration: 'none' }}>edit details</Link>
        )}
        {!narrow && <span style={{ fontSize: 12, color: SLATE }}>Drag a route into a stop to set its approach.</span>}
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

      <div style={{ display: 'flex', flexDirection: narrow ? 'column' : 'row', flex: 1, minHeight: 0 }}>
        {/* Map */}
        <div style={{ flex: narrow ? 'none' : 1, height: narrow ? '42vh' : undefined, minWidth: 0, position: 'relative' }}>
          <div ref={mapDivRef} style={{ position: 'absolute', inset: 0 }} />
          <MapTypeControl
            mapType={prefs.mapType}
            onMapType={setMapType}
            places={prefs.places}
            onPlaces={setPlaces}
            placesToggleAvailable={!!MAP_ID_NO_PLACES && !!MAP_ID_PLACES}
            compact={narrow}
          />

          {focusStopId && (
            <div
              style={{
                position: 'absolute',
                left: 12,
                bottom: 24,
                background: '#FFFFFF',
                border: `1px solid ${SLATE}`,
                borderRadius: 8,
                boxShadow: '0 2px 8px rgba(0,33,71,0.15)',
                padding: '6px 10px',
                fontSize: 12,
                color: MIDNIGHT,
                zIndex: 4,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 18, height: 4, borderRadius: 2, background: INBOUND }} /> arriving
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 18, height: 4, borderRadius: 2, background: OUTBOUND }} /> leaving
              </span>
              <span style={{ fontSize: 10, color: SLATE }}>Esc or click the map to clear</span>
            </div>
          )}

          {(pending || notice) && (
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                maxWidth: 'calc(100% - 32px)',
                background: '#FFFFFF',
                border: `1px solid ${pending ? MIDNIGHT : TERRACOTTA}`,
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,33,71,0.18)',
                padding: '10px 12px',
                zIndex: 5,
              }}
            >
              {pending ? (
                <>
                  <div style={{ fontSize: 13, color: MIDNIGHT, marginBottom: 8 }}>
                    New approach into <b>#{pending.stop.number} {pending.stop.display_name}</b>{' '}
                    <span style={{ color: STEEL }}>
                      ({pending.points.length === 0 ? 'no pass-through points — saves as “no approach”' : `${pending.points.length} pass-through point${pending.points.length === 1 ? '' : 's'}`})
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button type="button" disabled={savingApproach} onClick={() => saveApproach('site')} style={btn(MIDNIGHT, '#fff', MIDNIGHT)}>
                      Save approach for this site
                    </button>
                    <button type="button" disabled={savingApproach} onClick={() => saveApproach('tour')} style={btn('#fff', MIDNIGHT, MIDNIGHT)}>
                      Use for this tour only
                    </button>
                    <button type="button" disabled={savingApproach} onClick={discardApproach} style={btn('#fff', TERRACOTTA, TERRACOTTA)}>
                      Discard
                    </button>
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: TERRACOTTA }}>
                  {notice}
                  <button type="button" onClick={() => setNotice(null)} style={{ border: 'none', background: 'transparent', color: SLATE, cursor: 'pointer' }}>✕</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Schedule readout */}
        <div
          style={{
            width: narrow ? '100%' : 380,
            borderLeft: narrow ? 'none' : `1px solid ${SLATE}`,
            borderTop: narrow ? `1px solid ${SLATE}` : 'none',
            overflowY: narrow ? 'visible' : 'auto',
            padding: narrow ? 12 : 16,
            boxSizing: 'border-box',
            background: '#F8FAFC',
          }}
        >
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
                {dr.isLive && (
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#FFFFFF', background: '#2E7D32', borderRadius: 999, padding: '1px 8px' }}>LIVE</span>
                )}
                {dr.isLive && dr.stops.some((s) => s.actual_departure_at) && (
                  <button
                    type="button"
                    onClick={() => resetDay(dr)}
                    style={{ border: 'none', background: 'transparent', color: STEEL, fontSize: 12, textDecoration: 'underline', cursor: 'pointer', padding: '6px 2px' }}
                  >
                    Reset to plan
                  </button>
                )}
                {canOptimizeDay(dr) && (
                  <button
                    type="button"
                    onClick={() => optimizeDay(dr)}
                    disabled={optimizingDayId === dr.day.id}
                    title={
                      (dr.startCoord ? 'From the start address' : 'Keeping stop 1 first') +
                      (dr.endCoord ? ', ending at the end address' : ', one-way (last stop free)') +
                      ' — custom approaches are kept as fixed tails into their stops'
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
                  {!dr.routeOk && dr.chunks.length > 0 && (
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

              {dr.chunks.length > 1 && (
                <div style={{ fontSize: 11, color: SLATE, paddingLeft: 20, marginBottom: 4 }}>
                  Long day — routed as {dr.chunks.length} chained requests (Google allows 25 waypoints per request).
                </div>
              )}

              {dr.stops.length === 0 ? (
                <div style={{ fontSize: 12, color: SLATE, paddingLeft: 20 }}>No stops.</div>
              ) : (
                <div>
                  {dr.stops.map((s) => {
                    const mapped = s.lat != null && s.lng != null;
                    const timing = mapped ? stopSchedule[s.id] : undefined;
                    const anchorNumber = dr.anchorStopId ? dr.stops.find((x) => x.id === dr.anchorStopId)?.number ?? 0 : 0;
                    const done = dr.isLive && s.number <= anchorNumber;
                    return (
                      <div key={`wrap-${s.id}`}>
                      {timing?.minsFromStart != null && (
                        <DriveConnector minutes={timing.minsFromStart} label="from start" color={dr.color} />
                      )}
                      <div
                        key={s.id}
                        ref={(el) => {
                          cardRefs.current[s.id] = el;
                        }}
                        onClick={() => {
                          if (siteSidebarId) openSite(s.site_submit_id, s.id);
                          else if (mapped) toggleFocus(s.id);
                        }}
                        style={{ cursor: mapped || siteSidebarId ? 'pointer' : 'default' }}
                      >
                        <TourStopCard
                          done={done}
                          highlight={focusStopId === s.id}
                          number={s.number}
                          color={mapped ? dr.color : TERRACOTTA}
                          title={<OpenSiteLink text={s.display_name} onOpen={() => openSite(s.site_submit_id, s.id)} />}
                          meta={
                            <>
                              {!done && <ArriveText arrivalMin={timing?.arrivalMin} />}
                              <span>{s.effective_duration_minutes} min</span>
                              <CategoryPill name={s.category_name} />
                              {!narrow && s.id === dr.currentStopId && (
                                <LeavingNowButton busy={stampingId === s.id} onStamp={(iso) => stampStop(s, iso)} />
                              )}
                              {dr.isLive && s.actual_departure_at && dr.day.day_date && (
                                <StampedDeparture
                                  stampedAt={s.actual_departure_at}
                                  dayDate={dr.day.day_date}
                                  busy={stampingId === s.id}
                                  onStamp={(iso) => stampStop(s, iso)}
                                />
                              )}
                              {!mapped && <NoLocationTag />}
                              <ApproachTag
                                source={s.approach_source}
                                onClearTour={() => clearTourApproach(s)}
                                onSkipOnTour={() => skipSiteApproachOnTour(s)}
                                onClearSite={() => clearSiteApproach(s)}
                              />
                            </>
                          }
                          subtext={s.display_subtext}
                          footer={
                            // Phone: full-width (36px) button, current stop only.
                            narrow && s.id === dr.currentStopId ? (
                              <LeavingNowButton block busy={stampingId === s.id} onStamp={(iso) => stampStop(s, iso)} />
                            ) : undefined
                          }
                        />
                        <DriveConnector minutes={timing?.minsToNext} label={timing?.nextIsEnd ? 'to end' : undefined} color={dr.color} />
                      </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {dr.stops.length > 0 && <DayTotalsFooter totals={dayTotalsFor(dr)} />}
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
          onChanged={redraw}
          stopSchedule={stopSchedule}
          daySummaries={daySummaries}
          onOpenSite={openSite}
        />
      )}

      {/* Same site submit sidebar as the main map (green + deal tab when it has a deal). */}
      <SiteSubmitSidebar
        siteSubmitId={siteSidebarId}
        isOpen={siteSidebarId !== null}
        onClose={closeSite}
        context="map"
        isEditable={true}
        onDataUpdate={() => tourId && notifyTourStopsChanged(tourId)}
        onStatusChange={() => tourId && notifyTourStopsChanged(tourId)}
        onCenterOnPin={(lat, lng) => mapRef.current?.panTo({ lat, lng })}
      />
    </div>
  );
}

// Map / Satellite / Terrain + Places, styled like GoogleMapContainer's custom control
// (white group, #1a73e8 active, Roboto 16px / 40px buttons, separate checkbox box).
function MapTypeControl(props: {
  mapType: MapTypeChoice;
  onMapType: (t: MapTypeChoice) => void;
  places: boolean;
  onPlaces: (on: boolean) => void;
  placesToggleAvailable: boolean;
  compact?: boolean;
}) {
  const box = { backgroundColor: '#fff', borderRadius: 3, boxShadow: '0 2px 6px rgba(0,0,0,.3)' } as const;
  const btn = (active: boolean) =>
    ({
      backgroundColor: active ? '#1a73e8' : '#fff',
      color: active ? '#fff' : 'rgb(25,25,25)',
      border: 'none',
      cursor: 'pointer',
      fontFamily: 'Roboto,Arial,sans-serif',
      fontSize: props.compact ? 14 : 16,
      lineHeight: props.compact ? '34px' : '38px',
      padding: props.compact ? '0 9px' : '0 12px',
      height: props.compact ? 36 : 40,
    }) as const;
  const types: [MapTypeChoice, string][] = [
    ['roadmap', 'Map'],
    ['hybrid', 'Satellite'],
    ['terrain', 'Terrain'],
  ];
  return (
    <div style={{ position: 'absolute', top: 10, left: 10, zIndex: 3, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
      <div style={{ ...box, display: 'flex', overflow: 'hidden' }}>
        {types.map(([t, label]) => (
          <button key={t} type="button" onClick={() => props.onMapType(t)} style={btn(props.mapType === t)} aria-pressed={props.mapType === t}>
            {label}
          </button>
        ))}
      </div>
      <label
        title={props.placesToggleAvailable ? 'Show Google Places icons (restaurants, retail…)' : 'Places toggle needs VITE_GOOGLE_MAP_ID_NO_POI'}
        style={{ ...box, padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontFamily: 'Roboto,Arial,sans-serif', cursor: props.placesToggleAvailable ? 'pointer' : 'not-allowed', opacity: props.placesToggleAvailable ? 1 : 0.6 }}
      >
        <input
          type="checkbox"
          checked={props.places}
          disabled={!props.placesToggleAvailable}
          onChange={(e) => props.onPlaces(e.target.checked)}
          style={{ cursor: 'inherit' }}
        />
        <span style={{ userSelect: 'none' }}>Places</span>
      </label>
    </div>
  );
}

// A failure inside the map (Google callbacks, effects) shows a message + Reload instead of
// unmounting the whole app to a white page.
class TourMapErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null; attempt: number }> {
  state = { error: null as Error | null, attempt: 0 };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Tour map crashed', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, maxWidth: 560, margin: '40px auto', border: `1px solid ${TERRACOTTA}`, borderRadius: 8, background: '#FFFFFF' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: MIDNIGHT, marginBottom: 8 }}>The tour map hit an error</div>
          <div style={{ fontSize: 13, color: STEEL, marginBottom: 6 }}>Nothing was saved by the step that failed. Reload the map to continue.</div>
          <div style={{ fontSize: 12, color: TERRACOTTA, fontFamily: 'monospace', marginBottom: 16, wordBreak: 'break-word' }}>{this.state.error.message}</div>
          <button
            type="button"
            onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
            style={{ border: `1px solid ${MIDNIGHT}`, background: MIDNIGHT, color: '#fff', borderRadius: 6, padding: '6px 14px', fontSize: 13, cursor: 'pointer' }}
          >
            Reload map
          </button>
        </div>
      );
    }
    return <div key={this.state.attempt} style={{ display: 'contents' }}>{this.props.children}</div>;
  }
}

export function TourMapPage() {
  return (
    <TourMapErrorBoundary>
      <TourMapPageInner />
    </TourMapErrorBoundary>
  );
}

export default TourMapPage;
