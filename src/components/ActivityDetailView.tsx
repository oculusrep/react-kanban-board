import React, { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { ActivityWithRelations } from '../hooks/useActivities';
import { parseEmailDescription, formatEmailAddress, formatEmailBodyForDisplay } from '../utils/emailParser';
import { supabase } from '../lib/supabaseClient';
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
  PaperClipIcon,
  MagnifyingGlassIcon
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
    if (isTask || isCall) {
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
          {(isTask || isCall) && (
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
      {isEditing && isTask ? (
        <TaskEditForm
          activity={activity}
          onSave={(updated) => {
            onActivityUpdate?.(updated);
            setIsEditing(false);
          }}
          onCancel={() => setIsEditing(false)}
        />
      ) : isEditing && isCall ? (
        <CallEditForm
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
    activity.activity_date ? format(parseISO(activity.activity_date), 'yyyy-MM-dd') : ''
  );
  // Get user names from relations (already fetched in query)
  const createdByName = activity.created_by_user
    ? (activity.created_by_user.name ||
       `${activity.created_by_user.first_name || ''} ${activity.created_by_user.last_name || ''}`.trim() ||
       'Unknown User')
    : null;

  const updatedByName = activity.updated_by_user
    ? (activity.updated_by_user.name ||
       `${activity.updated_by_user.first_name || ''} ${activity.updated_by_user.last_name || ''}`.trim() ||
       'Unknown User')
    : null;

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
          Due Date
        </label>
        <input
          type="date"
          value={activityDate}
          onChange={(e) => setActivityDate(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      {/* Record Metadata */}
      <div className="bg-gray-50 rounded-lg p-4 mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Record Information</h4>
        <div className="space-y-2 text-xs text-gray-600">
          {activity.created_at && (
            <div>
              <span className="font-medium">Created: </span>
              <span>
                {new Date(activity.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                {createdByName && ` by ${createdByName}`}
              </span>
            </div>
          )}
          {activity.updated_at && (
            <div>
              <span className="font-medium">Last Updated: </span>
              <span>
                {new Date(activity.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                {updatedByName && ` by ${updatedByName}`}
              </span>
            </div>
          )}
        </div>
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

// Call Edit Form Component
interface CallEditFormProps {
  activity: ActivityWithRelations;
  onSave: (activity: ActivityWithRelations) => void;
  onCancel: () => void;
}

const CallEditForm: React.FC<CallEditFormProps> = ({ activity, onSave, onCancel }) => {
  const [subject, setSubject] = useState(activity.subject || '');
  const [description, setDescription] = useState(activity.description || '');
  const [contactSearch, setContactSearch] = useState(
    activity.contact ? `${activity.contact.first_name} ${activity.contact.last_name}`.trim() : ''
  );
  const [contacts, setContacts] = useState<any[]>([]);
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState(activity.contact_id || '');
  const [isProspectingCall, setIsProspectingCall] = useState(activity.is_prospecting_call || false);
  const [completedCall, setCompletedCall] = useState(activity.completed_call ?? true);
  const [meetingHeld, setMeetingHeld] = useState(activity.meeting_held || false);
  const [isPropertyProspectingCall, setIsPropertyProspectingCall] = useState(activity.is_property_prospecting_call || false);
  const [completedPropertyCall, setCompletedPropertyCall] = useState(activity.completed_property_call || false);
  const [isLoading, setIsLoading] = useState(false);
  // Get user names from relations (already fetched in query)
  const createdByName = activity.created_by_user
    ? (activity.created_by_user.name ||
       `${activity.created_by_user.first_name || ''} ${activity.created_by_user.last_name || ''}`.trim() ||
       'Unknown User')
    : null;

  const updatedByName = activity.updated_by_user
    ? (activity.updated_by_user.name ||
       `${activity.updated_by_user.first_name || ''} ${activity.updated_by_user.last_name || ''}`.trim() ||
       'Unknown User')
    : null;

  // Search contacts with debouncing
  useEffect(() => {
    const searchContacts = async () => {
      if (contactSearch.length < 2) {
        setContacts([]);
        return;
      }

      try {
        // Handle spaces in search by creating multiple OR conditions
        const searchTerms = contactSearch.trim().split(/\s+/);
        let orConditions = [];

        if (searchTerms.length === 1) {
          // Single term - search in all fields
          orConditions = [
            `first_name.ilike.%${searchTerms[0]}%`,
            `last_name.ilike.%${searchTerms[0]}%`,
            `company.ilike.%${searchTerms[0]}%`
          ];
        } else {
          // Multiple terms - add all combinations
          for (const term of searchTerms) {
            orConditions.push(
              `first_name.ilike.%${term}%`,
              `last_name.ilike.%${term}%`,
              `company.ilike.%${term}%`
            );
          }

          // Also search for the full string in each field
          orConditions.push(
            `first_name.ilike.%${contactSearch}%`,
            `last_name.ilike.%${contactSearch}%`,
            `company.ilike.%${contactSearch}%`
          );
        }

        const { data, error } = await supabase
          .from('contact')
          .select('id, first_name, last_name, company')
          .or(orConditions.join(','))
          .limit(50); // Get more results for better sorting

        if (error) throw error;

        if (!data) {
          setContacts([]);
          return;
        }

        // Sort results by relevance
        const searchLower = contactSearch.toLowerCase().trim();
        const sortSearchTerms = searchLower.split(/\s+/);

        const sortedContacts = data.sort((a, b) => {
          const aFullName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
          const bFullName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
          const aFirstName = (a.first_name || '').toLowerCase();
          const aLastName = (a.last_name || '').toLowerCase();
          const bFirstName = (b.first_name || '').toLowerCase();
          const bLastName = (b.last_name || '').toLowerCase();

          // Exact full name match gets highest priority
          if (aFullName === searchLower) return -1;
          if (bFullName === searchLower) return 1;

          // Multi-term exact match (e.g., "john smith" matches first: John, last: Smith)
          if (sortSearchTerms.length >= 2) {
            const aExactMatch = aFirstName === sortSearchTerms[0] && aLastName === sortSearchTerms[1];
            const bExactMatch = bFirstName === sortSearchTerms[0] && bLastName === sortSearchTerms[1];
            if (aExactMatch && !bExactMatch) return -1;
            if (bExactMatch && !aExactMatch) return 1;

            // Multi-term starts with match
            const aStartsMatch = aFirstName.startsWith(sortSearchTerms[0]) && aLastName.startsWith(sortSearchTerms[1]);
            const bStartsMatch = bFirstName.startsWith(sortSearchTerms[0]) && bLastName.startsWith(sortSearchTerms[1]);
            if (aStartsMatch && !bStartsMatch) return -1;
            if (bStartsMatch && !aStartsMatch) return 1;
          }

          // Full name starts with search gets next priority
          if (aFullName.startsWith(searchLower) && !bFullName.startsWith(searchLower)) return -1;
          if (bFullName.startsWith(searchLower) && !aFullName.startsWith(searchLower)) return 1;

          // First name exact match
          if (aFirstName === searchLower && bFirstName !== searchLower) return -1;
          if (bFirstName === searchLower && aFirstName !== searchLower) return 1;

          // Last name exact match
          if (aLastName === searchLower && bLastName !== searchLower) return -1;
          if (bLastName === searchLower && aLastName !== searchLower) return 1;

          // First name starts with search
          if (aFirstName.startsWith(searchLower) && !bFirstName.startsWith(searchLower)) return -1;
          if (bFirstName.startsWith(searchLower) && !aFirstName.startsWith(searchLower)) return 1;

          // Last name starts with search
          if (aLastName.startsWith(searchLower) && !bLastName.startsWith(searchLower)) return -1;
          if (bLastName.startsWith(searchLower) && !aLastName.startsWith(searchLower)) return 1;

          // Finally, sort alphabetically by full name
          return aFullName.localeCompare(bFullName);
        });

        setContacts(sortedContacts.slice(0, 10)); // Take top 10 results
      } catch (error) {
        console.error('Error searching contacts:', error);
      }
    };

    const timeoutId = setTimeout(searchContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [contactSearch]);

  const selectContact = (contact: any) => {
    setSelectedContactId(contact.id);
    setContactSearch(`${contact.first_name || ''} ${contact.last_name || ''}`.trim());
    setShowContactDropdown(false);
  };

  const handleSave = async () => {
    setIsLoading(true);
    try {
      const updateData: any = {
        subject,
        description: description || null,
        updated_at: new Date().toISOString(),
        contact_id: selectedContactId || null,
        is_prospecting_call: isProspectingCall,
        completed_call: completedCall,
        meeting_held: meetingHeld,
        is_property_prospecting_call: isPropertyProspectingCall,
        completed_property_call: completedPropertyCall
      };

      const { error: updateError } = await supabase
        .from('activity')
        .update(updateData)
        .eq('id', activity.id);

      if (updateError) {
        throw updateError;
      }

      // Return updated activity
      const updatedActivity = {
        ...activity,
        ...updateData
      };
      onSave(updatedActivity);
    } catch (error) {
      console.error('Error updating call:', error);
      alert('Failed to update call. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Subject *
        </label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Call subject..."
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Comments
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          placeholder="Call notes or comments..."
        />
      </div>

      {/* Related Contact */}
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Related Contact
        </label>
        <div className="relative">
          <input
            type="text"
            value={contactSearch}
            onChange={(e) => {
              setContactSearch(e.target.value);
              setShowContactDropdown(true);
            }}
            onFocus={() => setShowContactDropdown(true)}
            className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search contacts..."
          />
          <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        </div>

        {/* Contact Dropdown */}
        {showContactDropdown && contacts.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {contacts.map((contact) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => selectContact(contact)}
                className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {`${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
                    </div>
                    {contact.company && (
                      <div className="text-sm text-gray-500">{contact.company}</div>
                    )}
                  </div>
                  {selectedContactId === contact.id && (
                    <CheckCircleIcon className="w-4 h-4 text-blue-600" />
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Boolean Fields */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-gray-700">Call Details</h4>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isProspectingCall}
              onChange={(e) => setIsProspectingCall(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">Prospect Call</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={isPropertyProspectingCall}
              onChange={(e) => setIsPropertyProspectingCall(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">Property Prospect Call</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={completedCall}
              onChange={(e) => setCompletedCall(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">Completed Call</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={completedPropertyCall}
              onChange={(e) => setCompletedPropertyCall(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">Completed Property Call</span>
          </label>

          <label className="flex items-center">
            <input
              type="checkbox"
              checked={meetingHeld}
              onChange={(e) => setMeetingHeld(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
            />
            <span className="ml-2 text-sm text-gray-700">Meeting Held</span>
          </label>
        </div>
      </div>

      {/* Record Metadata */}
      <div className="bg-gray-50 rounded-lg p-4 mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Record Information</h4>
        <div className="space-y-2 text-xs text-gray-600">
          {activity.created_at && (
            <div>
              <span className="font-medium">Created: </span>
              <span>
                {new Date(activity.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                {createdByName && ` by ${createdByName}`}
              </span>
            </div>
          )}
          {activity.updated_at && (
            <div>
              <span className="font-medium">Last Updated: </span>
              <span>
                {new Date(activity.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                {updatedByName && ` by ${updatedByName}`}
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          onClick={handleSave}
          disabled={isLoading}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Updating...
            </>
          ) : (
            <>
              <PhoneIcon className="w-4 h-4" />
              Update Call
            </>
          )}
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
  // Get user names from relations (already fetched in query)
  const createdByName = activity.created_by_user
    ? (activity.created_by_user.name ||
       `${activity.created_by_user.first_name || ''} ${activity.created_by_user.last_name || ''}`.trim() ||
       'Unknown User')
    : null;

  const updatedByName = activity.updated_by_user
    ? (activity.updated_by_user.name ||
       `${activity.updated_by_user.first_name || ''} ${activity.updated_by_user.last_name || ''}`.trim() ||
       'Unknown User')
    : null;

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
              <span className="text-sm font-medium text-gray-700">Due Date</span>
              <p className="text-sm text-gray-600">
                {format(parseISO(activity.activity_date), 'MMM d, yyyy')}
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
              Created: {new Date(activity.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
            </p>
          )}
        </div>
      )}

      {/* Record Metadata */}
      <div className="bg-gray-50 rounded-lg p-4 mt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Record Information</h4>
        <div className="space-y-2 text-xs text-gray-600">
          {activity.created_at && (
            <div>
              <span className="font-medium">Created: </span>
              <span>
                {new Date(activity.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                {createdByName && ` by ${createdByName}`}
              </span>
            </div>
          )}
          {activity.updated_at && (
            <div>
              <span className="font-medium">Last Updated: </span>
              <span>
                {new Date(activity.updated_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
                {updatedByName && ` by ${updatedByName}`}
              </span>
            </div>
          )}
        </div>
      </div>
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
    (activity.activity_date ? new Date(activity.activity_date).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '') ||
    (activity.created_at ? new Date(activity.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) : '');

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
              {new Date(activity.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}
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