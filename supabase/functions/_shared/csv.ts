/**
 * CSV writer for research exports (schools.csv, employers.csv).
 *
 * Server-side and dependency-free. It replaces nothing: the existing client-side CSV
 * exports (SiteSubmitDashboardPage and five others) wrap cells as `"${cell}"` without
 * escaping embedded quotes, so a name like  He said "hi"  corrupts the row. This module
 * is correct by construction and is the one to copy.
 *
 * Conventions (from the Step 2 spec):
 *  - Blank means unknown. null / undefined / '' / NaN / Infinity all write as an empty
 *    field. Never "N/A", never "TBD", never 0 standing in for unknown.
 *  - Distance to one decimal.
 *  - RFC 4180: CRLF line endings, a field is quoted when it contains a comma, quote,
 *    CR or LF, or has leading/trailing spaces; embedded quotes are doubled.
 *  - No lat/lng columns. full_address is what gets geocoded on import.
 */

export type CsvCell = string | number | boolean | null | undefined

/**
 * Spreadsheet formula injection guard. Text cells come from web search, and a cell
 * starting with = + @ (or a tab/CR) is executed as a formula when the CSV is opened
 * in Excel or Sheets. Such cells get a leading apostrophe. A leading '-' is only
 * guarded when the rest is not a plain number, so "-5" in a text column is left alone.
 * Numeric cells (typeof number) are never touched.
 * https://owasp.org/www-community/attacks/CSV_Injection
 */
function guardFormula(s: string): string {
  if (s.length === 0) return s
  const first = s[0]
  if (first === '=' || first === '+' || first === '@' || first === '\t' || first === '\r') return `'${s}`
  if (first === '-' && !/^-\d+(\.\d+)?$/.test(s)) return `'${s}`
  return s
}

export function csvEscape(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : ''
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (value === '') return ''
  const s = guardFormula(value)
  const needsQuotes = /[",\r\n]/.test(s) || s !== s.trim()
  return needsQuotes ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serialize rows; every header must be a key of the row (missing keys write blank). */
export function toCsv<K extends string>(headers: readonly K[], rows: ReadonlyArray<Partial<Record<K, CsvCell>>>): string {
  const lines = [headers.map((h) => csvEscape(h)).join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvEscape(row[h])).join(','))
  return lines.join('\r\n') + '\r\n'
}

export function csvBytes(csv: string): Uint8Array {
  return new TextEncoder().encode(csv)
}

// ---------------------------------------------------------------------------
// Shared field helpers
// ---------------------------------------------------------------------------

/** One decimal, or blank. Pass the UNROUNDED distance; rounding happens here only. */
export function oneDecimal(miles: number | null | undefined): number | null {
  return typeof miles === 'number' && Number.isFinite(miles) ? Math.round(miles * 10) / 10 : null
}

/** Smallest cumulative ring (1, 3, 5 mi) that contains the distance; null outside 5 mi. */
export function bandFor(miles: number | null | undefined): 1 | 3 | 5 | null {
  if (typeof miles !== 'number' || !Number.isFinite(miles) || miles < 0) return null
  if (miles <= 1) return 1
  if (miles <= 3) return 3
  if (miles <= 5) return 5
  return null
}

const blankToNull = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim()
  return t === '' ? null : t
}

/**
 * "street, city, state zip". Blank when there is no street: a city-only address would
 * geocode to the city centroid on import and drop a pin at a place the school is not.
 */
export function fullAddress(
  street: string | null | undefined,
  city: string | null | undefined,
  state: string | null | undefined,
  zip: string | null | undefined,
): string | null {
  const st = blankToNull(street)
  if (!st) return null
  const stateZip = [blankToNull(state), blankToNull(zip)].filter(Boolean).join(' ')
  return [st, blankToNull(city), stateZip || null].filter(Boolean).join(', ')
}

/** Distance ascending; rows with no distance sort last, then by name. */
export function byDistance<T extends { distance_mi: CsvCell; name: CsvCell }>(a: T, b: T): number {
  const da = typeof a.distance_mi === 'number' ? a.distance_mi : Infinity
  const db = typeof b.distance_mi === 'number' ? b.distance_mi : Infinity
  return da - db || String(a.name ?? '').localeCompare(String(b.name ?? ''))
}

// ---------------------------------------------------------------------------
// schools.csv
// ---------------------------------------------------------------------------

