import { assert, assertAlmostEquals, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  type CreateFn, hasPendingServerToolUse, type ModelResponse, planSearch, runToolLoop, USD_PER_WEB_SEARCH,
} from './loop.ts'

const pricing = { usdPerMInput: 5, usdPerMOutput: 25, usdPerMCacheRead: 0.5, usdPerMCacheWrite: 6.25 }
const WS = { type: 'web_search_20260209', name: 'web_search' }
const clientTool = { name: 'query_x', input_schema: { type: 'object', properties: {} } }
const quiet = () => {}

type Captured = Record<string, unknown>
const wsTool = (p: Captured) => ((p.tools as Captured[] | undefined) ?? []).find((t) => t.name === 'web_search')

/**
 * A greedy fake model: every turn it wants 5 more searches (the API grants at most
 * max_uses of them, or none if the tool is absent / calls are locked), then calls a
 * client tool so the loop continues, until `turns` is reached.
 */
function greedyModel(turns: number, captured: Captured[]): CreateFn {
  let i = 0
  return (params) => {
    captured.push(structuredClone(params))
    i++
    const t = wsTool(params)
    const locked = (params.tool_choice as Captured | undefined)?.type === 'none'
    const granted = t && !locked ? Math.min(5, Number(t.max_uses)) : 0
    const usage = { input_tokens: 1000, output_tokens: 100, server_tool_use: { web_search_requests: granted } }
    if (i >= turns) return Promise.resolve({ content: [{ type: 'text', text: 'done' }], usage, stop_reason: 'end_turn' })
    return Promise.resolve({
      content: [{ type: 'tool_use', id: `tu_${i}`, name: 'query_x', input: {} }],
      usage,
      stop_reason: 'tool_use',
    } as ModelResponse)
  }
}

Deno.test('budget holds across iterations: 12 total, not 12 per request', async () => {
  const captured: Captured[] = []
  const r = await runToolLoop({
    create: greedyModel(8, captured), execute: () => Promise.resolve({ ok: true }),
    baseParams: { model: 'm' }, messages: [{ role: 'user', content: 'go' }],
    clientTools: [clientTool], webSearchTool: WS, searchBudget: 12, pricing, log: quiet,
  })
  assertEquals(r.web_search_requests, 12)
  // max_uses shrinks to what is left, then the tool disappears while client tools remain
  assertEquals(captured.map((p) => wsTool(p)?.max_uses ?? null), [12, 7, 2, null, null, null, null, null])
  assert(captured.slice(3).every((p) => (p.tools as Captured[]).some((t) => t.name === 'query_x')))
  assert(captured.every((p) => p.tool_choice === undefined))
  // The old static max_uses: 12 on every request would have allowed 5 per turn x 8 = 40 here.
})

Deno.test('cost_usd includes search fees at $10 per 1,000', async () => {
  const r = await runToolLoop({
    create: greedyModel(8, []), execute: () => Promise.resolve({}), baseParams: {},
    messages: [{ role: 'user', content: 'go' }], clientTools: [clientTool], webSearchTool: WS,
    searchBudget: 12, pricing, log: quiet,
  })
  const tokens = 8 * ((1000 * 5 + 100 * 25) / 1_000_000)
  assertAlmostEquals(r.cost_usd!, tokens + 12 * USD_PER_WEB_SEARCH, 1e-9)
  assertAlmostEquals(USD_PER_WEB_SEARCH, 0.01, 1e-12)
})

