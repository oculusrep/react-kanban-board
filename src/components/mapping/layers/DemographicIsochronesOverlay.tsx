import React, { useEffect, useRef } from 'react';
import type { IsochronePolygon } from '../../../hooks/usePropertyGeoenrichment';

// Phase 2 of the demographic-layers feature. Renders ESRI drive-time
// isochrone polygons returned by the geoenrich edge function. Stroke-only
// (no fill) so overlapping polygons stay legible.
//
// Color per drive-time band — shortest = darkest, longest = lightest —
// matches the OVIS brand gradient (#002147 → #4A6B94 → #8FA9C8).

const BAND_COLORS = ['#002147', '#4A6B94', '#8FA9C8'];

export interface DemographicIsochronesOverlayProps {
  map: google.maps.Map | null;
  isochrones: Record<string, IsochronePolygon> | null;
  // Only render polygons for these drive times (minutes). Hides bands the
  // user has un-checked even if the API returned them.
  selectedDriveTimes: number[];
  isVisible: boolean;
}

const DemographicIsochronesOverlay: React.FC<DemographicIsochronesOverlayProps> = ({
  map,
  isochrones,
  selectedDriveTimes,
  isVisible,
}) => {
  const polygonsRef = useRef<google.maps.Polygon[]>([]);

  useEffect(() => {
    polygonsRef.current.forEach((p) => p.setMap(null));
    polygonsRef.current = [];

    if (!map || !isochrones || !isVisible || selectedDriveTimes.length === 0) {
      return;
    }

    // Shortest band on top so it's not obscured by larger ones.
    const sorted = [...selectedDriveTimes].sort((a, b) => b - a);

    sorted.forEach((minutes, idxFromOutside) => {
      const key = `${minutes}min_drive`;
      const iso = isochrones[key];
      if (!iso || !iso.coordinates || iso.coordinates.length === 0) return;

      // Pick color so shortest time gets the darkest color regardless of
      // how many bands were selected.
      const colorIndex = sorted.length - 1 - idxFromOutside;
      const color = BAND_COLORS[Math.min(colorIndex, BAND_COLORS.length - 1)];

      // GeoJSON Polygon: outer ring first, then any holes. Google Maps
      // accepts an array of LatLng paths per ring.
      const paths = iso.coordinates.map((ring) =>
        ring.map(([lng, lat]) => ({ lat, lng })),
      );

      const polygon = new google.maps.Polygon({
        paths,
        map,
        strokeColor: color,
        strokeOpacity: 0.85,
        strokeWeight: 2,
        fillOpacity: 0,
        clickable: false,
        zIndex: 200 + colorIndex,
      });
      polygonsRef.current.push(polygon);
    });

    return () => {
      polygonsRef.current.forEach((p) => p.setMap(null));
      polygonsRef.current = [];
    };
  }, [map, isochrones, selectedDriveTimes.join(','), isVisible]);

  return null;
};

export default DemographicIsochronesOverlay;
