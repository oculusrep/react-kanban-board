import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import ReactDOM from 'react-dom/client';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import MerchantPopup from '../popups/MerchantPopup';
import { loadMarkerLibrary } from '../utils/advancedMarkers';

export interface MerchantBrand {
  id: string;
  name: string;
  logo_url: string | null;
  category_id: string | null;
}

export interface MerchantLocationRow {
  id: string;
  brand_id: string;
  google_place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  formatted_address: string | null;
  phone: string | null;
  website: string | null;
  business_status: string;
  last_verified_at: string | null;
}

export type MerchantLocationWithBrand = MerchantLocationRow & {
  brand: MerchantBrand;
};

interface MerchantLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  selectedBrandIds: Set<string>;
  showClosed?: boolean;
}

const PIN_SIZE = 28; // px — fixed for v1; zoom-scaled sizing deferred
const MERCHANT_PIN_STYLE_ID = 'merchant-pin-style';

function ensurePinStyle() {
  if (document.getElementById(MERCHANT_PIN_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = MERCHANT_PIN_STYLE_ID;
  style.textContent = `
    .merchant-pin {
      cursor: pointer;
      transition: transform 0.15s ease-out;
    }
    .merchant-pin:hover { transform: scale(1.18); }
    .merchant-pin img {
      display: block;
      height: ${PIN_SIZE}px;
      width: auto;
      max-width: 64px;
      filter:
        drop-shadow(0 0 2px white)
        drop-shadow(0 0 2px white)
        drop-shadow(0 1px 2px rgba(0,0,0,0.35));
      pointer-events: none;
    }
    .merchant-pin.closed-perm img {
      filter:
        grayscale(1)
        drop-shadow(0 0 2px white)
        drop-shadow(0 0 2px white);
      opacity: 0.7;
    }
    .merchant-pin.closed-temp img {
      filter:
        saturate(0.6)
        drop-shadow(0 0 2px white)
        drop-shadow(0 0 2px white);
    }
    .merchant-pin-fallback {
      width: ${PIN_SIZE}px;
      height: ${PIN_SIZE}px;
      border-radius: 50%;
      background: #002147;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: system-ui, sans-serif;
      font-weight: 600;
      font-size: 14px;
      box-shadow: 0 0 0 2px white, 0 1px 3px rgba(0,0,0,0.35);
    }
  `;
  document.head.appendChild(style);
}

function buildPinContent(loc: MerchantLocationWithBrand): HTMLElement {
  const container = document.createElement('div');
  container.className = 'merchant-pin';
  if (loc.business_status === 'CLOSED_PERMANENTLY') container.classList.add('closed-perm');
  else if (loc.business_status === 'CLOSED_TEMPORARILY') container.classList.add('closed-temp');

  if (loc.brand.logo_url) {
    const img = document.createElement('img');
    img.src = loc.brand.logo_url;
    img.alt = loc.brand.name;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer-when-downgrade';
    img.onerror = () => {
      container.innerHTML = '';
      container.appendChild(buildFallbackPin(loc.brand.name));
    };
    container.appendChild(img);
  } else {
    container.appendChild(buildFallbackPin(loc.brand.name));
  }

  return container;
}

function buildFallbackPin(brandName: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'merchant-pin-fallback';
  el.textContent = (brandName?.[0] || '?').toUpperCase();
  return el;
}

function buildClusterIcon(count: number): HTMLElement {
  const div = document.createElement('div');
  div.style.cssText = `
    width: 44px; height: 44px; border-radius: 50%;
    background: #002147; color: white;
    display: flex; align-items: center; justify-content: center;
    font-family: system-ui, sans-serif; font-weight: 600; font-size: 13px;
    box-shadow: 0 0 0 4px rgba(0,33,71,0.25), 0 2px 6px rgba(0,0,0,0.3);
  `;
  div.textContent = String(count);
  return div;
}

const MerchantLayer: React.FC<MerchantLayerProps> = ({
  map,
  isVisible,
  selectedBrandIds,
  showClosed = false,
}) => {
  const [locations, setLocations] = useState<MerchantLocationWithBrand[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const openPopupRef = useRef<{
    locationId: string;
    overlay: google.maps.OverlayView;
  } | null>(null);
  const isFetchingRef = useRef(false);
  const lastFetchKeyRef = useRef<string | null>(null);
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Stable key for the selected brand set (set identity is not safe for deps)
  const selectedBrandKey = useMemo(
    () => Array.from(selectedBrandIds).sort().join(','),
    [selectedBrandIds],
  );

  useEffect(() => {
    ensurePinStyle();
  }, []);

  // Preload marker library so AdvancedMarkerElement is ready
  useEffect(() => {
    loadMarkerLibrary().catch((err) => console.error('MerchantLayer marker library load failed:', err));
  }, []);

  const closeOpenPopup = useCallback(() => {
    if (openPopupRef.current) {
      openPopupRef.current.overlay.setMap(null);
      openPopupRef.current = null;
    }
  }, []);

  const createPopupOverlay = useCallback(
    (loc: MerchantLocationWithBrand, position: google.maps.LatLng) => {
      class PopupOverlay extends google.maps.OverlayView {
        private pos: google.maps.LatLng;
        private containerDiv: HTMLDivElement | null = null;
        private root: ReactDOM.Root | null = null;

        constructor(p: google.maps.LatLng) {
          super();
          this.pos = p;
        }

        onAdd() {
          this.containerDiv = document.createElement('div');
          this.containerDiv.style.position = 'absolute';
          this.containerDiv.style.zIndex = '1000';
          ['mousedown', 'mouseup', 'click', 'dblclick', 'wheel'].forEach((evt) => {
            this.containerDiv!.addEventListener(evt, (e) => e.stopPropagation());
          });
          this.root = ReactDOM.createRoot(this.containerDiv);
          this.root.render(
            <MerchantPopup location={loc} onClose={() => this.setMap(null)} />,
          );
          this.getPanes()?.floatPane.appendChild(this.containerDiv);
        }

        draw() {
          if (!this.containerDiv) return;
          const point = this.getProjection().fromLatLngToDivPixel(this.pos);
          if (point) {
            this.containerDiv.style.left = point.x + 'px';
            this.containerDiv.style.top = point.y - 16 + 'px';
            this.containerDiv.style.transform = 'translate(-50%, -100%)';
          }
        }

        onRemove() {
          if (this.containerDiv) {
            this.root?.unmount();
            this.containerDiv.parentElement?.removeChild(this.containerDiv);
            this.containerDiv = null;
          }
          if (openPopupRef.current?.locationId === loc.id) openPopupRef.current = null;
        }
      }
      return new PopupOverlay(position);
    },
    [],
  );

  const fetchLocations = useCallback(
    async (forceRefresh = false) => {
      if (!map || isFetchingRef.current) return;
      if (selectedBrandIds.size === 0) {
        setLocations([]);
        return;
      }
      const bounds = map.getBounds();
      if (!bounds) return;
      const ne = bounds.getNorthEast();
      const sw = bounds.getSouthWest();
      const key = [
        sw.lat().toFixed(4),
        sw.lng().toFixed(4),
        ne.lat().toFixed(4),
        ne.lng().toFixed(4),
        selectedBrandKey,
        showClosed ? '1' : '0',
      ].join('|');
      if (!forceRefresh && lastFetchKeyRef.current === key) return;

      isFetchingRef.current = true;
      lastFetchKeyRef.current = key;
      try {
        // Paginate in case viewport contains > 1000 matching pins (per CLAUDE.md)
        const PAGE = 1000;
        let offset = 0;
        const all: MerchantLocationWithBrand[] = [];
        const brandIds = Array.from(selectedBrandIds);

        while (true) {
          let query = supabase
            .from('merchant_location')
            .select(
              'id, brand_id, google_place_id, name, latitude, longitude, formatted_address, phone, website, business_status, last_verified_at, brand:merchant_brand(id, name, logo_url, category_id)',
            )
            .in('brand_id', brandIds)
            .gte('latitude', sw.lat())
            .lte('latitude', ne.lat())
            .gte('longitude', sw.lng())
            .lte('longitude', ne.lng())
            .range(offset, offset + PAGE - 1);

          if (!showClosed) {
            query = query.neq('business_status', 'CLOSED_PERMANENTLY');
          }

          const { data, error } = await query;
          if (error) throw error;
          if (!data || data.length === 0) break;

          // Supabase typed the joined `brand` as an array in some versions; normalize.
          for (const row of data as any[]) {
            const brand = Array.isArray(row.brand) ? row.brand[0] : row.brand;
            if (!brand) continue;
            all.push({ ...(row as MerchantLocationRow), brand });
          }
          if (data.length < PAGE) break;
          offset += PAGE;
        }

        setLocations(all);
      } catch (err) {
        console.error('MerchantLayer fetch error:', err);
      } finally {
        isFetchingRef.current = false;
      }
    },
    [map, selectedBrandIds, selectedBrandKey, showClosed],
  );

  // Initial / visibility / selection load
  useEffect(() => {
    if (!map) return;
    if (!isVisible) {
      setLocations([]);
      closeOpenPopup();
      return;
    }
    lastFetchKeyRef.current = null;
    fetchLocations(true);
  }, [map, isVisible, selectedBrandKey, showClosed, fetchLocations, closeOpenPopup]);

  // Re-fetch on map idle (viewport changes)
  useEffect(() => {
    if (!map || !isVisible) return;
    const listener = map.addListener('idle', () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = setTimeout(() => {
        if (!openPopupRef.current) fetchLocations();
      }, 300);
    });
    return () => {
      google.maps.event.removeListener(listener);
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
    };
  }, [map, isVisible, fetchLocations]);

  // Render / clear markers
  useEffect(() => {
    if (!map) return;

    // Tear down previous markers & clusterer
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current = null;
    }
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];

    if (!isVisible || locations.length === 0) return;

    let cancelled = false;
    loadMarkerLibrary()
      .then((lib) => {
        if (cancelled) return;
        const { AdvancedMarkerElement } = lib;
        const newMarkers: google.maps.marker.AdvancedMarkerElement[] = locations.map((loc) => {
          const content = buildPinContent(loc);
          const marker = new AdvancedMarkerElement({
            map: null,
            position: { lat: loc.latitude, lng: loc.longitude },
            content,
            title: loc.brand.name,
          });
          marker.addListener('gmp-click', () => {
            closeOpenPopup();
            const pos = new google.maps.LatLng(loc.latitude, loc.longitude);
            const overlay = createPopupOverlay(loc, pos);
            overlay.setMap(map);
            openPopupRef.current = { locationId: loc.id, overlay };
          });
          return marker;
        });
        markersRef.current = newMarkers;

        clustererRef.current = new MarkerClusterer({
          map,
          markers: newMarkers,
          renderer: {
            render: ({ count, position }) => {
              const element = buildClusterIcon(count);
              return new AdvancedMarkerElement({
                position,
                content: element,
                zIndex: 500 + count,
              }) as unknown as google.maps.marker.AdvancedMarkerElement;
            },
          },
          algorithmOptions: { maxZoom: 12 },
        });
      })
      .catch((err) => console.error('MerchantLayer marker render failed:', err));

    return () => {
      cancelled = true;
    };
  }, [map, isVisible, locations, createPopupOverlay, closeOpenPopup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      closeOpenPopup();
      if (clustererRef.current) {
        clustererRef.current.clearMarkers();
        clustererRef.current = null;
      }
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
    };
  }, [closeOpenPopup]);

  return null;
};

export default MerchantLayer;
