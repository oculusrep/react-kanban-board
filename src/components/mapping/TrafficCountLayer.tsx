import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useStreetLightTraffic, type MapBounds, type StreetLightSegment } from '../../hooks/useStreetLightTraffic';
import { usePermissions } from '../../hooks/usePermissions';
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
  const { loadGeometry, classifySegments, fetchMetrics, usageStatus, isLoading, error } = useStreetLightTraffic();
  const { hasPermission } = usePermissions();

  const canConsumeQuota = hasPermission('can_consume_traffic_quota');

  const polylinesRef = useRef<Map<string, google.maps.Polyline>>(new Map());
  const labelsRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [segments, setSegments] = useState<SegmentWithMetric[]>([]);
  const [aadtMap, setAadtMap] = useState<Map<string, number | null>>(new Map());
  const [dataYearMap, setDataYearMap] = useState<Map<string, string>>(new Map());
  const [infoPopup, setInfoPopup] = useState<InfoPopup | null>(null);
  const [showSpendModal, setShowSpendModal] = useState(false);
  const [classifyResult, setClassifyResult] = useState<Awaited<ReturnType<typeof classifySegments>>>(null);
  const [boundsSnapshot, setBoundsSnapshot] = useState<MapBounds | null>(null);

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
    labelsRef.current.forEach((lbl) => lbl.setMap(null));
    labelsRef.current.clear();
  }, []);

  const renderPolylines = useCallback(
    (segs: SegmentWithMetric[], aadts: Map<string, number | null>) => {
      if (!map) return;

      clearPolylines();

      segs.forEach((seg) => {
        const coords = seg.geometry?.coordinates;
        if (!coords || coords.length < 2) return;

        const path = coords.map(([lng, lat]) => ({ lat, lng }));
        const aadt = aadts.get(seg.id) ?? null;
        const baseColor = aadt !== null ? aadtColor(aadt) : '#3b82f6'; // blue-500 for uncached

        const polyline = new google.maps.Polyline({
          path,
          map,
          strokeColor: baseColor,
          strokeOpacity: 0.85,
          strokeWeight: 3,
          clickable: true,
        });

        // Hover: highlight yellow
        polyline.addListener('mouseover', () => {
          polyline.setOptions({ strokeColor: '#facc15', strokeWeight: 5, strokeOpacity: 1 });
        });
        polyline.addListener('mouseout', () => {
          polyline.setOptions({ strokeColor: baseColor, strokeWeight: 3, strokeOpacity: 0.85 });
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

        // Add VPD label at midpoint for segments with cached data
        if (aadt !== null) {
          const mid = path[Math.floor(path.length / 2)];
          const label = new google.maps.Marker({
            position: mid,
            map,
            icon: { url: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', size: new google.maps.Size(1, 1) },
            label: {
              text: aadt >= 1000 ? `${Math.round(aadt / 1000)}k` : String(aadt),
              color: '#1e3a5f',
              fontSize: '10px',
              fontWeight: '700',
            },
            zIndex: 1,
            clickable: false,
          });
          labelsRef.current.set(seg.id, label);
        }
      });
    },
    [map, clearPolylines]
  );

  // Minimum zoom level required to query StreetLight (area limit ~1.2km²)
  const MIN_ZOOM = 13;

  const isSafeToQuery = (b: MapBounds): boolean => {
    const zoom = map?.getZoom() ?? 0;
    if (zoom < MIN_ZOOM) return false;
    // Also guard by area: lat/lng degree difference
    const latDiff = b.north - b.south;
    const lngDiff = b.east - b.west;
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

    setBoundsSnapshot(bounds);

    loadGeometry(bounds).then((segs) => {
      setSegments(segs as SegmentWithMetric[]);
      renderPolylines(segs as SegmentWithMetric[], aadtMap);
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
        return;
      }
      loadGeometry(mapBounds).then((segs) => {
        setSegments(segs as SegmentWithMetric[]);
        renderPolylines(segs as SegmentWithMetric[], aadtMap);
      });
    });
    return () => google.maps.event.removeListener(listener);
  }, [map, isVisible]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-render polylines when aadtMap updates
  useEffect(() => {
    renderPolylines(segments, aadtMap);
  }, [segments, aadtMap, renderPolylines]);

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

    const hasData = infoPopup.aadt !== null;
    const fetchBtn = !hasData && canConsumeQuota
      ? `<button id="stl-fetch-btn" style="margin-top:8px;width:100%;padding:5px 10px;background:#3b82f6;color:white;border:none;border-radius:5px;cursor:pointer;font-size:12px;font-weight:600">Fetch traffic data ($0.50)</button>`
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
                <option value="all">All day</option>
                <option value="6-9">AM peak (6–9am)</option>
                <option value="15-18">PM peak (3–6pm)</option>
                <option value="9-12">Mid-morning</option>
                <option value="12-15">Midday</option>
                <option value="18-21">Evening</option>
                <option value="0-3">Late night</option>
              </select>
            </div>
            <button id="stl-advanced-btn" style="width:100%;padding:4px 8px;background:#f59e0b;color:white;border:none;border-radius:4px;cursor:pointer;font-size:11px;font-weight:600">Fetch with these options</button>
            <div style="margin-top:4px;color:#9ca3af;font-size:10px">⚠️ Cost multiplies by dimensions selected</div>
          </div>
        </details>`
      : '';

    const content = `
      <div style="font-family:sans-serif;font-size:13px;line-height:1.5;min-width:200px">
        <div style="font-weight:600;margin-bottom:2px">${infoPopup.roadName ?? 'Road Segment'}</div>
        ${infoPopup.roadType ? `<div style="color:#6b7280;font-size:11px;text-transform:capitalize">${infoPopup.roadType}</div>` : ''}
        <div style="margin-top:6px">
          ${hasData
            ? `<div><span style="font-weight:600;font-size:15px">${infoPopup.aadt!.toLocaleString()}</span> <span style="color:#6b7280">vehicles/day</span></div>
               <div style="font-size:11px;color:#9ca3af;margin-top:2px">Source: StreetLight • ${infoPopup.dataYear ?? '2022 annual avg'}</div>`
            : '<span style="color:#9ca3af">No traffic data cached</span>'
          }
        </div>
        ${fetchBtn}
        ${advancedBtn}
      </div>
    `;

    infoWindowRef.current.setContent(content);
    infoWindowRef.current.setPosition(infoPopup.position);
    infoWindowRef.current.open(map);

    // Wire up the fetch button inside the InfoWindow DOM
    setTimeout(() => {
      const btn = document.getElementById('stl-fetch-btn');
      if (btn) {
        btn.onclick = async () => {
          btn.textContent = 'Fetching…';
          btn.setAttribute('disabled', 'true');
          try {
            const result = await fetchMetrics([infoPopup.segmentId]);
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
    }, 100);
  }, [map, infoPopup]);

  const handleLoadAadt = useCallback(async () => {
    const bounds = boundsSnapshot ?? getMapBounds();
    if (!bounds) return;
    const result = await classifySegments(bounds);
    setClassifyResult(result);
    setShowSpendModal(true);
  }, [boundsSnapshot, getMapBounds, classifySegments]);

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
          {(map?.getZoom() ?? 0) < MIN_ZOOM
            ? 'Zoom to street level to see traffic data'
            : `${segmentsWithAadt} of ${totalSegments} segments have AADT data`}
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

        {canConsumeQuota && (
          <button
            onClick={handleLoadAadt}
            disabled={isLoading}
            style={{
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              fontSize: 13,
              opacity: isLoading ? 0.6 : 1,
              width: '100%',
            }}
          >
            Load AADT for Visible Area
          </button>
        )}
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
