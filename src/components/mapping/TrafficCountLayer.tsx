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
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [segments, setSegments] = useState<SegmentWithMetric[]>([]);
  const [aadtMap, setAadtMap] = useState<Map<string, number | null>>(new Map());
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
        const strokeColor = aadt !== null ? aadtColor(aadt) : '#9ca3af'; // gray-400

        const polyline = new google.maps.Polyline({
          path,
          map,
          strokeColor,
          strokeOpacity: 0.85,
          strokeWeight: 3,
          clickable: true,
        });

        polyline.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (!e.latLng) return;
          setInfoPopup({
            segmentId: seg.id,
            position: e.latLng,
            roadName: seg.road_name ?? null,
            roadType: seg.road_type ?? null,
            aadt: aadts.get(seg.id) ?? null,
          });
        });

        polylinesRef.current.set(seg.id, polyline);
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

    const content = `
      <div style="font-family:sans-serif;font-size:13px;line-height:1.5;min-width:160px">
        <div style="font-weight:600;margin-bottom:4px">${infoPopup.roadName ?? 'Road Segment'}</div>
        ${infoPopup.roadType ? `<div style="color:#6b7280">${infoPopup.roadType}</div>` : ''}
        <div style="margin-top:6px">
          ${infoPopup.aadt !== null
            ? `<span style="font-weight:600">AADT:</span> ${infoPopup.aadt.toLocaleString()}`
            : '<span style="color:#9ca3af">No AADT data yet</span>'
          }
        </div>
      </div>
    `;

    infoWindowRef.current.setContent(content);
    infoWindowRef.current.setPosition(infoPopup.position);
    infoWindowRef.current.open(map);
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
          left: 12,
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
