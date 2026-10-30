import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { askIntel, type AskDeps, normalizeForQuote, numbersIn, type SearchRow, verifyAnswer } from './ask.ts'

const FILE_TEXT = 'Chipotle Work Letter\nLandlord shall deliver the premises with a 200 amp electrical service.\n' +
  'Tenant Improvement Allowance: $45.00 per rentable square foot, payable within 30\ndays of opening.\n' +
  'The grease interceptor shall be 1,500 gallons, installed by Landlord.'

function rowOf(over: Partial<SearchRow>): SearchRow {
  return {
    source_kind: 'file', entry_id: 'e1', file_id: 'f1', chunk_id: 'c1', content: FILE_TEXT, locator: 'p. 1',
    filename: 'Chipotle WL.pdf', entry_created_at: '2026-10-30T13:00:00Z', author_name: 'Mike Minihan',
    similarity: 0.52, matched: ['meaning', 'keyword'], score: 0.03, ...over,
  }
}

function deps(rows: SearchRow[], answer: unknown): AskDeps & { answered: number } {
  const d = {
    answered: 0,
    embed: () => Promise.resolve([0.1]),
    search: () => Promise.resolve(rows),
    answer: () => { d.answered++; return Promise.resolve(answer) },
  }
  return d
}

Deno.test('answers only with quotes found word for word in the cited source', async () => {
  const d = deps([rowOf({})], {
    answered: true,
    statements: [
      { text: 'The TI allowance is $45.00 per rentable square foot.', citations: [{ source: 'S1', quote: 'Tenant Improvement Allowance: $45.00 per rentable square foot' }] },
      // Quote spans a line break in the PDF text: still matches after normalising.
      { text: 'It is payable within 30 days of opening.', citations: [{ source: 'S1', quote: 'payable within 30 days of opening' }] },
      // Paraphrased quote: dropped.
      { text: 'Landlord provides 200 amps.', citations: [{ source: 'S1', quote: 'landlord gives two hundred amps' }] },
    ],
  })
  const res = await askIntel(d, { question: "What's the TI on Chipotle's work letter?" })
  assertEquals(res.status, 200)
  const body = res.body as Extract<typeof res.body, { result: 'answered' }>
  assertEquals(body.result, 'answered')
  assertEquals(body.statements.map((s) => s.text), [
    'The TI allowance is $45.00 per rentable square foot.',
    'It is payable within 30 days of opening.',
  ])
  assertEquals(body.sources.map((s) => [s.n, s.kind, s.filename, s.locator]), [[1, 'file', 'Chipotle WL.pdf', 'p. 1']])
})

Deno.test('a number not in the cited source sinks the statement, even with a valid quote', () => {
  const sources = [{ ...rowOf({}), key: 'S1' }]
  const { statements } = verifyAnswer({
    answered: true,
    statements: [{ text: 'TI is $45 per foot, about $90,000 total.', citations: [{ source: 'S1', quote: 'Allowance: $45.00 per rentable square foot' }] }],
  }, sources)
  assertEquals(statements, [])
})

Deno.test('citations to sources that were never sent are ignored', () => {
  const sources = [{ ...rowOf({}), key: 'S1' }]
  const { statements } = verifyAnswer({
    answered: true,
    statements: [{ text: 'The grease trap is big.', citations: [{ source: 'S7', quote: 'The grease interceptor shall be' }] }],
  }, sources)
  assertEquals(statements, [])
})

Deno.test('nothing relevant: "nothing found" and no model call', async () => {
  const weak = rowOf({ similarity: 0.12, matched: ['meaning'] })
  const d = deps([weak], { answered: true, statements: [] })
  const res = await askIntel(d, { question: 'What is the capital of France?' })
  assertEquals(res.body, { result: 'nothing_found', searched: 1 })
  assertEquals(d.answered, 0)
})

Deno.test('model answers from general knowledge (no valid citation): "nothing found"', async () => {
  const d = deps([rowOf({})], {
    answered: true,
    statements: [{ text: 'Chipotle typically asks for $60/sf TI.', citations: [] }],
  })
  const res = await askIntel(d, { question: 'What TI does Chipotle usually get?' })
  assertEquals((res.body as { result: string }).result, 'nothing_found')
})

Deno.test('answered=false is respected even if statements came back', async () => {
  const d = deps([rowOf({})], {
    answered: false,
    statements: [{ text: 'Payable within 30 days.', citations: [{ source: 'S1', quote: 'payable within 30' }] }],
  })
  assertEquals(((await askIntel(d, { question: 'x?' })).body as { result: string }).result, 'nothing_found')
})

Deno.test('keyword/tag/link matches pass the floor even with a low similarity', async () => {
  const d = deps([rowOf({ source_kind: 'note', file_id: null, chunk_id: null, similarity: 0.1, matched: ['linked record'], content: 'Chipotle wants a drive-thru at Hoschton.' })], {
    answered: true,
    statements: [{ text: 'Chipotle wants a drive-thru at Hoschton.', citations: [{ source: 'S1', quote: 'Chipotle wants a drive-thru' }] }],
  })
  const body = (await askIntel(d, { question: 'Chipotle Hoschton?' })).body as { result: string; sources: Array<{ kind: string }> }
  assertEquals(body.result, 'answered')
  assertEquals(body.sources[0].kind, 'note')
})

Deno.test('input validation', async () => {
  const d = deps([], {})
  assertEquals((await askIntel(d, { question: '  ' })).status, 400)
  assertEquals((await askIntel(d, { question: 'x'.repeat(1001) })).status, 400)
})

Deno.test('quote normalisation and number extraction', () => {
  assertEquals(normalizeForQuote('Tenant’s  “TI”\nelec-\ntrical'), 'tenant\'s "ti" electrical')
  assertEquals(numbersIn('$1,500.00 and 30 days, 45.5'), ['1500', '30', '45.5'])
  assert(numbersIn(FILE_TEXT).includes('45'))
})
