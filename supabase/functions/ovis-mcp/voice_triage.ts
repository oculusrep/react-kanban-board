/**
 * Voice-triage tools for the OVIS MCP server — the tools a spoken agent needs to
 * work Mike's commitment desk without a screen. See docs/VOICE_TRIAGE_MCP.md.
 *
 * NOTHING HERE DECIDES ANYTHING THE DESK ALREADY DECIDES. Extraction is
 * extract-commitments, the four verdicts are commitment-action, the contact
 * prefill is ovis-knowledge-capture's lookup_email_signature, and the ranking is
 * the panel's own rule (oldest last message first; a thing someone owes you is
 * not worth hearing about while the conversation is still moving). This module
 * calls those and shapes their answers for speech.
 *
 * SCOPED TO THE CALLER, ALWAYS. Every tool resolves one gmail_connection — the
 * OAuth caller's own — and every read and write is filtered by it. A second
 * internal user calling the same tool sees their own mailbox, never Mike's.
 * The static script token has no person behind it, so it falls back to
 * OVIS_MCP_OWNER_EMAIL (default mike@oculusrep.com), the same owner the panel
 * hardcodes, and says so in the audit log.
 *
 * WRITES ARE LOGGED BEFORE THEY ARE REPORTED. A voice agent acts with no screen
 * and no scrollback, so mcp_audit_log is the only record of what it did. Reads
 * are not logged; every write is, success or failure.
 *
 * TESTABILITY: every database access goes through TriageStore, and the model
 * call / function call go through InvokeFn. voice_triage_test.ts drives all of
 * it with fakes, so the tools are covered without a network or a bill.
 */

// ----------------------------------------------------------------------------
// Shapes
// ----------------------------------------------------------------------------

export interface Conn {
  id: string;
  google_email: string;
  user_id: string | null;
  user_name: string | null;
}

export interface Scope {
  /** 'user' = OAuth caller (a person). 'static' = the script token. */
  caller: 'user' | 'static';
  authUserId: string | null;
  userId: string;
  connectionId: string;
  ownerEmail: string;
  ownerName: string | null;
  /** The caller's own bearer, forwarded to tools that must run AS the user. */
  bearer: string | null;
}

export interface CommitmentRow {
  id: string;
  ball: string;
  status: string;
  what: string;
  speakable_reason: string | null;
  gmail_thread_id: string;
  conversation_thread_ids: string[] | null;
  counterparty_name: string | null;
  counterparty_email: string | null;
  deal_id: string | null;
  deal?: { deal_name: string | null } | null;
  promised_date: string | null;
  skip_count: number | null;
  sync_state: string | null;
  sync_error: string | null;
}

export interface ThreadMail {
  id: string;
  thread_id: string;
  received_at: string;
  subject: string | null;
  sender_email: string | null;
  sender_name: string | null;
}

export interface DealMatch {
  deal_id: string;
  deal_name: string | null;
  stage: string | null;
  client: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  matched_on: string[];
}

export interface WatchRow {
  id: string;
  thread_id: string;
  thread_ids: string[] | null;
  commitment_id: string | null;
  label: string | null;
  baseline_at: string;
  status: string;
  fired_at: string | null;
  fired_sender: string | null;
  fired_subject: string | null;
  created_at: string;
}

export interface AuditEntry {
  tool: string;
  caller: 'user' | 'static';
  auth_user_id: string | null;
  user_id: string | null;
  args: unknown;
  ok: boolean;
  result?: unknown;
  error?: string | null;
}

/** Every database access the tools make. One implementation; one fake in tests. */
export interface TriageStore {
  connectionForUser(userId: string): Promise<Conn | null>;
  connectionForEmail(email: string): Promise<Conn | null>;
  userIdForAuthId(authUserId: string): Promise<string | null>;

  openCommitments(connectionId: string): Promise<CommitmentRow[]>;
  commitmentById(id: string): Promise<(CommitmentRow & { gmail_connection_id: string }) | null>;
  /** Newest message per thread_id, for age / subject / sender. */
  newestMailByThread(threadIds: string[]): Promise<Map<string, ThreadMail>>;
  /** Addresses that are NOT an OVIS contact (and not internal, and not dismissed). */
  unknownCounterparties(emails: string[]): Promise<string[]>;

  searchDeals(query: string): Promise<DealMatch[]>;
  dealById(id: string): Promise<Record<string, unknown> | null>;
  stageByName(name: string): Promise<{ id: string; label: string } | null>;
  updateDeal(id: string, patch: Record<string, unknown>, userId: string): Promise<Record<string, unknown>>;

  insertContact(fields: Record<string, unknown>, userId: string): Promise<Record<string, unknown>>;
  attachDealContact(dealId: string, contactId: string, userId: string): Promise<void>;
  insertNote(note: { title: string; body: string; plainLength: number }, dealId: string, userId: string): Promise<{ id: string }>;

  createWatch(row: {
    user_id: string; gmail_connection_id: string; thread_id: string; thread_ids: string[];
    commitment_id: string | null; label: string | null; baseline_at: string;
  }): Promise<WatchRow>;
  watchesForUser(userId: string, statuses: string[]): Promise<WatchRow[]>;
  watchById(id: string, userId: string): Promise<WatchRow | null>;
  markWatchFired(id: string, mail: ThreadMail): Promise<void>;
  cancelWatch(id: string): Promise<void>;
  /** Mail in any of these threads strictly after an instant, oldest first. */
  mailAfter(threadIds: string[], afterIso: string): Promise<ThreadMail[]>;

  extractionRun(runId: string): Promise<Record<string, unknown> | null>;
  audit(entry: AuditEntry): Promise<void>;
}

/** POST to another OVIS edge function. `bearer` overrides the service key. */
export type InvokeFn = (
  fn: string,
  body: unknown,
  opts?: { bearer?: string },
) => Promise<{ status: number; body: any }>;

export interface Ctx {
  store: TriageStore;
  invoke: InvokeFn;
  scope: Scope;
  now: () => Date;
}

export class ToolFailure extends Error {}

// ----------------------------------------------------------------------------
// Pure helpers
// ----------------------------------------------------------------------------

export const ET = 'America/New_York';

/** CLAUDE.md: Eastern Time for every date operation, and label it. */
export const etDay = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ET, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

