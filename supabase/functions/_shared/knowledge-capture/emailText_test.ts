import { assert, assertEquals, assertStringIncludes } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import { hasSignature, ownText, signatureSource } from './emailText.ts'
import { verifyDetails } from './proposal.ts'
import { dropOurOwnDetails, emailFromSender, isBulkSender, lookupEmailSignature, type LookupDeps, type RpcResult } from './emailLookup.ts'
import { SIGNATURE_OUTPUT_FORMAT } from './signaturePrompt.ts'

// ---------------------------------------------------------------------------
// Fixtures: REAL stored email bodies (emails.body_text, pulled 2026-10-22).
// Structure, quoting, line wrapping, \r\n, U+202F before AM/PM, U+FEFF and
// HTML entities are exactly as stored. Third parties' names, numbers,
// addresses and licence numbers are replaced; Mike's and Arty's signatures are
// kept as-is because they are what must NOT leak.
// ---------------------------------------------------------------------------

/** Gmail reply. Mike's full signature is in the ">"-quoted thread underneath,
 *  and the sender's own (name-only) signature sits BELOW the quote. */
const REPLY_WITH_MIKES_SIGNATURE_QUOTED = [
  'Hi Dana,',
  '',
  'Great to meet you as well, and I appreciate the introduction, Mike (BCC).',
  '',
  'Dana, would any of these times work for you?',
  '',
  '   - Tomorrow, Wednesday @ 10:00 am or 11 am',
  '   - Friday @ 1 or 2 pm',
  '',
  'Looking forward to connecting!',
  '',
  'Jordan',
  '',
  '',
  'On Wed, Oct 21, 2026 at 9:41 AM Dana Webb <dwebb@example-realty.com> wrote:',
  '',
  '> Mike,',
  '>',
  '> I’m happy to help and thank you for the referral. Jordan,  Nice to meet',
  '> you. I am available Thursday morning or Friday afternoon if you want to set',
  '> up a call to discuss your new concept.',
  '>',
  '> Dana Webb',
  '> Senior Vice President',
  '> Example Realty Partners',
  '> 404-555-0142 <(404)%20555-0142> (m)',
  '> 404-555-0199 <(404)%20555-0199> (o)',
  '> ------------------------------',
  '> *From:* Mike Minihan <mike@oculusrep.com>',
  '> *Sent:* Wednesday, 21 October 2026 09:01:52',
  '> *To:* Dana Webb <dwebb@example-realty.com>; Jordan Ellis <jordan.ellis@example.com',
  '> >',
  '> *Subject:* Introduction to Jordan Ellis',
  '>',
  '> Dana,',
  '>',
  '> Meet Jordan Ellis.',
  '>',
  '> Best,',
  '>',
  '> Mike',
  '> _____________________',
  '> *Mike Minihan*',
  '> Principal | Managing Broker',
  '> Oculus Real Estate Partners, LLC',
  '> M: 404-326-4010 <(404)%20326-4010>',
  '> mike@oculusrep.com',
  '> Connect with me on LinkedIn! <https://www.linkedin.com/in/mikeminihan/>',
  '> www.oculusrep.com',
  '>',
  '>',
  '',
  '-- ',
  '*Jordan Ellis*',
  '',
  '',
].join('\r\n')

/** "Yes" from a phone. Apple Mail quotes WITHOUT ">", and Arty's signature (and
 *  a third party's) are in that unprefixed quote. */
