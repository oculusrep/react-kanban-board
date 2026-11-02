import { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BRAND } from '../../lib/packageTracker';
import { TaskComment, chatStamp, fetchTaskComments, markTaskRead, postTaskComment } from '../../lib/taskChat';

// Task chat side panel. Takes a task id, not a route, so it can sit beside any
// page or slideout (docs/OVIS_OVERLAY_UX.md). Looks like the deal / property chat
// but writes only to task_comment — never to site_submit_comment — so a message
// here can't move a board clock or reach the client portal.

interface TaskChatPanelProps {
  taskId: string | null;
  title?: string;
  subtitle?: string;
  currentUserId: string | null;
  names: Record<string, string>; // user.id → display name
  onClose: () => void;
  onRead?: (taskId: string) => void;
}

export function TaskChatPanel({ taskId, title, subtitle, currentUserId, names, onClose, onRead }: TaskChatPanelProps) {
  const [messages, setMessages] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Load + live updates. Opening (and every new message while open) marks the thread read.
  useEffect(() => {
    if (!taskId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setErr(null);
    fetchTaskComments(taskId)
      .then((rows) => { if (!cancelled) setMessages(rows); })
      .catch((e) => { if (!cancelled) setErr(e?.message ?? 'Could not load the chat'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const read = () => {
      if (!currentUserId) return;
      markTaskRead(taskId, currentUserId).then(() => onRead?.(taskId)).catch(() => {});
    };
    read();

    const channel = supabase
      .channel(`task-comment-${taskId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_comment', filter: `task_id=eq.${taskId}` },
        (payload) => {
          const row = payload.new as TaskComment;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          read();
        })
      .subscribe();
    setTimeout(() => inputRef.current?.focus(), 50);
    return () => { cancelled = true; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, currentUserId]);

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [messages.length]);

  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [taskId, onClose]);

  const send = async () => {
    if (!taskId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const row = await postTaskComment(taskId, draft);
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      setDraft('');
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not send');
    } finally {
      setSending(false);
    }
  };

  if (!taskId) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full sm:w-[440px] flex-col bg-white shadow-2xl"
         style={{ borderLeft: `1px solid ${BRAND.slate}` }} role="dialog" aria-label="Task chat">
      <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ backgroundColor: BRAND.navy }}>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Task chat</div>
          <div className="truncate text-base font-semibold text-white">{title || 'Task'}</div>
          {subtitle && <div className="truncate text-sm" style={{ color: BRAND.slate }}>{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close chat"
                className="rounded px-2 py-1 text-lg leading-none text-white hover:bg-white/10">×</button>
      </div>

      <div className="px-5 py-2 text-xs" style={{ backgroundColor: BRAND.page, color: BRAND.steel, borderBottom: `1px solid ${BRAND.page}` }}>
        Between you and the team only — not posted to the deal or property chat, and it doesn’t touch the board clock.
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
        {loading && <div className="text-sm" style={{ color: BRAND.steel }}>Loading…</div>}
        {!loading && messages.length === 0 && (
          <div className="pt-8 text-center text-sm" style={{ color: BRAND.slate }}>No messages yet. Start the thread below.</div>
        )}
        {messages.map((m) => {
          const mine = m.author_id === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="mb-1 text-xs" style={{ color: BRAND.steel }}>
                <span className="font-semibold" style={{ color: BRAND.navy }}>{mine ? 'You' : names[m.author_id] || 'Someone'}</span>
                {' · '}{chatStamp(m.created_at)}
              </div>
              <div className="max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm"
                   style={mine
                     ? { backgroundColor: BRAND.navy, color: '#FFFFFF' }
                     : { backgroundColor: '#FFFFFF', color: BRAND.navy, border: `1px solid ${BRAND.slate}` }}>
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="px-5 py-3" style={{ borderTop: `1px solid ${BRAND.slate}` }}>
        {err && <div className="mb-2 text-xs" style={{ color: BRAND.terracotta }}>{err}</div>}
        <textarea
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          rows={3}
          placeholder="Write a message…  (Enter to send, Shift+Enter for a new line)"
          className="w-full resize-none rounded px-3 py-2 text-sm focus:outline-none"
          style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.navy }}
        />
        <div className="mt-2 flex justify-end">
          <button type="button" onClick={send} disabled={sending || !draft.trim()}
                  className="rounded px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND.navy }}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