export function etStamp(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = new Intl.DateTimeFormat('en-US', {
    timeZone: ET, year: 'numeric', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(t));
  return `${s} ET`;
}

/** Whole days between two instants, counted in Eastern calendar days. */
export function daysSince(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const a = etDay(new Date(t));
  const b = etDay(now);
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/**
 * The age baked into speakable_reason is the age ON THE DAY THE ROW WAS
 * WRITTEN: extract-commitments composes "<reason>, 11 days ago." in code,
 * because the model cannot be trusted with time. Days later that clause is
 * simply false — a row saying "11 days ago" whose last message is 30 days old —
 * and a spoken agent would read it out as fact. The age here is recomputed from
 * the mail on every call, so the stale clause is removed and the one true
 * statement about time is the `age` field beside it. Any promise sentence that
 * follows it is kept: a promised date is a date, not an age.
 */
export function withoutStaleAge(reason: string | null | undefined): string | null {
  if (!reason) return reason ?? null;
  // The period is optional: speakable_reason is stored sliced to 600 chars, so
  // the clause can be the last thing on the row with nothing after it.
  return reason.replace(/,\s*(?:today|yesterday|\d+\s+days?\s+ago)(\.|$)/i, (_m, tail) => tail);
}

export function ageText(days: number | null): string {
  if (days === null) return 'no mail on file';
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

/** One address, not two. 3 of 158 rows hold a comma-joined pair (two people named
 * in one obligation), and an address pair is not something to look up or add. */
export function isSingleAddress(email: string | null | undefined): boolean {
  return !!email && /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/.test(email.trim());
}

export const PANEL_QUIET_DAYS = 5;

/**
 * The panel's own two lists. 'me' rows are all live and ranked oldest-first.
 * 'them' rows are all tracked but only spoken when the conversation has been
 * silent quietDays — counted from the last message of ANY kind, so their reply
 * resets the clock just as a chase does.
 */
export function rankTriage(
  rows: CommitmentRow[],
  newest: Map<string, ThreadMail>,
  now: Date,
  quietDays = PANEL_QUIET_DAYS,
): { owe: Array<{ row: CommitmentRow; mail: ThreadMail | null }>; waiting: Array<{ row: CommitmentRow; mail: ThreadMail | null }>; waitingTracked: number } {
  const withMail = rows.map((row) => {
    const keys = [row.gmail_thread_id, ...((row.conversation_thread_ids ?? []) as string[])].filter(Boolean);
    let mail: ThreadMail | null = null;
    for (const k of keys) {
      const m = newest.get(k);
      if (m && (!mail || m.received_at > mail.received_at)) mail = m;
    }
    return { row, mail };
  });
  const byAge = (a: { mail: ThreadMail | null }, b: { mail: ThreadMail | null }) =>
    String(a.mail?.received_at ?? '').localeCompare(String(b.mail?.received_at ?? ''));

  const owe = withMail.filter((x) => x.row.ball === 'me').sort(byAge);
  const them = withMail.filter((x) => x.row.ball === 'them').sort(byAge);
  const cutoff = now.getTime() - quietDays * 86_400_000;
  // No last message at all means nothing to measure silence from: treat it as
  // still moving rather than inventing a quiet period.
  const waiting = them.filter((x) => !!x.mail && Date.parse(x.mail.received_at) <= cutoff);
  return { owe, waiting, waitingTracked: them.length };
}

/** The spoken verb → the verdict commitment-action already implements. */
export function actionFor(action: unknown): 'handled' | 'flag' | 'skip' | 'reject' | null {
  const a = String(action ?? '').trim().toLowerCase();
  if (a === 'handled' || a === 'done') return 'handled';
  if (a === 'flag' || a === 'flagged') return 'flag';
  if (a === 'skip' || a === 'later') return 'skip';
  // The desk calls this 'reject' (the extractor was wrong); the tool name says
  // what it means out loud. Both write commitment_correction either way.
  if (a === 'not_commitment' || a === 'not_a_commitment' || a === 'reject') return 'reject';
  return null;
}

/**
 * Fields update_deal may write, and nothing else.
 *
 * Money is deliberately absent. fee, commission_percent, deal_value and the
 * rest feed commission math and payment recalculation triggers, and a spoken
 * "make it sixty thousand" has no place in that chain — those belong on the
 * commission tab where the result is visible before it is saved.
 */
export const DEAL_FIELDS: Record<string, 'date' | 'text' | 'int' | 'number' | 'stage'> = {
  stage: 'stage',
  deal_name: 'text',
  target_close_date: 'date',
  probability: 'int',
  loi_signed_date: 'date',
  loi_written_date: 'date',
  contract_signed_date: 'date',
  closed_date: 'date',
  loss_reason: 'text',
  size_sqft: 'number',
  size_acres: 'number',
  landlord_name: 'text',
};

export interface DealPatchResult {
  patch: Record<string, unknown>;
  stageName: string | null;
  rejected: string[];
}

/** Validate and coerce the spoken field list. Unknown or unwritable names come
 * back as `rejected` rather than being silently dropped. */
export function buildDealPatch(fields: unknown): DealPatchResult {
  const out: DealPatchResult = { patch: {}, stageName: null, rejected: [] };
  if (!fields || typeof fields !== 'object' || Array.isArray(fields)) {
    throw new ToolFailure('fields must be an object, e.g. {"target_close_date": "2026-12-15"}');
  }
  for (const [key, raw] of Object.entries(fields as Record<string, unknown>)) {
    const kind = DEAL_FIELDS[key];
    if (!kind) {
      out.rejected.push(`${key} (not writable from here: ${Object.keys(DEAL_FIELDS).join(', ')})`);
      continue;
    }
    if (raw === null || raw === '') { out.patch[key] = null; continue; }
    if (kind === 'stage') {
      out.stageName = String(raw).trim();
      continue;
    }
    if (kind === 'date') {
      const s = String(raw).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) { out.rejected.push(`${key} must be YYYY-MM-DD, got "${s}"`); continue; }
      out.patch[key] = s;
      continue;
    }
    if (kind === 'text') { out.patch[key] = String(raw).trim(); continue; }
    const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/[$,\s]/g, ''));
    if (!Number.isFinite(n)) { out.rejected.push(`${key} must be a number, got "${raw}"`); continue; }
    if (kind === 'int') {
      if (!Number.isInteger(n) || n < 0 || n > 100) { out.rejected.push(`${key} must be a whole number 0..100`); continue; }
      out.patch[key] = n;
      continue;
    }
    out.patch[key] = n;
  }
  if (!Object.keys(out.patch).length && !out.stageName) {
    throw new ToolFailure(`nothing to update. ${out.rejected.length ? out.rejected.join('; ') : `Writable fields: ${Object.keys(DEAL_FIELDS).join(', ')}`}`);
  }
  return out;
}

