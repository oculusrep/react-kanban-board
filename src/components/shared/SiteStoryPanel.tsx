/**
 * SiteStoryPanel — the site research thread.
 *
 * A chat thread on a site submit that produces the archetype call and an executive
 * summary. Lives as a collapsible section inside the DATA tab of SiteSubmitSidebar, NOT
 * as a sixth tab — the tab strip is already full at 500px (feedback_slideout_tab_overflow).
 *
 * Runs are BACKGROUND work (docs/SITE_RESEARCH_BACKGROUND_RUNS_DESIGN.md): the edge
 * function answers 202 with a thread/run id and ovis-site-research-worker does the model
 * loop. This panel watches progress two ways:
 *   - postgres_changes on research_thread, research_thread_message and
 *     research_thread_run_step (all in the supabase_realtime publication), and
 *   - a 10 s poll while anything is live. Realtime can fail silently — PortalChatTab's
 *     subscription received nothing for months because its table was never published —
 *     so the poll guarantees the panel converges regardless.
 *
 * Reads go straight to the tables (RLS allows SELECT to authenticated). Writes go only
 * through ovis-site-research, which re-checks the Starbucks + permission gate.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// OVIS brand palette.
const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

const POLL_MS = 10_000;

export type Archetype = 'GROWTH' | 'MATURE' | 'REDEVELOPMENT' | 'RELIEF' | 'WHITE_SPACE';

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  GROWTH: 'Growth',
  MATURE: 'Mature',
  REDEVELOPMENT: 'Redevelopment',
  RELIEF: 'Relief',
  WHITE_SPACE: 'White space',
};

type ThreadState = 'queued' | 'running' | 'complete' | 'failed' | 'archived';
type RunState = 'queued' | 'running' | 'complete' | 'failed' | 'cancelled';

interface ThreadRow {
  id: string;
  /** Written by brief_pass from the finished record; shown open, above the collapsed record. */
  brief_text: string | null;
  brief_generated_at: string | null;
  archetype_primary: Archetype | null;
  archetype_secondary: Archetype | null;
  story_carriers: string[];
  state: ThreadState;
  created_at: string;
  pinned_context: { site?: { coordinate_source?: string } } | null;
}

interface MessageRow {
  id: string;
  seq: number;
  role: 'user' | 'assistant';
  content: string;
  cost_usd: string | number | null;
  created_at: string;
}