const PHONE_ONE_LINER = [
  'Yes',
  'Sent from my iPhone',
  '',
  'On Oct 13, 2026, at 6:16 PM, Arty Santos <asantos@oculusrep.com> wrote:',
  '',
  '﻿',
  'I have limited options next week because of a commercial RE conference.',
  'Can you do Wednesday between 12:30 PM and 3:00 PM?',
  '',
  'Arty',
  '',
  'On Tue, Oct 13, 2026 at 11:07 AM Lee Novak <lee@example-site.ai<mailto:lee@example-site.ai>> wrote:',
  'Good morning Arty,',
  'I spoke with the seller\'s broker.',
  '',
  'Lee Novak  |',
  '',
  'Lic. # RS000000',
  '',
  '(610) 555-0175<tel:(610)%20555-0175> / lee@example-site.ai<mailto:lee@example-site.ai>',
  '',
  '--',
  '.',
  '',
  'Arty Santos',
  '',
  'Associate Tenant Rep',
  '',
  'Oculus Real Estate Partners',
  '',
  'M: 508-641-7156<tel:508-641-7156>',
  '',
  'E: Asantos@oculusrep.com<mailto:Asantos@oculusrep.com>',
  '',
].join('\r\n')

/** A forward stored as flattened HTML on ONE line: the sender's signature is
 *  above "Begin forwarded message:", the forwarded author's below it, with
 *  entities and Outlook CSS in between. */
const FORWARD_FLATTENED =
  'See below, let’s talk. Sam Ortiz Tenant Representative and Leasing Specialist The Example Group, Inc. ' +
  '404.555.0848 &nbsp;cell sam@example-group.com www.example-group.com GA RE Firm #000000 GA RE License #000000 ' +
  'Begin forwarded message: From: Pat Lyons &lt;plyons@example-franchise.com&gt; Date: October 15, 2026 at ' +
  '4:07:56 PM EDT To: Sam Ortiz &lt;sam@example-group.com&gt; Subject: FW: LOI for the former restaurant ' +
  'v\\:* {behavior:url(#default#VML);} @font-face { font-family: Calibri; } p.MsoNormal { margin: 0in; } ' +
  'Hi Sam, &nbsp; I think we need to look for another tenant. &nbsp; Kind regards, &nbsp; Pat Lyons ' +
  'Real Estate Contract Lease Analyst plyons@example-franchise.com (904) 555-6870\n'

// ---------------------------------------------------------------------------
// Stripping
// ---------------------------------------------------------------------------
Deno.test('reply: Mike\'s quoted signature is stripped; the sender\'s own text and below-quote signature stay', () => {
  const own = ownText(REPLY_WITH_MIKES_SIGNATURE_QUOTED)
  assertStringIncludes(own, 'Looking forward to connecting!')
  assertStringIncludes(own, 'Jordan Ellis') // the "-- " block under the quote
  for (const leaked of ['404-326-4010', 'mike@oculusrep.com', 'Managing Broker', '404-555-0142', 'Senior Vice President', 'wrote:']) {
    assert(!own.includes(leaked), `leaked from the quoted thread: ${leaked}`)
  }
  // A name-only signature isn't one worth extracting from: move on to older mail.
  assertEquals(hasSignature(own), false)
})

Deno.test('reply: verifyDetails cannot confirm Mike\'s or the quoted sender\'s details from it', () => {
  const text = signatureSource(ownText(REPLY_WITH_MIKES_SIGNATURE_QUOTED))
  const proposed = {
    email: 'mike@oculusrep.com', mobile_phone: '404-326-4010', title: 'Principal | Managing Broker',
    phone: '404-555-0199', company: 'Example Realty Partners',
  }
  assertEquals(verifyDetails(proposed, text), undefined)
})

Deno.test('phone one-liner: own text is just "Yes / Sent from my iPhone"; no signature', () => {
  const own = ownText(PHONE_ONE_LINER)
  assertEquals(own, 'Yes\nSent from my iPhone')
  assertEquals(hasSignature(own), false)
})

Deno.test('phone one-liner: nothing from the unprefixed Apple quote survives', () => {
  const text = signatureSource(ownText(PHONE_ONE_LINER))
  assertEquals(verifyDetails({ mobile_phone: '508-641-7156', email: 'asantos@oculusrep.com', phone: '(610) 555-0175' }, text), undefined)
})

