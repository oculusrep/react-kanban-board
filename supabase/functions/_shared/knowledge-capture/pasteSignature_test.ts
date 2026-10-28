import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { looksLikeThread, MAX_PASTE_CHARS, parsePastedSignature, type PasteDeps, verifyName } from './pasteSignature.ts'
import type { RpcResult } from './emailLookup.ts'

// Real signature shapes from stored mail; third parties redacted.
const SIGNATURE = [
  '*Dana Webb*',
  'Senior Vice President',
  'Example Realty Partners',
  '1100 Peachtree St NE, Suite 400',
  'Atlanta, GA 30309',
  '404-555-0142 <(404)%20555-0142> (m)',
  '404-555-0199 (o)',
  'dwebb@example-realty.com',
].join('\n')

const OURS = [
  { kind: 'email', value: 'mike@oculusrep.com' },
  { kind: 'phone', value: '4043264010' },
]

function deps(proposed: unknown, points: RpcResult = { data: OURS, error: null }): PasteDeps & { extracts: number } {
  const d = {
    extracts: 0,
    rpc: (fn: string) => Promise.resolve(fn === 'intel_internal_contact_points' ? points : { data: null, error: { message: `unexpected ${fn}` } }),
    extract: () => {
      d.extracts++
      return Promise.resolve(proposed)
    },
  }
  return d
}

Deno.test('a real signature fills every field it literally contains', async () => {
  const d = deps({
    signature_count: 1,
    name: 'Dana Webb',
    details: {
      title: 'Senior Vice President', company: 'Example Realty Partners', mobile_phone: '404-555-0142', phone: '404-555-0199',
      email: 'dwebb@example-realty.com', address: '1100 Peachtree St NE, Suite 400', city: 'Atlanta', state: 'GA', zip: '30309',
    },
  })
  const res = await parsePastedSignature(d, { text: SIGNATURE })
  assertEquals(res.status, 200)
  assertEquals(res.body, {
    result: 'parsed',
    name: 'Dana Webb',
    details: {
      email: 'dwebb@example-realty.com', phone: '404-555-0199', mobile_phone: '404-555-0142', title: 'Senior Vice President',
      company: 'Example Realty Partners', address: '1100 Peachtree St NE, Suite 400', city: 'Atlanta', state: 'GA', zip: '30309',
    },
  })
})

Deno.test('invented values are dropped: an email built from name + domain, a name not in the text', async () => {
  const text = 'Dana Webb\nExample Realty Partners\n404-555-0199'
  const d = deps({ signature_count: 1, name: 'Dana J. Webb', details: { email: 'dana.webb@example-realty.com', phone: '404-555-0199' } })
  assertEquals((await parsePastedSignature(d, { text })).body, { result: 'parsed', details: { phone: '404-555-0199' } })
})

Deno.test('Oculus details are never filled, even when literally pasted', async () => {
  const text = 'Mike Minihan\nPrincipal | Managing Broker\nOculus Real Estate Partners, LLC\nM: 404-326-4010\nmike@oculusrep.com'
  const d = deps({
    signature_count: 1, name: 'Mike Minihan',
    details: { mobile_phone: '404-326-4010', email: 'mike@oculusrep.com', company: 'Oculus Real Estate Partners, LLC', title: 'Principal | Managing Broker' },
  })
  assertEquals((await parsePastedSignature(d, { text })).body, {
    result: 'parsed', name: 'Mike Minihan', details: { title: 'Principal | Managing Broker' },
  })
})

Deno.test('a pasted thread is refused before any model call', async () => {
  const thread = 'Sounds good.\nDana Webb | 404-555-0199\n\nOn Mon, Oct 19, 2026 at 3:02 PM Pat Lyons <plyons@example.com> wrote:\n> old'
  const d = deps({ signature_count: 1, details: {} })
  assertEquals((await parsePastedSignature(d, { text: thread })).body, { result: 'multiple' })
  assertEquals(d.extracts, 0)
})

Deno.test('two people in one paste: the model says so, nothing is filled', async () => {
  const d = deps({ signature_count: 2, name: 'Dana Webb', details: { phone: '404-555-0199' } })
  assertEquals((await parsePastedSignature(d, { text: SIGNATURE })).body, { result: 'multiple' })
})

Deno.test('nothing verifiable → nothing_found', async () => {
  const d = deps({ signature_count: 1, name: 'Someone Else', details: { email: 'x@y.com' } })
  assertEquals((await parsePastedSignature(d, { text: 'Thanks!\nSent from my iPhone' })).body, { result: 'nothing_found' })
})

Deno.test('the database refusing the internal list (portal/coach) is a 403, never a fill', async () => {
  const d = deps({ signature_count: 1, name: 'Dana Webb', details: { phone: '404-555-0199' } }, {
    data: null, error: { message: 'internal users only', code: '42501' },
  })
  assertEquals((await parsePastedSignature(d, { text: SIGNATURE })).status, 403)
})

Deno.test('empty and oversized pastes are rejected without a model call', async () => {
  const d = deps({})
  assertEquals((await parsePastedSignature(d, { text: '   ' })).status, 400)
  assertEquals((await parsePastedSignature(d, { text: 'x'.repeat(MAX_PASTE_CHARS + 1) })).status, 400)
  assertEquals(d.extracts, 0)
})

Deno.test('name check: literal, case/space-insensitive; never an address or number', () => {
  assertEquals(verifyName('dana  webb', '*Dana Webb*\nSVP'), 'dana webb')
  assertEquals(verifyName('Dana Webb', 'D. Webb'), undefined)
  assertEquals(verifyName('dwebb@example.com', 'dwebb@example.com'), undefined)
  assertEquals(verifyName(42, '42'), undefined)
})

Deno.test('thread detection matches what ownText() would cut, not ordinary signatures', () => {
  assertEquals(looksLikeThread(SIGNATURE), false)
  assertEquals(looksLikeThread('Dana Webb\n---------- Forwarded message ---------\nFrom: X <x@y.com>'), true)
})
