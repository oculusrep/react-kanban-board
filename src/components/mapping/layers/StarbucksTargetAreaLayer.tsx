import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import {
  StarbucksTargetAreaStyles,
  DEFAULT_STYLES,
  PriorityKey,
  StyleBucketKey,
} from '../../../hooks/useStarbucksTargetAreaStyles';

// One row returned by get_starbucks_target_areas_in_bbox.
// geom_geojson is GeoJSON Polygon — first ring is the outer boundary; current dataset has no holes.
export interface TargetAreaRow {
  id: string;
  target_area_id: string | null;   // null for OREP-drawn polygons (no Starbucks GUID)
  name: string;
  store_type: string | null;
  priority: number | null;
  re_availability: string | null;
  notes: string | null;
  market_name: string | null;
  sdm_mdm: string | null;
  model_yr1_sales: number | null;        // raw Starbucks value
  source: 'starbucks' | 'orep';
  orep_notes: string | null;             // OREP annotation
  orep_model_yr1_sales: number | null;   // OREP override for model_yr1_sales
  planned_ops_area_id: number | null;
  planned_ops_area_name: string | null;
  geom_geojson: { type: 'Polygon'; coordinates: number[][][] };
}

export interface StarbucksTargetAreaLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  /**
   * Per-priority style overrides. If omitted (e.g. callers that haven't been updated),
   * falls back to DEFAULT_STYLES so the layer still renders sensibly.
   */
  styles?: StarbucksTargetAreaStyles;
  /**
   * Optional ops-area filter. null = show all; a Set (possibly empty) = only show these ids.
   * Rows with a null planned_ops_area_id are only shown when the filter itself is null.
   * OREP-drawn polygons (source='orep') bypass this filter entirely — they aren't part of the
   * Starbucks ops-area hierarchy and should always show when their bucket is visible.
   */
  selectedOpsAreaIds?: Set<number> | null;
  /**
   * When provided (i.e. the user can edit), clicking a polygon calls this instead of opening the
   * read-only InfoWindow — the parent opens the editable slideout. When omitted, click shows the
   * InfoWindow.
   */
  onFeatureClick?: (row: TargetAreaRow) => void;
}

// Keep alongside each polygon so style-update, hover effects, and the ops-area filter
// can re-style / attach / detach without rebuilding the polygon set.
interface PolygonRef {
  polygon: google.maps.Polygon;
  bucket: StyleBucketKey;   // 1 | 2 | 3 (Starbucks priority) or 'orep' (OREP-drawn)
  opsAreaId: number | null;
  isOrep: boolean;
}

function priorityKeyOf(p: number | null): PriorityKey | null {
  return p === 1 || p === 2 || p === 3 ? (p as PriorityKey) : null;
}

// Which style bucket a row belongs to: OREP-drawn rows use the 'orep' bucket regardless of priority;
// Starbucks rows use their priority bucket (falling back to 1 for the rare null/invalid priority).
function bucketOf(row: TargetAreaRow): StyleBucketKey {
  if (row.source === 'orep') return 'orep';
  return priorityKeyOf(row.priority) ?? 1;
}

function styleFor(bucket: StyleBucketKey, styles: StarbucksTargetAreaStyles): {
  strokeColor: string; fillColor: string; fillOpacity: number; strokeWeight: number;
} {
  return styles[bucket];
}

