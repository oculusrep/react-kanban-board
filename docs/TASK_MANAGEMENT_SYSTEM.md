# Task Management System Documentation

## Overview

The Task Management System is a comprehensive feature that allows users to create, organize, track, and manage tasks across the entire CRM. It provides a centralized dashboard to view all tasks with powerful filtering, sorting, and search capabilities.

## Features

### Core Functionality

1. **Centralized Task Dashboard**
   - Single page view of all tasks in the system
   - Real-time task statistics with visual metrics
   - Comprehensive filtering and sorting options
   - Quick access to task details and related objects

2. **Task Filtering**
   - **Status Filter**: All Tasks, Open, Completed
   - **Assignment Filter**: All Users, My Tasks, or specific user
   - **Priority Filter**: Filter by priority levels
   - **Task Category Filter**: Filter by task type/category
   - **Date Range Filter**: Overdue, Today, This Week, Next Week, This Month
   - **Search**: Full-text search across task subjects, descriptions, and assignees

3. **Task Sorting**
   - Sort by Due Date, Priority, Created Date, or Updated Date
   - Ascending or descending order
   - Visual sort direction indicator

4. **Task Statistics Dashboard**
   - **Total Tasks**: Total count of all tasks
   - **Open**: Number of open/incomplete tasks
   - **Completed**: Number of completed tasks
   - **Overdue**: Number of overdue open tasks
   - **Due Today**: Tasks due today
   - **Due This Week**: Tasks due within the current week

5. **Task Details View**
   - Click any task to view full details in a slideout panel
   - Edit task properties inline
   - View related objects (Deals, Contacts, Properties, etc.)
   - Delete tasks with confirmation

6. **Task Creation**
   - Quick "Add Task" button always accessible
   - Pre-filled defaults for new tasks
   - Assign to current user by default
   - Link tasks to related objects

## Database Schema

The task management system uses the existing `activity` table with the following key fields:

### Activity Table
```typescript
{
  id: string                          // Primary key
  subject: string                     // Task title/subject (required)
  description: string | null          // Detailed task description
  activity_date: string | null        // Due date (timestamp)
  activity_type_id: string            // Links to activity_type (must be "Task")
  activity_task_type_id: string       // Task category/subcategory
  activity_priority_id: string        // Task priority level
  status_id: string                   // Task status (Open, Completed, etc.)
  owner_id: string                    // Assigned user ID

  // Related object foreign keys
  deal_id: string | null
  contact_id: string | null
  client_id: string | null
  property_id: string | null
  site_submit_id: string | null
  assignment_id: string | null

  // Timestamps
  created_at: string                  // Auto-generated creation timestamp
  updated_at: string                  // Auto-updated modification timestamp
  completed_at: string | null         // Timestamp when task was completed
}
```

### Activity Status Table
```typescript
{
  id: string
  name: string                        // Status name (e.g., "Open", "Completed")
  active: boolean                     // Whether this status is active
  is_closed: boolean                  // Whether this status represents completion
  is_default: boolean                 // Whether this is the default status
  color: string | null                // Badge color for UI
  sort_order: number | null           // Display order
}
```

### Activity Priority Table
```typescript
{
  id: string
  name: string                        // Priority name (e.g., "High", "Medium", "Low")
  active: boolean
  is_high_priority: boolean           // Flag for high-priority items
  is_default: boolean
  color: string | null
  sort_order: number | null
}
```

### Activity Task Type Table
```typescript
{
  id: string
  name: string                        // Task category name
  category: string | null             // Grouping category
  description: string | null          // Description of task type
  active: boolean
  color: string | null
  icon: string | null
  sort_order: number | null
}
```

## Implementation Details

### File Structure

```
src/
├── pages/
│   └── TaskDashboardPage.tsx       # Main task dashboard component
├── components/
│   ├── AddTaskModal.tsx            # Task creation modal (existing)
│   └── ActivityDetailView.tsx      # Task detail slideout (existing)
├── types/
│   └── activity.ts                 # TypeScript interfaces
└── App.tsx                         # Route configuration
```

### Key Components

#### 1. TaskDashboardPage Component

**Location**: `src/pages/TaskDashboardPage.tsx`

**Purpose**: Main dashboard page for task management

**Features**:
- Loads all tasks with full relational data
- Provides filtering, sorting, and search UI
- Displays task statistics
- Handles task selection and navigation
- Integrates with AddTaskModal and ActivityDetailView

**Key Functions**:

```typescript
// Load all tasks with relations
const loadTasks = async () => {
  const { data, error } = await supabase
    .from('activity')
    .select(`
      *,
      activity_status (*),
      activity_type (*),
      activity_priority (*),
      activity_task_type (*),
      owner:user!activity_owner_id_fkey (*),
      contact (*),
      deal (id, deal_name),
      client (id, client_name),
      property (id, property_name),
      site_submit (id, site_submit_name)
    `)
    .eq('activity_type.name', 'Task')
    .order('activity_date', { ascending: true });

  setTasks(data);
};

// Calculate task statistics
const taskStats = useMemo(() => {
  // Counts: total, open, completed, overdue, due today, due this week
  return {
    total: tasks.length,
    open: tasks.filter(t => !t.activity_status?.is_closed).length,
    completed: tasks.filter(t => t.activity_status?.is_closed).length,
    overdue: tasks.filter(t => isOverdue(t)).length,
    dueToday: tasks.filter(t => isDueToday(t)).length,
    dueThisWeek: tasks.filter(t => isDueThisWeek(t)).length
  };
}, [tasks]);

// Filter and sort tasks
const filteredTasks = useMemo(() => {
  let filtered = [...tasks];

  // Apply all filters
  if (filters.status === 'open') {
    filtered = filtered.filter(task => !task.activity_status?.is_closed);
  }

  // Apply sort
  filtered.sort((a, b) => {
    // Sort by selected field and order
  });

  return filtered;
}, [tasks, filters, sortBy, sortOrder]);
```

#### 2. AddTaskModal Component

**Location**: `src/components/AddTaskModal.tsx` (existing)

**Purpose**: Modal for creating new tasks

**Features**:
- Auto-assigns to current user
- Sets default status to "Open"
- Sets default activity type to "Task"
- Allows selection of related objects
- Full validation before save

#### 3. ActivityDetailView Component

**Location**: `src/components/ActivityDetailView.tsx` (existing)

**Purpose**: Slideout panel for viewing/editing task details

**Features**:
- Full CRUD operations on tasks
- Navigate to related objects
- Edit all task properties
- Delete with confirmation

### Navigation Integration

#### Desktop Navigation
- Added "Tasks" link in top navigation bar between "Master Pipeline" and "Map"
- Location: `src/components/Navbar.tsx` (line 394)

```tsx
<Link to="/tasks" className={linkClass("/tasks")}>
  Tasks
</Link>
```

#### Mobile Navigation
- Added "Tasks" button in mobile hamburger menu
- Location: `src/components/Navbar.tsx` (line 515)

```tsx
<button
  onClick={() => navigate('/tasks')}
  className="w-full text-left px-4 py-2 rounded hover:bg-blue-50 text-gray-700"
>
  Tasks
</button>
```

### Routing

**Location**: `src/App.tsx` (line 50)

```tsx
<Route path="tasks" element={<TaskDashboardPage />} />
```

## User Experience

### Task Dashboard Flow

1. **Initial View**
   - User clicks "Tasks" in navigation
   - Dashboard loads with statistics and all open tasks
   - Default filter: "Open" tasks
   - Default sort: By due date (ascending)

2. **Filtering Tasks**
   - User can combine multiple filters simultaneously
   - Filters are applied in real-time
   - Result count updates dynamically
   - "Clear Filters" button resets all filters

3. **Searching Tasks**
   - Full-text search across subject, description, and assignee names
   - Search is case-insensitive
   - Debounced for performance (300ms)

4. **Viewing Task Details**
   - Click any row in the task table
   - Task detail panel slides in from right
   - Shows all task information and related objects
   - Can edit any field inline

5. **Creating New Tasks**
   - Click "+ Add Task" button (top right)
   - Modal slides in from right
   - Form pre-populated with defaults
   - Save creates task and refreshes dashboard

6. **Navigating to Related Objects**
   - Click any related object name in the "Related To" column
   - Navigates to that object's detail page
   - Example: Click "Deal XYZ" to go to deal detail page

### Visual Indicators

1. **Overdue Tasks**
   - Due date displayed in red text
   - Bold font weight for emphasis

2. **Priority Badges**
   - Color-coded based on priority level
   - High priority typically shows as red

3. **Status Badges**
   - Green for completed tasks
   - Blue for open/in-progress tasks

4. **Statistics Cards**
   - Color-coded by category:
     - Blue: Total tasks
     - Green: Open tasks
     - Gray: Completed tasks
     - Red: Overdue tasks
     - Yellow: Due today
     - Purple: Due this week

## Query Optimization

### Database Query Strategy

The system uses a single comprehensive query to load all tasks with their relations:

```typescript
const query = supabase
  .from('activity')
  .select(`
    *,
    activity_status (*),
    activity_type (*),
    activity_priority (*),
    activity_task_type (*),
    owner:user!activity_owner_id_fkey (*),
    contact (*),
    deal (id, deal_name),
    client (id, client_name),
    property (id, property_name),
    site_submit (id, site_submit_name)
  `)
  .eq('activity_type.name', 'Task')  // Filter for tasks only
  .order('activity_date', { ascending: true });
```

**Benefits**:
- Single database round-trip
- All data loaded at once
- Client-side filtering is fast
- No N+1 query issues

### Performance Considerations

1. **Memoization**
   - Task statistics calculated with `useMemo`
   - Filtered tasks calculated with `useMemo`
   - Only recalculates when dependencies change

2. **Debounced Search**
   - Search input debounced by 300ms
   - Prevents excessive re-renders during typing

3. **Efficient Sorting**
   - In-memory sorting of pre-loaded data
   - No database calls for sort changes

## Testing Scenarios

### Basic Functionality Tests

1. **Test: View All Tasks**
   - Navigate to /tasks
   - Verify task list loads
   - Verify statistics are accurate
   - Verify no console errors

2. **Test: Filter by Status**
   - Set filter to "Open"
   - Verify only open tasks shown
   - Set filter to "Completed"
   - Verify only completed tasks shown

3. **Test: Filter by Assigned User**
   - Select "My Tasks"
   - Verify only current user's tasks shown
   - Select specific user
   - Verify only that user's tasks shown

4. **Test: Search Tasks**
   - Enter search term in search box
   - Verify filtered results match search term
   - Clear search
   - Verify all tasks return

5. **Test: Sort Tasks**
   - Click sort dropdown
   - Select "Priority"
   - Verify tasks sorted by priority
   - Click sort order toggle
   - Verify order reverses

6. **Test: View Task Details**
   - Click any task row
   - Verify detail panel opens
   - Verify all task data displayed
   - Close panel
   - Verify panel closes

7. **Test: Create New Task**
   - Click "+ Add Task" button
   - Fill in required fields
   - Click "Create Task"
   - Verify task appears in list
   - Verify statistics update

8. **Test: Navigate to Related Object**
   - Find task with related object
   - Click related object link
   - Verify navigation to object detail page

### Edge Cases

1. **Test: No Tasks**
   - Apply filters that match no tasks
   - Verify empty state message shown
   - Verify no errors

2. **Test: Overdue Tasks**
   - Create task with past due date
   - Verify task shows in "Overdue" filter
   - Verify due date shown in red

3. **Test: Tasks Without Dates**
   - Create task without due date
   - Verify task appears in list
   - Verify "No date" displayed

4. **Test: Tasks Without Assignment**
   - Create task without assigned user
   - Verify task appears in list
   - Verify "Unassigned" displayed

## Integration Points

### Existing Components Used

1. **AddTaskModal** (`src/components/AddTaskModal.tsx`)
   - Used for task creation
   - Already integrated with activity system
   - No modifications needed

2. **ActivityDetailView** (`src/components/ActivityDetailView.tsx`)
   - Used for viewing/editing tasks
   - Already supports full CRUD operations
   - No modifications needed

3. **Navbar** (`src/components/Navbar.tsx`)
   - Modified to add "Tasks" navigation link
   - Both desktop and mobile menus updated

4. **App.tsx** (`src/App.tsx`)
   - Modified to add /tasks route
   - Route protected with authentication

### Data Flow

```
TaskDashboardPage
    ↓
    ├─→ Loads all tasks via Supabase query
    ├─→ Calculates statistics (useMemo)
    ├─→ Applies filters and sorting (useMemo)
    ├─→ Renders task table
    ↓
User Interaction
    ↓
    ├─→ Click "Add Task" → Opens AddTaskModal
    │   └─→ On Save → Refreshes tasks → Closes modal
    │
    ├─→ Click Task Row → Opens ActivityDetailView
    │   └─→ On Update/Delete → Refreshes tasks → Closes panel
    │
    └─→ Click Related Object → Navigates to object page
```

## Future Enhancements

### Potential Features

1. **Board View**
   - Kanban-style board grouped by status
   - Drag-and-drop to change status
   - Toggle between list and board view

2. **Bulk Actions**
   - Select multiple tasks
   - Bulk status update
   - Bulk assignment
   - Bulk delete

3. **Task Templates**
   - Save common task configurations
   - Quick create from template

4. **Task Dependencies**
   - Link tasks together
   - Predecessor/successor relationships
   - Visual dependency graph