/**
 * The reply a watch was set for: the first message after the baseline that is
 * NOT the owner's own. Mike sending another chase is not the answer he asked to
 * be told about.
 */
export function firstReplyAfter(mails: ThreadMail[], baselineIso: string, ownerEmail: string): ThreadMail | null {
  const base = Date.parse(baselineIso);
  const owner = ownerEmail.toLowerCase();
  const after = mails
    .filter((m) => Date.parse(m.received_at) > base)
    .filter((m) => String(m.sender_email ?? '').toLowerCase() !== owner)
    .sort((a, b) => a.received_at.localeCompare(b.received_at));
  return after[0] ?? null;
}

/** HTML-escape: note bodies are stored and rendered as HTML by the notes UI. */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A note as the notes tab expects it: an HTML body, a plain length, a title
 * that already says when it was said. */
export function composeNote(text: string, now: Date, title?: string | null): { title: string; body: string; plainLength: number } {
  const plain = text.trim();
  if (!plain) throw new ToolFailure('note text is required');
  const stamp = etStamp(now.toISOString());
  return {
    title: (title && title.trim()) || `Voice note — ${stamp}`,
    body: plain.split(/\n{2,}/).map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join(''),
    plainLength: plain.length,
  };
}

/** What a new contact is still missing, so the agent can ask for it rather than
 * leaving a half-empty record nobody notices. */
export function contactMissingFields(c: Record<string, unknown>): string[] {
  const wanted: Array<[string, string]> = [
    ['email', 'email address'], ['phone', 'phone'], ['mobile_phone', 'mobile'],
    ['company', 'company'], ['title', 'job title'],
  ];
  return wanted.filter(([k]) => {
    const v = c[k];
    return v === null || v === undefined || String(v).trim() === '';
  }).map(([, label]) => label);
}

export function escapeLike(s: string): string {
  return s.replace(/[%_]/g, (m) => `\\${m}`);
}

// ----------------------------------------------------------------------------
// Scope
// ----------------------------------------------------------------------------

export const DEFAULT_OWNER_EMAIL = 'mike@oculusrep.com';

/**
 * One mailbox, resolved from the caller and nothing else — never from the
 * arguments, so a tool call cannot ask for someone else's desk.
 */
export async function resolveScope(
  store: TriageStore,
  caller: { kind: 'static' } | { kind: 'user'; authUserId: string },
  bearer: string | null,
  ownerEmailFallback = DEFAULT_OWNER_EMAIL,
): Promise<Scope> {
  if (caller.kind === 'user') {
    const userId = await store.userIdForAuthId(caller.authUserId);
    if (!userId) throw new ToolFailure('this login has no OVIS user record, so there is no mailbox to triage');
    const conn = await store.connectionForUser(userId);
    if (!conn) throw new ToolFailure('no Gmail mailbox is connected to this OVIS user, so there is nothing to triage');
    return {
      caller: 'user', authUserId: caller.authUserId, userId, connectionId: conn.id,
      ownerEmail: conn.google_email, ownerName: conn.user_name, bearer,
    };
  }
  const conn = await store.connectionForEmail(ownerEmailFallback);
  if (!conn || !conn.user_id) {
    throw new ToolFailure(
      `the static token acts for ${ownerEmailFallback}, and that mailbox is not connected. Sign in with OAuth to use your own, or set OVIS_MCP_OWNER_EMAIL.`,
    );
  }
  return {
    caller: 'static', authUserId: null, userId: conn.user_id, connectionId: conn.id,
    ownerEmail: conn.google_email, ownerName: conn.user_name, bearer: null,
  };
}

// ----------------------------------------------------------------------------
// Tools
// ----------------------------------------------------------------------------

/**
 * Wrap a write so the audit row is written before the caller hears anything.
 * EVERY attempt is logged, including one refused on its arguments — "it asked
 * to set the fee and was told no" is exactly the kind of thing a log with no
 * screen behind it exists to answer. So validation belongs INSIDE the callback.
 */
async function audited<T>(ctx: Ctx, tool: string, args: unknown, run: () => Promise<T>): Promise<T> {
  try {
    const result = await run();
    await ctx.store.audit({
      tool, caller: ctx.scope.caller, auth_user_id: ctx.scope.authUserId,
      user_id: ctx.scope.userId, args, ok: true, result,
    });
    return result;
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await ctx.store.audit({
      tool, caller: ctx.scope.caller, auth_user_id: ctx.scope.authUserId,
      user_id: ctx.scope.userId, args, ok: false, error,
    });
    throw e;
  }
}

/** The caller's own commitment, or a refusal. Never another mailbox's. */
async function ownCommitment(ctx: Ctx, id: string) {
  const row = await ctx.store.commitmentById(String(id ?? '').trim());
  if (!row) throw new ToolFailure('no commitment with that id');
  if (row.gmail_connection_id !== ctx.scope.connectionId) {
    throw new ToolFailure('that commitment belongs to a different mailbox');
  }
  return row;
}