function formatUSD(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return '—';
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function infoWindowHtml(row: TargetAreaRow): string {
  // Display the OREP override when set, else the raw Starbucks value.
  const effectiveSales = row.orep_model_yr1_sales ?? row.model_yr1_sales;
  const sales = formatUSD(effectiveSales);
  const isOverride = row.orep_model_yr1_sales != null;
  const orepBadge =
    row.source === 'orep'
      ? `<span style="display:inline-block;margin-left:6px;padding:1px 6px;border-radius:8px;background:#0000FF;color:#fff;font-size:9px;font-weight:600;vertical-align:middle;">OREP</span>`
      : '';
  return `
    <div style="font-family:-apple-system,system-ui,sans-serif;min-width:240px;max-width:320px;">
      <div style="font-weight:600;font-size:13px;color:#002147;margin-bottom:6px;">
        ${escapeHtml(row.name)}${orepBadge}
      </div>
      <div style="font-size:11px;color:#4A6B94;line-height:1.6;">
        <div><strong>Priority:</strong> ${row.priority ?? '—'}</div>
        <div><strong>Store Type:</strong> ${escapeHtml(row.store_type)}</div>
        <div><strong>RE Availability:</strong> ${escapeHtml(row.re_availability)}</div>
        <div><strong>Market:</strong> ${escapeHtml(row.market_name)}</div>
        <div><strong>SDM:</strong> ${escapeHtml(row.sdm_mdm)}</div>
        <div><strong>Model Yr1 Sales:</strong> ${sales}${isOverride ? ' <span style="font-size:9px;color:#4A6B94;">(OREP)</span>' : ''}</div>
        ${
          row.notes
            ? `<div style="margin-top:6px;font-style:italic;color:#4A6B94;">${escapeHtml(row.notes)}</div>`
            : ''
        }
        ${
          row.orep_notes
            ? `<div style="margin-top:6px;color:#002147;"><strong>OREP Notes:</strong> ${escapeHtml(row.orep_notes)}</div>`
            : ''
        }
      </div>
    </div>
  `;
}

const StarbucksTargetAreaLayer: React.FC<StarbucksTargetAreaLayerProps> = ({
  map,
  isVisible,
  styles,
  selectedOpsAreaIds = null,
  onFeatureClick,
}) => {
  const effectiveStyles: StarbucksTargetAreaStyles = styles ?? DEFAULT_STYLES;

  const [rows, setRows] = useState<TargetAreaRow[]>([]);
  const polygonsRef = useRef<PolygonRef[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const isFetchingRef = useRef(false);
  const lastFetchBoundsRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hover handlers capture style at create-time, but the user can edit styles
  // while hovering. Keep current styles in a ref so hover handlers always see the latest.
  const stylesRef = useRef<StarbucksTargetAreaStyles>(effectiveStyles);
  useEffect(() => {
    stylesRef.current = effectiveStyles;
  }, [effectiveStyles]);

  const { refreshTrigger } = useLayerManager();
  const trigger = refreshTrigger.starbucks_target_areas || 0;

  const fetchRows = useCallback(
    async (forceRefresh = false) => {
      if (!map || isFetchingRef.current) return;
      const bounds = map.getBounds();
      if (!bounds) return;

      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const boundsKey = `${sw.lat().toFixed(4)},${sw.lng().toFixed(4)},${ne.lat().toFixed(4)},${ne.lng().toFixed(4)}`;
      if (!forceRefresh && lastFetchBoundsRef.current === boundsKey) return;

      isFetchingRef.current = true;
      lastFetchBoundsRef.current = boundsKey;

      try {
        const { data, error } = await supabase.rpc('get_starbucks_target_areas_in_bbox', {
          p_south: sw.lat(),
          p_west: sw.lng(),
          p_north: ne.lat(),
          p_east: ne.lng(),
        });
        if (error) throw error;
        console.log('🎯 SBUX target areas: fetched', (data ?? []).length, 'rows for bbox', boundsKey);
        setRows((data ?? []) as TargetAreaRow[]);
      } catch (err) {
        console.error('🎯 StarbucksTargetAreaLayer fetch error:', err);
      } finally {
        isFetchingRef.current = false;
      }
    },
    [map]
  );

  useEffect(() => {
    if (map && isVisible) fetchRows();
    else if (!isVisible) setRows([]);
  }, [map, isVisible, fetchRows]);

  useEffect(() => {
    if (map && isVisible && trigger > 0) {
      lastFetchBoundsRef.current = null;
      fetchRows(true);
    }
  }, [trigger, map, isVisible, fetchRows]);

  useEffect(() => {
    if (!map || !isVisible) return;
    const listener = map.addListener('idle', () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => fetchRows(), 300);
    });
    return () => {
      google.maps.event.removeListener(listener);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [map, isVisible, fetchRows]);

  // Build / rebuild polygons whenever rows change. Style is read from stylesRef in handlers
  // and from effectiveStyles at create time so they look correct on first paint.
  useEffect(() => {
    if (!map) return;

    polygonsRef.current.forEach(({ polygon }) => polygon.setMap(null));
    polygonsRef.current = [];

    if (!rows.length) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow();
    }
    const iw = infoWindowRef.current;

    const built: PolygonRef[] = rows
      .filter(row => row.geom_geojson?.coordinates?.[0]?.length)
      .map(row => {
        const ring = row.geom_geojson.coordinates[0];
        const path = ring.map(([lng, lat]) => ({ lat, lng }));
        const bucket = bucketOf(row);
        const isOrep = row.source === 'orep';
        const style = styleFor(bucket, effectiveStyles);

        const polygon = new google.maps.Polygon({
          paths: path,
          strokeColor: style.strokeColor,
          strokeOpacity: 0.9,
          strokeWeight: style.strokeWeight,
          fillColor: style.fillColor,
          fillOpacity: style.fillOpacity,
          clickable: true,
          // OREP polygons on top, then P1 > P2 > P3.
          zIndex: isOrep ? 40 : bucket === 1 ? 30 : bucket === 2 ? 20 : 10,
        });
        const bucketVisible = effectiveStyles[bucket].visible;
        const opsAreaVisible =
          isOrep || selectedOpsAreaIds === null
            ? true
            : row.planned_ops_area_id != null && selectedOpsAreaIds.has(row.planned_ops_area_id);
        polygon.setMap(isVisible && bucketVisible && opsAreaVisible ? map : null);

        polygon.addListener('mouseover', () => {
          const current = styleFor(bucket, stylesRef.current);
          polygon.setOptions({
            strokeWeight: current.strokeWeight + 1,
            fillOpacity: Math.min(1, current.fillOpacity + 0.15),
          });
        });
        polygon.addListener('mouseout', () => {
          const current = styleFor(bucket, stylesRef.current);
          polygon.setOptions({
            strokeWeight: current.strokeWeight,
            fillOpacity: current.fillOpacity,
          });
        });
        polygon.addListener('click', (event: google.maps.PolyMouseEvent) => {
          // Editors get the editable slideout; everyone else gets the read-only InfoWindow.
          if (onFeatureClick) {
            onFeatureClick(row);
            return;
          }
          if (!event.latLng) return;
          iw.setContent(infoWindowHtml(row));
          iw.setPosition(event.latLng);
          iw.open({ map });
        });

        return { polygon, bucket, opsAreaId: row.planned_ops_area_id, isOrep };
      });

    polygonsRef.current = built;
    const shown = built.filter(b => b.polygon.getMap()).length;
    console.log(
      `🎯 SBUX target areas: built ${built.length} polygons, ${shown} shown`,
      `| isVisible=${isVisible}`,
      `| opsFilter=${selectedOpsAreaIds === null ? 'ALL (null)' : `Set(${selectedOpsAreaIds.size})`}`,
      `| bucketsVisible=`, { p1: effectiveStyles[1].visible, p2: effectiveStyles[2].visible, p3: effectiveStyles[3].visible, orep: effectiveStyles.orep.visible }
    );
    // We intentionally exclude `effectiveStyles` from deps — the dedicated style-update
    // effect below handles live re-styling without rebuilding the polygon set.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, map]);

  // Live preview: when styles change, update existing polygons in place (no rebuild).
  useEffect(() => {
    polygonsRef.current.forEach(({ polygon, bucket }) => {
      const style = styleFor(bucket, effectiveStyles);
      polygon.setOptions({
        strokeColor: style.strokeColor,
        fillColor: style.fillColor,
        fillOpacity: style.fillOpacity,
        strokeWeight: style.strokeWeight,
      });
    });
  }, [effectiveStyles]);

  // Attach/detach polygons based on (master toggle) AND (per-bucket visibility) AND (ops-area filter).
  // Runs on isVisible flips, per-bucket flips from the style editor, and ops-area filter changes.
  useEffect(() => {
    if (!map) return;
    polygonsRef.current.forEach(({ polygon, bucket, opsAreaId, isOrep }) => {
      const bucketVisible = effectiveStyles[bucket].visible;
      const opsAreaVisible =
        isOrep || selectedOpsAreaIds === null
          ? true
          : opsAreaId != null && selectedOpsAreaIds.has(opsAreaId);
      polygon.setMap(isVisible && bucketVisible && opsAreaVisible ? map : null);
    });
    if (!isVisible && infoWindowRef.current) {
      infoWindowRef.current.close();
    }
  }, [isVisible, map, effectiveStyles, selectedOpsAreaIds]);

  useEffect(() => {
    return () => {
      polygonsRef.current.forEach(({ polygon }) => polygon.setMap(null));
      polygonsRef.current = [];
      infoWindowRef.current?.close();
      infoWindowRef.current = null;
    };
  }, []);

  return null;
};

export default StarbucksTargetAreaLayer;
