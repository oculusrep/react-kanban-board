import React, { useState } from 'react';
import { useGenericActivities } from '../hooks/useGenericActivities';
import { ActivityTabConfig, ParentObject } from '../types/activity';
import ActivityItem from './ActivityItem';
import AddTaskModal from './AddTaskModal';
import LogCallModal from './LogCallModal';
import { 
  CalendarIcon,
  FunnelIcon,
  PlusIcon,
  MagnifyingGlassIcon,
  PhoneIcon
} from '@heroicons/react/24/outline';

interface GenericActivityTabProps {
  config: ActivityTabConfig;
}

interface SectionProps {
  title: string;
  help?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, help, children }) => {
  return (
    <section className="bg-white rounded-md border p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
        {help && (
          <span
            className="text-gray-500 text-xs border rounded-full w-4 h-4 inline-flex items-center justify-center"
            title={help}
            aria-label={help}
          >
            i
          </span>
        )}
      </div>
      {children}
    </section>
  );
};

const GenericActivityTab: React.FC<GenericActivityTabProps> = ({ config }) => {
  const { parentObject, title = 'Activities', showSummary = true, allowAdd = true } = config;
  const { activities, loading, error, refetch } = useGenericActivities(parentObject);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [isAddTaskModalOpen, setIsAddTaskModalOpen] = useState(false);
  const [isLogCallModalOpen, setIsLogCallModalOpen] = useState(false);

  // Filter activities based on search and filters
  const filteredActivities = activities.filter(activity => {
    // Search filter
    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      const matchesSubject = activity.subject?.toLowerCase().includes(searchLower);
      const matchesDescription = activity.description?.toLowerCase().includes(searchLower);
      const matchesContact = activity.contact && 
        (`${activity.contact.first_name} ${activity.contact.last_name}`.toLowerCase().includes(searchLower));
      
      if (!matchesSubject && !matchesDescription && !matchesContact) {
        return false;
      }
    }

    // Type filter
    if (filterType !== 'all' && activity.activity_type?.name !== filterType) {
      return false;
    }

    // Status filter
    if (filterStatus !== 'all') {
      const isCompleted = activity.activity_status?.is_closed || 
                         activity.sf_is_closed || 
                         activity.completed_call ||
                         (activity.sf_status && ['Completed', 'Complete', 'Closed'].includes(activity.sf_status));
      
      if (filterStatus === 'completed' && !isCompleted) {
        return false;
      }
      if (filterStatus === 'open' && !isCompleted) {
        return false;
      }
    }

    return true;
  });

  // Get unique activity types for filter dropdown
  const activityTypes = [...new Set(activities.map(a => a.activity_type?.name).filter(Boolean))];

  if (error) {
    return (
      <Section title={title}>
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex">
            <div className="ml-3">
              <h3 className="text-sm font-medium text-red-800">Error Loading Activities</h3>
              <div className="mt-2 text-sm text-red-700">
                <p>{error}</p>
              </div>
              <div className="mt-4">
                <button
                  onClick={refetch}
                  className="bg-red-100 px-3 py-2 rounded text-sm font-medium text-red-800 hover:bg-red-200"
                >
                  Try Again
                </button>
              </div>
            </div>
          </div>
        </div>
      </Section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Activity Summary Section */}
      {showSummary && (
        <Section 
          title="Activity Summary"
          help={`Overview of all activities related to this ${parentObject.type}`}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center">
                <CalendarIcon className="w-8 h-8 text-blue-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-600">Total Activities</p>
                  <p className="text-2xl font-semibold text-blue-900">{activities.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-green-50 rounded-lg p-4">
              <div className="flex items-center">
                <CalendarIcon className="w-8 h-8 text-green-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-green-600">Completed</p>
                  <p className="text-2xl font-semibold text-green-900">
                    {activities.filter(a => 
                      a.activity_status?.is_closed || 
                      a.sf_is_closed || 
                      a.completed_call ||
                      (a.sf_status && ['Completed', 'Complete', 'Closed'].includes(a.sf_status))
                    ).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center">
                <CalendarIcon className="w-8 h-8 text-orange-600" />
                <div className="ml-3">
                  <p className="text-sm font-medium text-orange-600">Open</p>
                  <p className="text-2xl font-semibold text-orange-900">
                    {activities.filter(a => 
                      !(a.activity_status?.is_closed || 
                        a.sf_is_closed || 
                        a.completed_call ||
                        (a.sf_status && ['Completed', 'Complete', 'Closed'].includes(a.sf_status)))
                    ).length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          {allowAdd && (
            <div className="flex gap-2">
              <button
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={() => setIsAddTaskModalOpen(true)}
              >
                <PlusIcon className="w-4 h-4" />
                Add Activity
              </button>
              <button
                className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                onClick={() => setIsLogCallModalOpen(true)}
              >
                <PhoneIcon className="w-4 h-4" />
                Log Call
              </button>
              <button
                className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                onClick={refetch}
              >
                <CalendarIcon className="w-4 h-4" />
                Refresh
              </button>
            </div>
          )}
        </Section>
      )}

      {/* Activity List Section */}
      <Section 
        title={`Activity Timeline (${filteredActivities.length})`}
        help={`Chronological list of all activities for this ${parentObject.type}`}
      >
        {/* Filters and Search */}
        <div className="mb-4 space-y-3">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search activities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>

          {/* Filters */}
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <FunnelIcon className="w-4 h-4 text-gray-400" />
              <label className="text-sm font-medium text-gray-700">Type:</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="border border-gray-300 rounded text-sm px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Types</option>
                {activityTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Status:</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border border-gray-300 rounded text-sm px-2 py-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Status</option>
                <option value="open">Open</option>
                <option value="completed">Completed</option>
              </select>
            </div>
          </div>
        </div>

        {/* Activity List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-sm text-gray-600">Loading activities...</span>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="text-center py-8">
            {activities.length === 0 ? (
              <div>
                <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900">No activities</h3>
                <p className="mt-1 text-sm text-gray-500">
                  No activities have been recorded for this {parentObject.type} yet.
                </p>
                {allowAdd && (
                  <div className="mt-6">
                    <button
                      className="inline-flex items-center gap-2 px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                      onClick={() => setIsAddTaskModalOpen(true)}
                    >
                      <PlusIcon className="w-4 h-4" />
                      Add First Activity
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-500">
                  No activities match your current filters.
                </p>
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setFilterType('all');
                    setFilterStatus('all');
                  }}
                  className="mt-2 text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-0">
            {filteredActivities.map((activity) => (
              <ActivityItem 
                key={activity.id} 
                activity={activity} 
                onActivityUpdate={(updatedActivity) => {
                  console.log('Activity updated:', updatedActivity);
                  refetch();
                }}
              />
            ))}
          </div>
        )}
      </Section>

      {/* Add Task Modal */}
      {allowAdd && (
        <AddTaskModal
          isOpen={isAddTaskModalOpen}
          onClose={() => setIsAddTaskModalOpen(false)}
          onSave={(newActivity) => {
            console.log('New activity created:', newActivity);
            refetch();
            setIsAddTaskModalOpen(false);
          }}
          parentObject={parentObject}
        />
      )}

      {/* Log Call Modal */}
      {allowAdd && (
        <LogCallModal
          isOpen={isLogCallModalOpen}
          onClose={() => setIsLogCallModalOpen(false)}
          onCallLogged={() => {
            console.log('Call logged successfully');
            refetch();
            setIsLogCallModalOpen(false);
          }}
          parentObject={parentObject}
        />
      )}
    </div>
  );
};

export default GenericActivityTab;