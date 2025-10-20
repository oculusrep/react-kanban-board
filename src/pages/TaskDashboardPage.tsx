import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ActivityWithRelations,
  ActivityStatus,
  ActivityType,
  ActivityPriority,
  ActivityTaskType,
  User,
  ParentObject
} from '../types/activity';
import AddTaskModal from '../components/AddTaskModal';
import ActivityDetailView from '../components/ActivityDetailView';

interface TaskFilters {
  status: 'all' | 'open' | 'completed';
  assignedTo: string | 'all';
  priority: string | 'all';
  taskType: string | 'all';
  relatedTo: string | 'all';
  dateRange: 'all' | 'overdue' | 'today' | 'this_week' | 'this_month' | 'next_week';
  searchTerm: string;
}

interface TaskStats {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  dueToday: number;
  dueThisWeek: number;
}

const TaskDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  // State
  const [tasks, setTasks] = useState<ActivityWithRelations[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [statuses, setStatuses] = useState<ActivityStatus[]>([]);
  const [priorities, setPriorities] = useState<ActivityPriority[]>([]);
  const [taskTypes, setTaskTypes] = useState<ActivityTaskType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<ActivityWithRelations | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'board'>('list');
  const [sortBy, setSortBy] = useState<'due_date' | 'priority' | 'created' | 'updated'>('due_date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const [filters, setFilters] = useState<TaskFilters>({
    status: 'open',
    assignedTo: 'all',
    priority: 'all',
    taskType: 'all',
    relatedTo: 'all',
    dateRange: 'all',
    searchTerm: ''
  });

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load all data in parallel
      const [
        tasksResult,
        usersResult,
        statusesResult,
        prioritiesResult,
        taskTypesResult
      ] = await Promise.all([
        loadTasks(),
        supabase.from('user').select('*').order('first_name, last_name'),
        supabase.from('activity_status').select('*').eq('active', true).order('sort_order'),
        supabase.from('activity_priority').select('*').eq('active', true).order('sort_order'),
        supabase.from('activity_task_type').select('*').eq('active', true).order('sort_order')
      ]);

      if (usersResult.data) {
        // Filter out automated/system users
        const filteredUsers = usersResult.data.filter(dbUser => {
          const name = `${dbUser.first_name || ''} ${dbUser.last_name || ''}`.toLowerCase().trim();
          const excludeNames = [
            'automated process',
            'chatter',
            'insights',
            'platform integration'
          ];
          return !excludeNames.some(excludeName => name.includes(excludeName));
        });
        setUsers(filteredUsers);
      }
      if (statusesResult.data) setStatuses(statusesResult.data);
      if (prioritiesResult.data) setPriorities(prioritiesResult.data);
      if (taskTypesResult.data) setTaskTypes(taskTypesResult.data);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTasks = async () => {
    try {
      // First, get the "Task" activity type ID
      const { data: taskTypeData, error: typeError } = await supabase
        .from('activity_type')
        .select('id, name')
        .eq('name', 'Task')
        .single();

      if (typeError) {
        console.error('Error finding Task activity type:', typeError);
        return;
      }

      if (!taskTypeData) {
        console.error('Task activity type not found in database');
        return;
      }

      // Get all open/non-closed activity status IDs
      const { data: openStatuses } = await supabase
        .from('activity_status')
        .select('id')
        .eq('is_closed', false);

      const openStatusIds = openStatuses?.map(s => s.id) || [];

      // Load ALL open tasks using pagination
      const PAGE_SIZE = 1000;
      let allTasks: ActivityWithRelations[] = [];
      let currentPage = 0;
      let hasMore = true;

      console.log('Loading all open tasks with pagination...');

      while (hasMore) {
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        const { data, error } = await supabase
          .from('activity')
          .select(`
            *,
            activity_status!activity_status_id_fkey (*),
            activity_type!activity_activity_type_id_fkey (*),
            activity_priority!activity_activity_priority_id_fkey (*),
            activity_task_type!activity_activity_task_type_id_fkey (*),
            owner:user!activity_owner_id_fkey (*),
            contact!activity_contact_id_fkey (*),
            deal!activity_deal_id_fkey (id, deal_name),
            client!activity_client_id_fkey (id, client_name),
            property!activity_property_id_fkey (id, property_name),
            site_submit!activity_site_submit_id_fkey (id, site_submit_name)
          `)
          .eq('activity_type_id', taskTypeData.id)
          .in('status_id', openStatusIds)
          .order('activity_date', { ascending: true })
          .range(from, to);

        if (error) {
          console.error('Error loading tasks page:', error);
          break;
        }

        if (data && data.length > 0) {
          allTasks = [...allTasks, ...data as ActivityWithRelations[]];
          console.log(`Loaded page ${currentPage + 1}: ${data.length} tasks (total: ${allTasks.length})`);

          // If we got less than PAGE_SIZE, we've reached the end
          if (data.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            currentPage++;
          }
        } else {
          hasMore = false;
        }
      }

      console.log(`✅ Finished loading all ${allTasks.length} open tasks`);

      setTasks(allTasks);
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  };

  // Calculate task statistics
  const taskStats = useMemo((): TaskStats => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const endOfWeek = new Date(today);
    endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

    let stats: TaskStats = {
      total: tasks.length,
      open: 0,
      completed: 0,
      overdue: 0,
      dueToday: 0,
      dueThisWeek: 0
    };

    tasks.forEach(task => {
      const isCompleted = task.activity_status?.is_closed || false;
      const dueDate = task.activity_date ? new Date(task.activity_date) : null;

      if (isCompleted) {
        stats.completed++;
      } else {
        stats.open++;

        if (dueDate) {
          if (dueDate < today) {
            stats.overdue++;
          } else if (dueDate.toDateString() === today.toDateString()) {
            stats.dueToday++;
          } else if (dueDate <= endOfWeek) {
            stats.dueThisWeek++;
          }
        }
      }
    });

    return stats;
  }, [tasks]);

  // Filter and sort tasks
  const filteredTasks = useMemo(() => {
    let filtered = [...tasks];

    // Status filter
    if (filters.status === 'open') {
      filtered = filtered.filter(task => !task.activity_status?.is_closed);
    } else if (filters.status === 'completed') {
      filtered = filtered.filter(task => task.activity_status?.is_closed);
    }

    // Assigned to filter
    if (filters.assignedTo !== 'all') {
      if (filters.assignedTo === 'me' && user?.email) {
        const currentUser = users.find(u => u.email?.toLowerCase() === user.email?.toLowerCase());
        if (currentUser) {
          filtered = filtered.filter(task => task.owner_id === currentUser.id);
        }
      } else {
        filtered = filtered.filter(task => task.owner_id === filters.assignedTo);
      }
    }

    // Priority filter
    if (filters.priority !== 'all') {
      filtered = filtered.filter(task => task.activity_priority_id === filters.priority);
    }

    // Task type filter
    if (filters.taskType !== 'all') {
      filtered = filtered.filter(task => task.activity_task_type_id === filters.taskType);
    }

    // Date range filter
    if (filters.dateRange !== 'all') {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      filtered = filtered.filter(task => {
        if (!task.activity_date) return false;
        const dueDate = new Date(task.activity_date);

        switch (filters.dateRange) {
          case 'overdue':
            return dueDate < today && !task.activity_status?.is_closed;
          case 'today':
            return dueDate.toDateString() === today.toDateString();
          case 'this_week': {
            const endOfWeek = new Date(today);
            endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
            return dueDate >= today && dueDate <= endOfWeek;
          }
          case 'this_month': {
            const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return dueDate >= today && dueDate <= endOfMonth;
          }
          case 'next_week': {
            const startOfNextWeek = new Date(today);
            startOfNextWeek.setDate(startOfNextWeek.getDate() + (7 - startOfNextWeek.getDay() + 1));
            const endOfNextWeek = new Date(startOfNextWeek);
            endOfNextWeek.setDate(endOfNextWeek.getDate() + 6);
            return dueDate >= startOfNextWeek && dueDate <= endOfNextWeek;
          }
          default:
            return true;
        }
      });
    }

    // Search filter
    if (filters.searchTerm) {
      const searchLower = filters.searchTerm.toLowerCase();
      filtered = filtered.filter(task =>
        task.subject?.toLowerCase().includes(searchLower) ||
        task.description?.toLowerCase().includes(searchLower) ||
        task.owner?.first_name?.toLowerCase().includes(searchLower) ||
        task.owner?.last_name?.toLowerCase().includes(searchLower)
      );
    }

    // Sort tasks
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'due_date':
          const dateA = a.activity_date ? new Date(a.activity_date).getTime() : Infinity;
          const dateB = b.activity_date ? new Date(b.activity_date).getTime() : Infinity;
          comparison = dateA - dateB;
          break;
        case 'priority':
          const priorityA = a.activity_priority?.sort_order ?? 999;
          const priorityB = b.activity_priority?.sort_order ?? 999;
          comparison = priorityA - priorityB;
          break;
        case 'created':
          const createdA = a.created_at ? new Date(a.created_at).getTime() : 0;
          const createdB = b.created_at ? new Date(b.created_at).getTime() : 0;
          comparison = createdA - createdB;
          break;
        case 'updated':
          const updatedA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const updatedB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          comparison = updatedA - updatedB;
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return filtered;
  }, [tasks, filters, sortBy, sortOrder, users, user]);

  // Get related object info
  const getRelatedObjectInfo = (task: ActivityWithRelations): { name: string; url: string } | null => {
    if (task.deal_id && task.deal) {
      return { name: (task.deal as any).deal_name, url: `/deal/${task.deal_id}` };
    }
    if (task.contact_id && task.contact) {
      return {
        name: `${task.contact.first_name || ''} ${task.contact.last_name || ''}`.trim(),
        url: `/contact/${task.contact_id}`
      };
    }
    if (task.client_id && task.client) {
      return { name: (task.client as any).client_name, url: `/client/${task.client_id}` };
    }
    if (task.property_id && task.property) {
      return { name: (task.property as any).property_name, url: `/property/${task.property_id}` };
    }
    if (task.site_submit_id && task.site_submit) {
      return { name: (task.site_submit as any).site_submit_name, url: `/site-submit/${task.site_submit_id}` };
    }
    return null;
  };

  // Format date helper
  const formatDate = (dateString: string | null): string => {
    if (!dateString) return 'No date';
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const taskDate = new Date(date);
    taskDate.setHours(0, 0, 0, 0);

    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get priority badge color
  const getPriorityColor = (priority: ActivityPriority | undefined): string => {
    if (!priority) return 'bg-gray-100 text-gray-800';
    if (priority.is_high_priority) return 'bg-red-100 text-red-800';
    if (priority.color) return `bg-${priority.color}-100 text-${priority.color}-800`;
    return 'bg-gray-100 text-gray-800';
  };

  // Handle task update
  const handleTaskUpdate = async () => {
    await loadTasks();
    setSelectedTask(null);
  };

  // Handle task creation
  const handleTaskCreated = async (newTask: Activity) => {
    await loadTasks();
    setIsAddTaskModalOpen(false);
  };

  // Check if task is overdue
  const isTaskOverdue = (task: ActivityWithRelations): boolean => {
    if (!task.activity_date || task.activity_status?.is_closed) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dueDate = new Date(task.activity_date);
    dueDate.setHours(0, 0, 0, 0);
    return dueDate < today;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Task Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Organize and track all your tasks in one place
              </p>
            </div>
            <button
              onClick={() => setIsAddTaskModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Add Task
            </button>
          </div>

          {/* Statistics Cards */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-6 gap-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{taskStats.total}</div>
              <div className="text-xs text-blue-600 font-medium">Total Tasks</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{taskStats.open}</div>
              <div className="text-xs text-green-600 font-medium">Open</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-600">{taskStats.completed}</div>
              <div className="text-xs text-gray-600 font-medium">Completed</div>
            </div>
            <div className="bg-red-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-red-600">{taskStats.overdue}</div>
              <div className="text-xs text-red-600 font-medium">Overdue</div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-yellow-600">{taskStats.dueToday}</div>
              <div className="text-xs text-yellow-600 font-medium">Due Today</div>
            </div>
            <div className="bg-purple-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-purple-600">{taskStats.dueThisWeek}</div>
              <div className="text-xs text-purple-600 font-medium">This Week</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Tasks</option>
                <option value="open">Open</option>
                <option value="completed">Completed</option>
              </select>
            </div>

            {/* Assigned To Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assigned To</label>
              <select
                value={filters.assignedTo}
                onChange={(e) => setFilters({ ...filters, assignedTo: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Users</option>
                <option value="me">My Tasks</option>
                {users.map(user => (
                  <option key={user.id} value={user.id}>
                    {user.first_name} {user.last_name}
                  </option>
                ))}
              </select>
            </div>

            {/* Priority Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={filters.priority}
                onChange={(e) => setFilters({ ...filters, priority: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Priorities</option>
                {priorities.map(priority => (
                  <option key={priority.id} value={priority.id}>
                    {priority.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Task Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Task Category</label>
              <select
                value={filters.taskType}
                onChange={(e) => setFilters({ ...filters, taskType: e.target.value })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Categories</option>
                {taskTypes.map(type => (
                  <option key={type.id} value={type.id}>
                    {type.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Range Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
              <select
                value={filters.dateRange}
                onChange={(e) => setFilters({ ...filters, dateRange: e.target.value as any })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Dates</option>
                <option value="overdue">Overdue</option>
                <option value="today">Today</option>
                <option value="this_week">This Week</option>
                <option value="next_week">Next Week</option>
                <option value="this_month">This Month</option>
              </select>
            </div>

            {/* Search */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={filters.searchTerm}
                onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                placeholder="Search tasks..."
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* Sort By */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sort By</label>
              <div className="flex gap-2">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="due_date">Due Date</option>
                  <option value="priority">Priority</option>
                  <option value="created">Created</option>
                  <option value="updated">Updated</option>
                </select>
                <button
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                  title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
                >
                  {sortOrder === 'asc' ? '↑' : '↓'}
                </button>
              </div>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="mt-4 flex justify-between items-center">
            <div className="text-sm text-gray-500">
              Showing {filteredTasks.length} of {tasks.length} tasks
            </div>
            <button
              onClick={() => setFilters({
                status: 'open',
                assignedTo: 'all',
                priority: 'all',
                taskType: 'all',
                relatedTo: 'all',
                dateRange: 'all',
                searchTerm: ''
              })}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12">
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12">
              <svg
                className="mx-auto h-12 w-12 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <h3 className="mt-2 text-sm font-medium text-gray-900">No tasks found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your filters or create a new task.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Task
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned To
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Due Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Priority
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Related To
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTasks.map((task) => {
                    const relatedObject = getRelatedObjectInfo(task);
                    const overdue = isTaskOverdue(task);

                    return (
                      <tr
                        key={task.id}
                        onClick={() => setSelectedTask(task)}
                        className="hover:bg-gray-50 cursor-pointer transition-colors"
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-start">
                            <div>
                              <div className="text-sm font-medium text-gray-900">
                                {task.subject}
                              </div>
                              {task.activity_task_type && (
                                <div className="text-xs text-gray-500 mt-1">
                                  {task.activity_task_type.name}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">
                            {task.owner ? `${task.owner.first_name} ${task.owner.last_name}` : 'Unassigned'}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className={`text-sm ${overdue ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                            {formatDate(task.activity_date)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {task.activity_priority && (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.activity_priority)}`}>
                              {task.activity_priority.name}
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-medium rounded-full ${
                              task.activity_status?.is_closed
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {task.activity_status?.name || 'Unknown'}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {relatedObject && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(relatedObject.url);
                              }}
                              className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                            >
                              {relatedObject.name}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Add Task Modal */}
      <AddTaskModal
        isOpen={isAddTaskModalOpen}
        onClose={() => setIsAddTaskModalOpen(false)}
        onSave={handleTaskCreated}
      />

      {/* Task Detail View */}
      {selectedTask && (
        <ActivityDetailView
          activity={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={handleTaskUpdate}
          onDelete={handleTaskUpdate}
        />
      )}
    </div>
  );
};

export default TaskDashboardPage;
