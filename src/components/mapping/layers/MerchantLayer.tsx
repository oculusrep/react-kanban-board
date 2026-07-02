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
  /** Admin-uploaded custom logo. When set, overrides logo_url at render time. */
  custom_logo_url: string | null;
  category_id: string | null;
}

/** Prefer the admin-uploaded custom logo over the Brandfetch URL. */
function brandDisplayLogo(b: Pick<MerchantBrand, 'logo_url' | 'custom_logo_url'>): string | null {
  return b.custom_logo_url ?? b.logo_url ?? null;
}

export interface MerchantLocationRow {
  id: string;
  brand_id: string;
  google_place_id: string;
  name: string;
  latitude: number;
  longitude: number;
  verified_latitude: number | null;
  verified_longitude: number | null;
  verified_at: string | null;
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
  /** When true, ignore selectedBrandIds and fetch every merchant in viewport. Drawer zoom-gates this. */
  showAllInViewport?: boolean;
  showClosed?: boolean;
  /** When set, that one pin becomes draggable so admin can drop it on the real storefront. */
  verifyingLocationId?: string | null;
  /** Called after the admin drops a draggable pin. Persist via UPDATE merchant_location. */
  onLocationVerified?: (locationId: string, lat: number, lng: number) => void;
  /** Right-click handler — typically opens MerchantContextMenu with screen coords. */
  onMerchantRightClick?: (location: MerchantLocationWithBrand, x: number, y: number) => void;
}

