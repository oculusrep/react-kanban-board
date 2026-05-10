import React, { useState } from 'react';
import {
  completeTask,
  updateTask,
  useTaskList,
} from '../../../hooks/useTasks';
import { useAuth } from '../../../contexts/AuthContext';
import { TaskStatus, TaskWithRelations } from '../../../types/task';
import { isOverdue } from '../../../lib/taskOverdue';
import { localDateString } from '../../../types/taskBlock';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Overdue lane (spec §6.8 — added 2026-05-10). Surfaces any open task
// whose due_at is strictly before today, regardless of inbox / scheduled
// state. Same task may also appear in Inbox or a block — that's
// intentional: overdue is the critical signal and shouldn't be hidden
// behind another lane's filter.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  warning: '#A27B5C',
} as const;

// Hoisted so its reference is stable across renders — useTaskList's deps
// treat array identity as a change and would refetch in an infinite loop.
const ACTIVE_STATUSES: TaskStatus[] = ['open', 'in_progress'];

interface OverdueLaneProps {
  ownerId: string;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  viewDate: string;
  /** Bump shared dashboard refresh signal so peer lanes refetch. */
  onTaskChanged?: () => void;
}

const ageLabel = (dueAt: string): string => {
  const dueDate = dueAt.length >= 10 ? dueAt.slice(0, 10) : dueAt;
  const today = localDateString();
  const [dy, dm, dd] = dueDate.split('-').map((s) => parseInt(s, 10));
  const [ty, tm, td] = today.split('-').map((s) => parseInt(s, 10));
  const due = new Date(dy, dm - 1, dd).getTime();
  const t = new Date(ty, tm - 1, td).getTime();
  const days = Math.max(0, Math.round((t - due) / 86400000));
  if (days === 1) return '1d overdue';
  return `${days}d overdue`;
};

export const OverdueLane: React.FC<OverdueLaneProps> = ({
  ownerId,
  viewDate,
  onTaskChanged,
}) => {
  const { userTableId } = useAuth();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const today = localDateString();

  // Fetch all open / in_progress tasks for the user, then filter to overdue
  // client-side. Using server-side `due_before` would also work but keeps
  // the hook signature simpler and the volumes are small per user.
  const { tasks, loading, error, refetch } = useTaskList({
    owner_id: ownerId,
    status: ACTIVE_STATUSES,
    due_before: today,
  });

  // useTaskList's due_before is `lte`, but we want strictly before today
  // (a task due today is not overdue). Filter client-side.
  const overdue = tasks.filter((t) => isOverdue(t.due_at));

  const handlePinTop3 = async (e: React.MouseEvent, task: TaskWithRelations) => {
    e.stopPropagation();
    try {
      await updateTask(task.id, { top3_date: viewDate });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Pin failed');
    }
  };

  const handleClearDue = async (e: React.MouseEvent, task: TaskWithRelations) => {
    e.stopPropagation();
    try {
      await updateTask(task.id, { due_at: null });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Clear due date failed');
    }
  };

  const handleComplete = async (e: React.MouseEvent, task: TaskWithRelations) => {
    e.stopPropagation();
    if (!userTableId) return;
    try {
      await completeTask(task.id, { actor_user_id: userTableId });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Complete failed');
    }
  };

  return (
    <>
      <div
        className="bg-white rounded-lg border p-3"
        style={{ borderColor: COLORS.warning + '66' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span style={{ color: COLORS.warning }}>⏰</span>
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: COLORS.warning }}
          >
            Overdue
          </h3>
          <span className="text-xs ml-auto" style={{ color: COLORS.slate }}>
            {overdue.length}
          </span>
        </div>
        {error && (
          <div className="text-xs px-1 py-0.5 rounded mb-1" style={{ color: COLORS.warning }}>
            {error}
          </div>
        )}
        {loading && (
          <div className="text-xs italic" style={{ color: COLORS.slate }}>
            Loading…
          </div>
        )}
        {!loading && overdue.length === 0 && (
          <div className="text-xs italic" style={{ color: COLORS.slate }}>
            Nothing overdue. Nice.
          </div>
        )}
        {!loading &&
          overdue.map((task) => (
            <div
              key={task.id}
              className="py-1.5 px-1 border-b last:border-b-0"
              style={{ borderColor: COLORS.slate + '22' }}
            >
              <div
                className="text-sm cursor-pointer truncate"
                style={{ color: COLORS.midnight }}
                onClick={() => setOpenTaskId(task.id)}
                title={task.subject}
              >
                {task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                {task.subject}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: COLORS.warning }}>
                {task.due_at && ageLabel(task.due_at)}
              </div>
              <div className="flex items-center gap-1 mt-1">
                <button
                  type="button"
                  onClick={(e) => handlePinTop3(e, task)}
                  className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100"
                  style={{ color: COLORS.steel }}
                  title="Pin to Top 3"
                >
                  ★
                </button>
                <button
                  type="button"
                  onClick={(e) => handleClearDue(e, task)}
                  className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100"
                  style={{ color: COLORS.steel }}
                  title="Clear due date"
                >
                  Clear due
                </button>
                <button
                  type="button"
                  onClick={(e) => handleComplete(e, task)}
                  className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100 ml-auto"
                  style={{ color: COLORS.steel }}
                  title="Mark complete"
                >
                  ✓
                </button>
              </div>
            </div>
          ))}
      </div>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </>
  );
};

export default OverdueLane;
