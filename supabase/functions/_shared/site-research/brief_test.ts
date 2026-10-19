import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { briefOpening, type RecordForBrief, recordQaOpening, splitRecordSections, wordCount } from './brief.ts'

const RECORD = `**VERDICT**
- MATURE core with a live GROWTH overlay.
- Lean: pitch with caveats.

**HEADLINE**
Exit 9 is north Macon's retail spine.

**WHY HERE**
- 9,482 households within 3 mi.

**OBJECTIONS**
- Objection: Dutch Bros at 0.6 mi.
  No answer on file: no sales data.

**BACKUP**
*Carrier 1 — Rooftops.* Detail.`

const rec: RecordForBrief = {
  site_submit_name: 'Capital City Bank - Starbucks', archetype_primary: 'MATURE', archetype_secondary: 'GROWTH',
  story_carriers: ['Rooftops and residential growth', 'Nearby Starbucks'], record: RECORD,
  first_pass: 'First pass category scan.', record_written_at: '2026-09-26T14:00:00Z',
}

Deno.test('splitRecordSections finds the record sections in order, for citing and collapsing', () => {
  const s = splitRecordSections(RECORD)
  assertEquals(s.map((x) => x.heading), ['VERDICT', 'HEADLINE', 'WHY HERE', 'OBJECTIONS', 'BACKUP'])
  assert(s[3].body.includes('No answer on file'))
  // A record with no headings is still one readable block, never dropped.
  assertEquals(splitRecordSections('just prose').map((x) => x.heading), ['RECORD'])
  assertEquals(splitRecordSections('').length, 0)
})

Deno.test('the brief opening carries the whole record and says there is nothing else', () => {
  const o = briefOpening(rec)
  assert(o.includes('no tools and no way to look anything up'))
  assert(o.includes(RECORD), 'the full record is included verbatim')
  assert(o.includes('First pass category scan.'))
  assert(o.includes('Archetype on the record: MATURE / GROWTH'))
  assert(o.includes('Story carriers on the record: Rooftops and residential growth; Nearby Starbucks'))
})

Deno.test('the record question carries the question first, then the record', () => {
  const o = recordQaOpening('What is the 3 mi household count?', rec)
  assert(o.startsWith('Question: What is the 3 mi household count?'))
  assert(o.includes('Answer from the record below and nothing else'))
  assert(o.indexOf('## The record') > o.indexOf('Question:'))
  assert(o.includes('9,482 households within 3 mi'))
})

Deno.test('wordCount is what the 200-word brief is measured against', () => {
  assertEquals(wordCount('  one two   three \n four '), 4)
  assertEquals(wordCount(''), 0)
})
