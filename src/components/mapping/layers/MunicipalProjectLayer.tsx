import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { useMunicipalProjectPolygonStyle } from '../../../hooks/useMunicipalProjectPolygonStyle';
import { formatUnitsLabel } from '../../../utils/municipalProjectUnitsLabel';

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
  effective_stage_line_color: string | null;
  // Joined in client-side from project_stage.abbreviation (municipal_project_v
  // doesn't expose it). Used to compose the on-map units label (e.g. "+80 RC").
  effective_stage_abbreviation: string | null;
  centroid_lat: number;
  centroid_lng: number;
  geocoded_address: string | null;
  // GeoJSON Polygon (or MultiPolygon) when the user has drawn one in Phase 3; null otherwise.
  geometry_geojson: { type: string; coordinates: unknown } | null;
  // Source / provenance (Phase B additions — populated by the market research agent
  // on agent-promoted rows; nullable on importer + manually-created rows).
  builder_developer: string | null;
  permit_url: string | null;
  permit_application_date: string | null;
  source: string | null;
  source_research_run_id: string | null;
  source_import_id: string | null;
  created_at: string | null;
  updated_at: string | null;
  created_by_id: string | null;
  updated_by_id: string | null;
  // Location-precision hints captured by the agent from sources. Neither feeds
  // geocoding; reviewer reads these when manually adjusting the pin / drawing
  // the project polygon.
  location_description: string | null;
  parcel_boundary_notes: string | null;
  // Screen-pixel offset applied to the on-map units label. NULL = default (0,0),
  // which sits just below the pin tip. User can drag the label to override.
  label_offset_x_px: number | null;
  label_offset_y_px: number | null;
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
  // While the user is editing a polygon, hide this project's baked polygon so
  // the terra-draw editable polygon is the only one on the map.
  hidePolygonForProjectId?: string | null;
}

const DEFAULT_STAGE_COLOR = '#8FA9C8'; // brand slate
// Agent-generated projects (source_research_run_id set) render in brand midnight
// so reviewers can spot new agent-created pins at a glance regardless of stage.
const AGENT_PIN_COLOR = '#002147';

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

function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : c === '"' ? '&quot;' : '&apos;',
  );
}

// SVG icon for the on-map label — text with a solid halo stroke behind the fill
// so it stays legible over any basemap. Sized to the text so it doesn't
// intercept clicks well outside the visible characters.
function makeLabelIcon(
  text: string,
  fontSize: number,
  fillColor: string,
  lineColor: string,
): google.maps.Icon {
  // Rough character-width estimate for the SVG viewport. Bold Arial ≈ 0.62em/char.
  const approxCharWidth = fontSize * 0.62;
  const paddingX = 6;
  const width = Math.max(24, Math.ceil(text.length * approxCharWidth + paddingX * 2));
  const height = fontSize + 10;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
    `<text x="${width / 2}" y="${fontSize + 3}" text-anchor="middle" ` +
    `font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="bold" ` +
    `paint-order="stroke" stroke="${lineColor}" stroke-width="3" stroke-linejoin="round" ` +
    `fill="${fillColor}">${xmlEscape(text)}</text>` +
    `</svg>`;
  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg),
    scaledSize: new google.maps.Size(width, height),
    // Anchor at top-center so the label sits below the pin position (which is
    // the pin tip). When a saved offset is applied the marker position shifts
    // by that many pixels; the anchor stays the same.
    anchor: new google.maps.Point(width / 2, 0),
  };
}

// Convert a screen-pixel offset (relative to a lat/lng center) to an absolute
// lat/lng at the map's current zoom. Used so a stored pixel offset produces
// the same on-screen distance at every zoom level.
function offsetToLatLng(
  map: google.maps.Map,
  centerLat: number,
  centerLng: number,
  offsetXPx: number,
  offsetYPx: number,
): { lat: number; lng: number } {
  const proj = map.getProjection();
  const zoom = map.getZoom();
  if (!proj || zoom == null || (offsetXPx === 0 && offsetYPx === 0)) {
    return { lat: centerLat, lng: centerLng };
  }
  const worldScale = Math.pow(2, zoom);
  const centerPoint = proj.fromLatLngToPoint(new google.maps.LatLng(centerLat, centerLng));
  if (!centerPoint) return { lat: centerLat, lng: centerLng };
  const newPoint = new google.maps.Point(
    centerPoint.x + offsetXPx / worldScale,
    centerPoint.y + offsetYPx / worldScale,
  );
  const newLatLng = proj.fromPointToLatLng(newPoint);
  return newLatLng
    ? { lat: newLatLng.lat(), lng: newLatLng.lng() }
    : { lat: centerLat, lng: centerLng };
}

