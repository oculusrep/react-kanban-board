import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import { buildLogoUrl } from '../../../pages/admin/merchants/shared';
import { loadMarkerLibrary } from '../utils/advancedMarkers';
import { useLayerManager } from './LayerManager';

/**
 * Truck Stops (Georgia): Pilot, Flying J, Love's, TA / Petro, QuikTrip truck
 * stops, Buc-ee's. Data: public.truck_stop (Google Places). See
 * docs/TRUCK_STOPS_LAYER.md.
 *
 * Everyone can view. Internal users can, from a pin's popup:
 *   - Verify location: drag the pin to the real storefront (saved as verified_*)
 *   - Remove pin: soft delete (excluded_at), so re-imports can't bring it back
 * Both go through SECURITY DEFINER RPCs that re-check is_internal_user().
 */
type Brand = 'Pilot' | 'Flying J' | "Love's" | 'TA / Petro' | 'QuikTrip' | "Buc-ee's";

interface TruckStop {
  id: string;
  brand: Brand;
  google_place_id: string;
  name: string | null;
  formatted_address: string | null;
  latitude: number;
  longitude: number;
  verified_latitude: number | null;
  verified_longitude: number | null;
  verified_at: string | null;
  business_status: string;
}

interface TruckStopLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
}

const PIN_SIZE = 28;
const INTERNAL_ROLES = new Set(['admin', 'broker_full', 'broker_lite', 'va']);

// Brandfetch icon domains (hotlinked; their terms forbid storing copies).
// Flying J has no Brandfetch logo (placeholder only, checked 2026-11-13) → drawn pin.
const BRAND_DOMAIN: Record<Brand, string | null> = {
  Pilot: 'pilotflyingj.com',
  'Flying J': null,
  "Love's": 'loves.com',
  'TA / Petro': 'ta-petro.com',
  QuikTrip: 'quiktrip.com',
  "Buc-ee's": 'buc-ees.com',
};

// Drawn fallback: [background, text color, label]
const FALLBACK: Record<Brand, [string, string, string]> = {
  Pilot: ['#E21E26', '#FFFFFF', 'P'],
  'Flying J': ['#D2232A', '#FFD200', 'FJ'],
  "Love's": ['#FFD200', '#D2232A', 'L'],
  'TA / Petro': ['#0047BB', '#FFFFFF', 'TA'],
  QuikTrip: ['#D2232A', '#FFFFFF', 'QT'],
  "Buc-ee's": ['#FFD200', '#7A3E1D', 'B'],
};

function coordsOf(s: TruckStop): google.maps.LatLngLiteral {
  if (s.verified_latitude != null && s.verified_longitude != null) {
    return { lat: Number(s.verified_latitude), lng: Number(s.verified_longitude) };
  }
  return { lat: Number(s.latitude), lng: Number(s.longitude) };
}

function drawnPin(brand: Brand): HTMLElement {
  const [bg, fg, label] = FALLBACK[brand];
  const el = document.createElement('div');
  el.textContent = label;
  el.style.cssText =
    `width:100%;height:100%;background:${bg};color:${fg};display:flex;align-items:center;` +
    `justify-content:center;font:700 ${label.length > 1 ? 10 : 13}px Arial,Helvetica,sans-serif;`;
  return el;
}

function buildPin(s: TruckStop, verifying: boolean): HTMLElement {
  const el = document.createElement('div');
  const ring = verifying ? '0 0 0 3px #f97316,0 0 8px rgba(249,115,22,.7)' : '0 0 0 2px #fff,0 1px 3px rgba(0,0,0,.4)';
  el.style.cssText =
    `width:${PIN_SIZE}px;height:${PIN_SIZE}px;border-radius:50%;overflow:hidden;background:#fff;` +
    `box-shadow:${ring};cursor:${verifying ? 'grab' : 'pointer'};` +
    (s.business_status === 'OPERATIONAL' ? '' : 'opacity:.6;filter:grayscale(.6);');
  const domain = BRAND_DOMAIN[s.brand];
  if (!domain) {
    el.appendChild(drawnPin(s.brand));
    return el;
  }
  const img = document.createElement('img');
  img.src = buildLogoUrl(domain, 'icon');
  img.alt = s.brand;
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer-when-downgrade';
  img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
  img.onerror = () => {
    el.innerHTML = '';
    el.appendChild(drawnPin(s.brand));
  };
  el.appendChild(img);
  return el;
}

