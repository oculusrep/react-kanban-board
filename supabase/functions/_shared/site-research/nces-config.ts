/**
 * NCES data-source configuration for query_nearby_schools.
 *
 * The ArcGIS service names live here, not inline in the tool, because NCES renames and
 * repoints them: the service literally named `Public_School_Location_201819` now
 * describes itself as "Current". When a query starts failing with "service not found"
 * or returns an old SCHOOLYEAR, this file is the only thing to change.
 *
 * Browse the catalog to find current names:
 *   https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services
 *
 * Private school ENROLLMENT is not here: it exists only in the PSS bulk file, which is
 * loaded into public.nces_private_school by scripts/nces/load_pss.py. Private physical
 * locations are (privateLocations).
 */
export const NCES_ARCGIS = {
  baseUrl: 'https://services1.arcgis.com/Ua5sjt3LWTPigjyD/arcgis/rest/services',

  /** Point locations for every CCD public school. Fields: NCESSCH, NAME, STREET, CITY,
   *  STATE, ZIP, LAT, LON, LOCALE, SCHOOLYEAR. Supports point + radius queries. */
  publicLocations: { service: 'Public_School_Locations_Current', layer: 0 },

  /** CCD school characteristics, joined to locations on NCESSCH. Enrollment is TOTAL
   *  (includes pre-K); negative values are NCES "missing / not applicable / not
   *  reported" codes. Also SURVYEAR, SCHOOL_LEVEL, GSLO/GSHI, SY_STATUS_TEXT. */
  publicCharacteristics: { service: 'School_Characteristics_Current', layer: 1 },

  /** EDGE geocoded PHYSICAL locations for PSS private schools. Fields: PPIN, NAME, STREET, CITY,
   *  STATE, ZIP, LAT, LON, SCHOOLYEAR. Used by the deep pass to confirm a mailing-flagged PSS
   *  address before spending a web search on it (verified 2026-09-15: PPIN lookup returns the
   *  physical street). */
  privateLocations: { service: 'Private_School_Locations_Current', layer: 0 },

  /** Per-request timeout for NCES calls. */
  timeoutMs: 15000,

  /** NCESSCH values per characteristics request (keeps the IN (...) clause bounded). */
  characteristicsBatchSize: 100,
} as const;

export function arcgisQueryUrl(target: { service: string; layer: number }): string {
  return `${NCES_ARCGIS.baseUrl}/${target.service}/FeatureServer/${target.layer}/query`;
}
