import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildFillList, buildSchoolsCsv, extractStep1Schools, isPoBox, mergeFills, recordEmployer, validateSchoolFill,
} from './deep-pass.ts'
import { type DeepPassDb, type DeepPassDeps, runDeepPassIteration } from './deep-pass-worker.ts'
import { distanceBetweenAddressesTool, distanceIfExact, interpretCensus } from './geocode.ts'
import type { ClaimedRun, WorkerDb } from './iteration.ts'
import type { CreateFn, ModelResponse } from './loop.ts'
import { esriDataQuality } from './snapshot.ts'

// ---------------------------------------------------------------------------
// Fixtures: a Step 1 run that called query_nearby_schools at 1, 3 and 5 mi.
// ---------------------------------------------------------------------------
const pub = (id: string, name: string, d: number, enrollment: number | null, extra: Record<string, unknown> = {}) => ({
  nces_id: id, name, address: `${id} School Rd`, city: 'Macon', state: 'GA', zip: '31210', level: 'Elementary',
  grades: 'PK-05', grade_low: 'PK', grade_high: '05', enrollment_incl_prek: enrollment, status: 'Open',
  distance_miles: d, vintage: '2023-2024', ...extra,
})
const priv = (id: string, name: string, d: number, enrollment: number | null, extra: Record<string, unknown> = {}) => ({
  pss_id: id, name, address: `${id} Church St`, city: 'Macon', state: 'GA', level: 'Elementary',
  grades: 'K-8', enrollment_k12_ungraded: enrollment, address_is_mailing: true, distance_miles: d, vintage: '2023-2024', ...extra,
})
const A = pub('A', 'Alpha ES', 0.4, 500)
const B = pub('B', 'Bravo MS', 2.0, null)
const R = pub('R', 'Rim HS', 1.0, 1500) // rounds to 1.0 but NCES put it outside the 1 mi call: band 3
const F = pub('F', 'Future ES', 3.5, null, { status: 'Future' })
const P = priv('P', 'Pine Academy', 1.5, 200)
const Q = priv('Q', 'Quail School', 4.2, null)
const totals = (n: number) => ({ public: { enrollment_total: n }, private: { enrollment_total: 0 } })
const STEP1 = [
  { output: { radius_miles: 1, totals: totals(500), public_schools: [A], private_schools: [] } },
  { output: { radius_miles: 3, totals: totals(2000), public_schools: [A, R, B], private_schools: [P] } },
  { output: { radius_miles: 5, totals: totals(2000), public_schools: [A, R, B, F], private_schools: [P, Q] } },
]
const EDGE = new Map([['P', { ppin: 'P', street: '900 PINE RD', city: 'MACON', state: 'GA', zip: '31211' }]])

// ---------------------------------------------------------------------------
// Pure pieces
// ---------------------------------------------------------------------------
Deno.test('extractStep1Schools: band is Step 1 call membership, not the rounded distance', () => {
  const s = extractStep1Schools(STEP1)
  const band = Object.fromEntries(s.schools.map((x) => [x.school_id, x.band]))
  assertEquals(band, { 'public:A': 1, 'public:R': 3, 'public:B': 3, 'private:P': 3, 'public:F': 5, 'private:Q': 5 })
  assertEquals(s.bands['1'], totals(500))
  assertEquals(s.warnings, [])
  assertEquals(extractStep1Schools(STEP1.slice(0, 2)).warnings.length, 1)
})

Deno.test('buildFillList: EDGE-confirmed mailing address costs no search; planned schools are not filled', () => {
  const { schools, fillList } = buildFillList(extractStep1Schools(STEP1).schools, EDGE)
  assertEquals(fillList.map((f) => [f.school_id, f.missing]), [['public:B', ['enrollment']], ['private:Q', ['street', 'enrollment']]])
  const p = schools.find((s) => s.school_id === 'private:P')!
  assertEquals([p.street, p.zip], ['900 PINE RD', '31211'])
  const q = schools.find((s) => s.school_id === 'private:Q')!
  assertEquals(q.street, null)
  assert(q.notes[0].startsWith('NCES mailing address, physical location not confirmed: Q Church St'))
  // EDGE down: every mailing-flagged private address is unconfirmed
  assertEquals(buildFillList(extractStep1Schools(STEP1).schools, null).fillList.length, 3)
})