interface RunRow {
  id: string;
  kind: 'archetype' | 'turn' | 'deep_pass' | 'brief' | 'record_qa';
  state: RunState;
  phase: string | null;
  iteration: number;
  attempts: number;
  web_search_requests: number;
  search_budget: number;
  /** Deep pass only: current phase, and searches used before it began (budgets are per phase). */
  pass_phase: 'prepare' | 'school_fill' | 'deep_pass' | 'exports' | null;
  phase_search_base: number;
  client_tool_calls: number;
  cost_usd: string | number;
  retry_cost_usd: string | number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

const RUN_COLUMNS =
  'id, kind, state, phase, pass_phase, phase_search_base, iteration, attempts, web_search_requests, search_budget, client_tool_calls, cost_usd, retry_cost_usd, error, created_at, started_at, finished_at';

const PASS_PHASE_LABEL: Record<NonNullable<RunRow['pass_phase']>, string> = {
  prepare: 'Deep pass: reading first-pass schools',
  school_fill: 'Deep pass: filling school gaps',
  deep_pass: 'Deep pass: researching story carriers',
  exports: 'Deep pass: writing CSVs to Dropbox',
};

const isLive = (s: string | null | undefined) => s === 'queued' || s === 'running';

/**
 * Split a deep pass record into its **SECTION** blocks so the panel can collapse it section by
 * section. Mirrors splitRecordSections in _shared/site-research/brief.ts — the edge function cannot
 * import from src/, so the two are kept in step by hand.
 */
function splitRecordSections(record: string): Array<{ heading: string; body: string }> {
  const re = /^\*\*([A-Z][A-Z '\u2019-]+)\*\*\s*$/gm;
  const marks: Array<{ heading: string; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(record)) !== null) marks.push({ heading: m[1].trim(), start: m.index, end: re.lastIndex });
  const out: Array<{ heading: string; body: string }> = [];
  for (let i = 0; i < marks.length; i++) {
    const body = record.slice(marks[i].end, i + 1 < marks.length ? marks[i + 1].start : record.length).trim();
    if (body) out.push({ heading: marks[i].heading, body });
  }
  return out;
}

/** The deep pass record on this thread: the assistant message a completed deep pass wrote. */
const DEEP_PASS_MARKERS = ['**VERDICT**', '**HEADLINE**', '**GENERATOR CALLOUTS**'];
const isRecordMessage = (m: { role: string; content: string }) =>
  m.role === 'assistant' && DEEP_PASS_MARKERS.some((k) => m.content.includes(k));

interface SiteStoryPanelProps {
  siteSubmitId: string;
  /** Bump to force a re-fetch of the thread list. */
  refreshTrigger?: number;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      timeZone: 'America/New_York',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatElapsed(fromIso: string, nowMs: number): string {
  const s = Math.max(0, Math.round((nowMs - new Date(fromIso).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`;
}

/** Supabase RPC/function errors are plain objects — String(e) yields "[object Object]". */
function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === 'object' && e !== null) {
    const obj = e as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof obj.detail === 'string' && obj.detail) parts.push(obj.detail);
    if (typeof obj.message === 'string' && obj.message) parts.push(obj.message);
    if (parts.length > 0) return parts.join(' — ');
  }
  return String(e);
}

/**
 * supabase.functions.invoke surfaces a non-2xx as an opaque FunctionsHttpError; the
 * useful text is in the JSON body, which has to be read off the response.
 */
async function extractInvokeError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const body = await ctx.json();
      if (body && typeof body === 'object') {
        const b = body as { detail?: string; error?: string };
        return b.detail ?? b.error ?? toErrorMessage(error);
      }
    } catch {
      /* fall through */
    }
  }
  return toErrorMessage(error);
}

async function invoke(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke('ovis-site-research', { body });
  if (error) throw new Error(await extractInvokeError(error));
  return (data ?? {}) as Record<string, unknown>;
}

function StatusBadge({ state }: { state: ThreadState | RunState }) {
  const style: Record<string, { label: string; bg: string; fg: string; border: string }> = {
    queued: { label: 'Queued', bg: '#F8FAFC', fg: STEEL, border: SLATE },
    running: { label: 'Running', bg: '#EEF3FA', fg: NAVY, border: STEEL },
    failed: { label: 'Failed', bg: '#FFF7F0', fg: TERRACOTTA, border: TERRACOTTA },
  };
  const s = style[state];
  if (!s) return null;
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ backgroundColor: s.bg, color: s.fg, border: `1px solid ${s.border}` }}>
      {s.label}
    </span>
  );
}

export default function SiteStoryPanel({ siteSubmitId, refreshTrigger = 0 }: SiteStoryPanelProps) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [run, setRun] = useState<RunRow | null>(null);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [startingDeepPass, setStartingDeepPass] = useState(false);
  const [writingBrief, setWritingBrief] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- data loaders ----
  const loadThreads = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('research_thread')
      .select('id, archetype_primary, archetype_secondary, story_carriers, state, created_at, pinned_context, brief_text, brief_generated_at')
      .eq('site_submit_id', siteSubmitId)
      .order('created_at', { ascending: false });
    if (err) {
      setError(err.message);
      setThreads((prev) => prev ?? []);
      return;
    }
    setThreads((data ?? []) as unknown as ThreadRow[]);
  }, [siteSubmitId]);

  const loadOpenThread = useCallback(async (threadId: string, showSpinner = false) => {
    if (showSpinner) setLoadingMessages(true);
    try {
      const [msgRes, runRes] = await Promise.all([
        supabase
          .from('research_thread_message')
          .select('id, seq, role, content, cost_usd, created_at')
          .eq('thread_id', threadId)
          .order('seq', { ascending: true }),
        supabase
          .from('research_thread_run')
          .select(RUN_COLUMNS)
          .eq('thread_id', threadId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (msgRes.error) throw msgRes.error;
      if (runRes.error) throw runRes.error;
      setMessages((msgRes.data ?? []) as unknown as MessageRow[]);
      setRun((runRes.data ?? null) as unknown as RunRow | null);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      if (showSpinner) setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    loadThreads();
  }, [loadThreads, refreshTrigger]);

  useEffect(() => {
    if (!openThreadId) {
      setMessages([]);
      setRun(null);
      return;
    }
    loadOpenThread(openThreadId, true);
  }, [openThreadId, loadOpenThread]);

  // ---- realtime ----
  useEffect(() => {
    const channel = supabase
      .channel(`site-story-${siteSubmitId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'research_thread', filter: `site_submit_id=eq.${siteSubmitId}` },
        () => {
          loadThreads();
          if (openThreadId) loadOpenThread(openThreadId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [siteSubmitId, openThreadId, loadThreads, loadOpenThread]);

  const liveRunId = run && isLive(run.state) ? run.id : null;

  useEffect(() => {
    if (!openThreadId) return;
    let channel = supabase
      .channel(`site-story-thread-${openThreadId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'research_thread_message', filter: `thread_id=eq.${openThreadId}` },
        () => loadOpenThread(openThreadId),
      );
    if (liveRunId) {
      // Per-attempt steps: claim, model response, commit — the progress heartbeat.
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'research_thread_run_step', filter: `run_id=eq.${liveRunId}` },
        () => loadOpenThread(openThreadId),
      );
    }
    channel.subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [openThreadId, liveRunId, loadOpenThread]);

  // ---- poll while anything is live (realtime can fail silently) ----
  const anyLive = !!(threads?.some((t) => isLive(t.state)) || (run && isLive(run.state)));
  useEffect(() => {
    if (!anyLive) return;
    const poll = setInterval(() => {
      loadThreads();
      if (openThreadId) loadOpenThread(openThreadId);
    }, POLL_MS);
    const tick = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [anyLive, openThreadId, loadThreads, loadOpenThread]);

  // Scroll to the newest turn only when the thread GROWS, never on first load — the
  // messages live in the DATA tab's own scroll container, so an unconditional
  // scrollIntoView would yank the whole tab past the deal details on open.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (prevCountRef.current > 0 && messages.length > prevCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  // ---- actions ----
  const handleStart = async () => {
    setError(null);
    setStarting(true);
    try {
      const data = await invoke({ action: 'create_thread', site_submit_id: siteSubmitId });
      const threadId = data.thread_id as string | undefined;
      if (!threadId) throw new Error('The run was accepted but no thread id came back.');
      await loadThreads();
      setOpenThreadId(threadId);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setStarting(false);
    }
  };

  const handleSend = async () => {
    const text = draft.trim();
    if (!text || !openThreadId) return;
    setError(null);
    setSending(true);
    try {
      await invoke({ action: 'send_turn', thread_id: openThreadId, message: text });
      setDraft('');
      await Promise.all([loadOpenThread(openThreadId), loadThreads()]);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const handleRetry = async () => {
    if (!openThreadId) return;
    setError(null);
    setRetrying(true);
    try {
      await invoke({ action: 'retry_run', thread_id: openThreadId });
      await Promise.all([loadOpenThread(openThreadId), loadThreads()]);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  const handleDeepPass = async () => {
    if (!openThreadId) return;
    const ok = window.confirm(
      'Run the deep pass? It fills school data gaps, researches the story carriers (up to 35 web searches in total), ' +
        "writes Why Here / Supporting points / What's working against us, and saves schools.csv and employers.csv to " +
        "this site submit's Dropbox folder. It runs in the background and takes several minutes.",
    );
    if (!ok) return;
    setError(null);
    setStartingDeepPass(true);
    try {
      await invoke({ action: 'start_deep_pass', thread_id: openThreadId });
      await Promise.all([loadOpenThread(openThreadId), loadThreads()]);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setStartingDeepPass(false);
    }
  };

  const handleBrief = async () => {
    if (!openThreadId) return;
    setError(null);
    setWritingBrief(true);
    try {
      await invoke({ action: 'start_brief', thread_id: openThreadId });
      await Promise.all([loadOpenThread(openThreadId), loadThreads()]);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setWritingBrief(false);
    }
  };

  const handleAsk = async () => {
    const q = question.trim();
    if (!q || !openThreadId) return;
    setError(null);
    setAsking(true);
    try {
      await invoke({ action: 'ask_record', thread_id: openThreadId, question: q });
      setQuestion('');
      await Promise.all([loadOpenThread(openThreadId), loadThreads()]);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setAsking(false);
    }
  };

  const openThread = threads?.find((t) => t.id === openThreadId) ?? null;
  const runIsLive = !!run && isLive(run.state);

  const progressText = (r: RunRow): string => {
    if (r.state === 'queued') return 'Queued — starting shortly';
    const base = r.kind === 'deep_pass' ? r.phase_search_base ?? 0 : 0;
    const parts = [
      r.kind === 'deep_pass' && r.pass_phase
        ? PASS_PHASE_LABEL[r.pass_phase]
        : r.phase === 'researching' ? 'Researching' : r.phase === 'complete' ? 'Writing report' : 'Working',
      `step ${r.iteration + 1}`,
      `${r.client_tool_calls} data ${r.client_tool_calls === 1 ? 'query' : 'queries'}`,
    ];
    // Code-only deep pass phases have no search budget of their own.
    if (r.search_budget - base > 0) parts.push(`${r.web_search_requests - base}/${r.search_budget - base} web searches`);
    if (r.attempts > 1) parts.push(`retry ${r.attempts - 1}`);
    return parts.join(' · ');
  };

  return (
    <div className="text-sm">
      {error && (
        <div
          className="mb-2 px-2 py-1.5 rounded text-xs border"
          style={{ borderColor: TERRACOTTA, color: TERRACOTTA, backgroundColor: '#FFF7F0' }}
        >
          {error}
        </div>
      )}

      {/* ---- thread list ---- */}
      {!openThreadId && (
        <>
          {threads === null ? (
            <div className="text-xs" style={{ color: SLATE }}>Loading…</div>
          ) : threads.length === 0 ? (
            <div className="text-xs mb-2" style={{ color: STEEL }}>
              No site story yet. Starting one makes the archetype call and writes an executive summary
              from this site's frozen snapshot. It runs in the background — you can close this panel.
            </div>
          ) : (
            <div className="space-y-1.5 mb-2">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setOpenThreadId(t.id)}
                  className="w-full text-left px-2 py-1.5 rounded border hover:opacity-80 transition-opacity"
                  style={{ borderColor: SLATE, backgroundColor: '#FFFFFF' }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 font-medium text-xs" style={{ color: NAVY }}>
                      {t.archetype_primary ? ARCHETYPE_LABEL[t.archetype_primary] : isLive(t.state) ? 'In progress' : 'Not called'}
                      {t.archetype_secondary && (
                        <span style={{ color: STEEL }}> / {ARCHETYPE_LABEL[t.archetype_secondary]}</span>
                      )}
                      <StatusBadge state={t.state} />
                    </span>
                    <span className="text-[11px]" style={{ color: SLATE }}>
                      {formatTimestamp(t.created_at)}
                    </span>
                  </div>
                  {t.story_carriers.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.story_carriers.map((c, i) => (
                        <span
                          key={i}
                          className="px-1.5 py-0.5 rounded text-[11px]"
                          style={{ backgroundColor: '#F8FAFC', color: STEEL, border: `1px solid ${SLATE}` }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleStart}
            disabled={starting}
            className="px-3 py-1.5 rounded text-xs font-medium disabled:opacity-60"
            style={{ backgroundColor: NAVY, color: '#FFFFFF' }}
          >
            {starting ? 'Starting…' : threads && threads.length > 0 ? 'New site story' : 'Start site story'}
          </button>
        </>
      )}

      {/* ---- open thread ---- */}
      {openThreadId && (
        <>
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => setOpenThreadId(null)}
              className="text-xs hover:underline"
              style={{ color: STEEL }}
            >
              ← All site stories
            </button>
            {openThread?.pinned_context?.site?.coordinate_source && (
              <span className="text-[11px]" style={{ color: SLATE }}>
                coords: {openThread.pinned_context.site.coordinate_source}
              </span>
            )}
          </div>

          {openThread && (openThread.archetype_primary || openThread.story_carriers.length > 0) && (
            <div className="mb-2 px-2 py-1.5 rounded" style={{ backgroundColor: '#F8FAFC' }}>
              <div className="text-xs font-semibold" style={{ color: NAVY }}>
                {openThread.archetype_primary ? ARCHETYPE_LABEL[openThread.archetype_primary] : 'Archetype not called'}
                {openThread.archetype_secondary && (
                  <span style={{ color: STEEL }}> / {ARCHETYPE_LABEL[openThread.archetype_secondary]}</span>
                )}
              </div>
              {openThread.story_carriers.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {openThread.story_carriers.map((c, i) => (
                    <li key={i} className="text-[11px]" style={{ color: STEEL }}>• {c}</li>
                  ))}
                </ul>
              )}
              {openThread.archetype_primary && (
                <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={handleBrief}
                  disabled={writingBrief || runIsLive}
                  className="mt-1.5 mr-1.5 px-2 py-0.5 rounded text-[11px] font-medium disabled:opacity-60"
                  style={{ backgroundColor: 'transparent', color: NAVY, border: `1px solid ${NAVY}` }}
                  title="Write the under-200-word brief from the finished record. No research, no searches."
                >
                  {writingBrief ? 'Writing brief…' : openThread.brief_text ? 'Rewrite brief' : 'Write brief'}
                </button>
                <button
                  type="button"
                  onClick={handleDeepPass}
                  disabled={startingDeepPass || runIsLive}
                  className="mt-1.5 px-2 py-0.5 rounded text-[11px] font-medium disabled:opacity-60"
                  style={{ backgroundColor: 'transparent', color: NAVY, border: `1px solid ${NAVY}` }}
                  title="Step 2: school fill-in, deep research on the story carriers, executive summary, CSV exports"
                >
                  {startingDeepPass ? 'Starting…' : 'Run deep pass'}
                </button>
                </div>
              )}
            </div>
          )}

          {/* The brief is what gets read first; the record below it stays collapsed. */}
          {openThread?.brief_text && (
            <div className="mb-2 px-2 py-2 rounded border" style={{ borderColor: NAVY, backgroundColor: '#FFFFFF' }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: NAVY }}>Brief</span>
                <span className="text-[11px]" style={{ color: SLATE }}>
                  {openThread.brief_generated_at ? formatTimestamp(openThread.brief_generated_at) : ''}
                </span>
              </div>
              <div className="text-xs whitespace-pre-wrap break-words" style={{ color: '#1f2937' }}>{openThread.brief_text}</div>
              <button
                type="button"
                onClick={handleBrief}
                disabled={writingBrief || runIsLive}
                className="mt-1.5 text-[11px] hover:underline disabled:opacity-60"
                style={{ color: STEEL }}
              >
                {writingBrief ? 'Rewriting…' : 'Rewrite brief from this record'}
              </button>
            </div>
          )}

          {/* No inner scroll box — the DATA tab is a single scroll container. */}
          <div className="space-y-2 mb-2">
            {loadingMessages && messages.length === 0 ? (
              <div className="text-xs" style={{ color: SLATE }}>Loading…</div>
            ) : (
              messages.map((m) => {
                const sections = isRecordMessage(m) ? splitRecordSections(m.content) : [];
                if (sections.length > 0) {
                  // The record: collapsed by default, expandable one section at a time.
                  return (
                    <div key={m.id} className="rounded border" style={{ borderColor: SLATE, backgroundColor: '#FFFFFF' }}>
                      <div className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wide" style={{ color: STEEL, backgroundColor: '#F8FAFC' }}>
                        Record · {formatTimestamp(m.created_at)}
                      </div>
                      {sections.map((sec) => {
                        const key = `${m.id}:${sec.heading}`;
                        const open = !!openSections[key];
                        return (
                          <div key={key} className="border-t" style={{ borderColor: '#E2E8F0' }}>
                            <button
                              type="button"
                              onClick={() => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))}
                              className="w-full flex items-center justify-between px-2 py-1.5 text-left hover:opacity-80"
                            >
                              <span className="text-[11px] font-medium" style={{ color: NAVY }}>{sec.heading}</span>
                              <span className="text-[11px]" style={{ color: SLATE }}>{open ? '−' : '+'}</span>
                            </button>
                            {open && (
                              <div className="px-2 pb-2 text-xs whitespace-pre-wrap break-words" style={{ color: '#1f2937' }}>
                                {sec.body}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                }
                return (
                  <div key={m.id} className={m.role === 'user' ? 'flex justify-end' : ''}>
                    <div
                      className="px-2 py-1.5 rounded max-w-[92%]"
                      style={
                        m.role === 'user'
                          ? { backgroundColor: NAVY, color: '#FFFFFF' }
                          : { backgroundColor: '#FFFFFF', border: `1px solid ${SLATE}`, color: '#1f2937' }
                      }
                    >
                      <div className="text-xs whitespace-pre-wrap break-words">{m.content}</div>
                    </div>
                  </div>
                );
              })
            )}

            {/* ---- run status ---- */}
            {run && runIsLive && (
              <div className="px-2 py-1.5 rounded border flex items-center gap-2" style={{ borderColor: STEEL, backgroundColor: '#EEF3FA' }}>
                <div className="animate-spin rounded-full h-3 w-3 border-b-2" style={{ borderColor: NAVY }} />
                <div className="text-[11px]" style={{ color: NAVY }}>
                  {progressText(run)}
                  <span style={{ color: STEEL }}> · {formatElapsed(run.started_at ?? run.created_at, nowMs)}</span>
                </div>
              </div>
            )}
            {run && run.state === 'failed' && (
              <div className="px-2 py-1.5 rounded border" style={{ borderColor: TERRACOTTA, backgroundColor: '#FFF7F0' }}>
                <div className="text-[11px] font-medium" style={{ color: TERRACOTTA }}>
                  {run.kind === 'archetype'
                    ? 'The site story failed before the report was written.'
                    : run.kind === 'deep_pass'
                      ? 'The deep pass failed. Retry restarts it from the beginning.'
                      : 'This reply failed.'}
                </div>
                {run.error && (
                  <div className="text-[11px] mt-0.5 break-words" style={{ color: TERRACOTTA }}>{run.error}</div>
                )}
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={retrying}
                  className="mt-1 px-2 py-0.5 rounded text-[11px] font-medium disabled:opacity-60"
                  style={{ backgroundColor: NAVY, color: '#FFFFFF' }}
                >
                  {retrying ? 'Retrying…' : 'Retry'}
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Ask the record: answered from what is stored, with the section cited. No research. */}
          {openThread?.brief_text && (
            <div className="flex gap-1.5 mb-1.5">
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAsk(); } }}
                placeholder={runIsLive ? 'Wait for the current run to finish…' : 'Ask the record a question…'}
                disabled={asking || runIsLive}
                className="flex-1 px-2 py-1.5 text-xs border rounded disabled:opacity-60"
                style={{ borderColor: SLATE }}
              />
              <button
                type="button"
                onClick={handleAsk}
                disabled={asking || runIsLive || !question.trim()}
                className="px-3 rounded text-xs font-medium disabled:opacity-60"
                style={{ backgroundColor: 'transparent', color: NAVY, border: `1px solid ${NAVY}` }}
              >
                {asking ? '…' : 'Ask'}
              </button>
            </div>
          )}

          <div className="flex gap-1.5">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder={runIsLive ? 'Wait for the current run to finish…' : 'Ask a follow-up…'}
              disabled={sending || runIsLive}
              className="flex-1 px-2 py-1.5 text-xs border rounded resize-none disabled:opacity-60"
              style={{ borderColor: SLATE }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || runIsLive || !draft.trim()}
              className="px-3 rounded text-xs font-medium disabled:opacity-60"
              style={{ backgroundColor: NAVY, color: '#FFFFFF' }}
            >
              {sending ? '…' : 'Send'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
