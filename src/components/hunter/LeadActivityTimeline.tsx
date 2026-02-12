// Activity timeline showing all outreach activities on a lead
// src/components/hunter/LeadActivityTimeline.tsx

import { useEffect } from 'react';
import { useProspectingActivities } from '../../hooks/useProspectingActivities';
import { ACTIVITY_TYPE_INFO, ProspectingActivityType } from '../../lib/types';
import {
  EnvelopeIcon,
  PhoneIcon,
  ChatBubbleLeftIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';

interface LeadActivityTimelineProps {
  leadId: string;
  maxItems?: number;
}

const ACTIVITY_ICONS: Record<ProspectingActivityType, React.ElementType> = {
  email: EnvelopeIcon,
  linkedin: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ),
  sms: ChatBubbleLeftIcon,
  voicemail: PhoneIcon,
  call: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
      <path d="M14.5 2l5.5 5.5M20 2v6h-6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  meeting: UserGroupIcon
};

const ACTIVITY_COLORS: Record<ProspectingActivityType, string> = {
  email: 'bg-blue-100 text-blue-600',
  linkedin: 'bg-indigo-100 text-indigo-600',
  sms: 'bg-green-100 text-green-600',
  voicemail: 'bg-yellow-100 text-yellow-600',
  call: 'bg-emerald-100 text-emerald-600',
  meeting: 'bg-purple-100 text-purple-600'
};

export default function LeadActivityTimeline({ leadId, maxItems = 10 }: LeadActivityTimelineProps) {
  const { activities, loading, error, loadActivities } = useProspectingActivities();

  useEffect(() => {
    loadActivities(leadId);
  }, [leadId, loadActivities]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const displayedActivities = activities.slice(0, maxItems);

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200">
        <h3 className="text-sm font-medium text-gray-900">Activity Timeline</h3>
      </div>

      {/* Timeline */}
      <div className="p-4">
        {loading && activities.length === 0 ? (
          <div className="text-center text-gray-500 text-sm py-4">
            Loading activities...
          </div>
        ) : error ? (
          <div className="text-center text-red-500 text-sm py-4">
            {error}
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center text-gray-400 text-sm py-4">
            No activities logged yet
          </div>
        ) : (
          <div className="space-y-3">
            {displayedActivities.map((activity, index) => {
              const Icon = ACTIVITY_ICONS[activity.activity_type];
              const info = ACTIVITY_TYPE_INFO[activity.activity_type];
              const colorClass = ACTIVITY_COLORS[activity.activity_type];

              return (
                <div key={activity.id} className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={`p-1.5 rounded-full ${colorClass}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {info.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(activity.created_at)}
                      </span>
                    </div>
                    {activity.email_subject && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        "{activity.email_subject}"
                      </p>
                    )}
                    {activity.notes && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {activity.notes}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}

            {activities.length > maxItems && (
              <div className="text-center pt-2">
                <span className="text-xs text-gray-400">
                  +{activities.length - maxItems} more activities
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