Deno.test('isPoBox', () => {
  for (const s of ['PO Box 12', 'P.O. BOX 9', 'post office box 3', 'P O Box 1']) assert(isPoBox(s), s)
  for (const s of ['12 Boxwood Dr', '100 Post Rd', 'Poe Box Ln 4']) assert(!isPoBox(s), s)
})

Deno.test('validateSchoolFill: only missing fields, stated numbers, real street numbers', () => {
  const { fillList } = buildFillList(extractStep1Schools(STEP1).schools, EDGE)
  const url = 'https://district.example/enrollment'
  assertEquals(validateSchoolFill({ school_id: 'public:B', enrollment: 812, source_url: url }, fillList).accepted?.enrollment, 812)
  assertEquals(validateSchoolFill({ school_id: 'public:A', enrollment: 5, source_url: url }, fillList).rejected[0].field, 'school_id')
  assertEquals(validateSchoolFill({ school_id: 'public:B', street: '1 Main St', source_url: url }, fillList).rejected[0].reason,
    'NCES already confirms a physical address for this school')
  assertEquals(validateSchoolFill({ school_id: 'public:B', enrollment: 812.5, source_url: url }, fillList).accepted, null)
  assertEquals(validateSchoolFill({ school_id: 'public:B', enrollment: 812, source_url: 'district site' }, fillList).accepted, null)
  assertEquals(validateSchoolFill({ school_id: 'private:Q', street: 'Oak Street', source_url: url }, fillList).rejected[0].reason,
    'must begin with the street number the source states')
  assertEquals(validateSchoolFill({ school_id: 'private:Q', street: 'PO Box 4', source_url: url }, fillList).accepted, null)
  const ok = validateSchoolFill({ school_id: 'private:Q', street: '12 Oak St', city: 'Macon', state: 'GA', zip: '31210', source_url: url }, fillList)
  assertEquals([ok.accepted?.street, ok.accepted?.zip, ok.rejected], ['12 Oak St', '31210', []])
})

Deno.test('mergeFills: first accepted value wins; separate URLs kept per field', () => {
  const m = mergeFills([
    { school_id: 'x', enrollment: 10, source_url: 'https://e1' },
    { school_id: 'x', enrollment: 99, source_url: 'https://e2' },
    { school_id: 'x', street: '1 A St', source_url: 'https://a1' },
  ]).get('x')!
  assertEquals([m.enrollment, m.street, m.source_url], [10, '1 A St', 'enrollment https://e1; address https://a1'])
})

Deno.test('interpretCensus: match quality derived from candidates and house number', () => {
  const m = (addr: string) => ({ coordinates: { x: -84.4, y: 33.9 }, matchedAddress: addr })
  const body = (...ms: unknown[]) => ({ result: { addressMatches: ms } })
  assertEquals(interpretCensus('4616 Roswell Rd, Marietta GA', body(m('4616 ROSWELL RD, MARIETTA, GA, 30062')))?.match_quality, 'exact')
  assertEquals(interpretCensus('4618 Roswell Rd', body(m('4616 ROSWELL RD, MARIETTA, GA, 30062')))?.match_quality, 'street_number_differs')
  assertEquals(interpretCensus('Roswell Rd, Marietta GA', body(m('ROSWELL RD, MARIETTA, GA, 30062')))?.match_quality, 'no_street_number')
  assertEquals(interpretCensus('1 Main St', body(m('1 MAIN ST, A, GA'), m('1 MAIN ST, B, GA')))?.match_quality, 'ambiguous')
  assertEquals(interpretCensus('Wellstar Kennestone Hospital', body()), null)
  assertEquals(interpretCensus('x', { result: {} }), null)
})

