import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  completeTask,
  deleteTask,
  reopenTask,
  useTaskList,
} from '../hooks/useTasks';
import {
  TaskCategory,
  TaskListFilters,
  TaskStatus,
  TaskWithRelations,
} from '../types/task';
import { useAuth } from '../contexts/AuthContext';
import TaskDetailSlideout from '../components/tasks/TaskDetailSlideout';

// All-tasks flat view (spec §15.3). The future "block-style" dashboard with
// timeline / Top 3 / Inbox / Watching lanes is Phase 2 (per
// docs/TASK_SYSTEM_V2_PHASE_1_PLAN.md). v1 of this page is a clean, filterable
// table that replaces the v1 TaskDashboardPage.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
} as const;

const STATUS_OPTIONS: { value: TaskStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const CATEGORY_OPTIONS: { value: TaskCategory | 'all'; label: string }[] = [
  { value: 'all', label: 'All categories' },
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'ovis', label: 'OVIS' },
  { value: 'email', label: 'Email' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

interface LinkedToCellProps {
  task: TaskWithRelations;
}

const LinkedToCell: React.FC<LinkedToCellProps> = ({ task }) => {
  const links: { label: string; to: string }[] = [];
  if (task.client) links.push({ label: task.client.client_name || 'Client', to: `/client/${task.client.id}` });
  if (task.deal) links.push({ label: task.deal.deal_name || 'Deal', to: `/deal/${task.deal.id}` });
  if (task.property) links.push({ label: task.property.property_name || task.property.address || 'Property', to: `/property/${task.property.id}` });
  if (task.site_submit) links.push({ label: task.site_submit.site_submit_name || 'Site Submit', to: `/site-submit/${task.site_submit.id}` });
  if (task.assignment) links.push({ label: task.assignment.assignment_name || 'Assignment', to: `/assignment/${task.assignment.id}` });
  if (task.contact) {
    const name = [task.contact.first_name, task.contact.last_name].filter(Boolean).join(' ') || 'Contact';
    links.push({ label: name, to: `/contact/${task.contact.id}` });
  }
  if (links.length === 0) return <span className="text-xs" style={{ color: COLORS.slate }}>—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {links.map((l, i) => (
        <Link
          key={i}
          to={l.to}
          className="text-xs px-1.5 py-0.5 rounded hover:underline"
          style={{ backgroundColor: COLORS.slate + '33', color: COLORS.steel }}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
};

const formatDate = (iso: string | null): string => {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  } catch {
    return '—';
  }
};

const isOverdue = (task: TaskWithRelations): boolean => {
  if (!task.due_at || task.status === 'completed' || task.status === 'cancelled') return false;
  return new Date(task.due_at).getTime() < Date.now();
};

const ownerLabel = (task: TaskWithRelations): string => {
  const u = task.owner;
  if (!u) return 'Unassigned';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unnamed';
};

type SortKey = 'subject' | 'category' | 'owner' | 'due' | 'status';
type SortDir = 'asc' | 'desc';

const sortValue = (task: TaskWithRelations, key: SortKey): string | number | null => {
  switch (key) {
    case 'subject':
      return (task.subject || '').toLowerCase();
    case 'category':
      return (task.category || '').toLowerCase();
    case 'owner':
      return ownerLabel(task).toLowerCase();
    case 'due': {
      // Mirrors what the cell shows: completed_at when completed, else due_at.
      const iso = task.status === 'completed' ? task.completed_at : task.due_at;
      return iso ? new Date(iso).getTime() : null;
    }
    case 'status':
      return (task.status || '').toLowerCase();
  }
};

const compareTasks = (a: TaskWithRelations, b: TaskWithRelations, key: SortKey, dir: SortDir): number => {
  const av = sortValue(a, key);
  const bv = sortValue(b, key);
  // Nulls always sort to the end regardless of direction.
  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;
  let cmp: number;
  if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
  else cmp = String(av).localeCompare(String(bv));
  return dir === 'asc' ? cmp : -cmp;
};

export const TasksPage: React.FC = () => {
  const { userTableId } = useAuth();
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open');
  const [categoryFilter, setCategoryFilter] = useState<TaskCategory | 'all'>('all');
  const [highOnly, setHighOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const handleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('asc');
    }
  };

  const filters: TaskListFilters = useMemo(() => {
    const f: TaskListFilters = {};
    if (statusFilter !== 'all') f.status = statusFilter;
    if (categoryFilter !== 'all') f.category = categoryFilter;
    if (highOnly) f.high_flag = true;
    if (mineOnly && userTableId) f.owner_id = userTableId;
    if (search.trim()) f.search = search.trim();
    return f;
  }, [statusFilter, categoryFilter, highOnly, mineOnly, search, userTableId]);

  const { tasks, loading, error, refetch } = useTaskList(filters);

  const sortedTasks = useMemo(() => {
    if (!sortBy) return tasks;
    return [...tasks].sort((a, b) => compareTasks(a, b, sortBy, sortDir));
  }, [tasks, sortBy, sortDir]);

  const handleToggleComplete = async (task: TaskWithRelations) => {
    if (!userTableId) {
      alert('Not authenticated');
      return;
    }
    try {
      if (task.status === 'completed') {
        await reopenTask(task.id);
      } else {
        await completeTask(task.id, { actor_user_id: userTableId });
      }
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Action failed');
    }
  };

  const handleDelete = async (task: TaskWithRelations) => {
    if (!confirm(`Delete task: "${task.subject}"?`)) return;
    try {
      await deleteTask(task.id);
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-bold" style={{ color: COLORS.midnight }}>
              All Tasks
            </h1>
            <Link
              to="/tasks"
              className="text-xs font-medium hover:underline"
              style={{ color: COLORS.steel }}
            >
              ← Today's Timeline
            </Link>
          </div>
          <span className="text-sm" style={{ color: COLORS.steel }}>
            {loading ? 'Loading…' : `${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Filters */}
        <div
          className="bg-white rounded-lg p-4 mb-4 border flex flex-wrap items-center gap-3"
          style={{ borderColor: COLORS.slate + '66' }}
        >
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search subject or description…"
            className="flex-1 min-w-[200px] px-3 py-1.5 text-sm rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
            className="text-sm px-2 py-1.5 rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as TaskCategory | 'all')}
            className="text-sm px-2 py-1.5 rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          >
            {CATEGORY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-sm" style={{ color: COLORS.steel }}>
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
            My tasks
          </label>
          <label className="flex items-center gap-1.5 text-sm" style={{ color: COLORS.steel }}>
            <input type="checkbox" checked={highOnly} onChange={(e) => setHighOnly(e.target.checked)} />
            High only
          </label>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 rounded text-sm" style={{ color: '#A27B5C', backgroundColor: '#fff5ec' }}>
            {error}
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-hidden" style={{ borderColor: COLORS.slate + '66' }}>
          <table className="min-w-full text-sm">
            <thead style={{ backgroundColor: COLORS.bg }}>
              <tr>
                <th className="px-3 py-2 text-left font-medium w-8" />
                {([
                  { key: 'subject' as SortKey, label: 'Subject', nowrap: false },
                  { key: 'category' as SortKey, label: 'Category', nowrap: true },
                  { key: 'owner' as SortKey, label: 'Owner', nowrap: true },
                  { key: 'due' as SortKey, label: 'Due / Done', nowrap: true },
                ]).map((col) => {
                  const active = sortBy === col.key;
                  return (
                    <th
                      key={col.key}
                      onClick={() => handleSort(col.key)}
                      className={`px-3 py-2 text-left font-medium select-none cursor-pointer hover:bg-gray-100 ${col.nowrap ? 'whitespace-nowrap' : ''}`}
                      style={{ color: COLORS.midnight }}
                      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      {col.label}
                      <span className="ml-1 text-xs" style={{ color: active ? COLORS.midnight : COLORS.slate }}>
                        {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                      </span>
                    </th>
                  );
                })}
                <th className="px-3 py-2 text-left font-medium" style={{ color: COLORS.midnight }}>Linked to</th>
                <th
                  onClick={() => handleSort('status')}
                  className="px-3 py-2 text-left font-medium whitespace-nowrap select-none cursor-pointer hover:bg-gray-100"
                  style={{ color: COLORS.midnight }}
                  aria-sort={sortBy === 'status' ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                >
                  Status
                  <span className="ml-1 text-xs" style={{ color: sortBy === 'status' ? COLORS.midnight : COLORS.slate }}>
                    {sortBy === 'status' ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                  </span>
                </th>
                <th className="px-3 py-2 text-left font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center" style={{ color: COLORS.slate }}>
                    Loading tasks…
                  </td>
                </tr>
              )}
              {!loading && sortedTasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center" style={{ color: COLORS.slate }}>
                    No tasks match your filters.
                  </td>
                </tr>
              )}
              {!loading &&
                sortedTasks.map((task) => {
                  const overdue = isOverdue(task);
                  const completed = task.status === 'completed';
                  return (
                    <tr
                      key={task.id}
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: COLORS.slate + '33' }}
                      onClick={() => setOpenTaskId(task.id)}
                    >
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={completed}
                          onChange={() => handleToggleComplete(task)}
                          aria-label={completed ? 'Reopen task' : 'Complete task'}
                        />
                      </td>
                      <td className="px-3 py-2 align-top" style={{ color: COLORS.midnight }}>
                        <div className={completed ? 'line-through opacity-60' : ''}>
                          {task.high_flag && <span title="High priority" className="mr-1">⚑</span>}
                          {task.subject}
                        </div>
                        {task.description && (
                          <div className="text-xs mt-0.5 line-clamp-1" style={{ color: COLORS.slate }}>
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap" style={{ color: COLORS.steel }}>
                        {task.category}
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap" style={{ color: COLORS.steel }}>
                        {ownerLabel(task)}
                      </td>
                      <td
                        className="px-3 py-2 align-top whitespace-nowrap"
                        style={{
                          color: completed ? '#166534' : overdue ? '#A27B5C' : COLORS.steel,
                          fontWeight: overdue ? 600 : undefined,
                        }}
                      >
                        {completed
                          ? `✓ ${formatDate(task.completed_at)}`
                          : formatDate(task.due_at)}
                      </td>
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <LinkedToCell task={task} />
                      </td>
                      <td className="px-3 py-2 align-top whitespace-nowrap">
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={
                            completed
                              ? { backgroundColor: '#dcfce7', color: '#166534' }
                              : { backgroundColor: COLORS.slate + '33', color: COLORS.steel }
                          }
                        >
                          {task.status}
                        </span>
                      </td>
                      <td className="px-3 py-2 align-top text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => handleDelete(task)}
                          className="text-xs px-2 py-1 rounded hover:bg-red-50"
                          style={{ color: '#dc2626' }}
                          title="Delete task"
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </div>
  );
};

export default TasksPage;
