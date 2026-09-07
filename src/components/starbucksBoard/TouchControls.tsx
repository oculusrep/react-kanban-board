// Starbucks Deal Board — shared "Log a note" + "Set next action" controls.
// Both writes cool the tile (the reset trigger on note_object_link / task) and
// clear seeded_fallback. Extracted from the slide-over so the triage queue has
// the same ability to record a note / next action while classifying a deal.
// onSaved fires after a successful write so the parent can refresh its own read
// views (the slide-over's "Recent notes", triage's "History") and the board.

import { useCallback, useEffect, useState } from 'react';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO, format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { getCategoryIdByName } from '../../lib/taskCategory';
import { insertDealNote } from '../../lib/boardWrites';
import { BoardDeal, CONDENSED_STACK, PALETTE } from '../../lib/starbucksBoard';

interface TaskRow { id: string; subject: string | null; due_at: string | null; }

export default function TouchControls({
  deal,
  px,
  onSaved,
}: {
  deal: BoardDeal;
  px: (n: number) => number;
  onSaved?: () => void; // after a successful note/task write (refresh reads + board)
}) {
  const { userTableId } = useAuth();

  const [openTask, setOpenTask] = useState<TaskRow | null>(null);
  const [noteBody, setNoteBody] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const loadOpenTask = useCallback(async () => {
    try {
      const { data } = await supabase
        .from('task')
        .select('id, subject, due_at')
        .eq('deal_id', deal.id)
        .in('status', ['open', 'in_progress'])
        .order('due_at', { ascending: true, nullsFirst: false })
        .limit(1);
      setOpenTask(((data as TaskRow[]) ?? [])[0] ?? null);
    } catch (e) {
      console.error('TouchControls.loadOpenTask', e);
    }
  }, [deal.id]);

  // Reset inputs and reload the current open action when the deal changes.
  useEffect(() => {
    setNoteBody('');
    setTaskSubject('');
    setTaskDue('');
    setErr(null);
    loadOpenTask();
  }, [deal.id, loadOpenTask]);

  async function saveNote() {
    const body = noteBody.trim();
    if (!body) return;
    setSaving(true);
    setErr(null);
    try {
      await insertDealNote(deal.id, body);
      setNoteBody('');
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to log note');
    } finally {
      setSaving(false);
    }
  }

  async function saveTask() {
    const subject = taskSubject.trim();
    if (!subject) return;
    setSaving(true);
    setErr(null);
    try {
      const categoryId = await getCategoryIdByName('other');
      const { error } = await supabase.from('task').insert({
        subject,
        category: 'other',
        category_id: categoryId,
        owner_id: userTableId,
        created_by_id: userTableId,
        deal_id: deal.id,
        status: 'open',
        is_inbox: true,
        due_at: taskDue ? new Date(`${taskDue}T00:00:00`).toISOString() : null,
      });
      if (error) throw error;
      setTaskSubject('');
      setTaskDue('');
      await loadOpenTask();
      onSaved?.();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to set next action');
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = {
    backgroundColor: PALETTE.ground, color: PALETTE.text,
    border: `1px solid ${PALETTE.ground}`, fontSize: px(15), fontFamily: CONDENSED_STACK,
  } as const;

  return (
    <div className="flex flex-col gap-5">
      {err && <div style={{ color: PALETTE.hot, fontSize: px(14) }}>{err}</div>}

      <div>
        <div className="uppercase tracking-wider" style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>Log a note</div>
        <textarea
          value={noteBody}
          onChange={(e) => setNoteBody(e.target.value)}
          placeholder="What happened? (cools the tile)"
          rows={3}
          className="w-full rounded px-2 py-1.5"
          style={{ ...inputStyle, resize: 'vertical' }}
        />
        <button
          onClick={saveNote}
          disabled={saving || !noteBody.trim()}
          className="mt-2 rounded px-3 py-1.5"
          style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.text, fontSize: px(14), opacity: saving || !noteBody.trim() ? 0.5 : 1 }}
        >
          Log note
        </button>
      </div>

      <div>
        <div className="uppercase tracking-wider" style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>Set next action</div>
        {openTask && (
          <div style={{ fontSize: px(13), color: PALETTE.textDim, marginBottom: 6 }}>
            Current: {openTask.subject}{openTask.due_at ? ` · due ${new Date(openTask.due_at).toLocaleDateString()}` : ''}
          </div>
        )}
        <input value={taskSubject} onChange={(e) => setTaskSubject(e.target.value)} placeholder="Next action…" className="w-full rounded px-2 py-1.5" style={inputStyle} />
        <div className="mt-2 flex flex-wrap items-center gap-2" style={{ fontSize: px(15) }}>
          {/* OVIS-standard react-datepicker calendar; input styled for the dark panel */}
          <DatePicker
            selected={taskDue ? parseISO(taskDue) : null}
            onChange={(d) => setTaskDue(d ? format(d, 'yyyy-MM-dd') : '')}
            dateFormat="MM/dd/yyyy"
            placeholderText="Pick a date"
            isClearable
            popperProps={{ strategy: 'fixed' }}
            className="rounded px-2 py-1.5 bg-[#12161C] text-[#E8EDF3] border border-[#12161C] w-[130px]"
          />
          {[3, 7, 10].map((n) => (
            <button
              key={n}
              onClick={() => setTaskDue(addDaysLocal(n))}
              className="rounded px-2 py-1"
              style={{
                fontSize: px(13),
                border: `1px solid ${taskDue === addDaysLocal(n) ? PALETTE.text : PALETTE.textDim}`,
                color: taskDue === addDaysLocal(n) ? PALETTE.text : PALETTE.textDim,
              }}
            >
              +{n}d
            </button>
          ))}
          <button
            onClick={saveTask}
            disabled={saving || !taskSubject.trim()}
            className="rounded px-3 py-1.5"
            style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.text, fontSize: px(14), opacity: saving || !taskSubject.trim() ? 0.5 : 1 }}
          >
            Set action
          </button>
        </div>
      </div>
    </div>
  );
}

// today + n days as a local YYYY-MM-DD (CLAUDE.md: local date, not UTC)
function addDaysLocal(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
