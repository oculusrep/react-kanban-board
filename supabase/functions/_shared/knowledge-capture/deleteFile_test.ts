import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { canDeleteFile, type DeleteDeps, deleteFileWith } from './attachActions.ts'
import { askIntel, type AskDeps, type SearchRow } from './ask.ts'

const FOLDER = '/Salesforce Documents/Intel/Chipotle/2026-10-30 Work letter'
const UPLOADER = 'u-uploader'
const OTHER = 'u-other'

const WL_TEXT = 'Chipotle Work Letter\nThe grease interceptor shall be 1,500 gallons, installed by Landlord.'

/**
 * A tiny in-memory Intel: file rows, their chunks (deleted with the row, like
 * the FK cascade), the Dropbox folder, and a search over what's left — the same
 * shape intel_search returns to askIntel.
 */
function world(opts: { admin?: boolean; dropboxFails?: boolean; alreadyGone?: boolean; otherFileInFolder?: boolean } = {}) {
  const files = new Map([
    ['f1', { id: 'f1', created_by: UPLOADER, dropbox_path: `${FOLDER}/work letter.pdf`, dropbox_folder: FOLDER }],
  ])
  const chunks = [{ id: 'c1', file_id: 'f1', content: WL_TEXT }]
  const dropbox = new Set<string>(opts.alreadyGone ? [] : [`${FOLDER}/work letter.pdf`])
  if (opts.otherFileInFolder) dropbox.add(`${FOLDER}/site plan.pdf`)
  dropbox.add(FOLDER)
  const calls: string[] = []

  const deps: DeleteDeps = {
    getFile: (id) => Promise.resolve(files.get(id) ?? null),
    isAdmin: () => Promise.resolve(opts.admin === true),
    removeDropbox: (path) => {
      calls.push(`dropbox:${path}`)
      if (opts.dropboxFails) return Promise.reject(new Error('Dropbox error 500: too_many_write_operations'))
      return Promise.resolve(dropbox.delete(path))
    },
    listFolder: (folder) => Promise.resolve(new Set(
      [...dropbox].filter((p) => p.startsWith(`${folder}/`)).map((p) => p.slice(folder.length + 1).toLowerCase()),
    )),
    deleteRow: (id) => {
      calls.push(`row:${id}`)
      files.delete(id)
      for (let i = chunks.length - 1; i >= 0; i--) if (chunks[i].file_id === id) chunks.splice(i, 1)
      return Promise.resolve()
    },
  }

  const search = (): Promise<SearchRow[]> => Promise.resolve(chunks.map((c) => ({
    source_kind: 'file' as const, entry_id: 'e1', file_id: c.file_id, chunk_id: c.id, content: c.content,
    locator: 'p. 1', filename: 'work letter.pdf', entry_created_at: '2026-10-30T13:00:00Z',
    author_name: 'Mike Minihan', similarity: 0.6, matched: ['meaning', 'keyword'], score: 0.03,
  })))
  let answered = 0
  const ask: AskDeps = {
    embed: () => Promise.resolve([0.1]),
    search,
    answer: () => {
      answered++
      return Promise.resolve({
        answered: true,
        statements: [{
          text: 'The grease interceptor is 1,500 gallons.',
          citations: [{ source: 'S1', quote: 'The grease interceptor shall be 1,500 gallons' }],
        }],
      })
    },
  }
  return { deps, files, chunks, dropbox, calls, ask, answeredCount: () => answered }
}

Deno.test('canDeleteFile: the uploader or an admin, nobody else', () => {
  assert(canDeleteFile({ created_by: UPLOADER }, UPLOADER, false))
  assert(canDeleteFile({ created_by: UPLOADER }, OTHER, true))
  assert(!canDeleteFile({ created_by: UPLOADER }, OTHER, false))
})

Deno.test('delete_file: the uploader removes the Dropbox file first, then the row and its chunks', async () => {
  const w = world({ otherFileInFolder: true })
  const res = await deleteFileWith(w.deps, UPLOADER, { file_id: 'f1' })
  assertEquals(res.status, 200)
  assertEquals(w.calls.slice(0, 2), [`dropbox:${FOLDER}/work letter.pdf`, 'row:f1'])
  assertEquals(w.files.size, 0)
  assertEquals(w.chunks.length, 0)
  assert(!w.dropbox.has(`${FOLDER}/work letter.pdf`))
  // Another file is still in the folder, so the folder stays.
  assert(w.dropbox.has(FOLDER))
})

Deno.test('delete_file: an admin may delete someone else\'s file', async () => {
  const w = world({ admin: true })
  assertEquals((await deleteFileWith(w.deps, OTHER, { file_id: 'f1' })).status, 200)
  assertEquals(w.files.size, 0)
})

Deno.test('delete_file: anyone else gets 403 and nothing changes', async () => {
  const w = world()
  const res = await deleteFileWith(w.deps, OTHER, { file_id: 'f1' })
  assertEquals(res.status, 403)
  assertEquals(w.calls, [])
  assertEquals(w.files.size, 1)
  assertEquals(w.chunks.length, 1)
})

Deno.test('delete_file: Dropbox refusing leaves the row and its text in place (502)', async () => {
  const w = world({ dropboxFails: true })
  const res = await deleteFileWith(w.deps, UPLOADER, { file_id: 'f1' })
  assertEquals(res.status, 502)
  assertEquals(w.files.size, 1)
  assertEquals(w.chunks.length, 1)
})

Deno.test('delete_file: a file already gone from Dropbox still loses its row; the empty folder goes too', async () => {
  const w = world({ alreadyGone: true })
  assertEquals((await deleteFileWith(w.deps, UPLOADER, { file_id: 'f1' })).status, 200)
  assertEquals(w.files.size, 0)
  assert(!w.dropbox.has(FOLDER))
})

Deno.test('delete_file: unknown file 404, missing id 400', async () => {
  const w = world()
  assertEquals((await deleteFileWith(w.deps, UPLOADER, { file_id: 'nope' })).status, 404)
  assertEquals((await deleteFileWith(w.deps, UPLOADER, {})).status, 400)
})

Deno.test('a deleted file no longer appears in Ask results', async () => {
  const w = world()
  const q = { question: 'How big is the grease interceptor in the Chipotle work letter?' }

  const before = await askIntel(w.ask, q)
  const answered = before.body as { result: string; sources: Array<{ file_id: string | null }> }
  assertEquals(answered.result, 'answered')
  assertEquals(answered.sources.map((s) => s.file_id), ['f1'])

  assertEquals((await deleteFileWith(w.deps, UPLOADER, { file_id: 'f1' })).status, 200)

  const after = await askIntel(w.ask, q)
  assertEquals((after.body as { result: string }).result, 'nothing_found')
  // Nothing left to cite, so the model isn't even asked.
  assertEquals(w.answeredCount(), 1)
})
