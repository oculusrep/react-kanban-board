import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { loadMarkerLibrary } from '../utils/advancedMarkers';
import { useLayerManager } from './LayerManager';

/**
 * Interstate exit-number badges (green/white highway-sign style).
 * Data: public.interstate_exit, from OpenStreetMap (© OpenStreetMap contributors).
 * One row per interchange. See docs/INTERSTATE_EXITS_LAYER.md.
 *
 * ~170 rows today, so they load once per toggle-on; badges hide below
 * MIN_ZOOM so the statewide view isn't a wall of green.
 */
interface InterstateExit {
  id: string;
  highway: string;
  exit_ref: string;
  latitude: number;
  longitude: number;
}

interface InterstateExitLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
}

const MIN_ZOOM = 10;
const SIGN_GREEN = '#006B3F';

function buildBadge(exit: InterstateExit): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    `background:${SIGN_GREEN};color:#fff;border:1.5px solid #fff;border-radius:4px;` +
    'box-shadow:0 1px 3px rgba(0,0,0,.45);padding:1px 4px 2px;text-align:center;' +
    'font-family:Arial,Helvetica,sans-serif;line-height:1;cursor:default;white-space:nowrap;';
  const top = document.createElement('div');
  top.textContent = 'EXIT';
  top.style.cssText = 'font-size:7px;font-weight:700;letter-spacing:.06em;';
  const num = document.createElement('div');
  num.textContent = exit.exit_ref;
  num.style.cssText = 'font-size:12px;font-weight:700;margin-top:1px;';
  el.appendChild(top);
  el.appendChild(num);
  return el;
}

const InterstateExitLayer: React.FC<InterstateExitLayerProps> = ({ map, isVisible }) => {
  const [exits, setExits] = useState<InterstateExit[]>([]);
  const [zoomOk, setZoomOk] = useState(false);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);

  const { refreshTrigger } = useLayerManager();
  const layerRefreshTrigger = refreshTrigger.interstate_exits || 0;

  // Load rows when the layer turns on.
  useEffect(() => {
    if (!isVisible) {
      setExits([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('interstate_exit')
        .select('id, highway, exit_ref, latitude, longitude');
      if (cancelled) return;
      if (error) {
        console.error('InterstateExitLayer fetch error:', error);
        return;
      }
      setExits((data ?? []) as InterstateExit[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisible, layerRefreshTrigger]);

  // Track whether the current zoom is close enough to show badges.
  useEffect(() => {
    if (!map || !isVisible) return;
    const update = () => setZoomOk((map.getZoom() ?? 0) >= MIN_ZOOM);
    update();
    const listener = map.addListener('zoom_changed', update);
    return () => google.maps.event.removeListener(listener);
  }, [map, isVisible]);

  // Build badges once per data load; attach/detach with zoom.
  useEffect(() => {
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
    if (!map || !isVisible || exits.length === 0) return;

    let cancelled = false;
    loadMarkerLibrary()
      .then(({ AdvancedMarkerElement }) => {
        if (cancelled) return;
        markersRef.current = exits.map(
          (e) =>
            new AdvancedMarkerElement({
              map: null,
              position: { lat: Number(e.latitude), lng: Number(e.longitude) },
              content: buildBadge(e),
              title: `${e.highway} Exit ${e.exit_ref} (© OpenStreetMap contributors)`,
              zIndex: 50,
            })
        );
        const show = (map.getZoom() ?? 0) >= MIN_ZOOM;
        markersRef.current.forEach((m) => (m.map = show ? map : null));
      })
      .catch((err) => console.error('InterstateExitLayer marker library load failed:', err));

    return () => {
      cancelled = true;
    };
  }, [exits, map, isVisible]);

  useEffect(() => {
    if (!map) return;
    markersRef.current.forEach((m) => (m.map = isVisible && zoomOk ? map : null));
  }, [zoomOk, isVisible, map]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
    };
  }, []);

  return null;
};

export default InterstateExitLayer;
