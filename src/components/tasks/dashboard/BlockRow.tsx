import React, { useEffect, useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { unscheduleTask } from '../../../hooks/useTaskBlocks';
import {
  BlockInstanceWithTasks,
  ScheduledTaskWithTask,
  TaskBlockInstanceStatus,
} from '../../../types/taskBlock';
import BlockTaskPicker from './BlockTaskPicker';
import BlockEditModal from './BlockEditModal';
import PipelineGroupedView from './PipelineGroupedView';

// Per-user persisted preference for the Pipeline-grouped-by-client toggle
// (spec §15.2). Per-browser, not synced — Phase 2.5 doesn't need user-prefs
// infrastructure for this.
const GROUPED_PREF_KEY = 'tasks-v2.pipeline-grouped-by-client';

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
  warning: '#A27B5C',
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
  ownerId: string;
  /** Task ids scheduled into ANY block today — used by the picker. */
  scheduledTaskIdsAcrossDay: string[];
  isCurrent?: boolean;
  /** Pass true when the date is today and now is past the block's end time. */
  isPast?: boolean;
  onTaskClick?: (taskId: string) => void;
  onChanged: () => void;
}

export const BlockRow: React.FC<BlockRowProps> = ({
  instance,
  ownerId,
  scheduledTaskIdsAcrossDay,
  isCurrent,
  isPast,
  onTaskClick,
  onChanged,
}) => {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const isPipeline = instance.category === 'pipeline';
  const [grouped, setGrouped] = useState<boolean>(() => {
    if (!isPipeline || typeof window === 'undefined') return false;
    return window.localStorage.getItem(GROUPED_PREF_KEY) === '1';
  });
  useEffect(() => {
    if (!isPipeline || typeof window === 'undefined') return;
    window.localStorage.setItem(GROUPED_PREF_KEY, grouped ? '1' : '0');
  }, [grouped, isPipeline]);
  const status = (instance.status ?? 'scheduled') as TaskBlockInstanceStatus;
  const isSkipped = status === 'skipped';
  const taskCount = instance.scheduled_tasks?.length ?? 0;
  // Past-time empty blocks dim per the resolved Phase 2 decision (2026-05-09):
  // the user can see the day's shape without past empties demanding attention.
  const dim = isSkipped || (isPast && taskCount === 0);

  const accent = isCurrent ? COLORS.accent : COLORS.slate;
  const taskIdsInThisBlock = (instance.scheduled_tasks ?? []).map((st) => st.task.id);

  // Capacity: sum of scheduled task durations vs the block's own duration.
  // Tasks without a duration_minutes contribute 0 (treat as "TBD"). When
  // the sum exceeds the block, the bar turns terracotta and an explicit
  // overbook indicator renders below the bar.
  const scheduledMinutes = (instance.scheduled_tasks ?? []).reduce(
    (sum, st) => sum + (st.task.duration_minutes ?? 0),
    0
  );
  const blockMinutes = instance.duration_minutes;
  const capacityPct = blockMinutes > 0
    ? Math.min(100, Math.round((scheduledMinutes / blockMinutes) * 100))
    : 0;
  const overbookedMinutes = Math.max(0, scheduledMinutes - blockMinutes);
  const isOverbooked = overbookedMinutes > 0;
  const isAtCapacity = !isOverbooked && scheduledMinutes >= blockMinutes && blockMinutes > 0;
  const tasksMissingDuration = (instance.scheduled_tasks ?? []).filter(
    (st) => st.task.duration_minutes == null
  ).length;

  const handleRemove = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      await unscheduleTask(taskId);
      onChanged();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to remove task');
    }
  };

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
            <div className="flex items-center gap-2 relative">
              <span className="text-xs whitespace-nowrap" style={{ color: COLORS.slate }}>
                {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
              </span>
              {isPipeline && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setGrouped((v) => !v);
                  }}
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100"
                  style={{
                    color: grouped ? COLORS.midnight : COLORS.steel,
                    fontWeight: grouped ? 600 : undefined,
                  }}
                  title={grouped ? 'Switch to flat view' : 'Group by client'}
                >
                  {grouped ? '⊞ Grouped' : '⊟ Flat'}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditOpen(true);
                }}
                className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100"
                style={{ color: COLORS.steel }}
                title="Edit block"
              >
                ✎
              </button>
              {!isSkipped && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerOpen((v) => !v);
                  }}
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100"
                  style={{ color: COLORS.steel }}
                  title="Add task to this block"
                >
                  + Add
                </button>
              )}
              {pickerOpen && (
                <BlockTaskPicker
                  ownerId={ownerId}
                  blockInstanceId={instance.id}
                  excludeTaskIds={taskIdsInThisBlock}
                  scheduledTaskIds={scheduledTaskIdsAcrossDay}
                  onPicked={onChanged}
                  onClose={() => setPickerOpen(false)}
                />
              )}
            </div>
          </div>

          {/* Capacity bar (spec §6.10): shows how full the block is based on
              scheduled task durations. Slate fill while under capacity,
              terracotta when overbooked. Skipped blocks hide the bar. */}
          {!isSkipped && (
            <div className="mt-1.5">
              <div
                className="relative h-1.5 rounded overflow-hidden"
                style={{ backgroundColor: COLORS.slate + '22' }}
                title={
                  isOverbooked
                    ? `Overbooked by ${overbookedMinutes} min — ${scheduledMinutes}/${blockMinutes} scheduled`
                    : `${scheduledMinutes}/${blockMinutes} min scheduled`
                }
              >
                <div
                  className="h-full transition-all"
                  style={{
                    width: `${capacityPct}%`,
                    backgroundColor: isOverbooked
                      ? COLORS.warning
                      : isAtCapacity
                      ? COLORS.accent
                      : COLORS.steel,
                  }}
                />
              </div>
              <div
                className="mt-0.5 flex items-center justify-between text-[10px]"
                style={{
                  color: isOverbooked ? COLORS.warning : COLORS.slate,
                }}
              >
                <span>
                  {scheduledMinutes}/{blockMinutes} min scheduled
                  {tasksMissingDuration > 0 && (
                    <span style={{ color: COLORS.slate }}>
                      {' '}
                      ({tasksMissingDuration} task{tasksMissingDuration === 1 ? '' : 's'} missing duration)
                    </span>
                  )}
                </span>
                {isOverbooked && (
                  <span style={{ fontWeight: 600 }}>
                    ⚠ Over by {overbookedMinutes} min
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Pipeline grouped-by-client view — drag-rank disabled here per
              spec §15.2 (visual rollup only; toggle to Flat to reorder). */}
          {!isSkipped && isPipeline && grouped && (
            <PipelineGroupedView
              instance={instance}
              onTaskClick={onTaskClick}
              onChanged={onChanged}
            />
          )}

          {/* Flat (default) view — droppable so cross-block drags can land in empty blocks */}
          {!isSkipped && !(isPipeline && grouped) && (
            <Droppable droppableId={instance.id}>
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className="mt-2 space-y-1 rounded transition-colors"
                  style={{
                    minHeight: taskCount === 0 ? 32 : undefined,
                    backgroundColor: snapshot.isDraggingOver ? COLORS.accent + '11' : undefined,
                  }}
                >
                  {instance.scheduled_tasks.map((st, idx) => {
                    const completed = st.task.status === 'completed';
                    return (
                      <Draggable
                        key={st.id}
                        draggableId={`block:${st.id}:${st.task.id}`}
                        index={idx}
                      >
                        {(dragProvided, dragSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            {...dragProvided.dragHandleProps}
                            className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                            style={{
                              color: COLORS.midnight,
                              backgroundColor: dragSnapshot.isDragging ? COLORS.bg : undefined,
                              boxShadow: dragSnapshot.isDragging ? '0 2px 6px rgba(0,0,0,0.12)' : undefined,
                              ...dragProvided.draggableProps.style,
                            }}
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
                            <button
                              type="button"
                              onClick={(e) => handleRemove(e, st.task.id)}
                              className="text-xs px-1 rounded hover:bg-red-50 ml-1"
                              style={{ color: '#dc2626' }}
                              title="Remove from block (task itself is not deleted)"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                  {taskCount === 0 && !dim && (
                    <div className="text-xs italic px-2 py-1" style={{ color: COLORS.slate }}>
                      No tasks scheduled. Drag here or click + Add.
                    </div>
                  )}
                </div>
              )}
            </Droppable>
          )}
        </div>
      </div>
      {editOpen && (
        <BlockEditModal
          instance={instance}
          onClose={() => setEditOpen(false)}
          onChanged={onChanged}
        />
      )}
    </div>
  );
};

export default BlockRow;
