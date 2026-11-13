import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { buildLogoUrl } from '../../../pages/admin/merchants/shared';
import { loadMarkerLibrary } from '../utils/advancedMarkers';

/**
 * 7-Eleven / Speedway store locations (Georgia), from Google Places.
 * Rows are readable only by users who pass user_has_seven_eleven_access()
 * (RLS on seven_eleven_store). See docs/SEVEN_ELEVEN_LAYER.md.
 *
 * The set is small (a few dozen statewide), so it loads once per toggle-on
 * instead of refetching by viewport.
 */
export interface SevenElevenStore {
  id: string;
  brand: '7-Eleven' | 'Speedway';
  google_place_id: string;
  name: string | null;
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  verified_latitude: number | null;
  verified_longitude: number | null;
  business_status: string;
}

interface SevenElevenLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
}

const PIN_SIZE = 28;

function svgPin(fill: string, stroke: string, text: string, textColor: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PIN_SIZE}" height="${PIN_SIZE}" viewBox="0 0 26 26">` +
    `<circle cx="13" cy="13" r="11.5" fill="${fill}" stroke="${stroke}" stroke-width="2.5"/>` +
    `<text x="13" y="17.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="13" font-weight="bold" fill="${textColor}">${text}</text>` +
    `</svg>`;
  return 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svg);
}

// Fallback pin images, used only if the Brandfetch logo fails to load.
// 7-Eleven: white disc, green ring, orange 7. Speedway: red disc, white S.
const FALLBACK_ICON: Record<SevenElevenStore['brand'], string> = {
  '7-Eleven': svgPin('#FFFFFF', '#008163', '7', '#F47B20'),
  Speedway: svgPin('#D71920', '#FFFFFF', 'S', '#FFFFFF'),
};

// Brand logos are HOTLINKED from the Brandfetch CDN (their terms forbid storing
// copies), same as the Merchants layer. 'icon' variant = square brand mark.
const BRAND_DOMAIN: Record<SevenElevenStore['brand'], string> = {
  '7-Eleven': '7-eleven.com',
  Speedway: 'speedway.com',
};

/**
 * Round pin: the Brandfetch logo clipped to a circle with a white ring.
 * Falls back to the drawn SVG pin if the logo fails to load.
 */
function buildPinContent(brand: SevenElevenStore['brand']): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    `width:${PIN_SIZE}px;height:${PIN_SIZE}px;border-radius:50%;overflow:hidden;` +
    'background:#fff;box-shadow:0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.4);cursor:pointer;';
  const img = document.createElement('img');
  img.src = buildLogoUrl(BRAND_DOMAIN[brand], 'icon');
  img.alt = brand;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer-when-downgrade';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  img.onerror = () => {
    img.onerror = null;
    img.src = FALLBACK_ICON[brand];
  };
  el.appendChild(img);
  return el;
}

function coordsOf(s: SevenElevenStore): google.maps.LatLngLiteral {
  if (s.verified_latitude != null && s.verified_longitude != null) {
    return { lat: Number(s.verified_latitude), lng: Number(s.verified_longitude) };
  }
  return { lat: Number(s.latitude), lng: Number(s.longitude) };
}

/** Built with DOM nodes + textContent so Places-sourced strings can't inject HTML. */
function popupContent(s: SevenElevenStore): HTMLElement {
  const root = document.createElement('div');
  root.style.cssText = 'font-family: inherit; min-width: 200px; max-width: 260px; color: #002147;';

  const brand = document.createElement('div');
  brand.textContent = s.brand;
  brand.style.cssText = 'font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: #4A6B94;';
  root.appendChild(brand);

  const name = document.createElement('div');
  name.textContent = s.name || s.brand;
  name.style.cssText = 'font-size: 14px; font-weight: 700; margin-top: 2px;';
  root.appendChild(name);

  if (s.formatted_address) {
    const addr = document.createElement('div');
    addr.textContent = s.formatted_address.replace(/, USA$/, '');
    addr.style.cssText = 'font-size: 12px; margin-top: 4px;';
    root.appendChild(addr);
  }

  if (s.business_status && s.business_status !== 'OPERATIONAL') {
    const status = document.createElement('div');
    status.textContent = s.business_status.replace(/_/g, ' ').toLowerCase();
    status.style.cssText = 'font-size: 11px; margin-top: 4px; color: #A27B5C; font-weight: 600;';
    root.appendChild(status);
  }

  const link = document.createElement('a');
  link.href = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(s.google_place_id)}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = 'Open in Google Maps';
  link.style.cssText = 'display: inline-block; font-size: 12px; margin-top: 6px; color: #4A6B94;';
  root.appendChild(link);

  return root;
}

const SevenElevenLayer: React.FC<SevenElevenLayerProps> = ({ map, isVisible }) => {
  const [stores, setStores] = useState<SevenElevenStore[]>([]);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const { refreshTrigger } = useLayerManager();
  const layerRefreshTrigger = refreshTrigger.seven_eleven_stores || 0;

  useEffect(() => {
    if (!isVisible) {
      setStores([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('seven_eleven_store')
        .select('id, brand, google_place_id, name, formatted_address, latitude, longitude, verified_latitude, verified_longitude, business_status');
      if (cancelled) return;
      if (error) {
        console.error('SevenElevenLayer fetch error:', error);
        return;
      }
      setStores((data ?? []) as SevenElevenStore[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisible, layerRefreshTrigger]);

  useEffect(() => {
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current = [];
    if (!map || !isVisible) {
      infoWindowRef.current?.close();
      return;
    }

    let cancelled = false;
    loadMarkerLibrary()
      .then(({ AdvancedMarkerElement }) => {
        if (cancelled) return;
        if (!infoWindowRef.current) infoWindowRef.current = new google.maps.InfoWindow();
        const info = infoWindowRef.current;

        markersRef.current = stores.map((s) => {
          const marker = new AdvancedMarkerElement({
            map,
            position: coordsOf(s),
            content: buildPinContent(s.brand),
            title: `${s.name || s.brand}${s.formatted_address ? ' — ' + s.formatted_address : ''}`,
            zIndex: 150,
          });
          marker.addListener('gmp-click', () => {
            info.setContent(popupContent(s));
            info.open({ map, anchor: marker });
          });
          return marker;
        });
      })
      .catch((err) => console.error('SevenElevenLayer marker library load failed:', err));

    return () => {
      cancelled = true;
    };
  }, [stores, map, isVisible]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current = [];
      infoWindowRef.current?.close();
    };
  }, []);

  return null;
};

export default SevenElevenLayer;
