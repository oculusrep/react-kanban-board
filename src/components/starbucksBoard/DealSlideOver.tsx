// Starbucks Deal Board — slide-over panel (spec §7).
// Click a tile → this slides in from the right over a dimmed board. Classify
// (court + blocker) via the shared ClassifyControls, Log a note, Set next
// action. Dark; type sizes scale with the board's A-/A+ control (`scale`).

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO, format } from 'date-fns';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { getCategoryIdByName } from '../../lib/taskCategory';
import { insertDealNote } from '../../lib/boardWrites';
import {
  BoardDeal,
  CONDENSED_STACK,
  courtLabel,
  instruction,
  PALETTE,
} from '../../lib/starbucksBoard';
import ClassifyControls from './ClassifyControls';
import KillPassAction from './KillPassAction';
import ParkControl from './ParkControl';
import UrgentToggle from './UrgentToggle';

interface NoteRow { id: string; title: string | null; body: string | null; created_at: string | null; }
interface TaskRow { id: string; subject: string | null; due_at: string | null; }

export default function DealSlideOver({
  deal,
  scale,
  onClose,
  onChanged,
}: {
  deal: BoardDeal;
  scale: number;
  onClose: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { userTableId } = useAuth();
  const px = (n: number) => Math.round(n * scale);

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [noteBody, setNoteBody] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [taskDue, setTaskDue] = useState('');

  useEffect(() => {
    setNoteBody('');
    setTaskSubject('');
    setTaskDue('');
    setErr(null);
  }, [deal.id]);

  const loadDetails = useCallback(async () => {
    try {
      const [{ data: noteData }, { data: taskData }] = await Promise.all([
        supabase
          .from('note')
          .select('id, title, body, created_at, note_object_link!inner(deal_id)')
          .eq('note_object_link.deal_id', deal.id)
          .order('created_at', { ascending: false })
          .limit(3),
        supabase
          .from('task')
          .select('id, subject, due_at')
          .eq('deal_id', deal.id)
          .in('status', ['open', 'in_progress'])
          .order('due_at', { ascending: true, nullsFirst: false })
          .limit(1),
      ]);
      setNotes((noteData as NoteRow[]) ?? []);
      setOpenTask(((taskData as TaskRow[]) ?? [])[0] ?? null);
    } catch (e) {
      console.error('DealSlideOver.loadDetails', e);
    }
  }, [deal.id]);

  useEffect(() => { loadDetails(); }, [loadDetails]);

  async function saveNote() {
    const body = noteBody.trim();
    if (!body) return;
    setSaving(true);
    setErr(null);
    try {
      await insertDealNote(deal.id, body);
      setNoteBody('');
      await loadDetails();
      onChanged();
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
      await loadDetails();
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to set next action');
    } finally {
      setSaving(false);
    }
  }

  const verb = instruction(deal);
  const inputStyle = {
    backgroundColor: PALETTE.ground, color: PALETTE.text,
    border: `1px solid ${PALETTE.ground}`, fontSize: px(15), fontFamily: CONDENSED_STACK,
  } as const;

  return (
    <>
      <div className="fixed inset-0 z-[10000]" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onClose} />

      <div
        className="fixed top-0 right-0 h-full z-[10001] flex flex-col shadow-2xl"
        style={{ width: Math.round(440 * scale), maxWidth: '92vw', backgroundColor: PALETTE.column, color: PALETTE.text, fontFamily: CONDENSED_STACK }}
      >
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${PALETTE.ground}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate" style={{ fontWeight: 600, fontSize: px(22), color: PALETTE.text }}>{deal.name}</div>
              <div style={{ fontSize: px(14), color: PALETTE.textDim }}>{deal.city ?? '—'} · {deal.stageLabel}</div>
            </div>
            <button onClick={onClose} style={{ color: PALETTE.textDim, fontSize: px(22), lineHeight: 1 }} aria-label="Close">✕</button>
          </div>
          <div className="mt-2" style={{ fontSize: px(14) }}>
            {deal.heat === 'no_history' ? (
              <span style={{ color: PALETTE.textDim }}>no history yet</span>
            ) : deal.heat === 'unclassified' ? (
              <span style={{ color: PALETTE.text }}>Unclassified · {deal.days}d — classify below</span>
            ) : (
              <span style={{ color: deal.heat === 'hot' ? PALETTE.hot : deal.heat === 'warm' ? PALETTE.warm : PALETTE.textDim }}>
                {deal.readyToSubmit ? 'Ready to submit' : courtLabel(deal)} · {deal.days}d{verb ? ` — ${verb}` : ''}
              </span>
            )}
          </div>
          <div className="mt-3">
            <UrgentToggle deal={deal} px={px} onChanged={onChanged} />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {err && <div style={{ color: PALETTE.hot, fontSize: px(14) }}>{err}</div>}

          <Section title="Rolling summary" px={px}>
            <div style={{ color: PALETTE.textDim, fontSize: px(14), fontStyle: 'italic' }}>(Coming in phase 2 — reserved.)</div>
          </Section>

          <Section title="Classify" px={px}>
            <ClassifyControls deal={deal} px={px} saveLabel="Save court" onSaved={onChanged} />
          </Section>

          <Section title="Log a note" px={px}>
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
          </Section>

          <Section title="Set next action" px={px}>
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
          </Section>

          <Section title="Recent notes" px={px}>
            {notes.length === 0 ? (
              <div style={{ color: PALETTE.textDim, fontSize: px(14) }}>None yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {notes.map((n) => (
                  <div key={n.id} style={{ fontSize: px(14) }}>
                    <div style={{ color: PALETTE.text }}>{n.title || stripHtml(n.body)}</div>
                    <div style={{ color: PALETTE.textDim, fontSize: px(12) }}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Park — off the board until a review date (decisions §2.24) */}
          <Section title="Park" px={px}>
            <ParkControl deal={deal} px={px} onDone={() => { onChanged(); onClose(); }} />
          </Section>

          {/* Pass / Mark lost — removes the tile (decisions §2.23) */}
          <Section title="Remove from board" px={px}>
            <KillPassAction deal={deal} px={px} onDone={() => { onChanged(); onClose(); }} />
          </Section>
        </div>

        <div className="px-5 py-3" style={{ borderTop: `1px solid ${PALETTE.ground}` }}>
          <button onClick={() => navigate(`/deal/${deal.id}`)} style={{ color: PALETTE.textDim, fontSize: px(13) }}>Open full deal →</button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children, px }: { title: string; children: ReactNode; px: (n: number) => number }) {
  return (
    <div>
      <div className="uppercase tracking-wider" style={{ fontSize: px(12), color: PALETTE.textDim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function stripHtml(s: string | null): string {
  if (!s) return '(empty note)';
  return s.replace(/<[^>]*>/g, '').slice(0, 80);
}

// today + n days as a local YYYY-MM-DD (CLAUDE.md: local date, not UTC)
function addDaysLocal(n: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
