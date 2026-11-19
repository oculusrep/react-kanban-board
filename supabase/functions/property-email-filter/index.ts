/**
 * property-email-filter — keep OVIS/Property to GA/SC listings.
 * Spec: docs/PROPERTY_EMAIL_INTAKE_SPEC.md, Phase 1.
 *
 * For each message carrying OVIS/Property (owner's mailbox only):
 *   in_state / unknown  -> nothing changes
 *   out_of_state        -> one modify: + OVIS/Property-OOS, - OVIS/Property, - INBOX
 *   not_listing         -> - OVIS/Property; label-inbox re-routes it on its next
 *                          tick (inbox or 30-day window), or this function does
 *                          it in the same modify for anything older
 *
 * Every Gmail write follows label-inbox's order -- intent row, Gmail call,
 * stamp -- and is not "synced" until a fresh read of the message's labels
 * shows the intended end state.
 *
 * Request body (all optional):
 *   {}                                   one tick: undo scan, retries, up to MAX_PER_RUN new
 *   { mode: "backlog" }                  same, but keeps classifying until the deadline
 *   { max: n }                           new messages per call (default 25)
 *   { action: "restore", message_id }    undo one decision: Property + INBOX back
 *   { action: "restore_all", decisions?: [...], since?: iso }
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import Anthropic from 'npm:@anthropic-ai/sdk@0.124.0';
import {
  GmailConnection,
  refreshAccessToken,
  isTokenExpired,
  getOrCreateLabel,
  modifyMessageLabels,
  getMessageLabelIds,
  fetchGmailAttachment,
} from '../_shared/gmail.ts';
import { authorizeCaller } from '../_shared/caller-auth.ts';
import { PERSONAL_SENDER_ADDRESSES, matchesPersonalDomain } from '../_shared/tier1.ts';
import { LABEL, decide, ruleFor, type LabelRule } from '../_shared/labelDecide.ts';
import {
  OUTPUT_SCHEMA, SYSTEM_PROMPT, MAX_SYNC_ATTEMPTS,
  buildUserMessage, finalDecision, pickBody, backoffMinutes,
  type ModelOutput,
} from './classify.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')!;
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')!;

/** Spec 1.7, open question Q1: kept at the briefed model until answered. */
const MODEL = 'claude-haiku-4-5';
const PROMPT_VERSION = 'pe-filter-v1';
const MAX_PER_RUN = 25;
/** The edge runtime kills a request at 150s; leave room to write results. */
const DEADLINE_MS = 100_000;
/** label-inbox's ARCHIVED_WINDOW_DAYS: inside it, label-inbox re-routes. */
const LABEL_INBOX_WINDOW_DAYS = 30;
/** How far back the undo scan looks for the owner's Gmail relabels. */
const UNDO_LOOKBACK_DAYS = 7;
const PDF_MAX_BYTES = 10 * 1024 * 1024;
const PDF_MAX_FILES = 3;
const PDF_MAX_PAGES = 3;
const PDF_MAX_CHARS = 6_000;
/** Stop a run after this many API errors: an outage must not burn the tick. */
const MAX_MODEL_ERRORS = 3;

interface FilterRow {
  id: string;
  message_id: string;
  gmail_id: string;
  gmail_connection_id: string;
  email_id: string | null;
  decision: string;
  attempts: number;
  gmail_synced_at: string | null;
}

