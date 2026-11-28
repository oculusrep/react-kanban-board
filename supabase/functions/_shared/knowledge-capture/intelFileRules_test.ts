import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { failureMessage, MAX_FILE_BYTES, screenFiles } from '../../../../src/components/knowledgeCapture/intelFileRules.ts'

const f = (name: string, size = 1000) => ({ name, size })

Deno.test('attach to a filed note: same caps as a new note, counting files already on it', () => {
  const onNote = Array.from({ length: 8 }, (_, i) => f(`existing ${i}.pdf`))
  const { accepted, refused } = screenFiles([f('a.pdf'), f('b.docx'), f('c.xlsx')], onNote)
  assertEquals(accepted.map((x) => x.name), ['a.pdf', 'b.docx'])
  assertEquals(refused, ['c.xlsx: a note takes at most 10 files.'])
})

Deno.test('attach: wrong type, over 50 MB, empty and exact repeats are refused or skipped', () => {
  const { accepted, refused } = screenFiles(
    [f('notes.txt'), f('big.pdf', MAX_FILE_BYTES + 1), f('empty.pdf', 0), f('lease.pdf'), f('lease.pdf')],
    [f('site plan.pdf')],
  )
  assertEquals(accepted.map((x) => x.name), ['lease.pdf'])
  assertEquals(refused.length, 3)
  assert(refused[1].includes('over 50 MB'))
})

Deno.test('a file already on the note is not uploaded twice', () => {
  assertEquals(screenFiles([f('lease.pdf')], [f('lease.pdf')]).accepted, [])
})

Deno.test('failed upload and failed indexing both say Failed-worthy messages with what to do', () => {
  const up = failureMessage({ status: 'upload_failed', status_note: 'The upload never finished.' })!
  assert(up.startsWith('The upload never finished.'))
  assert(up.includes('attach the file again'))
  const idx = failureMessage({ status: 'failed', status_note: 'Could not read this file: Dropbox error 409: not_found' })!
  assertEquals(idx, "Could not index this file (Dropbox error 409: not_found). It is in Dropbox but Ask can't search it — delete it and attach it again.")
  assertEquals(failureMessage({ status: 'done', status_note: null }), null)
  assertEquals(failureMessage({ status: 'no_text', status_note: 'No text found.' }), null)
})
