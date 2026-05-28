/**
 * KML export for municipal_project polygons.
 *
 * Output is OGC KML 2.2 (the same dialect Google Earth + Google Maps + QGIS read).
 * Each project becomes one Placemark with:
 *   - <name> human-readable label
 *   - <description> short HTML summary
 *   - <ExtendedData> full per-field SimpleData so downstream tools can query fields
 *   - <styleUrl> referencing a per-stage <Style> defined once at the top
 */

import { supabase } from '../lib/supabaseClient';

export interface MunicipalProjectExportRow {
  id: string;
  project_name: string | null;
  phase_label: string | null;
  address: string | null;
  parcel_numbers: string[] | null;
  single_family_lots: number | null;
  townhouse_units: number | null;
  duplex_units: number | null;
  apt_units: number | null;
  cottage_units: number | null;
  total_housing_units: number | null;
  zoning: string | null;
  zoning_approval_date: string | null;
  notes: string | null;
  municipality_id: string;
  municipality_name: string | null;
  municipality_state: string | null;
  effective_stage_name: string | null;
  effective_stage_color: string | null;
  geometry_geojson: { type: string; coordinates: unknown } | null;
}

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Convert a CSS hex (#rrggbb) to KML's aabbggrr format. KML colors are
 * ALPHA-BLUE-GREEN-RED in hex. We default alpha to 'cc' (~80% opaque) for fills
 * and 'ff' for outlines.
 */
function hexToKmlColor(hex: string, alpha: string): string {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return alpha + 'ffffff';
  const r = clean.slice(0, 2);
  const g = clean.slice(2, 4);
  const b = clean.slice(4, 6);
  return alpha + b + g + r;
}

function coordsRing(ring: unknown): string {
  if (!Array.isArray(ring)) return '';
  return ring
    .filter((pt): pt is number[] => Array.isArray(pt) && pt.length >= 2)
    .map(([lng, lat]) => `${lng},${lat},0`)
    .join(' ');
}

function geometryToKml(geojson: { type: string; coordinates: unknown }): string {
  if (geojson.type === 'Polygon') {
    const rings = geojson.coordinates as unknown[];
    if (!Array.isArray(rings) || rings.length === 0) return '';
    const outer = coordsRing(rings[0]);
    const holes = rings.slice(1).map((r) => coordsRing(r));
    return [
      '<Polygon>',
      '  <outerBoundaryIs><LinearRing><coordinates>' + outer + '</coordinates></LinearRing></outerBoundaryIs>',
      ...holes.map(
        (h) =>
          '  <innerBoundaryIs><LinearRing><coordinates>' + h + '</coordinates></LinearRing></innerBoundaryIs>'
      ),
      '</Polygon>',
    ].join('\n');
  }
  if (geojson.type === 'MultiPolygon') {
    const polys = geojson.coordinates as unknown[];
    if (!Array.isArray(polys)) return '';
    return [
      '<MultiGeometry>',
      ...polys.map((poly) => {
        if (!Array.isArray(poly) || poly.length === 0) return '';
        const outer = coordsRing(poly[0]);
        const holes = poly.slice(1).map((r) => coordsRing(r));
        return [
          '<Polygon>',
          '  <outerBoundaryIs><LinearRing><coordinates>' + outer + '</coordinates></LinearRing></outerBoundaryIs>',
          ...holes.map(
            (h) =>
              '  <innerBoundaryIs><LinearRing><coordinates>' +
              h +
              '</coordinates></LinearRing></innerBoundaryIs>'
          ),
          '</Polygon>',
        ].join('\n');
      }),
      '</MultiGeometry>',
    ].join('\n');
  }
  return '';
}

function styleIdForStage(stageName: string): string {
  return 'stage-' + stageName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

function buildStyles(rows: MunicipalProjectExportRow[]): string {
  // One Style per distinct (effective_stage_name + color) combo, plus a fallback.
  const seen = new Map<string, string>();
  for (const r of rows) {
    const name = r.effective_stage_name || 'Planning';
    if (!seen.has(name)) {
      seen.set(name, r.effective_stage_color || '#8FA9C8');
    }
  }
  const stylesXml = Array.from(seen.entries())
    .map(([name, color]) => {
      const id = styleIdForStage(name);
      const fill = hexToKmlColor(color, 'cc'); // ~80% opacity
      const line = hexToKmlColor(color, 'ff');
      return `<Style id="${id}">
  <LineStyle><color>${line}</color><width>2</width></LineStyle>
  <PolyStyle><color>${fill}</color><fill>1</fill><outline>1</outline></PolyStyle>
</Style>`;
    })
    .join('\n');
  return stylesXml;
}

function extendedData(r: MunicipalProjectExportRow): string {
  const fields: Array<[string, string | number | null]> = [
    ['project_name', r.project_name],
    ['phase_label', r.phase_label],
    ['address', r.address],
    ['parcel_numbers', r.parcel_numbers ? r.parcel_numbers.join('; ') : null],
    ['municipality', r.municipality_name ? `${r.municipality_name}, ${r.municipality_state}` : null],
    ['status', r.effective_stage_name],
    ['single_family_lots', r.single_family_lots],
    ['townhouse_units', r.townhouse_units],
    ['duplex_units', r.duplex_units],
    ['apt_units', r.apt_units],
    ['cottage_units', r.cottage_units],
    ['total_housing_units', r.total_housing_units],
    ['zoning', r.zoning],
    ['zoning_approval_date', r.zoning_approval_date],
    ['notes', r.notes],
  ];
  const items = fields
    .filter(([, v]) => v != null && v !== '')
    .map(
      ([k, v]) =>
        `  <Data name="${k}"><value>${xmlEscape(String(v))}</value></Data>`
    )
    .join('\n');
  return `<ExtendedData>\n${items}\n</ExtendedData>`;
}

function descriptionHtml(r: MunicipalProjectExportRow): string {
  const lines: string[] = [];
  if (r.address) lines.push(`<b>Address:</b> ${xmlEscape(r.address)}`);
  if (r.municipality_name)
    lines.push(`<b>Municipality:</b> ${xmlEscape(r.municipality_name + ', ' + (r.municipality_state ?? ''))}`);
  if (r.effective_stage_name) lines.push(`<b>Status:</b> ${xmlEscape(r.effective_stage_name)}`);
  if (r.total_housing_units != null) lines.push(`<b>Total units:</b> ${r.total_housing_units}`);
  if (r.zoning) lines.push(`<b>Zoning:</b> ${xmlEscape(r.zoning)}`);
  if (r.notes) lines.push(`<br/><i>${xmlEscape(r.notes)}</i>`);
  // CDATA so HTML renders in Google Earth's balloon
  return `<description><![CDATA[${lines.join('<br/>')}]]></description>`;
}

function placemark(r: MunicipalProjectExportRow): string | null {
  if (!r.geometry_geojson) return null;
  const geometry = geometryToKml(r.geometry_geojson);
  if (!geometry) return null;
  const name =
    (r.project_name || r.address || 'Unnamed project') +
    (r.phase_label ? ` (${r.phase_label})` : '');
  const styleUrl = '#' + styleIdForStage(r.effective_stage_name || 'Planning');
  return `<Placemark>
  <name>${xmlEscape(name)}</name>
  ${descriptionHtml(r)}
  <styleUrl>${styleUrl}</styleUrl>
  ${extendedData(r)}
  ${geometry}
</Placemark>`;
}

export function buildKml(rows: MunicipalProjectExportRow[], documentName = 'Municipal Projects'): string {
  const rowsWithGeom = rows.filter((r) => r.geometry_geojson != null);
  // Group rows by municipality so each city becomes its own Folder — keeps the
  // Places tree tidy in Google Earth when exporting multiple municipalities.
  const groups = new Map<string, { label: string; items: MunicipalProjectExportRow[] }>();
  for (const r of rowsWithGeom) {
    const key = r.municipality_id;
    const label = r.municipality_name
      ? `${r.municipality_name}, ${r.municipality_state ?? ''}`
      : 'Unknown municipality';
    if (!groups.has(key)) groups.set(key, { label, items: [] });
    groups.get(key)!.items.push(r);
  }

  const folders = Array.from(groups.values())
    .map((g) => {
      const placemarks = g.items.map(placemark).filter((p): p is string => p != null);
      return `<Folder><name>${xmlEscape(g.label)}</name>
${placemarks.join('\n')}
</Folder>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${xmlEscape(documentName)}</name>
${buildStyles(rowsWithGeom)}
${folders}
</Document>
</kml>`;
}

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
        'id, project_name, phase_label, address, parcel_numbers, single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units, total_housing_units, zoning, zoning_approval_date, notes, municipality_id, municipality_name, municipality_state, effective_stage_name, effective_stage_color, geometry_geojson'
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
  return out;
}