Deno.test('distanceIfExact: a distance only for an exact match', () => {
  const site = { latitude: 33.9921, longitude: -84.4158 }
  const base = { latitude: 34.0211, longitude: -84.4158, matched_address: 'x', candidates: 1 }
  const d = distanceIfExact({ ...base, match_quality: 'exact' }, site)!
  assert(Math.abs(d - 2.0) < 0.01, String(d))
  assertEquals(distanceIfExact({ ...base, match_quality: 'street_number_differs' }, site), null)
  assertEquals(distanceIfExact({ ...base, match_quality: 'ambiguous' }, site), null)
  assertEquals(distanceIfExact({ ...base, match_quality: 'exact' }, null), null)
})

Deno.test('esriDataQuality: Macon (all null) is missing; partial and present', () => {
  assertEquals(esriDataQuality({ pop_1_mile: null, esri_enriched_at: null }).status, 'missing')
  assertEquals(esriDataQuality(null).status, 'missing')
  assertEquals(esriDataQuality({ pop_1_mile: 5000, esri_enriched_at: '2026-01-01' }).status, 'partial')
  const full = Object.fromEntries(['pop_1_mile', 'pop_3_mile', 'pop_5_mile', 'households_1_mile', 'households_3_mile',
    'hh_income_median_1_mile', 'hh_income_median_3_mile', 'hh_income_median_5_mile', 'daytime_pop_1_mile',
    'daytime_pop_3_mile', 'median_age_3_mile', 'tapestry_segment_code', 'tapestry_segment_name'].map((k) => [k, 1]))
  assertEquals(esriDataQuality({ ...full, esri_enriched_at: '2026-01-01' }).status, 'present')
})

Deno.test('recordEmployer: exact match gets a distance; a different house number or no street does not', async () => {
  const site = { latitude: 33.9921, longitude: -84.4158 }
  const exact = () => Promise.resolve({ latitude: 34.0211, longitude: -84.4158, matched_address: '100 MAIN ST', match_quality: 'exact' as const, candidates: 1 })
  const r = await recordEmployer({ name: 'Hospital', employer_type: 'hospital', street: '100 Main St', city: 'Macon', state: 'GA', headcount: 1200, source: 'https://h' }, site, exact)
  assertEquals([r.distance_miles, r.ring], [2, 3])
  const differs = () => Promise.resolve({ latitude: 34, longitude: -84, matched_address: '102 MAIN ST', match_quality: 'street_number_differs' as const, candidates: 1 })
  const r2 = await recordEmployer({ name: 'Plant', employer_type: 'manufacturing', street: '100 Main St', city: 'Macon', headcount: 500.5, source: 'https://p' }, site, differs)
  assertEquals([r2.distance_miles, (r2.recorded as { headcount: unknown }).headcount], [null, null])
  assertEquals((r2.rejected as Array<{ field: string }>)[0].field, 'headcount')
  const r3 = await recordEmployer({ name: 'State University', employer_type: 'university_college', source: 'https://c' }, site, () => Promise.reject(new Error('must not geocode')))
  assertEquals(r3.distance_miles, null)
  assertEquals((await recordEmployer({ name: 'No source', employer_type: 'hospital' }, site, exact)).recorded, null)
})

