import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { esriDataCheckLine } from './deep-pass.ts'
import { buildDemographics, dataQualityFor, demographicsQuality } from './snapshot.ts'

// Macon (site_submit fc0cd59c), client_demographics exactly as stored 2026-09-15 11:10 ET.
const MACON = JSON.parse(await Deno.readTextFile(new URL('./testdata_macon_client_demographics.json', import.meta.url)))
// Its property row: every Esri column null.
const MACON_PROPERTY = { pop_1_mile: null, pop_3_mile: null, pop_5_mile: null, pop_10min_drive: null, esri_enriched_at: null, tapestry_segment_code: null }

Deno.test('Macon: site-submit demographics win over the empty property, on their real rings', () => {
  const d = buildDemographics(MACON, MACON_PROPERTY)
  assertEquals(d.source, 'site_submit.client_demographics')
  assert(d.rings.every((r) => r.source === 'site_submit.client_demographics' && r.pulled_at === '2026-09-15T15:10:56.475Z'))
  assertEquals(d.rings.map((r) => r.radius_miles), [1, 2, 3]) // 5 mi keys exist but are all null: not carried
  assertEquals(d.rings.map((r) => r.population), [4589, 13343, 23461])
  assertEquals(d.drive_times.map((t) => [t.minutes, t.population, t.daytime_population]), [[5, 1152, 3464], [7, 7162, 7555], [10, 19845, 18705]])
  assertEquals(d.rings[2], {
    radius_miles: 3, source: 'site_submit.client_demographics', pulled_at: '2026-09-15T15:10:56.475Z', pull_point: null, population: 23461, daytime_population: 19196, households: 9446, hh_income_median: 107046,
    hh_income_avg: 151765, median_age: 42.4, employees: 7014,
  })
})

Deno.test('Macon quality: partial, 5 mi blank (not interpolated), drive times listed', () => {
  const q = demographicsQuality(buildDemographics(MACON, MACON_PROPERTY))
  assertEquals(q.status, 'partial')
  assertEquals(q.rings_miles, [1, 2, 3])
  assertEquals(q.drive_times_minutes, [5, 7, 10])
  assertEquals(q.school_bands_without_population, [5])
  assertEquals(q.tapestry_on_file, false)
  assertEquals(esriDataCheckLine(q),
    'ESRI: PARTIAL. Esri demographics on file. Rings: 1 mi (site submit 2026-09-15, pull coordinate NOT RECORDED), 2 mi (site submit 2026-09-15, pull coordinate NOT RECORDED), 3 mi (site submit 2026-09-15, pull coordinate NOT RECORDED). Drive times: 5 min (site submit 2026-09-15, pull coordinate NOT RECORDED), 7 min (site submit 2026-09-15, pull coordinate NOT RECORDED), 10 min (site submit 2026-09-15, pull coordinate NOT RECORDED). No population ring at 5 mi from either source: blank, not interpolated. Tapestry is empty. Drive-time figures with no recorded pull coordinate (5 min, 7 min, 10 min): start point unknown, not precise for this site.')
  assertEquals([q.drive_times_without_pull_point, q.rings_without_pull_point], [[5, 7, 10], [1, 2, 3]])
})

Deno.test('property fallback when the site submit has none; present when 1/3/5 all have population', () => {
  const property = {
    pop_1_mile: 5000, pop_3_mile: 30000, pop_5_mile: 70000, pop_10min_drive: 29000,
    households_1_mile: 2000, hh_income_median_3_mile: 95000, esri_enriched_at: '2026-06-01T00:00:00Z',
    tapestry_segment_code: '5B', tapestry_segment_name: 'In Style',
    latitude: 33.9, verified_latitude: 33.9, // non-Esri keys ignored
  }
  const d = buildDemographics(null, property)
  assert(d.rings.every((r) => r.source === 'property' && r.pulled_at === '2026-06-01T00:00:00Z'))
  assertEquals([d.source, d.rings.map((r) => r.radius_miles), d.drive_times.map((t) => t.population)], ['property', [1, 3, 5], [29000]])
  assertEquals(d.tapestry, { code: '5B', name: 'In Style', lifemodes: null })
  assertEquals(demographicsQuality(d).status, 'present')
})

