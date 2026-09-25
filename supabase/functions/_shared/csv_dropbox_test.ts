import { assertEquals, assertThrows } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  bandFor, buildCompetitorRow, buildEmployerRow, buildSchoolRow, byDistance, COMPETITORS_COLUMNS, csvEscape, EMPLOYERS_COLUMNS,
  fullAddress, oneDecimal, SCHOOLS_COLUMNS, toCsv,
} from './csv.ts'
import {
  cleanFolderName, headerSafeJson, siteSubmitFolderName, siteSubmitFolderPath, validateDropboxPath,
} from './dropbox.ts'

// ---------------- CSV escaping ----------------
Deno.test('embedded quotes are doubled and the field quoted (the client-side bug)', () => {
  assertEquals(csvEscape('He said "hi"'), '"He said ""hi"""')
})
Deno.test('commas, CR and LF force quoting', () => {
  assertEquals(csvEscape('Smith, Jones'), '"Smith, Jones"')
  assertEquals(csvEscape('line1\nline2'), '"line1\nline2"')
  assertEquals(csvEscape('a\r\nb'), '"a\r\nb"')
})
Deno.test('leading/trailing spaces are preserved by quoting', () => {
  assertEquals(csvEscape(' padded '), '" padded "')
})
Deno.test('blank means unknown: null, undefined, empty, NaN, Infinity all write empty, never 0', () => {
  for (const v of [null, undefined, '', NaN, Infinity, -Infinity]) assertEquals(csvEscape(v as never), '')
  assertEquals(csvEscape(0), '0') // a real zero stays a zero
})
Deno.test('formula injection guarded on text, not on numbers', () => {
  assertEquals(csvEscape('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`)
  assertEquals(csvEscape('+1 555'), "'+1 555")
  assertEquals(csvEscape('@SUM(A1)'), "'@SUM(A1)")
  assertEquals(csvEscape('-cmd'), "'-cmd")
  assertEquals(csvEscape('-5'), '-5')
  assertEquals(csvEscape(-5), '-5')
})
Deno.test('toCsv: CRLF, header row, missing keys blank', () => {
  assertEquals(toCsv(['a', 'b'] as const, [{ a: 1 }, { a: 'x,y', b: null }]), 'a,b\r\n1,\r\n"x,y",\r\n')
})

// ---------------- field helpers ----------------
Deno.test('oneDecimal rounds for display only', () => {
  assertEquals(oneDecimal(1.04), 1)
  assertEquals(oneDecimal(2.96), 3)
  assertEquals(oneDecimal(null), null)
})
Deno.test('bandFor uses the unrounded distance: 1.04 mi is band 3, not 1', () => {
  assertEquals(bandFor(0.99), 1)
  assertEquals(bandFor(1), 1)
  assertEquals(bandFor(1.04), 3)
  assertEquals(bandFor(3.0001), 5)
  assertEquals(bandFor(5.01), null)
  assertEquals(bandFor(null), null)
})
Deno.test('fullAddress is blank without a street (no city-centroid pins)', () => {
  assertEquals(fullAddress(null, 'Marietta', 'GA', '30068'), null)
  assertEquals(fullAddress('4616 Roswell Rd', 'Marietta', 'GA', '30062'), '4616 Roswell Rd, Marietta, GA 30062')
  assertEquals(fullAddress('1 Main St', null, 'GA', null), '1 Main St, GA')
})

// ---------------- schools.csv row ----------------
const base = {
  name: 'Tritt Elementary School', public_private: 'public' as const, street: '4435 Post Oak Tritt Rd',
  city: 'Marietta', state: 'GA', zip: '30062', enrollment: 804, school_level: 'Elementary',
  grade_low: 'PK', grade_high: '05', distance_miles: 0.64, school_year: '2024-2025',
}
Deno.test('NCES row: both sources NCES, band 1, one-decimal distance', () => {
  const r = buildSchoolRow(base)
  assertEquals([r.enrollment, r.enrollment_source, r.address_source, r.band, r.distance_mi], [804, 'NCES', 'NCES', 1, 0.6])
})
Deno.test('web fill only fills blanks, and is sourced per field', () => {
  const r = buildSchoolRow({ ...base, enrollment: null }, { enrollment: 790, street: 'IGNORED', source_url: 'https://x.test' })
  assertEquals([r.enrollment, r.enrollment_source, r.street, r.address_source], [790, 'WEB', '4435 Post Oak Tritt Rd', 'NCES'])
  assertEquals(r.notes, 'web source: https://x.test')
})
Deno.test('NCES enrollment is never replaced by a web value', () => {
  const r = buildSchoolRow(base, { enrollment: 1, source_url: 'https://x.test' })
  assertEquals([r.enrollment, r.enrollment_source, r.notes], [804, 'NCES', null])
})
Deno.test('unresolved blank stays blank with a blank source', () => {
  const r = buildSchoolRow({ ...base, enrollment: null, street: null })
  assertEquals([r.enrollment, r.enrollment_source, r.street, r.address_source, r.full_address], [null, null, null, null, null])
})
Deno.test('a non-integer or negative web enrollment is rejected (no estimates)', () => {
  assertEquals(buildSchoolRow({ ...base, enrollment: null }, { enrollment: 512.5, source_url: 'u' }).enrollment, null)
  assertEquals(buildSchoolRow({ ...base, enrollment: null }, { enrollment: -3, source_url: 'u' }).enrollment, null)
})
Deno.test('schools.csv header matches the spec exactly', () => {
  assertEquals(SCHOOLS_COLUMNS.join(','),
    'flag,name,street,city,state,zip,full_address,enrollment,school_level,grade_low,grade_high,public_private,distance_mi,band,school_year,enrollment_source,address_source,notes')
})

// ---------------- employers.csv row ----------------
Deno.test('employer: headcount only as a stated integer; blank distance means unlocated', () => {
  const r = buildEmployerRow({ name: 'Wellstar Kennestone', employer_type: 'hospital', street: null, city: 'Marietta', state: 'GA', zip: null,
    headcount: 3500.5, distance_miles: null, source: 'https://example.test', source_year: 2025 })
  assertEquals([r.headcount, r.distance_mi, r.band, r.full_address], [null, null, null, null])
  assertEquals(r.employer_type, 'hospital') // its own column, for map pins — not buried in notes
})
Deno.test('employers.csv header matches the spec exactly', () => {
  assertEquals(EMPLOYERS_COLUMNS.join(','), 'flag,name,employer_type,street,city,state,zip,full_address,headcount,distance_mi,band,source,source_year,notes')
})
Deno.test('sorted by distance ascending, unknown distance last', () => {
  const rows = [{ name: 'b', distance_mi: null }, { name: 'c', distance_mi: 2.1 }, { name: 'a', distance_mi: 0.4 }]
  assertEquals(rows.sort(byDistance).map((r) => r.name), ['a', 'c', 'b'])
})

// ---------------- Dropbox path guard / header / naming ----------------
Deno.test('validateDropboxPath accepts a normal site submit path', () => {
  validateDropboxPath('/Salesforce Documents/Site Submits/Johnson Ferry - 54e5db67/schools.csv')
})
Deno.test('validateDropboxPath rejects escapes the browser check allowed', () => {
  for (const bad of [
    '/Salesforce DocumentsX/evil.csv', // browser startsWith() admits this
    '/Salesforce Documents', // the base itself, not inside it
    '/Salesforce Documents/../Other/x.csv',
    '/Salesforce Documents/./x.csv',
    '/Salesforce Documents//x.csv',
    '/Salesforce Documents/a\\b.csv',
    '/Salesforce Documents/a' + String.fromCharCode(0) + 'b',
    'Salesforce Documents/x.csv',
  ]) assertThrows(() => validateDropboxPath(bad))
})
Deno.test('headerSafeJson escapes non-ASCII so the header stays ASCII, and round-trips', () => {
  const arg = { path: '/Salesforce Documents/Site Submits/Café Corner - 12345678/schools.csv' }
  const h = headerSafeJson(arg)
  for (let i = 0; i < h.length; i++) if (h.charCodeAt(i) > 0x7e) throw new Error(`non-ASCII at ${i}`)
  assertEquals(JSON.parse(h), arg)
  const emoji = { path: '/Salesforce Documents/Site Submits/Coffee ' + String.fromCodePoint(0x2615) + ' - 1/x' }
  assertEquals(JSON.parse(headerSafeJson(emoji)), emoji)
})
Deno.test('folder name parity with the browser: name - id8, cleaned after decoration', () => {
  assertEquals(siteSubmitFolderName('Johnson Ferry and Shallowford Rd - Strip/Land - Starbucks', '54e5db67-f82c-4fc9-96aa-c419fa7dfa6c'),
    'Johnson Ferry and Shallowford Rd - Strip/Land - Starbucks - 54e5db67')
  assertEquals(siteSubmitFolderPath('Johnson Ferry and Shallowford Rd - Strip/Land - Starbucks', '54e5db67-f82c-4fc9-96aa-c419fa7dfa6c'),
    '/Salesforce Documents/Site Submits/Johnson Ferry and Shallowford Rd - StripLand - Starbucks - 54e5db67')
  assertEquals(siteSubmitFolderName(null, 'abcdef123456'), 'Unnamed Site Submit - abcdef12')
  assertEquals(cleanFolderName('  a:b*c?  d  '), 'abc d')
})
Deno.test('browser and server cleaning regexes are textually identical', async () => {
  const browser = await Deno.readTextFile(new URL('../../../src/services/dropboxService.ts', import.meta.url))
  const server = await Deno.readTextFile(new URL('./dropbox.ts', import.meta.url))
  const re = `.replace(/[<>:"/\\\\|?*]/g, '')`
  if (!browser.includes(re) || !server.includes(re)) throw new Error('cleaning regex drifted between browser and server')
  const fn = "const base = (name ?? '').trim() || 'Unnamed Site Submit';"
  if (!browser.includes(fn)) throw new Error('browser siteSubmitFolderName changed')
})

Deno.test('competitors.csv header matches the spec exactly', () => {
  assertEquals(COMPETITORS_COLUMNS.join(','),
    'flag,name,brand,operator_type,street,city,state,zip,lat,lng,distance_mi,drive_thru,company_operated,rtm_sales,sales_as_of,source,notes')
})

Deno.test('competitor row: placed rows carry lat/lng, unplaced are flagged CHECK, 0 sales is not zero', () => {
  const placed = buildCompetitorRow({
    name: 'Dutch Bros Zebulon', brand: 'Dutch Bros', operator_type: 'national_dt', street: '5781 Zebulon Rd',
    city: 'Macon', state: 'GA', zip: '31210', latitude: 32.88, longitude: -83.76, distance_miles: 0.63,
    drive_thru: true, company_operated: false, rtm_sales: null, sales_as_of: null, source: 'https://wgxa',
  })
  assertEquals([placed.flag, placed.distance_mi, placed.lat, placed.drive_thru], [null, 0.6, 32.88, true])
  const unplaced = buildCompetitorRow({
    name: 'Cathedral Coffee', brand: null, operator_type: 'institutional', street: null, city: 'Macon',
    state: 'GA', zip: null, latitude: null, longitude: null, distance_miles: null, drive_thru: true,
    company_operated: false, rtm_sales: 0, sales_as_of: null, source: 'https://x', notes: 'inside Northway Church',
  })
  assertEquals([unplaced.flag, unplaced.lat, unplaced.distance_mi, unplaced.rtm_sales], ['CHECK', null, null, null])
})