// ---------------------------------------------------------------------------
// The whole run: prepare → school_fill → deep_pass → exports, against a stateful fake DB.
// ---------------------------------------------------------------------------
function simulate(opts: { step1?: Array<{ output: unknown }>; uploadFails?: boolean; maxAttempts?: number } = {}) {
  const run: ClaimedRun = {
    id: 'run1', thread_id: 't1', kind: 'deep_pass', target_seq: 3, prompt_template_id: 'deep_pass', iteration: 0,
    attempt: 1, max_attempts: opts.maxAttempts ?? 3, convo: [], search_budget: 0, web_search_requests: 0,
    web_search_locked: false, site_submit_id: 'ss1', pass_phase: 'prepare', phase_state: {}, phase_iteration_base: 0,
    phase_search_base: 0, archetype_primary: 'GROWTH', archetype_secondary: null, story_carriers: ['Employment'],
    pinned_context: { site: { latitude: 33.9921, longitude: -84.4158 }, property: { pop_1_mile: null, esri_enriched_at: null } },
  }
  const log: string[] = []
  const tools: Array<{ key: string; name: string; output: unknown }> = []
  const committed = new Set<string>()
  const finalized: Array<{ content: string; parsed: boolean }> = []
  const uploads: Array<{ name: string; text: string }> = []
  const prompts: string[] = []
  const openings: string[] = []

  const db: WorkerDb = {
    claim: () => Promise.resolve(run),
    recordResponse: (a) => { run.web_search_requests += a.webSearchRequests; return Promise.resolve(true) },
    recordToolResult: (a) => { tools.push({ key: `${a.iteration}:${a.attempt}`, name: a.toolName, output: a.output }); return Promise.resolve(true) },
    completeStep: (a) => { committed.add(`${a.iteration}:${a.attempt}`); run.convo = a.convo; run.iteration++; log.push('commit'); return Promise.resolve(true) },
    finalize: (a) => { finalized.push(a); log.push('finalize'); return Promise.resolve({ status: 'finalized' as const }) },
    release: (_r, _o, _i, _a, e) => { log.push(`release:${e}`); return Promise.resolve() },
    fail: (_r, e) => { log.push(`fail:${e}`); return Promise.resolve() },
    promptBody: (id) => { prompts.push(String(id)); return Promise.resolve(`PROMPT ${id}`) },
  }
  const dp: DeepPassDb = {
    advancePhase: (a) => {
      committed.add(`${a.iteration}:${a.attempt}`)
      Object.assign(run, {
        pass_phase: a.nextPhase, convo: a.convo, prompt_template_id: a.promptTemplateId ?? run.prompt_template_id,
        phase_state: { ...run.phase_state, ...a.statePatch }, phase_search_base: run.web_search_requests,
        search_budget: run.web_search_requests + a.phaseSearchBudget, phase_iteration_base: run.iteration + 1,
        iteration: run.iteration + 1,
      })
      if (a.nextPhase !== 'exports') openings.push(String(a.convo[0].content))
      log.push(`→${a.nextPhase}`)
      return Promise.resolve(true)
    },
    patchState: (_r, _o, patch) => { run.phase_state = { ...run.phase_state, ...patch }; return Promise.resolve(true) },
    step1SchoolResults: () => Promise.resolve({ runId: 'step1', results: opts.step1 ?? STEP1 }),
    committedToolOutputs: (_r, name) => Promise.resolve(tools.filter((t) => t.name === name && committed.has(t.key)).map((t) => t.output)),
    promptIdByKey: (key) => Promise.resolve(key),
    firstPassReport: () => Promise.resolve('FIRST PASS REPORT'),
  }

  const script: Record<string, ModelResponse[]> = {
    deep_pass_school_fill: [
      { stop_reason: 'tool_use', usage: { server_tool_use: { web_search_requests: 3 } }, content: [
        { type: 'tool_use', id: 'f1', name: 'record_school_fill', input: { school_id: 'public:B', enrollment: 812, source_url: 'https://bibb.example/b', notes: '2025-26' } },
        { type: 'tool_use', id: 'f2', name: 'record_school_fill', input: { school_id: 'private:Q', street: '12 Oak St', city: 'Macon', state: 'GA', zip: '31210', source_url: 'https://quail.example' } },
        { type: 'tool_use', id: 'f3', name: 'record_school_fill', input: { school_id: 'public:A', enrollment: 1, source_url: 'https://x.example' } },
      ] },
      { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: 'Filled 2 schools. Quail School enrollment still blank.' }] },
    ],
    deep_pass: [
      { stop_reason: 'tool_use', usage: { server_tool_use: { web_search_requests: 5 } }, content: [
        { type: 'tool_use', id: 'e1', name: 'record_employer', input: { name: 'Navicent Hospital', employer_type: 'hospital', street: '777 Hemlock St', city: 'Macon', state: 'GA', headcount: 4600, source: 'https://navicent.example', source_year: '2025' } },
        { type: 'tool_use', id: 'e2', name: 'record_employer', input: { name: '=HYPERLINK("x")', employer_type: 'other_institutional', source: 'https://evil.example' } },
        { type: 'tool_use', id: 'e3', name: 'record_employer', input: { name: 'Kroger on Zebulon Rd', employer_type: 'other_institutional', headcount: 120, source: 'https://kroger.example' } },
      ] },
      { stop_reason: 'end_turn', usage: {}, content: [{ type: 'text', text: '**Why Here**\nThe case.' }] },
    ],
  }
  const create: CreateFn = (params) => {
    const key = String((params.system as Array<{ text: string }>)[0].text).replace('PROMPT ', '')
    const next = script[key]?.shift()
    return next ? Promise.resolve(next) : Promise.reject(new Error(`no scripted response for ${key}`))
  }

  const deps: DeepPassDeps = {
    db, dp, create, log: () => {},
    execute: (name) => Promise.resolve({ ovis_tool: name }),
    webSearchTool: { type: 'web_search_20260209', name: 'web_search' },
    chain: () => Promise.resolve(),
    edgePrivate: () => Promise.resolve(EDGE),
    recordEmployer: (input, site) => recordEmployer(input, site, () =>
      Promise.resolve({ latitude: 34.0211, longitude: -84.4158, matched_address: '777 HEMLOCK ST, MACON, GA', match_quality: 'exact' as const, candidates: 1 })),
    exportFiles: (_ss, files) => {
      if (opts.uploadFails) return Promise.reject(new Error('Dropbox 503'))
      for (const f of files) uploads.push({ name: f.name, text: new TextDecoder().decode(f.bytes) })
      return Promise.resolve(files.map((f) => ({ name: f.name, path: `/Salesforce Documents/Site Submits/Macon - ss1/${f.name}`, size: f.bytes.length })))
    },
  }
  const step = async () => { run.attempt = 1; return await runDeepPassIteration({ ...run }, 'owner', deps).then((o) => { return o }) }
  return { run, log, tools, finalized, uploads, prompts, openings, step, deps }
}

