import { assert, assertEquals, assertRejects, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { type CreateFn, isOutputFormatRejection, type ModelResponse, runToolLoop } from './loop.ts'
import {
  cleanProposedLinks, cleanTags, cleanText, cleanUnresolved, normalizeProposal, parseModelJson, type Proposal, proposalsDiffer,
} from './proposal.ts'
import { normalizeMessages } from './messages.ts'

const pricing = { usdPerMInput: 2, usdPerMOutput: 10, usdPerMCacheRead: 0.2, usdPerMCacheWrite: 2.5 }
const tool = { name: 'search_deals', input_schema: { type: 'object', properties: {} } }
const quiet = () => {}

type Captured = Record<string, unknown>

// ---------------------------------------------------------------------------
// loop
// ---------------------------------------------------------------------------
Deno.test('tool results come back in ONE user message', async () => {
  let turn = 0
  const create: CreateFn = () => {
    turn++
    if (turn === 1) {
      return Promise.resolve({
        content: [
          { type: 'tool_use', id: 't1', name: 'search_deals', input: { query: 'a' } },
          { type: 'tool_use', id: 't2', name: 'search_deals', input: { query: 'b' } },
        ],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: 'tool_use',
      } as ModelResponse)
    }
    return Promise.resolve({ content: [{ type: 'text', text: '{"ok":true}' }], usage: {}, stop_reason: 'end_turn' })
  }

  const captured: Captured[] = []
  const r = await runToolLoop({
    create: (p) => { captured.push(structuredClone(p)); return create(p) },
    execute: () => Promise.resolve({ results: [] }),
    baseParams: { model: 'test' }, messages: [{ role: 'user', content: 'note' }],
    tools: [tool], pricing, log: quiet,
  })

  assertEquals(r.text, '{"ok":true}')
  assertEquals(r.tools_used, ['search_deals', 'search_deals'])
  // Second request: [user note, assistant tool_use, user tool_results]
  const convo = captured[1].messages as Array<Record<string, unknown>>
  assertEquals(convo.length, 3)
  const results = convo[2].content as Array<Record<string, unknown>>
  assertEquals(results.length, 2)
  assert(results.every((b) => b.type === 'tool_result'))
})

Deno.test('a failing tool is reported back, not thrown, and says not to invent an id', async () => {
  let turn = 0
  const create: CreateFn = () => {
    turn++
    if (turn === 1) {
      return Promise.resolve({
        content: [{ type: 'tool_use', id: 't1', name: 'search_deals', input: {} }],
        usage: {}, stop_reason: 'tool_use',
      } as ModelResponse)
    }
    return Promise.resolve({ content: [{ type: 'text', text: '{}' }], usage: {}, stop_reason: 'end_turn' })
  }
  const captured: Captured[] = []
  await runToolLoop({
    create: (p) => { captured.push(structuredClone(p)); return create(p) },
    execute: () => Promise.reject(new Error('connection reset')),
    baseParams: {}, messages: [{ role: 'user', content: 'n' }], tools: [tool], pricing, log: quiet,
  })
  const results = (captured[1].messages as Array<Record<string, unknown>>)[2].content as Array<Record<string, unknown>>
  assertEquals(results[0].is_error, true)
  assertStringIncludes(String(results[0].content), 'do not invent an id')
})

Deno.test('refusal and truncation fail loudly instead of returning junk', async () => {
  await assertRejects(
    () => runToolLoop({
      create: () => Promise.resolve({ content: [], stop_reason: 'refusal', stop_details: { category: 'cyber' } }),
      execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'n' }],
      tools: [tool], pricing, log: quiet,
    }),
    Error, 'model_refused',
  )
  await assertRejects(
    () => runToolLoop({
      create: () => Promise.resolve({ content: [{ type: 'text', text: '{"reply":"cut o' }], stop_reason: 'max_tokens' }),
      execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'n' }],
      tools: [tool], pricing, log: quiet,
    }),
    Error, 'response_truncated',
  )
})

Deno.test('output format merges with effort rather than replacing output_config', async () => {
  const captured: Captured[] = []
  await runToolLoop({
    create: (p) => {
      captured.push(structuredClone(p))
      return Promise.resolve({ content: [{ type: 'text', text: '{}' }], usage: {}, stop_reason: 'end_turn' })
    },
    execute: () => Promise.resolve({}),
    baseParams: { output_config: { effort: 'low' } },
    messages: [{ role: 'user', content: 'n' }], tools: [tool], pricing,
    outputFormat: { type: 'json_schema', schema: { type: 'object' } }, log: quiet,
  })
  const oc = captured[0].output_config as Record<string, unknown>
  assertEquals(oc.effort, 'low')
  assertEquals((oc.format as Record<string, unknown>).type, 'json_schema')
})

Deno.test('cost adds cache reads and writes at their own rates', async () => {
  const r = await runToolLoop({
    create: () => Promise.resolve({
      content: [{ type: 'text', text: '{}' }],
      usage: { input_tokens: 1_000_000, output_tokens: 1_000_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 },
      stop_reason: 'end_turn',
    }),
    execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'n' }],
    tools: [tool], pricing, log: quiet,
  })
  assertEquals(r.cost_usd, 2 + 10 + 0.2 + 2.5)
})

