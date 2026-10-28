/**
 * Parse a pasted list of points (from Excel / Google Sheets / a CSV file /
 * Google Maps "copy coordinates") into lat/lng rows for a custom map layer.
 *
 * Accepted shapes:
 *   - With a header row: any columns, in any order. lat/lng (and optionally
 *     name) are found by header name; every other column is kept as an
 *     attribute on the point.
 *   - Without a header: `lat, lng`, `name, lat, lng` or `lat, lng, name`.
 *     The first two adjacent numeric columns are lat/lng; the first other
 *     non-empty column is the name.
 *
 * Delimiter is tab if any line contains a tab (spreadsheet paste), else comma.
 */

export interface ParsedPoint {
  /** 1-based line number in the pasted text, for error messages */
  line: number;
  name: string | null;
  lat: number;
  lng: number;
  attributes: Record<string, string>;
}

export interface PointParseError {
  line: number;
  text: string;
  reason: string;
}

export interface PointParseResult {
  points: ParsedPoint[];
  errors: PointParseError[];
  hasHeader: boolean;
  /** Most rows have |lat| > |lng| — almost certainly columns in lng, lat order (US coords) */
  looksSwapped: boolean;
}

const LAT_ALIASES = ['lat', 'latitude', 'y'];
const LNG_ALIASES = ['lng', 'lon', 'long', 'longitude', 'x'];
const NAME_ALIASES = ['name', 'title', 'label', 'site', 'site name', 'store', 'location'];

const normalize = (h: string) => h.trim().toLowerCase().replace(/[^a-z ]/g, '').trim();

const isNumeric = (s: string | undefined) =>
  s !== undefined && s.trim() !== '' && Number.isFinite(Number(s.trim()));

function splitRows(text: string, delimiter: string): { line: number; cells: string[] }[] {
  const rows: { line: number; cells: string[] }[] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  const endRow = () => {
    row.push(field);
    if (row.some(c => c.trim() !== '')) rows.push({ line: rowStartLine, cells: row.map(c => c.trim()) });
    row = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === '') { inQuotes = true; field = ''; continue; }
    if (ch === delimiter) { row.push(field); field = ''; continue; }
    if (ch === '\r') continue;
    if (ch === '\n') { endRow(); line++; rowStartLine = line; continue; }
    field += ch;
  }
  endRow();
  return rows;
}

function checkRange(lat: number, lng: number): string | null {
  const latOk = lat >= -90 && lat <= 90;
  const lngOk = lng >= -180 && lng <= 180;
  if (latOk && lngOk) {
    if (lat === 0 && lng === 0) return 'Coordinates are 0, 0';
    return null;
  }
  if (!latOk && Math.abs(lng) <= 90 && Math.abs(lat) <= 180) {
    return 'Latitude out of range — are lat and lng swapped?';
  }
  return 'Coordinates out of range';
}

export function parsePointList(text: string, opts: { swap?: boolean } = {}): PointParseResult {
  const delimiter = text.includes('\t') ? '\t' : ',';
  const rows = splitRows(text, delimiter);
  const points: ParsedPoint[] = [];
  const errors: PointParseError[] = [];

  if (rows.length === 0) return { points, errors, hasHeader: false, looksSwapped: false };

  // Header detection: a header row has no numeric cells at all.
  const first = rows[0].cells;
  const hasHeader = !first.some(isNumeric);

  let latIdx = -1;
  let lngIdx = -1;
  let nameIdx = -1;
  let header: string[] = [];
  let dataRows = rows;

  if (hasHeader) {
    header = first;
    const norm = header.map(normalize);
    latIdx = norm.findIndex(h => LAT_ALIASES.includes(h));
    lngIdx = norm.findIndex(h => LNG_ALIASES.includes(h));
    nameIdx = norm.findIndex(h => NAME_ALIASES.includes(h));
    dataRows = rows.slice(1);

    if (latIdx === -1 || lngIdx === -1) {
      errors.push({
        line: rows[0].line,
        text: header.join(delimiter === '\t' ? '  ' : ', '),
        reason: 'Header row needs a "lat" and a "lng" column (latitude/longitude also work)',
      });
      return { points, errors, hasHeader, looksSwapped: false };
    }
  } else {
    // Positional: first two adjacent numeric columns are lat, lng.
    for (let i = 0; i < first.length - 1; i++) {
      if (isNumeric(first[i]) && isNumeric(first[i + 1])) { latIdx = i; lngIdx = i + 1; break; }
    }
    if (latIdx === -1) {
      errors.push({
        line: rows[0].line,
        text: first.join(', '),
        reason: 'Could not find a lat, lng pair on the first line',
      });
      return { points, errors, hasHeader, looksSwapped: false };
    }
    nameIdx = first.findIndex((c, i) => i !== latIdx && i !== lngIdx && c !== '');
  }

  for (const { line, cells } of dataRows) {
    const raw = cells.join(', ');
    const latStr = cells[latIdx];
    const lngStr = cells[lngIdx];
    if (!isNumeric(latStr) || !isNumeric(lngStr)) {
      errors.push({ line, text: raw, reason: 'lat/lng is missing or not a number' });
      continue;
    }
    const lat = Number(opts.swap ? lngStr : latStr);
    const lng = Number(opts.swap ? latStr : lngStr);
    const rangeError = checkRange(lat, lng);
    if (rangeError) {
      errors.push({ line, text: raw, reason: rangeError });
      continue;
    }

    const attributes: Record<string, string> = {};
    if (hasHeader) {
      header.forEach((col, i) => {
        if (i === latIdx || i === lngIdx || i === nameIdx) return;
        const v = cells[i] ?? '';
        if (col && v !== '') attributes[col] = v;
      });
    }

    points.push({
      line,
      name: nameIdx >= 0 && cells[nameIdx] ? cells[nameIdx] : null,
      lat,
      lng,
      attributes,
    });
  }

  // In US data |lng| > |lat|. Rows going against the majority orientation are
  // almost certainly swapped individually; flag them rather than plot them in the wrong place.
  const flipped = (pt: ParsedPoint) => Math.abs(pt.lat) > Math.abs(pt.lng);
  const flippedCount = points.filter(flipped).length;
  const looksSwapped = points.length > 0 && flippedCount > points.length / 2;
  const majorityFlipped = looksSwapped;
  const kept: ParsedPoint[] = [];
  for (const pt of points) {
    if (flipped(pt) !== majorityFlipped) {
      errors.push({
        line: pt.line,
        text: `${pt.name ?? ''} ${pt.lat}, ${pt.lng}`.trim(),
        reason: 'lat and lng look swapped compared with the other rows',
      });
    } else {
      kept.push(pt);
    }
  }
  errors.sort((a, b) => a.line - b.line);

  return { points: kept, errors, hasHeader, looksSwapped };
}

export const POINT_TEMPLATE_CSV =
  'name,lat,lng,notes\n' +
  'Example Site A,33.7490,-84.3880,Replace these example rows with your own\n' +
  'Example Site B,34.0232,-84.6155,Extra columns (like notes) are saved on the point\n';
