import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { supabase } from '../../../lib/supabaseClient';
import StarbucksLicensedStorePopup from '../popups/StarbucksLicensedStorePopup';
import { useLayerManager } from './LayerManager';

export interface StarbucksLicensedStore {
  store_number: string;
  store_name: string | null;
  project_number: string | null;
  lifecycle_status: string | null;
  ownership_type: string | null;
  store_type: string | null;
  actual_open_date: string | null;
  store_age: number | null;
  licensee_name: string | null;
  segment: string | null;
  ls_pipeline_decision_date: string | null;
  ops_district_role: string | null;
  market_name: string | null;
  county_name: string | null;
  address: string | null;
  suite: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  store_sqft: number | null;
}

export interface StarbucksLicensedStoreLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  onPinClick?: (store: StarbucksLicensedStore) => void;
  selectedStoreNumber?: string | null;
  verifyingStoreNumber?: string | null;
  onLocationVerified?: (storeNumber: string, lat: number, lng: number) => void;
  onRightClick?: (store: StarbucksLicensedStore, x: number, y: number) => void;
}

// Map store_type → logo filename. Files live under public/Images/ (served as /Images/...).
const TYPE_ICON_URL: Record<string, string> = {
  'Cafe':       '/Images/LICENSE-CAFE.png',
  'Drive Thru': '/Images/License DT.png',
  'Kiosk':      '/Images/LICENSE-KIOSK.png',
};
const DEFAULT_ICON_URL = '/Images/LICENSE-CAFE.png';