export async function runTriage(args: any, ctx: Ctx) {
  const mode = args?.mode === 'full' ? 'full' : 'incremental';
  const runId = typeof args?.run_id === 'string' ? args.run_id : '';
  const offset = Number.isInteger(args?.offset) ? Number(args.offset) : 0;

  return await audited(ctx, 'run_triage', { mode, run_id: runId || null, offset }, async () => {
    // ONE extract-commitments invocation per call, deliberately. That function
    // drains until its own 110s deadline and then hands back next_offset, so a
    // second round trip cannot fit inside this one anyway -- and a loop here
    // would spin forever against an extractor that stopped advancing. An
    // unfinished pass is reported as unfinished, with the run_id to continue.
    const res = await ctx.invoke('extract-commitments', {
      connection_id: ctx.scope.connectionId,
      mode, drain: true, run_id: runId || undefined, offset,
    });
    const body: any = res.body;
    if (res.status !== 200 || body?.success === false) {
      throw new ToolFailure(`extract-commitments: ${body?.error ?? `HTTP ${res.status}`}`);
    }
    const currentRun = String(body?.run_id ?? runId ?? '');
    // Only an offset that moved forward is a resume point; anything else means
    // nothing was consumed, and asking again would be the same call.
    const reported = typeof body?.next_offset === 'number' ? body.next_offset : null;
    const nextOffset = body?.done === true || reported === null || reported <= offset ? null : reported;
    const calls = 1;

    const spoken = {
      mode,
      run_id: currentRun || null,
      invocations: calls,
      done: body?.done === true || nextOffset === null,
      conversations_checked: body?.attempted ?? 0,
      conversations_in_scope: body?.eligible_conversations ?? null,
      new_commitments: body?.inserted ?? 0,
      updated_commitments: body?.updated_by_existing_id ?? 0,
      cost_usd: Math.round(Number(body?.usd_this_batch ?? 0) * 10000) / 10000,
      spent_today_usd: Number(body?.spent_today_usd ?? 0),
      daily_cap_usd: Number(body?.daily_cap_usd ?? 0),
      stopped_on_daily_cap: body?.stopped_on_daily_cap === true,
      next_offset: nextOffset,
    };
    if (spoken.stopped_on_daily_cap) {
      return { ...spoken, say: `The daily model budget is used up — $${spoken.spent_today_usd.toFixed(2)} of $${spoken.daily_cap_usd}. Nothing was checked.` };
    }
    if (!spoken.done) {
      return {
        ...spoken,
        say: `Still reading — ${spoken.conversations_checked} conversations so far. Call run_triage again with run_id ${spoken.run_id} and offset ${nextOffset}, or triage_run_status for progress.`,
      };
    }
    return {
      ...spoken,
      say: body?.since_ts === null && mode === 'incremental' && !spoken.conversations_checked
        ? 'Nothing new to read since the last check.'
        : `Read ${spoken.conversations_checked} conversations. ${spoken.new_commitments} new, ${spoken.updated_commitments} updated. Cost $${spoken.cost_usd.toFixed(2)}.`,
    };
  });
}

export async function triageRunStatus(args: any, ctx: Ctx) {
  const runId = String(args?.run_id ?? '').trim();
  if (!runId) throw new ToolFailure('run_id is required');
  const run = await ctx.store.extractionRun(runId);
  if (!run) throw new ToolFailure('no extraction run with that id');
  if (String(run.gmail_connection_id) !== ctx.scope.connectionId) {
    throw new ToolFailure('that run belongs to a different mailbox');
  }
  const done = !!run.completed_at;
  return {
    run_id: runId,
    mode: run.mode,
    done,
    started_at: etStamp(String(run.started_at)),
    completed_at: etStamp(run.completed_at ? String(run.completed_at) : null),
    conversations_in_scope: run.conversations_in_scope ?? null,
    conversations_checked: run.attempted ?? 0,
    new_commitments: run.inserted ?? 0,
    updated_commitments: run.updated ?? 0,
    cost_usd: Number(run.usd ?? 0),
    error: run.error ?? null,
    say: done
      ? `That pass finished at ${etStamp(String(run.completed_at))} — ${run.attempted ?? 0} conversations, $${Number(run.usd ?? 0).toFixed(2)}.`
      : `Still running: ${run.attempted ?? 0} of ${run.conversations_in_scope ?? '?'} conversations so far.`,
  };
}

export async function getTriageList(args: any, ctx: Ctx) {
  const quietDays = Number.isInteger(args?.quiet_days) ? Number(args.quiet_days) : PANEL_QUIET_DAYS;
  const includeWaiting = args?.include_waiting !== false;
  const limit = Number.isInteger(args?.limit) ? Math.max(1, Number(args.limit)) : 25;
  const includePrefill = args?.include_prefill === true;

  const rows = await ctx.store.openCommitments(ctx.scope.connectionId);
  const threadIds = [...new Set(rows.flatMap((r) => [r.gmail_thread_id, ...((r.conversation_thread_ids ?? []) as string[])]).filter(Boolean))];
  const newest = await ctx.store.newestMailByThread(threadIds);
  const { owe, waiting, waitingTracked } = rankTriage(rows, newest, ctx.now(), quietDays);

  const shown = [...owe.slice(0, limit), ...(includeWaiting ? waiting.slice(0, limit) : [])];
  const addrs = [...new Set(shown.map((x) => x.row.counterparty_email)
    .filter((e): e is string => isSingleAddress(e)).map((e) => e.trim()))];
  const unknown = new Set((addrs.length ? await ctx.store.unknownCounterparties(addrs) : []).map((e) => e.toLowerCase()));

  const prefills = new Map<string, unknown>();
  if (includePrefill && ctx.scope.caller === 'user' && ctx.scope.bearer) {
    // One lookup per unknown address, capped: each one is a model call over the
    // owner's own mail, and a spoken list does not need five of them to be read
    // out. create_contact runs the same lookup when it actually creates.
    const targets = shown.filter((x) => isSingleAddress(x.row.counterparty_email)
      && unknown.has(String(x.row.counterparty_email).trim().toLowerCase())).slice(0, 5);
    await Promise.all(targets.map(async (x) => {
      const email = String(x.row.counterparty_email).trim();
      try {
        const r = await lookupSignature(ctx, email, x.row.counterparty_name);
        if (r) prefills.set(email.toLowerCase(), r);
      } catch { /* a failed lookup is not a failed list */ }
    }));
  }

  const shape = (x: { row: CommitmentRow; mail: ThreadMail | null }) => {
    const email = x.row.counterparty_email;
    const single = isSingleAddress(email);
    const key = single ? String(email).trim().toLowerCase() : null;
    const days = daysSince(x.mail?.received_at ?? null, ctx.now());
    return {
      commitment_id: x.row.id,
      ball: x.row.ball === 'me' ? 'you owe them' : 'waiting on them',
      summary: x.row.what,
      why: withoutStaleAge(x.row.speakable_reason),
      sender: x.row.counterparty_name
        ? `${x.row.counterparty_name}${email ? ` <${email}>` : ''}`
        : (email ?? 'unknown'),
      sender_email: email,
      subject: x.mail?.subject ?? null,
      deal: x.row.deal_id ? { deal_id: x.row.deal_id, deal_name: x.row.deal?.deal_name ?? null } : null,
      age_days: days,
      age: ageText(days),
      last_message_at: etStamp(x.mail?.received_at ?? null),
      gmail_thread_id: x.row.gmail_thread_id,
      conversation_thread_ids: x.row.conversation_thread_ids ?? [],
      // null, not false: a comma-joined pair of addresses is not one person and
      // cannot be looked up or added as one.
      is_known_contact: single ? !unknown.has(key!) : null,
      contact_note: single ? undefined : 'two addresses in one row; no contact can be created from it',
      contact_prefill: key ? prefills.get(key) ?? undefined : undefined,
      status: x.row.status,
      skipped_times: x.row.skip_count ?? 0,
      promised_date: x.row.promised_date,
      sync_problem: x.row.sync_state === 'failed' ? (x.row.sync_error ?? 'Gmail sync failed') : undefined,
    };
  };

  return {
    mailbox: ctx.scope.ownerEmail,
    as_of: etStamp(ctx.now().toISOString()),
    you_owe: owe.slice(0, limit).map(shape),
    you_owe_total: owe.length,
    waiting_on_others: includeWaiting ? waiting.slice(0, limit).map(shape) : [],
    waiting_quiet_total: waiting.length,
    waiting_tracked_total: waitingTracked,
    quiet_days: quietDays,
    prefill_included: includePrefill && ctx.scope.caller === 'user',
    say: `${owe.length} thing${owe.length === 1 ? '' : 's'} you owe, and ${waiting.length} of ${waitingTracked} you are waiting on have gone quiet for ${quietDays} days or more.`,
  };
}

