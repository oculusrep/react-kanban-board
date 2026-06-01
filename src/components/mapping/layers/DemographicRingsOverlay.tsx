import React, { useEffect, useRef } from 'react';

// Ephemeral on-map overlay: a center marker + concentric mileage rings.
// Owned by DemographicsAnalysisSlideout; nothing is persisted. When the
// slideout closes, the parent unmounts this and Google Maps cleans up.

const BRAND_MIDNIGHT = '#002147';
const BRAND_SLATE = '#8FA9C8';
const METERS_PER_MILE = 1609.344;

export interface DemographicRingsOverlayProps {
  map: google.maps.Map | null;
  center: { lat: number; lng: number } | null;
  radiiMiles: number[];
  isVisible: boolean;
}

const DemographicRingsOverlay: React.FC<DemographicRingsOverlayProps> = ({
  map,
  center,
  radiiMiles,
  isVisible,
}) => {
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const markerRef = useRef<google.maps.Marker | null>(null);

  // Rebuild whenever inputs change. Easier than diffing — we never have many circles.
  useEffect(() => {
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }

    if (!map || !center || !isVisible) return;

    markerRef.current = new google.maps.Marker({
      position: center,
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 6,
        fillColor: BRAND_MIDNIGHT,
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
      },
      zIndex: 1000,
    });

    // Sort largest first so smaller rings draw on top — improves readability.
    const sorted = [...radiiMiles].sort((a, b) => b - a);
    sorted.forEach((miles) => {
      const circle = new google.maps.Circle({
        center,
        radius: miles * METERS_PER_MILE,
        map,
        strokeColor: BRAND_MIDNIGHT,
        strokeOpacity: 0.6,
        strokeWeight: 1.5,
        fillColor: BRAND_SLATE,
        fillOpacity: 0.05,
        clickable: false,
        zIndex: 100,
      });
      circlesRef.current.push(circle);
    });

    return () => {
      circlesRef.current.forEach((c) => c.setMap(null));
      circlesRef.current = [];
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
    };
  }, [map, center?.lat, center?.lng, radiiMiles.join(','), isVisible]);

  return null;
};

export default DemographicRingsOverlay;