Deno.test('deep pass end to end: phases, budgets, WEB fills, employers, CSVs, final message', async () => {
  const sim = simulate()
  const outcomes: string[] = []
  for (let i = 0; i < 6 && !sim.finalized.length; i++) outcomes.push(await sim.step())
  assertEquals(outcomes, ['chained', 'chained', 'chained', 'chained', 'chained', 'finalized'])
  assertEquals(sim.log, ['→school_fill', 'commit', '→deep_pass', 'commit', '→exports', 'finalize'])
  assertEquals(sim.prompts, ['deep_pass_school_fill', 'deep_pass_school_fill', 'deep_pass', 'deep_pass'])

  // Budgets are per phase: 15 for the fill (3 used), then 20 more for the deep pass.
  assertEquals([sim.run.web_search_requests, sim.run.phase_search_base], [8, 8])

  // The school fill list is the two schools that need a search, closest first.
  assert(sim.openings[0].includes('1. school_id public:B | Bravo MS'))
  assert(sim.openings[0].includes('2. school_id private:Q | Quail School'))
  assert(!sim.openings[0].includes('Pine Academy'))
  // The deep pass opening carries the Esri gap, the call, the NCES totals and the accepted WEB fills only.
  const deep = sim.openings[1]
  assert(deep.includes('ESRI: MISSING.'))
  assert(deep.includes('Archetype: GROWTH'))
  assert(deep.includes('"enrollment_total": 2000'))
  assert(deep.includes('Bravo MS: enrollment 812 (WEB, https://bibb.example/b; 2025-26)'))
  assert(!deep.includes('https://x.example'))

  const schools = sim.uploads.find((u) => u.name === 'schools.csv')!.text.split('\r\n')
  assertEquals(schools[0], 'name,street,city,state,zip,full_address,enrollment,school_level,grade_low,grade_high,public_private,distance_mi,band,school_year,enrollment_source,address_source,notes')
  assertEquals(schools.slice(1, -1).map((l) => l.split(',')[0]), ['Alpha ES', 'Rim HS', 'Pine Academy', 'Bravo MS', 'Future ES', 'Quail School'])
  const row = (name: string) => schools.find((l) => l.startsWith(name))!
  assert(row('Rim HS').includes(',1,3,2023-2024,NCES,NCES,'), row('Rim HS')) // distance 1.0 → band 3 by membership
  assert(row('Bravo MS').includes(',812,') && row('Bravo MS').includes(',WEB,NCES,'), row('Bravo MS'))
  assert(row('Pine Academy').includes('900 PINE RD,MACON,GA,31211,"900 PINE RD, MACON, GA 31211"'), row('Pine Academy'))
  assert(row('Quail School').includes('12 Oak St,Macon,GA,31210,"12 Oak St, Macon, GA 31210",,') && row('Quail School').includes(',,WEB,'), row('Quail School'))
  assert(row('Future ES').includes('planned (NCES status Future)'), row('Future ES'))

  const employers = sim.uploads.find((u) => u.name === 'employers.csv')!.text.split('\r\n')
  assertEquals(employers[0], 'name,employer_type,street,city,state,zip,full_address,headcount,distance_mi,band,source,source_year,notes')
  assertEquals(employers[1], 'Navicent Hospital,hospital,777 Hemlock St,Macon,GA,,"777 Hemlock St, Macon, GA",4600,2,3,https://navicent.example,2025,')
  assertEquals(employers.filter((l) => l.toLowerCase().includes('kroger')), []) // retail rejected, never in the file
  assert(employers[2].startsWith(`"'=HYPERLINK(""x"")"`), employers[2]) // formula guard + quote doubling

  const msg = sim.finalized[0]
  assertEquals(msg.parsed, false) // never touches the thread's archetype columns
  assert(msg.content.startsWith('**Why Here**\nThe case.'))
  assert(msg.content.includes('schools.csv (6 rows), employers.csv (2 rows)'))
})

