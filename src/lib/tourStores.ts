// Starbucks Atlas + licensed store data for tours: store icons (the same PNGs the main map
// layers use) and bounded store fetches for the tour map and the PDF's store overlay.
import { supabase } from './supabaseClient';

// starbucks_snapshot.store_type → logo (StarbucksAtlasLogosLayer uses the same files).
export const ATLAS_TYPE_ICON: Record<string, string> = {
  DT: '/Images/SBUX-ATLAS-DT.png',
  Cafe: '/Images/SBUX-ATLAS-CAFE.png',
  DTO: '/Images/SBUX-ATLAS-DTO.png',
};
export const ATLAS_DEFAULT_ICON = '/Images/SBUX-ATLAS-CAFE.png';

// starbucks_licensed_store.store_type → logo (StarbucksLicensedStoreLayer uses the same files).
export const LICENSED_TYPE_ICON: Record<string, string> = {
  Cafe: '/Images/LICENSE-CAFE.png',
  'Drive Thru': '/Images/License DT.png',
  Kiosk: '/Images/LICENSE-KIOSK.png',
};
export const LICENSED_DEFAULT_ICON = '/Images/LICENSE-CAFE.png';

export const atlasIcon = (type: string | null | undefined) => (type && ATLAS_TYPE_ICON[type]) || ATLAS_DEFAULT_ICON;
export const licensedIcon = (type: string | null | undefined) => (type && LICENSED_TYPE_ICON[type]) || LICENSED_DEFAULT_ICON;

export interface TourStoreRef {
  kind: 'atlas_store' | 'licensed_store';
  store_number: string;
  store_name: string | null;
  address: string | null;
  city: string | null;
  market: string | null;
  lat: number;
  lng: number;
  store_type: string | null;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

// Latest snapshot store_type per Atlas store number. Snapshots accumulate quarterly (751 rows
// for 281 stores in Nov 2026), so page through them.
async function atlasTypes(storeNumbers: string[]): Promise<Map<string, string | null>> {
  const m = new Map<string, string | null>();
  if (storeNumbers.length === 0) return m;
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('starbucks_snapshot')
      .select('store_number, store_type, snapshot_date')
      .in('store_number', storeNumbers)
      .order('snapshot_date', { ascending: false })
      .order('store_number', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    (data ?? []).forEach((r: any) => {
      if (!m.has(r.store_number)) m.set(r.store_number, r.store_type ?? null);
    });
    if ((data?.length ?? 0) < PAGE) break;
  }
  return m;
}

/** Atlas stores, optionally limited to a bounding box. */
export async function fetchAtlasStores(b?: Bounds): Promise<TourStoreRef[]> {
  let q = supabase
    .from('starbucks_store')
    .select('store_number, store_name, city, market, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (b) q = q.gte('latitude', b.south).lte('latitude', b.north).gte('longitude', b.west).lte('longitude', b.east);
  const { data, error } = await q.range(0, 999);
  if (error) throw error;
  const rows = (data ?? []) as any[];
  const types = await atlasTypes(rows.map((r) => r.store_number));
  return rows.map((r) => ({
    kind: 'atlas_store' as const,
    store_number: r.store_number,
    store_name: r.store_name ?? null,
    address: null, // Atlas data carries no street address
    city: r.city ?? null,
    market: r.market ?? null,
    lat: r.latitude,
    lng: r.longitude,
    store_type: types.get(r.store_number) ?? null,
  }));
}

/** Licensed stores (verified coordinates win), optionally limited to a bounding box. */
export async function fetchLicensedStores(b?: Bounds): Promise<TourStoreRef[]> {
  const { data, error } = await supabase
    .from('starbucks_licensed_store')
    .select('store_number, store_name, address, city, state, market_name, store_type, latitude, longitude, verified_latitude, verified_longitude')
    .range(0, 999);
  if (error) throw error;
  return ((data ?? []) as any[])
    .map((r): TourStoreRef | null => {
      const lat = r.verified_latitude ?? r.latitude;
      const lng = r.verified_longitude ?? r.longitude;
      return lat == null || lng == null
        ? null
        : {
            kind: 'licensed_store' as const,
            store_number: r.store_number,
            store_name: r.store_name ?? null,
            address: r.address ?? null,
            city: r.city ?? null,
            market: r.market_name ?? null,
            lat,
            lng,
            store_type: r.store_type ?? null,
          };
    })
    .filter((s): s is TourStoreRef => s !== null && (!b || (s.lat >= b.south && s.lat <= b.north && s.lng >= b.west && s.lng <= b.east)));
}

/** store_type for the store stops on a tour (icons). */
export async function fetchStoreTypes(atlasNumbers: string[], licensedNumbers: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const [a, l] = await Promise.all([
    atlasTypes(atlasNumbers),
    licensedNumbers.length
      ? supabase.from('starbucks_licensed_store').select('store_number, store_type').in('store_number', licensedNumbers)
      : Promise.resolve({ data: [], error: null } as any),
  ]);
  a.forEach((v, k) => out.set(`atlas_store:${k}`, v));
  if (l.error) throw l.error;
  (l.data ?? []).forEach((r: any) => out.set(`licensed_store:${r.store_number}`, r.store_type ?? null));
  return out;
}
