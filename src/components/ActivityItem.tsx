import React, { useState } from 'react';
import { formatDistanceToNow, format, parseISO, isAfter, startOfDay } from 'date-fns';
import { ActivityWithRelations } from '../hooks/useActivities';
import { supabase } from '../lib/supabaseClient';
import { 
  PhoneIcon, 
  EnvelopeIcon, 
  CheckCircleIcon, 
  ClockIcon,
  UserIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import { 
  PhoneIcon as PhoneIconSolid,
  EnvelopeIcon as EnvelopeIconSolid,
  CheckCircleIcon as CheckCircleIconSolid
} from '@heroicons/react/24/solid';
import ActivityDetailView from './ActivityDetailView';

interface ActivityItemProps {
  activity: ActivityWithRelations;
  onActivityUpdate?: (updatedActivity: ActivityWithRelations) => void;
  onTaskClick?: (activity: ActivityWithRelations) => void;
}

const getActivityIcon = (activity: ActivityWithRelations, onToggleComplete?: () => void) => {
  const isCompleted = activity.activity_status?.is_closed || activity.completed_call || activity.sf_is_closed;
  const iconClass = "w-5 h-5";
  
  // Determine icon based on activity type or Salesforce subtype
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;
  
  const iconElement = (() => {
    switch (activityType) {
      case 'Call':
        return isCompleted ? 
          <PhoneIconSolid className={`${iconClass} text-green-500`} /> : 
          <PhoneIcon className={`${iconClass} text-blue-500`} />;
      case 'Email':
      case 'ListEmail':
        return isCompleted ? 
          <EnvelopeIconSolid className={`${iconClass} text-green-500`} /> : 
          <EnvelopeIcon className={`${iconClass} text-blue-500`} />;
      case 'Task':
      default:
        return isCompleted ? 
          <CheckCircleIconSolid className={`${iconClass} text-green-500`} /> : 
          <CheckCircleIcon className={`${iconClass} text-gray-400 hover:text-gray-600`} />;
    }
  })();

  // For tasks, make the icon clickable to toggle completion
  if ((activityType === 'Task' || !activityType) && onToggleComplete) {
    return (
      <button
        onClick={onToggleComplete}
        className="flex-shrink-0 p-0.5 rounded-full hover:bg-gray-100 transition-colors group"
        title={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
        aria-label={isCompleted ? 'Mark as incomplete' : 'Mark as complete'}
      >
        {isCompleted ? (
          <CheckCircleIconSolid className={`${iconClass} text-green-500 group-hover:text-green-600`} />
        ) : (
          <CheckCircleIcon className={`${iconClass} text-gray-400 group-hover:text-green-500 transition-colors`} />
        )}
      </button>
    );
  }

  return iconElement;
};

const getPriorityBadge = (activity: ActivityWithRelations) => {
  const priority = activity.activity_priority;
  const isHighPriority = priority?.is_high_priority || activity.is_high_priority;
  const priorityName = priority?.name || (activity.is_high_priority ? activity.sf_task_priority || 'High Priority' : null);
  
  if (!isHighPriority || !priorityName) return null;
  
  return (
    <span 
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
      style={{ backgroundColor: priority?.color ? `${priority.color}20` : '#FEF2F2' }}
    >
      <ExclamationTriangleIcon className="w-3 h-3" />
      {priorityName}
    </span>
  );
};

const getStatusBadge = (activity: ActivityWithRelations) => {
  const status = activity.activity_status;
  const statusName = status?.name || activity.sf_status;
  const isCompleted = status?.is_closed || activity.sf_is_closed;
  
  if (!statusName) return null;
  
  return (
    <span 
      className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
        isCompleted ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      }`}
      style={{ 
        backgroundColor: status?.color ? `${status.color}20` : (isCompleted ? '#F0FDF4' : '#F9FAFB'),
        color: status?.color || (isCompleted ? '#166534' : '#374151')
      }}
    >
      {statusName}
    </span>
  );
};

const getOverdueBadge = (activity: ActivityWithRelations) => {
  // Only show overdue for tasks (not calls or emails)
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;
  if (activityType !== 'Task' && !activityType) return null;

  // Don't show overdue if task is already completed
  const isCompleted = activity.activity_status?.is_closed || activity.completed_call || activity.sf_is_closed;
  if (isCompleted) return null;

  // Check if activity_date (due date) is in the past (overdue)
  if (!activity.activity_date) return null;

  // Parse as local date to avoid timezone issues
  const [year, month, day] = activity.activity_date.split('T')[0].split('-').map(Number);
  const dueDate = new Date(year, month - 1, day);
  const today = startOfDay(new Date());
  const dueDateStart = startOfDay(dueDate);

  // Only show if due date is before today (overdue)
  if (!isAfter(today, dueDateStart)) return null;

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800"
      title={`Overdue since ${format(dueDate, 'MMM d, yyyy')}`}
    >
      <ClockIcon className="w-3 h-3" />
      Overdue
    </span>
  );
};

const formatCallDuration = (seconds: number | null) => {
  if (!seconds) return null;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, onActivityUpdate, onTaskClick }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Parse dates as local dates to avoid timezone issues
  const activityDate = activity.activity_date
    ? (() => {
        const [year, month, day] = activity.activity_date.split('T')[0].split('-').map(Number);
        return new Date(year, month - 1, day);
      })()
    : null;

  const createdDate = activity.created_at ? new Date(activity.created_at) : null;
  const completedDate = activity.completed_at ? new Date(activity.completed_at) : null;
  const isCompleted = activity.activity_status?.is_closed || activity.completed_call || activity.sf_is_closed;

  // For completed activities, prefer completed_at date; otherwise use activity_date or created_at
  const displayDate = (isCompleted && completedDate) ? completedDate : (activityDate || createdDate);
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;

  const handleToggleExpand = () => {
    // If onTaskClick is provided, use the edit slidebar instead of inline expansion
    if (onTaskClick) {
      onTaskClick(activity);
    } else {
      setIsExpanded(!isExpanded);
    }
  };

  const handleToggleComplete = async () => {
    if (isToggling) return; // Prevent multiple clicks
    
    setIsToggling(true);
    try {
      const isCurrentlyCompleted = activity.activity_status?.is_closed || activity.completed_call || activity.sf_is_closed;
      
      // Find Open and Completed statuses
      const { data: statuses } = await supabase
        .from('activity_status')
        .select('*')
        .in('name', ['Open', 'Completed']);
      
      if (!statuses || statuses.length === 0) {
        throw new Error('Could not find Open/Completed statuses');
      }
      
      const openStatus = statuses.find(s => s.name?.toLowerCase() === 'open');
      const completedStatus = statuses.find(s => s.name?.toLowerCase() === 'completed');
      
      const newStatusId = isCurrentlyCompleted ? openStatus?.id : completedStatus?.id;
      
      if (!newStatusId) {
        throw new Error(`Could not find ${isCurrentlyCompleted ? 'Open' : 'Completed'} status`);
      }
      
      // Update the activity status and completion timestamp
      const updateData: any = { 
        status_id: newStatusId,
        updated_at: new Date().toISOString()
      };
      
      // Set or clear completion timestamp based on status
      if (isCurrentlyCompleted) {
        // Marking as incomplete - clear completion timestamp
        updateData.completed_at = null;
      } else {
        // Marking as complete - set completion timestamp
        updateData.completed_at = new Date().toISOString();
      }

      const { data: updatedActivity, error } = await supabase
        .from('activity')
        .update(updateData)
        .eq('id', activity.id)
        .select(`
          *,
          activity_status!activity_status_id_fkey (
            name,
            color,
            is_closed
          ),
          activity_type!activity_activity_type_id_fkey (
            name,
            color
          ),
          activity_priority!activity_activity_priority_id_fkey (
            name,
            color
          ),
          activity_task_type!activity_activity_task_type_id_fkey (
            name,
            category
          ),
          owner:user!activity_owner_id_fkey (
            first_name,
            last_name,
            email
          ),
          contact!activity_contact_id_fkey (
            first_name,
            last_name,
            company
          )
        `)
        .single();
      
      if (error) throw error;
      
      // Call the update callback to refresh the parent
      onActivityUpdate?.(updatedActivity);
      
    } catch (error) {
      console.error('Error toggling activity completion:', error);
      alert('Failed to update task status. Please try again.');
    } finally {
      setIsToggling(false);
    }
  };
  
  return (
    <div className="border-b border-gray-100 last:border-b-0 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {/* Activity Icon */}
        <div className="flex-shrink-0 mt-1">
          {getActivityIcon(activity, handleToggleComplete)}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Subject and Badges */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {!onTaskClick && (
                <button
                  onClick={handleToggleExpand}
                  className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded transition-colors"
                  aria-label={isExpanded ? 'Collapse activity' : 'Expand activity'}
                >
                  {isExpanded ? (
                    <ChevronDownIcon className="w-5 h-5 text-gray-500" />
                  ) : (
                    <ChevronRightIcon className="w-5 h-5 text-gray-500" />
                  )}
                </button>
              )}
              <button
                onClick={handleToggleExpand}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors truncate text-left"
              >
                {activity.subject || 'Untitled Activity'}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getOverdueBadge(activity)}
              {getPriorityBadge(activity)}
              {getStatusBadge(activity)}
            </div>
          </div>
          
          {/* Description - Hide for emails and calls, show for tasks only */}
          {activity.description && !['Email', 'ListEmail', 'Call'].includes(activityType || '') && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
              {activity.description}
            </p>
          )}
          
          {/* Metadata Row */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {/* Contact */}
            {activity.contact && (
              <div className="flex items-center gap-1">
                <UserIcon className="w-5 h-5" />
                <span>
                  Contact: {activity.contact.first_name} {activity.contact.last_name}
                </span>
              </div>
            )}

            {/* Assigned User / Updated By */}
            {(activity.owner || activity.updated_by_user) && (
              <div className="flex items-center gap-1">
                <UserIcon className="w-5 h-5 text-blue-500" />
                <span className="font-medium">
                  {(() => {
                    if (activityType === 'Call' && activity.updated_by_user) {
                      const user = activity.updated_by_user;
                      const userName = user.first_name && user.last_name
                        ? `${user.first_name} ${user.last_name}`
                        : user.name || 'Unknown User';
                      const updatedAt = activity.updated_at
                        ? new Date(activity.updated_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                            hour12: true
                          })
                        : '';
                      return updatedAt
                        ? `Updated at: ${updatedAt} by ${userName}`
                        : `Updated by: ${userName}`;
                    } else if (activity.owner) {
                      const user = activity.owner;
                      return `Assigned to: ${user.first_name && user.last_name
                        ? `${user.first_name} ${user.last_name}`
                        : user.name || 'Unknown User'}`;
                    }
                    return '';
                  })()}
                </span>
              </div>
            )}

            {/* Call Duration */}
            {activity.call_duration_seconds && (
              <div className="flex items-center gap-1">
                <ClockIcon className="w-5 h-5" />
                <span>{formatCallDuration(activity.call_duration_seconds)}</span>
              </div>
            )}

            {/* Task Type */}
            {(activity.activity_task_type?.name || activity.sf_task_type) && (
              <div className="flex items-center gap-1">
                <span className="font-medium">
                  {activity.activity_task_type?.name || activity.sf_task_type}
                </span>
              </div>
            )}

            {/* Due Date - only for tasks */}
            {((activityType === 'Task' || !activityType) && activityDate) && (
              <div className="flex items-center gap-1">
                <ClockIcon className="w-5 h-5" />
                <span className={`font-medium ${
                  (() => {
                    const isCompleted = activity.activity_status?.is_closed || activity.completed_call || activity.sf_is_closed;
                    if (isCompleted) return 'text-gray-500';

                    const today = startOfDay(new Date());
                    const dueDateStart = startOfDay(activityDate);

                    if (isAfter(today, dueDateStart)) return 'text-red-600'; // Overdue
                    return 'text-gray-500'; // Not overdue
                  })()
                }`}>
                  Due {format(activityDate, 'MMM d, yyyy')}
                </span>
              </div>
            )}
          </div>
          
          {/* Date and Time */}
          {displayDate && (
            <div className="mt-2 text-xs text-gray-400">
              <div className="flex items-center justify-between">
                <span>
                  {isCompleted && completedDate ? 'Completed at: ' : ''}
                  {format(displayDate, 'MMM d, yyyy')}
                </span>
                {createdDate && displayDate.getTime() !== createdDate.getTime() && (
                  <span>
                    Created {formatDistanceToNow(createdDate, { addSuffix: true })}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Expanded Detail View */}
      {isExpanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <ActivityDetailView 
            activity={activity} 
            onActivityUpdate={onActivityUpdate}
            onClose={() => setIsExpanded(false)}
          />
        </div>
      )}
    </div>
  );
};

export default ActivityItem;