function button(label: string, color: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.style.cssText =
    `font-size:12px;padding:3px 8px;border-radius:4px;border:1px solid ${color};color:${color};` +
    'background:#fff;cursor:pointer;margin-right:6px;margin-top:8px;';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

const TruckStopLayer: React.FC<TruckStopLayerProps> = ({ map, isVisible }) => {
  const { userRole } = useAuth();
  const canEdit = INTERNAL_ROLES.has(userRole ?? '');

  const [stops, setStops] = useState<TruckStop[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const markersRef = useRef<Map<string, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const infoRef = useRef<google.maps.InfoWindow | null>(null);

  const { refreshTrigger } = useLayerManager();
  const layerRefreshTrigger = refreshTrigger.truck_stops || 0;

  useEffect(() => {
    if (!isVisible) {
      setStops([]);
      setVerifyingId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('truck_stop')
        .select('id, brand, google_place_id, name, formatted_address, latitude, longitude, verified_latitude, verified_longitude, verified_at, business_status')
        .is('excluded_at', null);
      if (cancelled) return;
      if (error) {
        console.error('TruckStopLayer fetch error:', error);
        return;
      }
      setStops((data ?? []) as TruckStop[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [isVisible, layerRefreshTrigger]);

  // Popup content. Built from DOM nodes + textContent so Places strings can't inject HTML.
  const popupFor = (s: TruckStop): HTMLElement => {
    const root = document.createElement('div');
    root.style.cssText = 'min-width:210px;max-width:270px;color:#002147;font-family:inherit;';
    const add = (text: string, css: string) => {
      const d = document.createElement('div');
      d.textContent = text;
      d.style.cssText = css;
      root.appendChild(d);
    };
    add(s.brand, 'font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#4A6B94;');
    add(s.name || s.brand, 'font-size:14px;font-weight:700;margin-top:2px;');
    if (s.formatted_address) add(s.formatted_address.replace(/, USA$/, ''), 'font-size:12px;margin-top:4px;');
    if (s.business_status !== 'OPERATIONAL') {
      add(s.business_status.replace(/_/g, ' ').toLowerCase(), 'font-size:11px;margin-top:4px;color:#A27B5C;font-weight:600;');
    }
    if (s.verified_at) add('✓ Location verified', 'font-size:11px;margin-top:4px;color:#15803d;font-weight:600;');

    const link = document.createElement('a');
    link.href = `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(s.google_place_id)}`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Open in Google Maps';
    link.style.cssText = 'display:inline-block;font-size:12px;margin-top:6px;color:#4A6B94;';
    root.appendChild(link);

    if (canEdit) {
      const row = document.createElement('div');
      row.appendChild(
        button('Verify location', '#002147', () => {
          infoRef.current?.close();
          setVerifyingId(s.id);
        })
      );
      row.appendChild(
        button('Remove pin', '#A27B5C', async () => {
          if (!window.confirm(`Remove this ${s.brand} pin from the Truck Stops layer for everyone?`)) return;
          const { error } = await supabase.rpc('truck_stop_exclude', { p_id: s.id });
          if (error) {
            window.alert(`Could not remove pin: ${error.message}`);
            return;
          }
          infoRef.current?.close();
          setStops((prev) => prev.filter((x) => x.id !== s.id));
        })
      );
      root.appendChild(row);
    }
    return root;
  };

  // (Re)build markers. Rebuilt when the verifying pin changes so its ring and
  // draggable state are set at construction (no mid-drag rebuilds: stops only
  // change after the drag's save completes).
  useEffect(() => {
    markersRef.current.forEach((m) => (m.map = null));
    markersRef.current.clear();
    if (!map || !isVisible) {
      infoRef.current?.close();
      return;
    }

    let cancelled = false;
    loadMarkerLibrary()
      .then(({ AdvancedMarkerElement }) => {
        if (cancelled) return;
        if (!infoRef.current) infoRef.current = new google.maps.InfoWindow();
        const info = infoRef.current;

        stops.forEach((s) => {
          const verifying = s.id === verifyingId;
          const marker = new AdvancedMarkerElement({
            map,
            position: coordsOf(s),
            content: buildPin(s, verifying),
            title: verifying
              ? 'Drag to the correct spot and release to save'
              : `${s.name || s.brand}${s.formatted_address ? ' — ' + s.formatted_address : ''}`,
            gmpDraggable: verifying,
            zIndex: verifying ? 2000 : 140,
          });
          if (verifying) {
            marker.addListener('dragend', async () => {
              const pos = marker.position as google.maps.LatLngLiteral | google.maps.LatLng | null;
              if (!pos) return;
              const lat = typeof (pos as google.maps.LatLng).lat === 'function' ? (pos as google.maps.LatLng).lat() : (pos as google.maps.LatLngLiteral).lat;
              const lng = typeof (pos as google.maps.LatLng).lng === 'function' ? (pos as google.maps.LatLng).lng() : (pos as google.maps.LatLngLiteral).lng;
              const { error } = await supabase.rpc('truck_stop_set_verified_location', { p_id: s.id, p_lat: lat, p_lng: lng });
              if (error) {
                window.alert(`Could not save location: ${error.message}`);
                return;
              }
              setStops((prev) =>
                prev.map((x) =>
                  x.id === s.id ? { ...x, verified_latitude: lat, verified_longitude: lng, verified_at: new Date().toISOString() } : x
                )
              );
              setVerifyingId(null);
            });
          } else {
            marker.addListener('gmp-click', () => {
              info.setContent(popupFor(s));
              info.open({ map, anchor: marker });
            });
          }
          markersRef.current.set(s.id, marker);
        });
      })
      .catch((err) => console.error('TruckStopLayer marker library load failed:', err));

    return () => {
      cancelled = true;
    };
    // popupFor reads canEdit/state setters only; rebuilding on its identity is unnecessary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stops, map, isVisible, verifyingId, canEdit]);

  // Esc cancels verify mode.
  useEffect(() => {
    if (!verifyingId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVerifyingId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [verifyingId]);

  useEffect(() => {
    return () => {
      markersRef.current.forEach((m) => (m.map = null));
      markersRef.current.clear();
      infoRef.current?.close();
    };
  }, []);

  return null;
};

export default TruckStopLayer;