Deno.test('a deferred search pending at exhaustion keeps the tool defined but locks new calls', async () => {
  const captured: Captured[] = []
  let i = 0
  const create: CreateFn = (params) => {
    captured.push(structuredClone(params))
    i++
    if (i === 1) {
      // spends the whole budget, and defers one more search alongside a client tool call
      return Promise.resolve({
        content: [
          { type: 'server_tool_use', id: 'srv_pending', name: 'web_search', input: { query: 'q' } },
          { type: 'tool_use', id: 'tu_1', name: 'query_x', input: {} },
        ],
        usage: { input_tokens: 10, output_tokens: 10, server_tool_use: { web_search_requests: 12 } },
        stop_reason: 'tool_use',
      })
    }
    // the deferred search runs at the start of this request (+1 overshoot), then the model writes
    return Promise.resolve({
      content: [{ type: 'web_search_tool_result', tool_use_id: 'srv_pending', content: [] }, { type: 'text', text: 'ok' }],
      usage: { input_tokens: 10, output_tokens: 10, server_tool_use: { web_search_requests: 1 } },
      stop_reason: 'end_turn',
    })
  }
  const r = await runToolLoop({
    create, execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'go' }],
    clientTools: [clientTool], webSearchTool: WS, searchBudget: 12, pricing, log: quiet,
  })
  assertEquals(wsTool(captured[1])?.max_uses, 1) // still defined, as the API requires
  assertEquals(captured[1].tool_choice, { type: 'none' }) // but nothing new can start
  assertEquals(r.web_search_requests, 13) // the one deferred search is the only overshoot
})

Deno.test('if the API rejects dropping web_search, the loop retries locked and stays locked', async () => {
  const captured: Captured[] = []
  let i = 0
  const create: CreateFn = (params) => {
    captured.push(structuredClone(params))
    const hasWs = !!wsTool(params)
    if (i === 0) {
      i++
      return Promise.resolve({
        content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: {} },
          { type: 'web_search_tool_result', tool_use_id: 's1', content: [] },
          { type: 'tool_use', id: 't1', name: 'query_x', input: {} }],
        usage: { server_tool_use: { web_search_requests: 3 } }, stop_reason: 'tool_use',
      })
    }
    if (!hasWs) {
      const err = Object.assign(new Error('400 invalid_request_error: web_search tool use found but no web_search tool was provided'), { status: 400 })
      return Promise.reject(err)
    }
    i++
    if (i < 4) return Promise.resolve({ content: [{ type: 'tool_use', id: `t${i}`, name: 'query_x', input: {} }], usage: {}, stop_reason: 'tool_use' })
    return Promise.resolve({ content: [{ type: 'text', text: 'done' }], usage: {}, stop_reason: 'end_turn' })
  }
  const r = await runToolLoop({
    create, execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'go' }],
    clientTools: [clientTool], webSearchTool: WS, searchBudget: 3, pricing, log: quiet,
  })
  assertEquals(r.text, 'done')
  // request 2 dropped the tool and was rejected; its retry and every later request are locked
  assertEquals(wsTool(captured[1]), undefined)
  for (const p of captured.slice(2)) {
    assertEquals(wsTool(p)?.max_uses, 1)
    assertEquals(p.tool_choice, { type: 'none' })
  }
})

Deno.test('unrelated 400s are not swallowed', async () => {
  let threw = false
  try {
    await runToolLoop({
      create: () => Promise.reject(Object.assign(new Error('400 bad max_tokens'), { status: 400 })),
      execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'go' }],
      clientTools: [], webSearchTool: WS, searchBudget: 0, pricing, log: quiet,
    })
  } catch { threw = true }
  assert(threw)
})

Deno.test('no tool context: no tools, no tool_choice, no search accounting', async () => {
  const captured: Captured[] = []
  const r = await runToolLoop({
    create: (p) => { captured.push(p); return Promise.resolve({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 1 }, stop_reason: 'end_turn' }) },
    execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'go' }],
    clientTools: [], webSearchTool: null, searchBudget: 12, pricing, log: quiet,
  })
  assertEquals([captured[0].tools, captured[0].tool_choice, r.web_search_requests], [undefined, undefined, 0])
})

Deno.test('planSearch and pending detection', () => {
  assertEquals(planSearch(12, 0, false, false), { mode: 'search', maxUses: 12 })
  assertEquals(planSearch(12, 12, false, false), { mode: 'drop' })
  assertEquals(planSearch(12, 12, true, false), { mode: 'lock' })
  assertEquals(planSearch(12, 13, false, true), { mode: 'lock' })
  assertEquals(hasPendingServerToolUse([{ type: 'server_tool_use', id: 'a' }]), true)
  assertEquals(hasPendingServerToolUse([{ type: 'server_tool_use', id: 'a' }, { type: 'web_search_tool_result', tool_use_id: 'a' }]), false)
})
