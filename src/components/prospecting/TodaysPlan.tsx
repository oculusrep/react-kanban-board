import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useProspectingMetrics } from '../../hooks/useProspectingMetrics';
import { useProspectingTime } from '../../hooks/useProspectingTime';
import LogCallModal from '../LogCallModal';
import FollowUpModal from '../FollowUpModal';
import AddTargetModal from './AddTargetModal';
import TimeHistoryModal from './TimeHistoryModal';
import {
  PhoneIcon,
  PlusIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon,
  FireIcon,
  SparklesIcon,
  ChevronRightIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  UserGroupIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import {
  ProspectingTargetView,
  PROSPECTING_STATUS_CONFIG,
  PRIORITY_CONFIG
} from '../../types/prospecting';

interface FollowUpDue {
  id: string;
  subject: string;
  activity_date: string;
  contact_id: string;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
  } | null;
}

interface NewHunterLead {
  id: string;
  concept_name: string;
  industry_segment: string | null;
  signal_strength: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
  score_reasoning: string | null;
  target_geography: string[] | null;
  first_seen_at: string;
  source: string;
}

const SIGNAL_COLORS = {
  'HOT': 'bg-red-100 text-red-800 border-red-200',
  'WARM+': 'bg-orange-100 text-orange-800 border-orange-200',
  'WARM': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'COOL': 'bg-blue-100 text-blue-800 border-blue-200'
};

