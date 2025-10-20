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
  future: number;
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
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [bulkStatusUpdate, setBulkStatusUpdate] = useState<string>('');
  const [bulkDueDateUpdate, setBulkDueDateUpdate] = useState<string>('');
  const [isBulkUpdating, setIsBulkUpdating] = useState(false);
  const [activeCard, setActiveCard] = useState<'open' | 'overdue' | 'today' | 'week' | 'future' | 'all' | 'urgent'>('urgent');
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const [cardCounts, setCardCounts] = useState<TaskStats>({
    total: 0,
    open: 0,
    completed: 0,
    overdue: 0,
    dueToday: 0,
    dueThisWeek: 0,
    future: 0
  });

  const [filters, setFilters] = useState<TaskFilters>({
    status: 'all',
    assignedTo: 'me', // Default to "My Tasks"
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

  // Reload tasks and card counts when assignedTo filter changes
  useEffect(() => {
    if (users.length > 0) {
      loadTasks(activeCard);
      loadCardCounts();
    }
  }, [filters.assignedTo]);

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

        // Load current user's role
        if (user?.email) {
          const currentUser = usersResult.data.find(u => u.email === user.email);
          if (currentUser) {
            setCurrentUserRole(currentUser.ovis_role || null);
          }
        }
      }
      if (statusesResult.data) setStatuses(statusesResult.data);
      if (prioritiesResult.data) setPriorities(prioritiesResult.data);
      if (taskTypesResult.data) setTaskTypes(taskTypesResult.data);

      // Load card counts after users are loaded
      await loadCardCounts();
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Load card counts from database
  const loadCardCounts = async () => {
    try {
      // Get the "Task" activity type ID
      const { data: taskTypeData } = await supabase
        .from('activity_type')
        .select('id')
        .eq('name', 'Task')
        .single();

      if (!taskTypeData) return;

      // Get current user ID if filtering by "me"
      let currentUserId: string | null = null;
      if (filters.assignedTo === 'me' && user?.email) {
        const { data: currentUserData } = await supabase
          .from('user')
          .select('id')
          .eq('email', user.email)
          .single();
        currentUserId = currentUserData?.id || null;
        console.log('📊 Loading card counts for user:', user.email, currentUserId);
      }

      // Get open status IDs (non-closed and not deferred)
      const { data: openStatuses } = await supabase
        .from('activity_status')
        .select('id, name, is_closed')
        .eq('is_closed', false);

      const openStatusIds = openStatuses
        ?.filter(s => s.name?.toLowerCase() !== 'deferred')
        .map(s => s.id) || [];

      // Build base query
      let query = supabase
        .from('activity')
        .select('id, activity_date, status_id', { count: 'exact', head: false })
        .eq('activity_type_id', taskTypeData.id)
        .in('status_id', openStatusIds);

      // Apply owner filter if "My Tasks" is selected
      if (filters.assignedTo === 'me' && currentUserId) {
        query = query.eq('owner_id', currentUserId);
      } else if (filters.assignedTo !== 'all' && filters.assignedTo !== 'me') {
        query = query.eq('owner_id', filters.assignedTo);
      }

      const { data: allTasks } = await query;

      console.log('📊 Loaded tasks for card counts:', allTasks?.length || 0);

      if (!allTasks) {
        console.log('⚠️ No tasks returned from query');
        return;
      }

      // Calculate counts
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));

      console.log('📅 Today:', today.toISOString().split('T')[0]);
      console.log('📅 End of week:', endOfWeek.toISOString().split('T')[0]);

      let counts: TaskStats = {
        total: allTasks.length,
        open: allTasks.length,
        completed: 0,
        overdue: 0,
        dueToday: 0,
        dueThisWeek: 0,
        future: 0
      };

      allTasks.forEach(task => {
        if (task.activity_date) {
          const [year, month, day] = task.activity_date.split('T')[0].split('-').map(Number);
          const dueDate = new Date(year, month - 1, day);
          dueDate.setHours(0, 0, 0, 0);

          if (dueDate < today) {
            counts.overdue++;
          } else if (dueDate.getTime() === today.getTime()) {
            counts.dueToday++;
            counts.dueThisWeek++; // Today is also part of this week
          } else if (dueDate <= endOfWeek) {
            counts.dueThisWeek++;
          } else {
            counts.future++;
          }
        }
      });

      console.log('✅ Card counts calculated:', counts);
      setCardCounts(counts);
    } catch (error) {
      console.error('❌ Error loading card counts:', error);
    }
  };

  const loadTasks = async (cardFilter: 'open' | 'overdue' | 'today' | 'week' | 'future' | 'all' | 'urgent' = activeCard) => {
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

      console.log(`Loading tasks for filter: ${cardFilter}, assignedTo: ${filters.assignedTo}`);

      // Get current user ID if filtering by "me"
      let currentUserId: string | null = null;
      if (filters.assignedTo === 'me' && user?.email) {
        const currentUser = users.find(u => u.email?.toLowerCase() === user.email?.toLowerCase());
        currentUserId = currentUser?.id || null;
        console.log(`Filtering for current user: ${currentUser?.first_name} ${currentUser?.last_name} (${currentUserId})`);
      }

      // Get open status IDs (non-closed and not deferred)
      const { data: openStatuses } = await supabase
        .from('activity_status')
        .select('id, name, is_closed')
        .eq('is_closed', false);

      // Exclude "Deferred" status - treat it the same as completed
      const openStatusIds = openStatuses
        ?.filter(s => s.name?.toLowerCase() !== 'deferred')
        .map(s => s.id) || [];

      console.log(`Open status IDs (excluding Deferred):`, openStatusIds);

      // Build query based on card filter
      const PAGE_SIZE = 1000;
      const MAX_TASKS = 10000;
      let allTasks: ActivityWithRelations[] = [];
      let currentPage = 0;
      let hasMore = true;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayStr = today.toISOString().split('T')[0];

      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      const endOfWeekStr = endOfWeek.toISOString().split('T')[0];

      while (hasMore && allTasks.length < MAX_TASKS) {
        const from = currentPage * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        let query = supabase
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
          .eq('activity_type_id', taskTypeData.id);

        // Apply owner filter if "My Tasks" is selected
        if (filters.assignedTo === 'me' && currentUserId) {
          query = query.eq('owner_id', currentUserId);
        } else if (filters.assignedTo !== 'all' && filters.assignedTo !== 'me') {
          query = query.eq('owner_id', filters.assignedTo);
        }

        // Apply filter based on active card
        switch (cardFilter) {
          case 'urgent':
            // Overdue + Due Today (default view)
            query = query
              .in('status_id', openStatusIds)
              .lte('activity_date', todayStr);
            break;
          case 'open':
            // All open (non-closed) tasks
            query = query.in('status_id', openStatusIds);
            break;
          case 'overdue':
            // Open tasks with due date before today
            query = query
              .in('status_id', openStatusIds)
              .lt('activity_date', todayStr)
              .not('activity_date', 'is', null);
            break;
          case 'today':
            // Tasks due today (exact date match)
            const tomorrowStr = new Date(today);
            tomorrowStr.setDate(tomorrowStr.getDate() + 1);
            const tomorrowISOStr = tomorrowStr.toISOString().split('T')[0];

            query = query
              .in('status_id', openStatusIds)
              .gte('activity_date', todayStr)
              .lt('activity_date', tomorrowISOStr);
            break;
          case 'week':
            // Tasks due this week (from today through end of week)
            query = query
              .in('status_id', openStatusIds)
              .gte('activity_date', todayStr)
              .lte('activity_date', endOfWeekStr + 'T23:59:59');
            break;
          case 'future':
            // Tasks due after today
            query = query
              .in('status_id', openStatusIds)
              .gt('activity_date', todayStr + 'T23:59:59');
            break;
          case 'all':
            // All tasks (no status filter)
            break;
        }

        const { data, error } = await query
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
      dueThisWeek: 0,
      future: 0
    };

    tasks.forEach(task => {
      const isCompleted = task.activity_status?.is_closed || false;
      const isDeferred = task.activity_status?.name === 'Deferred';

      // Parse date as local date to avoid timezone issues
      let dueDate: Date | null = null;
      if (task.activity_date) {
        const [year, month, day] = task.activity_date.split('T')[0].split('-').map(Number);
        dueDate = new Date(year, month - 1, day);
        dueDate.setHours(0, 0, 0, 0);
      }

      if (isCompleted) {
        stats.completed++;
      } else if (!isDeferred) {
        stats.open++;

        if (dueDate) {
          if (dueDate < today) {
            stats.overdue++;
          } else if (dueDate.getTime() === today.getTime()) {
            stats.dueToday++;
          } else if (dueDate <= endOfWeek) {
            stats.dueThisWeek++;
          } else if (dueDate > today) {
            stats.future++;
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
      // Quick filter: all open (non-closed) tasks
      filtered = filtered.filter(task => !task.activity_status?.is_closed);
    } else if (filters.status === 'completed') {
      // Quick filter: all completed (closed) tasks
      filtered = filtered.filter(task => task.activity_status?.is_closed);
    } else if (filters.status !== 'all') {
      // Specific status ID filter
      filtered = filtered.filter(task => task.status_id === filters.status);
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

    // Parse the date string as a local date (not UTC)
    const [year, month, day] = dateString.split('T')[0].split('-').map(Number);
    const taskDate = new Date(year, month - 1, day);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    taskDate.setHours(0, 0, 0, 0);

    const diffTime = taskDate.getTime() - today.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays < 0) return `${Math.abs(diffDays)} days ago`;
    if (diffDays > 0 && diffDays <= 7) return `In ${diffDays} days`;

    return taskDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
    await loadCardCounts();
    setSelectedTask(null);
  };

  // Handle task creation
  const handleTaskCreated = async (newTask: Activity) => {
    await loadTasks();
    await loadCardCounts();
    setIsAddTaskModalOpen(false);
  };

  // Check if task is overdue
  const isTaskOverdue = (task: ActivityWithRelations): boolean => {
    if (!task.activity_date || task.activity_status?.is_closed) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Parse date as local date to avoid timezone issues
    const [year, month, day] = task.activity_date.split('T')[0].split('-').map(Number);
    const dueDate = new Date(year, month - 1, day);
    dueDate.setHours(0, 0, 0, 0);

    return dueDate < today;
  };

  // Handle checkbox selection
  const handleSelectTask = (taskId: string, checked: boolean) => {
    const newSelected = new Set(selectedTaskIds);
    if (checked) {
      newSelected.add(taskId);
    } else {
      newSelected.delete(taskId);
    }
    setSelectedTaskIds(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    const allIds = new Set(filteredTasks.map(t => t.id));
    setSelectedTaskIds(allIds);
  };

  // Handle clear all
  const handleClearAll = () => {
    setSelectedTaskIds(new Set());
  };

  // Handle bulk status update
  const handleBulkStatusUpdate = async () => {
    if (!bulkStatusUpdate || selectedTaskIds.size === 0) {
      alert('Please select tasks and a status to update');
      return;
    }

    setIsBulkUpdating(true);
    try {
      const taskIdsArray = Array.from(selectedTaskIds);

      const { error } = await supabase
        .from('activity')
        .update({
          status_id: bulkStatusUpdate,
          updated_at: new Date().toISOString()
        })
        .in('id', taskIdsArray);

      if (error) {
        console.error('Error updating tasks:', error);
        alert('Error updating tasks. Please try again.');
      } else {
        // Show success toast
        showToast(`Successfully updated status for ${taskIdsArray.length} task(s)`, 'success');
        setSelectedTaskIds(new Set());
        setBulkStatusUpdate('');
        // Reload tasks and card counts with current active card filter
        await loadTasks(activeCard);
        await loadCardCounts();
      }
    } catch (error) {
      console.error('Error in bulk update:', error);
      alert('Error updating tasks. Please try again.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Handle bulk due date update
  const handleBulkDueDateUpdate = async () => {
    if (!bulkDueDateUpdate || selectedTaskIds.size === 0) {
      alert('Please select tasks and a due date to update');
      return;
    }

    setIsBulkUpdating(true);
    try {
      const taskIdsArray = Array.from(selectedTaskIds);

      console.log('🔄 BULK UPDATE: Updating tasks with date:', bulkDueDateUpdate);
      console.log('📋 Task IDs to update:', taskIdsArray);
      console.log('🎯 Active card filter:', activeCard);

      const { data, error } = await supabase
        .from('activity')
        .update({
          activity_date: bulkDueDateUpdate,
          updated_at: new Date().toISOString()
        })
        .in('id', taskIdsArray)
        .select();

      if (error) {
        console.error('❌ Bulk update error:', error);
        alert('Error updating tasks. Please try again.');
      } else {
        console.log('✅ Bulk update successful!');
        console.log('📊 Updated', data?.length, 'tasks');
        console.log('📅 New due date:', bulkDueDateUpdate);
        console.log('🔄 Reloading tasks with filter:', activeCard);

        // Show success toast
        showToast(`Successfully updated due date for ${taskIdsArray.length} task(s)`, 'success');
        setSelectedTaskIds(new Set());
        setBulkDueDateUpdate('');

        // Reload tasks and card counts with current active card filter
        console.log('⏳ Starting task reload...');
        await loadTasks(activeCard);
        await loadCardCounts();
        console.log('✅ Task reload complete');
      }
    } catch (error) {
      console.error('Error in bulk update:', error);
      alert('Error updating tasks. Please try again.');
    } finally {
      setIsBulkUpdating(false);
    }
  };

  // Show toast notification
  const [toastMessage, setToastMessage] = useState<string>('');
  const [toastType, setToastType] = useState<'success' | 'error'>('success');
  const [showToastFlag, setShowToastFlag] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setShowToastFlag(true);
    setTimeout(() => {
      setShowToastFlag(false);
    }, 3000);
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
          <div className="flex justify-between items-center gap-6">
            <div className="flex-shrink-0">
              <h1 className="text-3xl font-bold text-gray-900">Task Management</h1>
              <p className="mt-1 text-sm text-gray-500">
                Organize and track all your tasks in one place
              </p>
            </div>

            {/* Smart Task Search */}
            <div className="flex-1 max-w-2xl">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={filters.searchTerm}
                  onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
                  placeholder="Search tasks by subject, description, or related object..."
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                />
                {filters.searchTerm && (
                  <button
                    onClick={() => setFilters({ ...filters, searchTerm: '' })}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  >
                    <svg className="h-5 w-5 text-gray-400 hover:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            <button
              onClick={() => setIsAddTaskModalOpen(true)}
              className="flex-shrink-0 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              + Add Task
            </button>
          </div>

          {/* Statistics Cards */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {/* Urgent: Overdue + Due Today */}
            <button
              onClick={async () => {
                console.log('🔴 URGENT CARD CLICKED');
                setActiveCard('urgent');
                await loadTasks('urgent');
              }}
              className={`rounded-lg p-4 text-left transition-all ${
                activeCard === 'urgent'
                  ? 'bg-red-600 shadow-lg ring-2 ring-red-400'
                  : 'bg-red-50 hover:bg-red-100'
              }`}
            >
              <div className={`text-2xl font-bold ${activeCard === 'urgent' ? 'text-white' : 'text-red-600'}`}>
                {cardCounts.overdue + cardCounts.dueToday}
              </div>
              <div className={`text-xs font-medium ${activeCard === 'urgent' ? 'text-red-100' : 'text-red-600'}`}>
                Urgent
              </div>
            </button>

            {/* Overdue Tasks */}
            <button
              onClick={async () => {
                console.log('🟠 OVERDUE CARD CLICKED');
                setActiveCard('overdue');
                await loadTasks('overdue');
              }}
              className={`rounded-lg p-4 text-left transition-all ${
                activeCard === 'overdue'
                  ? 'bg-orange-600 shadow-lg ring-2 ring-orange-400'
                  : 'bg-orange-50 hover:bg-orange-100'
              }`}
            >
              <div className={`text-2xl font-bold ${activeCard === 'overdue' ? 'text-white' : 'text-orange-600'}`}>
                {cardCounts.overdue}
              </div>
              <div className={`text-xs font-medium ${activeCard === 'overdue' ? 'text-orange-100' : 'text-orange-600'}`}>
                Overdue
              </div>
            </button>

            {/* Due Today */}
            <button
              onClick={async () => {
                console.log('🟡 DUE TODAY CARD CLICKED');
                setActiveCard('today');
                await loadTasks('today');
              }}
              className={`rounded-lg p-4 text-left transition-all ${
                activeCard === 'today'
                  ? 'bg-yellow-600 shadow-lg ring-2 ring-yellow-400'
                  : 'bg-yellow-50 hover:bg-yellow-100'
              }`}
            >
              <div className={`text-2xl font-bold ${activeCard === 'today' ? 'text-white' : 'text-yellow-600'}`}>
                {cardCounts.dueToday}
              </div>
              <div className={`text-xs font-medium ${activeCard === 'today' ? 'text-yellow-100' : 'text-yellow-600'}`}>
                Due Today
              </div>
            </button>

            {/* Due This Week */}
            <button
              onClick={async () => {
                console.log('🟣 THIS WEEK CARD CLICKED');
                setActiveCard('week');
                await loadTasks('week');
              }}
              className={`rounded-lg p-4 text-left transition-all ${
                activeCard === 'week'
                  ? 'bg-purple-600 shadow-lg ring-2 ring-purple-400'
                  : 'bg-purple-50 hover:bg-purple-100'
              }`}
            >
              <div className={`text-2xl font-bold ${activeCard === 'week' ? 'text-white' : 'text-purple-600'}`}>
                {cardCounts.dueThisWeek}
              </div>
              <div className={`text-xs font-medium ${activeCard === 'week' ? 'text-purple-100' : 'text-purple-600'}`}>
                This Week
              </div>
            </button>

            {/* Future Tasks */}
            <button
              onClick={async () => {
                console.log('🔵 FUTURE TASKS CARD CLICKED');
                setActiveCard('future');
                await loadTasks('future');
              }}
              className={`rounded-lg p-4 text-left transition-all ${
                activeCard === 'future'
                  ? 'bg-blue-600 shadow-lg ring-2 ring-blue-400'
                  : 'bg-blue-50 hover:bg-blue-100'
              }`}
            >
              <div className={`text-2xl font-bold ${activeCard === 'future' ? 'text-white' : 'text-blue-600'}`}>
                {cardCounts.future}
              </div>
              <div className={`text-xs font-medium ${activeCard === 'future' ? 'text-blue-100' : 'text-blue-600'}`}>
                Future Tasks
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="all">All Statuses</option>
                {statuses.map(status => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
                <optgroup label="Quick Filters">
                  <option value="open">All Open (Non-Closed)</option>
                  <option value="completed">All Completed (Closed)</option>
                </optgroup>
              </select>
            </div>

            {/* Assigned To Filter - Only visible to admin users */}
            {currentUserRole === 'admin' && (
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
            )}

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
        {/* Bulk Actions Toolbar */}
        {selectedTaskIds.size > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedTaskIds.size} task(s) selected
                </span>
                <button
                  onClick={handleClearAll}
                  className="text-sm text-blue-600 hover:text-blue-800 underline"
                >
                  Clear Selection
                </button>
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                {/* Status Update */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-blue-900">Status:</label>
                  <select
                    value={bulkStatusUpdate}
                    onChange={(e) => setBulkStatusUpdate(e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select...</option>
                    {statuses.map(status => (
                      <option key={status.id} value={status.id}>
                        {status.name}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handleBulkStatusUpdate}
                    disabled={!bulkStatusUpdate || isBulkUpdating}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                  >
                    {isBulkUpdating ? 'Updating...' : 'Update'}
                  </button>
                </div>

                {/* Due Date Update */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-blue-900">Due Date:</label>
                  <input
                    type="date"
                    value={bulkDueDateUpdate}
                    onChange={(e) => setBulkDueDateUpdate(e.target.value)}
                    className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                  <button
                    onClick={handleBulkDueDateUpdate}
                    disabled={!bulkDueDateUpdate || isBulkUpdating}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium text-sm"
                  >
                    {isBulkUpdating ? 'Updating...' : 'Update'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

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
                    <th className="px-4 py-3 text-left">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={handleSelectAll}
                          className="text-xs text-blue-600 hover:text-blue-800 underline whitespace-nowrap"
                        >
                          Select All
                        </button>
                        {selectedTaskIds.size > 0 && (
                          <button
                            onClick={handleClearAll}
                            className="text-xs text-gray-600 hover:text-gray-800 underline whitespace-nowrap"
                          >
                            Clear
                          </button>
                        )}
                      </div>
                    </th>
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
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-4 py-4">
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(task.id)}
                            onChange={(e) => {
                              e.stopPropagation();
                              handleSelectTask(task.id, e.target.checked);
                            }}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded cursor-pointer"
                          />
                        </td>
                        <td
                          className="px-6 py-4 cursor-pointer"
                          onClick={() => {
                            console.log('Task clicked:', task.id, task.subject);
                            setSelectedTask(task);
                          }}
                        >
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
                        <td
                          className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className="text-sm text-gray-900">
                            {task.owner ? `${task.owner.first_name} ${task.owner.last_name}` : 'Unassigned'}
                          </div>
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          <div className={`text-sm ${overdue ? 'text-red-600 font-semibold' : 'text-gray-900'}`}>
                            {formatDate(task.activity_date)}
                          </div>
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
                          {task.activity_priority && (
                            <span className={`px-2 py-1 text-xs font-medium rounded-full ${getPriorityColor(task.activity_priority)}`}>
                              {task.activity_priority.name}
                            </span>
                          )}
                        </td>
                        <td
                          className="px-6 py-4 whitespace-nowrap cursor-pointer"
                          onClick={() => setSelectedTask(task)}
                        >
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

      {/* Task Edit Modal */}
      {selectedTask && (
        <AddTaskModal
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={async () => {
            await loadTasks(activeCard);
            await loadCardCounts();
            setSelectedTask(null);
          }}
          editMode={true}
          existingTask={selectedTask}
        />
      )}

      {/* Toast Notification */}
      {showToastFlag && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up">
          <div
            className={`px-6 py-4 rounded-lg shadow-lg ${
              toastType === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            <div className="flex items-center gap-3">
              {toastType === 'success' ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              )}
              <span className="font-medium">{toastMessage}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskDashboardPage;
