import React, { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { ActivityWithRelations } from '../hooks/useActivities';
import { parseEmailDescription, formatEmailAddress, formatEmailBodyForDisplay } from '../utils/emailParser';
import AdvancedEmailView from './AdvancedEmailView';
import { 
  XMarkIcon,
  PencilIcon,
  EyeIcon,
  PhoneIcon,
  EnvelopeIcon,
  CheckCircleIcon,
  CalendarIcon,
  UserIcon,
  ClockIcon,
  DocumentTextIcon,
  PaperClipIcon
} from '@heroicons/react/24/outline';

interface ActivityDetailViewProps {
  activity: ActivityWithRelations;
  onActivityUpdate?: (updatedActivity: ActivityWithRelations) => void;
  onClose: () => void;
}

const ActivityDetailView: React.FC<ActivityDetailViewProps> = ({ 
  activity, 
  onActivityUpdate, 
  onClose 
}) => {
  const [isEditing, setIsEditing] = useState(false);
  
  // Determine activity type
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;
  const isTask = activityType === 'Task' || !activityType;
  const isCall = activityType === 'Call';
  const isEmail = ['Email', 'ListEmail'].includes(activityType || '');
  
  // Get completion status
  const isCompleted = activity.activity_status?.is_closed || 
                     activity.sf_is_closed || 
                     activity.completed_call ||
                     (activity.sf_status && ['Completed', 'Complete', 'Closed'].includes(activity.sf_status));

  const handleEditToggle = () => {
    if (isTask) {
      setIsEditing(!isEditing);
    }
  };

  const getIcon = () => {
    switch (activityType) {
      case 'Call':
        return <PhoneIcon className="w-5 h-5 text-blue-600" />;
      case 'Email':
      case 'ListEmail':
        return <EnvelopeIcon className="w-5 h-5 text-purple-600" />;
      default:
        return <CheckCircleIcon className="w-5 h-5 text-green-600" />;
    }
  };

  return (
    <div className="bg-gray-50 rounded-lg p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          {getIcon()}
          <div>
            <h3 className="font-medium text-gray-900">
              {activity.subject || 'Untitled Activity'}
            </h3>
            <p className="text-sm text-gray-600">
              {activityType} • {isCompleted ? 'Completed' : 'Open'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isTask && (
            <button
              onClick={handleEditToggle}
              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-md transition-colors"
              title={isEditing ? 'View mode' : 'Edit mode'}
            >
              {isEditing ? <EyeIcon className="w-4 h-4" /> : <PencilIcon className="w-4 h-4" />}
            </button>
          )}
          <button
            onClick={onClose}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-white rounded-md transition-colors"
            title="Close"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content based on activity type and edit mode */}
      {isTask && isEditing ? (
        <TaskEditForm 
          activity={activity} 
          onSave={(updated) => {
            onActivityUpdate?.(updated);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : isEmail ? (
        <AdvancedEmailView activity={activity} />
      ) : (
        <ActivityReadOnlyView activity={activity} />
      )}
    </div>
  );
};

// Task Edit Form Component
interface TaskEditFormProps {
  activity: ActivityWithRelations;
  onSave: (activity: ActivityWithRelations) => void;
  onCancel: () => void;
}

const TaskEditForm: React.FC<TaskEditFormProps> = ({ activity, onSave, onCancel }) => {
  const [subject, setSubject] = useState(activity.subject || '');
  const [description, setDescription] = useState(activity.description || '');
  const [activityDate, setActivityDate] = useState(
    activity.activity_date ? format(new Date(activity.activity_date), 'yyyy-MM-dd') : ''
  );

  const handleSave = () => {
    // TODO: Implement actual save to database
    const updatedActivity = {
      ...activity,
      subject,
      description,
      activity_date: activityDate || null,
      updated_at: new Date().toISOString()
    };
    onSave(updatedActivity);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Subject
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Activity subject..."
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Activity description..."
        />
      </div>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Activity Date
        </label>
        <input
          type="date"
          value={activityDate}
          onChange={(e) => setActivityDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      
      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// Read-only view component
interface ActivityReadOnlyViewProps {
  activity: ActivityWithRelations;
}

const ActivityReadOnlyView: React.FC<ActivityReadOnlyViewProps> = ({ activity }) => {
  const activityType = activity.activity_type?.name || activity.sf_task_subtype;
  
  return (
    <div className="space-y-4">
      {/* Description */}
      {activity.description && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <DocumentTextIcon className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-700">Description</span>
          </div>
          <div className="bg-white p-3 rounded-md border text-sm text-gray-700 whitespace-pre-wrap">
            {activity.description}
          </div>
        </div>
      )}

      {/* Activity Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Date Information */}
        {activity.activity_date && (
          <div className="flex items-start gap-2">
            <CalendarIcon className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-gray-700">Activity Date</span>
              <p className="text-sm text-gray-600">
                {format(new Date(activity.activity_date), 'MMM d, yyyy')}
              </p>
            </div>
          </div>
        )}

        {/* Contact Information */}
        {activity.contact && (
          <div className="flex items-start gap-2">
            <UserIcon className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-gray-700">Contact</span>
              <p className="text-sm text-gray-600">
                {activity.contact.first_name} {activity.contact.last_name}
              </p>
              {activity.contact.email && (
                <p className="text-sm text-gray-500">{activity.contact.email}</p>
              )}
            </div>
          </div>
        )}

        {/* Call Duration */}
        {activity.call_duration_seconds && (
          <div className="flex items-start gap-2">
            <ClockIcon className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-gray-700">Call Duration</span>
              <p className="text-sm text-gray-600">
                {Math.floor(activity.call_duration_seconds / 60)}m {activity.call_duration_seconds % 60}s
              </p>
            </div>
          </div>
        )}

        {/* Call Disposition */}
        {activity.call_disposition && (
          <div className="flex items-start gap-2">
            <PhoneIcon className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-gray-700">Call Outcome</span>
              <p className="text-sm text-gray-600">{activity.call_disposition}</p>
            </div>
          </div>
        )}

        {/* Owner */}
        {activity.owner && (
          <div className="flex items-start gap-2">
            <UserIcon className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-gray-700">Assigned To</span>
              <p className="text-sm text-gray-600">
                {activity.owner.first_name && activity.owner.last_name 
                  ? `${activity.owner.first_name} ${activity.owner.last_name}`
                  : activity.owner.name
                }
              </p>
            </div>
          </div>
        )}

        {/* Task Type */}
        {(activity.activity_task_type?.name || activity.sf_task_type) && (
          <div className="flex items-start gap-2">
            <CheckCircleIcon className="w-4 h-4 text-gray-500 mt-0.5" />
            <div>
              <span className="text-sm font-medium text-gray-700">Task Type</span>
              <p className="text-sm text-gray-600">
                {activity.activity_task_type?.name || activity.sf_task_type}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Salesforce Legacy Info */}
      {activity.sf_id && (
        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Salesforce ID: {activity.sf_id}
          </p>
          {activity.created_at && (
            <p className="text-xs text-gray-500">
              Created: {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Email-specific read-only view component
interface EmailReadOnlyViewProps {
  activity: ActivityWithRelations;
}

const EmailReadOnlyView: React.FC<EmailReadOnlyViewProps> = ({ activity }) => {
  // Memoize email parsing to avoid re-parsing on every render
  const parsedEmail = useMemo(() => 
    parseEmailDescription(activity.description || ''), 
    [activity.description]
  );
  
  // Memoize formatted content to avoid re-formatting on every render
  const formattedBody = useMemo(() => 
    parsedEmail ? formatEmailBodyForDisplay(parsedEmail.body) : [], 
    [parsedEmail?.body]
  );
  
  const formattedFallbackDescription = useMemo(() => 
    formatEmailBodyForDisplay(activity.description || ''), 
    [activity.description]
  );
  
  // Use activity subject as email subject if not parsed
  const emailSubject = parsedEmail?.subject || activity.subject || 'No Subject';
  
  // Format date
  const emailDate = parsedEmail?.date || 
    (activity.activity_date ? format(new Date(activity.activity_date), 'MMM d, yyyy h:mm a') : '') ||
    (activity.created_at ? format(new Date(activity.created_at), 'MMM d, yyyy h:mm a') : '');

  const formatEmailList = (emails: string[]) => {
    return emails.map(email => {
      const formatted = formatEmailAddress(email);
      return formatted.name ? `${formatted.name} <${formatted.email}>` : formatted.email;
    }).join(', ');
  };

  return (
    <div className="space-y-4">
      {/* Email Headers */}
      <div className="bg-white border rounded-lg">
        {/* Email Header Bar */}
        <div className="px-4 py-3 border-b bg-gray-50">
          <div className="flex items-center gap-2">
            <EnvelopeIcon className="w-5 h-5 text-blue-600" />
            <span className="font-medium text-gray-900">Email Details</span>
          </div>
        </div>
        
        {/* Email Metadata */}
        <div className="px-4 py-3 space-y-3">
          {/* Subject */}
          <div>
            <span className="text-sm font-medium text-gray-700">Subject:</span>
            <p className="text-sm text-gray-900 mt-1 font-medium">{emailSubject}</p>
          </div>

          {/* From */}
          {parsedEmail?.from && (
            <div>
              <span className="text-sm font-medium text-gray-700">From:</span>
              <p className="text-sm text-gray-900 mt-1">{parsedEmail.from}</p>
            </div>
          )}

          {/* To */}
          {parsedEmail?.to && parsedEmail.to.length > 0 && (
            <div>
              <span className="text-sm font-medium text-gray-700">To:</span>
              <p className="text-sm text-gray-900 mt-1">{formatEmailList(parsedEmail.to)}</p>
            </div>
          )}

          {/* CC */}
          {parsedEmail?.cc && parsedEmail.cc.length > 0 && (
            <div>
              <span className="text-sm font-medium text-gray-700">CC:</span>
              <p className="text-sm text-gray-900 mt-1">{formatEmailList(parsedEmail.cc)}</p>
            </div>
          )}

          {/* Date */}
          {emailDate && (
            <div>
              <span className="text-sm font-medium text-gray-700">Date:</span>
              <p className="text-sm text-gray-900 mt-1">{emailDate}</p>
            </div>
          )}

          {/* Contact (if different from From) */}
          {activity.contact && (
            <div>
              <span className="text-sm font-medium text-gray-700">Related Contact:</span>
              <p className="text-sm text-gray-900 mt-1">
                {activity.contact.first_name} {activity.contact.last_name}
                {activity.contact.email && ` <${activity.contact.email}>`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Email Body */}
      {parsedEmail?.body && (
        <div className="bg-white border rounded-lg">
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Email Content</span>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {formattedBody.map((paragraph, index) => (
                <p key={index} className="text-gray-700">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Fallback: Show raw description if parsing failed */}
      {!parsedEmail?.body && activity.description && (
        <div className="bg-white border rounded-lg">
          <div className="px-4 py-3 border-b bg-gray-50">
            <div className="flex items-center gap-2">
              <DocumentTextIcon className="w-5 h-5 text-gray-600" />
              <span className="font-medium text-gray-900">Email Content</span>
            </div>
          </div>
          <div className="px-4 py-4">
            <div className="text-sm text-gray-700 leading-relaxed space-y-3">
              {formattedFallbackDescription.map((paragraph, index) => (
                <p key={index} className="text-gray-700">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Additional Email Metadata */}
      <div className="bg-gray-50 rounded-lg p-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-gray-600">
          {activity.sf_id && (
            <div>
              <span className="font-medium">Salesforce ID:</span> {activity.sf_id}
            </div>
          )}
          {activity.created_at && (
            <div>
              <span className="font-medium">Logged:</span>{' '}
              {format(new Date(activity.created_at), 'MMM d, yyyy h:mm a')}
            </div>
          )}
          {activity.owner && (
            <div>
              <span className="font-medium">Logged by:</span>{' '}
              {activity.owner.first_name && activity.owner.last_name 
                ? `${activity.owner.first_name} ${activity.owner.last_name}`
                : activity.owner.name
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivityDetailView;