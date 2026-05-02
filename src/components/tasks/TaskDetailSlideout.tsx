import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import {
  completeTask,
  deleteTask,
  reopenTask,
  updateTask,
} from '../../hooks/useTasks';
import { supabase } from '../../lib/supabaseClient';
import {
  TaskCategory,
  TaskWithRelations,
} from '../../types/task';

// Composable task detail slideout per docs/OVIS_OVERLAY_UX.md.
// Opens from anywhere — TasksPage row click, OpenTasksPanel "Open" link,
// future kanban card slideouts, etc. Takes taskId + onClose; fetches its
// own data; manages its own edit state.
//
// Linked-to chips currently still navigate pages — when those object
// detail pages get composable slideouts (future work), the chips will
// open another overlay instead. Flagging the gap here per the principle.

interface TaskDetailSlideoutProps {
  taskId: string | null;
  onClose: () => void;
  onChanged?: () => void; // refetch hint for parent lists
}

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
  white: '#FFFFFF',
} as const;

const ASSIGNABLE_ROLES = new Set(['broker_full', 'va', 'admin']);

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'ovis', label: 'OVIS' },
  { value: 'email', label: 'Email' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

const RELATIONS_SELECT = `
  *,
  owner:user!task_owner_id_fkey(*),
  assigned_by:user!task_assigned_by_id_fkey(*),
  created_by:user!task_created_by_id_fkey(*),
  client(*),
  deal(*),
  property(*),
  site_submit(*),
  assignment(*),
  contact(*)
`;

interface LinkChip {
  label: string;
  to: string;
}

const linkChipsFor = (task: TaskWithRelations): LinkChip[] => {
  const out: LinkChip[] = [];
  if (task.client) out.push({ label: task.client.client_name || 'Client', to: `/client/${task.client.id}` });
  if (task.deal) out.push({ label: task.deal.deal_name || 'Deal', to: `/deal/${task.deal.id}` });
  if (task.property) out.push({ label: task.property.property_name || task.property.address || 'Property', to: `/property/${task.property.id}` });
  if (task.site_submit) out.push({ label: task.site_submit.site_submit_name || 'Site Submit', to: `/site-submit/${task.site_submit.id}` });
  if (task.assignment) out.push({ label: task.assignment.assignment_name || 'Assignment', to: `/assignment/${task.assignment.id}` });
  if (task.contact) {
    const name = [task.contact.first_name, task.contact.last_name].filter(Boolean).join(' ') || 'Contact';
    out.push({ label: name, to: `/contact/${task.contact.id}` });
  }
  return out;
};

const dateToInput = (iso: string | null): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
};

const inputToIso = (s: string): string | null => {
  if (!s) return null;
  return new Date(`${s}T23:59:59`).toISOString();
};

// datetime-local input format: YYYY-MM-DDTHH:mm in local time. Use this for
// completed_at so the user can pick both date and time (e.g., backdate to
// last Tuesday at 3pm).
const isoToDatetimeLocal = (iso: string | null): string => {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
};

const datetimeLocalToIso = (s: string): string | null => {
  if (!s) return null;
  return new Date(s).toISOString();
};

