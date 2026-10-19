/**
 * Housing pipeline: one count, shared by the map modal and site research.
 *
 * The counting lives in SQL (site_pipeline_matrix, 20260927085437). This module only calls it,
 * shapes the tool result, and builds pipeline.csv. Nothing here re-counts anything.
 *
 * Two membership tests come back, labelled: CENTROID (the pin sits inside the catchment) and
 * INTERSECTS (the drawn boundary clips it). The weighted index uses centroid — intersects credits a
 * 600-unit project in full to a ring its edge touches. Macon 2026-09-27: 3 mi is 1,732 by centroid
 * and 1,822 by intersects; the 10-minute shed is 1,924 and 2,478.
 */

import { buildPipelineRow, csvBytes, PIPELINE_COLUMNS, type PipelineRow, pipelineSort, toCsv } from '../csv.ts';

export const PIPELINE_BANDS = ['1mi', '3mi', '5min', '10min'] as const;
export type PipelineBand = (typeof PIPELINE_BANDS)[number];

export interface PipelineBandResult {
  band: PipelineBand;
  households: number | null;
  phases: Record<string, {
    units_centroid: number; projects_centroid: number;
    units_intersects: number; projects_intersects: number;
  }>;
  total_units_centroid: number;
  total_units_intersects: number;
  weighted_units: number;
  /** weighted units / existing households in the same band; null when households are unknown. */
  weighted_index: number | null;
}

export interface PipelineProject {
  name: string | null; units: number | null; phase: string | null;
  distance_mi: number | null; drive_time_band: string | null;
  address: string | null; lat: number | null; lng: number | null;
  status_source: string | null; source: string | null;
  phase_weight: number | null; distance_weight: number | null;
  recently_completed_timing_unknown: boolean;
}

export interface PipelinePending {
  name: string | null; units: number | null; phase: 'unreviewed';
  address: string | null; source: string | null; collected_at: string | null;
}

export interface PipelineCoverage {
  projects_within_10mi: number;
  last_collected_at: string | null;
  research_runs_for_site: number;
  last_research_run_at: string | null;
  pending_rows: number;
}

export interface PipelineMatrix {
  site: { latitude: number; longitude: number };
  isochrones_from: string | null;
  isochrones_pulled_m_from_site: number | null;
  has_5min: boolean;
  has_10min: boolean;
  bands: PipelineBandResult[];
  projects: PipelineProject[];
  pending_unreviewed: PipelinePending[];
  coverage: PipelineCoverage;
  weights: Record<string, unknown>;
}

/** Households per band from the frozen snapshot — demographics keep one source. */
export function householdsByBand(demographics: unknown): Record<string, number> {
  const d = demographics as {
    rings?: Array<{ radius_miles: number; households: number | null }>;
    drive_times?: Array<{ minutes: number; households: number | null }>;
  } | null;
  const out: Record<string, number> = {};
  for (const r of d?.rings ?? []) {
    if (typeof r.households === 'number' && (r.radius_miles === 1 || r.radius_miles === 3)) {
      out[`${r.radius_miles}mi`] = r.households;
    }
  }
  for (const t of d?.drive_times ?? []) {
    if (typeof t.households === 'number' && (t.minutes === 5 || t.minutes === 10)) {
      out[`${t.minutes}min`] = t.households;
    }
  }
  return out;
}

// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export async function fetchPipelineMatrix(
  service: Rpc,
  site: { latitude: number; longitude: number },
  households: Record<string, number>,
  siteSubmitId: string | null,
): Promise<PipelineMatrix> {
  const { data, error } = await service.rpc('site_pipeline_matrix', {
    p_latitude: site.latitude, p_longitude: site.longitude,
    p_households: households, p_site_submit_id: siteSubmitId,
  });
  if (error) throw new Error(`site_pipeline_matrix failed: ${error.message}`);
  return data as PipelineMatrix;
}

/**
 * A thin result is only a finding when somebody has actually collected here. Never let
 * "no projects" read as "no pipeline" when it means "nobody has looked".
 */
export function coverageVerdict(c: PipelineCoverage): { collected: boolean; note: string } {
  if (c.projects_within_10mi === 0) {
    return {
      collected: false,
      note: c.research_runs_for_site === 0
        ? 'COVERAGE GAP: no municipal projects have been collected within 10 mi of this site and Market Research has never been run for it. A thin pipeline here is unknown, not a finding — say so, and do not rest the archetype call on it.'
        : `COVERAGE GAP: Market Research has run for this site (${c.research_runs_for_site} run(s), last ${c.last_research_run_at ?? 'unknown'}) but no projects within 10 mi were committed. Treat the pipeline as uncollected, not as empty.`,
    };
  }
  return {
    collected: true,
    note: `${c.projects_within_10mi} human-reviewed project(s) on file within 10 mi, last collected ${c.last_collected_at ?? 'unknown'}${c.pending_rows ? `; ${c.pending_rows} unreviewed row(s) excluded from every total` : ''}. A low count here is a real finding.`,
  };
}

export function buildPipelineCsv(m: PipelineMatrix): { csv: string; rows: PipelineRow[]; flagged: number } {
  const rows: PipelineRow[] = [];
  for (const p of m.projects ?? []) {
    rows.push(buildPipelineRow({
      name: p.name, units: p.units, phase: p.phase, distance_miles: p.distance_mi,
      drive_time_band: p.drive_time_band, street: p.address, city: null, state: null, zip: null,
      latitude: p.lat, longitude: p.lng, status_source: p.status_source, source: p.source,
      notes: p.recently_completed_timing_unknown
        ? 'Recently Completed: completion date not recorded, so it may not yet be inside the Esri household base'
        : null,
    }));
  }
  for (const p of m.pending_unreviewed ?? []) {
    rows.push(buildPipelineRow({
      name: p.name, units: p.units, phase: 'unreviewed', distance_miles: null, drive_time_band: null,
      street: p.address, city: null, state: null, zip: null, latitude: null, longitude: null,
      status_source: 'municipal_project_staging', source: p.source,
      notes: 'Agent-discovered, not human-reviewed: excluded from every total',
    }));
  }
  rows.sort(pipelineSort);
  return { csv: toCsv(PIPELINE_COLUMNS, rows), rows, flagged: rows.filter((r) => r.flag === 'CHECK').length };
}

export { csvBytes };
