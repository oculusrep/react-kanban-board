/**
 * SiteStoryPanel — the site research thread (Phase 1).
 *
 * A chat thread on a site submit that produces the archetype call and an
 * executive summary. Lives as a collapsible section inside the DATA tab of
 * SiteSubmitSidebar, NOT as a sixth tab — the tab strip is already full at 500px
 * (see feedback_slideout_tab_overflow).
 *
 * Reads research_thread / research_thread_message directly (RLS allows SELECT to
 * authenticated). Writes go exclusively through the ovis-site-research edge
 * function, which re-checks the Starbucks + permission gate server-side.
 *
 * No realtime in Phase 1: turns are synchronous request/response, not long runs.
 * If a turn ever exceeds the edge function's wall clock, switch to writing
 * messages as they land and subscribe via postgres_changes, the way
 * PortalChatTab does.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// OVIS brand palette.
const NAVY = '#002147';
const STEEL = '#4A6B94';
const SLATE = '#8FA9C8';
const TERRACOTTA = '#A27B5C';

export type Archetype = 'GROWTH' | 'MATURE' | 'REDEVELOPMENT' | 'RELIEF' | 'WHITE_SPACE';

const ARCHETYPE_LABEL: Record<Archetype, string> = {
  GROWTH: 'Growth',
  MATURE: 'Mature',
  REDEVELOPMENT: 'Redevelopment',
  RELIEF: 'Relief',
  WHITE_SPACE: 'White space',
};

interface ThreadRow {
  id: string;
  archetype_primary: Archetype | null;
  archetype_secondary: Archetype | null;
  story_carriers: string[];
  state: 'active' | 'archived' | 'failed';
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
 * supabase.functions.invoke surfaces a non-2xx as an opaque FunctionsHttpError;
 * the useful text is in the JSON body, which has to be read off the response.
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

export default function SiteStoryPanel({ siteSubmitId, refreshTrigger = 0 }: SiteStoryPanelProps) {
  const [threads, setThreads] = useState<ThreadRow[] | null>(null);
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ---- thread list ----
  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error: err } = await supabase
        .from('research_thread')
        .select('id, archetype_primary, archetype_secondary, story_carriers, state, created_at, pinned_context')
        .eq('site_submit_id', siteSubmitId)
        .order('created_at', { ascending: false });
      if (cancelled) return;
      if (err) {
        setError(err.message);
        setThreads([]);
        return;
      }
      setThreads((data ?? []) as unknown as ThreadRow[]);
    }
    load();
    return () => { cancelled = true; };
  }, [siteSubmitId, refreshTrigger, localRefresh]);

  // ---- messages for the open thread ----
  const loadMessages = useCallback(async (threadId: string) => {
    setLoadingMessages(true);
    try {
      const { data, error: err } = await supabase
        .from('research_thread_message')
        .select('id, seq, role, content, cost_usd, created_at')
        .eq('thread_id', threadId)
        .order('seq', { ascending: true });
      if (err) throw err;
      setMessages((data ?? []) as unknown as MessageRow[]);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    if (!openThreadId) {
      setMessages([]);
      return;
    }
    loadMessages(openThreadId);
  }, [openThreadId, loadMessages]);

  // Scroll to the newest turn only when the thread GROWS, never on first load.
  // The messages now live in the DATA tab's own scroll container, so an
  // unconditional scrollIntoView would yank the whole tab down past the deal
  // details the moment a thread is opened. After you send a turn, following the
  // reply down is the right behaviour.
  const prevCountRef = useRef(0);
  useEffect(() => {
    if (prevCountRef.current > 0 && messages.length > prevCountRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    prevCountRef.current = messages.length;
  }, [messages]);

  const handleStart = async () => {
    setError(null);
    setStarting(true);
    try {
      const { data, error: err } = await supabase.functions.invoke('ovis-site-research', {
        body: { action: 'create_thread', site_submit_id: siteSubmitId },
      });
      if (err) throw new Error(await extractInvokeError(err));
      const threadId = (data as { thread_id?: string })?.thread_id;
      if (!threadId) throw new Error('Thread was created but no id came back.');
      // A message that stored but did not parse is not a failure — the text is
      // there, the columns just stay empty. Say so rather than hiding it.
      if ((data as { parsed?: boolean })?.parsed === false) {
        setError('Summary saved, but the archetype block could not be parsed — the call was left unset.');
      }
      setLocalRefresh((n) => n + 1);
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
      const { error: err } = await supabase.functions.invoke('ovis-site-research', {
        body: { action: 'send_turn', thread_id: openThreadId, message: text },
      });
      if (err) throw new Error(await extractInvokeError(err));
      setDraft('');
      await loadMessages(openThreadId);
      setLocalRefresh((n) => n + 1);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSending(false);
    }
  };

  const openThread = threads?.find((t) => t.id === openThreadId) ?? null;

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
              from this site's frozen snapshot.
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
                    <span className="font-medium text-xs" style={{ color: NAVY }}>
                      {t.archetype_primary ? ARCHETYPE_LABEL[t.archetype_primary] : 'Not called'}
                      {t.archetype_secondary && (
                        <span style={{ color: STEEL }}> / {ARCHETYPE_LABEL[t.archetype_secondary]}</span>
                      )}
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
                  {t.state === 'failed' && (
                    <div className="mt-1 text-[11px]" style={{ color: '#8B0000' }}>
                      Failed before the summary was written
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
            {starting ? 'Working… (up to a minute)' : threads && threads.length > 0 ? 'New site story' : 'Start site story'}
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

          {openThread && (
            <div className="mb-2 px-2 py-1.5 rounded" style={{ backgroundColor: '#F8FAFC' }}>
              <div className="text-xs font-semibold" style={{ color: NAVY }}>
                {openThread.archetype_primary
                  ? ARCHETYPE_LABEL[openThread.archetype_primary]
                  : 'Archetype not called'}
                {openThread.archetype_secondary && (
                  <span style={{ color: STEEL }}>
                    {' '}/ {ARCHETYPE_LABEL[openThread.archetype_secondary]}
                  </span>
                )}
              </div>
              {openThread.story_carriers.length > 0 && (
                <ul className="mt-1 space-y-0.5">
                  {openThread.story_carriers.map((c, i) => (
                    <li key={i} className="text-[11px]" style={{ color: STEEL }}>• {c}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* No inner scroll box. The DATA tab is a single scroll container, so
              a nested max-height scroller here would trap a long summary in a
              320px window inside an already-scrolling panel — two scrollbars,
              and the composer below it hard to reach. Let the messages flow. */}
          <div className="space-y-2 mb-2">
            {loadingMessages && messages.length === 0 ? (
              <div className="text-xs" style={{ color: SLATE }}>Loading…</div>
            ) : (
              messages.map((m) => (
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
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

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
              placeholder="Ask a follow-up…"
              disabled={sending}
              className="flex-1 px-2 py-1.5 text-xs border rounded resize-none disabled:opacity-60"
              style={{ borderColor: SLATE }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={sending || !draft.trim()}
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
