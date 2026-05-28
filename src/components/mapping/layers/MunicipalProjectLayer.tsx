import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { useMunicipalProjectPolygonStyle } from '../../../hooks/useMunicipalProjectPolygonStyle';

export interface MunicipalProjectMapRow {
  id: string;
  municipality_id: string;
  municipality_name: string | null;
  municipality_state: string | null;
  municipality_display_color: string | null;
  address: string;
  project_name: string;
  phase_label: string;
  parcel_numbers: string[] | null;
  single_family_lots: number | null;
  townhouse_units: number | null;
  duplex_units: number | null;
  apt_units: number | null;
  cottage_units: number | null;
  total_housing_units: number | null;
  zoning: string | null;
  zoning_approval_date: string | null;
  notes: string | null;
  raw_stages: Record<string, string> | null;
  status_stage_id: string | null;
  status_override_id: string | null;
  effective_stage_id: string | null;
  effective_stage_name: string | null;
  effective_stage_color: string | null;
  centroid_lat: number;
  centroid_lng: number;
  geocoded_address: string | null;
  // GeoJSON Polygon (or MultiPolygon) when the user has drawn one in Phase 3; null otherwise.
  geometry_geojson: { type: string; coordinates: unknown } | null;
}

interface Props {
  map: google.maps.Map | null;
  isVisible: boolean;
  onPinClick?: (project: MunicipalProjectMapRow) => void;
  onPinRightClick?: (project: MunicipalProjectMapRow, screenX: number, screenY: number) => void;
  onLocationVerified?: (projectId: string, lat: number, lng: number) => void;
  verifyingProjectId?: string | null;
  onProjectsLoaded?: (count: number) => void;
  selectedProjectId?: string | null;
}

const DEFAULT_STAGE_COLOR = '#8FA9C8'; // brand slate