Deno.test('a client_demographics block with no values falls back to the property; tapestry falls back per field', () => {
  const empty = { data: { pop_1_mile: null, pop_10min_drive: null }, radii: [1], drive_times: [10], tapestry: { code: null, name: 'From site submit' } }
  const d = buildDemographics(empty, { pop_1_mile: 1, tapestry_segment_code: 'P1', esri_enriched_at: 'x' })
  assertEquals(d.source, 'property')
  assertEquals(d.tapestry, { code: 'P1', name: 'From site submit', lifemodes: null })
})

Deno.test('per ring: site submit first, property fills only the radii the site submit lacks (the 29 sites)', () => {
  // Site 89e3675e shape: site submit 1/2/3 mi + 5/7/10 min; property 1/3/5 mi + 10 min, pulled earlier.
  const siteSubmit = { enriched_at: '2026-09-01T12:00:00Z', data: {
    pop_1_mile: 5100, pop_2_mile: 15000, pop_3_mile: 25793, pop_5_mile: null, pop_10min_drive: 30000, pop_5min_drive: 2000,
  } }
  const property = { pop_1_mile: 5000, pop_3_mile: 25801, pop_5_mile: 44259, households_5_mile: 17000, pop_10min_drive: 31000, esri_enriched_at: '2026-04-24T09:00:00Z' }
  const d = buildDemographics(siteSubmit, property)
  assertEquals(d.source, 'mixed')
  assertEquals(d.rings.map((r) => [r.radius_miles, r.population, r.source, r.pulled_at]), [
    [1, 5100, 'site_submit.client_demographics', '2026-09-01T12:00:00Z'],
    [2, 15000, 'site_submit.client_demographics', '2026-09-01T12:00:00Z'],
    [3, 25793, 'site_submit.client_demographics', '2026-09-01T12:00:00Z'], // not the property's 25,801
    [5, 44259, 'property', '2026-04-24T09:00:00Z'],
  ])
  assertEquals(d.rings[3].households, 17000)
  assertEquals(d.drive_times.map((t) => [t.minutes, t.population, t.source]), [[5, 2000, 'site_submit.client_demographics'], [10, 30000, 'site_submit.client_demographics']])
  const q = demographicsQuality(d)
  assertEquals([q.status, q.school_bands_without_population], ['present', []])
  assert(q.note.includes('5 mi (property 2026-04-24, pull coordinate NOT RECORDED)'), q.note)
})

Deno.test('no interpolation: a radius neither source has stays absent', () => {
  const d = buildDemographics({ data: { pop_1_mile: 100, pop_3_mile: 900 } }, { pop_1_mile: 1, pop_3_mile: 2 })
  assertEquals(d.rings.map((r) => r.radius_miles), [1, 3])
  assertEquals(demographicsQuality(d).school_bands_without_population, [5])
})

Deno.test('neither source: missing; old threads without a demographics block keep the property-only check', () => {
  assertEquals(demographicsQuality(buildDemographics(null, MACON_PROPERTY)).status, 'missing')
  assertEquals(demographicsQuality(buildDemographics(null, null)).status, 'missing')
  const legacy = dataQualityFor({ property: MACON_PROPERTY })
  assertEquals(legacy.esri.status, 'missing')
  assert(!('rings_miles' in legacy.esri))
  const current = dataQualityFor({ demographics: buildDemographics(MACON, null) })
  assertEquals(current.esri.status, 'partial')
})

