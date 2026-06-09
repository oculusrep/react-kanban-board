import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  completeTask,
  deleteTask,
  reopenTask,
  updateTask,
  useTaskList,
} from '../hooks/useTasks';
import {
  TaskCategoryRow,
  TaskListFilters,
  TaskStatus,
  TaskWithRelations,
} from '../types/task';
import { useAuth } from '../contexts/AuthContext';
import { useUsers } from '../hooks/useUsers';
import { isCategoryVisibleTo } from '../lib/taskCategory';
import { isOverdue } from '../lib/taskOverdue';
import { localDateString } from '../types/taskBlock';
import { supabase } from '../lib/supabaseClient';
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

const ASSIGNABLE_ROLES = new Set(['broker_full', 'va', 'admin']);

// Date-based view presets. The default "focus" preset hides recurring future
// tasks (months/years out) so the page opens to what actually needs attention:
// overdue + today + tasks with no due date. Switching presets changes the
// date predicate only — status / category / search / My / High stack on top.
type Preset = 'focus' | 'overdue' | 'today' | 'no_date' | 'next_7' | 'all';

const PRESETS: { value: Preset; label: string; title: string }[] = [
  { value: 'focus', label: 'Focus', title: 'Overdue, due today, or no due date' },
  { value: 'overdue', label: 'Overdue', title: 'Past due date, not yet completed' },
  { value: 'today', label: 'Due today', title: "Due today (local time)" },
  { value: 'no_date', label: 'No due date', title: 'Tasks without a due date' },
  { value: 'next_7', label: 'Next 7 days', title: 'Due today through 7 days out' },
  { value: 'all', label: 'All', title: 'No date filter' },
];

// Category options for the filter dropdown are loaded from task_category
// at mount time (since 2026-05-10 categories are user-extensible). Filter
// applies the legacy task.category text column — kept in sync with
// category_id by updateTask — so existing filter wiring keeps working.

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

// Add days to a YYYY-MM-DD local date, returning a new YYYY-MM-DD string.
// Uses local-time arithmetic so DST boundaries don't shift the result.
const addDaysISO = (yyyymmdd: string, days: number): string => {
  const [y, m, d] = yyyymmdd.split('-').map((s) => parseInt(s, 10));
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return localDateString(dt);
};