/**
 * First column of every export. Blank when the row needs nothing; CHECK when a value the mapper will
 * care about is missing or unverified (no enrollment or headcount on file, an address NCES could not
 * confirm as physical, a competitor that would not geocode). NOTHING is ever filtered out of an
 * export because of it — filtering happens at the mapping step, not here (decided 2026-09-25).
 */
export const FLAG_CHECK = 'CHECK'

export const SCHOOLS_COLUMNS = [
  'flag', 'name', 'street', 'city', 'state', 'zip', 'full_address', 'enrollment',
  'school_level', 'grade_low', 'grade_high', 'public_private', 'distance_mi',
  'band', 'school_year', 'enrollment_source', 'address_source', 'notes',
] as const
export type SchoolsColumn = (typeof SCHOOLS_COLUMNS)[number]
export type SchoolsRow = Record<SchoolsColumn, CsvCell>

export interface SchoolInput {
  name: string | null
  public_private: 'public' | 'private'
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  enrollment: number | null
  school_level: string | null
  grade_low: string | null
  grade_high: string | null
  distance_miles: number | null // unrounded
  school_year: string | null
  notes?: string | null
}

/** A web-search fill for one school. Only the fields present are applied. */
export interface SchoolFill {
  enrollment?: number | null
  street?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  source_url: string
  notes?: string | null
}

/**
 * NCES values win; a WEB fill only fills a blank. Sources are per field: an address
 * found on the web does not make the enrollment WEB-sourced, and vice versa. A field
 * still blank after filling keeps a blank source, since nothing supplied it.
 */
export function buildSchoolRow(s: SchoolInput, fill?: SchoolFill): SchoolsRow {
  const ncesEnrollment = typeof s.enrollment === 'number' && s.enrollment >= 0 ? s.enrollment : null
  const webEnrollment =
    ncesEnrollment === null && typeof fill?.enrollment === 'number' && Number.isInteger(fill.enrollment) && fill.enrollment >= 0
      ? fill.enrollment
      : null
  const enrollment = ncesEnrollment ?? webEnrollment

  const ncesStreet = blankToNull(s.street)
  const webStreet = ncesStreet === null ? blankToNull(fill?.street) : null
  const useWebAddress = webStreet !== null
  const street = ncesStreet ?? webStreet
  const city = useWebAddress ? blankToNull(fill?.city) ?? blankToNull(s.city) : blankToNull(s.city)
  const state = useWebAddress ? blankToNull(fill?.state) ?? blankToNull(s.state) : blankToNull(s.state)
  const zip = useWebAddress ? blankToNull(fill?.zip) ?? blankToNull(s.zip) : blankToNull(s.zip)

  const notes = [blankToNull(s.notes), fill ? blankToNull(fill.notes) : null,
    fill && (webEnrollment !== null || useWebAddress) ? `web source: ${fill.source_url}` : null]
    .filter(Boolean).join('; ')

  return {
    // CHECK when the mapper needs to look: no enrollment on file, or no confirmed physical street.
    flag: enrollment === null || street === null ? FLAG_CHECK : null,
    name: blankToNull(s.name),
    street,
    city,
    state,
    zip,
    full_address: fullAddress(street, city, state, zip),
    enrollment,
    school_level: blankToNull(s.school_level),
    grade_low: blankToNull(s.grade_low),
    grade_high: blankToNull(s.grade_high),
    public_private: s.public_private,
    distance_mi: oneDecimal(s.distance_miles),
    band: bandFor(s.distance_miles),
    school_year: blankToNull(s.school_year),
    enrollment_source: ncesEnrollment !== null ? 'NCES' : webEnrollment !== null ? 'WEB' : null,
    address_source: ncesStreet !== null ? 'NCES' : useWebAddress ? 'WEB' : null,
    notes: notes || null,
  }
}

// ---------------------------------------------------------------------------
// employers.csv
// ---------------------------------------------------------------------------

export const EMPLOYERS_COLUMNS = [
  'flag', 'name', 'employer_type', 'street', 'city', 'state', 'zip', 'full_address', 'headcount',
  'distance_mi', 'band', 'source', 'source_year', 'notes',
] as const
export type EmployersColumn = (typeof EMPLOYERS_COLUMNS)[number]
export type EmployersRow = Record<EmployersColumn, CsvCell>

export interface EmployerInput {
  name: string | null
  /** What kind of employment site this is (hospital, distribution_warehouse, ...): drives map pins. */
  employer_type: string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  headcount: number | null // only when the source states a specific number
  distance_miles: number | null // unrounded; null when the address could not be located
  source: string | null // URL or named source
  source_year: number | string | null
  notes?: string | null
}

