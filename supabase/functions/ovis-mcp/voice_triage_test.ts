/**
 * Tests for the voice-triage tools. One or more per tool, driven through a fake
 * TriageStore and a fake invoke(), so the whole surface is covered with no
 * network, no Gmail and no model spend.
 *
 * Run: deno test --node-modules-dir=none supabase/functions/ovis-mcp/
 * (--node-modules-dir=none matters in this repo: `auto` replaces node_modules
 * with a Deno symlink farm and breaks the frontend typecheck.)
 */
import { assert, assertEquals, assertRejects, assertStringIncludes, assertThrows } from 'https://deno.land/std@0.208.0/assert/mod.ts';
import {
  actionFor, buildDealPatch, cancelWatch, composeNote, contactMissingFields, createContact,
  createWatch, daysSince, findDeal, firstReplyAfter, getTriageList, isSingleAddress, listWatches,
  logDealNote, rankTriage, resolveScope, runTriage, ToolFailure, triageAction, triageRunStatus,
  updateDeal, VOICE_TOOL_IMPLS, VOICE_TOOLS, withoutStaleAge,
  type AuditEntry, type CommitmentRow, type Ctx, type ThreadMail, type TriageStore,
} from './voice_triage.ts';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

const CONN = 'conn-mike';
const OTHER_CONN = 'conn-someone-else';
const USER = 'user-mike';
const OWNER = 'mike@oculusrep.com';
const NOW = new Date('2026-10-30T20:00:00Z'); // 4pm ET

const mail = (thread: string, iso: string, from: string, subject = 'Re: site plan'): ThreadMail => ({
  id: `mail-${thread}-${iso}`, thread_id: thread, received_at: iso,
  subject, sender_email: from, sender_name: from.split('@')[0],
});

const commitment = (over: Partial<CommitmentRow> & { id: string }): CommitmentRow => ({
  ball: 'me', status: 'open', what: 'Send the LDP site plan', speakable_reason: 'you said you would, 11 days ago',
  gmail_thread_id: `t-${over.id}`, conversation_thread_ids: null,
  counterparty_name: 'Cody Rogers', counterparty_email: 'cody@emc-eng.com',
  deal_id: null, deal: null, promised_date: null, skip_count: 0, sync_state: 'synced', sync_error: null,
  ...over,
});

interface FakeOpts {
  commitments?: CommitmentRow[];
  mails?: ThreadMail[];
  unknown?: string[];
  deals?: any[];
  deal?: Record<string, unknown> | null;
  stage?: { id: string; label: string } | null;
  watches?: any[];
  run?: Record<string, unknown> | null;
  insertContactFails?: string;
  attachFails?: string;
}

function fakeStore(o: FakeOpts = {}) {
  const audits: AuditEntry[] = [];
  const writes: Array<[string, unknown]> = [];
  const watches: any[] = [...(o.watches ?? [])];
  const store: TriageStore = {
    userIdForAuthId: (a) => Promise.resolve(a === 'auth-mike' ? USER : null),
    connectionForUser: (u) => Promise.resolve(u === USER ? { id: CONN, google_email: OWNER, user_id: USER, user_name: 'Mike Minihan' } : null),
    connectionForEmail: (e) => Promise.resolve(e.toLowerCase() === OWNER ? { id: CONN, google_email: OWNER, user_id: USER, user_name: 'Mike Minihan' } : null),
    openCommitments: (cid) => Promise.resolve(cid === CONN ? (o.commitments ?? []) : []),
    commitmentById: (id) => {
      const row = (o.commitments ?? []).find((r) => r.id === id);
      if (!row) return Promise.resolve(null);
      return Promise.resolve({ ...row, gmail_connection_id: id.startsWith('other') ? OTHER_CONN : CONN });
    },
    newestMailByThread: (tids) => {
      const m = new Map<string, ThreadMail>();
      for (const x of (o.mails ?? [])) {
        if (!tids.includes(x.thread_id)) continue;
        const cur = m.get(x.thread_id);
        if (!cur || x.received_at > cur.received_at) m.set(x.thread_id, x);
      }
      return Promise.resolve(m);
    },
    unknownCounterparties: (es) => Promise.resolve((o.unknown ?? []).filter((u) => es.map((e) => e.toLowerCase()).includes(u.toLowerCase()))),
    searchDeals: () => Promise.resolve(o.deals ?? []),
    dealById: () => Promise.resolve(o.deal ?? null),
    stageByName: () => Promise.resolve(o.stage ?? null),
    updateDeal: (id, patch) => { writes.push(['updateDeal', { id, patch }]); return Promise.resolve({ ...(o.deal ?? {}), ...patch }); },
    insertContact: (f) => {
      writes.push(['insertContact', f]);
      if (o.insertContactFails) return Promise.reject(new Error(o.insertContactFails));
      return Promise.resolve({ id: 'contact-1', ...f });
    },
    attachDealContact: (d, c) => {
      writes.push(['attachDealContact', { d, c }]);
      return o.attachFails ? Promise.reject(new Error(o.attachFails)) : Promise.resolve();
    },
    insertNote: (n, d) => { writes.push(['insertNote', { n, d }]); return Promise.resolve({ id: 'note-1' }); },
    createWatch: (row) => {
      const w = { id: 'watch-1', status: 'active', fired_at: null, fired_sender: null, fired_subject: null, created_at: NOW.toISOString(), ...row };
      watches.push(w); writes.push(['createWatch', row]);
      return Promise.resolve(w as any);
    },
    watchesForUser: (_u, statuses) => Promise.resolve(watches.filter((w) => statuses.includes(w.status))),
    watchById: (id) => Promise.resolve(watches.find((w) => w.id === id) ?? null),
    markWatchFired: (id, m) => { writes.push(['markWatchFired', { id, mail: m.id }]); const w = watches.find((x) => x.id === id); if (w) w.status = 'fired'; return Promise.resolve(); },
    cancelWatch: (id) => { writes.push(['cancelWatch', id]); const w = watches.find((x) => x.id === id); if (w) w.status = 'cancelled'; return Promise.resolve(); },
    mailAfter: (tids, after) => Promise.resolve((o.mails ?? []).filter((m) => tids.includes(m.thread_id) && m.received_at > after)),
    extractionRun: () => Promise.resolve(o.run ?? null),
    audit: (e) => { audits.push(e); return Promise.resolve(); },
  };
  return { store, audits, writes, watches };
}