export async function triageAction(args: any, ctx: Ctx) {
  return await audited(ctx, 'triage_action', { commitment_id: args?.commitment_id ?? null, action: args?.action ?? null }, async () => {
    const action = actionFor(args?.action);
    if (!action) throw new ToolFailure('action must be handled, flag, skip or not_commitment');
    const id = String(args?.commitment_id ?? '').trim();
    if (!id) throw new ToolFailure('commitment_id is required');
    const row = await ownCommitment(ctx, id);
    const res = await ctx.invoke('commitment-action', { commitment_id: row.id, action });
    const b = res.body ?? {};
    if (res.status !== 200 || b.success === false) {
      // The desk's contract: Handled and Flag are not done until Gmail says so,
      // and a failure is reported as a failure, never smoothed over.
      throw new ToolFailure(`${action} failed: ${b.error ?? `HTTP ${res.status}`}${b.sync_state ? ` (sync ${b.sync_state})` : ''}`);
    }
    const said = {
      handled: `Marked handled and archived in Gmail${b.archived_messages ? ` (${b.archived_messages} message${b.archived_messages === 1 ? '' : 's'})` : ''}.`,
      flag: `Flagged, and labelled OVIS/Flagged in Gmail.`,
      skip: `Skipped — it comes back ${b.next_surface_date ?? 'tomorrow'}.`,
      reject: `Recorded as not a commitment, and the extractor was told.`,
    }[action];
    return { commitment_id: row.id, action, what: row.what, status: b.status, sync_state: b.sync_state ?? null, say: said };
  });
}

export async function findDeal(args: any, ctx: Ctx) {
  const q = String(args?.query ?? '').trim();
  if (q.length < 2) throw new ToolFailure('query must be at least 2 characters');
  const matches = await ctx.store.searchDeals(q);
  return {
    query: q,
    count: matches.length,
    deals: matches,
    say: matches.length === 0
      ? `Nothing matches "${q}".`
      : matches.length === 1
        ? `One match: ${matches[0].deal_name ?? 'unnamed deal'}.`
        : `${matches.length} matches. ${matches.slice(0, 5).map((m) => m.deal_name ?? 'unnamed').join('; ')}${matches.length > 5 ? '; …' : ''}`,
  };
}

/** The existing "Look up in my email" lookup, run AS the caller. Returns the
 * found details, or null when there is nothing to prefill. */
async function lookupSignature(ctx: Ctx, email: string, name: string | null): Promise<Record<string, unknown> | null> {
  if (ctx.scope.caller !== 'user' || !ctx.scope.bearer) return null;
  const res = await ctx.invoke('ovis-knowledge-capture', {
    action: 'lookup_email_signature', name: name ?? '', sender_email: email,
  }, { bearer: ctx.scope.bearer });
  const b = res.body ?? {};
  if (res.status !== 200 || b.result !== 'found') return null;
  return {
    ...(b.details ?? {}),
    // The address the row is about wins over the signature's, except when the
    // lookup says the From is a mailing service — then it refuses it, and so do we.
    ...(b.relay_from ? {} : { email }),
    signature_email: b.signature_email,
    found_in_email: b.source?.subject ? `"${b.source.subject}", ${etStamp(b.source.received_at)}` : undefined,
  };
}

export async function createContact(args: any, ctx: Ctx) {
  const first = String(args?.first_name ?? '').trim();
  const last = String(args?.last_name ?? '').trim();
  const email = String(args?.email ?? '').trim();
  const dealId = String(args?.deal_id ?? '').trim() || null;

  return await audited(ctx, 'create_contact', { first_name: first, last_name: last, email: email || null, deal_id: dealId }, async () => {
    if (!first && !last) throw new ToolFailure('first_name or last_name is required');
    if (email && !isSingleAddress(email)) throw new ToolFailure(`"${email}" is not a single email address`);
    // Prefill from the owner's own mail, then let the spoken values win: the
    // person on the phone is a better source than a signature block.
    let prefill: Record<string, unknown> | null = null;
    let prefillNote: string | null = null;
    if (email && args?.use_email_lookup !== false) {
      try {
        prefill = await lookupSignature(ctx, email, [first, last].filter(Boolean).join(' '));
        if (!prefill) {
          prefillNote = ctx.scope.caller === 'user'
            ? 'no signature found in your mail for that address'
            : 'email lookup needs a signed-in user, so nothing was prefilled';
        }
      } catch (e) {
        prefillNote = `email lookup failed: ${e instanceof Error ? e.message : e}`;
      }
    }

    const spoken: Record<string, unknown> = {
      first_name: first || null, last_name: last || null,
      email: email || null,
      phone: String(args?.phone ?? '').trim() || null,
      mobile_phone: String(args?.mobile_phone ?? '').trim() || null,
      company: String(args?.company ?? '').trim() || null,
      title: String(args?.title ?? '').trim() || null,
    };
    const fields: Record<string, unknown> = {};
    for (const k of ['first_name', 'last_name', 'email', 'phone', 'mobile_phone', 'company', 'title']) {
      const fromPrefill = prefill && prefill[k] !== undefined && prefill[k] !== null && String(prefill[k]).trim() !== ''
        ? String(prefill[k]).trim() : null;
      fields[k] = spoken[k] ?? fromPrefill ?? null;
    }
    fields.source_type = 'Contact';

    const contact = await ctx.store.insertContact(fields, ctx.scope.userId);
    let attached: string | null = null;
    let attachError: string | null = null;
    if (dealId) {
      try {
        await ctx.store.attachDealContact(dealId, String(contact.id), ctx.scope.userId);
        attached = dealId;
      } catch (e) {
        attachError = e instanceof Error ? e.message : String(e);
      }
    }
    const missing = contactMissingFields(fields);
    return {
      contact_id: contact.id,
      contact: fields,
      prefilled_from_email: !!prefill,
      prefill_note: prefillNote ?? undefined,
      attached_to_deal: attached,
      attach_error: attachError ?? undefined,
      missing_fields: missing,
      say: `Created ${[first, last].filter(Boolean).join(' ')}${attached ? ' and attached them to the deal' : ''}.${missing.length ? ` Still missing: ${missing.join(', ')}.` : ''}${attachError ? ` Attaching to the deal failed: ${attachError}` : ''}`,
    };
  });
}