// The three Macon points (docs/ESRI_DRIVE_TIME_POINT_SENSITIVITY.md).
const SITE = { latitude: 32.880362, longitude: -83.760908 } // site_submit.verified
Deno.test('pull point: recorded per area with its distance from the site; property uses esri_enriched_latitude/longitude', () => {
  const siteSubmit = {
    enriched_at: '2026-09-15T20:00:00Z',
    pull_point: { latitude: 32.880362, longitude: -83.760908, source: 'site_submit.verified' },
    data: { pop_1_mile: 4589, pop_3_mile: 23461, pop_10min_drive: 24538 },
  }
  const property = { pop_5_mile: 44000, esri_enriched_at: '2026-04-01T00:00:00Z', esri_enriched_latitude: 32.880367, esri_enriched_longitude: -83.761093 }
  const d = buildDemographics(siteSubmit, property, SITE)
  assertEquals(d.drive_times[0].pull_point, { latitude: 32.880362, longitude: -83.760908, coordinate_source: 'site_submit.verified', distance_from_site_m: 0 })
  assertEquals(d.rings.find((r) => r.radius_miles === 5)!.pull_point, { latitude: 32.880367, longitude: -83.761093, coordinate_source: 'property.esri_enriched', distance_from_site_m: 17.3 })
  const q = demographicsQuality(d)
  assertEquals([q.drive_times_without_pull_point, q.rings_without_pull_point], [[], []])
  assert(q.note.includes('10 min (site submit 2026-09-15, pulled at site_submit.verified 0 m from the site)'), q.note)
  assert(q.note.includes('5 mi (property 2026-04-01, pulled at property.esri_enriched 17.3 m from the site)'), q.note)
  assert(!q.note.includes('NOT RECORDED'))
})

Deno.test('pull point: a half-recorded or missing point is null, never guessed; no site means no distance', () => {
  const d = buildDemographics({ pull_point: { latitude: 32.88 }, data: { pop_10min_drive: 1 } }, { pop_1_mile: 2, esri_enriched_latitude: 32.88 }, SITE)
  assertEquals(d.drive_times[0].pull_point, null)
  assertEquals(d.rings[0].pull_point, null)
  const e = buildDemographics({ pull_point: { latitude: 32.88, longitude: -83.76, source: 'site_submit.verified' }, data: { pop_10min_drive: 1 } }, null)
  assertEquals(e.drive_times[0].pull_point?.distance_from_site_m, null)
})

Deno.test('a pull point far from the site is flagged as a different location (Walker Ridge 684 m)', () => {
  const far = buildDemographics(
    { enriched_at: '2026-05-01T00:00:00Z', pull_point: { latitude: 34.176, longitude: -84.800, source: 'property.verified' }, data: { pop_10min_drive: 39945, pop_1_mile: 1000 } },
    null,
    { latitude: 34.1815, longitude: -84.8035 },
  )
  const q = demographicsQuality(far)
  const drive = q.areas_pulled_away_from_site.find((a) => a.area === '10 min drive')!
  assert(drive.meters > 600 && drive.far, JSON.stringify(drive))
  assert(q.note.includes('PULLED AT A DIFFERENT LOCATION'), q.note)
  assert(q.note.includes('10 min drive 6'), q.note)
  assert(q.note.includes('do not present them as this site'), q.note)
})

Deno.test('an offset under 100 m is stated, not called a different location; under 10 m is not flagged', () => {
  const site = { latitude: 32.880362, longitude: -83.760908 }
  const offset = buildDemographics(
    { pull_point: { latitude: 32.880367, longitude: -83.761093, source: 'property.esri_enriched' }, data: { pop_10min_drive: 19845 } }, null, site)
  const q = demographicsQuality(offset)
  assertEquals(q.areas_pulled_away_from_site, [{ area: '10 min drive', meters: 17.3, far: false }])
  assert(q.note.includes('Pulled away from the site coordinate: 10 min drive 17 m'), q.note)
  assert(!q.note.includes('DIFFERENT LOCATION'))

  const near = buildDemographics(
    { pull_point: { latitude: 32.880362, longitude: -83.760908, source: 'site_submit.verified' }, data: { pop_10min_drive: 24538 } }, null, site)
  assertEquals(demographicsQuality(near).areas_pulled_away_from_site, [])
})
