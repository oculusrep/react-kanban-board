/**
 * KML for municipal_project polygons. ONE definition, two callers.
 *
 * Output is OGC KML 2.2 (the dialect Google Earth, Google Maps, QGIS and Sites USA read).
 * Each project becomes one Placemark with a name, an HTML description, full per-field
 * ExtendedData, and a styleUrl pointing at a per-stage Style defined once at the top.
 *
 * Callers:
 *   - src/services/municipalProjectKmlExport.ts   (the Municipality layer's export button)
 *   - supabase/functions/_shared/site-research/municipal-kml.ts  (site research, per run)
 *
 * This file is the builder only: no browser APIs, no Supabase client, so Vite and Deno both
 * take it. Fetching and downloading stay with each caller. It lives here rather than in src/
 * for the same reason merchant-brand-guards.ts does — a copy is what let site research ship a
 * file that disagreed with the map.
 *
 * POINT PLACEMARKS. 22.3% of projects (78 of 350) have no polygon, and most never will: the
 * parcel-fabric registry covers one county, and Hall — 36 of the 78 — has no public parcel
 * endpoint at all. Dropping them silently meant a KML that looked complete while leaving a third
 * of some municipalities out of frame. They are now exported as points at their centroid, styled
 * distinctly so a point is never mistaken for a drawn boundary.
 *
 * UNVERIFIED ROWS. municipal_project_v carries agent-discovered projects (discovery_source
 * pz_agenda / news / builder_site) beside human-reviewed ones, and the export button has never
 * distinguished them. Imported into Sites USA for a tour book they would draw in front of a
 * client as though they were reviewed — the same thing the deep-pass prompt forbids in prose.
 * So an agent-discovered project is named "[UNVERIFIED] ...", drawn in terracotta rather than
 * its stage colour, and carries discovery_source in both the balloon and ExtendedData.
 */

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
  effective_stage_id: string | null;
  effective_stage_name: string | null;
  effective_stage_color: string | null;
  effective_stage_abbreviation: string | null;
  geometry_geojson: { type: string; coordinates: unknown } | null;
  /** Used when there is no polygon: the project is exported as a point here instead. */
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  /** Boundary fetched from a parcel fabric and not yet confirmed by a person. */
  geometry_needs_review?: boolean | null;
  geometry_area_variance_pct?: number | null;
  /** Non-null when the row was found by an agent and not reviewed by a human. */
  discovery_source?: string | null;
}

/** Terracotta, the OVIS warning colour. Deliberately not a stage colour. */
const UNVERIFIED_COLOR = '#A27B5C';
const UNVERIFIED_STYLE_ID = 'unverified';
const POINT_STYLE_ID = 'point-no-boundary';
const POINT_UNVERIFIED_STYLE_ID = 'point-no-boundary-unverified';

/** No drawn boundary: exported at its centroid instead, as a point. */
export function isPointOnly(r: Pick<MunicipalProjectExportRow, 'geometry_geojson' | 'centroid_lat' | 'centroid_lng'>): boolean {
  return r.geometry_geojson == null && r.centroid_lat != null && r.centroid_lng != null;
}

/**
 * A boundary nobody has confirmed. The map draws these dashed; a KML has no dash, so it says so
 * in the name instead. Without this, a parcel union 247% larger than the stated acreage — which
 * happens when a development is part of a bigger parcel — would print as a confirmed site outline.
 */
export function isBoundaryUnreviewed(r: Pick<MunicipalProjectExportRow, 'geometry_needs_review'>): boolean {
  return r.geometry_needs_review === true;
}

/** Agent-discovered and not human-reviewed. */
export function isUnverified(r: Pick<MunicipalProjectExportRow, 'discovery_source'>): boolean {
  return typeof r.discovery_source === 'string' && r.discovery_source.trim() !== '';
}

/** Compact label: "+<total_units> <stage_abbreviation>", each side dropped if missing. */
export function formatUnitsLabel(
  totalUnits: number | null | undefined,
  abbreviation: string | null | undefined,
): string {
  const unitPart = totalUnits != null && Number.isFinite(totalUnits) ? `+${totalUnits}` : '';
  const abbrPart = (abbreviation ?? '').trim();
  return [unitPart, abbrPart].filter(Boolean).join(' ');
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
  let stylesXml = Array.from(seen.entries())
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

  const extra: string[] = [];
  if (rows.some(isPointOnly)) {
    // A pin, not a boundary: white circle, so it cannot read as a drawn shape at any zoom.
    extra.push(`<Style id="${POINT_STYLE_ID}">
  <IconStyle><scale>1.1</scale><color>ff947A4A</color>
    <Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
  <LabelStyle><scale>0.9</scale></LabelStyle>
</Style>`);
    if (rows.some((r) => isPointOnly(r) && isUnverified(r))) {
      extra.push(`<Style id="${POINT_UNVERIFIED_STYLE_ID}">
  <IconStyle><scale>1.1</scale><color>${hexToKmlColor(UNVERIFIED_COLOR, 'ff')}</color>
    <Icon><href>https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png</href></Icon></IconStyle>
  <LabelStyle><scale>0.9</scale></LabelStyle>
</Style>`);
    }
  }
  if (!rows.some(isUnverified)) return [stylesXml, ...extra].join('\n');
  stylesXml = [stylesXml, ...extra].join('\n');
  // One extra style, so an unreviewed project cannot be mistaken for a reviewed one on a slide.
  const fill = hexToKmlColor(UNVERIFIED_COLOR, '66'); // lighter fill: it is a claim, not a fact
  const line = hexToKmlColor(UNVERIFIED_COLOR, 'ff');
  return `${stylesXml}
<Style id="${UNVERIFIED_STYLE_ID}">
  <LineStyle><color>${line}</color><width>3</width></LineStyle>
  <PolyStyle><color>${fill}</color><fill>1</fill><outline>1</outline></PolyStyle>
</Style>`;
}

