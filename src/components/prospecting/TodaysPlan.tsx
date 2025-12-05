import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import LogCallModal from '../LogCallModal';
import FollowUpModal from '../FollowUpModal';
import AddTargetModal from './AddTargetModal';
import {
  PhoneIcon,
  PlusIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckIcon
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

export default function TodaysPlan() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [followUpsDue, setFollowUpsDue] = useState<FollowUpDue[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUpDue[]>([]);
  const [readyTargets, setReadyTargets] = useState<ProspectingTargetView[]>([]);
  const [todayStats, setTodayStats] = useState({ calls: 0, meetings: 0 });

  // Modal states
  const [isLogCallModalOpen, setIsLogCallModalOpen] = useState(false);
  const [isFollowUpModalOpen, setIsFollowUpModalOpen] = useState(false);
  const [isAddTargetModalOpen, setIsAddTargetModalOpen] = useState(false);
  const [selectedContact, setSelectedContact] = useState<{ id: string; name: string; company: string | null } | null>(null);

  useEffect(() => {
    fetchTodaysData();
  }, []);

  const fetchTodaysData = async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayStart = `${today}T00:00:00`;
      const todayEnd = `${today}T23:59:59`;

      // Fetch follow-ups due today
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
        .not('contact_id', 'is', null)
        .order('activity_date', { ascending: true });

      if (!todayError && todayFollowUps) {
        setFollowUpsDue(todayFollowUps as FollowUpDue[]);
      }

      // Fetch overdue follow-ups
      const { data: overdue, error: overdueError } = await supabase
        .from('activity')
        .select(`
          id,
          subject,
          activity_date,
          contact_id,
          contact!fk_activity_contact_id(id, first_name, last_name, company),
          activity_status!fk_activity_status_id(is_closed)
        `)
        .lt('activity_date', todayStart)
        .eq('activity_status.is_closed', false)
        .not('contact_id', 'is', null)
        .order('activity_date', { ascending: true })
        .limit(10);

      if (!overdueError && overdue) {
        setOverdueFollowUps(overdue as FollowUpDue[]);
      }

      // Fetch ready-to-call targets
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
          calls: todayActivities.filter(a => a.completed_call).length,
          meetings: todayActivities.filter(a => a.meeting_held).length
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
    // Get a closed status
    const { data: closedStatus } = await supabase
      .from('activity_status')
      .select('id')
      .eq('is_closed', true)
      .limit(1)
      .single();

    if (closedStatus) {
      await supabase
        .from('activity')
        .update({
          status_id: closedStatus.id,
          completed_at: new Date().toISOString()
        })
        .eq('id', activityId);
      fetchTodaysData();
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
            onClick={fetchTodaysData}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            title="Refresh"
          >
            <ArrowPathIcon className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-3xl font-bold text-blue-600">{followUpsDue.length}</p>
            <p className="text-sm text-gray-600">Follow-ups Due</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-3xl font-bold text-red-600">{overdueFollowUps.length}</p>
            <p className="text-sm text-gray-600">Overdue</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-3xl font-bold text-green-600">{todayStats.calls}</p>
            <p className="text-sm text-gray-600">Calls Made</p>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <p className="text-3xl font-bold text-purple-600">{todayStats.meetings}</p>
            <p className="text-sm text-gray-600">Meetings</p>
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

      {/* Ready to Call Targets */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <MagnifyingGlassIcon className="w-5 h-5 text-green-600" />
            Ready to Call ({readyTargets.length})
          </h3>
          <p className="text-sm text-gray-500 mt-1">Researched targets ready for first contact</p>
        </div>
        <div className="divide-y divide-gray-100">
          {readyTargets.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <p>No targets ready to call. Add targets and have them researched!</p>
            </div>
          ) : (
            readyTargets.map((target) => (
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
            ))
          )}
        </div>
      </div>

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

      {/* Follow-up Modal */}
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
    </div>
  );
}
