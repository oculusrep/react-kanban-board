import React, { useState } from 'react';
import { useTaskList, updateTask, completeTask } from '../../../hooks/useTasks';
import { useAuth } from '../../../contexts/AuthContext';
import { TaskStatus, TaskWithRelations } from '../../../types/task';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Hoisted so its reference is stable across renders — useTaskList's deps
// treat array identity as a change and would refetch in an infinite loop.
const ACTIVE_STATUSES: TaskStatus[] = ['open', 'in_progress'];

// Top 3 today lane (spec §6.2 #1, §11). Up to 3 cross-block priorities pinned
// to the viewed date. Pin/unpin from the task slideout (or via the unpin
// button here).

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  star: '#F59E0B',
} as const;

interface Top3LaneProps {
  ownerId: string;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  viewDate: string;
  /** Bump shared dashboard refresh signal so peer lanes refetch. */
  onTaskChanged?: () => void;
}

export const Top3Lane: React.FC<Top3LaneProps> = ({ ownerId, viewDate, onTaskChanged }) => {
  const { userTableId } = useAuth();
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { tasks, loading, error, refetch } = useTaskList({
    owner_id: ownerId,
    top3_date: viewDate,
    status: ACTIVE_STATUSES,
  });

  const handleUnpin = async (e: React.MouseEvent, task: TaskWithRelations) => {
    e.stopPropagation();
    try {
      await updateTask(task.id, { top3_date: null });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unpin failed');
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
        style={{ borderColor: COLORS.slate + '66' }}
      >
        <div className="flex items-center gap-1.5 mb-2">
          <span style={{ color: COLORS.star }}>★</span>
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.midnight }}>
            Top 3 Today
          </h3>
          <span className="text-xs ml-auto" style={{ color: COLORS.slate }}>
            {tasks.length} / 3
          </span>
        </div>
        {error && (
          <div className="text-xs px-1 py-0.5 rounded mb-1" style={{ color: '#A27B5C' }}>
            {error}
          </div>
        )}
        {loading && (
          <div className="text-xs italic" style={{ color: COLORS.slate }}>
            Loading…
          </div>
        )}
        {!loading && tasks.length === 0 && (
          <div className="text-xs italic" style={{ color: COLORS.slate }}>
            No Top 3 set for this day yet. Pin from any task.
          </div>
        )}
        {!loading &&
          tasks.map((task) => (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
              style={{ color: COLORS.midnight }}
              onClick={() => setOpenTaskId(task.id)}
            >
              <input
                type="checkbox"
                checked={false}
                onChange={(e) => handleComplete(e as unknown as React.MouseEvent, task)}
                onClick={(e) => e.stopPropagation()}
                aria-label="Complete task"
              />
              <span className="flex-1 truncate" title={task.subject}>
                {task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                {task.subject}
              </span>
              <button
                type="button"
                onClick={(e) => handleUnpin(e, task)}
                className="text-xs px-1 rounded hover:bg-gray-100"
                style={{ color: COLORS.steel }}
                title="Unpin from Top 3"
              >
                ★
              </button>
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

export default Top3Lane;
