/**
 * County / city parcel layers that carry a SUBDIVISION NAME field, for the
 * parcel subdivisions pass (_shared/research-parcel-subdivisions.ts).
 * Pure data + fetch (no Deno, DOM or Supabase APIs).
 *
 * Checked 2026-11-16: no Henry County or Locust Grove layer has a year-built
 * field (that lives only in the qPublic CAMA records), so the year comes from a
 * Gemini web search per subdivision. Doc: docs/MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md
 */

import { COUNTY_ADAPTERS } from './parcel-adapters.ts';

export interface SubdivisionLayer {
  label: string;               // "Henry County parcel layer"
  county: string;              // "Henry County" — key for the established layer
  url: string;                 // ArcGIS layer (…/MapServer/N)
  /** Municipality names in the site radius that make this layer relevant. */
  matches: (municipalityName: string) => boolean;
  /** Earlier = wins when the same parcel is in two layers. */
  priority: number;
  timeoutMs: number;
  retries: number;
  /** Field names. Each county names them differently. */
  fields: {
    id: string;
    subdivision: string;
    /** Zoning code (Henry) — commercial / office / industrial parcels are dropped. */
    zoning?: string;
    /** Property class text (Hall's DIGCLASS_DESC) — non-residential classes are dropped. */
    propertyClass?: string;
    city?: string;
  };
}

const HENRY = /^(henry county|mcdonough|stockbridge|hampton|locust grove)$/i;
/** Same municipality coverage as the county's parcel adapter. */
const adapterMatch = (label: string) => {
  const a = COUNTY_ADAPTERS.find((x) => x.label === label);
  if (!a) throw new Error(`no parcel adapter labelled ${label}`);
  return a.matches;
};

export const SUBDIVISION_LAYERS: SubdivisionLayer[] = [
  {
    // The city's own copy on Henry's server. Answers even when the county layer hangs.
    label: 'City of Locust Grove parcel layer',
    county: 'Henry County',
    url: 'https://arcgis.co.henry.ga.us/server/rest/services/Locust_Grove/Locust_Grove/MapServer/1',
    matches: (n) => /^(locust grove|henry county)$/i.test(n),
    priority: 1, timeoutMs: 75_000, retries: 1,
    fields: { id: 'PARCEL_NO', subdivision: 'SUBDIVISIO', zoning: 'ZONING', city: 'POSTALCITY' },
  },
  {
    // Same Imperva-fronted server as the parcel adapter: often slow, sometimes
    // hung (every query 503 "Wait timeout" on 2026-11-16).
    label: 'Henry County parcel layer',
    county: 'Henry County',
    url: 'https://arcgis.co.henry.ga.us/server/rest/services/Parcels/MapServer/12',
    matches: (n) => HENRY.test(n),
    priority: 2, timeoutMs: 75_000, retries: 1,
    fields: { id: 'PARCEL_NO', subdivision: 'SUBDIVISIO', zoning: 'ZONING', city: 'POSTALCITY' },
  },
  {
    // Hall's public AGOL layer (same as the parcel adapter). SUBD_NAME is filled
    // on ~33% of parcels, 298 subdivisions of 25+ (checked 2026-11-16); blanks
    // are space-padded. No zoning field: DIGCLASS_DESC (Residential /
    // Agricultural / Commercial / Industrial / Exempt …) is the residential test.
    label: 'Hall County parcel layer',
    county: 'Hall County',
    url: 'https://services1.arcgis.com/3t0UAc8xSMWWaD2c/arcgis/rest/services/parcel_owner_public/FeatureServer/0',
    matches: adapterMatch('Hall County'),
    priority: 1, timeoutMs: 60_000, retries: 1,
    fields: { id: 'PIN', subdivision: 'SUBD_NAME', propertyClass: 'DIGCLASS_DESC', city: 'SITE_CITY' },
  },
  {
    // Coweta's weekly AGOL layer (same as the parcel adapter). SubdivisionName is
    // filled on ~74% of parcels, 502 subdivisions of 25+ (2026-11-16). It also
    // holds appraisal catch-alls ("Newnan City", "Senoia City Secondary",
    // "MLK/Pinson"), dropped by name. No zoning or class field. The layer also
    // has YearBuilt (not used yet: the pass dates every subdivision with Gemini).
    label: 'Coweta County parcel layer',
    county: 'Coweta County',
    url: 'https://services1.arcgis.com/AaPyNbrJpNGryRqh/ArcGIS/rest/services/WeeklyUpdate_WinGapParcels/FeatureServer/0',
    matches: adapterMatch('Coweta County'),
    priority: 1, timeoutMs: 60_000, retries: 1,
    fields: { id: 'ParcelNumber', subdivision: 'SubdivisionName', city: 'City' },
  },
];