/** Verified coords take precedence over Places coords. */
function displayCoords(loc: MerchantLocationRow): { lat: number; lng: number } {
  if (loc.verified_latitude != null && loc.verified_longitude != null) {
    return { lat: loc.verified_latitude, lng: loc.verified_longitude };
  }
  return { lat: loc.latitude, lng: loc.longitude };
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
    .merchant-pin.verifying {
      cursor: grab;
      transform: scale(1.4);
      filter: drop-shadow(0 0 0 3px #f97316) drop-shadow(0 0 8px rgba(249,115,22,0.6));
    }
    .merchant-pin.verifying:active { cursor: grabbing; }
    .merchant-pin.verifying img {
      filter:
        drop-shadow(0 0 0 2px #f97316)
        drop-shadow(0 0 4px white)
        drop-shadow(0 0 4px white);
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

function buildPinContent(loc: MerchantLocationWithBrand, verifying = false): HTMLElement {
  const container = document.createElement('div');
  container.className = 'merchant-pin';
  if (verifying) container.classList.add('verifying');
  if (loc.business_status === 'CLOSED_PERMANENTLY') container.classList.add('closed-perm');
  else if (loc.business_status === 'CLOSED_TEMPORARILY') container.classList.add('closed-temp');

  const displayLogo = brandDisplayLogo(loc.brand);
  if (displayLogo) {
    const img = document.createElement('img');
    img.src = displayLogo;
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
  showAllInViewport = false,
  showClosed = false,
  verifyingLocationId = null,
  onLocationVerified,
  onMerchantRightClick,
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
  // After a successful verify-drag, skip exactly one idle-triggered fetch so
  // the in-flight DB UPDATE doesn't race the next SELECT (which would otherwise
  // pull back stale Places coords and snap the pin back to its old spot).
  const skipNextFetchRef = useRef(false);

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
      // One-shot skip after a verify-drag, so the post-drop idle event doesn't
      // re-fetch and momentarily snap the pin back.
      if (skipNextFetchRef.current && !forceRefresh) {
        skipNextFetchRef.current = false;
        return;
      }
      if (!showAllInViewport && selectedBrandIds.size === 0) {
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
        showAllInViewport ? 'ALL' : selectedBrandKey,
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
          // Viewport filter checks BOTH places and verified coords (logical OR)
          // so a row whose verified pin sits in the viewport is included even
          // if its original Places coord was outside.
          // Matches RestaurantLayer's pattern.
          const orFilter = `and(latitude.gte.${sw.lat()},latitude.lte.${ne.lat()},longitude.gte.${sw.lng()},longitude.lte.${ne.lng()}),and(verified_latitude.gte.${sw.lat()},verified_latitude.lte.${ne.lat()},verified_longitude.gte.${sw.lng()},verified_longitude.lte.${ne.lng()})`;
          let query = supabase
            .from('merchant_location')
            .select(
              'id, brand_id, google_place_id, name, latitude, longitude, verified_latitude, verified_longitude, verified_at, formatted_address, phone, website, business_status, last_verified_at, brand:merchant_brand(id, name, logo_url, custom_logo_url, category_id)',
            )
            .or(orFilter)
            .range(offset, offset + PAGE - 1);

          if (!showAllInViewport) {
            query = query.in('brand_id', brandIds);
          }

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
    [map, selectedBrandIds, selectedBrandKey, showAllInViewport, showClosed],
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
  }, [map, isVisible, selectedBrandKey, showAllInViewport, showClosed, fetchLocations, closeOpenPopup]);

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
          const pos = displayCoords(loc);
          const isBeingVerified = verifyingLocationId === loc.id;
          const content = buildPinContent(loc, isBeingVerified);
          const marker = new AdvancedMarkerElement({
            map: null,
            position: pos,
            content,
            title: loc.brand.name,
            gmpDraggable: isBeingVerified,
            zIndex: isBeingVerified ? 2000 : undefined,
          });

          marker.addListener('gmp-click', () => {
            closeOpenPopup();
            // Use current marker position so newly-dragged pin opens popup
            // in the right spot before the DB save round-trips.
            const cur = marker.position as google.maps.LatLngLiteral | google.maps.LatLng | null;
            const lat = typeof (cur as google.maps.LatLng)?.lat === 'function'
              ? (cur as google.maps.LatLng).lat()
              : (cur as google.maps.LatLngLiteral)?.lat ?? pos.lat;
            const lng = typeof (cur as google.maps.LatLng)?.lng === 'function'
              ? (cur as google.maps.LatLng).lng()
              : (cur as google.maps.LatLngLiteral)?.lng ?? pos.lng;
            const latLng = new google.maps.LatLng(lat, lng);
            const overlay = createPopupOverlay(loc, latLng);
            overlay.setMap(map);
            openPopupRef.current = { locationId: loc.id, overlay };
          });

          if (isBeingVerified && onLocationVerified) {
            // NOTE: event name is 'dragend', NOT 'gmp-dragend'. The latter
            // doesn't exist on AdvancedMarkerElement and the listener never
            // fires — matches what every other layer uses (PropertyLayer,
            // SiteSubmitLayer, RestaurantLayer, etc.).
            marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
              if (!event.latLng) return;
              const lat = event.latLng.lat();
              const lng = event.latLng.lng();

              // 1. Skip the next idle-triggered fetch so the in-flight DB
              //    save doesn't race a SELECT that returns stale coords.
              skipNextFetchRef.current = true;

              // 2. Optimistically patch local state so the next render uses
              //    the new verified coords (without this, clearing
              //    verifyingLocationId re-renders the marker at old coords).
              setLocations((prev) =>
                prev.map((p) =>
                  p.id === loc.id
                    ? {
                        ...p,
                        verified_latitude: lat,
                        verified_longitude: lng,
                        verified_at: new Date().toISOString(),
                      }
                    : p,
                ),
              );

              // 3. Persist via parent handler.
              onLocationVerified(loc.id, lat, lng);
            });
          }

          if (onMerchantRightClick) {
            // AdvancedMarkerElement has no native rightclick — attach to content.
            content.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              e.stopPropagation();
              onMerchantRightClick(loc, e.clientX, e.clientY);
            });
          }

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
  }, [
    map,
    isVisible,
    locations,
    verifyingLocationId,
    onLocationVerified,
    onMerchantRightClick,
    createPopupOverlay,
    closeOpenPopup,
  ]);

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