export async function logDealNote(args: any, ctx: Ctx) {
  const dealId = String(args?.deal_id ?? '').trim();
  const text = String(args?.note ?? '').trim();

  return await audited(ctx, 'log_deal_note', { deal_id: dealId || null, chars: text.length }, async () => {
    if (!dealId) throw new ToolFailure('deal_id is required');
    const note = composeNote(text, ctx.now(), args?.title);
    const deal = await ctx.store.dealById(dealId);
    if (!deal) throw new ToolFailure('no deal with that id — find_deal first');
    const created = await ctx.store.insertNote(note, dealId, ctx.scope.userId);
    return {
      note_id: created.id, deal_id: dealId, deal_name: deal.deal_name ?? null,
      title: note.title, logged_at: etStamp(ctx.now().toISOString()),
      say: `Noted on ${deal.deal_name ?? 'the deal'}.`,
    };
  });
}

export async function updateDeal(args: any, ctx: Ctx) {
  const dealId = String(args?.deal_id ?? '').trim();

  return await audited(ctx, 'update_deal', { deal_id: dealId || null, fields: args?.fields }, async () => {
    if (!dealId) throw new ToolFailure('deal_id is required');
    const built = buildDealPatch(args?.fields);
    const before = await ctx.store.dealById(dealId);
    if (!before) throw new ToolFailure('no deal with that id — find_deal first');

    const patch = { ...built.patch };
    let stageLabel: string | null = null;
    if (built.stageName) {
      const stage = await ctx.store.stageByName(built.stageName);
      if (!stage) throw new ToolFailure(`no deal stage called "${built.stageName}"`);
      patch.stage_id = stage.id;
      stageLabel = stage.label;
    }

    const after = await ctx.store.updateDeal(dealId, patch, ctx.scope.userId);
    const changed: Record<string, { before: unknown; after: unknown }> = {};
    for (const k of Object.keys(patch)) {
      if (String(before[k] ?? '') !== String(after[k] ?? '')) changed[k] = { before: before[k] ?? null, after: after[k] ?? null };
    }
    return {
      deal_id: dealId, deal_name: after.deal_name ?? before.deal_name ?? null,
      changed,
      unchanged: Object.keys(patch).filter((k) => !(k in changed)),
      rejected_fields: built.rejected.length ? built.rejected : undefined,
      stage: stageLabel ?? undefined,
      // Stage is not a private field: a trigger writes deal_stage_history and
      // syncs the linked site submit's stage. Say so rather than surprising anyone.
      side_effects: stageLabel ? ['deal_stage_history row written', 'linked site submit stage synced'] : [],
      say: Object.keys(changed).length
        ? `Updated ${Object.keys(changed).join(', ')} on ${after.deal_name ?? 'the deal'}.`
        : `Nothing changed — ${Object.keys(patch).join(', ')} already had those values.`,
    };
  });
}

export async function createWatch(args: any, ctx: Ctx) {
  const commitmentId = String(args?.commitment_id ?? '').trim();
  let threadId = String(args?.gmail_thread_id ?? '').trim();
  let threadIds: string[] = [];
  let label = String(args?.label ?? '').trim() || null;

  return await audited(ctx, 'create_watch', { commitment_id: commitmentId || null, gmail_thread_id: threadId || null, label }, async () => {
    if (commitmentId) {
      const row = await ownCommitment(ctx, commitmentId);
      threadId = row.gmail_thread_id;
      threadIds = [...new Set([row.gmail_thread_id, ...((row.conversation_thread_ids ?? []) as string[])].filter(Boolean))];
      label ??= row.what;
    } else if (threadId) {
      threadIds = [threadId];
    } else {
      throw new ToolFailure('commitment_id or gmail_thread_id is required');
    }

    const existing = (await ctx.store.watchesForUser(ctx.scope.userId, ['active']))
      .find((w) => w.thread_id === threadId);
    if (existing) {
      return {
        watch_id: existing.id, already_watching: true, thread_id: threadId,
        since: etStamp(existing.baseline_at),
        say: 'Already watching that thread — nothing new to set up.',
      };
    }

    // The baseline is the newest message on file right now. Replies count
    // strictly after it, so the message that prompted the watch never fires it.
    const newest = await ctx.store.newestMailByThread(threadIds);
    let baseline = '';
    for (const tid of threadIds) {
      const m = newest.get(tid);
      if (m && m.received_at > baseline) baseline = m.received_at;
    }
    const baselineAt = baseline || ctx.now().toISOString();

    const watch = await ctx.store.createWatch({
      user_id: ctx.scope.userId, gmail_connection_id: ctx.scope.connectionId,
      thread_id: threadId, thread_ids: threadIds,
      commitment_id: commitmentId || null, label, baseline_at: baselineAt,
    });
    return {
      watch_id: watch.id, thread_id: threadId, threads_watched: threadIds.length,
      watching_for: label, since: etStamp(baselineAt),
      say: `Watching that thread. Ask me for your watches and I will tell you if anyone has replied since ${etStamp(baselineAt)}.`,
    };
  });
}