Deno.test('forward (flattened HTML): the forwarder\'s signature stays, the forwarded author\'s goes', () => {
  const own = ownText(FORWARD_FLATTENED)
  assertStringIncludes(own, 'Sam Ortiz Tenant Representative')
  assertStringIncludes(own, '404.555.0848')
  assertStringIncludes(own, 'sam@example-group.com')
  for (const leaked of ['Pat Lyons', 'plyons@', '555-6870', 'Begin forwarded', 'MsoNormal', '&nbsp;']) {
    assert(!own.includes(leaked), `leaked from the forward: ${leaked}`)
  }
  assertEquals(hasSignature(own), true)

  const text = signatureSource(own)
  assertEquals(
    verifyDetails({ phone: '404.555.0848', email: 'sam@example-group.com', company: 'The Example Group, Inc.' }, text),
    { phone: '404.555.0848', email: 'sam@example-group.com', company: 'The Example Group, Inc.' },
  )
  assertEquals(verifyDetails({ email: 'plyons@example-franchise.com', phone: '(904) 555-6870' }, text), undefined)
})

Deno.test('other forward and quote markers cut the body', () => {
  const sig = 'Thanks,\nAl Brook\nBrook Partners\n770-555-0101'
  for (const marker of [
    '---------- Forwarded message ---------\nFrom: X <x@y.com>',
    '-----Original Message-----\nFrom: X',
    'From: Pat Lyons <plyons@example.com>\nSent: Monday, October 19, 2026 9:00 AM\nTo: Al',
    '________________________________\nFrom: Pat Lyons <plyons@example.com>\nSent: Monday',
    '> quoted line one\n> quoted line two',
    // Outlook printing a name with no address (real shape, Sept 2026)
    'From: Arty Santos \nSent: Wednesday, September 30, 2026 5:12 PM\nTo: someone@example.com\nSubject: LOI',
  ]) {
    assertEquals(ownText(`${sig}\n\n${marker}\nQUOTED 404-555-9999`), sig, marker.split('\n')[0])
  }
})

Deno.test('a Gmail reply header that wraps onto a second line is still found', () => {
  const body = 'Sounds good.\nAl Brook | 770-555-0101\n\nOn Mon, Oct 19, 2026 at 3:02 PM Pat Lyons <\nplyons@example.com> wrote:\n> old'
  assertEquals(ownText(body), 'Sounds good.\nAl Brook | 770-555-0101')
})

Deno.test('prose that merely contains "wrote:" or "From:" is not cut', () => {
  const body = 'On the call he wrote: nothing yet.\nFrom: the landlord side, no change.\nAl Brook\n770-555-0101'
  assertEquals(ownText(body), body)
  assertEquals(hasSignature(body), true)
})

Deno.test('a "_____" rule above a signature (Mike\'s own style) is not a cut point', () => {
  const body = 'See attached.\n_____________________\nAl Brook\nM: 770-555-0101'
  assertEquals(ownText(body), body)
})

// ---------------------------------------------------------------------------
// Our own details are never prefilled
// ---------------------------------------------------------------------------
const OURS = [
  { kind: 'email' as const, value: 'mike@oculusrep.com' },
  { kind: 'phone' as const, value: '4043264010' },
  { kind: 'phone' as const, value: '5086417156' },
]

Deno.test('automated mail printing OUR details (invoice, booking): every one is dropped', () => {
  // Real shape: a billing email's "Issued to:" block, which no quote marker precedes.
  const invoice = 'Issued to:\nMike Minihan\noculusrep\nmike@oculusrep.com\nOculus Real Estate Partners, LLC\n4043264010\n'
  const own = ownText(invoice)
  const verified = verifyDetails({ email: 'mike@oculusrep.com', phone: '4043264010', company: 'Oculus Real Estate Partners, LLC' }, own)
  assertEquals(Object.keys(verified ?? {}).length, 3) // stripping alone can't help here…
  assertEquals(dropOurOwnDetails(verified!, OURS), {}) // …the identity guard does
})

