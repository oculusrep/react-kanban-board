import React from 'react';
import { Link } from 'react-router-dom';
import { completeTask, deleteTask, useTaskList } from '../../hooks/useTasks';
import {
  TaskLinkableObjectType,
  TaskWithRelations,
} from '../../types/task';
import QuickAddTaskButton from './QuickAddTaskButton';

// Composable open-tasks panel per docs/OVIS_OVERLAY_UX.md.
// Takes objectType + objectId; renders identically wherever mounted —
// detail page sidebar, pin detail slideout, kanban card slideout, etc.
//
// Renders only OPEN tasks (not completed/cancelled) since this panel's
// job is "what's pending on this object." Completed tasks belong on the
// activity/chat timeline (spec §13).

interface OpenTasksPanelProps {
  objectType: TaskLinkableObjectType;
  objectId: string;
  objectLabel?: string;
  /** Optional max-height for the scrollable list. Defaults to 400px. */
  maxHeightPx?: number;
}

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
} as const;

const formatDate = (iso: string | null): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return '';
  }
};

const isOverdue = (task: TaskWithRelations): boolean => {
  if (!task.due_at) return false;
  return new Date(task.due_at).getTime() < Date.now();
};

const ownerInitials = (task: TaskWithRelations): string => {
  const u = task.owner;
  if (!u) return '?';
  const f = u.first_name?.[0] ?? '';
  const l = u.last_name?.[0] ?? '';
  return (f + l).toUpperCase() || u.email?.[0]?.toUpperCase() || '?';
};

const ownerName = (task: TaskWithRelations): string => {
  const u = task.owner;
  if (!u) return 'Unassigned';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unnamed';
};

export const OpenTasksPanel: React.FC<OpenTasksPanelProps> = ({
  objectType,
  objectId,
  objectLabel,
  maxHeightPx = 400,
}) => {
  const { tasks, loading, error, refetch } = useTaskList({
    [`${objectType}_id`]: objectId,
    status: 'open',
  });

  const handleComplete = async (task: TaskWithRelations) => {
    try {
      await completeTask(task.id);
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to complete task');
    }
  };

  const handleDelete = async (task: TaskWithRelations) => {
    if (!confirm(`Delete task: "${task.subject}"?`)) return;
    try {
      await deleteTask(task.id);
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to delete task');
    }
  };

  return (
    <div className="space-y-2">
      {/* Header row with quick-add */}
      <div className="flex items-center justify-between">
        <span className="text-xs" style={{ color: COLORS.steel }}>
          {loading ? 'Loading…' : `${tasks.length} open`}
        </span>
        <QuickAddTaskButton
          linkedObjectType={objectType}
          linkedObjectId={objectId}
          linkedObjectLabel={objectLabel}
          onTaskCreated={() => refetch()}
        />
      </div>

      {error && (
        <div
          className="text-xs px-2 py-1 rounded"
          style={{ color: '#A27B5C', backgroundColor: '#fff5ec' }}
        >
          {error}
        </div>
      )}

      {/* Task list */}
      <div
        className="overflow-y-auto"
        style={{ maxHeight: `${maxHeightPx}px` }}
      >
        {!loading && tasks.length === 0 && (
          <div
            className="text-xs italic px-2 py-3 text-center"
            style={{ color: COLORS.slate }}
          >
            No open tasks.
          </div>
        )}
        {tasks.map((task) => {
          const overdue = isOverdue(task);
          return (
            <div
              key={task.id}
              className="flex items-start gap-2 py-2 px-2 border-b last:border-b-0 hover:bg-gray-50"
              style={{ borderColor: COLORS.slate + '33' }}
            >
              <input
                type="checkbox"
                checked={false}
                onChange={() => handleComplete(task)}
                aria-label="Complete task"
                className="mt-0.5"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-sm truncate"
                    style={{ color: COLORS.midnight }}
                    title={task.subject}
                  >
                    {task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                    {task.subject}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: COLORS.slate + '33', color: COLORS.steel }}
                    title={ownerName(task)}
                  >
                    {ownerInitials(task)}
                  </span>
                  <span
                    className="text-xs"
                    style={{
                      color: overdue ? '#A27B5C' : COLORS.slate,
                      fontWeight: overdue ? 600 : undefined,
                    }}
                  >
                    {task.category}
                  </span>
                  {task.due_at && (
                    <span
                      className="text-xs"
                      style={{
                        color: overdue ? '#A27B5C' : COLORS.slate,
                        fontWeight: overdue ? 600 : undefined,
                      }}
                      title={overdue ? 'Overdue' : 'Due'}
                    >
                      {formatDate(task.due_at)}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Link
                  to={`/tasks?id=${task.id}`}
                  className="text-xs px-1.5 py-0.5 rounded hover:underline"
                  style={{ color: COLORS.steel }}
                  title="View task"
                >
                  Open
                </Link>
                <button
                  type="button"
                  onClick={() => handleDelete(task)}
                  className="text-xs px-1.5 py-0.5 rounded hover:bg-red-50"
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
    </div>
  );
};

export default OpenTasksPanel;
