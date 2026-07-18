import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import {
  useLayerManager,
  CachedDemographicsTimeRange,
  CachedDemographicsScope,
  CachedDemographicsMode,
} from './LayerManager';
import type {
  GeoenrichmentResult,
  TapestrySegment,
  DemographicData,
  IsochronePolygon,
} from '../../../hooks/usePropertyGeoenrichment';

// Cached Demographics map layer (Phase B of the cache work). Toggle on
// → small dot pins per past enrichment in the current bbox. Click →
// fires onPinClick with the cached row reconstituted as a
// GeoenrichmentResult so the slideout can open without a fresh ESRI
// call. See docs/DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md.

const PIN_COLOR_RING = '#002147';     // OVIS midnight
const PIN_COLOR_POLYGON = '#A27B5C';  // Terracotta — distinguishes shape

interface RingLogRow {
  id: string;
  called_at: string;
  user_id: string | null;
  latitude: number;
  longitude: number;
  radii: number[] | null;
  drive_times: number[] | null;
  demographics: DemographicData | null;
  tapestry: TapestrySegment | null;
  isochrones: Record<string, IsochronePolygon> | null;
}

interface PolygonLogRow {
  id: string;
  called_at: string;
  user_id: string | null;
  polygon: number[][][];
  polygon_centroid_lat: number;
  polygon_centroid_lng: number;
  polygon_vertex_count: number | null;
  demographics: DemographicData | null;
  tapestry: TapestrySegment | null;
}

export interface CachedDemographicsPinClick {
  mode: CachedDemographicsMode;
  // Where the slideout should center.
  coordinates: { lat: number; lng: number };
  // For polygon entries, the saved geometry to render.
  polygonCoordinates?: number[][][];
  // The cached enrichment result reshaped to look like a normal
  // GeoenrichmentResult — slideout consumes it as-is.
  result: GeoenrichmentResult;
  // Carries through to the slideout so it can show what radii/drive
  // times this cache row covered.
  radii?: number[];
  driveTimes?: number[];
}

export interface CachedDemographicsLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  onPinClick: (event: CachedDemographicsPinClick) => void;
  // When a cached point is opened in the slideout, its coordinates are
  // passed here so every OTHER cached dot is hidden — decluttering the map
  // while the user studies that point's overlays. Cleared (null) on close,
  // which brings all the dots back.
  activeCoordinates?: { lat: number; lng: number } | null;
}

// Location key matching dedupeByLocation's precision, used to match the
// active (opened) point against a marker so the rest can be hidden.
function locationKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function rangeSinceISO(range: CachedDemographicsTimeRange): string | null {
  if (range === 'all') return null;
  const days = range === '7d' ? 7 : 30;
  return new Date(Date.now() - days * 86400_000).toISOString();
}

// Dedupe by rounded (lat, lng) so 10 enrichments at the same corner
// surface as one pin (the most recent).
function dedupeByLocation<T extends { latitude: number; longitude: number; called_at: string }>(
  rows: T[],
): T[] {
  const byKey = new Map<string, T>();
  for (const row of rows) {
    const key = `${row.latitude.toFixed(4)},${row.longitude.toFixed(4)}`;
    const prev = byKey.get(key);
    if (!prev || new Date(row.called_at) > new Date(prev.called_at)) {
      byKey.set(key, row);
    }
  }
  return Array.from(byKey.values());
}

function rowToRingResult(row: RingLogRow): GeoenrichmentResult {
  return {
    success: true,
    property_id: null,
    tapestry: row.tapestry ?? { code: null, name: null, description: null, lifemodes: null },
    demographics: (row.demographics ?? {}) as DemographicData,
    radii: row.radii ?? undefined,
    drive_times: row.drive_times ?? undefined,
    isochrones: row.isochrones ?? undefined,
    raw_response: { cache_hit: true, from_layer: true },
    cached_at: row.called_at,
    cached_by: row.user_id,
  };
}

