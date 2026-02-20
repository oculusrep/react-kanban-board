/**
 * ActivityBreakdownRow - Expandable row showing activity details
 *
 * Displays a count with expandable detail showing individual activities
 * with contact name, notes, and date.
 */

import { useState, useEffect } from 'react';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabaseClient';
import { AllProspectingActivityType } from '../../lib/types';

interface ActivityDetail {
  id: string;
  activity_type: string;
  notes: string | null;
  email_subject: string | null;
  created_at: string;
  contact_name: string | null;
  contact_id: string | null;
  company_name: string | null;
}

interface ActivityBreakdownRowProps {
  label: string;
  count: number;
  activityTypes: AllProspectingActivityType[];
  startDate: string;
  endDate: string;
  userId?: string;
  onContactClick?: (contactId: string) => void;
}

export default function ActivityBreakdownRow({
  label,
  count,
  activityTypes,
  startDate,
  endDate,
  userId,
  onContactClick
}: ActivityBreakdownRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activities, setActivities] = useState<ActivityDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch activities when expanded
  useEffect(() => {
    if (isExpanded && !loaded && count > 0) {
      fetchActivities();
    }
  }, [isExpanded, loaded, count]);

  const fetchActivities = async () => {
    setLoading(true);
    try {
      // Query activities with contact info joined
      let query = supabase
        .from('prospecting_activity')
        .select(`
          id,
          activity_type,
          notes,
          email_subject,
          created_at,
          contact_id,
          contact:contact_id (
            first_name,
            last_name,
            company
          )
        `)
        .in('activity_type', activityTypes)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: false })
        .limit(50);

      if (userId) {
        query = query.eq('created_by', userId);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Transform data to include contact name
      const transformed: ActivityDetail[] = (data || []).map((item: any) => ({
        id: item.id,
        activity_type: item.activity_type,
        notes: item.notes,
        email_subject: item.email_subject,
        created_at: item.created_at,
        contact_id: item.contact_id,
        contact_name: item.contact
          ? `${item.contact.first_name || ''} ${item.contact.last_name || ''}`.trim() || 'Unknown'
          : 'Unknown',
        company_name: item.contact?.company || null
      }));

      setActivities(transformed);
      setLoaded(true);
    } catch (err) {
      console.error('Error fetching activity details:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const truncateText = (text: string | null, maxLength: number = 60) => {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const isClickable = count > 0;

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      {/* Main row */}
      <div
        className={`flex justify-between items-center text-sm py-1 ${
          isClickable ? 'cursor-pointer hover:bg-gray-50 -mx-2 px-2 rounded' : ''
        }`}
        onClick={() => isClickable && setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-1">
          {isClickable && (
            isExpanded
              ? <ChevronDownIcon className="w-3 h-3 text-gray-400" />
              : <ChevronRightIcon className="w-3 h-3 text-gray-400" />
          )}
          {!isClickable && <div className="w-3" />}
          <span className="text-gray-600">{label}</span>
        </div>
        <span className={`font-medium ${isClickable ? 'text-blue-600' : 'text-gray-900'}`}>
          {count}
        </span>
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="ml-4 mb-2 mt-1">
          {loading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-gray-500">
              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-500"></div>
              Loading...
            </div>
          ) : activities.length === 0 ? (
            <div className="py-2 text-xs text-gray-500 italic">No activities found</div>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {activities.map((activity) => (
                <div
                  key={activity.id}
                  className={`flex items-start gap-2 py-1.5 px-2 text-xs bg-gray-50 rounded ${
                    activity.contact_id && onContactClick ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activity.contact_id && onContactClick) {
                      onContactClick(activity.contact_id);
                    }
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">
                        {activity.contact_name}
                      </span>
                      {activity.company_name && (
                        <span className="text-gray-400 truncate text-[10px]">
                          @ {activity.company_name}
                        </span>
                      )}
                    </div>
                    {(activity.notes || activity.email_subject) && (
                      <p className="text-gray-500 truncate mt-0.5">
                        {truncateText(activity.email_subject || activity.notes)}
                      </p>
                    )}
                  </div>
                  <span className="text-gray-400 whitespace-nowrap flex-shrink-0">
                    {formatDate(activity.created_at)}
                  </span>
                </div>
              ))}
              {activities.length >= 50 && (
                <div className="text-xs text-gray-400 text-center py-1">
                  Showing first 50 activities
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
