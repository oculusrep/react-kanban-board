import React, { useState } from 'react';
import {
  blockTask,
  deleteTask,
  markTaskTriaged,
  updateTask,
  useTaskList,
} from '../../../hooks/useTasks';
import {
  scheduleTaskInBlock,
  useBlockInstancesForDate,
} from '../../../hooks/useTaskBlocks';
import { TaskCategory, TaskWithRelations } from '../../../types/task';
import { isOverdue } from '../../../lib/taskOverdue';
import BlockTaskModal from '../BlockTaskModal';
import CategoryDropdown from '../CategoryDropdown';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Inbox lane (spec §7.4). Holds untriaged tasks: brand-new assignments,
// brain-dumped captures, uncategorized quick-adds. Each row supports
// inline triage actions so the user can clear the inbox quickly.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

interface InboxLaneProps {
  ownerId: string;
  /** Local YYYY-MM-DD — used to populate the inline schedule-into-block dropdown. */
  viewDate: string;
  /** Bump shared dashboard refresh signal so peer lanes refetch. */
  onTaskChanged?: () => void;
}

const ageDays = (createdAt: string): number => {
  const ms = Date.now() - new Date(createdAt).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
};

const ageLabel = (createdAt: string): string => {
  const days = ageDays(createdAt);
  if (days === 0) return 'today';
  if (days === 1) return '1d ago';
  return `${days}d ago`;
};

export const InboxLane: React.FC<InboxLaneProps> = ({ ownerId, viewDate, onTaskChanged }) => {
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<TaskWithRelations | null>(null);
  const { tasks, loading, error, refetch } = useTaskList({
    owner_id: ownerId,
    is_inbox: true,
    status: 'open',
  });
  const { instances } = useBlockInstancesForDate({ ownerId, onDate: viewDate });

  const handleSetCategory = async (task: TaskWithRelations, category: TaskCategory) => {
    try {
      // Category alone no longer leaves the inbox (revised §7.4 rule);
      // task stays here until pinned, scheduled, or explicitly triaged.
      await updateTask(task.id, { category });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Set category failed');
    }
  };

  const handleSetDueAt = async (task: TaskWithRelations, dueAt: string | null) => {
    try {
      await updateTask(task.id, { due_at: dueAt });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Set due date failed');
    }
  };

  const handleSchedule = async (task: TaskWithRelations, blockId: string) => {
    try {
      await scheduleTaskInBlock({ blockInstanceId: blockId, taskId: task.id });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Schedule failed');
    }
  };

  const handlePinTop3 = async (task: TaskWithRelations) => {
    try {
      await updateTask(task.id, { top3_date: viewDate });
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Pin failed');
    }
  };

  const handleTriaged = async (task: TaskWithRelations) => {
    try {
      await markTaskTriaged(task.id);
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Mark triaged failed');
    }
  };

  const handleBlockSubmit = async (reason: string) => {
    if (!blockTarget) return;
    try {
      await blockTask(blockTarget.id, reason);
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Block failed');
      throw err;
    }
  };

  const handleDelete = async (task: TaskWithRelations) => {
    if (!confirm(`Delete task: "${task.subject}"?`)) return;
    try {
      await deleteTask(task.id);
      onTaskChanged?.();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <>
      <div
        className="bg-white rounded-lg border p-3"
        style={{ borderColor: COLORS.slate + '66' }}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.midnight }}>
            Inbox
          </h3>
          <span className="text-xs" style={{ color: COLORS.slate }}>
            {tasks.length}
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
            Inbox zero. Brain dumps and new assignments land here.
          </div>
        )}
        {!loading &&
          tasks.map((task) => {
            const assignerName = task.assigned_by
              ? [task.assigned_by.first_name, task.assigned_by.last_name].filter(Boolean).join(' ')
              : null;
            return (
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
                <div className="text-[11px] mt-0.5" style={{ color: COLORS.slate }}>
                  {assignerName ? `from ${assignerName} · ` : ''}
                  {ageLabel(task.created_at)}
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  <CategoryDropdown
                    value={(task.category as TaskCategory | null) ?? null}
                    onChange={(c) => handleSetCategory(task, c)}
                  />
                  <input
                    type="date"
                    value={task.due_at ? task.due_at.slice(0, 10) : ''}
                    onChange={(e) => handleSetDueAt(task, e.target.value || null)}
                    className="text-[11px] px-1 py-0.5 rounded border"
                    style={{
                      borderColor: isOverdue(task.due_at)
                        ? COLORS.warning
                        : COLORS.slate,
                      color: isOverdue(task.due_at)
                        ? COLORS.warning
                        : COLORS.steel,
                    }}
                    title={
                      isOverdue(task.due_at)
                        ? `Overdue (was due ${task.due_at?.slice(0, 10)})`
                        : 'Set due date'
                    }
                  />
                  {instances.length > 0 && (
                    <select
                      value=""
                      onChange={(e) => {
                        if (e.target.value) handleSchedule(task, e.target.value);
                      }}
                      className="text-[11px] px-1 py-0.5 rounded border"
                      style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                    >
                      <option value="" disabled>
                        Schedule…
                      </option>
                      {instances.map((inst) => (
                        <option key={inst.id} value={inst.id}>
                          {inst.start_time.slice(0, 5)} {inst.name}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    type="button"
                    onClick={() => handlePinTop3(task)}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100"
                    style={{ color: COLORS.steel }}
                    title="Pin to Top 3"
                  >
                    ★
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlockTarget(task)}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100"
                    style={{ color: COLORS.steel }}
                    title="Awaiting (waiting on someone external)"
                  >
                    ⏸
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTriaged(task)}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-gray-100"
                    style={{ color: COLORS.steel }}
                    title="Mark triaged (keep as-is)"
                  >
                    ✓
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(task)}
                    className="text-[11px] px-1.5 py-0.5 rounded hover:bg-red-50 ml-auto"
                    style={{ color: '#dc2626' }}
                    title="Delete task"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
      </div>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />

      <BlockTaskModal
        isOpen={blockTarget !== null}
        onClose={() => setBlockTarget(null)}
        onSubmit={handleBlockSubmit}
        taskSubject={blockTarget?.subject}
      />
    </>
  );
};

export default InboxLane;