Deno.test('identity guard: formatting and country code don\'t sneak our numbers through; others pass', () => {
  assertEquals(dropOurOwnDetails({ mobile_phone: '+1 (404) 326-4010', email: 'Someone@OculusRep.com' }, OURS), {})
  assertEquals(
    dropOurOwnDetails({ phone: '404-555-0142', email: 'dwebb@example-realty.com', company: 'Example Realty' }, OURS),
    { phone: '404-555-0142', email: 'dwebb@example-realty.com', company: 'Example Realty' },
  )
})

// ---------------------------------------------------------------------------
// The handler: gate, candidates, scan
// ---------------------------------------------------------------------------
function deps(handlers: Record<string, (args?: Record<string, unknown>) => RpcResult>, extracted: unknown = {}): LookupDeps & { calls: string[]; extracts: string[] } {
  const calls: string[] = []
  const extracts: string[] = []
  return {
    calls,
    extracts,
    rpc: (fn, args) => {
      calls.push(fn)
      const h = handlers[fn]
      return Promise.resolve(h ? h(args) : { data: null, error: { message: `unexpected rpc ${fn}` } })
    },
    extract: (text) => {
      extracts.push(text)
      return Promise.resolve(extracted)
    },
  }
}

Deno.test('gate false (Arty, the VA, anyone not on the list) → 403 before any mailbox read', async () => {
  const d = deps({ intel_email_lookup_allowed: () => ({ data: false, error: null }) })
  const res = await lookupEmailSignature(d, { name: 'Paul Rutledge' })
  assertEquals(res.status, 403)
  assertEquals(d.calls, ['intel_email_lookup_allowed'])
  assertEquals(d.extracts.length, 0)
})

Deno.test('a mailbox function refusing with 42501 is a 403, not a 500', async () => {
  const d = deps({
    intel_email_lookup_allowed: () => ({ data: true, error: null }),
    intel_mailbox_senders: () => ({ data: null, error: { message: 'email lookup is not enabled for this user', code: '42501' } }),
  })
  assertEquals((await lookupEmailSignature(d, { name: 'Paul Rutledge' })).status, 403)
})

Deno.test('a first name alone is not searched', async () => {
  const d = deps({ intel_email_lookup_allowed: () => ({ data: true, error: null }) })
  const res = await lookupEmailSignature(d, { name: 'Paul' })
  assertEquals(res.body, { result: 'need_full_name' })
  assertEquals(d.calls, ['intel_email_lookup_allowed'])
})

Deno.test('two matching addresses → choose; nothing is read or extracted', async () => {
  const candidates = [
    { sender_email: 'paul@a.com', sender_name: 'Paul Rutledge', last_received_at: '2026-10-19T15:00:00Z', email_count: 4 },
    { sender_email: 'prutledge@gmail.com', sender_name: 'Paul Rutledge', last_received_at: '2026-03-01T15:00:00Z', email_count: 1 },
  ]
  const d = deps({
    intel_email_lookup_allowed: () => ({ data: true, error: null }),
    intel_mailbox_senders: () => ({ data: candidates, error: null }),
  })
  const res = await lookupEmailSignature(d, { name: 'Paul Rutledge' })
  assertEquals(res.body, { result: 'choose', candidates })
  assertEquals(d.extracts.length, 0)
})