export async function listWatches(args: any, ctx: Ctx) {
  const includeDone = args?.include_finished === true;
  const watches = await ctx.store.watchesForUser(
    ctx.scope.userId,
    includeDone ? ['active', 'fired', 'cancelled'] : ['active', 'fired'],
  );
  const replied: unknown[] = [];
  const quiet: unknown[] = [];
  const finished: unknown[] = [];

  for (const w of watches) {
    if (w.status === 'cancelled') { finished.push({ watch_id: w.id, status: 'cancelled', watching_for: w.label }); continue; }
    if (w.status === 'fired') {
      replied.push({
        watch_id: w.id, status: 'replied', watching_for: w.label, thread_id: w.thread_id,
        commitment_id: w.commitment_id, from: w.fired_sender, subject: w.fired_subject,
        replied_at: etStamp(w.fired_at),
      });
      continue;
    }
    const tids = (w.thread_ids?.length ? w.thread_ids : [w.thread_id]).filter(Boolean);
    const mails = await ctx.store.mailAfter(tids, w.baseline_at);
    const reply = firstReplyAfter(mails, w.baseline_at, ctx.scope.ownerEmail);
    if (reply) {
      // Record the firing, so the same reply is reported once and stays
      // answerable later from the row itself.
      await ctx.store.markWatchFired(w.id, reply);
      replied.push({
        watch_id: w.id, status: 'replied', watching_for: w.label, thread_id: w.thread_id,
        commitment_id: w.commitment_id,
        from: reply.sender_name ? `${reply.sender_name} <${reply.sender_email}>` : reply.sender_email,
        subject: reply.subject, replied_at: etStamp(reply.received_at),
      });
    } else {
      const days = daysSince(w.baseline_at, ctx.now());
      quiet.push({
        watch_id: w.id, status: 'no reply yet', watching_for: w.label, thread_id: w.thread_id,
        commitment_id: w.commitment_id, waiting_since: etStamp(w.baseline_at),
        waiting_days: days,
      });
    }
  }

  return {
    replied, no_reply_yet: quiet, finished: includeDone ? finished : undefined,
    checked_at: etStamp(ctx.now().toISOString()),
    say: replied.length
      ? `${replied.length} of your watches got a reply: ${replied.map((r: any) => r.watching_for ?? r.subject ?? r.thread_id).join('; ')}. ${quiet.length} still quiet.`
      : `No replies yet on ${quiet.length} watch${quiet.length === 1 ? '' : 'es'}.`,
  };
}

export async function cancelWatch(args: any, ctx: Ctx) {
  const id = String(args?.watch_id ?? '').trim();
  return await audited(ctx, 'cancel_watch', { watch_id: id || null }, async () => {
    if (!id) throw new ToolFailure('watch_id is required');
    const w = await ctx.store.watchById(id, ctx.scope.userId);
    if (!w) throw new ToolFailure('no watch with that id for this user');
    if (w.status !== 'active') return { watch_id: id, status: w.status, say: `That watch was already ${w.status}.` };
    await ctx.store.cancelWatch(id);
    return { watch_id: id, status: 'cancelled', watching_for: w.label, say: 'Stopped watching that thread.' };
  });
}

export const VOICE_TOOL_IMPLS: Record<string, (args: any, ctx: Ctx) => Promise<unknown>> = {
  run_triage: runTriage,
  triage_run_status: triageRunStatus,
  get_triage_list: getTriageList,
  triage_action: triageAction,
  find_deal: findDeal,
  create_contact: createContact,
  log_deal_note: logDealNote,
  update_deal: updateDeal,
  create_watch: createWatch,
  list_watches: listWatches,
  cancel_watch: cancelWatch,
};

// ----------------------------------------------------------------------------
// Tool definitions
//
// Written for a model choosing out loud, so each description says what the tool
// is FOR in Mike's words, and where it ends — "this one reads, that one acts".
// The names are the spoken verbs; the arguments are what a person would say.
// ----------------------------------------------------------------------------