// Inverse of offsetToLatLng — given a dragged label position, work out the
// pixel offset from the centroid so we can persist it.
function latLngToOffset(
  map: google.maps.Map,
  centerLat: number,
  centerLng: number,
  labelLat: number,
  labelLng: number,
): { x: number; y: number } {
  const proj = map.getProjection();
  const zoom = map.getZoom();
  if (!proj || zoom == null) return { x: 0, y: 0 };
  const worldScale = Math.pow(2, zoom);
  const centerPoint = proj.fromLatLngToPoint(new google.maps.LatLng(centerLat, centerLng));
  const labelPoint = proj.fromLatLngToPoint(new google.maps.LatLng(labelLat, labelLng));
  if (!centerPoint || !labelPoint) return { x: 0, y: 0 };
  return {
    x: Math.round((labelPoint.x - centerPoint.x) * worldScale),
    y: Math.round((labelPoint.y - centerPoint.y) * worldScale),
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
  hidePolygonForProjectId,
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
    municipalProjectsLabelMode,
    municipalProjectsLabelFontSize,
    municipalProjectsLabelFillColor,
    municipalProjectsLabelLineColor,
    refreshTrigger,
  } = useLayerManager();
  const { style: polygonStyle } = useMunicipalProjectPolygonStyle();

  const [rows, setRows] = useState<MunicipalProjectMapRow[]>([]);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const labelMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const polygonsRef = useRef<Map<string, google.maps.Polygon>>(new Map());
  // Increments on map zoom so labels re-derive their lat/lng from stored pixel
  // offsets whenever the projection changes.
  const [zoomTick, setZoomTick] = useState(0);
  useEffect(() => {
    if (!map) return;
    const listener = map.addListener('zoom_changed', () => setZoomTick((n) => n + 1));
    return () => google.maps.event.removeListener(listener);
  }, [map]);

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

      // Join in project_stage.abbreviation client-side (municipal_project_v
      // doesn't expose it). Mirrors the KML export pattern.
      const { data: stages, error: stagesErr } = await supabase
        .from('project_stage')
        .select('id, abbreviation');
      if (stagesErr) throw stagesErr;
      const abbrById = new Map<string, string | null>(
        (stages ?? []).map((s: { id: string; abbreviation: string | null }) => [s.id, s.abbreviation]),
      );
      for (const r of typed) {
        r.effective_stage_abbreviation = r.effective_stage_id
          ? abbrById.get(r.effective_stage_id) ?? null
          : null;
      }

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
    for (const [id, labelMarker] of labelMarkersRef.current) {
      if (!rows.find((r) => r.id === id)) {
        labelMarker.setMap(null);
        labelMarkersRef.current.delete(id);
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
      const showPoly = passesFilters && municipalProjectsShowPolygons
        && hidePolygonForProjectId !== row.id;
      // Pin color: agent rows override to navy so they're spot-able at a glance.
      // Polygon color: always use the stage color chain so agent polygons blend in
      // with manually-entered ones (the navy signal on the pin is enough).
      const stageColor = row.effective_stage_color || row.municipality_display_color || DEFAULT_STAGE_COLOR;
      const pinColor = row.source_research_run_id ? AGENT_PIN_COLOR : stageColor;
      const polyColor = stageColor;
      // Stroke color precedence: global override (user pref) > per-stage line_color > fill color.
      const polyStrokeColor =
        polygonStyle.strokeColorMode === 'global'
          ? polygonStyle.strokeColor
          : (row.effective_stage_line_color || polyColor);
      const isSelected = selectedProjectId === row.id;

      const isBeingVerified = verifyingProjectId === row.id;
      let marker = existing.get(row.id);
      if (!marker) {
        marker = new google.maps.Marker({
          position: { lat: row.centroid_lat, lng: row.centroid_lng },
          icon: makeIcon(pinColor, isSelected || isBeingVerified),
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
        marker.setIcon(makeIcon(pinColor, isSelected || isBeingVerified));
        marker.setMap(showPin ? map : null);
        marker.setDraggable(isBeingVerified);
        marker.setZIndex(isSelected || isBeingVerified ? 1000 : undefined);
      }

      // On-map label: separate draggable marker whose position is the pin
      // centroid + any saved pixel offset (resolved at the current zoom).
      // Independent of pin visibility — shown whenever the row passes filters
      // and *something* representing the project (pin OR polygon) is on the map.
      const labelText =
        municipalProjectsLabelMode === 'total_units'
          ? row.total_housing_units != null
            ? String(row.total_housing_units)
            : ''
          : municipalProjectsLabelMode === 'units_label'
            ? formatUnitsLabel(row.total_housing_units, row.effective_stage_abbreviation)
            : '';
      const hasLabel = labelText.length > 0;
      const showLabel =
        hasLabel &&
        passesFilters &&
        (municipalProjectsShowPins || municipalProjectsShowPolygons);
      const offsetX = row.label_offset_x_px ?? 0;
      const offsetY = row.label_offset_y_px ?? 0;
      const labelPos = offsetToLatLng(
        map,
        row.centroid_lat,
        row.centroid_lng,
        offsetX,
        offsetY,
      );
      let labelMarker = labelMarkersRef.current.get(row.id);
      if (!labelMarker && showLabel) {
        labelMarker = new google.maps.Marker({
          position: labelPos,
          icon: makeLabelIcon(
            labelText,
            municipalProjectsLabelFontSize,
            municipalProjectsLabelFillColor,
            municipalProjectsLabelLineColor,
          ),
          map,
          draggable: true,
          crossOnDrag: false,
          // Sit above the pin so clicks on the text hit the label, not the pin
          // behind it. Selected pin still wins via its z=1000.
          zIndex: 800,
          // Skip Maps' click-optimization so pointer events aren't merged with
          // adjacent labels/pins — makes dragging responsive.
          optimized: false,
        });
        labelMarker.addListener('dragend', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          const { x, y } = latLngToOffset(
            map,
            row.centroid_lat,
            row.centroid_lng,
            e.latLng.lat(),
            e.latLng.lng(),
          );
          // Persist. Update local row synchronously so the next re-render uses
          // the new offset (otherwise the label snaps back on any state change).
          void supabase
            .from('municipal_project')
            .update({ label_offset_x_px: x, label_offset_y_px: y })
            .eq('id', row.id)
            .then(({ error }) => {
              if (error) console.warn('label offset save failed:', error.message);
            });
          setRows((prev) =>
            prev.map((r) =>
              r.id === row.id
                ? { ...r, label_offset_x_px: x, label_offset_y_px: y }
                : r,
            ),
          );
        });
        labelMarkersRef.current.set(row.id, labelMarker);
      } else if (labelMarker) {
        labelMarker.setPosition(labelPos);
        labelMarker.setIcon(
          makeLabelIcon(
            labelText,
            municipalProjectsLabelFontSize,
            municipalProjectsLabelFillColor,
            municipalProjectsLabelLineColor,
          ),
        );
        labelMarker.setMap(showLabel ? map : null);
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
            strokeColor: polyStrokeColor,
            strokeOpacity: polygonStyle.strokeOpacity,
            strokeWeight: weight,
            fillColor: polyColor,
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
            strokeColor: polyStrokeColor,
            strokeOpacity: polygonStyle.strokeOpacity,
            strokeWeight: weight,
            fillColor: polyColor,
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
    municipalProjectsLabelMode,
    municipalProjectsLabelFontSize,
    municipalProjectsLabelFillColor,
    municipalProjectsLabelLineColor,
    zoomTick,
    selectedProjectId,
    verifyingProjectId,
    hidePolygonForProjectId,
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
      for (const [, labelMarker] of labelMarkersRef.current) labelMarker.setMap(null);
      labelMarkersRef.current.clear();
      for (const [, poly] of polygonsRef.current) poly.setMap(null);
      polygonsRef.current.clear();
    };
  }, []);

  return null;
};

export default MunicipalProjectLayer;
