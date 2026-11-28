import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { type FileRow, type Progress, runStep, type SavedChunk, type StepDeps } from './extract.ts'

function row(over: Partial<FileRow>): FileRow {
  return {
    id: 'f1', filename: 'x.pdf', file_ext: 'pdf', dropbox_path: '/Salesforce Documents/Intel/General/d/x.pdf',
    status: 'extracting', status_note: null, page_count: null, char_count: 0, read_cursor: 0,
    scanned_pages: [], ocr_cursor: 0, next_ord: 0, ...over,
  }
}

const TEXT = 'Tenant Improvement Allowance: $45.00 per rentable square foot, payable within 30 days of opening.'

function deps(over: Partial<StepDeps> = {}) {
  const saves: Array<{ chunks: SavedChunk[]; progress: Progress }> = []
  const calls = { ocr: [] as number[][], download: 0 }
  const d: StepDeps = {
    download: () => { calls.download++; return Promise.resolve(new Uint8Array(10)) },
    pdfPages: () => Promise.resolve({ total: 1, pages: [{ page: 1, text: TEXT }] }),
    docxText: () => Promise.resolve(TEXT),
    sheets: () => Promise.resolve([{ name: 'Rent roll', rows: [['Tenant', 'Rent'], ['Chipotle', '52']], truncated: false }]),
    ocrPages: (_b, pages) => { calls.ocr.push(pages); return Promise.resolve(pages.map((p) => ({ page: p, text: `Scanned page ${p}: ${TEXT}` }))) },
    embed: (texts) => Promise.resolve({ vectors: texts.map(() => [0.1, 0.2]), model: 'm', dimensions: 2 }),
    save: (_id, chunks, progress) => { saves.push({ chunks, progress }); return Promise.resolve() },
    ...over,
  }
  return { d, saves, calls }
}

Deno.test('text PDF: one step, chunks embedded with page locators, done', async () => {
  const { d, saves } = deps()
  const res = await runStep(row({}), d)
  assertEquals(res, { status: 'done', more: false })
  assertEquals(saves[0].chunks.map((c) => [c.ord, c.locator, c.method]), [[0, 'p. 1', 'text']])
  assertEquals(saves[0].progress.read_cursor, 1)
  assertEquals(saves[0].progress.page_count, 1)
})

Deno.test('long PDF resumes where the last step stopped', async () => {
  const { d, saves } = deps({
    pdfPages: (_b, from) => Promise.resolve({ total: 3, pages: [{ page: from, text: `${TEXT} (page ${from})` }] }),
  })
  let file = row({})
  for (let i = 0; i < 5; i++) {
    const r = await runStep(file, d)
    const p = saves[saves.length - 1].progress
    file = { ...file, ...p, status: r.status } as FileRow
    if (!r.more) break
  }
  assertEquals(saves.map((s) => s.chunks[0].locator), ['p. 1', 'p. 2', 'p. 3'])
  assertEquals(saves.map((s) => s.chunks[0].ord), [0, 1, 2])
  assertEquals(file.status, 'done')
})

Deno.test('scanned pages are queued, then read by Claude a few at a time', async () => {
  const pages = [1, 2, 3, 4, 5].map((p) => ({ page: p, text: p === 2 ? TEXT : ' ' }))
  const { d, saves, calls } = deps({ pdfPages: () => Promise.resolve({ total: 5, pages }) })
  let file = row({})
  const statuses: string[] = []
  for (let i = 0; i < 6; i++) {
    const r = await runStep(file, d)
    statuses.push(r.status)
    file = { ...file, ...saves[saves.length - 1].progress, status: r.status } as FileRow
    if (!r.more) break
  }
  assertEquals(file.scanned_pages, [1, 3, 4, 5])
  assertEquals(calls.ocr, [[1, 3, 4], [5]])
  assertEquals(statuses, ['extracting', 'extracting', 'done'])
  const scans = saves.flatMap((s) => s.chunks).filter((c) => c.method === 'scan')
  assertEquals(scans.map((c) => c.locator), ['p. 1', 'p. 3–4', 'p. 5'])
  assert(String(saves[saves.length - 1].progress.status_note).includes('4 scanned pages read'))
})

Deno.test('a scan too big for the reader is stored, flagged, never silently empty', async () => {
  const { d, saves, calls } = deps({
    download: () => Promise.resolve(new Uint8Array(23 * 1024 * 1024)),
    pdfPages: () => Promise.resolve({ total: 2, pages: [{ page: 1, text: '' }, { page: 2, text: '' }] }),
  })
  let file = row({})
  let r = await runStep(file, d)
  file = { ...file, ...saves[0].progress } as FileRow
  r = await runStep(file, d)
  assertEquals(calls.ocr.length, 0)
  assertEquals(r, { status: 'no_text', more: false })
  assert(String(saves[1].progress.status_note).includes('2 scanned pages could not be read'))
})

Deno.test('Word and Excel are read in one step; images and .doc are stored only', async () => {
  const { d, saves } = deps()
  assertEquals(await runStep(row({ file_ext: 'docx' }), d), { status: 'done', more: false })
  assertEquals(saves[0].chunks[0].locator, null)
  assertEquals(await runStep(row({ file_ext: 'xlsx' }), d), { status: 'done', more: false })
  assertEquals(saves[1].chunks[0].locator, 'Sheet: Rent roll')
  assert(saves[1].chunks[0].content.includes('Tenant: Chipotle | Rent: 52'))

  const img = deps()
  assertEquals(await runStep(row({ file_ext: 'png' }), img.d), { status: 'unsupported', more: false })
  assertEquals(img.calls.download, 0)
})

Deno.test('an embedding failure throws (the step is retried), nothing is saved', async () => {
  const { d, saves } = deps({ embed: () => Promise.reject(new Error('openai down')) })
  let threw = false
  try { await runStep(row({}), d) } catch { threw = true }
  assert(threw)
  assertEquals(saves.length, 0)
})
