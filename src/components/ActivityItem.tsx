import React, { useState } from 'react';
import { formatDistanceToNow, format } from 'date-fns';
import { ActivityWithRelations } from '../hooks/useActivities';
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
}

const getActivityIcon = (activity: ActivityWithRelations) => {
  const isCompleted = activity.activity_status?.is_closed || activity.completed_call || activity.sf_is_closed;
  const iconClass = "w-5 h-5";
  
  // Determine icon based on activity type or Salesforce subtype
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;
  
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
        <CheckCircleIcon className={`${iconClass} text-gray-400`} />;
  }
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

const formatCallDuration = (seconds: number | null) => {
  if (!seconds) return null;
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  
  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const ActivityItem: React.FC<ActivityItemProps> = ({ activity, onActivityUpdate }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const activityDate = activity.activity_date ? new Date(activity.activity_date) : null;
  const createdDate = activity.created_at ? new Date(activity.created_at) : null;
  const displayDate = activityDate || createdDate;
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;

  const handleToggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  
  return (
    <div className="border-b border-gray-100 last:border-b-0 py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        {/* Activity Icon */}
        <div className="flex-shrink-0 mt-1">
          {getActivityIcon(activity)}
        </div>
        
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Subject and Badges */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <button
                onClick={handleToggleExpand}
                className="flex-shrink-0 p-0.5 hover:bg-gray-100 rounded transition-colors"
                aria-label={isExpanded ? 'Collapse activity' : 'Expand activity'}
              >
                {isExpanded ? (
                  <ChevronDownIcon className="w-4 h-4 text-gray-500" />
                ) : (
                  <ChevronRightIcon className="w-4 h-4 text-gray-500" />
                )}
              </button>
              <button
                onClick={handleToggleExpand}
                className="text-sm font-medium text-gray-900 hover:text-blue-600 transition-colors truncate text-left"
              >
                {activity.subject || 'Untitled Activity'}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {getPriorityBadge(activity)}
              {getStatusBadge(activity)}
            </div>
          </div>
          
          {/* Description - Hide for emails, show for tasks and calls */}
          {activity.description && !['Email', 'ListEmail'].includes(activityType || '') && (
            <p className="text-sm text-gray-600 mb-2 line-clamp-2">
              {activity.description}
            </p>
          )}
          
          {/* Metadata Row */}
          <div className="flex items-center gap-4 text-xs text-gray-500">
            {/* Contact */}
            {activity.contact && (
              <div className="flex items-center gap-1">
                <UserIcon className="w-4 h-4" />
                <span>
                  {activity.contact.first_name} {activity.contact.last_name}
                </span>
              </div>
            )}
            
            {/* Owner */}
            {activity.owner && (
              <div className="flex items-center gap-1">
                <UserIcon className="w-4 h-4" />
                <span>
                  {activity.owner.first_name && activity.owner.last_name 
                    ? `${activity.owner.first_name} ${activity.owner.last_name}`
                    : activity.owner.name
                  }
                </span>
              </div>
            )}
            
            {/* Call Duration */}
            {activity.call_duration_seconds && (
              <div className="flex items-center gap-1">
                <ClockIcon className="w-4 h-4" />
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
          </div>
          
          {/* Date and Time */}
          {displayDate && (
            <div className="mt-2 text-xs text-gray-400">
              <div className="flex items-center justify-between">
                <span>
                  {activityDate && format(activityDate, 'MMM d, yyyy')}
                  {!activityDate && createdDate && `Created ${formatDistanceToNow(createdDate, { addSuffix: true })}`}
                </span>
                {activityDate && createdDate && activityDate.getTime() !== createdDate.getTime() && (
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