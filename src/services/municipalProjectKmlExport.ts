/**
 * The Municipality layer's KML export button: fetch + download.
 *
 * The KML itself is built by supabase/functions/_shared/municipal-project-kml.ts, shared with
 * site research so the two cannot drift. Everything browser-specific stays here.
 */

import { supabase } from '../lib/supabaseClient';
import {
  buildKml,
  isUnverified,
  type MunicipalProjectExportRow,
} from '../../supabase/functions/_shared/municipal-project-kml';

export { buildKml, isUnverified };
export type { MunicipalProjectExportRow };

export function downloadKml(filename: string, kml: string): void {
  const blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.kml') ? filename : `${filename}.kml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so the download has time to start.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Fetch a paged set of projects from the view, optionally filtered to a set of IDs.
 * Returns only rows with a non-null geometry (we can't export pins as KML polygons).
 */
export async function fetchProjectsForExport(projectIds?: string[]): Promise<MunicipalProjectExportRow[]> {
  const PAGE = 1000;
  const out: MunicipalProjectExportRow[] = [];
  let offset = 0;
  while (true) {
    let q = supabase
      .from('municipal_project_v')
      .select(
        'id, project_name, phase_label, address, parcel_numbers, single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units, total_housing_units, zoning, zoning_approval_date, notes, municipality_id, municipality_name, municipality_state, effective_stage_id, effective_stage_name, effective_stage_color, geometry_geojson, discovery_source, centroid_lat, centroid_lng, geometry_needs_review, geometry_area_variance_pct'
      )
      .not('geometry_geojson', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (projectIds && projectIds.length > 0) q = q.in('id', projectIds);
    const { data, error } = await q;
    if (error) throw error;
    out.push(...((data ?? []) as unknown as MunicipalProjectExportRow[]));
    if (!data || data.length < PAGE) break;
    offset += PAGE;
  }

  // Join the per-stage abbreviation client-side. The view doesn't expose it, and
  // adding a column to the view would require touching an untracked view def.
  // Cheap: one extra SELECT, ~5 rows.
  const { data: stages, error: stagesErr } = await supabase
    .from('project_stage')
    .select('id, abbreviation');
  if (stagesErr) throw stagesErr;
  const abbrById = new Map<string, string | null>();
  for (const s of stages ?? []) {
    abbrById.set((s as { id: string }).id, ((s as { abbreviation: string | null }).abbreviation) ?? null);
  }
  for (const r of out) {
    r.effective_stage_abbreviation = r.effective_stage_id ? abbrById.get(r.effective_stage_id) ?? null : null;
  }
  return out;
}
