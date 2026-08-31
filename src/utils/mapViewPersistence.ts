/**
 * Persist the user's map view (center + zoom) and enabled layers across
 * navigation / reloads.
 *
 * Why: navigating from the map to another route (e.g. the Tour menu) unmounts
 * GoogleMapContainer and the LayerManagerProvider, so all in-memory map state
 * is lost and the user has to re-pan and re-toggle every layer when they come
 * back. Writing the view + layer visibility to localStorage lets us restore
 * "their place" on remount. localStorage (not sessionStorage) so it also
 * survives a full app restart — the "keep my place" behavior Mike asked for.
 *
 * All reads/writes are wrapped in try/catch: a corrupt value or a browser with
 * storage disabled must never break the map.
 */

const VIEW_KEY_PREFIX = 'ovis_map_view:';
const LAYER_VISIBILITY_KEY = 'ovis_map_layer_visibility';
const LAYER_VISIBILITY_VERSION_KEY = 'ovis_map_layer_visibility_version';
const CUSTOM_LAYER_VISIBILITY_KEY = 'ovis_map_custom_layer_visibility';

/**
 * Bump this to force-reset every user's persisted system-layer visibility.
 *
 * A default of `defaultVisible: true` for the Properties layer shipped briefly
 * (Sep 26 2025) before being reverted. Users who loaded the map in that window
 * cached `{ properties: true }` in localStorage, so the map opened with
 * Properties toggled on even though the code default is now `false`. Discarding
 * the stale prefs once lets every layer fall back to its code default (all off)
 * — the intended "nothing toggled on by default" behavior.
 */
const LAYER_VISIBILITY_VERSION = '2';

export interface SavedMapView {
  lat: number;
  lng: number;
  zoom: number;
}

export function loadMapView(key: string): SavedMapView | null {
  try {
    const raw = localStorage.getItem(VIEW_KEY_PREFIX + key);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (
      v &&
      typeof v.lat === 'number' &&
      typeof v.lng === 'number' &&
      typeof v.zoom === 'number'
    ) {
      return v as SavedMapView;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveMapView(key: string, view: SavedMapView): void {
  try {
    localStorage.setItem(VIEW_KEY_PREFIX + key, JSON.stringify(view));
  } catch {
    // storage full / disabled — non-fatal
  }
}

/** Read the current center/zoom off a map instance and persist it. */
export function saveMapViewFromInstance(key: string, map: google.maps.Map): void {
  const center = map.getCenter();
  const zoom = map.getZoom();
  if (!center || zoom == null) return;
  saveMapView(key, { lat: center.lat(), lng: center.lng(), zoom });
}

/** System layer visibility: { [layerId]: isVisible }. */
export function loadLayerVisibility(): Record<string, boolean> {
  try {
    // One-time migration: on a version bump, discard stale prefs (e.g. a
    // properties:true default that was reverted) and stamp the new version so
    // layers fall back to their code defaults.
    if (localStorage.getItem(LAYER_VISIBILITY_VERSION_KEY) !== LAYER_VISIBILITY_VERSION) {
      localStorage.removeItem(LAYER_VISIBILITY_KEY);
      localStorage.setItem(LAYER_VISIBILITY_VERSION_KEY, LAYER_VISIBILITY_VERSION);
      return {};
    }
    const raw = localStorage.getItem(LAYER_VISIBILITY_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveLayerVisibility(visibility: Record<string, boolean>): void {
  try {
    localStorage.setItem(LAYER_VISIBILITY_KEY, JSON.stringify(visibility));
  } catch {
    // non-fatal
  }
}

/** Custom (user-drawn) layer visibility: { [layerId]: isVisible }. */
export function loadCustomLayerVisibility(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CUSTOM_LAYER_VISIBILITY_KEY);
    if (!raw) return {};
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? (v as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function saveCustomLayerVisibility(visibility: Record<string, boolean>): void {
  try {
    localStorage.setItem(CUSTOM_LAYER_VISIBILITY_KEY, JSON.stringify(visibility));
  } catch {
    // non-fatal
  }
}
