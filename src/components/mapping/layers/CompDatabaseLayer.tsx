import React, { useEffect, useState, useCallback, useRef } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { CompPropertyWithCounts, compCoords } from '../../../lib/compTypes';

// Brand palette (CLAUDE.md): pin fill signals what the comp contains.
const COLOR_SALE = '#4A6B94';   // steel blue  — has a sale comp
const COLOR_LEASE = '#002147';  // midnight    — has lease comp(s), no sale
const COLOR_EMPTY = '#8FA9C8';  // light slate — location only, no comps yet
const COLOR_AVAILABLE = '#F59E0B'; // amber    — available / being marketed
const COLOR_OM_RING = '#A27B5C'; // terracotta — has an Operating Memorandum

export interface CompDatabaseLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  onPinClick?: (comp: CompPropertyWithCounts) => void;
  onPinRightClick?: (comp: CompPropertyWithCounts, screenX: number, screenY: number) => void;
  onLocationVerified?: (compId: string, lat: number, lng: number) => void;
  selectedCompId?: string | null;
  verifyingCompId?: string | null;
}

function pinColor(c: CompPropertyWithCounts): string {
  if (c.is_available) return COLOR_AVAILABLE; // marketed listings stand out
  if (c.sale_count > 0) return COLOR_SALE;
  if (c.lease_count > 0) return COLOR_LEASE;
  return COLOR_EMPTY;
}

function createCompIcon(c: CompPropertyWithCounts, selected: boolean): google.maps.Icon {
  const size = selected ? 30 : 22;
  const fill = pinColor(c);
  const stroke = selected ? '#FFD54A' : '#FFFFFF';
  const omRing = c.om_count > 0
    ? `<circle cx="12" cy="12" r="11" fill="none" stroke="${COLOR_OM_RING}" stroke-width="1.5" stroke-dasharray="3 2"/>`
    : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<circle cx="12" cy="12" r="8" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
    omRing +
    `</svg>`;
  return {
    url: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(size, size),
    anchor: new google.maps.Point(size / 2, size / 2),
  };
}

const CompDatabaseLayer: React.FC<CompDatabaseLayerProps> = ({
  map,
  isVisible,
  onPinClick,
  onPinRightClick,
  onLocationVerified,
  selectedCompId = null,
  verifyingCompId = null,
}) => {
  const [comps, setComps] = useState<CompPropertyWithCounts[]>([]);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const isFetchingRef = useRef(false);

  const { refreshTrigger, setLayerCount } = useLayerManager();
  const compRefreshTrigger = refreshTrigger.comp_database || 0;

  const fetchComps = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const PAGE_SIZE = 1000;
      let offset = 0;
      let hasMore = true;
      const all: CompPropertyWithCounts[] = [];
      while (hasMore) {
        const { data, error } = await supabase
          .from('comp_property')
          .select('*, lease_comp(count), sale_comp(count), operating_memorandum(count)')
          .range(offset, offset + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = (data || []).map((r: any) => ({
          ...r,
          lease_count: r.lease_comp?.[0]?.count ?? 0,
          sale_count: r.sale_comp?.[0]?.count ?? 0,
          om_count: r.operating_memorandum?.[0]?.count ?? 0,
        })) as CompPropertyWithCounts[];
        all.push(...rows);
        hasMore = rows.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }
      setComps(all);
      setLayerCount('comp_database', all.length);
    } catch (err) {
      console.error('CompDatabaseLayer fetch error:', err);
    } finally {
      isFetchingRef.current = false;
    }
  }, [setLayerCount]);

  // Load when turned on; clear when off.
  useEffect(() => {
    if (map && isVisible) fetchComps();
    else if (!isVisible) setComps([]);
  }, [map, isVisible, fetchComps]);

  // Manual refresh (e.g. after saving a comp in the slideout).
  useEffect(() => {
    if (map && isVisible && compRefreshTrigger > 0) fetchComps();
  }, [compRefreshTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build markers whenever the comp set (or selection) changes.
  useEffect(() => {
    if (!map) return;

    clustererRef.current?.clearMarkers();
    markers.forEach((m) => m.setMap(null));

    if (!comps.length) {
      setMarkers([]);
      return;
    }

    const newMarkers: google.maps.Marker[] = [];
    comps.forEach((comp) => {
      const coords = compCoords(comp);
      if (!coords) return;
      const selected = selectedCompId === comp.id;
      const isVerifying = verifyingCompId === comp.id;
      const marker = new google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        title: comp.name || comp.address || 'Comp',
        icon: createCompIcon(comp, selected || isVerifying),
        zIndex: selected || isVerifying ? 3000 : 100,
        draggable: isVerifying,
      });
      marker.addListener('click', (event: google.maps.MapMouseEvent) => {
        event.domEvent?.stopPropagation?.();
        onPinClick?.(comp);
      });
      marker.addListener('rightclick', (event: any) => {
        const dom = event?.domEvent as MouseEvent | undefined;
        dom?.preventDefault?.();
        if (dom) onPinRightClick?.(comp, dom.clientX, dom.clientY);
      });
      marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
        if (event.latLng) onLocationVerified?.(comp.id, event.latLng.lat(), event.latLng.lng());
      });
      newMarkers.push(marker);
    });

    setMarkers(newMarkers);

    if (isVisible && newMarkers.length) {
      if (!clustererRef.current) {
        clustererRef.current = new MarkerClusterer({ map, markers: newMarkers });
      } else {
        clustererRef.current.addMarkers(newMarkers);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comps, selectedCompId, verifyingCompId, map]);

  // Visibility toggle without refetch.
  useEffect(() => {
    if (!map || !markers.length) return;
    if (isVisible) {
      if (!clustererRef.current) {
        clustererRef.current = new MarkerClusterer({ map, markers });
      } else {
        clustererRef.current.addMarkers(markers);
      }
    } else {
      clustererRef.current?.clearMarkers();
      markers.forEach((m) => m.setMap(null));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, markers, map]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clustererRef.current?.clearMarkers();
      markers.forEach((m) => m.setMap(null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default CompDatabaseLayer;