export const VOICE_TOOLS = [
  {
    name: 'get_triage_list',
    description:
      "What Mike owes other people right now, and what he is waiting on that has gone quiet. This is the read: it changes nothing and costs nothing, so start here. Two lists come back. \"you_owe\" is everything the ball is in his court on, oldest conversation first — read these out in order. \"waiting_on_others\" is only the ones nobody has touched for five days or more; the rest are tracked and counted (waiting_tracked_total) but deliberately not read out, because a conversation that is still moving is not worth interrupting him about. Each row carries the sender, the subject, a one-line summary of the obligation, the linked deal if there is one, how old it is, the Gmail thread id (use it for create_watch or to open the thread), and is_known_contact — false means that person is NOT in OVIS and is worth adding with create_contact. Does NOT read new mail: call run_triage first if the list looks stale.",
    inputSchema: {
      type: 'object',
      properties: {
        include_waiting: { type: 'boolean', default: true, description: 'false for only what he owes.' },
        quiet_days: { type: 'integer', minimum: 0, maximum: 60, default: 5, description: 'How many days of silence before a "waiting on them" row is worth mentioning. Default 5, the same as the desk.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 25, description: 'Rows per list.' },
        include_prefill: { type: 'boolean', default: false, description: 'Also look up contact details in his own email for up to 5 unknown senders. Slow and costs a little; create_contact does this itself, so leave it off unless he asks for the details before deciding.' },
      },
    },
  },
  {
    name: 'run_triage',
    description:
      "Read Mike's recent email and rebuild the triage list. Use it when he says \"check my email\", \"what's new\", or when get_triage_list looks out of date. mode \"incremental\" (the default) reads only what has arrived since the last finished pass — seconds, usually free, and the right choice almost always. mode \"full\" re-reads the last 14 days: about eight minutes and roughly a dollar, so ASK HIM FIRST and only when he wants everything re-examined. Returns when the pass is done. If it is still going, it comes back with done=false and a run_id — tell him it is still reading, then either call run_triage again with that run_id and the offset it gave you, or triage_run_status to check progress. Spending is capped per day; if the cap is hit it says so and reads nothing.",
    inputSchema: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['incremental', 'full'], default: 'incremental', description: 'incremental = only new mail. full = the whole 14-day window, ~8 minutes and ~$1.' },
        run_id: { type: 'string', description: 'Continue a pass that did not finish. Use the run_id it returned.' },
        offset: { type: 'integer', minimum: 0, description: 'Where to resume. Use the next_offset it returned.' },
      },
    },
  },
  {
    name: 'triage_run_status',
    description:
      'How far an unfinished triage pass has got: conversations read, new and updated commitments, what it has cost, and whether it finished. Use it after run_triage comes back with done=false. Reads only.',
    inputSchema: {
      type: 'object',
      properties: { run_id: { type: 'string', description: 'The run_id run_triage returned.' } },
      required: ['run_id'],
    },
  },
  {
    name: 'triage_action',
    description:
      "Answer one item on the triage list, exactly as the buttons on the desk do — including in Gmail. \"handled\" means he has dealt with it: the item closes AND the conversation is archived out of his Gmail inbox. \"flag\" leaves it on the list and puts the OVIS/Flagged label on the thread in Gmail, so he can find it there. \"skip\" hides it until tomorrow. \"not_commitment\" means the extractor was wrong — nothing was ever owed; this also teaches it not to repeat the mistake, so prefer it over skip when the row is simply not real. Gmail has to confirm the archive or the label before this reports success: if it fails you will get an error saying so, and the item will show the problem. One item per call; get the commitment_id from get_triage_list.",
    inputSchema: {
      type: 'object',
      properties: {
        commitment_id: { type: 'string', format: 'uuid', description: 'From get_triage_list.' },
        action: { type: 'string', enum: ['handled', 'flag', 'skip', 'not_commitment'], description: 'handled = done + archive in Gmail. flag = label it OVIS/Flagged. skip = tomorrow. not_commitment = it was never real.' },
      },
      required: ['commitment_id', 'action'],
    },
  },
  {
    name: 'find_deal',
    description:
      'Find a deal by anything he might say about it: its name, the tenant or client, the city, or the street address. Returns EVERY match, each with the deal name, stage, client, address and what matched — so if there are several, read them back and let him pick rather than guessing. Use it to get a deal_id before log_deal_note, update_deal or create_contact. Reads only.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', minLength: 2, description: 'Deal name, client, tenant, city or address — whatever he said.' } },
      required: ['query'],
    },
  },
  {
    name: 'create_contact',
    description:
      "Add a person to OVIS, optionally attached to a deal. Give whatever he said — first and last name at a minimum; split the name yourself. If an email address is given, their own signature in Mike's mail is looked up and used to fill in the phone, company and job title he did not say; anything he DID say wins over the signature. Pass deal_id to attach them to that deal as a contact (get it from find_deal, or from the deal on a triage row). Returns the new record and missing_fields — read those back so he can fill the gaps now rather than leaving a half-empty contact. Use this when get_triage_list says is_known_contact is false. Not for a shared mailbox like info@ or leasing@ — those are not people.",
    inputSchema: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        email: { type: 'string', description: 'One address, no lists.' },
        phone: { type: 'string' },
        mobile_phone: { type: 'string' },
        company: { type: 'string' },
        title: { type: 'string', description: 'Job title.' },
        deal_id: { type: 'string', format: 'uuid', description: 'Attach the new contact to this deal.' },
        use_email_lookup: { type: 'boolean', default: true, description: 'false to skip the signature lookup and save only what he said.' },
      },
    },
  },
  {
    name: 'log_deal_note',
    description:
      "Write a note on a deal, timestamped, in Mike's words. Use it for anything he says to record about a deal — what was agreed on a call, what he is waiting for, what he decided. It appears on the deal's Notes tab like any other note. Give the text as he said it; do not summarise it into something shorter than what he told you. Get the deal_id from find_deal.",
    inputSchema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', format: 'uuid', description: 'From find_deal.' },
        note: { type: 'string', description: "The note, in his words. Blank lines become paragraphs." },
        title: { type: 'string', description: 'Optional. Defaults to "Voice note" plus the Eastern-time timestamp.' },
      },
      required: ['deal_id', 'note'],
    },
  },
  {
    name: 'update_deal',
    description:
      "Change specific fields on a deal and report what actually changed, old value to new. Writable: stage (say the stage name, e.g. \"Negotiating LOI\"), deal_name, target_close_date, probability (0-100), loi_written_date, loi_signed_date, contract_signed_date, closed_date, loss_reason, size_sqft, size_acres, landlord_name. Dates are YYYY-MM-DD. Money and commission fields are deliberately NOT writable here — they drive the commission and payment math, and belong on the commission tab where the result can be seen before saving; say so if he asks for one. Changing the stage also records a stage-change history row and moves the linked site submit's stage, and the answer tells you so. Read the before-and-after back to him. Get the deal_id from find_deal.",
    inputSchema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string', format: 'uuid', description: 'From find_deal.' },
        fields: {
          type: 'object',
          description: 'Only the fields he wants changed, e.g. {"stage": "At Lease/PSA", "target_close_date": "2026-12-15"}. A field set to null clears it.',
        },
      },
      required: ['deal_id', 'fields'],
    },
  },
  {
    name: 'create_watch',
    description:
      "Keep an eye on one email thread and tell him when anyone replies. Use it when he says \"let me know if she gets back to me\" or \"watch that one\". Pass the commitment_id from get_triage_list (best — it watches the whole conversation, which can span more than one Gmail thread) or a gmail_thread_id. Only replies from other people count; his own follow-ups do not. Nothing is pushed to him: the reply is reported the next time you call list_watches, so check that at the start of a session. Watching the same thread twice does nothing and says so.",
    inputSchema: {
      type: 'object',
      properties: {
        commitment_id: { type: 'string', format: 'uuid', description: 'Preferred: from get_triage_list.' },
        gmail_thread_id: { type: 'string', description: 'Use when there is no commitment for the thread.' },
        label: { type: 'string', description: 'What he is waiting for, in his words, so it can be read back. Defaults to the commitment.' },
      },
    },
  },
  {
    name: 'list_watches',
    description:
      'Check every thread he asked to be told about. Two groups come back: "replied" — someone answered, with who, the subject and when (report these first; each is reported once) — and "no_reply_yet", with how long it has been quiet. Worth calling at the start of a session, before get_triage_list. Reads only, apart from recording that a reply was seen.',
    inputSchema: {
      type: 'object',
      properties: { include_finished: { type: 'boolean', default: false, description: 'Also list cancelled watches.' } },
    },
  },
  {
    name: 'cancel_watch',
    description: 'Stop watching a thread. Use the watch_id from list_watches. "Never mind that one" / "stop watching that".',
    inputSchema: {
      type: 'object',
      properties: { watch_id: { type: 'string', format: 'uuid', description: 'From list_watches.' } },
      required: ['watch_id'],
    },
  },
] as const;
