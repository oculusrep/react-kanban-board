// Starbucks Deal Board — slide-over panel (spec §7).
// Click a tile → this slides in from the right over a dimmed board. Three
// actions cool/classify a tile in under ten seconds without leaving the board:
// Change court (+ Pre-Submittal blocker with implied-court pre-select),
// Log a note, Set next action. Dark to match the board.

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { getCategoryIdByName } from '../../lib/taskCategory';
import {
  BallInCourt,
  BlockedOn,
  BLOCKED_ON_LABEL,
  BLOCKED_ON_OPTIONS,
  BoardDeal,
  COURT_OPTIONS,
  courtLabel,
  CONDENSED_STACK,
  IMPLIED_COURT,
  instruction,
  PALETTE,
  PRE_SUBMITTAL,
} from '../../lib/starbucksBoard';

interface NoteRow {
  id: string;
  title: string | null;
  body: string | null;
  created_at: string | null;
}
interface TaskRow {
  id: string;
  subject: string | null;
  due_at: string | null;
}

export default function DealSlideOver({
  deal,
  onClose,
  onChanged,
}: {
  deal: BoardDeal;
  onClose: () => void;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { userTableId } = useAuth();
  const isPreSubmittal = deal.stageLabel === PRE_SUBMITTAL;

  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [openTask, setOpenTask] = useState<TaskRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Change-court form state (seeded from the deal)
  const [court, setCourt] = useState<BallInCourt | null>(deal.ballInCourt);
  const [party, setParty] = useState(deal.ballInCourtParty ?? '');
  const [blockedOn, setBlockedOn] = useState<BlockedOn | null>(deal.blockedOn);

  const [noteBody, setNoteBody] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [taskDue, setTaskDue] = useState('');

  // Re-seed the form when a different deal is opened.
  useEffect(() => {
    setCourt(deal.ballInCourt);
    setParty(deal.ballInCourtParty ?? '');
    setBlockedOn(deal.blockedOn);
    setNoteBody('');
    setTaskSubject('');
    setTaskDue('');
    setErr(null);
  }, [deal.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load last 3 notes + the current open action for this deal.
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
      // best-effort; the panel still works without history
      console.error('DealSlideOver.loadDetails', e);
    }
  }, [deal.id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  // ---- Writes -------------------------------------------------------------

  // Change court sets who owes + resets the clock (spec §7). Also clears
  // seeded_fallback — a human classification means the tile is no longer
  // "no history". blocked_on is only written for Pre-Submittal deals.
  async function saveCourt() {
    setSaving(true);
    setErr(null);
    try {
      const patch: Record<string, unknown> = {
        deal_id: deal.id,
        ball_in_court: court, // may be null (unclassified) if they clear it
        ball_in_court_party: party.trim() || null,
        ball_in_court_since: new Date().toISOString(),
        seeded_fallback: false,
      };
      if (isPreSubmittal) patch.blocked_on = blockedOn;
      const { error } = await supabase
        .from('deal_activity_state')
        .upsert(patch, { onConflict: 'deal_id' });
      if (error) throw error;
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to save court');
    } finally {
      setSaving(false);
    }
  }

  // Log a note → note + note_object_link(deal). The link-insert trigger cools
  // the tile and clears seeded_fallback (spec §3.3). Mirrors NoteFormModal.
  async function saveNote() {
    const body = noteBody.trim();
    if (!body) return;
    setSaving(true);
    setErr(null);
    try {
      const stamp = `manual_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const title = body.length > 60 ? `${body.slice(0, 57)}…` : body;
      const { data: note, error: noteErr } = await supabase
        .from('note')
        .insert({
          sf_content_note_id: stamp,
          title,
          body,
          content_size: body.length,
          share_type: 'V',
          visibility: 'AllUsers',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (noteErr) throw noteErr;

      const { error: linkErr } = await supabase.from('note_object_link').insert({
        note_id: note!.id,
        sf_content_document_link_id: `${stamp}_deal`,
        object_type: 'deal',
        object_id: deal.id,
        deal_id: deal.id,
      });
      if (linkErr) throw linkErr;

      setNoteBody('');
      await loadDetails();
      onChanged();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to log note');
    } finally {
      setSaving(false);
    }
  }

  // Set next action → task(deal_id). Insert trigger cools the tile (spec §3.3).
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
        // due_at is TIMESTAMPTZ; build from local date (CLAUDE.md timezone rule)
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

  const dirtyCourt =
    court !== deal.ballInCourt ||
    (party.trim() || null) !== (deal.ballInCourtParty ?? null) ||
    (isPreSubmittal && blockedOn !== deal.blockedOn);

  const verb = instruction(deal);

  return (
    <>
      {/* dimmed board behind */}
      <div className="fixed inset-0 z-[10000]" style={{ backgroundColor: 'rgba(0,0,0,0.45)' }} onClick={onClose} />

      {/* panel */}
      <div
        className="fixed top-0 right-0 h-full z-[10001] flex flex-col shadow-2xl"
        style={{ width: 420, maxWidth: '92vw', backgroundColor: PALETTE.column, color: PALETTE.text, fontFamily: CONDENSED_STACK }}
      >
        {/* header */}
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: `1px solid ${PALETTE.ground}` }}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate" style={{ fontWeight: 600, fontSize: 22, color: PALETTE.text }}>{deal.name}</div>
              <div style={{ fontSize: 13, color: PALETTE.textDim }}>
                {deal.city ?? '—'} · {deal.stageLabel}
              </div>
            </div>
            <button onClick={onClose} style={{ color: PALETTE.textDim, fontSize: 20, lineHeight: 1 }} aria-label="Close">✕</button>
          </div>
          <div className="mt-2" style={{ fontSize: 13 }}>
            {deal.heat === 'no_history' ? (
              <span style={{ color: PALETTE.textDim }}>no history yet</span>
            ) : deal.heat === 'unclassified' ? (
              <span style={{ color: PALETTE.text }}>Unclassified · {deal.days}d — set the court below</span>
            ) : (
              <span style={{ color: deal.heat === 'hot' ? PALETTE.hot : deal.heat === 'warm' ? PALETTE.warm : PALETTE.textDim }}>
                {courtLabel(deal)} · {deal.days}d{verb ? ` — ${verb}` : ''}
              </span>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {err && <div style={{ color: PALETTE.hot, fontSize: 13 }}>{err}</div>}

          {/* rolling summary placeholder (spec §7.2 — wired phase 2) */}
          <Section title="Rolling summary">
            <div style={{ color: PALETTE.textDim, fontSize: 13, fontStyle: 'italic' }}>
              (Coming in phase 2 — reserved.)
            </div>
          </Section>

          {/* Change court + blocker */}
          <Section title="Change court">
            <div className="flex gap-2">
              {COURT_OPTIONS.map((o) => (
                <Pill key={o.value} active={court === o.value} onClick={() => setCourt(o.value)}>{o.label}</Pill>
              ))}
              {court !== null && (
                <Pill active={false} onClick={() => setCourt(null)} muted>clear</Pill>
              )}
            </div>
            <input
              value={party}
              onChange={(e) => setParty(e.target.value)}
              placeholder="Who specifically? (Landlord, GDOT, Seller…)"
              className="mt-2 w-full rounded px-2 py-1"
              style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: 13 }}
            />

            {isPreSubmittal && (
              <div className="mt-3">
                <div style={{ fontSize: 12, color: PALETTE.textDim, marginBottom: 4 }}>Blocked on (Pre-Submittal)</div>
                <div className="flex flex-wrap gap-2">
                  {BLOCKED_ON_OPTIONS.map((b) => (
                    <Pill
                      key={b}
                      active={blockedOn === b}
                      onClick={() => {
                        setBlockedOn(b);
                        // pre-select the implied court; Mike can override (addition #2)
                        setCourt(IMPLIED_COURT[b]);
                      }}
                    >
                      {BLOCKED_ON_LABEL[b]}
                    </Pill>
                  ))}
                  {blockedOn !== null && (
                    <Pill active={false} muted onClick={() => setBlockedOn(null)}>clear</Pill>
                  )}
                </div>
              </div>
            )}

            <button
              onClick={saveCourt}
              disabled={saving || !dirtyCourt}
              className="mt-3 w-full rounded py-2"
              style={{
                backgroundColor: dirtyCourt ? PALETTE.text : 'transparent',
                color: dirtyCourt ? PALETTE.ground : PALETTE.textDim,
                border: `1px solid ${dirtyCourt ? PALETTE.text : PALETTE.textDim}`,
                fontWeight: 600, fontSize: 14, opacity: saving ? 0.6 : 1,
              }}
            >
              Save court{dirtyCourt ? ' (resets clock)' : ''}
            </button>
          </Section>

          {/* Log a note */}
          <Section title="Log a note">
            <textarea
              value={noteBody}
              onChange={(e) => setNoteBody(e.target.value)}
              placeholder="What happened? (cools the tile)"
              rows={3}
              className="w-full rounded px-2 py-1"
              style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: 13, resize: 'vertical' }}
            />
            <button
              onClick={saveNote}
              disabled={saving || !noteBody.trim()}
              className="mt-2 rounded px-3 py-1.5"
              style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.text, fontSize: 13, opacity: saving || !noteBody.trim() ? 0.5 : 1 }}
            >
              Log note
            </button>
          </Section>

          {/* Set next action */}
          <Section title="Set next action">
            {openTask && (
              <div style={{ fontSize: 12, color: PALETTE.textDim, marginBottom: 6 }}>
                Current: {openTask.subject}
                {openTask.due_at ? ` · due ${new Date(openTask.due_at).toLocaleDateString()}` : ''}
              </div>
            )}
            <input
              value={taskSubject}
              onChange={(e) => setTaskSubject(e.target.value)}
              placeholder="Next action…"
              className="w-full rounded px-2 py-1"
              style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: 13 }}
            />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="date"
                value={taskDue}
                onChange={(e) => setTaskDue(e.target.value)}
                className="rounded px-2 py-1"
                style={{ backgroundColor: PALETTE.ground, color: PALETTE.text, border: `1px solid ${PALETTE.ground}`, fontSize: 13 }}
              />
              <button
                onClick={saveTask}
                disabled={saving || !taskSubject.trim()}
                className="rounded px-3 py-1.5"
                style={{ border: `1px solid ${PALETTE.textDim}`, color: PALETTE.text, fontSize: 13, opacity: saving || !taskSubject.trim() ? 0.5 : 1 }}
              >
                Set action
              </button>
            </div>
          </Section>

          {/* Last 3 notes */}
          <Section title="Recent notes">
            {notes.length === 0 ? (
              <div style={{ color: PALETTE.textDim, fontSize: 13 }}>None yet.</div>
            ) : (
              <div className="flex flex-col gap-2">
                {notes.map((n) => (
                  <div key={n.id} style={{ fontSize: 13 }}>
                    <div style={{ color: PALETTE.text }}>{n.title || stripHtml(n.body)}</div>
                    <div style={{ color: PALETTE.textDim, fontSize: 11 }}>
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* footer */}
        <div className="px-5 py-3" style={{ borderTop: `1px solid ${PALETTE.ground}` }}>
          <button onClick={() => navigate(`/deal/${deal.id}`)} style={{ color: PALETTE.textDim, fontSize: 12 }}>
            Open full deal →
          </button>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="uppercase tracking-wider" style={{ fontSize: 11, color: PALETTE.textDim, marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  );
}

function Pill({ active, muted, onClick, children }: { active: boolean; muted?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="rounded px-2.5 py-1"
      style={{
        fontSize: 13,
        border: `1px solid ${active ? PALETTE.text : PALETTE.textDim}`,
        backgroundColor: active ? PALETTE.text : 'transparent',
        color: active ? PALETTE.ground : muted ? PALETTE.textDim : PALETTE.text,
      }}
    >
      {children}
    </button>
  );
}

function stripHtml(s: string | null): string {
  if (!s) return '(empty note)';
  return s.replace(/<[^>]*>/g, '').slice(0, 80);
}