/**
 * Checked 2026-11-16 and NOT registered:
 * - Forsyth (Tax_Parcel): no subdivision name field (has RESYRBLT year built, NGHBRHDCD code).
 * - Newton (2022 snapshot): Subdivisio field exists, blank on all 45,755 parcels.
 * - Clayton (TaxAssessor/Parcels): SUBDNAME exists, blank on all 92,100 parcels.
 * - Houston (Warner Robins Base_Map_Polygon): PlaceName filled on ~5% of parcels.
 * - Cobb (taxassessorsdaily): NAME filled on ~4% (mostly condos); SUBDIVNUM is a code.
 * - Paulding (FeatureServer/25): SubdivID is a code, no name.
 * - Barrow (BCGIS_Base_Layers/120): parcel number only.
 * Houston, Cobb, Paulding, Clayton and Barrow also have no parcel adapter.
 */

export const layersFor = (municipalityNames: string[]): SubdivisionLayer[] =>
  SUBDIVISION_LAYERS.filter((l) => municipalityNames.some((n) => l.matches(n.trim())))
    .sort((a, b) => a.priority - b.priority);

/** Property classes that are not residential (Hall DIGCLASS_DESC). */
const NON_RES_CLASS = /commercial|industrial|exempt|utility|historical/i;
export const isResidentialClass = (c: string | null | undefined) => !c || !NON_RES_CLASS.test(c);

/** Zoning that is not residential: commercial, office, industrial. */
const NON_RES_ZONING = /^(c|oi|o-i|o|m|i|li|hi|b|bp|cbd|ind|com)(-?\d+[a-z]?)?$/i;
export const isResidentialZoning = (z: string | null | undefined) => !z || !NON_RES_ZONING.test(z.trim());

/** Names that are not neighborhoods. */
const NON_RES_NAME = /\b(professional|business|office|offices|industrial|commerce|commercial|plaza|shopping|retail|warehouse|logistics|distribution|medical|church|school|marketplace|outlets?|storage|interchange|tech park|corporate)\b/i;
/** Appraisal catch-alls stored as a subdivision name ("Newnan City", "Newnan
 *  City Secondary", "MLK/Pinson", "Acreage"). */
const NOT_A_SUBDIVISION = /(\bcity( secondary)?$)|[a-z]{2,}\/[a-z]{2,}|^(acreage|acres|rural|unsubdivided|no subdivision|none|misc(ellaneous)?|metes and bounds)$/i;
export const isResidentialName = (n: string) => !NON_RES_NAME.test(n) && !NOT_A_SUBDIVISION.test(n.trim());
/** Mobile home parks: existing housing, not a subdivision build-out. */
const MOBILE_HOME = /\b(mhp|mobile home|manufactured home|trailer)\b/i;

export const normName = (n: string) => n.trim().replace(/\s+/g, ' ').toUpperCase();

