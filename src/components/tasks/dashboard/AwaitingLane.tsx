import React, { useState } from 'react';
import { unblockTask, useTaskList } from '../../../hooks/useTasks';
import { TaskStatus, TaskWithRelations } from '../../../types/task';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Awaiting lane (spec §6.9 — added 2026-05-10). Tasks the user has parked
// while waiting on something external (vendor reply, attorney sign-off,
// client signature). Lives below the timeline alongside Watching — both
// are "secondary visibility" lanes that shouldn't crowd active work.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  warning: '#A27B5C',
} as const;

// Hoisted so identity is stable across renders (see Top3Lane note).
const ACTIVE_STATUSES: TaskStatus[] = ['open', 'in_progress'];

interface AwaitingLaneProps {
  ownerId: string;
  /** Bump shared dashboard refresh signal so peer lanes refetch. */
  onTaskChanged?: () => void;
}

const blockedAge = (iso: string): string => {
  const days = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86400000));
  if (days === 0) return 'today';
  if (days === 1) return '1d';
  return `${days}d`;
};

export const AwaitingLane: React.FC<AwaitingLaneProps> = ({ ownerId, onTaskChanged }) => {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const { tasks, loading, error, refetch } = useTaskList({
    owner_id: ownerId,
    status: ACTIVE_STATUSES,
    blocked: true,
  });

  // Sort oldest-first by blocked_at — the longest waits stay visible.
  const sorted = [...tasks].sort((a, b) => {
    const aTime = a.blocked_at ? new Date(a.blocked_at).getTime() : 0;
    const bTime = b.blocked_at ? new Date(b.blocked_at).getTime() : 0;
    return aTime - bTime;
  });

  const handleUnblock = async (e: React.MouseEvent, task: TaskWithRelations) => {
    e.stopPropagation();
    try {
      await unblockTask(task.id);
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Unblock failed');
    }
  };

  // Hide entirely when empty — secondary lane shouldn't take space if there's
  // nothing to surface.
  if (!loading && !error && sorted.length === 0) return null;

  return (
    <>
      <div
        className="bg-white rounded-lg border mt-4 p-3"
        style={{ borderColor: COLORS.slate + '66' }}
      >
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-full flex items-center gap-1.5 text-left"
        >
          <span style={{ color: COLORS.steel }}>{collapsed ? '▸' : '▾'}</span>
          <span style={{ color: COLORS.steel }}>⏸</span>
          <h3
            className="text-xs font-semibold uppercase tracking-wide"
            style={{ color: COLORS.midnight }}
          >
            Awaiting
          </h3>
          <span className="text-xs ml-2" style={{ color: COLORS.slate }}>
            ({sorted.length} blocked, oldest first)
          </span>
        </button>
        {!collapsed && (
          <>
            {error && (
              <div className="text-xs px-1 py-0.5 rounded mt-2" style={{ color: COLORS.warning }}>
                {error}
              </div>
            )}
            {loading && (
              <div className="text-xs italic mt-2" style={{ color: COLORS.slate }}>
                Loading…
              </div>
            )}
            {!loading &&
              sorted.map((task) => (
                <div
                  key={task.id}
                  className="py-1.5 px-1 border-b last:border-b-0 mt-1"
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
                  <div className="text-[11px] mt-0.5" style={{ color: COLORS.steel }}>
                    {task.blocked_reason ? `${task.blocked_reason} · ` : ''}
                    {task.blocked_at && `blocked ${blockedAge(task.blocked_at)}`}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <button
                      type="button"
                      onClick={(e) => handleUnblock(e, task)}
                      className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100"
                      style={{ color: COLORS.steel }}
                      title="Unblock — return to inbox"
                    >
                      ▶ Unblock
                    </button>
                  </div>
                </div>
              ))}
          </>
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

export default AwaitingLane;