function ctxFor(
  store: TriageStore,
  invoked: Array<[string, any, any]>,
  reply: (fn: string, body: any) => { status: number; body: any },
  caller: 'user' | 'static' = 'user',
): Ctx {
  return {
    store,
    invoke: (fn, body, opts) => { invoked.push([fn, body, opts]); return Promise.resolve(reply(fn, body)); },
    scope: {
      caller, authUserId: caller === 'user' ? 'auth-mike' : null, userId: USER,
      connectionId: CONN, ownerEmail: OWNER, ownerName: 'Mike Minihan',
      bearer: caller === 'user' ? 'user-jwt' : null,
    },
    now: () => NOW,
  };
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

Deno.test('every advertised tool has an implementation, and vice versa', () => {
  const advertised = VOICE_TOOLS.map((t) => t.name).sort();
  const implemented = Object.keys(VOICE_TOOL_IMPLS).sort();
  assertEquals(advertised, implemented);
});

Deno.test('every tool description says what it is for, in sentences', () => {
  for (const t of VOICE_TOOLS) {
    assert(t.description.length > 100, `${t.name} needs a real description`);
    assertEquals(t.inputSchema.type, 'object');
  }
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

Deno.test('daysSince counts Eastern calendar days, not 24-hour blocks', () => {
  // 11:30pm ET yesterday to 4pm ET today is one calendar day, not zero.
  assertEquals(daysSince('2026-10-30T03:30:00Z', NOW), 1);
  assertEquals(daysSince('2026-10-30T18:00:00Z', NOW), 0);
  assertEquals(daysSince(null, NOW), null);
});

Deno.test('isSingleAddress rejects the comma-joined pairs in the data', () => {
  assert(isSingleAddress('cody@emc-eng.com'));
  assert(!isSingleAddress('cadams@olearypartners.net, koleary@olearypartners.net'));
  assert(!isSingleAddress(null));
});

Deno.test('actionFor maps the spoken verbs, and nothing else', () => {
  assertEquals(actionFor('not_commitment'), 'reject');
  assertEquals(actionFor('done'), 'handled');
  assertEquals(actionFor('FLAG'), 'flag');
  assertEquals(actionFor('later'), 'skip');
  assertEquals(actionFor('delete'), null);
  assertEquals(actionFor(undefined), null);
});

Deno.test('rankTriage: owed rows oldest first; waiting rows only once quiet', () => {
  const rows = [
    commitment({ id: 'a', ball: 'me' }),                 // last mail 20 days ago
    commitment({ id: 'b', ball: 'me' }),                 // last mail 2 days ago
    commitment({ id: 'c', ball: 'them' }),               // quiet 9 days
    commitment({ id: 'd', ball: 'them' }),               // moved yesterday
    commitment({ id: 'e', ball: 'them', gmail_thread_id: 't-e' }), // no mail on file
  ];
  const mails = [
    mail('t-a', '2026-10-10T12:00:00Z', 'x@y.com'),
    mail('t-b', '2026-10-28T12:00:00Z', 'x@y.com'),
    mail('t-c', '2026-10-21T12:00:00Z', 'x@y.com'),
    mail('t-d', '2026-10-29T12:00:00Z', 'x@y.com'),
  ];
  const newest = new Map(mails.map((m) => [m.thread_id, m]));
  const { owe, waiting, waitingTracked } = rankTriage(rows, newest, NOW);
  assertEquals(owe.map((x) => x.row.id), ['a', 'b']);
  assertEquals(waiting.map((x) => x.row.id), ['c']);
  assertEquals(waitingTracked, 3);
});

Deno.test('rankTriage follows the whole conversation, not one thread_id', () => {
  const row = commitment({ id: 'a', gmail_thread_id: 't-1', conversation_thread_ids: ['t-2'] });
  const newest = new Map([
    ['t-1', mail('t-1', '2026-10-01T12:00:00Z', 'x@y.com')],
    ['t-2', mail('t-2', '2026-10-29T12:00:00Z', 'x@y.com', 'the real latest')],
  ]);
  const { owe } = rankTriage([row], newest, NOW);
  assertEquals(owe[0].mail?.subject, 'the real latest');
});

Deno.test('firstReplyAfter ignores the owner\'s own follow-ups', () => {
  const mails = [
    mail('t', '2026-10-28T12:00:00Z', OWNER, 'my chase'),
    mail('t', '2026-10-29T12:00:00Z', 'cody@emc-eng.com', 'their answer'),
  ];
  const r = firstReplyAfter(mails, '2026-10-27T00:00:00Z', OWNER);
  assertEquals(r?.subject, 'their answer');
  assertEquals(firstReplyAfter([mails[0]], '2026-10-27T00:00:00Z', OWNER), null);
});

Deno.test('buildDealPatch refuses money and malformed dates, keeps the rest', () => {
  const ok = buildDealPatch({ target_close_date: '2026-12-15', probability: 60, stage: 'At Lease/PSA' });
  assertEquals(ok.patch, { target_close_date: '2026-12-15', probability: 60 });
  assertEquals(ok.stageName, 'At Lease/PSA');

  const mixed = buildDealPatch({ fee: 60000, probability: 'ninety', target_close_date: 'December', size_sqft: '2,400' });
  assertEquals(mixed.patch, { size_sqft: 2400 });
  assertEquals(mixed.rejected.length, 3);
  assertStringIncludes(mixed.rejected.join(' '), 'fee (not writable');

  assertEquals(buildDealPatch({ loss_reason: null }).patch, { loss_reason: null });
  // Nothing writable at all is a question for the caller, not a silent no-op.
  assertThrows(() => buildDealPatch({ fee: 1 }), ToolFailure);
  assertThrows(() => buildDealPatch('stage: lease' as unknown), ToolFailure);
});

Deno.test('composeNote escapes HTML and keeps paragraphs', () => {
  const n = composeNote('Call with <Rob> & Sue\n\nSecond point', NOW);
  assertEquals(n.body, '<p>Call with &lt;Rob&gt; &amp; Sue</p><p>Second point</p>');
  assertStringIncludes(n.title, 'Voice note — Oct 30, 2026');
  assertStringIncludes(n.title, 'ET');
  assertEquals(n.plainLength, 'Call with <Rob> & Sue\n\nSecond point'.length);
});

Deno.test('withoutStaleAge drops the age the extractor baked in, keeps the promise', () => {
  assertEquals(
    withoutStaleAge('Brad asked you to reply directly, 11 days ago.'),
    'Brad asked you to reply directly.',
  );
  assertEquals(
    withoutStaleAge('You said you would send the plan, today. You promised it by Friday.'),
    'You said you would send the plan. You promised it by Friday.',
  );
  assertEquals(withoutStaleAge('No age clause here.'), 'No age clause here.');
  // 600-char slice: the clause can end the row with no period after it.
  assertEquals(withoutStaleAge('Truncated reason, 9 days ago'), 'Truncated reason');
  assertEquals(withoutStaleAge(null), null);
});

Deno.test('contactMissingFields names the gaps a voice agent should ask about', () => {
  assertEquals(contactMissingFields({ email: 'a@b.com', phone: '', company: null, title: 'VP', mobile_phone: '  ' }),
    ['phone', 'mobile', 'company']);
});

// ---------------------------------------------------------------------------
// Scope
// ---------------------------------------------------------------------------

Deno.test('resolveScope maps a login through user.auth_user_id', async () => {
  const { store } = fakeStore();
  const s = await resolveScope(store, { kind: 'user', authUserId: 'auth-mike' }, 'jwt');
  assertEquals(s.connectionId, CONN);
  assertEquals(s.userId, USER);
  assertEquals(s.bearer, 'jwt');
});

Deno.test('resolveScope refuses a login with no OVIS user or no mailbox', async () => {
  const { store } = fakeStore();
  await assertRejects(() => resolveScope(store, { kind: 'user', authUserId: 'auth-stranger' }, 'jwt'), ToolFailure);
});

Deno.test('the static token acts for the owner mailbox and carries no bearer', async () => {
  const { store } = fakeStore();
  const s = await resolveScope(store, { kind: 'static' }, null);
  assertEquals(s.caller, 'static');
  assertEquals(s.ownerEmail, OWNER);
  assertEquals(s.bearer, null);
  await assertRejects(() => resolveScope(store, { kind: 'static' }, null, 'nobody@example.com'), ToolFailure);
});

// ---------------------------------------------------------------------------
// run_triage / triage_run_status
// ---------------------------------------------------------------------------

Deno.test('run_triage: a finished incremental pass reports what it read, and is audited', async () => {
  const { store, audits } = fakeStore();
  const invoked: Array<[string, any, any]> = [];
  const ctx = ctxFor(store, invoked, () => ({
    status: 200,
    body: { success: true, done: true, run_id: 'run-1', attempted: 3, inserted: 1, updated_by_existing_id: 2, usd_this_batch: 0.004, spent_today_usd: 0.1, daily_cap_usd: 5 },
  }));
  const r: any = await runTriage({ mode: 'incremental' }, ctx);
  assertEquals(invoked[0][0], 'extract-commitments');
  // One mailbox per invocation: the caller's, never from the arguments.
  assertEquals(invoked[0][1].connection_id, CONN);
  assertEquals(invoked[0][1].drain, true);
  assertEquals(r.done, true);
  assertEquals(r.new_commitments, 1);
  assertStringIncludes(r.say, 'Read 3 conversations');
  assertEquals(audits.length, 1);
  assertEquals([audits[0].tool, audits[0].ok], ['run_triage', true]);
});

Deno.test('run_triage: an unfinished pass hands back the run_id to continue with', async () => {
  const { store } = fakeStore();
  const invoked: Array<[string, any, any]> = [];
  const ctx = ctxFor(store, invoked, () => ({
    status: 200,
    body: { success: true, done: false, next_offset: 200, run_id: 'run-7', attempted: 200, spent_today_usd: 0.5, daily_cap_usd: 5 },
  }));
  const r: any = await runTriage({ mode: 'full' }, ctx);
  assertEquals(r.done, false);
  assertEquals(r.next_offset, 200);
  assertStringIncludes(r.say, 'run-7');
  assertStringIncludes(r.say, '200');
});

Deno.test('run_triage: an offset that does not advance ends the pass instead of asking again', async () => {
  const { store } = fakeStore();
  const invoked: Array<[string, any, any]> = [];
  const ctx = ctxFor(store, invoked, () => ({
    status: 200, body: { success: true, done: false, next_offset: 40, run_id: 'run-9', attempted: 0 },
  }));
  const r: any = await runTriage({ offset: 40 }, ctx);
  assertEquals(invoked.length, 1);
  assertEquals(r.next_offset, null);
  assertEquals(r.done, true);
});

Deno.test('run_triage: the daily cap is reported, not retried', async () => {
  const { store } = fakeStore();
  const invoked: Array<[string, any, any]> = [];
  const ctx = ctxFor(store, invoked, () => ({
    status: 200, body: { success: true, done: false, stopped_on_daily_cap: true, spent_today_usd: 5, daily_cap_usd: 5 },
  }));
  const r: any = await runTriage({}, ctx);
  assertEquals(invoked.length, 1);
  assertStringIncludes(r.say, 'daily model budget is used up');
});

Deno.test('run_triage: a failure from the extractor is a failure here, and is audited', async () => {
  const { store, audits } = fakeStore();
  const ctx = ctxFor(store, [], () => ({ status: 500, body: { success: false, error: 'ANTHROPIC_API_KEY_TRIAGE is not set' } }));
  await assertRejects(() => runTriage({}, ctx), ToolFailure, 'ANTHROPIC_API_KEY_TRIAGE');
  assertEquals(audits[0].ok, false);
});

Deno.test('triage_run_status refuses a run from another mailbox', async () => {
  const { store } = fakeStore({ run: { id: 'run-1', gmail_connection_id: OTHER_CONN, mode: 'full', started_at: NOW.toISOString() } });
  await assertRejects(() => triageRunStatus({ run_id: 'run-1' }, ctxFor(store, [], () => ({ status: 200, body: {} }))), ToolFailure, 'different mailbox');
});

Deno.test('triage_run_status reports progress in Eastern time', async () => {
  const { store } = fakeStore({ run: {
    id: 'run-1', gmail_connection_id: CONN, mode: 'full', started_at: '2026-10-30T19:00:00Z',
    completed_at: null, attempted: 120, conversations_in_scope: 300, inserted: 4, updated: 9, usd: 0.42,
  } });
  const r: any = await triageRunStatus({ run_id: 'run-1' }, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertEquals(r.done, false);
  assertStringIncludes(r.started_at, 'ET');
  assertStringIncludes(r.say, '120 of 300');
});

// ---------------------------------------------------------------------------
// get_triage_list
// ---------------------------------------------------------------------------

Deno.test('get_triage_list speaks both lists, with the contact question answered', async () => {
  const rows = [
    commitment({ id: 'a', ball: 'me', deal_id: 'deal-1', deal: { deal_name: 'SBUX - Hoschton' } }),
    commitment({ id: 'b', ball: 'them', counterparty_email: 'laura@levycpafirm.com' }),
    commitment({ id: 'c', ball: 'me', counterparty_email: 'cadams@olearypartners.net, koleary@olearypartners.net' }),
  ];
  const { store } = fakeStore({
    commitments: rows,
    mails: [
      mail('t-a', '2026-10-19T12:00:00Z', 'cody@emc-eng.com', 'LDP plan'),
      mail('t-b', '2026-10-10T12:00:00Z', 'laura@levycpafirm.com', 'K-1s'),
      mail('t-c', '2026-10-20T12:00:00Z', 'cadams@olearypartners.net'),
    ],
    unknown: ['cody@emc-eng.com'],
  });
  const r: any = await getTriageList({}, ctxFor(store, [], () => ({ status: 200, body: {} })));

  assertEquals(r.you_owe.length, 2);
  assertEquals(r.waiting_on_others.length, 1);
  assertEquals(r.you_owe[0].commitment_id, 'a');
  assertEquals(r.you_owe[0].subject, 'LDP plan');
  assertEquals(r.you_owe[0].why, 'you said you would');   // the baked-in "11 days ago" is gone
  assertEquals(r.you_owe[0].age_days, 11);
  assertEquals(r.you_owe[0].age, '11 days ago');
  assertEquals(r.you_owe[0].deal.deal_name, 'SBUX - Hoschton');
  assertEquals(r.you_owe[0].is_known_contact, false);          // in `unknown`
  assertEquals(r.waiting_on_others[0].is_known_contact, true);  // not in `unknown`
  // A two-address row cannot be one contact: neither true nor false.
  const pair = r.you_owe.find((x: any) => x.commitment_id === 'c');
  assertEquals(pair.is_known_contact, null);
  assertStringIncludes(pair.contact_note, 'two addresses');
  assertStringIncludes(r.as_of, 'ET');
  assertEquals(r.prefill_included, false);
});

Deno.test('get_triage_list: prefill is off unless asked for, then capped at 5 lookups', async () => {
  const rows = Array.from({ length: 8 }, (_, i) => commitment({ id: `r${i}`, counterparty_email: `p${i}@out.com` }));
  const { store } = fakeStore({
    commitments: rows,
    mails: rows.map((r) => mail(r.gmail_thread_id, '2026-10-20T12:00:00Z', 'x@y.com')),
    unknown: rows.map((_, i) => `p${i}@out.com`),
  });
  const invoked: Array<[string, any, any]> = [];
  const reply = () => ({ status: 200, body: { result: 'found', details: { phone: '555' }, source: { subject: 's', received_at: NOW.toISOString() } } });

  const off: any = await getTriageList({}, ctxFor(store, invoked, reply));
  assertEquals(invoked.length, 0);
  assertEquals(off.you_owe[0].contact_prefill, undefined);

  const on: any = await getTriageList({ include_prefill: true }, ctxFor(store, invoked, reply));
  assertEquals(invoked.length, 5);
  assertEquals(invoked[0][0], 'ovis-knowledge-capture');
  assertEquals(invoked[0][2]?.bearer, 'user-jwt');   // AS the user; the lookup is gated on auth.uid()
  assertEquals(on.you_owe[0].contact_prefill.phone, '555');
});

Deno.test('get_triage_list: quiet_days retunes the waiting list, include_waiting drops it', async () => {
  const rows = [commitment({ id: 'b', ball: 'them' })];
  const { store } = fakeStore({ commitments: rows, mails: [mail('t-b', '2026-10-28T12:00:00Z', 'x@y.com')] });
  const base = ctxFor(store, [], () => ({ status: 200, body: {} }));
  assertEquals(((await getTriageList({}, base)) as any).waiting_on_others.length, 0);         // 2 days: still moving
  assertEquals(((await getTriageList({ quiet_days: 1 }, base)) as any).waiting_on_others.length, 1);
  assertEquals(((await getTriageList({ include_waiting: false, quiet_days: 1 }, base)) as any).waiting_on_others.length, 0);
});

Deno.test('get_triage_list surfaces a Gmail sync failure instead of hiding it', async () => {
  const { store } = fakeStore({
    commitments: [commitment({ id: 'a', sync_state: 'failed', sync_error: 'token refresh: invalid_grant' })],
    mails: [mail('t-a', '2026-10-20T12:00:00Z', 'x@y.com')],
  });
  const r: any = await getTriageList({}, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertStringIncludes(r.you_owe[0].sync_problem, 'invalid_grant');
});

// ---------------------------------------------------------------------------
// triage_action
// ---------------------------------------------------------------------------

Deno.test('triage_action passes the verdict to commitment-action and says what Gmail did', async () => {
  const { store, audits } = fakeStore({ commitments: [commitment({ id: 'a' })] });
  const invoked: Array<[string, any, any]> = [];
  const ctx = ctxFor(store, invoked, () => ({ status: 200, body: { success: true, status: 'handled', sync_state: 'synced', archived_messages: 2 } }));
  const r: any = await triageAction({ commitment_id: 'a', action: 'handled' }, ctx);
  assertEquals(invoked[0][0], 'commitment-action');
  assertEquals(invoked[0][1], { commitment_id: 'a', action: 'handled' });
  assertStringIncludes(r.say, 'archived in Gmail');
  assertStringIncludes(r.say, '2 messages');
  assertEquals(audits[0].tool, 'triage_action');
});

Deno.test('triage_action translates not_commitment into the desk\'s reject', async () => {
  const { store } = fakeStore({ commitments: [commitment({ id: 'a' })] });
  const invoked: Array<[string, any, any]> = [];
  await triageAction({ commitment_id: 'a', action: 'not_commitment' }, ctxFor(store, invoked, () => ({ status: 200, body: { success: true, status: 'rejected' } })));
  assertEquals(invoked[0][1].action, 'reject');
});

Deno.test('triage_action never touches another mailbox\'s commitment', async () => {
  const { store } = fakeStore({ commitments: [commitment({ id: 'other-1' })] });
  const invoked: Array<[string, any, any]> = [];
  await assertRejects(
    () => triageAction({ commitment_id: 'other-1', action: 'handled' }, ctxFor(store, invoked, () => ({ status: 200, body: { success: true } }))),
    ToolFailure, 'different mailbox',
  );
  assertEquals(invoked.length, 0);  // refused before the write
});

Deno.test('triage_action reports a Gmail failure as a failure', async () => {
  const { store, audits } = fakeStore({ commitments: [commitment({ id: 'a' })] });
  const ctx = ctxFor(store, [], () => ({ status: 502, body: { success: false, error: 'thread 19a: HTTP 403', sync_state: 'failed' } }));
  await assertRejects(() => triageAction({ commitment_id: 'a', action: 'flag' }, ctx), ToolFailure, 'HTTP 403');
  assertEquals(audits[0].ok, false);
});

Deno.test('triage_action rejects a verb it does not have', async () => {
  const { store } = fakeStore({ commitments: [commitment({ id: 'a' })] });
  await assertRejects(() => triageAction({ commitment_id: 'a', action: 'delete' }, ctxFor(store, [], () => ({ status: 200, body: {} }))), ToolFailure);
});

// ---------------------------------------------------------------------------
// find_deal
// ---------------------------------------------------------------------------

Deno.test('find_deal returns every match and names them for speech', async () => {
  const deals = [
    { deal_id: 'd1', deal_name: 'SBUX - Hoschton', stage: 'At Lease/PSA', client: 'Starbucks', address: '1 Main', city: 'Hoschton', state: 'GA', matched_on: ['deal name'] },
    { deal_id: 'd2', deal_name: 'SBUX - Dallas', stage: 'Booked', client: 'Starbucks', address: null, city: 'Dallas', state: 'GA', matched_on: ['client'] },
  ];
  const { store } = fakeStore({ deals });
  const r: any = await findDeal({ query: 'sbux' }, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertEquals(r.count, 2);
  assertStringIncludes(r.say, 'SBUX - Hoschton; SBUX - Dallas');
  await assertRejects(() => findDeal({ query: 'a' }, ctxFor(store, [], () => ({ status: 200, body: {} }))), ToolFailure);
});

// ---------------------------------------------------------------------------
// create_contact
// ---------------------------------------------------------------------------

Deno.test('create_contact: spoken values beat the signature, and gaps are reported', async () => {
  const { store, writes, audits } = fakeStore({ deal: { id: 'deal-1', deal_name: 'SBUX - Hoschton' } });
  const invoked: Array<[string, any, any]> = [];
  const ctx = ctxFor(store, invoked, () => ({
    status: 200,
    body: { result: 'found', details: { phone: '770-111-2222', company: 'EMC Engineering', title: 'Principal' }, source: { subject: 'LDP', received_at: NOW.toISOString() } },
  }));
  const r: any = await createContact({ first_name: 'Cody', last_name: 'Rogers', email: 'cody@emc-eng.com', title: 'Project Manager', deal_id: 'deal-1' }, ctx);

  const inserted = writes.find(([k]) => k === 'insertContact')![1] as any;
  assertEquals(inserted.title, 'Project Manager');       // he said it
  assertEquals(inserted.company, 'EMC Engineering');     // the signature filled it
  assertEquals(inserted.phone, '770-111-2222');
  assertEquals(inserted.email, 'cody@emc-eng.com');
  assertEquals(inserted.source_type, 'Contact');
  assertEquals(r.attached_to_deal, 'deal-1');
  assertEquals(r.missing_fields, ['mobile']);
  assertEquals(r.prefilled_from_email, true);
  assertEquals(audits[0].tool, 'create_contact');
});

Deno.test('create_contact does not take a mailing service\'s address from the lookup', async () => {
  const { store, writes } = fakeStore();
  const ctx = ctxFor(store, [], () => ({
    status: 200, body: { result: 'found', details: { company: 'Certified CRE' }, relay_from: 'x@shared1.ccsend.com', source: {} },
  }));
  await createContact({ first_name: 'Paul', last_name: 'Rutledge', email: 'paul@certifiedcre.com' }, ctx);
  const inserted = writes.find(([k]) => k === 'insertContact')![1] as any;
  // The address he gave stands; the relay address never reaches the record.
  assertEquals(inserted.email, 'paul@certifiedcre.com');
});

Deno.test('create_contact: the static token cannot run the lookup, and says so', async () => {
  const { store } = fakeStore();
  const invoked: Array<[string, any, any]> = [];
  const r: any = await createContact(
    { first_name: 'Ann', last_name: 'Lee', email: 'ann@x.com' },
    ctxFor(store, invoked, () => ({ status: 200, body: {} }), 'static'),
  );
  assertEquals(invoked.length, 0);
  assertStringIncludes(r.prefill_note, 'signed-in user');
});

Deno.test('create_contact reports a failed deal attach without losing the contact', async () => {
  const { store } = fakeStore({ attachFails: 'duplicate key value violates unique constraint' });
  const r: any = await createContact(
    { first_name: 'Ann', last_name: 'Lee', deal_id: 'deal-1', use_email_lookup: false },
    ctxFor(store, [], () => ({ status: 200, body: {} })),
  );
  assertEquals(r.contact_id, 'contact-1');
  assertEquals(r.attached_to_deal, null);
  assertStringIncludes(r.say, 'Attaching to the deal failed');
});

Deno.test('create_contact needs a name, and refuses an address list', async () => {
  const { store } = fakeStore();
  const ctx = ctxFor(store, [], () => ({ status: 200, body: {} }));
  await assertRejects(() => createContact({ email: 'a@b.com' }, ctx), ToolFailure, 'name is required');
  await assertRejects(() => createContact({ first_name: 'A', email: 'a@b.com, c@d.com' }, ctx), ToolFailure, 'single email');
});

// ---------------------------------------------------------------------------
// log_deal_note
// ---------------------------------------------------------------------------

Deno.test('log_deal_note writes one note linked to the deal, timestamped', async () => {
  const { store, writes, audits } = fakeStore({ deal: { id: 'deal-1', deal_name: 'SBUX - Hoschton' } });
  const r: any = await logDealNote({ deal_id: 'deal-1', note: 'Rob wants the LDP by Friday' }, ctxFor(store, [], () => ({ status: 200, body: {} })));
  const w = writes.find(([k]) => k === 'insertNote')![1] as any;
  assertEquals(w.d, 'deal-1');
  assertStringIncludes(w.n.body, 'Rob wants the LDP by Friday');
  assertStringIncludes(r.logged_at, 'ET');
  assertEquals(r.deal_name, 'SBUX - Hoschton');
  assertEquals(audits[0].tool, 'log_deal_note');
});

Deno.test('log_deal_note refuses a deal that does not exist, and an empty note', async () => {
  const gone = fakeStore({ deal: null });
  await assertRejects(() => logDealNote({ deal_id: 'nope', note: 'x' }, ctxFor(gone.store, [], () => ({ status: 200, body: {} }))), ToolFailure, 'no deal');
  const ok = fakeStore({ deal: { id: 'deal-1' } });
  await assertRejects(() => logDealNote({ deal_id: 'deal-1', note: '   ' }, ctxFor(ok.store, [], () => ({ status: 200, body: {} }))), ToolFailure);
});

// ---------------------------------------------------------------------------
// update_deal
// ---------------------------------------------------------------------------

Deno.test('update_deal reports before and after, and names the stage side effects', async () => {
  const { store, writes } = fakeStore({
    deal: { id: 'deal-1', deal_name: 'SBUX - Hoschton', stage_id: 'stage-old', target_close_date: '2026-11-01', probability: 40 },
    stage: { id: 'stage-new', label: 'At Lease/PSA' },
  });
  const r: any = await updateDeal(
    { deal_id: 'deal-1', fields: { stage: 'lease', target_close_date: '2026-12-15', probability: 40 } },
    ctxFor(store, [], () => ({ status: 200, body: {} })),
  );
  assertEquals(r.changed.target_close_date, { before: '2026-11-01', after: '2026-12-15' });
  assertEquals(r.changed.stage_id.after, 'stage-new');
  assertEquals(r.unchanged, ['probability']);            // 40 was already 40
  assertEquals(r.stage, 'At Lease/PSA');
  assert(r.side_effects.length === 2);
  assertEquals((writes.find(([k]) => k === 'updateDeal')![1] as any).patch.stage_id, 'stage-new');
});

Deno.test('update_deal refuses an unknown or ambiguous stage name', async () => {
  const { store } = fakeStore({ deal: { id: 'deal-1' }, stage: null });
  await assertRejects(
    () => updateDeal({ deal_id: 'deal-1', fields: { stage: 'closed' } }, ctxFor(store, [], () => ({ status: 200, body: {} }))),
    ToolFailure, 'no deal stage called',
  );
});

Deno.test('update_deal keeps money off the table, and the refusal is audited', async () => {
  const { store, audits, writes } = fakeStore({ deal: { id: 'deal-1' } });
  await assertRejects(
    () => updateDeal({ deal_id: 'deal-1', fields: { fee: 60000, commission_percent: 3 } }, ctxFor(store, [], () => ({ status: 200, body: {} }))),
    ToolFailure, 'nothing to update',
  );
  // Refused on its arguments, before the deal was even read — but still logged:
  // "it tried to set the fee and was told no" is what the log is for.
  assertEquals(writes.length, 0);
  assertEquals([audits[0].tool, audits[0].ok], ['update_deal', false]);
  assertStringIncludes(String(audits[0].error), 'not writable');
});

// ---------------------------------------------------------------------------
// watches
// ---------------------------------------------------------------------------

Deno.test('create_watch baselines on the newest message of the whole conversation', async () => {
  const row = commitment({ id: 'a', gmail_thread_id: 't-1', conversation_thread_ids: ['t-2'] });
  const { store, writes } = fakeStore({
    commitments: [row],
    mails: [mail('t-1', '2026-10-20T12:00:00Z', 'x@y.com'), mail('t-2', '2026-10-28T12:00:00Z', 'x@y.com')],
  });
  const r: any = await createWatch({ commitment_id: 'a' }, ctxFor(store, [], () => ({ status: 200, body: {} })));
  const w = writes.find(([k]) => k === 'createWatch')![1] as any;
  assertEquals(w.baseline_at, '2026-10-28T12:00:00Z');
  assertEquals(w.thread_ids.sort(), ['t-1', 't-2']);
  assertEquals(w.label, 'Send the LDP site plan');     // defaults to the commitment
  assertEquals(r.threads_watched, 2);
});

Deno.test('create_watch on a thread with no mail on file falls back to now', async () => {
  const { store, writes } = fakeStore();
  await createWatch({ gmail_thread_id: 't-new', label: 'the survey' }, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertEquals((writes.find(([k]) => k === 'createWatch')![1] as any).baseline_at, NOW.toISOString());
});

Deno.test('create_watch twice on one thread is a no-op', async () => {
  const { store, writes } = fakeStore({
    watches: [{ id: 'watch-9', thread_id: 't-a', thread_ids: ['t-a'], status: 'active', baseline_at: '2026-10-20T12:00:00Z', label: 'the plan', commitment_id: null, created_at: '2026-10-20T12:00:00Z' }],
  });
  const r: any = await createWatch({ gmail_thread_id: 't-a' }, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertEquals(r.already_watching, true);
  assertEquals(writes.filter(([k]) => k === 'createWatch').length, 0);
});

Deno.test('create_watch needs something to watch, and not another mailbox', async () => {
  const { store } = fakeStore({ commitments: [commitment({ id: 'other-2' })] });
  const ctx = ctxFor(store, [], () => ({ status: 200, body: {} }));
  await assertRejects(() => createWatch({}, ctx), ToolFailure, 'required');
  await assertRejects(() => createWatch({ commitment_id: 'other-2' }, ctx), ToolFailure, 'different mailbox');
});

Deno.test('list_watches fires on their reply, not his own, and records it once', async () => {
  const { store, writes } = fakeStore({
    watches: [
      { id: 'w1', thread_id: 't-1', thread_ids: ['t-1'], status: 'active', baseline_at: '2026-10-25T12:00:00Z', label: 'the LDP plan', commitment_id: 'a', created_at: '2026-10-25T12:00:00Z' },
      { id: 'w2', thread_id: 't-2', thread_ids: ['t-2'], status: 'active', baseline_at: '2026-10-25T12:00:00Z', label: 'the survey', commitment_id: null, created_at: '2026-10-25T12:00:00Z' },
    ],
    mails: [
      mail('t-1', '2026-10-29T12:00:00Z', 'cody@emc-eng.com', 'Here it is'),
      mail('t-2', '2026-10-28T12:00:00Z', OWNER, 'chasing again'),   // his own: not a reply
    ],
  });
  const r: any = await listWatches({}, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertEquals(r.replied.length, 1);
  assertEquals(r.replied[0].watching_for, 'the LDP plan');
  assertStringIncludes(r.replied[0].subject, 'Here it is');
  assertEquals(r.no_reply_yet.length, 1);
  assertEquals(r.no_reply_yet[0].waiting_days, 5);
  assertEquals(writes.filter(([k]) => k === 'markWatchFired').length, 1);

  // Second call: the firing was recorded, so it is reported from the row and not re-detected.
  const again: any = await listWatches({}, ctxFor(store, [], () => ({ status: 200, body: {} })));
  assertEquals(again.replied.length, 1);
  assertEquals(writes.filter(([k]) => k === 'markWatchFired').length, 1);
});

Deno.test('cancel_watch stops an active watch and is idempotent after that', async () => {
  const { store, audits } = fakeStore({
    watches: [{ id: 'w1', thread_id: 't-1', thread_ids: ['t-1'], status: 'active', baseline_at: NOW.toISOString(), label: 'the survey', commitment_id: null, created_at: NOW.toISOString() }],
  });
  const ctx = ctxFor(store, [], () => ({ status: 200, body: {} }));
  const first: any = await cancelWatch({ watch_id: 'w1' }, ctx);
  assertEquals(first.status, 'cancelled');
  const second: any = await cancelWatch({ watch_id: 'w1' }, ctx);
  assertStringIncludes(second.say, 'already cancelled');
  await assertRejects(() => cancelWatch({ watch_id: 'nope' }, ctx), ToolFailure);
  assertEquals(audits.filter((a) => a.tool === 'cancel_watch').length, 3);
});
