import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import StarbucksPopup from '../popups/StarbucksPopup';
import { useLayerManager } from './LayerManager';
import type {
  StarbucksStore,
  StarbucksSnapshot,
  StarbucksStoreWithSnapshot,
} from './StarbucksLayer';

export interface StarbucksAtlasLogosLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  onPinClick?: (store: StarbucksStoreWithSnapshot) => void;
  selectedStoreNumber?: string | null;
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
}

const STARBUCKS_GREEN = '#00704A';

// Maps starbucks_snapshot.store_type → logo file under public/Images/.
// Drop these three PNGs in place and per-type logos will render automatically.
const TYPE_ICON_URL: Record<string, string> = {
  DT: '/Images/SBUX-ATLAS-DT.png',
  Cafe: '/Images/SBUX-ATLAS-CAFE.png',
  DTO: '/Images/SBUX-ATLAS-DTO.png',
};

function createFallbackIcon(selected = false): google.maps.Icon {
  const size = selected ? 28 : 20;
  const color = selected ? '#004E32' : STARBUCKS_GREEN;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

function iconForStore(
  store: StarbucksStoreWithSnapshot,
  selected = false
): google.maps.Icon {
  const storeType = store.latest_snapshot?.store_type ?? null;
  const url = storeType ? TYPE_ICON_URL[storeType] : undefined;
  if (!url) return createFallbackIcon(selected);
  const size = selected ? 40 : 30;
  return {
    url,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

const StarbucksAtlasLogosLayer: React.FC<StarbucksAtlasLogosLayerProps> = ({
  map,
  isVisible,
  onPinClick,
  selectedStoreNumber = null,
  clusterConfig,
}) => {
  const [stores, setStores] = useState<StarbucksStoreWithSnapshot[]>([]);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [openPopup, setOpenPopup] = useState<{
    store: StarbucksStoreWithSnapshot;
    overlay: google.maps.OverlayView;
  } | null>(null);
  const openPopupRef = useRef<typeof openPopup>(null);
  const isFetchingRef = useRef(false);
  const lastFetchBoundsRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { refreshTrigger } = useLayerManager();
  const layerRefreshTrigger = refreshTrigger.starbucks_atlas_logos || 0;

  useEffect(() => { openPopupRef.current = openPopup; }, [openPopup]);

  const createPopupOverlay = useCallback(
    (store: StarbucksStoreWithSnapshot, position: google.maps.LatLng) => {
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
            <StarbucksPopup
              store={store}
              onViewDetails={() => onPinClick?.(store)}
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
    [onPinClick]
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
      const { data: locations, error: locErr } = await supabase
        .from('starbucks_store')
        .select('*')
        .gte('latitude', sw.lat())
        .lte('latitude', ne.lat())
        .gte('longitude', sw.lng())
        .lte('longitude', ne.lng())
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

      if (locErr) throw locErr;
      if (!locations || locations.length === 0) { setStores([]); return; }

      const storeNumbers = (locations as StarbucksStore[]).map(s => s.store_number);

      const { data: snapshots, error: snapErr } = await supabase
        .from('starbucks_snapshot')
        .select('*')
        .in('store_number', storeNumbers)
        .order('snapshot_date', { ascending: false });

      if (snapErr) throw snapErr;

      const latestByStore = new Map<string, StarbucksSnapshot>();
      snapshots?.forEach((snap: StarbucksSnapshot) => {
        if (!latestByStore.has(snap.store_number)) latestByStore.set(snap.store_number, snap);
      });

      setStores((locations as StarbucksStore[]).map(loc => ({
        ...loc,
        latest_snapshot: latestByStore.get(loc.store_number) ?? null,
      })));
    } catch (err: any) {
      console.error('StarbucksAtlasLogosLayer fetch error:', err);
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
    if (!map || !stores.length) return;

    if (clusterer) clusterer.clearMarkers();
    markers.forEach(m => m.setMap(null));

    const newMarkers: google.maps.Marker[] = stores
      .filter(s => s.latitude && s.longitude)
      .map(store => {
        const isSelected = selectedStoreNumber === store.store_number;
        const marker = new google.maps.Marker({
          position: { lat: store.latitude!, lng: store.longitude! },
          map: null,
          title: store.store_name || `Store ${store.store_number}`,
          icon: iconForStore(store, isSelected),
          zIndex: isSelected ? 3000 : 100,
        });

        marker.addListener('click', (event: google.maps.MapMouseEvent) => {
          if (event.domEvent) {
            event.domEvent.stopPropagation();
            event.domEvent.preventDefault?.();
          }
          if (openPopupRef.current) openPopupRef.current.overlay.setMap(null);

          setTimeout(() => {
            const position = new google.maps.LatLng(store.latitude!, store.longitude!);
            const overlay = createPopupOverlay(store, position);
            overlay.setMap(map);
            setOpenPopup({ store, overlay });
            map.panTo(position);
            map.panBy(0, -150);
          }, 10);
        });

        return marker;
      });

    setMarkers(newMarkers);

    const clusteringDisabled = clusterConfig && clusterConfig.minimumClusterSize >= 100;

    if (newMarkers.length > 0) {
      if (clusteringDisabled) {
        if (isVisible) newMarkers.forEach(m => m.setMap(map));
      } else {
        const renderer = {
          render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
            const svg = `
              <svg fill="${STARBUCKS_GREEN}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
                <circle cx="120" cy="120" opacity=".6" r="70" />
                <circle cx="120" cy="120" opacity=".3" r="90" />
                <circle cx="120" cy="120" opacity=".2" r="110" />
                <text x="50%" y="50%" style="fill:#fff" text-anchor="middle" font-size="50" dominant-baseline="middle" font-family="roboto,arial,sans-serif">${count}</text>
              </svg>`;
            return new google.maps.Marker({
              position,
              icon: {
                url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
                scaledSize: new google.maps.Size(45, 45),
              },
              zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
            });
          },
        };
        const newClusterer = new MarkerClusterer({ map, markers: [], renderer });
        setClusterer(newClusterer);
      }
    }
  }, [stores, selectedStoreNumber, map, createPopupOverlay, clusterConfig]);

  useEffect(() => {
    if (!map || !markers.length) return;
    const clusteringDisabled = clusterConfig && clusterConfig.minimumClusterSize >= 100;

    if (isVisible) {
      if (clusteringDisabled || !clusterer) {
        markers.forEach(m => { if (m.getMap() !== map) m.setMap(map); });
      } else {
        clusterer.addMarkers(markers);
      }
    } else {
      clusterer?.clearMarkers();
      markers.forEach(m => m.setMap(null));
    }
  }, [isVisible, markers, clusterer, map, clusterConfig]);

  useEffect(() => {
    return () => {
      clusterer?.clearMarkers();
      markers.forEach(m => m.setMap(null));
    };
  }, []);

  return null;
};

export default StarbucksAtlasLogosLayer;
