import React from 'react';
import {
  BlockInstanceWithTasks,
  ScheduledTaskWithTask,
  TaskBlockInstanceStatus,
} from '../../../types/taskBlock';

// Renders one task_block_instance with its queued tasks.
// Read-only in PR 5; PR 6 wires drag-to-reorder + add/remove, PR 7 wires
// block-edit / skip / ad-hoc creation.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  accent: '#3B82F6',
} as const;

const formatTime12 = (t: string): string => {
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${period}`;
};

const formatRange = (start: string, durationMin: number): string => {
  const [hh, mm] = start.split(':').map((s) => parseInt(s, 10));
  const endMin = hh * 60 + mm + durationMin;
  const endH = Math.floor(endMin / 60) % 24;
  const endM = endMin % 60;
  const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  return `${formatTime12(start)} – ${formatTime12(endStr)}`;
};

const STATUS_LABEL: Record<TaskBlockInstanceStatus, string> = {
  scheduled: '',
  in_progress: 'In progress',
  completed: 'Completed',
  skipped: 'Skipped',
};

const ownerName = (st: ScheduledTaskWithTask): string => {
  const u = st.task.owner;
  if (!u) return 'Unassigned';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unnamed';
};

interface BlockRowProps {
  instance: BlockInstanceWithTasks;
  isCurrent?: boolean;
  /** Pass true when the date is today and now is past the block's end time. */
  isPast?: boolean;
  onTaskClick?: (taskId: string) => void;
}

export const BlockRow: React.FC<BlockRowProps> = ({
  instance,
  isCurrent,
  isPast,
  onTaskClick,
}) => {
  const status = (instance.status ?? 'scheduled') as TaskBlockInstanceStatus;
  const isSkipped = status === 'skipped';
  const taskCount = instance.scheduled_tasks?.length ?? 0;
  // Past-time empty blocks dim per the resolved Phase 2 decision (2026-05-09):
  // the user can see the day's shape without past empties demanding attention.
  const dim = isSkipped || (isPast && taskCount === 0);

  const accent = isCurrent ? COLORS.accent : COLORS.slate;

  return (
    <div
      className="bg-white rounded-lg border mb-2 overflow-hidden"
      style={{
        borderColor: isCurrent ? COLORS.accent : COLORS.slate + '66',
        opacity: dim ? 0.55 : 1,
      }}
    >
      <div className="flex items-stretch">
        {/* Left status accent bar */}
        <div className="w-1 flex-shrink-0" style={{ backgroundColor: accent }} />

        {/* Body */}
        <div className="flex-1 px-3 py-2.5 min-w-0">
          {/* Header row: time range, name, status, count */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="text-xs font-medium whitespace-nowrap"
                style={{ color: COLORS.steel }}
              >
                {formatRange(instance.start_time, instance.duration_minutes)}
              </span>
              <span
                className="text-sm font-semibold truncate"
                style={{ color: COLORS.midnight, textDecoration: isSkipped ? 'line-through' : undefined }}
              >
                {instance.name}
              </span>
              <span
                className="text-xs px-1.5 py-0.5 rounded uppercase tracking-wide"
                style={{ backgroundColor: COLORS.slate + '22', color: COLORS.steel }}
              >
                {instance.category}
              </span>
              {isCurrent && (
                <span
                  className="text-xs px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: COLORS.accent, color: COLORS.white }}
                >
                  CURRENT
                </span>
              )}
              {STATUS_LABEL[status] && (
                <span className="text-xs italic" style={{ color: COLORS.steel }}>
                  {STATUS_LABEL[status]}
                </span>
              )}
            </div>
            <span className="text-xs whitespace-nowrap" style={{ color: COLORS.slate }}>
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </span>
          </div>

          {/* Task list */}
          {!isSkipped && taskCount > 0 && (
            <div className="mt-2 space-y-1">
              {instance.scheduled_tasks.map((st) => {
                const completed = st.task.status === 'completed';
                return (
                  <div
                    key={st.id}
                    className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                    style={{ color: COLORS.midnight }}
                    onClick={() => onTaskClick?.(st.task.id)}
                  >
                    <span style={{ color: completed ? '#16a34a' : COLORS.slate }}>
                      {completed ? '✓' : '○'}
                    </span>
                    <span
                      className="flex-1 truncate"
                      style={{
                        textDecoration: completed ? 'line-through' : undefined,
                        opacity: completed ? 0.6 : 1,
                      }}
                      title={st.task.subject}
                    >
                      {st.task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                      {st.task.subject}
                    </span>
                    {st.task.duration_minutes && (
                      <span className="text-xs whitespace-nowrap" style={{ color: COLORS.slate }}>
                        {st.task.duration_minutes}m
                      </span>
                    )}
                    <span
                      className="text-xs whitespace-nowrap"
                      style={{ color: COLORS.steel }}
                      title={ownerName(st)}
                    >
                      {ownerName(st).split(' ').map((p) => p[0] ?? '').join('').slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty state inside an active block */}
          {!isSkipped && taskCount === 0 && !dim && (
            <div className="mt-1.5 text-xs italic" style={{ color: COLORS.slate }}>
              No tasks scheduled.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BlockRow;