export const TaskDetailSlideout: React.FC<TaskDetailSlideoutProps> = ({
  taskId,
  onClose,
  onChanged,
}) => {
  const { userTableId } = useAuth();
  const { users } = useUsers();
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editable form state
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('personal');
  const [ownerId, setOwnerId] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [highFlag, setHighFlag] = useState(false);
  const [completionNote, setCompletionNote] = useState('');
  const [completedAtInput, setCompletedAtInput] = useState(''); // editable timestamp
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Fetch on open
  useEffect(() => {
    if (!taskId) {
      setTask(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const { data, error: fetchError } = await supabase
          .from('task')
          .select(RELATIONS_SELECT)
          .eq('id', taskId)
          .single();
        if (fetchError) throw fetchError;
        if (cancelled) return;
        const t = data as unknown as TaskWithRelations;
        setTask(t);
        setSubject(t.subject);
        setDescription(t.description ?? '');
        setCategory((t.category as TaskCategory) ?? 'personal');
        setOwnerId(t.owner_id);
        setDueDate(dateToInput(t.due_at));
        setDurationMinutes(t.duration_minutes ?? null);
        setHighFlag(t.high_flag);
        setCompletionNote(t.completion_note ?? '');
        setCompletedAtInput(isoToDatetimeLocal(t.completed_at));
        setDirty(false);
      } catch (err) {
        if (cancelled) return;
        console.error(err);
        setError(err instanceof Error ? err.message : 'Failed to load task');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Esc closes
  useEffect(() => {
    if (!taskId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [taskId, onClose]);

  const markDirty = () => setDirty(true);

  const assigneeOptions = useMemo(
    () => users.filter((u) => u.ovis_role && ASSIGNABLE_ROLES.has(u.ovis_role)),
    [users]
  );

  const linkChips = useMemo(() => (task ? linkChipsFor(task) : []), [task]);
  const completed = task?.status === 'completed';

  const handleSave = async () => {
    if (!task) return;
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // For completed tasks, allow editing completed_at (e.g., backdating).
      // The DB CHECK constraint task_completed_consistency requires that
      // completed_at stays non-null while status='completed', so we never
      // null it out here.
      const patch: Parameters<typeof updateTask>[1] = {
        subject: subject.trim(),
        description: description || null,
        category,
        owner_id: ownerId || task.owner_id,
        assigned_by_id:
          ownerId && ownerId !== userTableId && userTableId !== task.assigned_by_id
            ? userTableId
            : task.assigned_by_id,
        due_at: inputToIso(dueDate),
        duration_minutes: durationMinutes,
        high_flag: highFlag,
        completion_note: completionNote || null,
      };
      if (completed) {
        const newCompletedAt = datetimeLocalToIso(completedAtInput);
        if (newCompletedAt) {
          patch.completed_at = newCompletedAt;
        }
      }
      await updateTask(task.id, patch);
      setDirty(false);
      onChanged?.();
      // Re-fetch by setting task to reflect persisted state
      const { data } = await supabase
        .from('task')
        .select(RELATIONS_SELECT)
        .eq('id', task.id)
        .single();
      if (data) setTask(data as unknown as TaskWithRelations);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    if (!task) return;
    if (!userTableId) {
      setError('Not authenticated');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      // completeTask handles status + completed_at + timeline post in one
      // call. If the user picked a custom datetime, pass it through;
      // otherwise the helper defaults to now().
      const userPicked = datetimeLocalToIso(completedAtInput);
      await completeTask(task.id, {
        actor_user_id: userTableId,
        completion_note: completionNote || null,
        ...(userPicked ? { completed_at: userPicked } : {}),
      });
      onChanged?.();
      // Refresh
      const { data } = await supabase
        .from('task')
        .select(RELATIONS_SELECT)
        .eq('id', task.id)
        .single();
      if (data) {
        const t = data as unknown as TaskWithRelations;
        setTask(t);
        setCompletedAtInput(isoToDatetimeLocal(t.completed_at));
      }
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Complete failed');
    } finally {
      setSaving(false);
    }
  };

  const handleReopen = async () => {
    if (!task) return;
    setSaving(true);
    setError(null);
    try {
      await reopenTask(task.id);
      onChanged?.();
      const { data } = await supabase
        .from('task')
        .select(RELATIONS_SELECT)
        .eq('id', task.id)
        .single();
      if (data) setTask(data as unknown as TaskWithRelations);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Reopen failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!task) return;
    if (!confirm(`Delete task: "${task.subject}"?`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteTask(task.id);
      onChanged?.();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Delete failed');
      setSaving(false);
    }
  };

  if (!taskId) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 z-40"
        onClick={onClose}
        aria-hidden
      />
      {/* Slideout panel */}
      <div
        className="fixed top-0 right-0 bottom-0 w-full sm:w-[480px] bg-white z-50 shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Task details"
      >
        {/* Header */}
        <div
          className="px-4 py-3 border-b flex items-center justify-between"
          style={{ borderColor: COLORS.slate + '66', backgroundColor: COLORS.bg }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-xs px-2 py-0.5 rounded-full"
              style={
                completed
                  ? { backgroundColor: '#dcfce7', color: '#166534' }
                  : { backgroundColor: COLORS.slate + '33', color: COLORS.steel }
              }
            >
              {task?.status ?? '—'}
            </span>
            {completed && task?.completed_at && (
              <span className="text-xs" style={{ color: '#166534' }}>
                ✓ {new Date(task.completed_at).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
            {task?.high_flag && (
              <span title="High priority" style={{ color: COLORS.midnight }}>
                ⚑
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm px-2 py-1 rounded hover:bg-gray-100"
            style={{ color: COLORS.steel }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {loading && (
            <div className="text-sm" style={{ color: COLORS.slate }}>
              Loading…
            </div>
          )}
          {error && (
            <div className="text-sm px-3 py-2 rounded" style={{ color: '#A27B5C', backgroundColor: '#fff5ec' }}>
              {error}
            </div>
          )}

          {task && !loading && (
            <>
              {/* Subject */}
              <div>
                <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    markDirty();
                  }}
                  className="mt-1 w-full px-3 py-2 text-sm rounded border"
                  style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    markDirty();
                  }}
                  rows={4}
                  placeholder="Notes, context, links…"
                  className="mt-1 w-full px-3 py-2 text-sm rounded border resize-y"
                  style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                />
              </div>

              {/* Two-column row: category / owner */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      setCategory(e.target.value as TaskCategory);
                      markDirty();
                    }}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded border"
                    style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                    Owner
                  </label>
                  <select
                    value={ownerId}
                    onChange={(e) => {
                      setOwnerId(e.target.value);
                      markDirty();
                    }}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded border"
                    style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                  >
                    {assigneeOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.first_name && u.last_name
                          ? `${u.first_name} ${u.last_name}`
                          : u.email || 'Unnamed'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Two-column row: due / duration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                    Due date
                  </label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => {
                      setDueDate(e.target.value);
                      markDirty();
                    }}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded border"
                    style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                    Duration
                  </label>
                  <select
                    value={durationMinutes ?? ''}
                    onChange={(e) => {
                      setDurationMinutes(e.target.value ? parseInt(e.target.value, 10) : null);
                      markDirty();
                    }}
                    className="mt-1 w-full px-2 py-1.5 text-sm rounded border"
                    style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                  >
                    <option value="">No duration</option>
                    {DURATION_PRESETS.map((m) => (
                      <option key={m} value={m}>
                        {m < 60 ? `${m} min` : `${m / 60}h`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* High flag */}
              <label className="flex items-center gap-2 text-sm" style={{ color: COLORS.steel }}>
                <input
                  type="checkbox"
                  checked={highFlag}
                  onChange={(e) => {
                    setHighFlag(e.target.checked);
                    markDirty();
                  }}
                />
                ⚑ High priority
              </label>

              {/* Linked-to */}
              {linkChips.length > 0 && (
                <div>
                  <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                    Linked to
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {linkChips.map((c, i) => (
                      <Link
                        key={i}
                        to={c.to}
                        className="text-xs px-2 py-0.5 rounded hover:underline"
                        style={{ backgroundColor: COLORS.slate + '33', color: COLORS.steel }}
                        title="Note: still navigates as a page; future work makes these open as overlays"
                      >
                        {c.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Completed at — editable, both pre-completion (defaults to
                  now on Complete click) and post-completion (backdate / fix). */}
              <div>
                <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                  {completed ? 'Completed at' : 'Complete as of (defaults to now)'}
                </label>
                <input
                  type="datetime-local"
                  value={completedAtInput}
                  onChange={(e) => {
                    setCompletedAtInput(e.target.value);
                    if (completed) markDirty();
                  }}
                  className="mt-1 w-full px-2 py-1.5 text-sm rounded border"
                  style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                />
              </div>

              {/* Completion note (editable while open, persists when completed) */}
              <div>
                <label className="text-xs font-medium" style={{ color: COLORS.steel }}>
                  Completion note {completed ? '' : '(captured when you click Complete)'}
                </label>
                <textarea
                  value={completionNote}
                  onChange={(e) => {
                    setCompletionNote(e.target.value);
                    if (completed) markDirty();
                  }}
                  rows={2}
                  placeholder="What got done? Who did you talk to?"
                  className="mt-1 w-full px-3 py-2 text-sm rounded border resize-y"
                  style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                />
              </div>
            </>
          )}
        </div>

        {/* Footer actions */}
        {task && !loading && (
          <div
            className="px-4 py-3 border-t flex items-center justify-between gap-2"
            style={{ borderColor: COLORS.slate + '66', backgroundColor: COLORS.bg }}
          >
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="text-sm px-3 py-1.5 rounded hover:bg-red-50 disabled:opacity-50"
              style={{ color: '#dc2626' }}
            >
              Delete
            </button>
            <div className="flex items-center gap-2">
              {dirty && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-sm px-3 py-1.5 rounded border disabled:opacity-50"
                  style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              )}
              {completed ? (
                <button
                  type="button"
                  onClick={handleReopen}
                  disabled={saving}
                  className="text-sm px-3 py-1.5 rounded font-medium disabled:opacity-50"
                  style={{ backgroundColor: COLORS.steel, color: COLORS.white }}
                >
                  Reopen
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={saving}
                  className="text-sm px-3 py-1.5 rounded font-medium disabled:opacity-50"
                  style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
                >
                  {saving ? 'Working…' : 'Complete'}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default TaskDetailSlideout;
