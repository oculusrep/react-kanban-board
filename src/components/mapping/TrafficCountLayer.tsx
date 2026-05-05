import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStreetLightTraffic, type MapBounds, type StreetLightSegment } from '../../hooks/useStreetLightTraffic';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabaseClient';
import TrafficSpendModal from './TrafficSpendModal';

interface TrafficCountLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
}

interface SegmentWithMetric extends StreetLightSegment {
  aadt?: number | null;
}

interface InfoPopup {
  segmentId: string;
  position: google.maps.LatLng;
  roadName: string | null;
  roadType: string | null;
  aadt: number | null;
  dataYear?: string | null;
}

// AADT color scale: green (low traffic) → yellow → red (high traffic)
function aadtColor(aadt: number): string {
  // Rough thresholds: <5k = green, 5k-20k = yellow, 20k-50k = orange, >50k = red
  if (aadt < 5000) return '#22c55e';   // green-500
  if (aadt < 20000) return '#eab308';  // yellow-500
  if (aadt < 50000) return '#f97316';  // orange-500
  return '#ef4444';                    // red-500
}

const TrafficCountLayer: React.FC<TrafficCountLayerProps> = ({ map, isVisible }) => {
  const { loadGeometry, loadCachedMetrics, classifySegments, fetchMetrics, usageStatus, isLoading, error, clearError } = useStreetLightTraffic();
  const { hasPermission } = usePermissions();

  const canConsumeQuota = hasPermission('can_consume_traffic_quota');

  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  const labelsRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [segments, setSegments] = useState<SegmentWithMetric[]>([]);
  const [aadtMap, setAadtMap] = useState<Map<string, number | null>>(new Map());
  const [dataYearMap, setDataYearMap] = useState<Map<string, string>>(new Map());
  const [billedSet, setBilledSet] = useState<Set<string>>(new Set());
  const [infoPopup, setInfoPopup] = useState<InfoPopup | null>(null);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [classifyResult, setClassifyResult] = useState<Awaited<ReturnType<typeof classifySegments>>>(null);

  const getMapBounds = useCallback((): MapBounds | null => {
    if (!map) return null;
    const b = map.getBounds();
    if (!b) return null;
    return {
      south: b.getSouthWest().lat(),
      west: b.getSouthWest().lng(),
      north: b.getNorthEast().lat(),
      east: b.getNorthEast().lng(),
    };
  }, [map]);

  const clearPolylines = useCallback(() => {
    polylinesRef.current.forEach((pl) => pl.setMap(null));
    polylinesRef.current.clear();
    labelsRef.current.forEach((lbl) => { lbl.map = null; });
    labelsRef.current.clear();
  }, []);

  const renderPolylines = useCallback(
    (segs: SegmentWithMetric[], aadts: Map<string, number | null>, billed: Set<string>) => {
      if (!map) return;

      clearPolylines();

      segs.forEach((seg) => {
        const coords = seg.geometry?.coordinates;
        if (!coords || coords.length < 2) return;

        const path = coords.map(([lng, lat]) => ({ lat, lng }));
        const aadt = aadts.get(seg.id) ?? null;
        // gray = billed but StreetLight returned no data; blue = never queried
        const baseColor = aadt !== null
          ? aadtColor(aadt)
          : billed.has(seg.id) ? '#9ca3af' : '#3b82f6'; // gray-400 vs blue-500

        const polyline = new google.maps.Polyline({
          path,
          map,
          strokeColor: baseColor,
          strokeOpacity: 0.85,
          strokeWeight: 5,
          clickable: true,
        });

        // Hover: highlight yellow
        polyline.addListener('mouseover', () => {
          polyline.setOptions({ strokeColor: '#facc15', strokeWeight: 7, strokeOpacity: 1 });
        });
        polyline.addListener('mouseout', () => {
          polyline.setOptions({ strokeColor: baseColor, strokeWeight: 5, strokeOpacity: 0.85 });
        });

        polyline.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          setInfoPopup({
            segmentId: seg.id,
            position: e.latLng,
            roadName: seg.road_name ?? null,
            roadType: seg.road_type ?? null,
            aadt: aadts.get(seg.id) ?? null,
            dataYear: dataYearMap.get(seg.id) ?? null,
          });
        });

        polylinesRef.current.set(seg.id, polyline);

        // Car-icon pill at midpoint for segments with cached data
        if (aadt !== null) {
          const mid = path[Math.floor(path.length / 2)];
          const aadtText = aadt >= 1000 ? `${Math.round(aadt / 1000)}k` : String(aadt);

          const pill = document.createElement('div');
          pill.style.cssText = [
            'display:inline-flex',
            'align-items:center',
            'gap:4px',
            'padding:3px 9px 3px 7px',
            'background:#FFFFFF',
            `border:2px solid ${baseColor}`,
            'border-radius:14px',
            'font-family:sans-serif',
            'font-size:13px',
            'font-weight:700',
            'color:#002147',
            'box-shadow:0 1px 3px rgba(0,0,0,0.25)',
            'white-space:nowrap',
            'pointer-events:none',
          ].join(';');
          pill.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <path fill="#002147" d="M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z"/>
            </svg>
            <span>${aadtText}</span>
          `;

          const label = new google.maps.marker.AdvancedMarkerElement({
            position: mid,
            map,
            content: pill,
            zIndex: 1,
          });
          labelsRef.current.set(seg.id, label);
        }
      });
    },
    [map, clearPolylines]
  );

  // Load the set of segments that have been billed (regardless of whether StreetLight returned data).
  // Used to color "paid but no data" segments gray so the user doesn't accidentally re-pay.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('streetlight_usage_log')
        .select('checked_segment_ids')
        .eq('response_status', 'success');
      if (cancelled || !data) return;
      const ids = new Set<string>();
      for (const row of data as Array<{ checked_segment_ids: number[] | string[] | null }>) {
        for (const sid of row.checked_segment_ids ?? []) ids.add(String(sid));
      }
      setBilledSet(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  // Minimum zoom level required to query StreetLight (area limit ~1.2km²)
  const MIN_ZOOM = 13;

  const isSafeToQuery = (b: MapBounds): boolean => {
    const zoom = map?.getZoom() ?? 0;
    if (zoom < MIN_ZOOM) return false;
    const latDiff = b.north - b.south;
    const lngDiff = b.east - b.west;
    // Reject very tiny bboxes (< ~50m) — StreetLight rejects them with a 4xx.
    // No upper-zoom cap; the bbox-size check is the real guard and works on wide
    // screens that still have a meaningful viewport at zoom 20+.
    if (latDiff < 0.0005 || lngDiff < 0.0005) return false;
    return latDiff < 0.08 && lngDiff < 0.12; // ~8km × 12km max
  };

  // Load geometry when layer becomes visible
  useEffect(() => {
    if (!isVisible || !map) {
      clearPolylines();
      return;
    }

    const bounds = getMapBounds();
    if (!bounds) return;

    if (!isSafeToQuery(bounds)) return; // too zoomed out

    loadGeometry(bounds).then(async (segs) => {
      setSegments(segs as SegmentWithMetric[]);
      // Immediately hydrate from cache — no extra API cost
      const ids = segs.map(s => s.id);
      const cached = await loadCachedMetrics(ids);
      if (Object.keys(cached).length > 0) {
        setAadtMap(prev => {
          const next = new Map(prev);
          Object.entries(cached).forEach(([id, aadt]) => next.set(id, aadt));
          return next;
        });
        setDataYearMap(prev => {
          const next = new Map(prev);
          Object.keys(cached).forEach(id => next.set(id, '2022 annual avg'));
          return next;
        });
      }
      renderPolylines(segs as SegmentWithMetric[], new Map(Object.entries(cached)), billedSet);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, map]);

  // FIX 5: Reload geometry when map pans/zooms (idle fires after movement settles)
  useEffect(() => {
    if (!map || !isVisible) return;
    const listener = map.addListener('idle', () => {
      const bounds = map.getBounds();
      if (!bounds) return;
      const mapBounds: MapBounds = {
        south: bounds.getSouthWest().lat(),
        west: bounds.getSouthWest().lng(),
        north: bounds.getNorthEast().lat(),
        east: bounds.getNorthEast().lng(),
      };
      if (!isSafeToQuery(mapBounds)) {
        clearPolylines();
        clearError(); // drop any stale "non-2xx" message from a previous bad bounds
        return;
      }
      loadGeometry(mapBounds).then(async (segs) => {
        setSegments(segs as SegmentWithMetric[]);
        const ids = segs.map(s => s.id);
        const cached = await loadCachedMetrics(ids);
        const mergedAadt = new Map(aadtMap);
        Object.entries(cached).forEach(([id, aadt]) => mergedAadt.set(id, aadt));
        setAadtMap(mergedAadt);
        if (Object.keys(cached).length > 0) {
          setDataYearMap(prev => {
            const next = new Map(prev);
            Object.keys(cached).forEach(id => next.set(id, '2022 annual avg'));
            return next;
          });
        }
        renderPolylines(segs as SegmentWithMetric[], mergedAadt, billedSet);
      });
    });
    return () => google.maps.event.removeListener(listener);
  }, [map, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render polylines when aadtMap or billedSet updates
  useEffect(() => {
    renderPolylines(segments, aadtMap, billedSet);
  }, [segments, aadtMap, billedSet, renderPolylines]);

  // Close polylines when hidden
  useEffect(() => {
    if (!isVisible) clearPolylines();
  }, [isVisible, clearPolylines]);

  // Info popup via InfoWindow
  useEffect(() => {
    if (!map) return;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow();
    }

    if (!infoPopup) {
      infoWindowRef.current.close();
      return;
    }

    let cancelled = false;

    (async () => {
      // Always re-check DB cache before showing a paid prompt, in case state is stale
      let resolvedAadt = infoPopup.aadt ?? aadtMap.get(infoPopup.segmentId) ?? null;
      let resolvedYear = infoPopup.dataYear ?? dataYearMap.get(infoPopup.segmentId) ?? null;

      if (resolvedAadt === null || resolvedAadt === undefined) {
        const segIdNum = parseInt(infoPopup.segmentId, 10);
        if (!isNaN(segIdNum)) {
          const { data: cacheRow } = await supabase
            .from('streetlight_segment_metrics')
            .select('aadt, year_month')
            .eq('segment_id', segIdNum)
            .order('year_month', { ascending: false })
            .limit(1)
            .maybeSingle();
          if (cacheRow?.aadt !== undefined && cacheRow?.aadt !== null) {
            resolvedAadt = cacheRow.aadt;
            resolvedYear = cacheRow.year_month ?? resolvedYear;
            setAadtMap(prev => new Map(prev).set(infoPopup.segmentId, cacheRow.aadt));
            if (cacheRow.year_month) {
              setDataYearMap(prev => new Map(prev).set(infoPopup.segmentId, cacheRow.year_month));
            }
          }
        }
      }

      if (cancelled) return;

      const hasData = resolvedAadt !== null && resolvedAadt !== undefined;
      const wasBilled = billedSet.has(infoPopup.segmentId);
      const fetchBtn = !hasData && canConsumeQuota
        ? wasBilled
          ? `<button id="stl-fetch-btn" style="margin-top:8px;width:100%;padding:5px 10px;background:#6b7280;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Retry (no charge if still no data)</button>`
          : `<button id="stl-fetch-btn" style="margin-top:8px;width:100%;padding:5px 10px;background:#3b82f6;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Fetch traffic data ($0.50)</button>`
        : '';

      const advancedBtn = hasData && canConsumeQuota
        ? `<details style="margin-top:8px;font-size:11px;color:#6b7280">
            <summary style="cursor:pointer;color:#3b82f6;font-weight:600">Advanced options (additional cost)</summary>
            <div style="margin-top:6px;padding:6px;background:#f9fafb;border-radius:4px">
              <div style="margin-bottom:4px"><strong>Direction:</strong>
                <select id="stl-direction" style="margin-left:4px;font-size:11px">
                  <option value="bidirectional">Both directions</option>
                  <option value="with">With flow</option>
                  <option value="against">Against flow</option>
                </select>
              </div>
              <div style="margin-bottom:6px"><strong>Time period:</strong>
                <select id="stl-daypart" style="margin-left:4px;font-size:11px">
                  <option value="all">All day (default)</option>
                  <option value="6">6am – 7am</option>
                  <option value="7">7am – 8am</option>
                  <option value="8">8am – 9am</option>
                  <option value="9">9am – 10am</option>
                  <option value="10">10am – 11am</option>
                  <option value="11">11am – 12pm</option>
                  <option value="12">12pm – 1pm</option>
                  <option value="13">1pm – 2pm</option>
                  <option value="14">2pm – 3pm</option>
                  <option value="15">3pm – 4pm</option>
                  <option value="16">4pm – 5pm</option>
                  <option value="17">5pm – 6pm</option>
                  <option value="18">6pm – 7pm</option>
                  <option value="19">7pm – 8pm</option>
                  <option value="20">8pm – 9pm</option>
                </select>
                <div style="margin-top:4px;color:#9ca3af;font-size:10px">SATC supports All Day or a single hour (0–23). For a custom range like 6–11am, fetch each hour separately and average (each billed).</div>
              </div>
              <button id="stl-advanced-btn" style="width:100%;padding:4px 8px;background:#f59e0b;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">Fetch with these options</button>
              <div style="margin-top:4px;color:#9ca3af;font-size:10px">⚠️ Cost multiplies by dimensions selected</div>
            </div>
          </details>`
        : '';

      const aadtDisplay = typeof resolvedAadt === 'number' ? resolvedAadt.toLocaleString() : '';
      const content = `
        <div style="font-family:sans-serif;font-size:13px;line-height:1.5;min-width:200px">
          <div style="font-weight:600;margin-bottom:2px">${infoPopup.roadName ?? 'Road Segment'}</div>
          ${infoPopup.roadType ? `<div style="color:#6b7280;font-size:11px;text-transform:capitalize">${infoPopup.roadType}</div>` : ''}
          <div style="margin-top:6px">
            ${hasData
              ? `<div><span style="font-weight:600;font-size:15px">${aadtDisplay}</span> <span style="color:#6b7280">vehicles/day</span></div>
                 <div style="font-size:11px;color:#9ca3af;margin-top:2px">Source: StreetLight • ${resolvedYear ?? '2022 annual avg'}</div>`
              : wasBilled
                ? '<span style="color:#9ca3af">Already queried — no data available from StreetLight</span>'
                : '<span style="color:#9ca3af">No traffic data cached</span>'
            }
          </div>
          ${fetchBtn}
          ${advancedBtn}
        </div>
      `;

      infoWindowRef.current!.setContent(content);
      infoWindowRef.current!.setPosition(infoPopup.position);
      infoWindowRef.current!.open(map);

      // Wire up the fetch button inside the InfoWindow DOM
      setTimeout(() => {
        const btn = document.getElementById('stl-fetch-btn');
        if (btn) {
          btn.onclick = async () => {
            btn.textContent = 'Fetching…';
            btn.setAttribute('disabled', 'true');
            try {
              const result = await fetchMetrics([infoPopup.segmentId]);
              // Mark as billed so we never show the $0.50 prompt for it again, even if no data came back
              setBilledSet(prev => new Set(prev).add(infoPopup.segmentId));
              if (result?.metrics?.length) {
                const m = result.metrics[0] as { segment_id: string; aadt?: number };
                if (m.aadt !== undefined) {
                  setAadtMap(prev => new Map(prev).set(infoPopup.segmentId, m.aadt ?? null));
                  setDataYearMap(prev => new Map(prev).set(infoPopup.segmentId, '2022 annual avg'));
                  infoWindowRef.current?.close();
                }
              }
            } catch {
              btn.textContent = 'Error — try again';
            }
          };
        }

        const advBtn = document.getElementById('stl-advanced-btn');
        if (advBtn) {
          advBtn.onclick = async () => {
            const dpEl = document.getElementById('stl-daypart') as HTMLSelectElement | null;
            const dirEl = document.getElementById('stl-direction') as HTMLSelectElement | null;
            const dayPart = dpEl?.value ?? 'all';
            const direction = dirEl?.value ?? 'bidirectional';
            advBtn.textContent = 'Fetching…';
            advBtn.setAttribute('disabled', 'true');
            try {
              const result = await fetchMetrics([infoPopup.segmentId], { day_part: dayPart, direction });
              setBilledSet(prev => new Set(prev).add(infoPopup.segmentId));
              if (result?.metrics?.length) {
                const m = result.metrics[0] as { segment_id: string; aadt?: number };
                if (m.aadt !== undefined && dayPart === 'all' && direction === 'bidirectional') {
                  // Only update the displayed AADT for the default all-day/bidirectional case;
                  // narrower dimensions are stored separately and shouldn't overwrite the headline.
                  setAadtMap(prev => new Map(prev).set(infoPopup.segmentId, m.aadt ?? null));
                }
                infoWindowRef.current?.close();
              }
            } catch {
              advBtn.textContent = 'Error — try again';
            }
          };
        }
      }, 100);
    })();

    return () => { cancelled = true; };
  }, [map, infoPopup]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLoadAadt = useCallback(async () => {
    // Always use the *current* viewport, not the stale snapshot from when the layer was first enabled.
    // Otherwise zooming in/out after layer activation hits the API with bounds that no longer match what's on screen.
    const bounds = getMapBounds();
    if (!bounds) return;
    if (!isSafeToQuery(bounds)) {
      // Visible-area too large/too zoomed out — guidance is already shown in the legend.
      return;
    }
    const result = await classifySegments(bounds);
    setClassifyResult(result);
    setShowSpendModal(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getMapBounds, classifySegments, map]);

  const handleMetricsFetched = useCallback(
    (newAadts: Record<string, number | null>) => {
      setDataYearMap((prev) => {
        const next = new Map(prev);
        Object.keys(newAadts).forEach((id) => next.set(id, '2022 annual avg'));
        return next;
      });
      setAadtMap((prev) => {
        const next = new Map(prev);
        Object.entries(newAadts).forEach(([id, aadt]) => next.set(id, aadt));
        return next;
      });
    },
    []
  );

  if (!isVisible) return null;

  const segmentsWithAadt = segments.filter((s) => aadtMap.has(s.id) && aadtMap.get(s.id) !== null).length;
  const totalSegments = segments.length;

  return (
    <>
      {/* Legend / controls overlay */}
      <div
        style={{
          position: 'absolute',
          bottom: 120,
          right: 12,
          zIndex: 10,
          background: 'rgba(255,255,255,0.95)',
          borderRadius: 8,
          padding: '10px 14px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
          minWidth: 200,
          fontSize: 13,
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 6 }}>🚗 Traffic Count (AADT)</div>

        {(map?.getZoom() ?? 0) < MIN_ZOOM && (
          <div style={{ color: '#f59e0b', marginBottom: 6 }}>⚠️ Zoom in to load road segments</div>
        )}
        {isLoading && (
          <div style={{ color: '#6b7280', marginBottom: 6 }}>Loading segments…</div>
        )}
        {error && (
          <div style={{ color: '#ef4444', marginBottom: 6 }}>{error}</div>
        )}

        <div style={{ marginBottom: 8 }}>
          {(() => {
            const z = map?.getZoom() ?? 0;
            const b = getMapBounds();
            if (z < MIN_ZOOM) return 'Zoom in to street level to see traffic data';
            if (b && (b.north - b.south < 0.0005 || b.east - b.west < 0.0005)) {
              return 'Zoom out a bit to see traffic data';
            }
            return `${segmentsWithAadt} of ${totalSegments} segments have AADT data`;
          })()}
        </div>

        {/* Color scale legend */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ width: 16, height: 4, borderRadius: 2, background: '#22c55e' }} />
          <span style={{ color: '#6b7280' }}>Low</span>
          <div style={{ width: 16, height: 4, borderRadius: 2, background: '#eab308' }} />
          <div style={{ width: 16, height: 4, borderRadius: 2, background: '#f97316' }} />
          <div style={{ width: 16, height: 4, borderRadius: 2, background: '#ef4444' }} />
          <span style={{ color: '#6b7280' }}>High</span>
          <div style={{ width: 16, height: 4, borderRadius: 2, background: '#9ca3af' }} />
          <span style={{ color: '#6b7280' }}>No data</span>
        </div>

        {canConsumeQuota && (() => {
          const currentBounds = getMapBounds();
          const canQuery = currentBounds ? isSafeToQuery(currentBounds) : false;
          const disabled = isLoading || !canQuery;
          return (
            <button
              onClick={handleLoadAadt}
              disabled={disabled}
              title={!canQuery ? 'Zoom in to street level to enable' : undefined}
              style={{
                background: '#3b82f6',
                color: '#fff',
                border: 'none',
                borderRadius: 6,
                padding: '6px 12px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: 600,
                fontSize: 13,
                opacity: disabled ? 0.6 : 1,
                width: '100%',
              }}
            >
              Load AADT for Visible Area
            </button>
          );
        })()}
      </div>

      {showSpendModal && classifyResult && (
        <TrafficSpendModal
          classifyResult={classifyResult}
          remainingQuota={usageStatus && 'annual_segment_quota' in usageStatus && 'segments_used' in usageStatus
            ? (usageStatus as { annual_segment_quota: number; segments_used: number }).annual_segment_quota
              - (usageStatus as { annual_segment_quota: number; segments_used: number }).segments_used
            : null
          }
          onClose={() => setShowSpendModal(false)}
          onConfirm={async (selectedIds) => {
            setShowSpendModal(false);
            const result = await fetchMetrics(selectedIds);
            if (result?.success && result.metrics) {
              const newAadts: Record<string, number | null> = {};
              result.metrics.forEach((m) => {
                newAadts[m.segment_id] = m.aadt ?? null;
              });
              handleMetricsFetched(newAadts);
            }
          }}
        />
      )}
    </>
  );
};

export default TrafficCountLayer;