/** "HAWTHORNE AT LINDEN PARK" → "Hawthorne at Linden Park"; keeps MHP / L G. */
export function titleCase(n: string): string {
  const small = new Set(['at', 'of', 'the', 'and', 'on', 'in', 'aka']);
  return normName(n).split(' ').map((w, i) => {
    const lw = w.toLowerCase();
    if (i > 0 && small.has(lw)) return lw;
    if (/^(MHP|LLC|II|III|IV)$/.test(w) || w.length === 1) return w;
    return lw.replace(/(^|[-'’])([a-z])/g, (_m, p, c) => p + c.toUpperCase());
  }).join(' ');
}

export interface ParcelFeature {
  parcelNo: string;
  subdivision: string;
  zoning: string | null;
  propertyClass: string | null;
  city: string | null;
  geometry: unknown;
  layer: SubdivisionLayer;
}

async function getJson(layer: SubdivisionLayer, url: string): Promise<any> {
  let last = '';
  for (let attempt = 0; attempt <= layer.retries; attempt++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), layer.timeoutMs);
    try {
      const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 (OVIS research)' } });
      if (!res.ok) { last = `HTTP ${res.status}`; continue; }
      const body = await res.json();
      if (body?.error) { last = String(body.error.message ?? 'query failed'); continue; }
      return body;
    } catch (e) {
      last = ctl.signal.aborted ? `no answer after ${Math.round(layer.timeoutMs / 1000)} s` : (e instanceof Error ? e.message : String(e));
    } finally {
      clearTimeout(t);
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`${layer.label} didn't respond (${last})`);
}

/** Every parcel with a subdivision name within radiusMi of the point. GeoJSON, paged. */
export async function fetchSubdivisionParcels(
  layer: SubdivisionLayer, lat: number, lng: number, radiusMi: number,
): Promise<ParcelFeature[]> {
  const out: ParcelFeature[] = [];
  const F = layer.fields;
  const str = (v: unknown) => (v == null ? null : String(v).trim() || null);
  const page = 1000;
  for (let offset = 0; offset < 50_000; offset += page) {
    const params = new URLSearchParams({
      // Hall and Coweta pad blanks with spaces; a real name never starts with one.
      where: `${F.subdivision} IS NOT NULL AND ${F.subdivision} <> '' AND ${F.subdivision} NOT LIKE ' %'`,
      geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: '4326',
      spatialRel: 'esriSpatialRelIntersects', distance: String(radiusMi), units: 'esriSRUnit_StatuteMile',
      outFields: [F.id, F.subdivision, F.zoning, F.propertyClass, F.city].filter(Boolean).join(','),
      returnGeometry: 'true', outSR: '4326',
      geometryPrecision: '6', orderByFields: 'OBJECTID', resultOffset: String(offset), resultRecordCount: String(page),
      f: 'geojson',
    });
    const body = await getJson(layer, `${layer.url}/query?${params}`);
    const feats = body?.features ?? [];
    for (const f of feats) {
      const p = f?.properties ?? {};
      const sub = str(p[F.subdivision]);
      const id = str(p[F.id]);
      if (!sub || !id || !f.geometry) continue;
      out.push({
        parcelNo: id.replace(/[^0-9A-Za-z]/g, '').toUpperCase(),
        subdivision: normName(sub),
        zoning: F.zoning ? str(p[F.zoning]) : null,
        propertyClass: F.propertyClass ? str(p[F.propertyClass]) : null,
        city: F.city ? str(p[F.city]) : null,
        geometry: f.geometry, layer,
      });
    }
    if (feats.length < page && !body?.exceededTransferLimit) break;
  }
  return out;
}

export interface SubdivisionGroup {
  key: string;            // normalized name
  county: string;         // the layer's county (key for the established layer)
  name: string;           // title case
  parcels: ParcelFeature[];
  city: string | null;    // most common postal city
  layers: string[];
  skipped_non_res_parcels: number;
}

export interface GroupResult {
  groups: SubdivisionGroup[];
  skipped: { name: string; parcels: number; reason: string }[];
}

/** Dedupe parcels across layers (priority wins), keep residential, group by name, ≥ minParcels. */
export function groupSubdivisions(features: ParcelFeature[], minParcels = 25): GroupResult {
  const byParcel = new Map<string, ParcelFeature>();
  for (const f of [...features].sort((a, b) => a.layer.priority - b.layer.priority)) {
    if (!byParcel.has(f.parcelNo)) byParcel.set(f.parcelNo, f);
  }
  const groups = new Map<string, SubdivisionGroup>();
  for (const f of byParcel.values()) {
    if (!f.subdivision) continue;
    let g = groups.get(f.subdivision);
    if (!g) {
      g = { key: f.subdivision, county: f.layer.county, name: titleCase(f.subdivision), parcels: [], city: null, layers: [], skipped_non_res_parcels: 0 };
      groups.set(f.subdivision, g);
    }
    if (!isResidentialZoning(f.zoning) || !isResidentialClass(f.propertyClass)) { g.skipped_non_res_parcels++; continue; }
    g.parcels.push(f);
  }
  const kept: SubdivisionGroup[] = [];
  const skipped: GroupResult['skipped'] = [];
  for (const g of groups.values()) {
    const n = g.parcels.length;
    if (!isResidentialName(g.name)) { skipped.push({ name: g.name, parcels: n, reason: 'non-residential name' }); continue; }
    if (MOBILE_HOME.test(g.name)) { skipped.push({ name: g.name, parcels: n, reason: 'mobile home park' }); continue; }
    if (n === 0) { skipped.push({ name: g.name, parcels: g.skipped_non_res_parcels, reason: 'non-residential zoning / class' }); continue; }
    if (n < minParcels) { skipped.push({ name: g.name, parcels: n, reason: `under ${minParcels} parcels` }); continue; }
    const cities = new Map<string, number>();
    for (const p of g.parcels) if (p.city) cities.set(p.city, (cities.get(p.city) ?? 0) + 1);
    g.city = [...cities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    g.layers = [...new Set(g.parcels.map((p) => p.layer.label))];
    kept.push(g);
  }
  kept.sort((a, b) => b.parcels.length - a.parcels.length);
  return { groups: kept, skipped };
}