// Rounded-square "badge" pin with a small house glyph + a triangular stem at the
// bottom that anchors the visual point on the map. Intentionally different from
// the property teardrop and the restaurant circle so users can distinguish at a
// glance. Stage color fills the badge.
function pinSvg(color: string, selected: boolean): string {
  const stroke = selected ? '#002147' : '#FFFFFF';
  const strokeWidth = selected ? 2.5 : 1.5;
  const scale = selected ? 1.1 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${30 * scale}" height="${36 * scale}" viewBox="0 0 30 36">
    <!-- soft shadow under the stem -->
    <ellipse cx="15" cy="34.5" rx="4" ry="1.2" fill="rgba(0,0,0,0.25)"/>
    <!-- triangular stem -->
    <path d="M15 33 L11.5 28 L18.5 28 Z" fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linejoin="round"/>
    <!-- badge body -->
    <rect x="2" y="2" width="26" height="26" rx="5" ry="5"
      fill="${color}" stroke="${stroke}" stroke-width="${strokeWidth}"/>
    <!-- house glyph -->
    <path d="M15 8 L7.5 14.5 L9 14.5 L9 21.5 L13 21.5 L13 17 L17 17 L17 21.5 L21 21.5 L21 14.5 L22.5 14.5 Z"
      fill="#FFFFFF" opacity="0.95"/>
  </svg>`;
}

/**
 * Convert a GeoJSON Polygon or MultiPolygon to the path format google.maps.Polygon expects.
 * Returns null for unsupported geometry types or empty inputs.
 *
 * GeoJSON Polygon coordinates: number[ring][point][lng|lat]
 * MultiPolygon coordinates: number[polygon][ring][point][lng|lat]
 * google.maps.Polygon paths: array-of-arrays of {lat, lng}; outer array = each polygon's outer ring + holes.
 */
function polygonPathsFromGeoJson(
  geojson: { type: string; coordinates: unknown } | null
): google.maps.LatLngLiteral[][] | null {
  if (!geojson) return null;
  const toRing = (ring: unknown): google.maps.LatLngLiteral[] => {
    if (!Array.isArray(ring)) return [];
    return ring
      .filter((pt): pt is [number, number] => Array.isArray(pt) && pt.length >= 2)
      .map(([lng, lat]) => ({ lat, lng }));
  };
  if (geojson.type === 'Polygon') {
    const rings = geojson.coordinates as unknown[];
    return rings.map(toRing).filter((r) => r.length > 0);
  }
  if (geojson.type === 'MultiPolygon') {
    const polys = geojson.coordinates as unknown[];
    return polys.flatMap((poly) => (poly as unknown[]).map(toRing)).filter((r) => r.length > 0);
  }
  return null;
}

function makeIcon(color: string, selected: boolean): google.maps.Icon {
  const svg = pinSvg(color, selected);
  const scale = selected ? 1.1 : 1;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(30 * scale, 36 * scale),
    anchor: new google.maps.Point(15 * scale, 36 * scale),
  };
}

const MunicipalProjectLayer: React.FC<Props> = ({
  map,
  isVisible,
  onPinClick,
  onPinRightClick,
  onLocationVerified,
  verifyingProjectId,
  onProjectsLoaded,
  selectedProjectId,
}) => {
  const {
    setLayerCount,
    setLayerLoading,
    setLayerError,
    municipalProjectsHiddenMunicipalityIds,
    municipalProjectsHiddenStageIds,
    municipalProjectsMinUnits,
    municipalProjectsMaxUnits,
    municipalProjectsShowPins,
    municipalProjectsShowPolygons,
    refreshTrigger,
  } = useLayerManager();
  const { style: polygonStyle } = useMunicipalProjectPolygonStyle();

  const [rows, setRows] = useState<MunicipalProjectMapRow[]>([]);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polygonsRef = useRef<Map<string, google.maps.Polygon>>(new Map());

  const fetchRows = useCallback(async () => {
    setLayerLoading('municipal_projects', true);
    setLayerError('municipal_projects', false);
    try {
      const { data, error } = await supabase
        .from('municipal_project_v')
        .select('*')
        .not('centroid_lat', 'is', null)
        .not('centroid_lng', 'is', null);
      if (error) throw error;
      const typed = (data ?? []) as unknown as MunicipalProjectMapRow[];
      setRows(typed);
      setLayerCount('municipal_projects', typed.length);
      onProjectsLoaded?.(typed.length);
    } catch (e) {
      console.error('MunicipalProjectLayer fetch failed:', e);
      setLayerError('municipal_projects', true);
    } finally {
      setLayerLoading('municipal_projects', false);
    }
  }, [setLayerCount, setLayerLoading, setLayerError, onProjectsLoaded]);

  // Fetch when layer becomes visible (or on initial mount if visible by default).
  useEffect(() => {
    if (!isVisible) return;
    if (rows.length === 0) void fetchRows();
  }, [isVisible, rows.length, fetchRows]);

  // Refetch when LayerManager bumps the refresh trigger (e.g. after a status override save).
  const mpRefreshTrigger = refreshTrigger['municipal_projects'] ?? 0;
  useEffect(() => {
    if (mpRefreshTrigger === 0) return;
    void fetchRows();
  }, [mpRefreshTrigger, fetchRows]);

  // Create / update markers + polygons when rows, map, or filter state change.
  useEffect(() => {
    if (!map) return;
    const existing = markersRef.current;
    const existingPolys = polygonsRef.current;

    // Remove markers + polygons whose IDs are no longer in rows.
    for (const [id, marker] of existing) {
      if (!rows.find((r) => r.id === id)) {
        marker.setMap(null);
        existing.delete(id);
      }
    }
    for (const [id, poly] of existingPolys) {
      if (!rows.find((r) => r.id === id)) {
        poly.setMap(null);
        existingPolys.delete(id);
      }
    }

    const unitsFilterActive = municipalProjectsMinUnits != null || municipalProjectsMaxUnits != null;

    for (const row of rows) {
      const stageHidden = municipalProjectsHiddenStageIds.has(row.effective_stage_id ?? null);
      const muniHidden = municipalProjectsHiddenMunicipalityIds.has(row.municipality_id);
      let unitsHidden = false;
      if (unitsFilterActive) {
        const u = row.total_housing_units;
        if (u == null) {
          unitsHidden = true;
        } else {
          if (municipalProjectsMinUnits != null && u < municipalProjectsMinUnits) unitsHidden = true;
          if (municipalProjectsMaxUnits != null && u > municipalProjectsMaxUnits) unitsHidden = true;
        }
      }
      const passesFilters = isVisible && !stageHidden && !muniHidden && !unitsHidden;
      const showPin = passesFilters && municipalProjectsShowPins;
      const showPoly = passesFilters && municipalProjectsShowPolygons;
      const color = row.effective_stage_color || row.municipality_display_color || DEFAULT_STAGE_COLOR;
      const isSelected = selectedProjectId === row.id;

      const isBeingVerified = verifyingProjectId === row.id;
      let marker = existing.get(row.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: row.centroid_lat, lng: row.centroid_lng },
          icon: makeIcon(color, isSelected || isBeingVerified),
          title: row.project_name || row.address,
          map: showPin ? map : null,
          draggable: isBeingVerified,
          zIndex: isSelected || isBeingVerified ? 1000 : undefined,
        });
        marker.addListener('click', () => onPinClick?.(row));
        marker.addListener('rightclick', (e: google.maps.MapMouseEvent & { domEvent?: MouseEvent }) => {
          // Prefer the native DOM event for screen coords; fall back to map projection if missing.
          const dom = e.domEvent as MouseEvent | undefined;
          if (dom) onPinRightClick?.(row, dom.clientX, dom.clientY);
        });
        marker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          onLocationVerified?.(row.id, e.latLng.lat(), e.latLng.lng());
        });
        existing.set(row.id, marker);
      } else {
        marker.setPosition({ lat: row.centroid_lat, lng: row.centroid_lng });
        marker.setIcon(makeIcon(color, isSelected || isBeingVerified));
        marker.setMap(showPin ? map : null);
        marker.setDraggable(isBeingVerified);
        marker.setZIndex(isSelected || isBeingVerified ? 1000 : undefined);
      }

      // Polygon (if the project has drawn geometry)
      const polyPaths = polygonPathsFromGeoJson(row.geometry_geojson);
      let poly = existingPolys.get(row.id);
      if (polyPaths) {
        const baseWeight = polygonStyle.strokeWeight;
        const weight = isSelected ? baseWeight + 1 : baseWeight;
        if (!poly) {
          poly = new google.maps.Polygon({
            paths: polyPaths,
            strokeColor: color,
            strokeOpacity: polygonStyle.strokeOpacity,
            strokeWeight: weight,
            fillColor: color,
            fillOpacity: polygonStyle.fillOpacity,
            clickable: true,
            zIndex: isSelected ? 999 : undefined,
            map: showPoly ? map : null,
          });
          poly.addListener('click', () => onPinClick?.(row));
          existingPolys.set(row.id, poly);
        } else {
          poly.setPaths(polyPaths);
          poly.setOptions({
            strokeColor: color,
            strokeOpacity: polygonStyle.strokeOpacity,
            strokeWeight: weight,
            fillColor: color,
            fillOpacity: polygonStyle.fillOpacity,
            zIndex: isSelected ? 999 : undefined,
          });
          poly.setMap(showPoly ? map : null);
        }
      } else if (poly) {
        // Project no longer has geometry — remove the polygon.
        poly.setMap(null);
        existingPolys.delete(row.id);
      }
    }
  }, [
    map,
    rows,
    isVisible,
    municipalProjectsHiddenMunicipalityIds,
    municipalProjectsHiddenStageIds,
    municipalProjectsMinUnits,
    municipalProjectsMaxUnits,
    municipalProjectsShowPins,
    municipalProjectsShowPolygons,
    selectedProjectId,
    verifyingProjectId,
    polygonStyle,
    onPinClick,
    onPinRightClick,
    onLocationVerified,
  ]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      for (const [, marker] of markersRef.current) marker.setMap(null);
      markersRef.current.clear();
      for (const [, poly] of polygonsRef.current) poly.setMap(null);
      polygonsRef.current.clear();
    };
  }, []);

  return null;
};

export default MunicipalProjectLayer;
