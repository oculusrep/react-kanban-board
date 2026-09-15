import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { type ClaimedRun, runOneIteration, type WorkerDb } from './iteration.ts'
import type { CreateFn } from './loop.ts'

const baseRun = (over: Partial<ClaimedRun> = {}): ClaimedRun => ({
  id: 'run1', thread_id: 't1', kind: 'archetype', target_seq: 0, prompt_template_id: 'tpl',
  iteration: 0, attempt: 1, convo: [{ role: 'user', content: 'go' }], search_budget: 12,
  web_search_requests: 0, web_search_locked: false, site_submit_id: 'ss1', pinned_context: {}, ...over,
})

function fakeDb(run: ClaimedRun | null, opts: { leased?: boolean } = {}) {
  const calls: string[] = []
  const finalized: unknown[] = []
  const db: WorkerDb = {
    claim: () => { calls.push('claim'); return Promise.resolve(run) },
    recordResponse: (a) => { calls.push(`response:${a.stopReason}:${a.costUsd.toFixed(4)}`); return Promise.resolve(opts.leased ?? true) },
    recordToolResult: (a) => { calls.push(`tool:${a.toolName}`); return Promise.resolve(true) },
    completeStep: (a) => { calls.push(`commit:tools=${a.clientToolCalls}:convo=${a.convo.length}`); return Promise.resolve(true) },
    finalize: (a) => { calls.push('finalize'); finalized.push(a); return Promise.resolve({ status: 'finalized' as const }) },
    release: (_r, _o, _i, _a, e) => { calls.push(`release:${e}`); return Promise.resolve() },
    fail: (_r, e) => { calls.push(`fail:${e}`); return Promise.resolve() },
    promptBody: () => Promise.resolve('SYSTEM'),
  }
  return { db, calls, finalized }
}

const deps = (db: WorkerDb, create: CreateFn, chained: string[]) => ({
  db, create,
  execute: (name: string) => Promise.resolve({ ok: name }),
  clientTools: [{ name: 'query_nearby_schools' }], webSearchTool: { type: 'web_search_20260209', name: 'web_search' },
  chain: (id: string) => { chained.push(id); return Promise.resolve() },
  log: () => {},
})

Deno.test('tool_use iteration: cost recorded BEFORE tools run, each tool persisted, then commit and chain', async () => {
  const { db, calls } = fakeDb(baseRun())
  const chained: string[] = []
  const create: CreateFn = () => Promise.resolve({
    content: [{ type: 'tool_use', id: 'tu1', name: 'query_nearby_schools', input: {} }, { type: 'tool_use', id: 'tu2', name: 'query_nearby_starbucks', input: {} }],
    usage: { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: 2 } },
    stop_reason: 'tool_use',
  })
  const out = await runOneIteration('run1', 'owner', deps(db, create, chained))
  assertEquals(out, 'chained')
  // tokens 1000*5/1M + 100*25/1M = 0.0075, + 2 searches * $0.01 = 0.0275
  assertEquals(calls, ['claim', 'response:tool_use:0.0275', 'tool:query_nearby_schools', 'tool:query_nearby_starbucks', 'commit:tools=2:convo=3'])
  assertEquals(chained, ['run1'])
})

Deno.test('final iteration: finalize with parsed archetype, no chain', async () => {
  const { db, calls, finalized } = fakeDb(baseRun({ iteration: 2 }))
  const chained: string[] = []
  const text = 'Report prose.\n```json\n{"archetype_primary":"GROWTH","archetype_secondary":null,"story_carriers":["Competitive ring"]}\n```'
  const create: CreateFn = () => Promise.resolve({ content: [{ type: 'text', text }], usage: {}, stop_reason: 'end_turn' })
  const out = await runOneIteration('run1', 'owner', deps(db, create, chained))
  assertEquals(out, 'finalized')
  assertEquals(calls.at(-1), 'finalize')
  const f = finalized[0] as { content: string; parsed: boolean; archetypePrimary: string; storyCarriers: string[] }
  assertEquals([f.content, f.parsed, f.archetypePrimary, f.storyCarriers], ['Report prose.', true, 'GROWTH', ['Competitive ring']])
  assertEquals(chained, [])
})

Deno.test('lease lost after the response: no tools run, nothing committed', async () => {
  const { db, calls } = fakeDb(baseRun(), { leased: false })
  const create: CreateFn = () => Promise.resolve({ content: [{ type: 'tool_use', id: 'x', name: 'q', input: {} }], usage: {}, stop_reason: 'tool_use' })
  const out = await runOneIteration('run1', 'owner', deps(db, create, []))
  assertEquals(out, 'lease_lost')
  assertEquals(calls, ['claim', 'response:tool_use:0.0000'])
})

Deno.test('transient API error (529 overloaded): lease released for the engine to retry', async () => {
  const { db, calls } = fakeDb(baseRun())
  const create: CreateFn = () => Promise.reject(Object.assign(new Error('529 overloaded'), { status: 529 }))
  assertEquals(await runOneIteration('run1', 'owner', deps(db, create, [])), 'released')
  assertEquals(calls, ['claim', 'release:529 overloaded'])
})

Deno.test('permanent API error (400): run failed, not retried', async () => {
  const { db, calls } = fakeDb(baseRun())
  const create: CreateFn = () => Promise.reject(Object.assign(new Error('400 bad request'), { status: 400 }))
  assertEquals(await runOneIteration('run1', 'owner', deps(db, create, [])), 'failed')
  assertEquals(calls, ['claim', 'fail:400 bad request'])
})

Deno.test('refusal fails the run after recording its cost', async () => {
  const { db, calls } = fakeDb(baseRun())
  const create: CreateFn = () => Promise.resolve({ content: [], usage: { input_tokens: 10 }, stop_reason: 'refusal', stop_details: { category: 'x' } })
  assertEquals(await runOneIteration('run1', 'owner', deps(db, create, [])), 'failed')
  assertEquals(calls[1].startsWith('response:refusal'), true)
  assertEquals(calls[2].startsWith('fail:model_refused'), true)
})

Deno.test('not claimed: nothing else happens', async () => {
  const { db, calls } = fakeDb(null)
  assertEquals(await runOneIteration('run1', 'owner', deps(db, () => Promise.reject(new Error('must not call')), [])), 'not_claimed')
  assertEquals(calls, ['claim'])
})

Deno.test('iteration ceiling fails the run without calling the model', async () => {
  const { db, calls } = fakeDb(baseRun({ iteration: 15 }))
  assertEquals(await runOneIteration('run1', 'owner', deps(db, () => Promise.reject(new Error('must not call')), [])), 'failed')
  assertEquals(calls[1].startsWith('fail:tool_loop_exhausted'), true)
})

Deno.test('a tool that throws is persisted as an error result and the iteration still commits', async () => {
  const { db, calls } = fakeDb(baseRun())
  const create: CreateFn = () => Promise.resolve({ content: [{ type: 'tool_use', id: 't', name: 'boom', input: {} }], usage: {}, stop_reason: 'tool_use' })
  const d = { ...deps(db, create, []), execute: () => Promise.reject(new Error('nces down')) }
  assertEquals(await runOneIteration('run1', 'owner', d), 'chained')
  assertEquals(calls.slice(2), ['tool:boom', 'commit:tools=1:convo=3'])
})
