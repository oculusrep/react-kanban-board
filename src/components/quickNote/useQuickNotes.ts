import { useCallback, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

// Personal quick-capture list. RLS scopes every query to auth.uid(), so no
// user filter is needed client-side. Rows past expires_at are hidden here but
// never deleted (see supabase/migrations/20260917083811_quick_note.sql).

export interface QuickNote {
  id: string;
  text: string;
  deal_id: string | null;
  sort_order: number;
  done: boolean;
  created_at: string;
  expires_at: string;
  deal: { deal_name: string | null } | null;
  /** True while an optimistic insert is in flight. */
  pending?: boolean;
}

const SELECT = 'id, text, deal_id, sort_order, done, created_at, expires_at, deal:deal_id(deal_name)';

const bySortOrder = (a: QuickNote, b: QuickNote) => a.sort_order - b.sort_order;

export function useQuickNotes() {
  const [notes, setNotes] = useState<QuickNote[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mirror of `notes` so rapid back-to-back submits each compute a sort_order
  // above the previous one without waiting for a re-render.
  const notesRef = useRef<QuickNote[]>([]);

  const commit = useCallback((next: QuickNote[]) => {
    notesRef.current = next;
    setNotes(next);
  }, []);

  const refetch = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('quick_note')
      .select(SELECT)
      .gt('expires_at', new Date().toISOString())
      .order('sort_order', { ascending: true });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setError(null);
    // Keep any optimistic rows that haven't landed yet.
    const pending = notesRef.current.filter((n) => n.pending);
    commit([...pending, ...((data ?? []) as unknown as QuickNote[])].sort(bySortOrder));
  }, [commit]);

  const addNote = useCallback(
    async (text: string, dealId: string | null, dealName: string | null) => {
      const current = notesRef.current;
      // Newest at top: go above the current first row, and never below the
      // DB default (-epoch seconds) so ordering stays sane across sessions.
      const top = current.length ? current[0].sort_order - 1 : Infinity;
      const sortOrder = Math.min(top, -Date.now() / 1000);
      const tempId = `pending-${crypto.randomUUID()}`;
      const now = new Date();
      const optimistic: QuickNote = {
        id: tempId,
        text,
        deal_id: dealId,
        sort_order: sortOrder,
        done: false,
        created_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        deal: dealId ? { deal_name: dealName } : null,
        pending: true,
      };
      commit([optimistic, ...current]);

      const { data, error: err } = await supabase
        .from('quick_note')
        .insert({ text, deal_id: dealId, sort_order: sortOrder })
        .select(SELECT)
        .single();

      if (err || !data) {
        setError(err?.message ?? 'Could not save note');
        commit(notesRef.current.filter((n) => n.id !== tempId));
        return;
      }
      setError(null);
      commit(notesRef.current.map((n) => (n.id === tempId ? (data as unknown as QuickNote) : n)));
    },
    [commit],
  );

  const toggleDone = useCallback(
    async (id: string) => {
      const note = notesRef.current.find((n) => n.id === id);
      if (!note || note.pending) return;
      const done = !note.done;
      commit(notesRef.current.map((n) => (n.id === id ? { ...n, done } : n)));
      const { error: err } = await supabase.from('quick_note').update({ done }).eq('id', id);
      if (err) {
        setError(err.message);
        commit(notesRef.current.map((n) => (n.id === id ? { ...n, done: !done } : n)));
      }
    },
    [commit],
  );

  /**
   * Move the note at `from` to `to`, both indices into `visible` (the
   * sub-list the drag happened in, e.g. open notes only). Neighbours for the
   * new sort_order come from that sub-list; notes outside it keep theirs.
   */
  const reorder = useCallback(
    async (visible: QuickNote[], from: number, to: number) => {
      if (from === to) return;
      const list = [...visible];
      const [moved] = list.splice(from, 1);
      if (!moved || moved.pending) return;
      list.splice(to, 0, moved);

      const prev = list[to - 1];
      const next = list[to + 1];
      let sortOrder: number;
      if (prev && next) sortOrder = (prev.sort_order + next.sort_order) / 2;
      else if (prev) sortOrder = prev.sort_order + 1;
      else if (next) sortOrder = next.sort_order - 1;
      else return;

      const previous = notesRef.current;
      commit(
        previous.map((n) => (n.id === moved.id ? { ...n, sort_order: sortOrder } : n)).sort(bySortOrder),
      );

      const { error: err } = await supabase
        .from('quick_note')
        .update({ sort_order: sortOrder })
        .eq('id', moved.id);
      if (err) {
        setError(err.message);
        commit(previous);
      }
    },
    [commit],
  );

  return { notes, loading, error, refetch, addNote, toggleDone, reorder };
}
