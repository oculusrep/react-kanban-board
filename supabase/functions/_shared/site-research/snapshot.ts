/**
 * Data-quality flags derived from the frozen site snapshot.
 *
 * Why: a property that was never Esri-enriched has every demographic field null
 * (Macon, 2026-09-15: pop_1/3/5, households, income, daytime, esri_enriched_at all null).
 * Without a flag the report reads as if the market were thin. With it, the report says
 * at the top that two categories are empty for a DATA reason.
 */

export const ESRI_FIELDS = [
  'pop_1_mile', 'pop_3_mile', 'pop_5_mile',
  'households_1_mile', 'households_3_mile',
  'hh_income_median_1_mile', 'hh_income_median_3_mile', 'hh_income_median_5_mile',
  'daytime_pop_1_mile', 'daytime_pop_3_mile',
  'median_age_3_mile',
  'tapestry_segment_code', 'tapestry_segment_name',
] as const;

export type EsriStatus = 'missing' | 'partial' | 'present';

export interface EsriDataQuality {
  status: EsriStatus;
  esri_enriched_at: string | null;
  missing_fields: string[];
  note: string;
}

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '');

/**
 * missing  = no enrichment date and every Esri field blank (or no property at all)
 * partial  = some Esri fields blank, or fields present with no enrichment date
 * present  = enriched and every field populated
 */
export function esriDataQuality(property: Record<string, unknown> | null | undefined): EsriDataQuality {
  const enrichedAt = property && !isBlank(property.esri_enriched_at) ? String(property.esri_enriched_at) : null;
  const missing = ESRI_FIELDS.filter((f) => !property || isBlank(property[f]));
  if (!property || (enrichedAt === null && missing.length === ESRI_FIELDS.length)) {
    return {
      status: 'missing',
      esri_enriched_at: null,
      missing_fields: [...ESRI_FIELDS],
      note: 'This property has no Esri demographic enrichment. Population, households, income, daytime population, median age and Tapestry are all empty for a data reason, not a market reason.',
    };
  }
  if (missing.length > 0 || enrichedAt === null) {
    return {
      status: 'partial',
      esri_enriched_at: enrichedAt,
      missing_fields: [...missing],
      note: enrichedAt === null
        ? 'Esri fields are present but the property has no enrichment date; the named fields are empty.'
        : 'The property is Esri-enriched but the named fields are empty.',
    };
  }
  return { status: 'present', esri_enriched_at: enrichedAt, missing_fields: [], note: 'Esri demographics present.' };
}

/** The data_quality block for a pinned_context; computed from the snapshot's own property fields. */
export function dataQualityFor(pinnedContext: unknown): { esri: EsriDataQuality } {
  const property = (pinnedContext as { property?: Record<string, unknown> | null } | null)?.property ?? null;
  return { esri: esriDataQuality(property) };
}
