import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { completeTask, useTaskList } from '../../../hooks/useTasks';
import { useAuth } from '../../../contexts/AuthContext';
import { TaskCategory, TaskWithRelations } from '../../../types/task';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Adaptive non-blocking layout (spec §11.1). Shown when the user has no
// active block templates AND no instances for the viewed date. Renders the
// user's open tasks sorted by High flag → Top 3 today → due date, with a
// dismissible "Set up time blocks" CTA.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

const CATEGORIES: { value: TaskCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'ovis', label: 'OVIS' },
  { value: 'email', label: 'Email' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

const DISMISS_KEY = 'tasks-v2.set-up-blocks-cta-dismissed';

const sortOpenTasks = (tasks: TaskWithRelations[], viewDate: string): TaskWithRelations[] => {
  return [...tasks].sort((a, b) => {
    // High flag first
    if (a.high_flag !== b.high_flag) return a.high_flag ? -1 : 1;
    // Top 3 for the viewed date next
    const aTop3 = a.top3_date === viewDate ? 1 : 0;
    const bTop3 = b.top3_date === viewDate ? 1 : 0;
    if (aTop3 !== bTop3) return bTop3 - aTop3;
    // Due date (nulls last)
    const aDue = a.due_at ? new Date(a.due_at).getTime() : null;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : null;
    if (aDue !== bDue) {
      if (aDue === null) return 1;
      if (bDue === null) return -1;
      return aDue - bDue;
    }
    // Stable fallback: most recently created first
    const aCreated = new Date(a.created_at).getTime();
    const bCreated = new Date(b.created_at).getTime();
    return bCreated - aCreated;
  });
};

const formatDateMMDD = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
};

interface TodaysTasksListProps {
  ownerId: string;
  /** YYYY-MM-DD — used to detect Top-3-for-this-date. */
  viewDate: string;
}

export const TodaysTasksList: React.FC<TodaysTasksListProps> = ({ ownerId, viewDate }) => {
  const { userTableId } = useAuth();
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [ctaDismissed, setCtaDismissed] = useState(
    () => typeof window !== 'undefined' && window.localStorage.getItem(DISMISS_KEY) === '1'
  );

  const { tasks, loading, error, refetch } = useTaskList({
    status: 'open',
    owner_id: ownerId,
    ...(categoryFilter !== 'all' ? { category: categoryFilter } : {}),
  });

  const sorted = useMemo(() => sortOpenTasks(tasks, viewDate), [tasks, viewDate]);

  const dismissCta = () => {
    setCtaDismissed(true);
    if (typeof window !== 'undefined') window.localStorage.setItem(DISMISS_KEY, '1');
  };

  const handleComplete = async (task: TaskWithRelations) => {
    if (!userTableId) return;
    try {
      await completeTask(task.id, { actor_user_id: userTableId });
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Complete failed');
    }
  };

  return (
    <>
      {!ctaDismissed && (
        <div
          className="bg-white rounded-lg border p-3 mb-3 flex items-center justify-between"
          style={{ borderColor: COLORS.slate + '99' }}
        >
          <div className="text-sm" style={{ color: COLORS.midnight }}>
            Want to plan around themed time blocks?{' '}
            <Link
              to="/settings/time-blocks"
              className="font-medium hover:underline"
              style={{ color: COLORS.midnight }}
            >
              Set up time blocks →
            </Link>
          </div>
          <button
            type="button"
            onClick={dismissCta}
            className="text-xs px-2 py-1 rounded hover:bg-gray-50 ml-2"
            style={{ color: COLORS.slate }}
            title="Don't show this again"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold" style={{ color: COLORS.midnight }}>
          Today's Tasks
        </h2>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as TaskCategory | 'all')}
          className="text-xs px-2 py-1 rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.steel }}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div
          className="p-3 rounded text-sm mb-2"
          style={{ color: COLORS.warning, backgroundColor: '#fff5ec' }}
        >
          {error}
        </div>
      )}

      <div
        className="bg-white rounded-lg border overflow-hidden"
        style={{ borderColor: COLORS.slate + '66' }}
      >
        {loading && (
          <div className="px-3 py-6 text-sm text-center" style={{ color: COLORS.slate }}>
            Loading…
          </div>
        )}
        {!loading && sorted.length === 0 && (
          <div className="px-3 py-6 text-sm text-center" style={{ color: COLORS.slate }}>
            No open tasks.
          </div>
        )}
        {!loading &&
          sorted.map((task) => {
            const isTop3 = task.top3_date === viewDate;
            return (
              <div
                key={task.id}
                className="flex items-center gap-2 px-3 py-2 border-b last:border-b-0 hover:bg-gray-50 cursor-pointer"
                style={{ borderColor: COLORS.slate + '22' }}
                onClick={() => setOpenTaskId(task.id)}
              >
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => handleComplete(task)}
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Complete task"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm" style={{ color: COLORS.midnight }}>
                    {task.high_flag && <span title="High priority">⚑</span>}
                    {isTop3 && (
                      <span
                        className="text-[10px] px-1 py-0.5 rounded"
                        style={{ backgroundColor: '#FEF3C7', color: '#92400E' }}
                        title="Top 3 today"
                      >
                        TOP3
                      </span>
                    )}
                    <span className="truncate" title={task.subject}>
                      {task.subject}
                    </span>
                  </div>
                </div>
                <span
                  className="text-[10px] px-1 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                  style={{ backgroundColor: COLORS.slate + '22', color: COLORS.steel }}
                >
                  {task.category}
                </span>
                {task.due_at && (
                  <span className="text-xs whitespace-nowrap" style={{ color: COLORS.slate }}>
                    {formatDateMMDD(task.due_at)}
                  </span>
                )}
              </div>
            );
          })}
      </div>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </>
  );
};

export default TodaysTasksList;