Deno.test('prepare with nothing to fill goes straight to the deep pass', async () => {
  const clean = [{ output: { radius_miles: 5, totals: totals(500), public_schools: [A], private_schools: [] } }]
  const sim = simulate({ step1: clean })
  assertEquals(await sim.step(), 'chained')
  assertEquals(sim.run.pass_phase, 'deep_pass')
  assertEquals(sim.run.search_budget, 25)
  assert(sim.openings[0].includes('No school needed a web fill'))
})

Deno.test('exports: upload failure retries, and on the last attempt the report is still delivered', async () => {
  const sim = simulate({ uploadFails: true })
  Object.assign(sim.run, { pass_phase: 'exports', phase_state: { report: 'REPORT', schools: [] } })
  assertEquals(await runDeepPassIteration({ ...sim.run, attempt: 1 }, 'owner', sim.deps), 'released')
  assertEquals(sim.log, ['release:Dropbox 503'])
  assertEquals(await runDeepPassIteration({ ...sim.run, attempt: 3 }, 'owner', sim.deps), 'finalized')
  assert(sim.finalized[0].content.includes('**Exports failed:**'))
  assertEquals((sim.run.phase_state!.exports as { status: string }).status, 'failed')
})

Deno.test('prepare fails permanently when the thread has no archetype call', async () => {
  const sim = simulate()
  sim.run.archetype_primary = null
  assertEquals(await sim.step(), 'failed')
  assert(sim.log[0].startsWith('fail:deep_pass_needs_step1'))
})