function rowToPolygonResult(row: PolygonLogRow): GeoenrichmentResult {
  return {
    success: true,
    property_id: null,
    tapestry: row.tapestry ?? { code: null, name: null, description: null, lifemodes: null },
    demographics: (row.demographics ?? {}) as DemographicData,
    raw_response: { cache_hit: true, from_layer: true },
    cached_at: row.called_at,
    cached_by: row.user_id,
  };
}

const CachedDemographicsLayer: React.FC<CachedDemographicsLayerProps> = ({
  map,
  isVisible,
  onPinClick,
  activeCoordinates,
}) => {
  const {
    cachedDemographicsTimeRange,
    cachedDemographicsScope,
    cachedDemographicsModes,
    refreshTrigger,
  } = useLayerManager();
  const { user } = useAuth();
  const trigger = refreshTrigger.cached_demographics || 0;

  const markersRef = useRef<Array<{ marker: google.maps.Marker; key: string }>>([]);
  const [rowCount, setRowCount] = useState(0);

  // The opened cached point, mirrored into a ref so fetchAndRender can read
  // the current selection when it rebuilds markers. fetchAndRender re-runs
  // often (the parent's inline onPinClick changes identity on every render),
  // so applying the filter at creation time is what actually keeps the other
  // dots hidden — an effect alone loses the race with the rebuild.
  const activeKey = activeCoordinates
    ? locationKey(activeCoordinates.lat, activeCoordinates.lng)
    : null;
  const activeKeyRef = useRef<string | null>(activeKey);
  activeKeyRef.current = activeKey;

  const wantRings = cachedDemographicsModes.has('rings');
  const wantPolygon = cachedDemographicsModes.has('polygon');

  const clear = useCallback(() => {
    markersRef.current.forEach(({ marker }) => marker.setMap(null));
    markersRef.current = [];
  }, []);

  const fetchAndRender = useCallback(async () => {
    if (!map || !isVisible) {
      clear();
      return;
    }

    const bounds = map.getBounds();
    if (!bounds) return;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const minLat = sw.lat();
    const maxLat = ne.lat();
    const minLng = sw.lng();
    const maxLng = ne.lng();
    const since = rangeSinceISO(cachedDemographicsTimeRange);
    const userIdFilter = cachedDemographicsScope === 'mine' ? user?.id ?? null : null;

    // Run mode-specific queries in parallel. Each layer mode uses its
    // own location columns (rings on latitude/longitude, polygons on
    // polygon_centroid_*).
    const queries: Promise<unknown>[] = [];

    let ringRows: RingLogRow[] = [];
    let polygonRows: PolygonLogRow[] = [];

    if (wantRings) {
      queries.push((async () => {
        let q = supabase
          .from('esri_enrichment_log')
          .select('id, called_at, user_id, latitude, longitude, radii, drive_times, demographics, tapestry, isochrones')
          .eq('mode', 'rings')
          .eq('success', true)
          .gte('latitude', minLat)
          .lte('latitude', maxLat)
          .gte('longitude', minLng)
          .lte('longitude', maxLng)
          .order('called_at', { ascending: false })
          .limit(500);
        if (since) q = q.gte('called_at', since);
        if (userIdFilter) q = q.eq('user_id', userIdFilter);
        const { data, error } = await q;
        if (error) {
          console.warn('[CachedDemographicsLayer] rings query failed:', error.message);
          return;
        }
        ringRows = (data ?? []) as RingLogRow[];
      })());
    }

    if (wantPolygon) {
      queries.push((async () => {
        let q = supabase
          .from('esri_enrichment_log')
          .select('id, called_at, user_id, polygon, polygon_centroid_lat, polygon_centroid_lng, polygon_vertex_count, demographics, tapestry')
          .eq('mode', 'polygon')
          .eq('success', true)
          .gte('polygon_centroid_lat', minLat)
          .lte('polygon_centroid_lat', maxLat)
          .gte('polygon_centroid_lng', minLng)
          .lte('polygon_centroid_lng', maxLng)
          .order('called_at', { ascending: false })
          .limit(500);
        if (since) q = q.gte('called_at', since);
        if (userIdFilter) q = q.eq('user_id', userIdFilter);
        const { data, error } = await q;
        if (error) {
          console.warn('[CachedDemographicsLayer] polygon query failed:', error.message);
          return;
        }
        polygonRows = (data ?? []) as PolygonLogRow[];
      })());
    }

    await Promise.all(queries);

    const dedupedRings = dedupeByLocation(ringRows);
    const dedupedPolys = dedupeByLocation(
      polygonRows.map((r) => ({
        ...r,
        latitude: r.polygon_centroid_lat,
        longitude: r.polygon_centroid_lng,
      })),
    );

    clear();

    // When a cached point is open, only its dot stays on the map.
    const isShown = (key: string) => !activeKeyRef.current || key === activeKeyRef.current;

    for (const row of dedupedRings) {
      const key = locationKey(row.latitude, row.longitude);
      const marker = new google.maps.Marker({
        position: { lat: row.latitude, lng: row.longitude },
        map: isShown(key) ? map : null,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 5,
          fillColor: PIN_COLOR_RING,
          fillOpacity: 0.9,
          strokeColor: '#FFFFFF',
          strokeWeight: 1.5,
        },
        title: `Cached rings · ${new Date(row.called_at).toLocaleDateString()}`,
        zIndex: 500,
      });
      marker.addListener('click', () => {
        onPinClick({
          mode: 'rings',
          coordinates: { lat: row.latitude, lng: row.longitude },
          result: rowToRingResult(row),
          radii: row.radii ?? undefined,
          driveTimes: row.drive_times ?? undefined,
        });
      });
      markersRef.current.push({ marker, key });
    }

    for (const row of dedupedPolys) {
      const key = locationKey(row.polygon_centroid_lat, row.polygon_centroid_lng);
      const marker = new google.maps.Marker({
        position: { lat: row.polygon_centroid_lat, lng: row.polygon_centroid_lng },
        map: isShown(key) ? map : null,
        // Square symbol differentiates polygon entries from ring entries.
        icon: {
          path: 'M -6,-6 6,-6 6,6 -6,6 z',
          scale: 0.7,
          fillColor: PIN_COLOR_POLYGON,
          fillOpacity: 0.9,
          strokeColor: '#FFFFFF',
          strokeWeight: 1.5,
        },
        title: `Cached polygon · ${row.polygon_vertex_count ?? '?'} vertices · ${new Date(row.called_at).toLocaleDateString()}`,
        zIndex: 500,
      });
      marker.addListener('click', () => {
        onPinClick({
          mode: 'polygon',
          coordinates: { lat: row.polygon_centroid_lat, lng: row.polygon_centroid_lng },
          polygonCoordinates: row.polygon,
          result: rowToPolygonResult(row),
        });
      });
      markersRef.current.push({ marker, key });
    }

    setRowCount(markersRef.current.length);
  }, [
    map,
    isVisible,
    wantRings,
    wantPolygon,
    cachedDemographicsTimeRange,
    cachedDemographicsScope,
    user?.id,
    onPinClick,
    clear,
  ]);

  // When a cached point is opened in the slideout, hide every other dot so
  // only the selected point remains visible; restore all dots when the
  // slideout closes (activeCoordinates back to null). Depends on rowCount so
  // it re-applies after fetchAndRender rebuilds the marker set.
  useEffect(() => {
    if (!map) return;
    markersRef.current.forEach(({ marker, key }) => {
      const shouldShow = !activeKey || key === activeKey;
      marker.setMap(shouldShow ? map : null);
    });
  }, [activeKey, rowCount, map]);

  // Re-fetch on map idle (pan/zoom settled), on visibility flip, on
  // filter changes, and on explicit refresh triggers.
  useEffect(() => {
    if (!map) return;
    if (!isVisible) {
      clear();
      return;
    }
    fetchAndRender();
    const listener = map.addListener('idle', () => fetchAndRender());
    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, isVisible, fetchAndRender, trigger, clear]);

  useEffect(() => () => clear(), [clear]);

  return null;
};

export default CachedDemographicsLayer;