Deno.test('a model that never answers is capped, not infinite', async () => {
  await assertRejects(
    () => runToolLoop({
      create: () => Promise.resolve({
        content: [{ type: 'tool_use', id: 't', name: 'search_deals', input: {} }],
        usage: {}, stop_reason: 'tool_use',
      } as ModelResponse),
      execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'n' }],
      tools: [tool], pricing, log: quiet,
    }),
    Error, 'tool_loop_exhausted',
  )
})

// ---------------------------------------------------------------------------
// proposal parsing
// ---------------------------------------------------------------------------
Deno.test('parseModelJson handles bare, fenced and prose-wrapped JSON', () => {
  assertEquals(parseModelJson('{"a":1}').a, 1)
  assertEquals(parseModelJson('```json\n{"a":2}\n```').a, 2)
  assertEquals(parseModelJson('Here you go:\n{"a":3}\nhope that helps').a, 3)
})

Deno.test('parseModelJson throws on something that is not an object', () => {
  let threw = false
  try { parseModelJson('not json at all') } catch { threw = true }
  assert(threw)
  threw = false
  try { parseModelJson('[1,2,3]') } catch { threw = true }
  assert(threw, 'a JSON array is not a proposal')
})

Deno.test('tags are lowercased, de-duplicated, trimmed and capped', () => {
  const tags = cleanTags(['Construction Costs', 'construction costs', '  prototype:  bridge ', '', 42, 'x'.repeat(200)])
  assertEquals(tags, ['construction costs', 'prototype: bridge', 'x'.repeat(80)])
})

Deno.test('links keep only well-formed, known types and drop duplicates', () => {
  const links = cleanProposedLinks([
    { object_type: 'deal', object_id: ' 11111111-1111-1111-1111-111111111111 ', object_name: 'A' },
    { object_type: 'deal', object_id: '11111111-1111-1111-1111-111111111111' },
    { object_type: 'site_submit', object_id: '22222222-2222-2222-2222-222222222222' },
    { object_type: 'contact' },
    'nope',
  ])
  assertEquals(links.length, 1)
  assertEquals(links[0].object_type, 'deal')
  assertEquals(links[0].object_id, '11111111-1111-1111-1111-111111111111')
})

Deno.test('cleanText falls back so a filed entry is never empty', () => {
  assertEquals(cleanText('  tidied  '), 'tidied')
  assertEquals(cleanText('   ', 'the raw note'), 'the raw note')
  assertEquals(cleanText(undefined, 'the raw note'), 'the raw note')
})

