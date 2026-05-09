import React, { useState } from 'react';
import { Draggable, Droppable } from '@hello-pangea/dnd';
import { unscheduleTask } from '../../../hooks/useTaskBlocks';
import {
  BlockInstanceWithTasks,
  ScheduledTaskWithTask,
  TaskBlockInstanceStatus,
} from '../../../types/taskBlock';
import BlockTaskPicker from './BlockTaskPicker';
import BlockEditModal from './BlockEditModal';

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
  const status = (instance.status ?? 'scheduled') as TaskBlockInstanceStatus;
  const isSkipped = status === 'skipped';
  const taskCount = instance.scheduled_tasks?.length ?? 0;
  // Past-time empty blocks dim per the resolved Phase 2 decision (2026-05-09):
  // the user can see the day's shape without past empties demanding attention.
  const dim = isSkipped || (isPast && taskCount === 0);

  const accent = isCurrent ? COLORS.accent : COLORS.slate;
  const taskIdsInThisBlock = (instance.scheduled_tasks ?? []).map((st) => st.task.id);

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

          {/* Task list — droppable so cross-block drags can land in empty blocks */}
          {!isSkipped && (
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
                      <Draggable key={st.id} draggableId={st.id} index={idx}>
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