// Client-side date predicate per the selected preset. due_at can be a full
// ISO timestamp or just a date — we compare on the YYYY-MM-DD prefix in
// local time (per CLAUDE.md timezone guidance).
const matchesPreset = (task: TaskWithRelations, preset: Preset, today: string): boolean => {
  const dueDate = task.due_at ? task.due_at.slice(0, 10) : null;
  switch (preset) {
    case 'focus':
      return dueDate === null || dueDate <= today;
    case 'overdue':
      return dueDate !== null && dueDate < today && task.status !== 'completed' && task.status !== 'cancelled';
    case 'today':
      return dueDate === today;
    case 'no_date':
      return dueDate === null;
    case 'next_7': {
      const max = addDaysISO(today, 7);
      return dueDate !== null && dueDate >= today && dueDate <= max;
    }
    case 'all':
      return true;
  }
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
  const { users } = useUsers();
  const [preset, setPreset] = useState<Preset>('focus');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('open');
  // Category filter value is the category name (text), which keeps working
  // against the legacy task.category column. UUID FK filtering is a future
  // option but the text path lets us drop in user-defined categories with
  // zero query changes.
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [categoryOptions, setCategoryOptions] = useState<TaskCategoryRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('task_category')
        .select('*')
        .is('archived_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (cancelled) return;
      const visible = (data ?? []).filter((c) => isCategoryVisibleTo(c, userTableId));
      setCategoryOptions(visible);
    })();
    return () => { cancelled = true; };
  }, [userTableId]);
  const [highOnly, setHighOnly] = useState(false);
  const [mineOnly, setMineOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  // Multi-select for bulk actions. Selected IDs may include rows that scroll
  // out of the current preset/filter view — that's intentional: bulk actions
  // act on the captured set, not "currently visible". Clear button is always
  // available.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);

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

  const today = localDateString();

  // Client-side date predicate. Server-side already handled status / category /
  // search / owner / high_flag. The preset narrows by due_at.
  const presetTasks = useMemo(
    () => tasks.filter((t) => matchesPreset(t, preset, today)),
    [tasks, preset, today]
  );

  const sortedTasks = useMemo(() => {
    if (!sortBy) return presetTasks;
    return [...presetTasks].sort((a, b) => compareTasks(a, b, sortBy, sortDir));
  }, [presetTasks, sortBy, sortDir]);

  const assigneeOptions = useMemo(
    () => users.filter((u) => u.ovis_role && ASSIGNABLE_ROLES.has(u.ovis_role)),
    [users]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allVisibleSelected =
    sortedTasks.length > 0 && sortedTasks.every((t) => selectedIds.has(t.id));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      // Deselect the ones currently visible; preserve any out-of-view selections.
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const t of sortedTasks) next.delete(t.id);
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const t of sortedTasks) next.add(t.id);
        return next;
      });
    }
  };

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

  // Bulk helpers — apply the action to every selected id in parallel, then
  // clear selection and refetch. Errors surface as alert + console so a
  // partial failure doesn't silently leave the user thinking it worked.
  const runBulk = async (
    label: string,
    perTask: (id: string) => Promise<unknown>
  ) => {
    if (selectedIds.size === 0) return;
    setBulkSaving(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(ids.map(perTask));
      const failures = results.filter((r) => r.status === 'rejected');
      if (failures.length > 0) {
        console.error(`Bulk ${label} failures:`, failures);
        alert(`${label}: ${ids.length - failures.length} succeeded, ${failures.length} failed.`);
      }
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : `${label} failed`);
    } finally {
      setBulkSaving(false);
    }
  };

  const bulkSetDueDate = (yyyymmdd: string) => {
    const due_at = yyyymmdd
      ? new Date(`${yyyymmdd}T23:59:59`).toISOString()
      : null;
    return runBulk('Set due date', (id) => updateTask(id, { due_at }));
  };

  const bulkSetOwner = (ownerId: string) =>
    runBulk('Set owner', (id) => updateTask(id, { owner_id: ownerId }));

  const bulkSetCategory = (categoryId: string) =>
    runBulk('Set category', (id) => updateTask(id, { category_id: categoryId }));

  const bulkSetStatus = (status: 'open' | 'completed' | 'cancelled') => {
    if (status === 'completed') {
      if (!userTableId) {
        alert('Not authenticated');
        return;
      }
      return runBulk('Mark complete', (id) =>
        completeTask(id, { actor_user_id: userTableId })
      );
    }
    if (status === 'open') {
      return runBulk('Reopen', (id) => reopenTask(id));
    }
    return runBulk('Cancel', (id) =>
      updateTask(id, { status: 'cancelled' })
    );
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24">
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
            {loading
              ? 'Loading…'
              : `${sortedTasks.length} of ${tasks.length} task${tasks.length === 1 ? '' : 's'}`}
          </span>
        </div>

        {/* Preset buttons */}
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          {PRESETS.map((p) => {
            const active = preset === p.value;
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => setPreset(p.value)}
                title={p.title}
                className="text-xs px-3 py-1.5 rounded border transition-colors"
                style={
                  active
                    ? { backgroundColor: COLORS.midnight, color: '#FFFFFF', borderColor: COLORS.midnight }
                    : { backgroundColor: '#FFFFFF', color: COLORS.steel, borderColor: COLORS.slate }
                }
              >
                {p.label}
              </button>
            );
          })}
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
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-sm px-2 py-1.5 rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          >
            <option value="all">All categories</option>
            {categoryOptions.map((o) => (
              <option key={o.id} value={o.name}>
                {o.name}
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
                <th className="px-3 py-2 text-left font-medium w-8">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAllVisible}
                    aria-label="Select all visible tasks"
                    title={allVisibleSelected ? 'Deselect all visible' : 'Select all visible'}
                    className="cursor-pointer"
                  />
                </th>
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
                <th className="px-3 py-2 text-left font-medium w-28" />
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
                  const overdue = isOverdue(task.due_at) && task.status !== 'completed' && task.status !== 'cancelled';
                  const completed = task.status === 'completed';
                  const selected = selectedIds.has(task.id);
                  return (
                    <tr
                      key={task.id}
                      className="border-t hover:bg-gray-50 cursor-pointer"
                      style={{
                        borderColor: COLORS.slate + '33',
                        backgroundColor: selected ? COLORS.slate + '14' : undefined,
                      }}
                      onClick={() => setOpenTaskId(task.id)}
                    >
                      <td className="px-3 py-2 align-top" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleSelect(task.id)}
                          aria-label="Select task for bulk action"
                          title="Select for bulk action"
                          className="cursor-pointer"
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
                      <td
                        className="px-3 py-2 align-top text-right whitespace-nowrap"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(task)}
                          className="text-xs px-1.5 py-1 rounded hover:bg-gray-100 mr-1"
                          style={{ color: completed ? COLORS.steel : '#166534' }}
                          title={completed ? 'Reopen task' : 'Mark complete'}
                        >
                          {completed ? '↺' : '✓'}
                        </button>
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

      {/* Bulk action bar — sticky at bottom when 1+ rows selected. Each
          control fires immediately on change (no per-action confirm); the
          shared runBulk helper reports partial failures via alert. */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-0 left-0 right-0 z-30 border-t shadow-lg"
          style={{ backgroundColor: '#FFFFFF', borderColor: COLORS.slate + '66' }}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-wrap items-center gap-3">
            <span
              className="text-sm font-medium px-2 py-1 rounded"
              style={{ backgroundColor: COLORS.midnight, color: '#FFFFFF' }}
            >
              {selectedIds.size} selected
            </span>

            <label className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.steel }}>
              Due date
              <input
                type="date"
                disabled={bulkSaving}
                onChange={(e) => {
                  if (e.target.value) bulkSetDueDate(e.target.value);
                }}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
              />
              <button
                type="button"
                disabled={bulkSaving}
                onClick={() => bulkSetDueDate('')}
                className="text-xs px-1.5 py-1 rounded hover:bg-gray-100 disabled:opacity-50"
                style={{ color: COLORS.steel }}
                title="Clear due date on selected tasks"
              >
                clear
              </button>
            </label>

            <label className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.steel }}>
              Owner
              <select
                disabled={bulkSaving}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    bulkSetOwner(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.steel }}
              >
                <option value="" disabled>
                  Set owner…
                </option>
                {assigneeOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.first_name && u.last_name
                      ? `${u.first_name} ${u.last_name}`
                      : u.email || 'Unnamed'}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.steel }}>
              Category
              <select
                disabled={bulkSaving}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) {
                    bulkSetCategory(e.target.value);
                    e.target.value = '';
                  }
                }}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.steel }}
              >
                <option value="" disabled>
                  Set category…
                </option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center gap-1.5 text-xs" style={{ color: COLORS.steel }}>
              Status
              <select
                disabled={bulkSaving}
                defaultValue=""
                onChange={(e) => {
                  const v = e.target.value as 'open' | 'completed' | 'cancelled' | '';
                  if (v) {
                    bulkSetStatus(v);
                    e.target.value = '';
                  }
                }}
                className="text-xs px-2 py-1 rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.steel }}
              >
                <option value="" disabled>
                  Set status…
                </option>
                <option value="open">Open (reopen)</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </label>

            <button
              type="button"
              disabled={bulkSaving}
              onClick={() => setSelectedIds(new Set())}
              className="ml-auto text-xs px-3 py-1.5 rounded border hover:bg-gray-50 disabled:opacity-50"
              style={{ borderColor: COLORS.slate, color: COLORS.steel }}
            >
              Clear selection
            </button>

            {bulkSaving && (
              <span className="text-xs" style={{ color: COLORS.steel }}>
                Saving…
              </span>
            )}
          </div>
        </div>
      )}

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </div>
  );
};

export default TasksPage;
