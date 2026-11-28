import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { BRAND } from '../../lib/packageTracker';
import { chatStamp } from '../../lib/taskChat';
import {
  PackageComment, PackageSlideRef, fetchPackageComments, fetchPackageSlideRefs, markPackageRead, postPackageComment,
} from '../../lib/packageChat';

// Package chat side panel: one thread per package, each message tagged to a slide
// or "General". Opened from the card (whole thread) or from a slide row (filtered
// to that slide, composer pre-tagged). Takes ids, not a route, so it can sit beside
// any page or slideout (docs/OVIS_OVERLAY_UX.md). Writes only to package_comment —
// never to site_submit_comment — so it can't move a board clock or reach the portal.

interface PackageChatPanelProps {
  packageId: string | null;
  slideId: string | null;           // null = whole thread
  title?: string;
  subtitle?: string;
  currentUserId: string | null;
  names: Record<string, string>;    // user.id → display name
  onClose: () => void;
  onFilter: (slideId: string | null) => void;
  onRead?: (packageId: string, slideId: string | null) => void;
}

export function PackageChatPanel({ packageId, slideId, title, subtitle, currentUserId, names, onClose, onFilter, onRead }: PackageChatPanelProps) {
  const [messages, setMessages] = useState<PackageComment[]>([]);
  const [slides, setSlides] = useState<PackageSlideRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [tag, setTag] = useState<string>('');  // '' = General
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const viewRef = useRef<string | null>(slideId);
  viewRef.current = slideId;

  const labelOf = useMemo(() => Object.fromEntries(slides.map((s) => [s.id, s.label])), [slides]);

  // Load + live updates for the package.
  useEffect(() => {
    if (!packageId) return;
    let cancelled = false;
    setLoading(true);
    setMessages([]);
    setErr(null);
    Promise.all([fetchPackageComments(packageId), fetchPackageSlideRefs(packageId)])
      .then(([rows, sl]) => { if (!cancelled) { setMessages(rows); setSlides(sl); } })
      .catch((e) => { if (!cancelled) setErr(e?.message ?? 'Could not load the chat'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    const channel = supabase
      .channel(`package-comment-${packageId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'package_comment', filter: `package_id=eq.${packageId}` },
        (payload) => {
          const row = payload.new as PackageComment;
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
          // Seen if it's in the current view.
          const view = viewRef.current;
          if (currentUserId && (view === null || view === row.slide_id)) {
            markPackageRead(packageId, view, currentUserId).then(() => onRead?.(packageId, view)).catch(() => {});
          }
        })
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId, currentUserId]);

  // Opening a view (whole thread or one slide) marks it read and pre-tags the composer.
  useEffect(() => {
    if (!packageId) return;
    setTag(slideId ?? '');
    if (currentUserId) markPackageRead(packageId, slideId, currentUserId).then(() => onRead?.(packageId, slideId)).catch(() => {});
    setTimeout(() => inputRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packageId, slideId, currentUserId]);

  const shown = slideId ? messages.filter((m) => m.slide_id === slideId) : messages;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [shown.length, slideId]);

  useEffect(() => {
    if (!packageId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [packageId, onClose]);

  const send = async () => {
    if (!packageId || !draft.trim() || sending) return;
    setSending(true);
    try {
      const row = await postPackageComment(packageId, tag || null, draft);
      setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]));
      setDraft('');
      setErr(null);
    } catch (e: any) {
      setErr(e?.message ?? 'Could not send');
    } finally {
      setSending(false);
    }
  };

  if (!packageId) return null;
  const selectStyle = { border: `1px solid ${BRAND.slate}`, color: BRAND.navy };

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full sm:w-[440px] flex-col bg-white shadow-2xl"
         style={{ borderLeft: `1px solid ${BRAND.slate}` }} role="dialog" aria-label="Package chat">
      <div className="flex items-start justify-between gap-3 px-5 py-4" style={{ backgroundColor: BRAND.navy }}>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide" style={{ color: BRAND.slate }}>Package chat</div>
          <div className="truncate text-base font-semibold text-white">{title || 'Package'}</div>
          {subtitle && <div className="truncate text-sm" style={{ color: BRAND.slate }}>{subtitle}</div>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close chat"
                className="rounded px-2 py-1 text-lg leading-none text-white hover:bg-white/10">×</button>
      </div>

      <div className="flex items-center gap-2 px-5 py-2 text-xs" style={{ backgroundColor: BRAND.page, color: BRAND.steel }}>
        <span>Show</span>
        <select value={slideId ?? ''} onChange={(e) => onFilter(e.target.value || null)}
                className="rounded bg-white px-1.5 py-0.5 text-xs" style={selectStyle} aria-label="Filter by slide">
          <option value="">Whole thread</option>
          {slides.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <span className="ml-auto truncate" title="Not posted to the deal or property chat, and it doesn’t touch the board clock.">
          Team only · no board clock
        </span>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {loading && <div className="text-sm" style={{ color: BRAND.steel }}>Loading…</div>}
        {!loading && shown.length === 0 && (
          <div className="pt-8 text-center text-sm" style={{ color: BRAND.slate }}>
            {slideId ? `No messages on ${labelOf[slideId] ?? 'this slide'} yet.` : 'No messages yet. Start the thread below.'}
          </div>
        )}
        {shown.map((m) => {
          const mine = m.author_id === currentUserId;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
              <div className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: BRAND.steel }}>
                <span className="font-semibold" style={{ color: BRAND.navy }}>{mine ? 'You' : names[m.author_id] || 'Someone'}</span>
                <span>· {chatStamp(m.created_at)}</span>
                <span className="rounded-full px-1.5" style={{ border: `1px solid ${BRAND.slate}`, color: BRAND.steel }}>
                  {m.slide_id ? labelOf[m.slide_id] ?? 'Slide' : 'General'}
                </span>
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
        <div className="mb-1.5 flex items-center gap-2 text-xs" style={{ color: BRAND.steel }}>
          <span>About</span>
          <select value={tag} onChange={(e) => setTag(e.target.value)}
                  className="rounded bg-white px-1.5 py-0.5 text-xs" style={selectStyle} aria-label="Slide this message is about">
            <option value="">General</option>
            {slides.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>
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
