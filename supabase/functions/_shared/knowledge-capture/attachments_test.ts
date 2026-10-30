import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  capChunks,
  checkUpload,
  chunkPages,
  cleanFileName,
  clientSegment,
  easternDate,
  freeName,
  MAX_INDEXED_CHARS,
  pickShortTitle,
  sheetText,
  splitText,
  withinIntel,
} from './attachments.ts'
import { docxText, pdfPages, sheets } from './readers.ts'

const FIX = new URL('./fixtures/', import.meta.url)
const fixture = (name: string) => Deno.readFile(new URL(name, FIX))

Deno.test('upload check: types and the 50 MB cap', () => {
  assertEquals(checkUpload('Work Letter.PDF', 1000), { ok: true, ext: 'pdf', kind: 'pdf' })
  assertEquals(checkUpload('rr.xlsx', 1000), { ok: true, ext: 'xlsx', kind: 'sheet' })
  assertEquals(checkUpload('old.doc', 1000), { ok: true, ext: 'doc', kind: 'stored' })
  assertEquals(checkUpload('photo.JPG', 1000), { ok: true, ext: 'jpg', kind: 'image' })
  assert(!checkUpload('script.exe', 10).ok)
  assert(!checkUpload('big.pdf', 50 * 1024 * 1024 + 1).ok)
  assert(checkUpload('max.pdf', 50 * 1024 * 1024).ok)
  assert(!checkUpload('empty.pdf', 0).ok)
})

Deno.test('folder naming: Eastern date, cleaned segments, General never shared with a client', () => {
  // 02:30 UTC on Oct 31 is still Oct 30 in New York.
  assertEquals(easternDate('2026-10-31T02:30:00Z'), '2026-10-30')
  assertEquals(clientSegment('Chipotle Mexican Grill'), 'Chipotle Mexican Grill')
  assertEquals(clientSegment('Acme: East/West?'), 'Acme EastWest')
  assertEquals(clientSegment(null), 'General')
  assertEquals(clientSegment('General'), 'General (client)')
  assertEquals(pickShortTitle('Chipotle work letter TI', 'x'), 'Chipotle work letter TI')
  assertEquals(pickShortTitle('', 'Starbucks work letter says drywall on the Bridge prototype runs $18/sf'),
    'Starbucks work letter says drywall on')
  assertEquals(pickShortTitle('  ', ''), 'Note')
  assertEquals(cleanFileName('Lease: "final" v2.PDF'), 'Lease final v2.pdf')
})

Deno.test('free names follow Dropbox autorename, case-insensitively', () => {
  const taken = new Set(['lease.pdf', 'lease (1).pdf'])
  assertEquals(freeName('Lease.pdf', taken), 'Lease (2).pdf')
  assertEquals(freeName('2026-10-30 Chipotle', new Set(['2026-10-30 chipotle'])), '2026-10-30 Chipotle (1)')
  assertEquals(freeName('new.docx', taken), 'new.docx')
})

Deno.test('only paths inside /Salesforce Documents/Intel are allowed', () => {
  assert(withinIntel('/Salesforce Documents/Intel/General/2026-10-30 x/a.pdf'))
  assert(!withinIntel('/Salesforce Documents/Accounts/Chipotle/a.pdf'))
  assert(!withinIntel('/Salesforce Documents/Intel/../Accounts/a.pdf'))
  assert(!withinIntel('/Intel/General/a.pdf'))
})

Deno.test('chunking keeps pages, splits long text at boundaries, and caps per file', () => {
  const chunks = chunkPages([
    { page: 1, text: 'Page one text.' },
    { page: 2, text: 'Page two text.' },
    { page: 3, text: '' },
  ], 40)
  assertEquals(chunks, [{ locator: 'p. 1–2', content: 'Page one text.\n\nPage two text.' }])

  const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
  const parts = splitText(long, 200, 20)
  assert(parts.length > 1)
  assert(parts.every((p) => p.length <= 200))
  // Nothing lost: every sentence is in some piece.
  for (let i = 0; i < 40; i++) assert(parts.some((p) => p.includes(`Sentence number ${i} is`)), `missing ${i}`)

  const big = [{ locator: null, content: 'x'.repeat(MAX_INDEXED_CHARS - 10) }, { locator: null, content: 'y'.repeat(20) }]
  const capped = capChunks(big, 0)
  assertEquals(capped.kept.length, 1)
  assert(capped.capped)
})

Deno.test('sheet rows become "Header: value" lines', () => {
  assertEquals(
    sheetText([['Tenant', 'Rent PSF'], ['Chipotle', 52], ['', ''], ['Starbucks', '61.5']]),
    'Tenant | Rent PSF\nTenant: Chipotle | Rent PSF: 52\nTenant: Starbucks | Rent PSF: 61.5',
  )
})

// Real files, real parsers (no network beyond fetching the libraries).
Deno.test('readers: text PDF, scanned PDF, Word, Excel', async () => {
  const text = await pdfPages(await fixture('work_letter_text.pdf'), 1)
  assertEquals(text.total, 1)
  assert(text.pages[0].text.includes('Tenant Improvement Allowance: $45.00 per rentable square foot'))

  // An image-only PDF has no text layer: extract.ts sends such pages to Claude.
  const scanned = await pdfPages(await fixture('work_letter_scanned.pdf'), 1)
  assertEquals(scanned.total, 1)
  assertEquals(scanned.pages[0].text.trim(), '')

  const docx = await docxText(await fixture('work_letter.docx'))
  assert(docx.includes('The grease interceptor shall be 1,500 gallons'))

  const book = await sheets(await fixture('rent_roll.xlsx'))
  assertEquals(book[0].name, 'Rent roll')
  assertEquals(book[0].truncated, false)
  assertEquals(sheetText(book[0].rows), 'Tenant | Rent PSF\nTenant: Chipotle | Rent PSF: 52\nTenant: Starbucks | Rent PSF: 61.5')
})
