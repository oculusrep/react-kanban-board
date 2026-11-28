/**
 * One KML per municipality, into the site submit's Dropbox folder beside the CSVs.
 *
 * WHICH municipalities: those holding a project within MUNICIPALITY_RADIUS_MILES of the site,
 * the same 10 mi the pipeline matrix uses.
 *
 * WHAT GOES IN ONE: the municipality's WHOLE project set, not the part inside the radius. That
 * matches the export button, which is how these files are imported today — the radius decides
 * which files you get, never what is inside one. A radius-clipped file would be a different
 * artifact wearing a familiar name.
 *
 * Polygons where a boundary exists, points where it does not — 22.3% of projects have no polygon
 * and most never will, so dropping them made a file that looked complete while leaving a third of
 * some municipalities out of frame. A point is styled distinctly and named [NO BOUNDARY]. Only a
 * project with neither a polygon nor a centroid is unplaceable, and that count leads the footer.
 *
 * Unreviewed rows are INCLUDED, matching the button and the map layer, and marked [UNVERIFIED]
 * in terracotta by the shared builder.
 */

import { buildKml, isPointOnly, isUnverified, type MunicipalProjectExportRow } from '../municipal-project-kml.ts';

export const MUNICIPALITY_RADIUS_MILES = 10;

export interface MunicipalityKml {
  municipality: string;
  state: string | null;
  filename: string;
  kml: string;
  polygons: number;    // drawn boundaries
  points: number;      // no boundary on file, pinned at the centroid
  unplaceable: number; // neither a boundary nor a centroid: genuinely absent
  unverified: number;  // agent-discovered, marked [UNVERIFIED]
}

/** Safe for Dropbox and readable in a folder listing: "Macon-Bibb County GA.kml". */
export function kmlFilename(municipality: string, state: string | null): string {
  const base = [municipality, state].filter(Boolean).join(' ')
    .replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return `${base || 'municipality'}.kml`;
}

// deno-lint-ignore no-explicit-any
type Service = { rpc: (fn: string, args?: Record<string, unknown>) => any; from: (t: string) => any };

const SELECT =
  'id, project_name, phase_label, address, parcel_numbers, single_family_lots, townhouse_units, ' +
  'duplex_units, apt_units, cottage_units, total_housing_units, zoning, zoning_approval_date, notes, ' +
  'municipality_id, municipality_name, municipality_state, effective_stage_id, effective_stage_name, ' +
  'effective_stage_color, geometry_geojson, discovery_source, centroid_lat, centroid_lng, geometry_needs_review, geometry_area_variance_pct';

export async function buildMunicipalityKmls(
  service: Service,
  site: { latitude: number; longitude: number },
): Promise<MunicipalityKml[]> {
  const { data: ids, error: idErr } = await service.rpc('municipalities_near_point', {
    p_latitude: site.latitude, p_longitude: site.longitude, p_radius_miles: MUNICIPALITY_RADIUS_MILES,
  });
  if (idErr) throw new Error(`municipalities_near_point failed: ${idErr.message}`);
  const municipalityIds = ((ids ?? []) as Array<{ municipality_id: string }>).map((r) => r.municipality_id);
  if (municipalityIds.length === 0) return [];

  const out: MunicipalityKml[] = [];
  for (const id of municipalityIds) {
    // The WHOLE municipality, paginated — never the radius-clipped subset.
    const rows: MunicipalProjectExportRow[] = [];
    const PAGE = 1000;
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await service
        .from('municipal_project_v').select(SELECT)
        .eq('municipality_id', id)
        .range(offset, offset + PAGE - 1);
      if (error) throw new Error(`municipal_project_v lookup failed: ${error.message}`);
      const page = (data ?? []) as MunicipalProjectExportRow[];
      rows.push(...page);
      if (page.length < PAGE) break;
    }
    if (rows.length === 0) continue;

    // The stage abbreviation is not on the view; same one extra read the button does.
    const { data: stages } = await service.from('project_stage').select('id, abbreviation');
    const abbr = new Map<string, string | null>(
      ((stages ?? []) as Array<{ id: string; abbreviation: string | null }>).map((s) => [s.id, s.abbreviation]));
    for (const r of rows) r.effective_stage_abbreviation = r.effective_stage_id ? abbr.get(r.effective_stage_id) ?? null : null;

    const placeable = rows.filter((r) => r.geometry_geojson != null || isPointOnly(r));
    if (placeable.length === 0) continue;
    const name = rows[0].municipality_name ?? 'Unknown municipality';
    const state = rows[0].municipality_state ?? null;
    out.push({
      municipality: name,
      state,
      filename: kmlFilename(name, state),
      kml: buildKml(placeable, `${name}${state ? `, ${state}` : ''} — municipal projects`),
      polygons: placeable.filter((r) => r.geometry_geojson != null).length,
      points: placeable.filter(isPointOnly).length,
      unplaceable: rows.length - placeable.length,
      unverified: placeable.filter(isUnverified).length,
    });
  }
  return out;
}

/**
 * The run-footer block. Completeness leads: how many projects could not be placed at all is the
 * number that says whether a KML is whole, so it goes first rather than trailing the file list.
 */
export function kmlFooter(kmls: MunicipalityKml[]): string {
  if (kmls.length === 0) return '';
  const unplaceable = kmls.reduce((n, k) => n + k.unplaceable, 0);
  const points = kmls.reduce((n, k) => n + k.points, 0);
  const head = unplaceable === 0
    ? `\n\n**KML completeness:** every project in these municipalities is in its file.`
    : `\n\n**KML completeness: ${unplaceable} project${unplaceable === 1 ? '' : 's'} could not be placed at all` +
      ` and ${unplaceable === 1 ? 'is' : 'are'} NOT in these files** — no boundary and no centroid on file.`;
  const pointNote = points
    ? ` ${points} project${points === 1 ? ' is' : 's are'} pinned at a centroid rather than drawn, marked [NO BOUNDARY].`
    : '';
  const parts = kmls.map((k) =>
    `${k.filename} (${k.polygons} polygon${k.polygons === 1 ? '' : 's'}` +
    (k.points ? `, ${k.points} point${k.points === 1 ? '' : 's'}` : '') +
    (k.unverified ? `; ${k.unverified} marked UNVERIFIED` : '') +
    (k.unplaceable ? `; ${k.unplaceable} missing entirely` : '') + ')');
  return `${head}${pointNote}\nKML by municipality: ${parts.join(', ')}. Each file is that municipality's ` +
    `whole project set, not just the part within ${MUNICIPALITY_RADIUS_MILES} mi.`;
}
