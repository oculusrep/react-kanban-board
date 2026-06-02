import React, { useEffect, useRef } from 'react';

// Ephemeral on-map overlay: a center marker + concentric mileage rings.
// Owned by DemographicsAnalysisSlideout; nothing is persisted. Per-ring
// color and global stroke/fill opacities + stroke weight come from the
// slideout's style state so the user can tune the overlay live.

const METERS_PER_MILE = 1609.344;

export interface RingStyle {
  color: string;        // used for both stroke and fill of the ring
  fillOpacity: number;  // 0..1 — applied to all rings
  strokeOpacity: number;
  strokeWeight: number;
}

export interface DemographicRingsOverlayProps {
  map: google.maps.Map | null;
  center: { lat: number; lng: number } | null;
  // Each ring carries its own color; opacity + weight are global to the layer.
  rings: Array<{ miles: number; color: string }>;
  fillOpacity: number;
  strokeOpacity: number;
  strokeWeight: number;
  isVisible: boolean;
}

const DemographicRingsOverlay: React.FC<DemographicRingsOverlayProps> = ({
  map,
  center,
  rings,
  fillOpacity,
  strokeOpacity,
  strokeWeight,
  isVisible,
}) => {
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const markerRef = useRef<google.maps.Marker | null>(null);

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
        fillColor: '#002147',
        fillOpacity: 1,
        strokeColor: '#FFFFFF',
        strokeWeight: 2,
      },
      zIndex: 1000,
    });

    // Largest first so smaller rings draw on top — improves readability.
    const sorted = [...rings].sort((a, b) => b.miles - a.miles);
    sorted.forEach(({ miles, color }) => {
      const circle = new google.maps.Circle({
        center,
        radius: miles * METERS_PER_MILE,
        map,
        strokeColor: color,
        strokeOpacity,
        strokeWeight,
        fillColor: color,
        fillOpacity,
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
    // Stringify rings so deep changes (color edits) trigger rebuild.
  }, [
    map,
    center?.lat,
    center?.lng,
    JSON.stringify(rings),
    fillOpacity,
    strokeOpacity,
    strokeWeight,
    isVisible,
  ]);

  return null;
};

export default DemographicRingsOverlay;
