import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';

/**
 * "Established (pre-2020)" system layer: subdivisions the parcel subdivisions
 * pass found built out before 2020. Reference only — these are not municipal
 * projects and never count toward a pipeline / growth total.
 * Data: established_subdivision via get_established_subdivisions().
 * Doc: docs/MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md
 */

interface Row {
  id: string;
  name: string;
  city: string | null;
  county: string;
  parcel_count: number;
  year_first_homes: number | null;
  year_built_out: number | null;
  year_majority: number | null;
  basis_detail: string | null;
  sources: string[];
  lat: number;
  lng: number;
  geojson: { type: string; coordinates: unknown } | null;
}

const COLOR = '#6B7280';
const LAYER_ID = 'established_subdivisions';

function paths(g: Row['geojson']): google.maps.LatLngLiteral[][] {
  if (!g) return [];
  const ring = (r: unknown) => (Array.isArray(r) ? r : [])
    .filter((p): p is [number, number] => Array.isArray(p) && p.length >= 2)
    .map(([lng, lat]) => ({ lat, lng }));
  if (g.type === 'Polygon') return (g.coordinates as unknown[]).map(ring).filter((r) => r.length);
  if (g.type === 'MultiPolygon') return (g.coordinates as unknown[]).flatMap((p) => (p as unknown[]).map(ring)).filter((r) => r.length);
  return [];
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'source'; } };

function infoHtml(r: Row): string {
  const built = r.year_built_out ?? r.year_majority;
  const srcs = (r.sources ?? []).slice(0, 4)
    .map((u) => `<a href="${esc(u)}" target="_blank" rel="noreferrer" style="color:#4A6B94">${esc(host(u))}</a>`).join(' · ');
  return `<div style="font-family:system-ui;font-size:12px;color:#002147;max-width:260px">
    <div style="font-weight:600;font-size:13px">${esc(r.name)}</div>
    <div style="color:#4A6B94">${esc(r.city ?? r.county)} · ${r.parcel_count} parcels · Established (pre-2020)</div>
    <div style="margin-top:4px">First homes ${r.year_first_homes ?? '?'} · built out ${built ?? '?'}</div>
    ${r.basis_detail ? `<div style="margin-top:4px;color:#4A6B94">${esc(r.basis_detail)}</div>` : ''}
    ${srcs ? `<div style="margin-top:4px">${srcs}</div>` : ''}
    <div style="margin-top:4px;color:#8FA9C8">Parcel layer + Gemini web search. Not in pipeline totals.</div>
  </div>`;
}

export const EstablishedSubdivisionLayer: React.FC<{ map: google.maps.Map | null; isVisible: boolean }> = ({ map, isVisible }) => {
  const { setLayerCount, setLayerLoading, setLayerError } = useLayerManager();
  const [rows, setRows] = useState<Row[] | null>(null);
  const shapes = useRef<(google.maps.Polygon | google.maps.Marker)[]>([]);
  const info = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!isVisible || rows) return;
    let cancelled = false;
    setLayerLoading(LAYER_ID, true);
    supabase.rpc('get_established_subdivisions').then(({ data, error }) => {
      if (cancelled) return;
      setLayerLoading(LAYER_ID, false);
      if (error) { console.error('established subdivisions:', error.message); setLayerError(LAYER_ID, true); return; }
      const list = (data ?? []) as Row[];
      setRows(list);
      setLayerCount(LAYER_ID, list.length);
    });
    return () => { cancelled = true; };
  }, [isVisible, rows, setLayerCount, setLayerLoading, setLayerError]);

  useEffect(() => {
    shapes.current.forEach((s) => s.setMap(null));
    shapes.current = [];
    if (!map || !isVisible || !rows) return;
    if (!info.current) info.current = new google.maps.InfoWindow();
    for (const r of rows) {
      const open = (pos: google.maps.LatLng | google.maps.LatLngLiteral) => {
        info.current!.setContent(infoHtml(r));
        info.current!.setPosition(pos);
        info.current!.open({ map });
      };
      const poly = new google.maps.Polygon({
        map, paths: paths(r.geojson), strokeColor: COLOR, strokeOpacity: 0.9, strokeWeight: 1.5,
        fillColor: COLOR, fillOpacity: 0.12, zIndex: 1,
      });
      poly.addListener('click', (e: google.maps.PolyMouseEvent) => open(e.latLng ?? { lat: r.lat, lng: r.lng }));
      const pin = new google.maps.Marker({
        map, position: { lat: r.lat, lng: r.lng }, title: `${r.name} (${r.parcel_count} parcels, pre-2020)`,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 5, fillColor: COLOR, fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 1.5 },
        zIndex: 2,
      });
      pin.addListener('click', () => open({ lat: r.lat, lng: r.lng }));
      shapes.current.push(poly, pin);
    }
    return () => {
      shapes.current.forEach((s) => s.setMap(null));
      shapes.current = [];
      info.current?.close();
    };
  }, [map, isVisible, rows]);

  return null;
};