5. **Recurring Tasks**
   - Set recurrence pattern
   - Auto-create next occurrence
   - Skip or modify instances

6. **Task Comments/Notes**
   - Add comments to tasks
   - @ mention other users
   - Comment history

7. **Task Attachments**
   - Upload files to tasks
   - View/download attachments

8. **Advanced Filtering**
   - Saved filter sets
   - Complex filter combinations
   - Custom filter builder

9. **Email Notifications**
   - Task assignment notifications
   - Due date reminders
   - Overdue alerts

10. **Calendar View**
    - Monthly calendar with tasks
    - Day/week/month views
    - Drag tasks to reschedule

## Troubleshooting

### Common Issues

1. **Tasks not loading**
   - Check browser console for errors
   - Verify Supabase connection
   - Check network tab for failed requests
   - Verify user has proper permissions

2. **Filters not working**
   - Clear browser cache
   - Check console for JavaScript errors
   - Verify filter values in database exist

3. **Statistics incorrect**
   - Refresh page to reload all tasks
   - Check date/time calculations
   - Verify status configuration (is_closed flags)

4. **Task creation fails**
   - Verify all required fields filled
   - Check for validation errors
   - Verify user has insert permissions
   - Check database constraints

## Code Examples

### Creating a Task Programmatically

```typescript
import { supabase } from '../lib/supabaseClient';

const createTask = async (taskData: {
  subject: string;
  description?: string;
  activity_date?: string;
  owner_id?: string;
  deal_id?: string;
}) => {
  // Get activity type ID for "Task"
  const { data: taskType } = await supabase
    .from('activity_type')
    .select('id')
    .eq('name', 'Task')
    .single();

  // Get default "Open" status
  const { data: openStatus } = await supabase
    .from('activity_status')
    .select('id')
    .eq('name', 'Open')
    .single();

  // Create the task
  const { data, error } = await supabase
    .from('activity')
    .insert({
      subject: taskData.subject,
      description: taskData.description,
      activity_date: taskData.activity_date,
      activity_type_id: taskType.id,
      status_id: openStatus.id,
      owner_id: taskData.owner_id,
      deal_id: taskData.deal_id
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating task:', error);
    return null;
  }

  return data;
};
```

### Querying Tasks for a Specific User

```typescript
import { supabase } from '../lib/supabaseClient';

const getUserTasks = async (userId: string) => {
  const { data, error } = await supabase
    .from('activity')
    .select(`
      *,
      activity_status (*),
      activity_priority (*),
      activity_task_type (*)
    `)
    .eq('activity_type.name', 'Task')
    .eq('owner_id', userId)
    .eq('activity_status.is_closed', false)  // Open tasks only
    .order('activity_date', { ascending: true });

  return data || [];
};
```

### Updating Task Status to Completed

```typescript
import { supabase } from '../lib/supabaseClient';

const completeTask = async (taskId: string) => {
  // Get "Completed" status ID
  const { data: completedStatus } = await supabase
    .from('activity_status')
    .select('id')
    .eq('name', 'Completed')
    .eq('is_closed', true)
    .single();

  // Update the task
  const { data, error } = await supabase
    .from('activity')
    .update({
      status_id: completedStatus.id,
      completed_at: new Date().toISOString()
    })
    .eq('id', taskId)
    .select()
    .single();

  return data;
};
```

## Related Documentation

- [Activity System Overview](./ACTIVITY_SYSTEM.md) (if exists)
- [Database Schema Reference](../database-schema.ts)
- [AddTaskModal Component](../src/components/AddTaskModal.tsx)
- [ActivityDetailView Component](../src/components/ActivityDetailView.tsx)

## Changelog

### Version 1.0.0 (2025-10-18)

**Initial Release**
- Created TaskDashboardPage component with full task management features
- Added "Tasks" navigation menu item (desktop and mobile)
- Integrated with existing AddTaskModal and ActivityDetailView components
- Implemented comprehensive filtering system (status, user, priority, date range, search)
- Added sorting capabilities (due date, priority, created, updated)
- Created real-time task statistics dashboard
- Documented complete system architecture and usage
- Added route protection and navigation integration

**Files Created**:
- `src/pages/TaskDashboardPage.tsx`
- `docs/TASK_MANAGEMENT_SYSTEM.md`

**Files Modified**:
- `src/components/Navbar.tsx` - Added Tasks navigation link
- `src/App.tsx` - Added /tasks route

## Support

For issues or questions:
1. Check this documentation first
2. Review browser console for errors
3. Check network requests in browser dev tools
4. Verify database schema and permissions
5. Contact development team if issue persists