Deno.test('employer filter: only daytime-population employment; retail and QSR are rejected', async () => {
  const site = { latitude: 33.9921, longitude: -84.4158 }
  const geo = () => Promise.resolve({ latitude: 34.0211, longitude: -84.4158, matched_address: 'X', match_quality: 'exact' as const, candidates: 1 })
  const rec = (input: Record<string, unknown>) => recordEmployer(input, site, geo)
  const rejectedFor = async (input: Record<string, unknown>) => {
    const r = await rec(input)
    assertEquals(r.recorded, null, JSON.stringify(input))
    return (r.rejected as Array<{ field: string; reason: string }>)[0]
  }
  // Excluded: the categories that are customer-facing retail, whatever type is claimed.
  assertEquals((await rejectedFor({ name: 'Kroger', employer_type: 'other_institutional', source: 'https://a' })).field, 'name')
  for (const name of ['Publix Super Market', 'Walmart Supercenter', 'Costco', 'Target', "Chick-fil-A", 'Starbucks', 'CVS Pharmacy', 'QuikTrip', 'Cumberland Mall retail store']) {
    await rejectedFor({ name, employer_type: 'other_institutional', source: 'https://a' })
  }
  await rejectedFor({ name: 'Local Italian restaurant', employer_type: 'other_institutional', source: 'https://a' })
  // A retail brand's back-of-house facility IS employment, when named as one with a matching type.
  const dc = await rec({ name: 'Publix Distribution Center', employer_type: 'distribution_warehouse', headcount: 1200, source: 'https://p' })
  assertEquals((dc.recorded as { name: string; employer_type: string; headcount: number }).name, 'Publix Distribution Center')
  assertEquals((dc.recorded as { employer_type: string }).employer_type, 'distribution_warehouse')
  // ...but the brand alone under a facility type is still a store.
  assertEquals((await rejectedFor({ name: 'Publix', employer_type: 'distribution_warehouse', source: 'https://p' })).field, 'name')
  // Included categories pass.
  for (const [name, employer_type] of [['Navicent Health', 'hospital'], ['Mercer University', 'university_college'],
    ['Bibb County Government Center', 'government'], ['Amazon Fulfillment Center', 'distribution_warehouse'],
    ['Geico Regional Office', 'regional_office'], ['Central High School', 'school'], ['Switch Data Center', 'data_center']]) {
    const r = await rec({ name, employer_type, source: 'https://a' })
    assert(r.recorded, `${name} should be recorded`)
  }
  // A missing or invented type is refused outright.
  assertEquals((await rejectedFor({ name: 'Somewhere', source: 'https://a' })).field, 'employer_type')
  assertEquals((await rejectedFor({ name: 'Somewhere', employer_type: 'retail', source: 'https://a' })).field, 'employer_type')
})

Deno.test('distance_between_addresses: exact both ends, else no distance', async () => {
  const at = (lat: number, lng: number, quality: 'exact' | 'ambiguous' = 'exact') => ({ latitude: lat, longitude: lng, matched_address: `${lat}`, match_quality: quality, candidates: 1 })
  const both = (a: string) => Promise.resolve(a.startsWith('1') ? at(33.9921, -84.4158) : at(34.0211, -84.4158))
  const r = await distanceBetweenAddressesTool('1 A St, Marietta, GA', '2 B St, Marietta, GA', both)
  assertEquals(r.distance_miles, 2)
  const loose = (a: string) => Promise.resolve(a.startsWith('1') ? at(33.9921, -84.4158) : at(34.0211, -84.4158, 'ambiguous'))
  const r2 = await distanceBetweenAddressesTool('1 A St', 'B St', loose)
  assertEquals(r2.distance_miles, null)
  assertEquals((r2.address_b as { match_quality: string }).match_quality, 'ambiguous')
  const none = () => Promise.resolve(null)
  const r3 = await distanceBetweenAddressesTool('x', 'y', none)
  assertEquals([(r3.address_a as { match_quality: string }).match_quality, r3.distance_miles], ['no_match', null])
})