export function buildEmployerRow(e: EmployerInput): EmployersRow {
  const street = blankToNull(e.street)
  const city = blankToNull(e.city)
  const state = blankToNull(e.state)
  const zip = blankToNull(e.zip)
  const headcount = typeof e.headcount === 'number' && Number.isInteger(e.headcount) && e.headcount >= 0 ? e.headcount : null
  return {
    flag: headcount === null ? FLAG_CHECK : null,
    name: blankToNull(e.name),
    employer_type: blankToNull(e.employer_type),
    street,
    city,
    state,
    zip,
    full_address: fullAddress(street, city, state, zip),
    headcount,
    distance_mi: oneDecimal(e.distance_miles),
    band: bandFor(e.distance_miles),
    source: blankToNull(e.source),
    source_year: e.source_year === null || e.source_year === undefined || e.source_year === '' ? null : e.source_year,
    notes: blankToNull(e.notes),
  }
}

// ---------------------------------------------------------------------------
// competitors.csv — every coffee operation within 5 mi, mapped in Sites USA
// ---------------------------------------------------------------------------

export const COMPETITORS_COLUMNS = [
  'flag', 'name', 'brand', 'operator_type', 'street', 'city', 'state', 'zip', 'lat', 'lng',
  'distance_mi', 'drive_thru', 'company_operated', 'rtm_sales', 'sales_as_of', 'source', 'notes',
] as const
export type CompetitorsColumn = (typeof COMPETITORS_COLUMNS)[number]
export type CompetitorsRow = Record<CompetitorsColumn, CsvCell>

/**
 * How a coffee operation competes, which is not the same question as whether it has a lane:
 *   national_dt   national or regional drive-thru brand (Dutch Bros, 7 Brew, Scooter's, Dunkin', Caribou)
 *   local_dt      independent or local operator with a drive-thru
 *   institutional coffee inside a church, school, hospital, grocery, campus or office building,
 *                 with or without a lane — Cathedral Coffee inside Northway Church is the case that
 *                 made this necessary (counted as a drive-thru competitor on 2026-09-16; it is not)
 *   cafe          no drive-thru
 * Only national_dt and local_dt may support a competitive-density claim; every type is exported.
 */
export const COMPETITOR_OPERATOR_TYPES = ['national_dt', 'local_dt', 'institutional', 'cafe'] as const
export type CompetitorOperatorType = (typeof COMPETITOR_OPERATOR_TYPES)[number]
/** The types a "N drive-thru competitors within X mi" claim may count. */
export const DENSITY_COUNTING_TYPES: readonly CompetitorOperatorType[] = ['national_dt', 'local_dt']

export interface CompetitorInput {
  name: string | null
  brand: string | null
  operator_type: CompetitorOperatorType | string | null
  street: string | null
  city: string | null
  state: string | null
  zip: string | null
  latitude: number | null
  longitude: number | null
  distance_miles: number | null // unrounded
  drive_thru: boolean | null
  company_operated: boolean | null
  rtm_sales: number | null
  sales_as_of: string | null
  source: string | null
  notes?: string | null
}

export function buildCompetitorRow(c: CompetitorInput): CompetitorsRow {
  const street = blankToNull(c.street)
  const city = blankToNull(c.city)
  const state = blankToNull(c.state)
  const zip = blankToNull(c.zip)
  const located = typeof c.latitude === 'number' && typeof c.longitude === 'number'
  return {
    // CHECK when it could not be placed on a map, or when its operator type is unknown.
    flag: !located || !blankToNull(String(c.operator_type ?? '')) ? FLAG_CHECK : null,
    name: blankToNull(c.name),
    brand: blankToNull(c.brand),
    operator_type: blankToNull(String(c.operator_type ?? '')),
    street,
    city,
    state,
    zip,
    lat: located ? c.latitude : null,
    lng: located ? c.longitude : null,
    distance_mi: oneDecimal(c.distance_miles),
    drive_thru: c.drive_thru === null || c.drive_thru === undefined ? null : c.drive_thru,
    company_operated: c.company_operated === null || c.company_operated === undefined ? null : c.company_operated,
    // 0 upstream means NOT REPORTED, never zero sales.
    rtm_sales: typeof c.rtm_sales === 'number' && c.rtm_sales > 0 ? c.rtm_sales : null,
    sales_as_of: blankToNull(c.sales_as_of),
    source: blankToNull(c.source),
    notes: blankToNull(c.notes),
  }
}
