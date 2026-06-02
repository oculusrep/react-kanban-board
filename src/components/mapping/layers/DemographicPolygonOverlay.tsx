import React, { useEffect, useRef } from 'react';

// Phase 3 of demographic-layers: a single ad-hoc polygon for ESRI
// enrichment. When drawingActive is true (and no coordinates yet) the
// component activates google.maps.drawing.DrawingManager in POLYGON
// mode and fires onComplete with the GeoJSON-style ring coordinates.
// Otherwise it renders the saved polygon as a static overlay.
//
// Uses Steel Blue to distinguish from rings (Midnight) and isochrones
// (Midnight → Slate gradient).

const BRAND_STEEL = '#4A6B94';

export interface DemographicPolygonOverlayProps {
  map: google.maps.Map | null;
  drawingActive: boolean;
  // GeoJSON-style polygon coordinates: outer ring first, then holes.
  // Each ring is [[lng, lat], ...]. First/last point of each ring match.
  // null = no polygon yet.
  coordinates: number[][][] | null;
  onComplete: (coordinates: number[][][]) => void;
}

const DemographicPolygonOverlay: React.FC<DemographicPolygonOverlayProps> = ({
  map,
  drawingActive,
  coordinates,
  onComplete,
}) => {
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);

  // Drawing mode: activate DrawingManager. Tear down when drawing ends
  // or active flag flips off. The drawing library is loaded on demand
  // (the main map loader only requests 'places' and 'geometry').
  useEffect(() => {
    if (!map || !drawingActive || coordinates) {
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
      return;
    }

    let cancelled = false;
    let listener: google.maps.MapsEventListener | null = null;

    (async () => {
      // @ts-expect-error - importLibrary is the v3.55+ dynamic loader.
      await google.maps.importLibrary('drawing');
      if (cancelled) return;

      const dm = new google.maps.drawing.DrawingManager({
        drawingMode: google.maps.drawing.OverlayType.POLYGON,
        drawingControl: false,
        polygonOptions: {
          strokeColor: BRAND_STEEL,
          strokeOpacity: 0.9,
          strokeWeight: 2,
          fillColor: BRAND_STEEL,
          fillOpacity: 0.12,
          clickable: false,
          editable: false,
        },
        map,
      });
      drawingManagerRef.current = dm;

      listener = google.maps.event.addListener(
        dm,
        'polygoncomplete',
        (poly: google.maps.Polygon) => {
          const path = poly.getPath();
          const ring: number[][] = [];
          for (let i = 0; i < path.getLength(); i++) {
            const p = path.getAt(i);
            ring.push([p.lng(), p.lat()]);
          }
          if (ring.length > 0) ring.push([...ring[0]]);

          // Drop the live polygon — the static overlay branch will
          // redraw it once parent stores the coordinates.
          poly.setMap(null);

          dm.setDrawingMode(null);
          onComplete([ring]);
        },
      );
    })();

    return () => {
      cancelled = true;
      if (listener) google.maps.event.removeListener(listener);
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null);
        drawingManagerRef.current = null;
      }
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
      strokeColor: BRAND_STEEL,
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: BRAND_STEEL,
      fillOpacity: 0.12,
      clickable: false,
      zIndex: 300,
    });

    return () => {
      if (polygonRef.current) {
        polygonRef.current.setMap(null);
        polygonRef.current = null;
      }
    };
  }, [map, coordinates]);

  return null;
};

export default DemographicPolygonOverlay;
