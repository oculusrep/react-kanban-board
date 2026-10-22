import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { ListingStaging, ListingStatus, LISTING_STATUS_LABEL, fmtPrice, fmtCap } from '../../../lib/listingStaging';

// NNN listing intake pins (listing_staging). Rejected listings are not drawn.
// Square pins so they read differently from the round Comp Database pins.
const STATUS_COLOR: Record<ListingStatus, string> = {
  pending_review: '#A27B5C', // terracotta — needs a look
  reviewed: '#4A6B94',       // steel blue
  promoted: '#002147',       // midnight — now a comp
  sold: '#8FA9C8',           // light slate
  rejected: '#8FA9C8',
};

type Pin = Pick<ListingStaging, 'id' | 'tenant' | 'address' | 'city' | 'price' | 'cap_rate' | 'status' | 'lat' | 'lng'>;

export interface ListingStagingLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  selectedListingId?: string | null;
  onPinClick?: (listingId: string) => void;
}

function icon(status: ListingStatus, selected: boolean): google.maps.Icon {
  const size = selected ? 26 : 18;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 20 20">` +
    `<rect x="3" y="3" width="14" height="14" rx="2" transform="rotate(45 10 10)" fill="${STATUS_COLOR[status]}" ` +
    `stroke="${selected ? '#FFD54A' : '#FFFFFF'}" stroke-width="2"/></svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

const ListingStagingLayer: React.FC<ListingStagingLayerProps> = ({ map, isVisible, selectedListingId = null, onPinClick }) => {
  const [pins, setPins] = useState<Pin[]>([]);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const { refreshTrigger, setLayerCount } = useLayerManager();
  const trigger = refreshTrigger.listing_staging || 0;

  const fetchPins = useCallback(async () => {
    try {
      const PAGE_SIZE = 1000;
      const all: Pin[] = [];
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
          .from('listing_staging')
          .select('id, tenant, address, city, price, cap_rate, status, lat, lng')
          .neq('status', 'rejected')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        all.push(...((data ?? []) as Pin[]));
        if ((data?.length ?? 0) < PAGE_SIZE) break;
      }
      setPins(all);
      // Count what's on the map; unplaced listings are listed on the review screen.
      setLayerCount('listing_staging', all.filter((p) => p.lat != null && p.lng != null).length);
    } catch (e) {
      console.error('ListingStagingLayer fetch error:', e);
    }
  }, [setLayerCount]);

  useEffect(() => {
    if (map && isVisible) fetchPins();
  }, [map, isVisible, fetchPins]);

  useEffect(() => {
    if (map && isVisible && trigger > 0) fetchPins();
  }, [trigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const teardown = () => {
    // setMap(null), not clearMarkers(): clearMarkers leaves cluster glyphs behind.
    clustererRef.current?.setMap(null);
    clustererRef.current = null;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];
  };

  useEffect(() => {
    teardown();
    if (!map || !isVisible) return;
    const markers: google.maps.Marker[] = [];
    pins.forEach((p) => {
      if (p.lat == null || p.lng == null) return;
      const selected = p.id === selectedListingId;
      const m = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        icon: icon(p.status, selected),
        zIndex: selected ? 3000 : 120,
        title: `${p.tenant ?? 'NNN listing'} — ${fmtPrice(p.price)} @ ${fmtCap(p.cap_rate)}\n${p.address}${p.city ? `, ${p.city}` : ''}\n${LISTING_STATUS_LABEL[p.status]}`,
      });
      m.addListener('click', (e: google.maps.MapMouseEvent) => {
        e.domEvent?.stopPropagation?.();
        onPinClick?.(p.id);
      });
      markers.push(m);
    });
    markersRef.current = markers;
    if (markers.length) clustererRef.current = new MarkerClusterer({ map, markers });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pins, map, isVisible, selectedListingId]);

  useEffect(() => teardown, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
};

export default ListingStagingLayer;