function iconForStore(storeType: string | null, selected = false, verifying = false): google.maps.Icon {
  const url = (storeType && TYPE_ICON_URL[storeType]) || DEFAULT_ICON_URL;
  const size = selected ? 34 : verifying ? 38 : 24;
  return {
    url,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

function effectiveCoords(s: StarbucksLicensedStore): { lat: number; lng: number } | null {
  if (s.verified_latitude != null && s.verified_longitude != null) {
    return { lat: s.verified_latitude, lng: s.verified_longitude };
  }
  if (s.latitude != null && s.longitude != null) {
    return { lat: s.latitude, lng: s.longitude };
  }
  return null;
}

const StarbucksLicensedStoreLayer: React.FC<StarbucksLicensedStoreLayerProps> = ({
  map,
  isVisible,
  onPinClick,
  selectedStoreNumber = null,
  verifyingStoreNumber = null,
  onLocationVerified,
  onRightClick,
}) => {
  const [stores, setStores] = useState<StarbucksLicensedStore[]>([]);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [openPopup, setOpenPopup] = useState<{
    store: StarbucksLicensedStore;
    overlay: google.maps.OverlayView;
  } | null>(null);
  const openPopupRef = useRef<typeof openPopup>(null);
  const isFetchingRef = useRef(false);
  const lastFetchBoundsRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { refreshTrigger } = useLayerManager();
  const layerRefreshTrigger = refreshTrigger.starbucks_licensed_stores || 0;

  useEffect(() => {
    openPopupRef.current = openPopup;
  }, [openPopup]);

  const createPopupOverlay = useCallback(
    (store: StarbucksLicensedStore, position: google.maps.LatLng) => {
      class PopupOverlay extends google.maps.OverlayView {
        private position: google.maps.LatLng;
        private containerDiv: HTMLDivElement | null = null;
        private root: any = null;

        constructor(pos: google.maps.LatLng) {
          super();
          this.position = pos;
        }

        onAdd() {
          this.containerDiv = document.createElement('div');
          this.containerDiv.style.position = 'absolute';
          this.containerDiv.style.zIndex = '1000';
          ['mousedown', 'mouseup', 'click', 'dblclick', 'keydown', 'keyup', 'keypress', 'input', 'wheel'].forEach(evt => {
            this.containerDiv!.addEventListener(evt, e => e.stopPropagation());
          });
          this.root = ReactDOM.createRoot(this.containerDiv);
          this.root.render(
            <StarbucksLicensedStorePopup
              store={store}
              onClose={() => this.onRemove()}
            />
          );
          this.getPanes()?.floatPane.appendChild(this.containerDiv);
        }

        draw() {
          if (!this.containerDiv) return;
          const point = this.getProjection().fromLatLngToDivPixel(this.position);
          if (point) {
            this.containerDiv.style.left = point.x + 'px';
            this.containerDiv.style.top = (point.y - 10) + 'px';
            this.containerDiv.style.transform = 'translate(-50%, -100%)';
          }
        }

        onRemove() {
          if (this.containerDiv) {
            this.root?.unmount();
            this.containerDiv.parentElement?.removeChild(this.containerDiv);
            this.containerDiv = null;
          }
          setOpenPopup(null);
        }
      }
      return new PopupOverlay(position);
    },
    []
  );

  const fetchStores = useCallback(async (forceRefresh = false) => {
    if (!map || isFetchingRef.current) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const boundsKey = `${sw.lat().toFixed(4)},${sw.lng().toFixed(4)},${ne.lat().toFixed(4)},${ne.lng().toFixed(4)}`;
    if (!forceRefresh && lastFetchBoundsRef.current === boundsKey) return;

    isFetchingRef.current = true;
    lastFetchBoundsRef.current = boundsKey;

    try {
      // Fetch rows where EITHER raw or verified coords fall in the bbox.
      const { data, error } = await supabase
        .from('starbucks_licensed_store')
        .select('*')
        .or(
          `and(latitude.gte.${sw.lat()},latitude.lte.${ne.lat()},longitude.gte.${sw.lng()},longitude.lte.${ne.lng()}),` +
          `and(verified_latitude.gte.${sw.lat()},verified_latitude.lte.${ne.lat()},verified_longitude.gte.${sw.lng()},verified_longitude.lte.${ne.lng()})`
        );

      if (error) throw error;
      setStores((data ?? []).filter(s => effectiveCoords(s) !== null));
    } catch (err) {
      console.error('StarbucksLicensedStoreLayer fetch error:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [map]);

  useEffect(() => {
    if (map && isVisible) fetchStores();
    else if (!isVisible) setStores([]);
  }, [map, isVisible]);

  useEffect(() => {
    if (map && isVisible && layerRefreshTrigger > 0) {
      lastFetchBoundsRef.current = null;
      fetchStores(true);
    }
  }, [layerRefreshTrigger]);

  useEffect(() => {
    if (!map || !isVisible) return;
    const listener = map.addListener('idle', () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        if (!openPopupRef.current) fetchStores();
      }, 300);
    });
    return () => {
      google.maps.event.removeListener(listener);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [map, isVisible, fetchStores]);

  useEffect(() => {
    if (!map) return;

    markers.forEach(m => m.setMap(null));

    if (!isVisible) {
      setMarkers([]);
      return;
    }

    const newMarkers: google.maps.Marker[] = stores
      .map(store => {
        const coords = effectiveCoords(store);
        if (!coords) return null;
        const isSelected = selectedStoreNumber === store.store_number;
        const isVerifying = verifyingStoreNumber === store.store_number;

        const marker = new google.maps.Marker({
          position: coords,
          map,
          title: store.store_name || `Store ${store.store_number}`,
          icon: iconForStore(store.store_type, isSelected, isVerifying),
          draggable: isVerifying,
          zIndex: isSelected ? 3000 : isVerifying ? 2000 : 100,
        });

        marker.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (event.domEvent) {
            event.domEvent.stopPropagation();
            event.domEvent.preventDefault?.();
          }
          onPinClick?.(store);
          if (openPopupRef.current) openPopupRef.current.overlay.setMap(null);
          setTimeout(() => {
            const position = new google.maps.LatLng(coords.lat, coords.lng);
            const overlay = createPopupOverlay(store, position);
            overlay.setMap(map);
            setOpenPopup({ store, overlay });
          }, 10);
        });

        if (isVerifying && onLocationVerified) {
          marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
            if (event.latLng) {
              onLocationVerified(store.store_number, event.latLng.lat(), event.latLng.lng());
            }
          });
        }

        if (onRightClick) {
          marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent) {
              event.domEvent.preventDefault();
              event.domEvent.stopPropagation();
              onRightClick(store, event.domEvent.clientX, event.domEvent.clientY);
            }
          });
        }

        return marker;
      })
      .filter((m): m is google.maps.Marker => m !== null);

    setMarkers(newMarkers);
  }, [stores, selectedStoreNumber, verifyingStoreNumber, isVisible, map, createPopupOverlay, onPinClick, onLocationVerified, onRightClick]);

  useEffect(() => {
    return () => {
      markers.forEach(m => m.setMap(null));
    };
  }, []);

  return null;
};

export default StarbucksLicensedStoreLayer;