function extendedData(r: MunicipalProjectExportRow): string {
  const unitsLabel = formatUnitsLabel(r.total_housing_units, r.effective_stage_abbreviation);
  const fields: Array<[string, string | number | null]> = [
    ['project_name', r.project_name],
    ['phase_label', r.phase_label],
    ['address', r.address],
    ['parcel_numbers', r.parcel_numbers ? r.parcel_numbers.join('; ') : null],
    ['municipality', r.municipality_name ? `${r.municipality_name}, ${r.municipality_state}` : null],
    ['status', r.effective_stage_name],
    ['status_abbreviation', r.effective_stage_abbreviation],
    ['units_label', unitsLabel || null],
    ['single_family_lots', r.single_family_lots],
    ['townhouse_units', r.townhouse_units],
    ['duplex_units', r.duplex_units],
    ['apt_units', r.apt_units],
    ['cottage_units', r.cottage_units],
    ['total_housing_units', r.total_housing_units],
    ['zoning', r.zoning],
    ['zoning_approval_date', r.zoning_approval_date],
    ['notes', r.notes],
    ['verified', isUnverified(r) ? 'NO — agent-discovered, not human-reviewed' : 'yes'],
    ['geometry', isPointOnly(r)
      ? 'POINT — no boundary on file, placed at the project centroid'
      : isBoundaryUnreviewed(r) ? 'polygon — fetched from the parcel map, NOT confirmed by a person' : 'polygon'],
    ['boundary_area_variance_pct', isBoundaryUnreviewed(r) ? r.geometry_area_variance_pct ?? null : null],
    ['discovery_source', r.discovery_source ?? null],
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
  if (isUnverified(r)) {
    lines.push(
      `<b style="color:#A27B5C">UNVERIFIED</b> — found by an automated source` +
        ` (${xmlEscape(r.discovery_source ?? 'unknown')}) and not reviewed by a person.`,
    );
  }
  if (r.address) lines.push(`<b>Address:</b> ${xmlEscape(r.address)}`);
  if (r.municipality_name)
    lines.push(`<b>Municipality:</b> ${xmlEscape(r.municipality_name + ', ' + (r.municipality_state ?? ''))}`);
  if (r.effective_stage_name) lines.push(`<b>Status:</b> ${xmlEscape(r.effective_stage_name)}`);
  if (r.total_housing_units != null) lines.push(`<b>Total units:</b> ${r.total_housing_units}`);
  const unitsLabel = formatUnitsLabel(r.total_housing_units, r.effective_stage_abbreviation);
  if (unitsLabel) lines.push(`<b>Units label:</b> ${xmlEscape(unitsLabel)}`);
  if (r.zoning) lines.push(`<b>Zoning:</b> ${xmlEscape(r.zoning)}`);
  if (r.notes) lines.push(`<br/><i>${xmlEscape(r.notes)}</i>`);
  // CDATA so HTML renders in Google Earth's balloon
  return `<description><![CDATA[${lines.join('<br/>')}]]></description>`;
}

function placemark(r: MunicipalProjectExportRow): string | null {
  const point = isPointOnly(r);
  const geometry = point
    ? `<Point><coordinates>${r.centroid_lng},${r.centroid_lat},0</coordinates></Point>`
    : r.geometry_geojson ? geometryToKml(r.geometry_geojson) : '';
  if (!geometry) return null;
  // The two markings are independent: a point can be verified, a polygon can be unverified.
  const name =
    (isUnverified(r) ? '[UNVERIFIED] ' : '') +
    (point ? '[NO BOUNDARY] ' : isBoundaryUnreviewed(r) ? '[BOUNDARY UNCONFIRMED] ' : '') +
    (r.project_name || r.address || 'Unnamed project') +
    (r.phase_label ? ` (${r.phase_label})` : '');
  const styleUrl = '#' + (point
    ? (isUnverified(r) ? POINT_UNVERIFIED_STYLE_ID : POINT_STYLE_ID)
    : (isUnverified(r) ? UNVERIFIED_STYLE_ID : styleIdForStage(r.effective_stage_name || 'Planning')));
  return `<Placemark>
  <name>${xmlEscape(name)}</name>
  ${descriptionHtml(r)}
  <styleUrl>${styleUrl}</styleUrl>
  ${extendedData(r)}
  ${geometry}
</Placemark>`;
}

export function buildKml(rows: MunicipalProjectExportRow[], documentName = 'Municipal Projects'): string {
  // Keep anything we can place: a polygon, or a centroid to pin. Only a row with neither is lost.
  const rowsWithGeom = rows.filter((r) => r.geometry_geojson != null || isPointOnly(r));
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
