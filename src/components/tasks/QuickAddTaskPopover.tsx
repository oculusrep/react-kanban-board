import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useUsers } from '../../hooks/useUsers';
import { quickCreateTask } from '../../hooks/useTasks';
import {
  DEFAULT_CATEGORY_BY_OBJECT,
  Task,
  TaskCategory,
  TaskLinkableObjectType,
} from '../../types/task';

// Quick-capture popover from spec §7.2. Keeps the 80%-case capture under
// 3 seconds: type subject + Enter to save. Pill buttons for category, due,
// assignee, duration are inline so the user never leaves the popover.

interface QuickAddTaskPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onTaskCreated?: (task: Task) => void;

  // Link auto-set from the source object page. If provided, the task is
  // FK'd to this object and the popover shows a chip confirming the link.
  linkedObjectType?: TaskLinkableObjectType;
  linkedObjectId?: string;
  linkedObjectLabel?: string;
}

const CATEGORIES: { value: TaskCategory; label: string }[] = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'ovis', label: 'OVIS' },
  { value: 'email', label: 'Email' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

const DURATION_PRESETS = [15, 30, 45, 60, 90, 120] as const;

// Internal team roles that can be assigned tasks (spec §8.1).
// Excludes coach, client portal users, and any future external-only role.
const ASSIGNABLE_ROLES = new Set(['broker_full', 'va', 'admin']);

// OVIS palette (CLAUDE.md)
const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
} as const;

export const QuickAddTaskPopover: React.FC<QuickAddTaskPopoverProps> = ({
  isOpen,
  onClose,
  onTaskCreated,
  linkedObjectType,
  linkedObjectId,
  linkedObjectLabel,
}) => {
  const { userTableId } = useAuth();
  const { users } = useUsers();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const defaultCategory: TaskCategory = useMemo(
    () => (linkedObjectType ? DEFAULT_CATEGORY_BY_OBJECT[linkedObjectType] : 'personal'),
    [linkedObjectType]
  );

  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<TaskCategory>(defaultCategory);
  const [dueDate, setDueDate] = useState<string>(''); // YYYY-MM-DD
  const [assigneeId, setAssigneeId] = useState<string>(''); // empty = current user
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const [highFlag, setHighFlag] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset form when opening
  useEffect(() => {
    if (isOpen) {
      setSubject('');
      setCategory(defaultCategory);
      setDueDate('');
      setAssigneeId('');
      setDurationMinutes(null);
      setHighFlag(false);
      setError(null);
      // Auto-focus subject after the next render
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen, defaultCategory]);

  // Esc to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, [isOpen, onClose]);

  const linkFK = useMemo(() => {
    if (!linkedObjectType || !linkedObjectId) return {};
    const fkColumn = `${linkedObjectType}_id` as const;
    return { [fkColumn]: linkedObjectId };
  }, [linkedObjectType, linkedObjectId]);

  const handleSave = async () => {
    if (!subject.trim()) {
      setError('Subject is required');
      return;
    }
    if (!userTableId) {
      setError('Not authenticated');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const task = await quickCreateTask(
        {
          subject: subject.trim(),
          category,
          high_flag: highFlag,
          due_at: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
          duration_minutes: durationMinutes,
          owner_id: assigneeId || userTableId,
          assigned_by_id: assigneeId && assigneeId !== userTableId ? userTableId : null,
          ...linkFK,
        },
        { currentUserTableId: userTableId, defaultCategory: category }
      );
      onTaskCreated?.(task);
      onClose();
    } catch (err) {
      console.error('quickCreateTask failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to create task');
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSave();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="absolute z-50 right-0 mt-2 w-96 bg-white rounded-lg shadow-xl border"
      style={{ borderColor: COLORS.slate }}
      role="dialog"
      aria-label="Quick add task"
    >
      {/* Subject */}
      <div className="p-3 border-b" style={{ borderColor: COLORS.slate }}>
        <input
          ref={inputRef}
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What needs to be done?"
          className="w-full px-2 py-1.5 text-sm focus:outline-none"
          style={{ color: COLORS.midnight }}
          maxLength={200}
        />
        {linkedObjectLabel && (
          <div
            className="mt-2 inline-flex items-center px-2 py-0.5 text-xs rounded-full"
            style={{ backgroundColor: COLORS.slate + '33', color: COLORS.steel }}
          >
            <span className="mr-1">→</span>
            {linkedObjectLabel}
          </div>
        )}
      </div>

      {/* Pill row: category / due / assignee / duration / high */}
      <div className="px-3 py-2 flex flex-wrap gap-2 items-center">
        {/* Category */}
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as TaskCategory)}
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          aria-label="Category"
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>

        {/* Due date */}
        <input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          aria-label="Due date"
        />

        {/* Assignee */}
        <select
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          aria-label="Assignee"
        >
          <option value="">Me</option>
          {users
            .filter(
              (u) =>
                u.id !== userTableId &&
                u.ovis_role &&
                ASSIGNABLE_ROLES.has(u.ovis_role)
            )
            .map((u) => (
              <option key={u.id} value={u.id}>
                {u.first_name && u.last_name
                  ? `${u.first_name} ${u.last_name}`
                  : u.email || 'Unnamed'}
              </option>
            ))}
        </select>

        {/* Duration */}
        <select
          value={durationMinutes ?? ''}
          onChange={(e) =>
            setDurationMinutes(e.target.value ? parseInt(e.target.value, 10) : null)
          }
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          aria-label="Duration"
        >
          <option value="">No duration</option>
          {DURATION_PRESETS.map((m) => (
            <option key={m} value={m}>
              {m < 60 ? `${m} min` : `${m / 60}h`}
            </option>
          ))}
        </select>

        {/* High flag */}
        <button
          type="button"
          onClick={() => setHighFlag((v) => !v)}
          className="text-xs px-2 py-1 rounded border"
          style={
            highFlag
              ? { backgroundColor: COLORS.midnight, borderColor: COLORS.midnight, color: COLORS.white }
              : { borderColor: COLORS.slate, color: COLORS.slate }
          }
          aria-pressed={highFlag}
          aria-label="High priority"
          title="High priority"
        >
          ⚑ High
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-1 text-xs" style={{ color: '#A27B5C' }}>
          {error}
        </div>
      )}

      {/* Footer: Cancel / Save */}
      <div
        className="px-3 py-2 flex justify-end gap-2 border-t"
        style={{ borderColor: COLORS.slate, backgroundColor: '#F8FAFC' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="text-xs px-3 py-1.5 rounded"
          style={{ color: COLORS.steel }}
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !subject.trim()}
          className="text-xs px-3 py-1.5 rounded font-medium disabled:opacity-50"
          style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
};

export default QuickAddTaskPopover;
