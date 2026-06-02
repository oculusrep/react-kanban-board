import React, { useEffect, useRef } from 'react';
import type { IsochronePolygon } from '../../../hooks/usePropertyGeoenrichment';

// Phase 2 of the demographic-layers feature. Renders ESRI drive-time
// isochrone polygons returned by the geoenrich edge function. Per-band
// color comes from the slideout's style state; opacities + stroke
// weight are global to the layer.

export interface DemographicIsochronesOverlayProps {
  map: google.maps.Map | null;
  isochrones: Record<string, IsochronePolygon> | null;
  // Each selected drive time carries its own color.
  bands: Array<{ minutes: number; color: string }>;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWeight: number;
  isVisible: boolean;
}

const DemographicIsochronesOverlay: React.FC<DemographicIsochronesOverlayProps> = ({
  map,
  isochrones,
  bands,
  fillOpacity,
  strokeOpacity,
  strokeWeight,
  isVisible,
}) => {
  const polygonsRef = useRef<google.maps.Polygon[]>([]);

  useEffect(() => {
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    if (!map || !isochrones || !isVisible || bands.length === 0) return;

    // Largest band first so the shortest band lands on top.
    const sorted = [...bands].sort((a, b) => b.minutes - a.minutes);

    sorted.forEach(({ minutes, color }, idxFromOutside) => {
      const key = `${minutes}min_drive`;
      const iso = isochrones[key];
      if (!iso || !iso.coordinates || iso.coordinates.length === 0) return;

      const paths = iso.coordinates.map((ring) =>
        ring.map(([lng, lat]) => ({ lat, lng })),
      );

      const polygon = new google.maps.Polygon({
        paths,
        map,
        strokeColor: color,
        strokeOpacity,
        strokeWeight,
        fillColor: color,
        fillOpacity,
        clickable: false,
        zIndex: 200 + idxFromOutside,
      });
      polygonsRef.current.push(polygon);
    });

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [
    map,
    isochrones,
    JSON.stringify(bands),
    fillOpacity,
    strokeOpacity,
    strokeWeight,
    isVisible,
  ]);

  return null;
};

export default DemographicIsochronesOverlay;