Deno.test('scan skips the phone one-liner and the reply, and extracts from the first email with a signature', async () => {
  const emails = [
    { id: '1', received_at: '2026-10-20T12:00:00Z', sender_email: 'sam@example-group.com', sender_name: 'Sam Ortiz', subject: 'Re: x', body_text: PHONE_ONE_LINER },
    { id: '2', received_at: '2026-10-18T12:00:00Z', sender_email: 'sam@example-group.com', sender_name: 'Sam Ortiz', subject: 'Re: y', body_text: REPLY_WITH_MIKES_SIGNATURE_QUOTED },
    { id: '3', received_at: '2026-10-15T12:00:00Z', sender_email: 'sam@example-group.com', sender_name: 'Sam Ortiz', subject: 'Fwd: LOI', body_text: FORWARD_FLATTENED },
  ]
  // The model "proposes" a real detail, a quoted-thread detail, and an invented one.
  const d = deps(
    {
      intel_email_lookup_allowed: () => ({ data: true, error: null }),
      intel_mailbox_senders: () => ({ data: [{ sender_email: 'sam@example-group.com', sender_name: 'Sam Ortiz', last_received_at: '', email_count: 3 }], error: null }),
      intel_mailbox_emails_from: () => ({ data: emails, error: null }),
      intel_internal_contact_points: () => ({ data: OURS, error: null }),
    },
    { phone: '404.555.0848', email: 'plyons@example-franchise.com', title: 'Vice President' },
  )
  const res = await lookupEmailSignature(d, { name: 'Sam Ortiz' })
  assertEquals(res.status, 200)
  const body = res.body as { result: string; details: Record<string, string>; source: Record<string, string> }
  assertEquals(body.result, 'found')
  // Phone from the signature; email is the From address we searched on (the
  // model's plyons@ guess came from the forwarded part and was dropped).
  assertEquals(body.details, { phone: '404.555.0848', email: 'sam@example-group.com' })
  assertEquals(body.source.email_id, '3')
  assertEquals(body.source.received_at, '2026-10-15T12:00:00Z')
  assertEquals(body.source.sender_email, 'sam@example-group.com')
  assertEquals(d.extracts.length, 1) // one model call, for email 3 only
})

Deno.test('no email with a signature in the window → no_signature', async () => {
  const d = deps({
    intel_email_lookup_allowed: () => ({ data: true, error: null }),
    intel_mailbox_emails_from: () => ({ data: [{ id: '1', received_at: '', sender_email: 'a@b.com', sender_name: null, subject: null, body_text: PHONE_ONE_LINER }], error: null }),
  })
  const res = await lookupEmailSignature(d, { name: 'x', sender_email: 'A@B.com' })
  assertEquals(res.body, { result: 'no_signature', sender_email: 'a@b.com' })
  assertEquals(d.extracts.length, 0)
})

Deno.test('the signature schema covers exactly the fields verifyDetails knows', () => {
  const props = ((SIGNATURE_OUTPUT_FORMAT.schema as Record<string, unknown>).properties as Record<string, { properties: Record<string, unknown> }>).details.properties
  assertEquals(Object.keys(props).sort(), ['address', 'city', 'company', 'email', 'mobile_phone', 'phone', 'state', 'title', 'zip'])
})

// ---------------------------------------------------------------------------
// The email field comes from the From address (2026-10-22 bug: it was blank
// whenever the signature had no address, because verifyDetails() only sees the
// stripped body and the From header isn't in it)
// ---------------------------------------------------------------------------
/** Real shape (redacted): a signature with a name, title, firm and phones — no address. */
const SIGNATURE_WITHOUT_EMAIL = [
  'Sounds good, I will send the LOI over this afternoon.',
  '',
  'Thanks,',
  'Paul Rutledge',
  'Vice President | Retail',
  'Certified Commercial Realty',
  'O: 770-555-0110',
  'M: 404-555-0187',
  '',
  'On Mon, Oct 19, 2026 at 11:02\u202fAM Mike Minihan <mike@oculusrep.com> wrote:',
  '> Paul, can you send the LOI?',
  '> M: 404-326-4010',
].join('\r\n')

