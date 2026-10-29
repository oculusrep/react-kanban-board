/**
 * TriagePage — the desk panel. One question per row: what do you owe, and is it
 * still true?
 *
 * NOT THE DEAL BOARD. This is its own route on purpose. The board organises
 * deals; this organises obligations, and most obligations here have no deal
 * (only ~16% carry a deal_id). Mixing them would make the board's clock mean
 * two things.
 *
 * HANDLED IS A CLAIM ABOUT MIKE'S MAILBOX, so the row does not disappear on
 * click. It says "archiving…" until the edge function reports Gmail's own
 * success, and a failure stays on the row in red with the error. A row that
 * vanished optimistically would be the tool telling him it archived mail it had
 * not archived.
 *
 * ALL WRITES GO THROUGH THE commitment-action EDGE FUNCTION. `commitment`
 * grants this role SELECT and nothing else, deliberately.
 *
 * A FAILED QUERY IS NEVER AN EMPTY LIST. Each section carries its own error
 * state. "Nothing to show" and "I could not look" are different claims and must
 * read differently -- that confusion is the recurring failure on this project.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  CheckCircleIcon, FlagIcon, ClockIcon, NoSymbolIcon,
  ArrowPathIcon, ArrowTopRightOnSquareIcon, ChevronDownIcon, ChevronRightIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

const OWNER_EMAIL = 'mike@oculusrep.com';

/**
 * CHANGE THIS ONE NUMBER to retune the waiting list.
 *
 * A thing someone owes you is not worth looking at while the conversation is
 * still moving. A row in "Waiting on others" stays hidden until the
 * conversation has been silent this many days — counted from the LAST MESSAGE
 * OF ANY KIND, so their reply resets the clock just as your own chase does.
 * Hidden rows are still tracked and still counted in the header, so you can
 * see that they exist without reading them.
 */
const WAITING_QUIET_DAYS = 5;

const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

type Action = 'handled' | 'flag' | 'skip' | 'reject';

interface Row {
  id: string;
  gmail_thread_id: string;
  conversation_thread_ids: string[] | null;
  ball: 'me' | 'them' | 'neither';
  status: string;
  sync_state: string;
  sync_error: string | null;
  speakable_reason: string;
  what: string;
  skip_count: number;
  promised_date: string | null;
  deal_id: string | null;
  deal?: { deal_name: string | null } | null;
  lastAt?: string | null;
}