// ---------------------------------------------------------------------------
// correction diff
// ---------------------------------------------------------------------------
const base = (over: Partial<Proposal> = {}): Proposal => ({
  clean_text: 'Drywall on the Bridge prototype runs $18/sf.',
  links: [
    { object_type: 'account', object_id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', object_name: 'Starbucks' },
    { object_type: 'deal', object_id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', object_name: 'Hoschton' },
  ],
  tags: ['construction costs', 'work letter'],
  is_general: false,
  ...over,
})

Deno.test('reordering chips or renaming a record is NOT a correction', () => {
  const reordered = base({ links: [base().links[1], base().links[0]], tags: ['work letter', 'construction costs'] })
  assert(!proposalsDiffer(base(), reordered))

  // The account was renamed in OVIS between proposing and filing.
  const renamed = base({
    links: [{ ...base().links[0], object_name: 'Starbucks Corporation' }, base().links[1]],
  })
  assert(!proposalsDiffer(base(), renamed), 'link identity is (type, id), not the display name')
})

Deno.test('removing a link, editing the text or changing tags IS a correction', () => {
  assert(proposalsDiffer(base(), base({ links: [base().links[0]] })), 'link removed')
  assert(proposalsDiffer(base(), base({ clean_text: 'Drywall runs $18/sf on the Bridge prototype.' })), 'text edited')
  assert(proposalsDiffer(base(), base({ tags: ['construction costs'] })), 'tag removed')
  assert(proposalsDiffer(base(), base({ links: [], is_general: true })), 'became general knowledge')
})

Deno.test('whitespace-only text changes are not a correction', () => {
  assert(!proposalsDiffer(base(), base({ clean_text: '  Drywall on the Bridge prototype   runs $18/sf.  ' })))
})

Deno.test('normalizeProposal is stable across key order', () => {
  assertEquals(normalizeProposal(base()), normalizeProposal(base()))
})

// ---------------------------------------------------------------------------
// message normalisation
// ---------------------------------------------------------------------------
Deno.test('history is trimmed to start on a user turn and drops junk', () => {
  const msgs = normalizeMessages([
    { role: 'assistant', content: 'leading assistant turn' },
    { role: 'user', content: 'the note' },
    { role: 'system', content: 'ignored' },
    { role: 'assistant', content: '' },
    { role: 'assistant', content: 'a reply' },
    'nope',
  ])
  assertEquals(msgs, [{ role: 'user', content: 'the note' }, { role: 'assistant', content: 'a reply' }])
})

Deno.test('history keeps the most recent turns and still starts on a user turn', () => {
  const many = Array.from({ length: 40 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `m${i}`,
  }))
  const msgs = normalizeMessages(many)
  assert(msgs.length <= 30)
  assertEquals(msgs[0].role, 'user')
  assertEquals(msgs[msgs.length - 1].content, 'm39')
})

// ---------------------------------------------------------------------------
// structured-output fallback
// ---------------------------------------------------------------------------
Deno.test('isOutputFormatRejection matches only a 400 about the format', () => {
  assert(isOutputFormatRejection(Object.assign(new Error('output_config.format is not supported with tools'), { status: 400 })))
  assert(isOutputFormatRejection(Object.assign(new Error('invalid json_schema'), { status: 400 })))
  assert(!isOutputFormatRejection(Object.assign(new Error('output_config.format broke'), { status: 500 })), 'a 500 is transient, not a shape problem')
  assert(!isOutputFormatRejection(Object.assign(new Error('max_tokens must be positive'), { status: 400 })), 'unrelated 400')
  assert(!isOutputFormatRejection(new Error('network down')))
})

Deno.test('a format rejection retries without the format and stays without it', async () => {
  const captured: Captured[] = []
  let calls = 0
  const r = await runToolLoop({
    create: (p) => {
      captured.push(structuredClone(p))
      calls++
      if (calls === 1) {
        return Promise.reject(Object.assign(new Error('output_config.format is not supported'), { status: 400 }))
      }
      if (calls === 2) {
        return Promise.resolve({
          content: [{ type: 'tool_use', id: 't1', name: 'search_deals', input: {} }],
          usage: {}, stop_reason: 'tool_use',
        } as ModelResponse)
      }
      return Promise.resolve({ content: [{ type: 'text', text: '{"reply":"ok"}' }], usage: {}, stop_reason: 'end_turn' })
    },
    execute: () => Promise.resolve({ results: [] }),
    baseParams: { output_config: { effort: 'low' } },
    messages: [{ role: 'user', content: 'n' }], tools: [tool], pricing,
    outputFormat: { type: 'json_schema', schema: { type: 'object' } }, log: quiet,
  })

  assertEquals(r.text, '{"reply":"ok"}')
  assertEquals(calls, 3)
  // 1st carried the format; the retry and every later request carry effort only.
  assert((captured[0].output_config as Record<string, unknown>).format)
  assertEquals(captured[1].output_config, { effort: 'low' })
  assertEquals(captured[2].output_config, { effort: 'low' })
})

Deno.test('a 400 that is not about the format is not retried', async () => {
  let calls = 0
  await assertRejects(
    () => runToolLoop({
      create: () => { calls++; return Promise.reject(Object.assign(new Error('credit balance too low'), { status: 400 })) },
      execute: () => Promise.resolve({}), baseParams: {}, messages: [{ role: 'user', content: 'n' }],
      tools: [tool], pricing, outputFormat: { type: 'json_schema', schema: {} }, log: quiet,
    }),
    Error, 'credit balance too low',
  )
  assertEquals(calls, 1)
})

Deno.test('tags describing the KIND of statement are dropped, subject tags survive', () => {
  assertEquals(
    cleanTags(['estimate', 'Quote', 'notes', 'update', 'info', 'fyi', 'construction costs']),
    ['construction costs'],
  )
  // Compound tags are doing real work even when they contain one of those words.
  assertEquals(
    cleanTags(['vendor quotes', 'rent estimates for 2027', 'work letter']),
    ['vendor quotes', 'rent estimates for 2027', 'work letter'],
  )
})

// ---------------------------------------------------------------------------
// unresolved names (the "create it?" offer)
// ---------------------------------------------------------------------------
Deno.test('unresolved names are shape-checked, trimmed, de-duplicated and capped', () => {
  const u = cleanUnresolved([
    { object_type: 'contact', name: '  Nick   Lukens ' },
    { object_type: 'contact', name: 'nick lukens' },
    { object_type: 'property', name: '100 Main St' },
    { object_type: 'site_submit', name: 'nope' },
    { object_type: 'contact', name: '' },
    { object_type: 'contact' },
    'nope',
  ])
  assertEquals(u, [
    { object_type: 'contact', name: 'Nick Lukens' },
    { object_type: 'property', name: '100 Main St' },
  ])
})

Deno.test('a name that WAS linked is never also reported unresolved', () => {
  const linked = [{ object_type: 'contact' as const, object_id: '11111111-1111-1111-1111-111111111111', object_name: 'Nick Lukens' }]
  assertEquals(cleanUnresolved([{ object_type: 'contact', name: 'nick lukens' }], linked), [])
  // A different name still comes through.
  assertEquals(
    cleanUnresolved([{ object_type: 'contact', name: 'Dana Reyes' }], linked),
    [{ object_type: 'contact', name: 'Dana Reyes' }],
  )
})
