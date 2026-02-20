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
      let transformed: ActivityDetail[] = [];

      // The v_prospecting_daily_metrics view pulls from TWO sources:
      // 1. prospecting_activity table - for email, linkedin, sms, voicemail, and response types
      // 2. activity table - for calls (completed_call=true) and meetings (by activity_type name)
      //
      // To match the view's counts, we need to query the same way it does.
      const isCallOrMeeting = activityTypes.includes('call') || activityTypes.includes('meeting');

      if (isCallOrMeeting) {
        // Query the activity table for calls/meetings
        // The view uses: JOIN activity_type ON a.activity_type_id = atype.id
        // And filters: WHERE atype.name = 'Call' AND a.completed_call = true (for calls)
        // Or: WHERE atype.name = 'Meeting' (for meetings)
        let query = supabase
          .from('activity')
          .select(`
            id,
            subject,
            description,
            created_at,
            activity_date,
            contact_id,
            completed_call,
            meeting_held,
            user_id,
            owner_id,
            activity_type:activity_type_id (
              id,
              name
            ),
            contact:contact!fk_activity_contact_id (
              first_name,
              last_name,
              company
            )
          `)
          .gte('activity_date', startDate)
          .lte('activity_date', endDate)
          .order('activity_date', { ascending: false })
          .limit(50);

        if (userId) {
          // View uses COALESCE(a.user_id, a.owner_id)
          query = query.or(`user_id.eq.${userId},owner_id.eq.${userId}`);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Activity query error:', error);
          throw error;
        }

        // Filter in JavaScript to match the view's logic exactly
        const filtered = (data || []).filter((item: any) => {
          const typeName = item.activity_type?.name;

          if (activityTypes.includes('call') && typeName === 'Call' && item.completed_call === true) {
            return true;
          }
          if (activityTypes.includes('meeting') && typeName === 'Meeting') {
            return true;
          }
          return false;
        });

        transformed = filtered.map((item: any) => {
          let contactName = 'Unknown';
          let companyName = null;

          if (item.contact) {
            contactName = `${item.contact.first_name || ''} ${item.contact.last_name || ''}`.trim() || 'Unknown';
            companyName = item.contact.company;
          }

          const typeName = item.activity_type?.name;
          return {
            id: item.id,
            activity_type: typeName === 'Call' ? 'call' : 'meeting',
            notes: item.description,
            email_subject: item.subject,
            created_at: item.activity_date || item.created_at,
            contact_id: item.contact_id,
            contact_name: contactName,
            company_name: companyName
          };
        });
      } else {
        // Query prospecting_activity for other outreach types
        // The view uses: COALESCE(pa.activity_date, DATE(pa.created_at AT TIME ZONE 'America/New_York'))
        // We'll use activity_date if available, otherwise created_at
        let query = supabase
          .from('prospecting_activity')
          .select(`
            id,
            activity_type,
            notes,
            email_subject,
            created_at,
            activity_date,
            contact_id,
            target_id,
            contact:contact_id (
              first_name,
              last_name,
              company
            )
          `)
          .in('activity_type', activityTypes)
          .order('created_at', { ascending: false })
          .limit(100); // Fetch more to filter by date in JS

        if (userId) {
          query = query.eq('created_by', userId);
        }

        const { data, error } = await query;

        if (error) {
          console.error('Prospecting activity query error:', error);
          throw error;
        }

        // Filter by date range using the same logic as the view
        // The view uses: COALESCE(pa.activity_date, DATE(pa.created_at AT TIME ZONE 'America/New_York'))
        const filtered = (data || []).filter((item: any) => {
          // Use activity_date if available, otherwise extract date from created_at
          let activityDate: string;
          if (item.activity_date) {
            activityDate = item.activity_date;
          } else {
            // Convert created_at to date string (the DB does Eastern timezone, we'll do local)
            const date = new Date(item.created_at);
            activityDate = date.toISOString().split('T')[0];
          }
          return activityDate >= startDate && activityDate <= endDate;
        }).slice(0, 50); // Limit to 50 after filtering

        transformed = filtered.map((item: any) => {
          let contactName = 'Unknown';
          let companyName = null;

          if (item.contact) {
            contactName = `${item.contact.first_name || ''} ${item.contact.last_name || ''}`.trim() || 'Unknown';
            companyName = item.contact.company;
          }

          return {
            id: item.id,
            activity_type: item.activity_type,
            notes: item.notes,
            email_subject: item.email_subject,
            created_at: item.activity_date || item.created_at,
            contact_id: item.contact_id,
            contact_name: contactName,
            company_name: companyName
          };
        });
      }

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