export default function TodaysPlan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: metricsData, loadDashboardData: loadMetrics } = useProspectingMetrics();
  const { stats: timeStats, saveTimeEntry, loadTimeData } = useProspectingTime();
  const [loading, setLoading] = useState(true);
  const [followUpsDue, setFollowUpsDue] = useState<FollowUpDue[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUpDue[]>([]);
  const [readyTargets, setReadyTargets] = useState<ProspectingTargetView[]>([]);
  const [newHunterLeads, setNewHunterLeads] = useState<NewHunterLead[]>([]);
  const [todayStats, setTodayStats] = useState({ calls: 0, meetings: 0, newLeads: 0 });
  const metrics = metricsData.metrics;

  // Time tracking state
  const [hours, setHours] = useState(0);
  const [minutes, setMinutes] = useState(0);
  const [isSavingTime, setIsSavingTime] = useState(false);
  const [isTimeHistoryOpen, setIsTimeHistoryOpen] = useState(false);

  // Modal states
  const [isLogCallModalOpen, setIsLogCallModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isAddTargetModalOpen, setIsAddTargetModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; company: string | null } | null>(null);

  useEffect(() => {
    fetchTodaysData();
    loadMetrics();
    loadTimeData();
  }, []);

  // Sync time fields with loaded data
  useEffect(() => {
    setHours(Math.floor(timeStats.todayMinutes / 60));
    setMinutes(timeStats.todayMinutes % 60);
  }, [timeStats.todayMinutes]);

  const handleSaveTime = async () => {
    setIsSavingTime(true);
    const totalMinutes = hours * 60 + minutes;
    const today = new Date();
    const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    await saveTimeEntry(dateStr, totalMinutes);
    setIsSavingTime(false);
  };

  const fetchTodaysData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayStart = `${today}T00:00:00`;
      const todayEnd = `${today}T23:59:59`;

      // Calculate 30 days ago for overdue limit
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const thirtyDaysAgoStr = thirtyDaysAgo.toISOString();

      // Fetch follow-ups due today (prospecting tasks only)
      const { data: todayFollowUps, error: todayError } = await supabase
        .from('activity')
        .select(`
          id,
          subject,
          activity_date,
          contact_id,
          contact!fk_activity_contact_id(id, first_name, last_name, company)
        `)
        .gte('activity_date', todayStart)
        .lte('activity_date', todayEnd)
        .eq('activity_status.is_closed', false)
        .eq('is_prospecting', true)
        .not('contact_id', 'is', null)
        .order('activity_date', { ascending: true });

      if (!todayError && todayFollowUps) {
        setFollowUpsDue(todayFollowUps as FollowUpDue[]);
      }

      // Fetch overdue follow-ups - get open statuses first
      const { data: openStatuses } = await supabase
        .from('activity_status')
        .select('id')
        .eq('is_closed', false);

      const openStatusIds = openStatuses?.map(s => s.id) || [];

      if (openStatusIds.length > 0) {
        // Fetch overdue prospecting follow-ups (last 30 days only)
        const { data: overdue, error: overdueError } = await supabase
          .from('activity')
          .select(`
            id,
            subject,
            activity_date,
            contact_id,
            contact!fk_activity_contact_id(id, first_name, last_name, company)
          `)
          .lt('activity_date', todayStart)
          .gte('activity_date', thirtyDaysAgoStr)
          .in('status_id', openStatusIds)
          .eq('is_prospecting', true)
          .not('contact_id', 'is', null)
          .order('activity_date', { ascending: false });

        if (!overdueError && overdue) {
          setOverdueFollowUps(overdue as FollowUpDue[]);
        }
      } else {
        setOverdueFollowUps([]);
      }

      // Fetch new Hunter leads (targets with status 'new')
      const { data: hunterLeads, error: hunterError } = await supabase
        .from('target')
        .select('id, concept_name, industry_segment, signal_strength, score_reasoning, target_geography, first_seen_at, source')
        .eq('status', 'new')
        .order('signal_strength', { ascending: true }) // HOT first
        .order('first_seen_at', { ascending: false })
        .limit(15);

      if (!hunterError && hunterLeads) {
        setNewHunterLeads(hunterLeads as NewHunterLead[]);
      }

      // Fetch ready-to-call targets (from prospecting_target view if it exists)
      const { data: targets, error: targetsError } = await supabase
        .from('v_prospecting_target')
        .select('*')
        .eq('status', 'ready')
        .order('priority', { ascending: true })
        .order('created_at', { ascending: true })
        .limit(10);

      if (!targetsError && targets) {
        setReadyTargets(targets as ProspectingTargetView[]);
      }

      // Fetch today's stats
      const { data: todayActivities, error: statsError } = await supabase
        .from('activity')
        .select('is_prospecting_call, completed_call, meeting_held')
        .gte('completed_at', todayStart)
        .lte('completed_at', todayEnd);

      if (!statsError && todayActivities) {
        setTodayStats({
          calls: todayActivities.filter(a => a.is_prospecting_call || a.completed_call || a.meeting_held).length,
          meetings: todayActivities.filter(a => a.meeting_held).length,
          newLeads: hunterLeads?.length || 0
        });
      }
    } catch (err) {
      console.error('Error fetching today\'s data:', err);
    } finally {
      setLoading(false);
    }
  };

  const getContactName = (contact: FollowUpDue['contact']) => {
    if (!contact) return 'Unknown';
    const first = contact.first_name || '';
    const last = contact.last_name || '';
    return `${first} ${last}`.trim() || 'Unknown';
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDaysOverdue = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffTime = today.getTime() - date.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const handleLogCall = (contact: { id: string; name: string; company: string | null }) => {
    setSelectedContact(contact);
    setIsLogCallModalOpen(true);
  };

  const handleScheduleFollowUp = (contact: { id: string; name: string; company: string | null }) => {
    setSelectedContact(contact);
    setIsFollowUpModalOpen(true);
  };

  const markTargetAsCalling = async (targetId: string) => {
    await supabase
      .from('prospecting_target')
      .update({ status: 'calling' })
      .eq('id', targetId);
    fetchTodaysData();
  };

  // Dismiss an overdue activity (mark as closed without completing)
  const dismissActivity = async (activityId: string) => {
    try {
      // Get a closed status
      const { data: closedStatus, error: statusError } = await supabase
        .from('activity_status')
        .select('id')
        .eq('is_closed', true)
        .limit(1)
        .single();

      if (statusError) {
        console.error('Error getting closed status:', statusError);
        return;
      }

      if (closedStatus) {
        const { error: updateError } = await supabase
          .from('activity')
          .update({
            status_id: closedStatus.id,
            completed_at: new Date().toISOString()
          })
          .eq('id', activityId);

        if (updateError) {
          console.error('Error updating activity:', updateError);
          return;
        }

        console.log('✅ Activity dismissed:', activityId);
        fetchTodaysData();
      }
    } catch (err) {
      console.error('Error dismissing activity:', err);
    }
  };

  // Complete an activity
  const completeActivity = async (activityId: string) => {
    // Get a completed/closed status
    const { data: completedStatus } = await supabase
      .from('activity_status')
      .select('id')
      .or('name.eq.Completed,name.eq.Closed')
      .limit(1)
      .single();

    if (completedStatus) {
      await supabase
        .from('activity')
        .update({
          status_id: completedStatus.id,
          completed_at: new Date().toISOString()
        })
        .eq('id', activityId);
      fetchTodaysData();
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-32 bg-gray-200 rounded-lg"></div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Today's Stats */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Today's Progress</h2>
          <button
            onClick={() => { fetchTodaysData(); loadMetrics(); loadTimeData(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Time Logging Row */}
        <div className="flex items-center gap-4 mb-4 pb-4 border-b border-gray-100">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <ClockIcon className="w-4 h-4" />
            <span className="font-medium">Time Logged:</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="0"
              max="12"
              value={hours}
              onChange={(e) => setHours(Math.max(0, Math.min(12, parseInt(e.target.value) || 0)))}
              className="w-14 px-2 py-1 text-center border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <span className="text-sm text-gray-500">hrs</span>
            <input
              type="number"
              min="0"
              max="59"
              step="5"
              value={minutes}
              onChange={(e) => setMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
              className="w-14 px-2 py-1 text-center border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
            />
            <span className="text-sm text-gray-500">min</span>
          </div>
          <button
            onClick={handleSaveTime}
            disabled={isSavingTime}
            className="px-3 py-1 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {isSavingTime ? 'Saving...' : 'Save'}
          </button>
          <button
            onClick={() => setIsTimeHistoryOpen(true)}
            className="flex items-center gap-1 px-3 py-1 text-sm font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            <CalendarDaysIcon className="w-4 h-4" />
            History
          </button>
          {timeStats.streak > 0 && (
            <span className="text-sm text-orange-600 font-medium flex items-center gap-1">
              <FireIcon className="w-4 h-4" />
              {timeStats.streak} day streak
            </span>
          )}
        </div>

        <div className="grid grid-cols-5 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{followUpsDue.length}</p>
            <p className="text-sm text-gray-600">Follow-ups Due</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-3xl font-bold text-red-600">{overdueFollowUps.length}</p>
            <p className="text-sm text-gray-600">Overdue</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-3xl font-bold text-orange-600">{newHunterLeads.length}</p>
            <p className="text-sm text-gray-600">New Leads</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-600">{todayStats.calls}</p>
            <p className="text-sm text-gray-600">Call Connects</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-3xl font-bold text-purple-600">{todayStats.meetings}</p>
            <p className="text-sm text-gray-600">Meetings</p>
          </div>
        </div>
      </div>

      {/* Outreach This Week */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Outreach This Week</h2>
        <div className="grid grid-cols-7 gap-3">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <EnvelopeIcon className="w-4 h-4 text-blue-600" />
            </div>
            <p className="text-xl font-bold text-blue-600">{metrics?.emails_sent || 0}</p>
            <p className="text-xs text-gray-500">Emails</p>
          </div>
          <div className="text-center p-3 bg-indigo-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <svg className="w-4 h-4 text-indigo-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
              </svg>
            </div>
            <p className="text-xl font-bold text-indigo-600">{metrics?.linkedin_messages || 0}</p>
            <p className="text-xs text-gray-500">LinkedIn</p>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <ChatBubbleLeftIcon className="w-4 h-4 text-green-600" />
            </div>
            <p className="text-xl font-bold text-green-600">{metrics?.sms_sent || 0}</p>
            <p className="text-xs text-gray-500">SMS</p>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <PhoneIcon className="w-4 h-4 text-yellow-600" />
            </div>
            <p className="text-xl font-bold text-yellow-600">{metrics?.voicemails_left || 0}</p>
            <p className="text-xs text-gray-500">Voicemails</p>
          </div>
          <div className="text-center p-3 bg-emerald-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <PhoneIcon className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold text-emerald-600">{metrics?.calls_completed || 0}</p>
            <p className="text-xs text-gray-500">Call Connects</p>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <UserGroupIcon className="w-4 h-4 text-purple-600" />
            </div>
            <p className="text-xl font-bold text-purple-600">{metrics?.meetings_held || 0}</p>
            <p className="text-xs text-gray-500">Meetings</p>
          </div>
          <div className="text-center p-3 bg-gray-100 rounded-lg">
            <div className="flex items-center justify-center gap-1 mb-1">
              <FireIcon className="w-4 h-4 text-gray-700" />
            </div>
            <p className="text-xl font-bold text-gray-700">{metrics?.total_touches || 0}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
        </div>
      </div>

      {/* Quick Add Target */}
      <div className="bg-white rounded-lg shadow p-4">
        <button
          onClick={() => setIsAddTargetModalOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          Add New Target Company
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Follow-ups Due Today */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDaysIcon className="w-5 h-5 text-blue-600" />
              Follow-ups Due Today ({followUpsDue.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {followUpsDue.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <CheckCircleIcon className="w-12 h-12 mx-auto text-green-400 mb-2" />
                <p>No follow-ups due today!</p>
              </div>
            ) : (
              followUpsDue.map((followUp) => (
                <div key={followUp.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => followUp.contact && navigate(`/contact/${followUp.contact.id}`)}
                        className="font-medium text-blue-600 hover:text-blue-800 truncate block"
                      >
                        {getContactName(followUp.contact)}
                      </button>
                      <p className="text-sm text-gray-500 truncate">
                        {followUp.contact?.company || 'No company'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{followUp.subject}</p>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => followUp.contact && handleLogCall({
                          id: followUp.contact.id,
                          name: getContactName(followUp.contact),
                          company: followUp.contact.company
                        })}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Log Call"
                      >
                        <PhoneIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => followUp.contact && handleScheduleFollowUp({
                          id: followUp.contact.id,
                          name: getContactName(followUp.contact),
                          company: followUp.contact.company
                        })}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Reschedule"
                      >
                        <CalendarDaysIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Overdue Follow-ups */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
              Overdue ({overdueFollowUps.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
            {overdueFollowUps.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <CheckCircleIcon className="w-12 h-12 mx-auto text-green-400 mb-2" />
                <p>No overdue follow-ups!</p>
              </div>
            ) : (
              overdueFollowUps.map((followUp) => (
                <div key={followUp.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => followUp.contact && navigate(`/contact/${followUp.contact.id}`)}
                          className="font-medium text-blue-600 hover:text-blue-800 truncate"
                        >
                          {getContactName(followUp.contact)}
                        </button>
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                          {getDaysOverdue(followUp.activity_date)}d overdue
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {followUp.contact?.company || 'No company'}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 ml-4">
                      <button
                        onClick={() => followUp.contact && handleLogCall({
                          id: followUp.contact.id,
                          name: getContactName(followUp.contact),
                          company: followUp.contact.company
                        })}
                        className="p-2 text-green-600 hover:bg-green-50 rounded-lg"
                        title="Log Call"
                      >
                        <PhoneIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => followUp.contact && handleScheduleFollowUp({
                          id: followUp.contact.id,
                          name: getContactName(followUp.contact),
                          company: followUp.contact.company
                        })}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                        title="Reschedule"
                      >
                        <CalendarDaysIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => completeActivity(followUp.id)}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg"
                        title="Mark Complete"
                      >
                        <CheckIcon className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => dismissActivity(followUp.id)}
                        className="p-2 text-gray-400 hover:bg-gray-100 rounded-lg"
                        title="Dismiss"
                      >
                        <XMarkIcon className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* New Hunter Leads - AI-discovered targets */}
      {newHunterLeads.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <SparklesIcon className="w-5 h-5 text-orange-600" />
              New Leads from Hunter ({newHunterLeads.length})
            </h3>
            <p className="text-sm text-gray-500 mt-1">AI-discovered targets awaiting review</p>
          </div>
          <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
            {newHunterLeads.map((lead) => (
              <div
                key={lead.id}
                onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                className="p-4 hover:bg-gray-50 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{lead.concept_name}</span>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[lead.signal_strength]}`}>
                        {lead.signal_strength}
                      </span>
                      {lead.industry_segment && (
                        <span className="text-xs text-purple-600">{lead.industry_segment}</span>
                      )}
                    </div>
                    {lead.score_reasoning && (
                      <p className="text-sm text-gray-500 truncate mt-1">{lead.score_reasoning}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      {lead.target_geography && lead.target_geography.length > 0 && (
                        <span className="text-xs text-gray-400">
                          {lead.target_geography.slice(0, 2).join(', ')}
                          {lead.target_geography.length > 2 && ` +${lead.target_geography.length - 2}`}
                        </span>
                      )}
                      <span className="text-xs text-gray-400">
                        Discovered {new Date(lead.first_seen_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ready to Call Targets */}
      {readyTargets.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <PhoneIcon className="w-5 h-5 text-green-600" />
              Ready to Call ({readyTargets.length})
            </h3>
            <p className="text-sm text-gray-500 mt-1">Researched targets ready for first contact</p>
          </div>
          <div className="divide-y divide-gray-100">
            {readyTargets.map((target) => (
              <div key={target.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{target.company_name}</span>
                      <span className={`text-xs font-medium ${PRIORITY_CONFIG[target.priority]?.color || 'text-gray-500'}`}>
                        {PRIORITY_CONFIG[target.priority]?.label || 'Medium'}
                      </span>
                      {target.contacts_found > 0 && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                          {target.contacts_found} contact{target.contacts_found !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    {target.research_notes && (
                      <p className="text-sm text-gray-500 truncate mt-1">{target.research_notes}</p>
                    )}
                    {target.source && (
                      <p className="text-xs text-gray-400">Source: {target.source}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => markTargetAsCalling(target.id)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                    >
                      Start Calling
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Log Call Modal */}
      <LogCallModal
        isOpen={isLogCallModalOpen}
        onClose={() => {
          setIsLogCallModalOpen(false);
          setSelectedContact(null);
        }}
        onCallLogged={() => {
          setIsLogCallModalOpen(false);
          setSelectedContact(null);
          fetchTodaysData();
        }}
        parentObject={selectedContact ? {
          id: selectedContact.id,
          type: 'contact',
          name: selectedContact.name
        } : undefined}
      />

      {/* Follow-up Modal - auto-mark as prospecting since we're in the prospecting module */}
      <FollowUpModal
        isOpen={isFollowUpModalOpen}
        onClose={() => {
          setIsFollowUpModalOpen(false);
          setSelectedContact(null);
        }}
        onFollowUpCreated={() => {
          setIsFollowUpModalOpen(false);
          setSelectedContact(null);
          fetchTodaysData();
        }}
        contactId={selectedContact?.id || ''}
        contactName={selectedContact?.name || ''}
        contactCompany={selectedContact?.company || undefined}
        isProspecting={true}
      />

      {/* Add Target Modal */}
      <AddTargetModal
        isOpen={isAddTargetModalOpen}
        onClose={() => setIsAddTargetModalOpen(false)}
        onTargetAdded={() => {
          setIsAddTargetModalOpen(false);
          fetchTodaysData();
        }}
      />

      {/* Time History Modal */}
      <TimeHistoryModal
        isOpen={isTimeHistoryOpen}
        onClose={() => setIsTimeHistoryOpen(false)}
        onRefresh={loadTimeData}
      />
    </div>
  );
}