Deno.test('signature with no email: the From address fills the email field', async () => {
  const d = deps(
    {
      intel_email_lookup_allowed: () => ({ data: true, error: null }),
      intel_mailbox_emails_from: () => ({
        data: [{ id: 'e1', received_at: '2026-10-19T16:00:00Z', sender_email: 'Paul.Rutledge@CertifiedCRE.com', sender_name: 'Paul Rutledge', subject: 'Re: LOI', body_text: SIGNATURE_WITHOUT_EMAIL }],
        error: null,
      }),
      intel_internal_contact_points: () => ({ data: OURS, error: null }),
    },
    // What the model returns: it copies the header address too; verifyDetails drops that one.
    { email: 'paul.rutledge@certifiedcre.com', title: 'Vice President | Retail', company: 'Certified Commercial Realty', phone: '770-555-0110', mobile_phone: '404-555-0187' },
  )
  const res = await lookupEmailSignature(d, { name: 'Paul Rutledge', sender_email: 'paul.rutledge@certifiedcre.com' })
  const body = res.body as { result: string; details: Record<string, string>; signature_email?: string }
  assertEquals(body.result, 'found')
  assertEquals(body.details, {
    email: 'paul.rutledge@certifiedcre.com',
    title: 'Vice President | Retail',
    company: 'Certified Commercial Realty',
    phone: '770-555-0110',
    mobile_phone: '404-555-0187',
  })
  assertEquals(body.signature_email, undefined)
  // And the quoted thread still can't leak Mike's mobile into it.
  assert(!Object.values(body.details).some((v) => v.replace(/\D/g, '') === '4043264010'))
})

Deno.test('signature lists a different address: From stays in the field, the other is reported', () => {
  const r = emailFromSender({ email: 'paul@personal-example.com', phone: '770-555-0110' }, 'Paul.Rutledge@certifiedcre.com', OURS)
  assertEquals(r.details, { email: 'paul.rutledge@certifiedcre.com', phone: '770-555-0110' })
  assertEquals(r.signature_email, 'paul@personal-example.com')
})

Deno.test('same address in signature and From: no note', () => {
  const r = emailFromSender({ email: 'paul.rutledge@certifiedcre.com' }, 'paul.rutledge@certifiedcre.com', OURS)
  assertEquals(r, { details: { email: 'paul.rutledge@certifiedcre.com' } })
})

Deno.test('mailing-service From (real Constant Contact shape) is never the email; the signature\'s address is', () => {
  const relay = 'paul.rutledge-certifiedcre.com@shared1.ccsend.com'
  assertEquals(emailFromSender({ email: 'paul.rutledge@certifiedcre.com' }, relay, OURS), {
    details: { email: 'paul.rutledge@certifiedcre.com' },
    relay_from: relay,
  })
  assertEquals(emailFromSender({ phone: '770-555-0110' }, relay, OURS), { details: { phone: '770-555-0110' }, relay_from: relay })
})

Deno.test('an @oculusrep.com From is never prefilled, however it arrives', () => {
  assertEquals(emailFromSender({}, 'Someone@OculusRep.com', OURS), { details: {} })
  assertEquals(emailFromSender({ email: 'asantos@oculusrep.com' }, 'paul@certifiedcre.com', OURS), {
    details: { email: 'paul@certifiedcre.com' },
  })
})

Deno.test('bulk-sender detection: relays, marketing subdomains, no-replies — not ordinary people', () => {
  for (const a of [
    'paul.rutledge-certifiedcre.com@shared1.ccsend.com', 'x@naicolumbia.ccsend.com', 'news@10333139.mailchimpapp.com',
    'leasing@email.riverwoodproperties.com', 'alerts@campaigns.crexi.com', 'x@mail.salesforce.com', 'x@10998460.brevosend.com',
    'noreply@placer.ai', 'notifications@example.com', 'no-reply+abc@example.com',
  ]) assert(isBulkSender(a), a)
  for (const a of ['paul.rutledge@certifiedcre.com', 'jdoe@gmail.com', 'walt@dellwoodretail.com', 'emma@example.com', 'info@smallfirm.com']) {
    assert(!isBulkSender(a), a)
  }
})