/** First pages of a PDF's text layer (no OCR in Phase 1). */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const { getDocumentProxy } = await import('npm:unpdf@1.0.6');
  const pdf = await getDocumentProxy(bytes.slice());
  try {
    const out: string[] = [];
    for (let n = 1; n <= Math.min(pdf.numPages as number, PDF_MAX_PAGES); n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      out.push((content.items as Array<{ str?: string; hasEOL?: boolean }>)
        .map((i) => (i.str ?? '') + (i.hasEOL ? '\n' : '')).join(''));
      page.cleanup();
    }
    return out.join('\n').replace(/[ \t]+/g, ' ').trim();
  } finally {
    await pdf.destroy();
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const started = Date.now();

  const caller = await authorizeCaller(req, { allowService: true, allowInternalUser: true }, corsHeaders);
  if (caller instanceof Response) return caller;

  let body: any = {};
  try { body = await req.json(); } catch { /* empty body = one tick */ }
  const backlog = body?.mode === 'backlog';
  const maxNew = typeof body?.max === 'number' ? body.max : MAX_PER_RUN;
  const debug = body?.debug === true;

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const stats = {
    restored_by_owner: 0,
    retried: 0,
    classified: 0,
    decisions: {} as Record<string, number>,
    synced: 0,
    sync_failed: 0,
    model_errors: 0,
    input_tokens: 0,
    output_tokens: 0,
    remaining: null as number | null,
    stopped_on_deadline: false,
    errors: [] as string[],
    skipped_already_decided: 0,
    debug: [] as unknown[],
  };

  try {
    // ---- Mailbox: the owner's, resolved by address, never by hardcoded id.
    const mailbox = Deno.env.get('TRIAGE_MAILBOX') ?? 'mike@oculusrep.com';
    const { data: conn, error: connErr } = await supabase
      .from('gmail_connection').select('*').eq('google_email', mailbox).eq('is_active', true).maybeSingle();
    if (connErr) throw new Error(`connection: ${connErr.message}`);
    if (!conn) throw new Error(`no active gmail_connection for ${mailbox}`);
    const connection = conn as GmailConnection;

    let accessToken = connection.access_token;
    if (isTokenExpired(connection.token_expires_at)) {
      const t = await refreshAccessToken(connection.refresh_token, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
      accessToken = t.access_token;
      await supabase.from('gmail_connection').update({
        access_token: accessToken,
        token_expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', connection.id);
    }

    const propertyId = await getOrCreateLabel(accessToken, LABEL.property);
    const oosId = await getOrCreateLabel(accessToken, LABEL.propertyOOS);

    // ------------------------------------------------------------------
    // email_label bookkeeping, so label-watcher credits these writes to OVIS.
    // ------------------------------------------------------------------
    const labelIntent = async (r: FilterRow, label: string, verdict: string) => {
      await supabase.from('email_label').upsert({
        email_id: r.email_id,
        gmail_id: r.gmail_id,
        message_id: r.message_id,
        gmail_connection_id: connection.id,
        label,
        source_verdict: verdict,
        applied_at: null,
        apply_error: null,
        removed_at: null,
        remove_error: null,
        dry_run: false,
      }, { onConflict: 'gmail_id,gmail_connection_id,label' });
    };
    const labelApplied = async (r: FilterRow, label: string, ok: boolean, err?: string) => {
      await supabase.from('email_label').update({
        applied_at: ok ? new Date().toISOString() : null,
        apply_error: ok ? null : (err ?? 'unknown'),
      }).eq('gmail_id', r.gmail_id).eq('gmail_connection_id', connection.id).eq('label', label);
    };
    const labelRemoved = async (r: FilterRow, label: string) => {
      await supabase.from('email_label').update({ removed_at: new Date().toISOString(), remove_error: null })
        .eq('gmail_id', r.gmail_id).eq('gmail_connection_id', connection.id).eq('label', label)
        .is('removed_at', null);
    };

    const markFailed = async (r: FilterRow, err: string) => {
      const gone = err === 'gone';
      const attempts = r.attempts + 1;
      const retry = !gone && attempts < MAX_SYNC_ATTEMPTS;
      await supabase.from('property_email_filter').update({
        gmail_sync_state: 'failed',
        last_error: err.slice(0, 1000),
        attempts,
        next_attempt_at: retry ? new Date(Date.now() + backoffMinutes(attempts) * 60_000).toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq('id', r.id);
      stats.sync_failed++;
    };

    // ------------------------------------------------------------------
    // Replacement label for a not_listing message label-inbox cannot reach
    // (older than its 30-day window and not in the inbox). Same decide().
    // ------------------------------------------------------------------
    let rulesCache: LabelRule[] = [];
    let rulesLoaded = false;
    const replacementFor = async (r: FilterRow): Promise<{ label: string; verdict: string } | null> => {
      if (!r.email_id) return null;
      if (!rulesLoaded) {
        rulesLoaded = true;
        const { data } = await supabase.from('email_label_rule').select('scope, pattern, label').eq('status', 'active');
        rulesCache = (data ?? []).map((x) => ({
          scope: x.scope as 'address' | 'domain', pattern: String(x.pattern).toLowerCase(), label: String(x.label),
        }));
      }
      const { data: e } = await supabase.from('emails')
        .select('id, message_id, subject, sender_email, thread_id, is_relevant, classification_outcome, classification_status')
        .eq('id', r.email_id).maybeSingle();
      if (!e) return null;
      const [{ data: links }, { data: stubs }, { data: threadSenders }] = await Promise.all([
        supabase.from('email_object_link').select('email_id').eq('email_id', e.id).limit(1),
        supabase.from('email_tier1_stub').select('action, tier1_reason').eq('message_id', e.message_id).limit(1),
        e.thread_id
          ? supabase.from('emails').select('sender_email').eq('thread_id', e.thread_id).limit(200)
          : Promise.resolve({ data: [] as Array<{ sender_email: string | null }> }),
      ]);
      const personalThread = (threadSenders ?? []).some((t: { sender_email: string | null }) => {
        const s = (t.sender_email ?? '').toLowerCase();
        return PERSONAL_SENDER_ADDRESSES.has(s) || matchesPersonalDomain(s.split('@')[1] ?? '');
      });
      const d = decide({
        tier1_action: stubs?.[0]?.action ?? null,
        tier1_reason: stubs?.[0]?.tier1_reason ?? null,
        classification_status: e.classification_status,
        classification_outcome: e.classification_outcome,
        is_relevant: e.is_relevant,
        subject: e.subject,
        sender_email: e.sender_email,
        has_link: (links ?? []).length > 0,
        personal_thread: personalThread,
        rule: ruleFor(rulesCache, e.sender_email),
        property_filter: 'not_listing',
      });
      return d ? { label: d.label, verdict: d.sourceVerdict } : null;
    };

    // ------------------------------------------------------------------
    // Bring Gmail into line with one decision, and confirm it.
    // ------------------------------------------------------------------
    const sync = async (r: FilterRow): Promise<void> => {
      try {
        if (r.decision === 'out_of_state') {
          await labelIntent(r, LABEL.propertyOOS, 'property_filter:out_of_state');
          await modifyMessageLabels(accessToken, r.gmail_id, [oosId], [propertyId, 'INBOX']);
          const after = await getMessageLabelIds(accessToken, r.gmail_id);
          if (after === null) { await labelApplied(r, LABEL.propertyOOS, false, 'gone'); return markFailed(r, 'gone'); }
          const ok = after.includes(oosId) && !after.includes(propertyId) && !after.includes('INBOX');
          await labelApplied(r, LABEL.propertyOOS, ok, ok ? undefined : 'unconfirmed');
          if (!ok) return markFailed(r, `unconfirmed end state: ${after.join(',')}`);
          await labelRemoved(r, LABEL.property);
          const now = new Date().toISOString();
          await supabase.from('property_email_filter').update({
            gmail_sync_state: 'synced', gmail_synced_at: now, archived_at: now,
            last_error: null, next_attempt_at: null, updated_at: now,
          }).eq('id', r.id);
          stats.synced++;
          return;
        }

        if (r.decision === 'not_listing') {
          const before = await getMessageLabelIds(accessToken, r.gmail_id);
          if (before === null) return markFailed(r, 'gone');
          let reachable = before.includes('INBOX');
          if (!reachable && r.email_id) {
            const { data: e } = await supabase.from('emails').select('received_at').eq('id', r.email_id).maybeSingle();
            const cutoff = Date.now() - LABEL_INBOX_WINDOW_DAYS * 86400_000;
            reachable = !!e?.received_at && new Date(e.received_at).getTime() >= cutoff;
          }
          // Outside label-inbox's reach: re-route here, in the same modify, so
          // the message is never left with no OVIS label.
          const repl = reachable ? null : await replacementFor(r);
          let addIds: string[] = [];
          if (repl && repl.label !== LABEL.property) {
            await labelIntent(r, repl.label, `property_filter:reroute:${repl.verdict}`);
            addIds = [await getOrCreateLabel(accessToken, repl.label)];
          }
          await modifyMessageLabels(accessToken, r.gmail_id, addIds, [propertyId]);
          const after = await getMessageLabelIds(accessToken, r.gmail_id);
          if (after === null) return markFailed(r, 'gone');
          const ok = !after.includes(propertyId) && addIds.every((id) => after.includes(id));
          if (repl && addIds.length) await labelApplied(r, repl.label, ok, ok ? undefined : 'unconfirmed');
          if (!ok) return markFailed(r, `unconfirmed end state: ${after.join(',')}`);
          await labelRemoved(r, LABEL.property);
          const now = new Date().toISOString();
          await supabase.from('property_email_filter').update({
            gmail_sync_state: 'synced', gmail_synced_at: now,
            last_error: null, next_attempt_at: null, updated_at: now,
          }).eq('id', r.id);
          stats.synced++;
          return;
        }

        // in_state / unknown / owner_restored: nothing to do in Gmail.
        await supabase.from('property_email_filter').update({
          gmail_sync_state: 'synced', gmail_synced_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq('id', r.id);
      } catch (e: any) {
        await markFailed(r, e?.status === 404 ? 'gone' : (e?.message ?? String(e)));
      }
    };

    // ------------------------------------------------------------------
    // Explicit restore (spec 1.11 path 2).
    // ------------------------------------------------------------------
    const restore = async (r: FilterRow): Promise<{ ok: boolean; error?: string }> => {
      if (r.decision !== 'out_of_state' && r.decision !== 'not_listing') {
        return { ok: false, error: `nothing to restore for decision ${r.decision}` };
      }
      try {
        await labelIntent(r, LABEL.property, 'property_filter:owner_restored');
        await modifyMessageLabels(accessToken, r.gmail_id, [propertyId, 'INBOX'], [oosId]);
        const after = await getMessageLabelIds(accessToken, r.gmail_id);
        if (after === null) { await labelApplied(r, LABEL.property, false, 'gone'); return { ok: false, error: 'gone' }; }
        const ok = after.includes(propertyId) && after.includes('INBOX') && !after.includes(oosId);
        await labelApplied(r, LABEL.property, ok, ok ? undefined : 'unconfirmed');
        if (!ok) return { ok: false, error: `unconfirmed end state: ${after.join(',')}` };
        await labelRemoved(r, LABEL.propertyOOS);
        // A not_listing re-route label is left for label-inbox's reconcile,
        // which now decides Property for this message.
        await supabase.from('property_email_filter').update({
          prior_decision: r.decision, decision: 'owner_restored',
          restored_at: new Date().toISOString(), restored_by: 'restore_action',
          updated_at: new Date().toISOString(),
        }).eq('id', r.id);
        return { ok: true };
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    };

    const ROW_COLS = 'id, message_id, gmail_id, gmail_connection_id, email_id, decision, attempts, gmail_synced_at';

    if (body?.action === 'restore') {
      if (typeof body?.message_id !== 'string') return json({ success: false, error: 'message_id required' }, 400);
      const { data: r } = await supabase.from('property_email_filter').select(ROW_COLS)
        .eq('message_id', body.message_id).maybeSingle();
      if (!r) return json({ success: false, error: 'no filter row for that message_id' }, 404);
      return json({ success: true, message_id: body.message_id, ...(await restore(r as FilterRow)) });
    }

    if (body?.action === 'restore_all') {
      const decisions: string[] = Array.isArray(body?.decisions) ? body.decisions : ['out_of_state', 'not_listing'];
      let q = supabase.from('property_email_filter').select(ROW_COLS)
        .eq('gmail_connection_id', connection.id).in('decision', decisions).limit(500);
      if (typeof body?.since === 'string') q = q.gte('created_at', body.since);
      const { data: rows, error } = await q;
      if (error) throw new Error(`restore_all select: ${error.message}`);
      let restored = 0;
      const failed: Array<{ message_id: string; error?: string }> = [];
      for (const r of (rows ?? []) as FilterRow[]) {
        if (Date.now() - started > DEADLINE_MS) { stats.stopped_on_deadline = true; break; }
        const res = await restore(r);
        if (res.ok) restored++; else failed.push({ message_id: r.message_id, error: res.error });
      }
      return json({ success: true, restored, failed, stopped_on_deadline: stats.stopped_on_deadline,
        note: 'Re-invoke until restored is 0: at most 500 rows per call.' });
    }

    // ------------------------------------------------------------------
    // 1. UNDO SCAN (spec 1.11 path 1). The owner's own Gmail relabels.
    //    out_of_state: Property added, OOS removed, or INBOX added.
    //    not_listing:  Property added only. (Deviation: an INBOX add on a
    //    not_listing message is the owner rescuing it from Junk's
    //    auto-archive, which says nothing about Property.)
    // ------------------------------------------------------------------
    {
      const since = new Date(Date.now() - UNDO_LOOKBACK_DAYS * 86400_000).toISOString();
      const { data: events, error } = await supabase.from('gmail_label_event')
        .select('gmail_id, label, event_type, observed_at')
        .eq('gmail_connection_id', connection.id)
        .eq('attribution', 'owner')
        .gte('observed_at', since)
        .in('label', [LABEL.property, LABEL.propertyOOS, 'INBOX'])
        .limit(2000);
      if (error) throw new Error(`undo scan: ${error.message}`);
      const relevant = (events ?? []).filter((e) =>
        (e.label === LABEL.property && e.event_type === 'added') ||
        (e.label === LABEL.propertyOOS && e.event_type === 'removed') ||
        (e.label === 'INBOX' && e.event_type === 'added'));
      const ids = [...new Set(relevant.map((e) => e.gmail_id as string))];
      for (let i = 0; i < ids.length; i += 200) {
        const { data: rows } = await supabase.from('property_email_filter').select(ROW_COLS)
          .eq('gmail_connection_id', connection.id)
          .in('gmail_id', ids.slice(i, i + 200))
          .in('decision', ['out_of_state', 'not_listing'])
          .not('gmail_synced_at', 'is', null);
        for (const r of (rows ?? []) as FilterRow[]) {
          const after = relevant.filter((e) =>
            e.gmail_id === r.gmail_id && new Date(e.observed_at).getTime() > new Date(r.gmail_synced_at!).getTime());
          const undone = r.decision === 'out_of_state'
            ? after.length > 0
            : after.some((e) => e.label === LABEL.property);
          if (!undone) continue;
          await supabase.from('property_email_filter').update({
            prior_decision: r.decision, decision: 'owner_restored',
            restored_at: new Date().toISOString(), restored_by: 'gmail_relabel',
            updated_at: new Date().toISOString(),
          }).eq('id', r.id);
          stats.restored_by_owner++;
        }
      }
    }

    // ------------------------------------------------------------------
    // 2. RETRIES: pending rows, and failed rows whose backoff has elapsed.
    // ------------------------------------------------------------------
    {
      const nowIso = new Date().toISOString();
      const { data: due } = await supabase.from('property_email_filter').select(ROW_COLS)
        .eq('gmail_connection_id', connection.id)
        .neq('gmail_sync_state', 'synced')
        .lt('attempts', MAX_SYNC_ATTEMPTS)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .neq('last_error', 'gone')
        .limit(50);
      // .neq drops NULL last_error rows in PostgREST; fetch those separately.
      const { data: dueNullErr } = await supabase.from('property_email_filter').select(ROW_COLS)
        .eq('gmail_connection_id', connection.id)
        .neq('gmail_sync_state', 'synced')
        .lt('attempts', MAX_SYNC_ATTEMPTS)
        .or(`next_attempt_at.is.null,next_attempt_at.lte.${nowIso}`)
        .is('last_error', null)
        .limit(50);
      for (const r of [...(due ?? []), ...(dueNullErr ?? [])] as FilterRow[]) {
        if (Date.now() - started > DEADLINE_MS) { stats.stopped_on_deadline = true; break; }
        await sync(r);
        stats.retried++;
      }
    }

    // ------------------------------------------------------------------
    // 3. NEW MESSAGES: live OVIS/Property labels with no filter row yet.
    // ------------------------------------------------------------------
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY_TRIAGE');
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY_TRIAGE is not set');
    const anthropic = new Anthropic({ apiKey });

    // Gather candidates oldest first, paging past ones already decided.
    const pickCandidates = async (want: number) => {
      const out: Array<{ gmail_id: string; message_id: string; email_id: string | null }> = [];
      let remaining = 0;
      const PAGE = 500;
      for (let offset = 0; ; offset += PAGE) {
        const { data: page, error } = await supabase.from('email_label')
          .select('gmail_id, message_id, email_id')
          .eq('gmail_connection_id', connection.id)
          .eq('label', LABEL.property)
          .not('applied_at', 'is', null)
          .is('removed_at', null)
          .order('created_at', { ascending: true })
          .range(offset, offset + PAGE - 1);
        if (error) throw new Error(`candidates: ${error.message}`);
        const rows = page ?? [];

        // email_label.message_id can be null; fall back to the emails row.
        const missing = rows.filter((r) => !r.message_id && r.email_id).map((r) => r.email_id as string);
        const midByEmail = new Map<string, string>();
        for (let i = 0; i < missing.length; i += 200) {
          const { data: es } = await supabase.from('emails').select('id, message_id').in('id', missing.slice(i, i + 200));
          for (const e of es ?? []) midByEmail.set(e.id as string, e.message_id as string);
        }
        const withMid = rows
          .map((r) => ({ gmail_id: r.gmail_id as string, email_id: r.email_id as string | null,
            message_id: (r.message_id as string | null) ?? (r.email_id ? midByEmail.get(r.email_id) ?? null : null) }))
          .filter((r): r is { gmail_id: string; email_id: string | null; message_id: string } => !!r.message_id);

        const done = new Set<string>();
        const mids = withMid.map((r) => r.message_id);
        // 50 per IN(): RFC Message-IDs are ~70 chars, and inside the edge
        // runtime a ~16KB query string (200 ids) fails to send at all.
        for (let i = 0; i < mids.length; i += 50) {
          const { data: ex, error: exErr } = await supabase.from('property_email_filter').select('message_id')
            .in('message_id', mids.slice(i, i + 50));
          // An unchecked error here made every decided message look new, so the
          // backlog re-billed the same emails (2026-11-19). Fail instead.
          if (exErr) throw new Error(`done check: ${exErr.message}`);
          for (const x of ex ?? []) done.add(x.message_id as string);
        }
        for (const r of withMid) {
          if (done.has(r.message_id)) continue;
          if (out.length < want) out.push(r); else remaining++;
        }
        if (rows.length < PAGE) break;
      }
      return { candidates: out, remaining };
    };

    const classifyOne = async (c: { gmail_id: string; message_id: string; email_id: string | null }) => {
      // Never pay twice for one message: re-check right before the model call.
      const { data: already, error: alErr } = await supabase.from('property_email_filter')
        .select('id').eq('message_id', c.message_id).limit(1);
      if (alErr) throw new Error(`already check: ${alErr.message}`);
      if (already?.length) { stats.skipped_already_decided++; if (debug) stats.debug.push({ skipped: c }); return; }
      let q = supabase.from('emails')
        .select('id, message_id, subject, sender_email, sender_name, body_text, body_html');
      q = c.email_id ? q.eq('id', c.email_id) : q.eq('message_id', c.message_id);
      const { data: e } = await q.limit(1).maybeSingle();

      const body = pickBody(e?.body_text, e?.body_html);
      const inputs: Record<string, unknown> = {
        body_source: body.source, body_length: body.length, body_truncated: body.truncated, pdfs: [] as unknown[],
      };

      const pdfs: Array<{ filename: string; text: string }> = [];
      if (e?.id) {
        const { data: atts } = await supabase.from('email_attachments')
          .select('filename, mime_type, size_bytes')
          .eq('email_id', e.id).ilike('mime_type', '%pdf%').limit(10);
        for (const a of atts ?? []) {
          const entry: Record<string, unknown> = { filename: a.filename, size_bytes: a.size_bytes };
          (inputs.pdfs as unknown[]).push(entry);
          if (pdfs.length >= PDF_MAX_FILES) { entry.status = 'skipped_limit'; continue; }
          if ((a.size_bytes ?? 0) > PDF_MAX_BYTES) { entry.status = 'too_large'; continue; }
          const f = await fetchGmailAttachment(accessToken, c.gmail_id, a.filename, a.size_bytes);
          if (!f.ok) { entry.status = 'fetch_failed'; entry.detail = f.reason; continue; }
          try {
            const text = (await pdfText(f.bytes)).slice(0, PDF_MAX_CHARS);
            if (!text) { entry.status = 'no_text_layer'; continue; }
            entry.status = 'read'; entry.chars = text.length;
            pdfs.push({ filename: a.filename, text });
          } catch (err: any) {
            entry.status = 'fetch_failed'; entry.detail = `pdf parse: ${err?.message ?? err}`;
          }
        }
      }

      const sourceText = [e?.subject ?? '', body.text, ...pdfs.map((p) => p.text)].join('\n');
      const userMsg = buildUserMessage({
        subject: e?.subject ?? null, senderName: e?.sender_name ?? null, senderEmail: e?.sender_email ?? null,
        body: body.text, pdfs,
      });

      let model: ModelOutput | null = null;
      let modelErr: string | null = null;
      let inTok: number | null = null, outTok: number | null = null;
      try {
        const resp = await anthropic.messages.create({
          model: MODEL,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMsg }],
          output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
        } as any);
        inTok = resp.usage?.input_tokens ?? null;
        outTok = resp.usage?.output_tokens ?? null;
        stats.input_tokens += inTok ?? 0;
        stats.output_tokens += outTok ?? 0;
        if (resp.stop_reason !== 'end_turn') {
          modelErr = `stop_reason:${resp.stop_reason}`;
        } else {
          const text = (resp.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
          try { model = JSON.parse(text) as ModelOutput; } catch { modelErr = 'unparseable_output'; }
        }
      } catch (err: any) {
        // Transient API trouble: write NO row, so the message is retried next tick.
        stats.model_errors++;
        stats.errors.push(`model: ${err?.status ?? ''} ${err?.message ?? err}`.slice(0, 300));
        return;
      }

      // A refusal, truncation or bad JSON is final for this prompt version:
      // stored as unknown (the safe answer) so it is not re-billed every tick.
      const fd = model
        ? finalDecision(model, sourceText)
        : { decision: 'unknown' as const, downgrade_reason: `model_output:${modelErr}`, states_found: [], properties: [],
            evidence_in_source: false, text_scan_hits: [] };

      const needsSync = fd.decision === 'out_of_state' || fd.decision === 'not_listing';
      const { data: inserted, error: insErr } = await supabase.from('property_email_filter').upsert({
        message_id: c.message_id,
        gmail_id: c.gmail_id,
        gmail_connection_id: connection.id,
        email_id: e?.id ?? c.email_id,
        decision: fd.decision,
        model_decision: model?.decision ?? null,
        downgrade_reason: fd.downgrade_reason,
        is_listing: model?.is_listing ?? null,
        states_found: fd.states_found,
        properties: fd.properties,
        evidence: model?.evidence ? model.evidence.slice(0, 200) : null,
        evidence_in_source: fd.evidence_in_source,
        text_scan_hits: fd.text_scan_hits,
        inputs,
        model: MODEL,
        prompt_version: PROMPT_VERSION,
        input_tokens: inTok,
        output_tokens: outTok,
        gmail_sync_state: needsSync ? 'pending' : 'synced',
        gmail_synced_at: needsSync ? null : new Date().toISOString(),
      }, { onConflict: 'message_id', ignoreDuplicates: true }).select(ROW_COLS);
      if (insErr) { stats.errors.push(`insert ${c.message_id}: ${insErr.message}`); return; }
      if (!inserted?.length) { stats.errors.push(`insert ${c.message_id}: conflict, no row written`); return; }
      stats.classified++;
      stats.decisions[fd.decision] = (stats.decisions[fd.decision] ?? 0) + 1;
      const row = (inserted ?? [])[0] as FilterRow | undefined;
      if (row && needsSync) await sync(row);
    };

    // One batch per tick; backlog keeps going until the deadline.
    for (;;) {
      if (Date.now() - started > DEADLINE_MS) { stats.stopped_on_deadline = true; break; }
      const { candidates, remaining } = await pickCandidates(maxNew);
      if (debug) stats.debug.push({ candidates: candidates.slice(0, 5) });
      stats.remaining = remaining + candidates.length;
      if (candidates.length === 0) break;
      for (const c of candidates) {
        if (Date.now() - started > DEADLINE_MS) { stats.stopped_on_deadline = true; break; }
        if (stats.model_errors >= MAX_MODEL_ERRORS) break;
        await classifyOne(c);
        stats.remaining = Math.max(0, (stats.remaining ?? 1) - 1);
      }
      if (!backlog || stats.model_errors >= MAX_MODEL_ERRORS || stats.stopped_on_deadline) break;
    }

    return json({
      success: true, model: MODEL, prompt_version: PROMPT_VERSION, mode: backlog ? 'backlog' : 'tick',
      duration_ms: Date.now() - started, ...stats,
    });
  } catch (e: any) {
    console.error('[property-email-filter]', e?.message ?? e);
    return json({ success: false, error: String(e?.message ?? e), ...stats }, 500);
  }
});
