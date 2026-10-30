// Static map framing + projection for the tour PDF.
//
// The PDF asks Google's Maps Static API for a plain basemap only (no paths/markers in the
// URL) at a center + zoom WE choose, then draws routes and numbered pins itself as vectors.
// Because Static Maps renders standard Web Mercator (256px tiles at zoom 0) centered exactly
// on `center`, a lat/lng projects to an image pixel with the same math Google uses.
// Reference: https://developers.google.com/maps/documentation/maps-static/start
//   (size max 640x640 logical px; scale=2 doubles the pixels, not the logical frame).

export interface LatLng {
  lat: number;
  lng: number;
}
export interface Frame {
  center: LatLng;
  zoom: number;
  width: number; // logical px (<= 640)
  height: number;
}

const TILE = 256;
const MAX_LAT = 85.05112878;

function worldX(lng: number) {
  return ((lng + 180) / 360) * TILE;
}
function worldY(lat: number) {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const s = Math.sin((clamped * Math.PI) / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE;
}
function worldToLatLng(x: number, y: number): LatLng {
  const lng = (x / TILE) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / TILE;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

/** Largest integer zoom whose frame holds every point inside `pad` px of the edges. */
export function fitFrame(points: LatLng[], width: number, height: number, pad = 36, maxZoom = 16): Frame {
  if (points.length === 0) return { center: { lat: 33.75, lng: -84.39 }, zoom: 9, width, height };
  const xs = points.map((p) => worldX(p.lng));
  const ys = points.map((p) => worldY(p.lat));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const center = worldToLatLng((minX + maxX) / 2, (minY + maxY) / 2);
  const spanX = maxX - minX, spanY = maxY - minY;
  let zoom = maxZoom;
  while (zoom > 0) {
    const k = 2 ** zoom;
    if (spanX * k <= width - 2 * pad && spanY * k <= height - 2 * pad) break;
    zoom--;
  }
  return { center, zoom, width, height };
}

/** lat/lng → logical pixel in the frame (0,0 = top-left of the image). */
export function projector(frame: Frame): (p: LatLng) => { x: number; y: number } {
  const k = 2 ** frame.zoom;
  const cx = worldX(frame.center.lng) * k;
  const cy = worldY(frame.center.lat) * k;
  return (p) => ({ x: worldX(p.lng) * k - cx + frame.width / 2, y: worldY(p.lat) * k - cy + frame.height / 2 });
}

/** Drop points closer than `minPx` to the last kept one (keeps first + last). */
export function simplifyPx(pts: { x: number; y: number }[], minPx = 1.2): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = out[out.length - 1];
    if (Math.hypot(pts[i].x - a.x, pts[i].y - a.y) >= minPx) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// Light grayscale basemap: prints clean in B&W and lets dark route lines stand out.
const STYLES = [
  'feature:all|saturation:-100',
  'feature:all|element:geometry|lightness:35',
  'feature:road|element:labels|lightness:10',
  'feature:poi|visibility:off',
  'feature:transit|visibility:off',
  'feature:administrative.land_parcel|visibility:off',
];

export function staticMapUrl(frame: Frame, apiKey: string, scale: 1 | 2 = 2): string {
  const q = new URLSearchParams({
    center: `${frame.center.lat.toFixed(6)},${frame.center.lng.toFixed(6)}`,
    zoom: String(frame.zoom),
    size: `${Math.round(frame.width)}x${Math.round(frame.height)}`,
    scale: String(scale),
    maptype: 'roadmap',
    format: 'png',
    key: apiKey,
  });
  for (const s of STYLES) q.append('style', s);
  return `https://maps.googleapis.com/maps/api/staticmap?${q.toString()}`;
}
