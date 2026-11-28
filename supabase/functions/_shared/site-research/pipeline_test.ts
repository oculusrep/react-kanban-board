import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { buildPipelineCsv, coverageVerdict, householdsByBand, type PipelineMatrix } from './pipeline.ts'

const MATRIX: PipelineMatrix = {
  site: { latitude: 32.880362, longitude: -83.760908 },
  isochrones_from: '2026-09-16T11:56:10Z', isochrones_pulled_m_from_site: 0, has_5min: true, has_10min: true,
  bands: [], weights: {},
  projects: [
    { name: 'Sugar Creek Apartments', units: 80, phase: 'Recently Completed', distance_mi: 0.6, drive_time_band: '5min',
      address: '123 Sugar Creek Rd', lat: 32.885, lng: -83.77, status_source: 'import', source: 'Macon-Bibb P&Z',
      phase_weight: 0, distance_weight: 1, recently_completed_timing_unknown: true },
    { name: 'Barrington Hall', units: 600, phase: 'Under Construction', distance_mi: 3.0, drive_time_band: '10min',
      address: null, lat: 32.92, lng: -83.75, status_source: 'import', source: 'Macon-Bibb P&Z',
      phase_weight: 1, distance_weight: 0.5, recently_completed_timing_unknown: false },
    { name: 'Unplaceable Project', units: null, phase: 'Planning', distance_mi: 4.0, drive_time_band: null,
      address: null, lat: null, lng: null, status_source: null, source: null,
      phase_weight: 0.25, distance_weight: null, recently_completed_timing_unknown: false },
  ],
  pending_unreviewed: [
    { name: 'Agent-found Subdivision', units: 120, phase: 'unreviewed', address: 'off Zebulon Rd', source: 'permit portal', collected_at: '2026-07-21T00:00:00Z' },
  ],
  coverage: { projects_within_10mi: 27, last_collected_at: '2026-07-21T16:14:09Z', research_runs_for_site: 16, last_research_run_at: '2026-07-21T15:45:04Z', pending_rows: 15 },
}

Deno.test('pipeline.csv: header, CHECK rows first, nothing filtered out, blanks blank', () => {
  const { csv, rows, flagged } = buildPipelineCsv(MATRIX)
  const lines = csv.split('\r\n')
  assertEquals(lines[0], 'flag,name,units,phase,distance_mi,drive_time_band,street,city,state,zip,lat,lng,status_source,source,notes')
  // 3 projects + 1 pending, none dropped
  assertEquals(rows.length, 4)
  assertEquals(flagged, 2) // the unplaceable project and the unreviewed row
  // CHECK rows sort to the top
  assertEquals(rows.slice(0, 2).every((r) => r.flag === 'CHECK'), true)
  assertEquals(rows.map((r) => r.name), ['Unplaceable Project', 'Agent-found Subdivision', 'Sugar Creek Apartments', 'Barrington Hall'])
  // blanks stay blank — never N/A, TBD or 0
  const unplaceable = rows[0]
  assertEquals([unplaceable.units, unplaceable.lat, unplaceable.lng, unplaceable.drive_time_band], [null, null, null, null])
  assert(!csv.includes('N/A') && !csv.includes('TBD'))
  // the pending row is exported, phase unreviewed, no distance
  const pending = rows[1]
  assertEquals([pending.phase, pending.units, pending.distance_mi], ['unreviewed', 120, null])
  assert(String(pending.notes).includes('excluded from every total'))
  // a Recently Completed row carries the Esri-base caveat
  assert(String(rows[2].notes).includes('may not yet be inside the Esri household base'))
})

Deno.test('coverage: nothing collected is a gap, not a finding', () => {
  const none = coverageVerdict({ projects_within_10mi: 0, last_collected_at: null, research_runs_for_site: 0, last_research_run_at: null, pending_rows: 0 })
  assertEquals(none.collected, false)
  assert(none.note.includes('COVERAGE GAP'))
  assert(none.note.includes('do not rest the archetype call on it'))

  const ranButEmpty = coverageVerdict({ projects_within_10mi: 0, last_collected_at: null, research_runs_for_site: 3, last_research_run_at: '2026-07-21T00:00:00Z', pending_rows: 0 })
  assertEquals(ranButEmpty.collected, false)
  assert(ranButEmpty.note.includes('3 run(s)'))

  const collected = coverageVerdict(MATRIX.coverage)
  assertEquals(collected.collected, true)
  assert(collected.note.includes('27 human-reviewed project(s)'))
  assert(collected.note.includes('A low count here is a real finding'))
})

Deno.test('householdsByBand reads the snapshot demographics, only the four bands', () => {
  const demo = {
    rings: [{ radius_miles: 1, households: 1897 }, { radius_miles: 2, households: 5439 }, { radius_miles: 3, households: 9482 }],
    drive_times: [{ minutes: 5, households: 520 }, { minutes: 7, households: 3312 }, { minutes: 10, households: 9926 }],
  }
  assertEquals(householdsByBand(demo), { '1mi': 1897, '3mi': 9482, '5min': 520, '10min': 9926 })
  assertEquals(householdsByBand(null), {})
  assertEquals(householdsByBand({ rings: [{ radius_miles: 1, households: null }] }), {})
})
