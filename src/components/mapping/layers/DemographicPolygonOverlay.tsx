import React, { useEffect, useRef } from 'react';

// Phase 3 of demographic-layers: a single ad-hoc polygon for ESRI
// enrichment. When drawingActive is true (and no coordinates yet) the
// component lets the user draw a polygon by clicking vertices on the map
// (double-click to finish) and fires onComplete with the GeoJSON-style ring
// coordinates. Otherwise it renders the saved polygon as a static overlay.
// Color + opacity + stroke weight come from the slideout's style state.

export interface DemographicPolygonOverlayProps {
  map: google.maps.Map | null;
  drawingActive: boolean;
  // GeoJSON-style polygon coordinates: outer ring first, then holes.
  // Each ring is [[lng, lat], ...]. First/last point of each ring match.
  // null = no polygon yet.
  coordinates: number[][][] | null;
  color: string;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWeight: number;
  onComplete: (coordinates: number[][][]) => void;
}

const DemographicPolygonOverlay: React.FC<DemographicPolygonOverlayProps> = ({
  map,
  drawingActive,
  coordinates,
  color,
  fillOpacity,
  strokeOpacity,
  strokeWeight,
  onComplete,
}) => {
  const drawPointsRef = useRef<google.maps.LatLng[]>([]);
  const drawPolygonRef = useRef<google.maps.Polygon | null>(null);
  const drawListenersRef = useRef<google.maps.MapsEventListener[]>([]);
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  // Drawing mode: collect vertices from map clicks and finish on double-click.
  // (google.maps.drawing.DrawingManager was removed in Maps JS 3.65, so we build the polygon
  // manually.) Tear down when drawing ends or the active flag flips off.
  useEffect(() => {
    const teardown = () => {
      drawListenersRef.current.forEach(l => google.maps.event.removeListener(l));
      drawListenersRef.current = [];
      if (drawPolygonRef.current) {
        drawPolygonRef.current.setMap(null);
        drawPolygonRef.current = null;
      }
      drawPointsRef.current = [];
    };

    if (!map || !drawingActive || coordinates) {
      teardown();
      return;
    }

    drawPointsRef.current = [];
    drawPolygonRef.current = new google.maps.Polygon({
      paths: [],
      strokeColor: color,
      strokeOpacity,
      strokeWeight,
      fillColor: color,
      fillOpacity,
      clickable: false,
      map,
    });

    // Suppress the map's double-click-to-zoom while drawing, since we use double-click to finish.
    const prevDoubleClickZoom = map.get('disableDoubleClickZoom');
    map.setOptions({ disableDoubleClickZoom: true });

    const restoreZoom = () => map.setOptions({ disableDoubleClickZoom: prevDoubleClickZoom ?? false });

    const finish = () => {
      const pts = drawPointsRef.current;
      if (pts.length < 3) return;
      const ring: number[][] = pts.map(p => [p.lng(), p.lat()]);
      ring.push([...ring[0]]); // close the ring
      teardown();
      restoreZoom();
      onComplete([ring]);
    };

    const clickL = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      drawPointsRef.current = [...drawPointsRef.current, e.latLng];
      drawPolygonRef.current?.setPath(drawPointsRef.current);
    });

    const dblClickL = map.addListener('dblclick', () => {
      // A double-click is preceded by two 'click' events at ~the same spot; drop the duplicate
      // trailing vertex before finishing.
      const pts = drawPointsRef.current;
      if (pts.length >= 2) {
        const a = pts[pts.length - 1];
        const b = pts[pts.length - 2];
        if (Math.abs(a.lat() - b.lat()) < 1e-6 && Math.abs(a.lng() - b.lng()) < 1e-6) {
          drawPointsRef.current = pts.slice(0, -1);
        }
      }
      finish();
    });

    drawListenersRef.current = [clickL, dblClickL];

    return () => {
      teardown();
      restoreZoom();
    };
  }, [map, drawingActive, !!coordinates]);

  // Static-polygon mode: render coordinates as a non-editable overlay.
  useEffect(() => {
    if (polygonRef.current) {
      polygonRef.current.setMap(null);
      polygonRef.current = null;
    }

    if (!map || !coordinates || coordinates.length === 0) return;

    const paths = coordinates.map((ring) => ring.map(([lng, lat]) => ({ lat, lng })));
    polygonRef.current = new google.maps.Polygon({
      paths,
      map,
      strokeColor: color,
      strokeOpacity,
      strokeWeight,
      fillColor: color,
      fillOpacity,
      clickable: false,
      zIndex: 300,
    });

    return () => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
    };
  }, [map, coordinates, color, fillOpacity, strokeOpacity, strokeWeight]);

  return null;
};

export default DemographicPolygonOverlay;