/** CLAUDE.md: local date, never toISOString(). */
function todayLocal(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** "3 minutes ago" — the only honest way to show a time nobody has to convert. */
function agoText(iso: string | null): string {
  if (!iso) return 'never';
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.round(hrs / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function gmailLink(threadId: string): string {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

export function TriagePage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, Action | undefined>>({});
  const [rowError, setRowError] = useState<Record<string, string | undefined>>({});
  const [waitingOpen, setWaitingOpen] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [running, setRunning] = useState<null | 'incremental' | 'full'>(null);
  const [progress, setProgress] = useState<string>('');
  const [runError, setRunError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: conn, error: connErr } = await supabase
        .from('gmail_connection').select('id').eq('google_email', OWNER_EMAIL).maybeSingle();
      if (connErr) throw new Error(`gmail_connection: ${connErr.message}`);
      if (!conn) throw new Error(`no gmail_connection for ${OWNER_EMAIL}`);

      // "Last refreshed" is the last run that FINISHED. A half-finished run is
      // not a refresh and must not claim to be one.
      const { data: lastRun, error: runReadErr } = await supabase
        .from('commitment_extraction_run')
        .select('completed_at')
        .eq('gmail_connection_id', conn.id)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1);
      if (runReadErr) throw new Error(`extraction_run: ${runReadErr.message}`);
      setLastRunAt(lastRun?.[0]?.completed_at ?? null);

      const today = todayLocal();
      const { data, error: rowErr } = await supabase
        .from('commitment')
        .select('id, gmail_thread_id, conversation_thread_ids, ball, status, sync_state, sync_error, speakable_reason, what, skip_count, promised_date, deal_id, deal:deal_id (deal_name)')
        .eq('gmail_connection_id', conn.id)
        .in('status', ['open', 'flagged', 'skipped'])
        .or(`next_surface_date.is.null,next_surface_date.lte.${today}`)
        .limit(1000);
      if (rowErr) throw new Error(`commitment: ${rowErr.message}`);

      const list = (data ?? []) as unknown as Row[];

      // "Oldest first" means the conversation has been quiet longest, which is
      // not the row's created_at -- every row was created when extraction first
      // ran. The age comes from the conversation's last message.
      const tids = [...new Set(list.flatMap((r) => [r.gmail_thread_id, ...(r.conversation_thread_ids ?? [])]).filter(Boolean))];
      const lastByThread = new Map<string, string>();
      for (let i = 0; i < tids.length; i += 150) {
        const { data: msgs, error: msgErr } = await supabase
          .from('emails').select('thread_id, received_at')
          .in('thread_id', tids.slice(i, i + 150))
          .order('received_at', { ascending: false })
          .limit(1000);
        if (msgErr) throw new Error(`emails: ${msgErr.message}`);
        for (const m of msgs ?? []) {
          const t = String(m.thread_id);
          if (!lastByThread.has(t)) lastByThread.set(t, String(m.received_at));
        }
      }
      for (const r of list) {
        const keys = [r.gmail_thread_id, ...(r.conversation_thread_ids ?? [])];
        r.lastAt = keys.map((k) => lastByThread.get(k)).filter(Boolean).sort().pop() ?? null;
      }
      setRows(list);
    } catch (e: any) {
      setRows(null);
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const act = useCallback(async (row: Row, action: Action) => {
    setBusy((b) => ({ ...b, [row.id]: action }));
    setRowError((e) => ({ ...e, [row.id]: undefined }));
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('not signed in');
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/commitment-action`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ commitment_id: row.id, action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.success) {
        // A Gmail failure is the row's problem, not the page's: it stays put
        // and says what Gmail said.
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      if (action === 'flag') {
        setRows((rs) => (rs ?? []).map((r) => (r.id === row.id ? { ...r, status: 'flagged' } : r)));
      } else {
        // handled (synced), skip (deferred) and reject all leave the panel.
        setRows((rs) => (rs ?? []).filter((r) => r.id !== row.id));
      }
    } catch (e: any) {
      setRowError((er) => ({ ...er, [row.id]: String(e?.message ?? e) }));
    } finally {
      setBusy((b) => ({ ...b, [row.id]: undefined }));
    }
  }, []);

  /**
   * Drive a run to completion. The function is batch-resumable, so one click can
   * mean several calls: it hands back next_offset plus the run_id, and the spend
   * so far travels with each call so the daily cap applies to the run and not to
   * each batch.
   */
  const runExtraction = useCallback(async (mode: 'incremental' | 'full') => {
    setRunning(mode);
    setRunError(null);
    setProgress(mode === 'incremental' ? 'Checking for new mail…' : 'Re-checking everything…');
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess?.session?.access_token;
      if (!token) throw new Error('not signed in');

      let offset = 0;
      let runId: string | undefined;
      let spent = 0;
      let attempted = 0;
      let scope: number | null = null;
      for (let guard = 0; guard < 60; guard++) {
        const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extract-commitments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            connection_email: OWNER_EMAIL, mode, offset, run_id: runId, usd_spent: spent,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || !body?.success) throw new Error(body?.error || `HTTP ${res.status}`);

        runId = body.run_id ?? runId;
        spent = body.usd_run_total ?? spent;
        attempted += body.attempted ?? 0;
        scope = body.conversations_with_new_mail ?? scope;

        if (body.stopped_on_daily_cap) {
          setProgress(`Daily cap reached — $${Number(body.spent_today_usd ?? 0).toFixed(2)} of $${body.daily_cap_usd} spent today. Nothing was checked.`);
          break;
        }
        if (scope === 0) { setProgress('No new mail since the last check.'); break; }
        setProgress(`Checked ${attempted} of ${scope ?? '?'} conversations…`);

        if (body.done || body.next_offset === null || body.next_offset === undefined) {
          setProgress(`Done — ${attempted} conversation${attempted === 1 ? '' : 's'} checked, $${Number(spent).toFixed(2)}.`);
          break;
        }
        offset = body.next_offset;
      }
      await load();
    } catch (e: any) {
      setRunError(String(e?.message ?? e));
      setProgress('');
    } finally {
      setRunning(null);
    }
  }, [load]);

  const byAge = (a: Row, b: Row) => String(a.lastAt ?? '').localeCompare(String(b.lastAt ?? ''));
  const youOwe = useMemo(() => (rows ?? []).filter((r) => r.ball === 'me').sort(byAge), [rows]);

  // Every ball='them' row is tracked. Only the ones that have gone quiet are
  // shown; the rest are counted, not listed.
  const waitingAll = useMemo(() => (rows ?? []).filter((r) => r.ball === 'them').sort(byAge), [rows]);
  const quietCutoff = Date.now() - WAITING_QUIET_DAYS * 86_400_000;
  const waitingQuiet = useMemo(
    () => waitingAll.filter((r) => {
      // No last message at all means nothing to measure silence from: treat it
      // as still moving rather than inventing a quiet period.
      if (!r.lastAt) return false;
      return Date.parse(r.lastAt) <= quietCutoff;
    }),
    [waitingAll, quietCutoff],
  );

  const renderRow = (row: Row) => {
    const b = busy[row.id];
    const err = rowError[row.id] ?? (row.sync_state === 'failed' ? row.sync_error : null);
    return (
      <div key={row.id} className="rounded-lg bg-white p-4" style={{ border: `1px solid ${SLATE}` }}>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[15px] leading-snug" style={{ color: NAVY }}>
              {row.status === 'flagged' && (
                <FlagIcon className="mr-1 inline h-4 w-4" style={{ color: TERRACOTTA }} aria-label="flagged" />
              )}
              {row.speakable_reason}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: STEEL }}>
              {row.deal?.deal_name && <span className="font-medium">{row.deal.deal_name}</span>}
              {row.skip_count > 0 && <span>skipped {row.skip_count}×</span>}
              <a
                href={gmailLink(row.gmail_thread_id)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline"
              >
                Open in Gmail <ArrowTopRightOnSquareIcon className="h-3 w-3" />
              </a>
            </div>
            {b === 'handled' && (
              <p className="mt-2 text-xs" style={{ color: STEEL }}>Archiving in Gmail…</p>
            )}
            {err && (
              <p className="mt-2 flex items-start gap-1 text-xs font-medium text-red-700">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Not archived — {err}</span>
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2">
            <button
              onClick={() => act(row, 'handled')} disabled={!!b}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              style={{ backgroundColor: NAVY }}
            >
              {b === 'handled' ? <ArrowPathIcon className="h-3.5 w-3.5 animate-spin" /> : <CheckCircleIcon className="h-3.5 w-3.5" />}
              Handled
            </button>
            <button
              onClick={() => act(row, 'flag')} disabled={!!b}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ border: `1px solid ${TERRACOTTA}`, color: TERRACOTTA }}
            >
              <FlagIcon className="h-3.5 w-3.5" /> Flag
            </button>
            <button
              onClick={() => act(row, 'skip')} disabled={!!b}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ border: `1px solid ${SLATE}`, color: STEEL }}
            >
              <ClockIcon className="h-3.5 w-3.5" /> Skip
            </button>
            <button
              onClick={() => act(row, 'reject')} disabled={!!b}
              className="inline-flex items-center gap-1 rounded px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
              style={{ border: `1px solid ${SLATE}`, color: STEEL }}
            >
              <NoSymbolIcon className="h-3.5 w-3.5" /> Not a commitment
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F8FAFC' }}>
      <div className="mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-semibold" style={{ color: NAVY }}>Triage</h1>
        <p className="mt-1 text-sm" style={{ color: STEEL }}>
          Obligations extracted from {OWNER_EMAIL}. Handled archives the conversation in Gmail.
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void runExtraction('incremental')}
            disabled={!!running}
            className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: NAVY }}
          >
            {running === 'incremental'
              ? <ArrowPathIcon className="h-4 w-4 animate-spin" />
              : <ArrowPathIcon className="h-4 w-4" />}
            Check new mail
          </button>

          <span className="text-xs" style={{ color: STEEL }}>
            last refreshed {agoText(lastRunAt)}
          </span>

          <button
            onClick={() => {
              // A full pass costs real money and takes real time, so it asks.
              if (window.confirm('This takes ~8 min and costs about $1. Run it?')) {
                void runExtraction('full');
              }
            }}
            disabled={!!running}
            className="ml-auto inline-flex items-center gap-1 rounded px-2.5 py-1 text-xs disabled:opacity-60"
            style={{ border: `1px solid ${SLATE}`, color: STEEL }}
          >
            {running === 'full' && <ArrowPathIcon className="h-3 w-3 animate-spin" />}
            Re-check everything
          </button>
        </div>

        {(progress || runError) && (
          <div className="mt-3">
            {progress && !runError && (
              <p className="text-xs" style={{ color: STEEL }}>{progress}</p>
            )}
            {runError && (
              <p className="flex items-start gap-1 text-xs font-medium text-red-700">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Check failed — {runError}</span>
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-red-800">
              <ExclamationTriangleIcon className="h-5 w-5" /> Could not load commitments
            </p>
            <p className="mt-1 text-xs text-red-700">{error}</p>
            <button onClick={() => void load()} className="mt-3 rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-800">
              Retry
            </button>
          </div>
        )}

        {loading && !error && (
          <p className="mt-6 text-sm" style={{ color: STEEL }}>Loading…</p>
        )}

        {!loading && !error && rows && (
          <>
            <section className="mt-8">
              <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: NAVY }}>
                You owe <span style={{ color: STEEL }}>({youOwe.length})</span>
              </h2>
              <div className="mt-3 space-y-3">
                {youOwe.length === 0
                  ? <p className="text-sm" style={{ color: STEEL }}>Nothing outstanding.</p>
                  : youOwe.map(renderRow)}
              </div>
            </section>

            <section className="mt-10">
              <button
                onClick={() => setWaitingOpen((v) => !v)}
                className="flex items-center gap-1 text-sm font-semibold uppercase tracking-wide"
                style={{ color: NAVY }}
              >
                {waitingOpen ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
                Waiting on others{' '}
                <span style={{ color: STEEL }}>
                  ({waitingAll.length} waiting, {waitingQuiet.length} gone quiet)
                </span>
              </button>
              {waitingOpen && (
                <div className="mt-3 space-y-3">
                  <p className="text-xs" style={{ color: STEEL }}>
                    Showing the {waitingQuiet.length} that {waitingQuiet.length === 1 ? 'has' : 'have'} been
                    silent {WAITING_QUIET_DAYS}+ days. The other {waitingAll.length - waitingQuiet.length}{' '}
                    {waitingAll.length - waitingQuiet.length === 1 ? 'is' : 'are'} still moving and tracked.
                  </p>
                  {waitingQuiet.length === 0
                    ? <p className="text-sm" style={{ color: STEEL }}>Nothing has gone quiet.</p>
                    : waitingQuiet.map(renderRow)}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

export default TriagePage;
