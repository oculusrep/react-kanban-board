import React, { useState } from 'react';
import { useTaskList } from '../../../hooks/useTasks';
import { TaskStatus, TaskWithRelations } from '../../../types/task';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Hoisted so its reference is stable across renders — useTaskList's deps
// treat array identity as a change and would refetch in an infinite loop.
const ACTIVE_STATUSES: TaskStatus[] = ['open', 'in_progress'];

// Watching lane (spec §8.2). Shows uncompleted tasks the current user
// delegated to someone else. On the assigner's dashboard, NOT the
// assignee's. Sort: oldest-uncompleted first so stale delegations stay
// visible.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

const ageLabel = (iso: string): string => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return '1d';
  return `${days}d`;
};

const ownerName = (task: TaskWithRelations): string => {
  const u = task.owner;
  if (!u) return 'Unassigned';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unnamed';
};

interface WatchingLaneProps {
  /** OVIS user.id of the current user (the assigner). */
  assignerId: string;
}

export const WatchingLane: React.FC<WatchingLaneProps> = ({ assignerId }) => {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { tasks, loading, error, refetch } = useTaskList({
    assigned_by_id: assignerId,
    owner_id_not: assignerId,
    status: ACTIVE_STATUSES,
  });

  // Sort oldest-first by created_at — stale delegations bubble up.
  const sorted = [...tasks].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  // Default-collapse when empty so the lane doesn't take up space.
  if (!loading && sorted.length === 0 && !error) {
    return null;
  }

  return (
    <>
      <div
        className="bg-white rounded-lg border mt-4"
        style={{ borderColor: COLORS.slate + '66' }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 rounded-lg"
        >
          <div className="flex items-center gap-1.5">
            <span style={{ color: COLORS.slate }}>{collapsed ? '▸' : '▾'}</span>
            <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.midnight }}>
              Watching
            </h3>
            <span className="text-xs" style={{ color: COLORS.slate }}>
              ({sorted.length} delegated, oldest first)
            </span>
          </div>
        </button>
        {!collapsed && (
          <div className="px-3 pb-2">
            {error && (
              <div className="text-xs px-1 py-0.5 rounded" style={{ color: COLORS.warning }}>
                {error}
              </div>
            )}
            {loading && (
              <div className="text-xs italic" style={{ color: COLORS.slate }}>
                Loading…
              </div>
            )}
            {!loading &&
              sorted.map((task) => {
                const completed = task.status === 'completed';
                return (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 py-1 px-1 rounded hover:bg-gray-50 cursor-pointer text-sm"
                    style={{ color: COLORS.midnight }}
                    onClick={() => setOpenTaskId(task.id)}
                  >
                    <span style={{ color: completed ? '#16a34a' : COLORS.slate }}>
                      {completed ? '✓' : '○'}
                    </span>
                    <span className="flex-1 truncate" title={task.subject}>
                      {task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                      {task.subject}
                    </span>
                    <span className="text-xs" style={{ color: COLORS.steel }}>
                      → {ownerName(task)}
                    </span>
                    <span className="text-xs" style={{ color: COLORS.slate }}>
                      {ageLabel(task.created_at)}
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </>
  );
};

export default WatchingLane;
