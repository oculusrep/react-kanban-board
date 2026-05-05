import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import StarbucksPopup from '../popups/StarbucksPopup';
import { useLayerManager } from './LayerManager';

export interface StarbucksStore {
  store_number: string;
  store_name: string | null;
  city: string | null;
  county: string | null;
  market: string | null;
  latitude: number | null;
  longitude: number | null;
  open_date: string | null;
  relo_date: string | null;
}

export interface StarbucksSnapshot {
  id: string;
  store_number: string;
  snapshot_date: string;
  ops_area: string | null;
  store_type: string | null;
  deal_type: string | null;
  store_age: number | null;
  sf: number | null;
  lease_exp_date: string | null;
  optns_remain: number | null;
  next_option_type: string | null;
  annual_rent: number | null;
  landlord: string | null;
  rent_pct_of_sales: number | null;
  rtm_sales: number | null;
  rtm_contribution: number | null;
  rtm_cash_flow: number | null;
  tc_pct: number | null;
  cash_tc_pct: number | null;
  aws_last_12_wks: number | null;
  sales_channel_mix: string | null;
  r52_sales_otw: number | null;
  lhi_depreciation: number | null;
}

export type StarbucksStoreWithSnapshot = StarbucksStore & {
  latest_snapshot: StarbucksSnapshot | null;
};

export interface StarbucksLayerProps {
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
const STARBUCKS_GREEN_DARK = '#004E32';

function createStarbucksMarkerIcon(selected = false): google.maps.Icon {
  const size = selected ? 24 : 16;
  const color = selected ? STARBUCKS_GREEN_DARK : STARBUCKS_GREEN;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

const StarbucksLayer: React.FC<StarbucksLayerProps> = ({
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
  const starbucksRefreshTrigger = refreshTrigger.starbucks || 0;

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

      const storeNumbers = locations.map(s => s.store_number);

      // Fetch latest snapshot per store
      const { data: snapshots, error: snapErr } = await supabase
        .from('starbucks_snapshot')
        .select('*')
        .in('store_number', storeNumbers)
        .order('snapshot_date', { ascending: false });

      if (snapErr) throw snapErr;

      // Keep only the latest snapshot per store
      const latestByStore = new Map<string, StarbucksSnapshot>();
      snapshots?.forEach(snap => {
        if (!latestByStore.has(snap.store_number)) latestByStore.set(snap.store_number, snap);
      });

      setStores(locations.map(loc => ({
        ...loc,
        latest_snapshot: latestByStore.get(loc.store_number) ?? null,
      })));
    } catch (err: any) {
      console.error('StarbucksLayer fetch error:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [map]);

  // Load on visibility
  useEffect(() => {
    if (map && isVisible) fetchStores();
    else if (!isVisible) setStores([]);
  }, [map, isVisible]);

  // Refresh trigger
  useEffect(() => {
    if (map && isVisible && starbucksRefreshTrigger > 0) {
      lastFetchBoundsRef.current = null;
      fetchStores(true);
    }
  }, [starbucksRefreshTrigger]);

  // Reload on map idle
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

  // Create markers
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
          icon: createStarbucksMarkerIcon(isSelected),
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

  // Visibility toggle
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

  // Cleanup
  useEffect(() => {
    return () => {
      clusterer?.clearMarkers();
      markers.forEach(m => m.setMap(null));
    };
  }, []);

  return null;
};

export default StarbucksLayer;
