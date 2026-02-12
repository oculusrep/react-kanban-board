// Prospecting Workspace - Full prospecting command center
// Shows follow-ups due with contact details panel for quick action
// src/components/hunter/ProspectingWorkspace.tsx

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { prepareInsert } from '../../lib/supabaseHelpers';
import FollowUpModal from '../FollowUpModal';
import {
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  UserGroupIcon,
  PencilIcon,
  ChevronRightIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  GlobeAltIcon,
  MapPinIcon,
  PaperAirplaneIcon
} from '@heroicons/react/24/outline';

// Compose Email Modal for direct Gmail sending
interface ComposeEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSent: () => void;
  contact: ContactDetails;
  userEmail: string;
}

function ComposeEmailModal({ isOpen, onClose, onSent, contact, userEmail }: ComposeEmailModalProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);

  // Reset form when contact changes
  useEffect(() => {
    if (isOpen && contact) {
      const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim();
      setSubject(`Following up - ${contact.company || contactName}`);
      setBody(`Hi ${contact.first_name || 'there'},\n\n\n\nBest regards`);
    }
  }, [isOpen, contact]);

  const sendEmail = async () => {
    if (!contact.email) {
      alert('Contact has no email address');
      return;
    }

    setSending(true);
    try {
      // Create a temporary outreach record for tracking
      const { data: outreach, error: outreachError } = await supabase
        .from('hunter_outreach_draft')
        .insert({
          target_id: contact.target_id,
          outreach_type: 'email',
          contact_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          contact_email: contact.email,
          subject: subject,
          body: body,
          status: 'approved',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (outreachError) throw outreachError;

      // Send via Gmail
      const response = await supabase.functions.invoke('hunter-send-outreach', {
        body: {
          outreach_id: outreach.id,
          user_email: userEmail,
          to: [contact.email],
          subject: subject,
          body_html: body.replace(/\n/g, '<br>'),
          body_text: body
        }
      });

      if (response.error) {
        throw new Error(response.error.message);
      }

      // Log the email activity in prospecting_activity
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('prospecting_activity').insert({
          contact_id: contact.id,
          target_id: contact.target_id,
          activity_type: 'email',
          notes: `Sent email via Gmail: "${subject}"`,
          created_by: user.id
        });

        // Update last_contacted_at on target if linked
        if (contact.target_id) {
          await supabase
            .from('target')
            .update({ last_contacted_at: new Date().toISOString() })
            .eq('id', contact.target_id);
        }
      }

      onSent();
      onClose();
    } catch (err) {
      console.error('Error sending email:', err);
      alert(`Failed to send email: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={onClose} />
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">Compose Email</h3>
              <p className="text-sm text-gray-500">
                To: {contact.first_name} {contact.last_name} ({contact.email})
              </p>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <div className="p-4 flex-1 overflow-y-auto space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
              <input
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                placeholder="Email subject"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={12}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm"
                placeholder="Type your message..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              Cancel
            </button>
            <button
              onClick={sendEmail}
              disabled={sending || !subject.trim() || !body.trim()}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Sending...
                </>
              ) : (
                <>
                  <PaperAirplaneIcon className="w-4 h-4" />
                  Send via Gmail
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

interface FollowUpTask {
  id: string;
  subject: string;
  activity_date: string;
  contact_id: string | null;
  target_id: string | null;
  contact: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    company: string | null;
    email: string | null;
    phone: string | null;
    mobile_phone: string | null;
    title: string | null;
    target_id: string | null;
  } | null;
  target: {
    id: string;
    concept_name: string;
    signal_strength: string;
    industry_segment: string | null;
    website: string | null;
  } | null;
}

interface ContactDetails {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  target_id: string | null;
  linkedin_url: string | null;
  address_city: string | null;
  address_state: string | null;
  target?: {
    id: string;
    concept_name: string;
    signal_strength: string;
    industry_segment: string | null;
    website: string | null;
    score_reasoning: string | null;
  } | null;
}

interface NewHunterLead {
  id: string;
  concept_name: string;
  industry_segment: string | null;
  signal_strength: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
  score_reasoning: string | null;
  first_seen_at: string;
}

const SIGNAL_COLORS: Record<string, string> = {
  'HOT': 'bg-red-100 text-red-800 border-red-200',
  'WARM+': 'bg-orange-100 text-orange-800 border-orange-200',
  'WARM': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'COOL': 'bg-blue-100 text-blue-800 border-blue-200'
};

export default function ProspectingWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [followUpsDue, setFollowUpsDue] = useState<FollowUpTask[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUpTask[]>([]);
  const [newHunterLeads, setNewHunterLeads] = useState<NewHunterLead[]>([]);

  // Selected task and contact panel
  const [selectedTask, setSelectedTask] = useState<FollowUpTask | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactDetails | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<Partial<ContactDetails>>({});

  // Activity logging
  const [loggingActivity, setLoggingActivity] = useState<string | null>(null);
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);
  const [showComposeModal, setShowComposeModal] = useState(false);

  // New follow-up scheduling
  const [showNewFollowUpModal, setShowNewFollowUpModal] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<ContactDetails[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedNewContact, setSelectedNewContact] = useState<ContactDetails | null>(null);

  // Stats
  const [stats, setStats] = useState({
    dueToday: 0,
    overdue: 0,
    newLeads: 0,
    completedToday: 0
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayStart = `${today}T00:00:00`;
      const todayEnd = `${today}T23:59:59`;
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get open status IDs
      const { data: openStatuses } = await supabase
        .from('activity_status')
        .select('id')
        .eq('is_closed', false);
      const openStatusIds = openStatuses?.map(s => s.id) || [];

      if (openStatusIds.length > 0) {
        // Fetch follow-ups due today
        const { data: todayTasks } = await supabase
          .from('activity')
          .select(`
            id,
            subject,
            activity_date,
            contact_id,
            target_id,
            contact:contact!fk_activity_contact_id(
              id, first_name, last_name, company, email, phone, mobile_phone, title, target_id
            ),
            target:target(
              id, concept_name, signal_strength, industry_segment, website
            )
          `)
          .gte('activity_date', todayStart)
          .lte('activity_date', todayEnd)
          .in('status_id', openStatusIds)
          .eq('is_prospecting', true)
          .order('activity_date', { ascending: true });

        setFollowUpsDue((todayTasks || []) as FollowUpTask[]);

        // Fetch overdue follow-ups
        const { data: overdueTasks } = await supabase
          .from('activity')
          .select(`
            id,
            subject,
            activity_date,
            contact_id,
            target_id,
            contact:contact!fk_activity_contact_id(
              id, first_name, last_name, company, email, phone, mobile_phone, title, target_id
            ),
            target:target(
              id, concept_name, signal_strength, industry_segment, website
            )
          `)
          .lt('activity_date', todayStart)
          .gte('activity_date', thirtyDaysAgo.toISOString())
          .in('status_id', openStatusIds)
          .eq('is_prospecting', true)
          .order('activity_date', { ascending: false });

        setOverdueFollowUps((overdueTasks || []) as FollowUpTask[]);
      }

      // Fetch new Hunter leads
      const { data: newLeads } = await supabase
        .from('target')
        .select('id, concept_name, industry_segment, signal_strength, score_reasoning, first_seen_at')
        .eq('status', 'new')
        .order('signal_strength', { ascending: true })
        .order('first_seen_at', { ascending: false })
        .limit(10);

      setNewHunterLeads((newLeads || []) as NewHunterLead[]);

      // Update stats
      setStats({
        dueToday: followUpsDue.length,
        overdue: overdueFollowUps.length,
        newLeads: newLeads?.length || 0,
        completedToday: 0 // TODO: count completed today
      });
    } catch (err) {
      console.error('Error fetching prospecting data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load contact details when task is selected
  const loadContactDetails = async (contactId: string) => {
    const { data } = await supabase
      .from('contact')
      .select(`
        id, first_name, last_name, company, email, phone, mobile_phone, title,
        target_id, linkedin_url, address_city, address_state,
        target:target(id, concept_name, signal_strength, industry_segment, website, score_reasoning)
      `)
      .eq('id', contactId)
      .single();

    if (data) {
      setSelectedContact(data as ContactDetails);
      setContactForm(data);
    }
  };

  const handleTaskSelect = (task: FollowUpTask) => {
    setSelectedTask(task);
    setEditingContact(false);
    if (task.contact_id) {
      loadContactDetails(task.contact_id);
    } else {
      setSelectedContact(null);
    }
  };

  const saveContactChanges = async () => {
    if (!selectedContact) return;

    try {
      const { error } = await supabase
        .from('contact')
        .update({
          first_name: contactForm.first_name,
          last_name: contactForm.last_name,
          company: contactForm.company,
          email: contactForm.email,
          phone: contactForm.phone,
          mobile_phone: contactForm.mobile_phone,
          title: contactForm.title,
          linkedin_url: contactForm.linkedin_url,
          updated_at: new Date().toISOString()
        })
        .eq('id', selectedContact.id);

      if (error) throw error;

      setSelectedContact({ ...selectedContact, ...contactForm });
      setEditingContact(false);
    } catch (err) {
      console.error('Error saving contact:', err);
      alert('Failed to save contact changes');
    }
  };

  const logActivity = async (activityType: string) => {
    if (!selectedContact || !user) return;

    setLoggingActivity(activityType);
    try {
      // Log to prospecting_activity table
      const { error } = await supabase
        .from('prospecting_activity')
        .insert({
          contact_id: selectedContact.id,
          target_id: selectedContact.target_id,
          activity_type: activityType,
          created_by: user.id
        });

      if (error) throw error;

      // Also update last_contacted_at on target if linked
      if (selectedContact.target_id) {
        await supabase
          .from('target')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', selectedContact.target_id);
      }

      // Show follow-up modal
      setShowFollowUpModal(true);
    } catch (err) {
      console.error('Error logging activity:', err);
      alert('Failed to log activity');
    } finally {
      setLoggingActivity(null);
    }
  };

  const completeTask = async (taskId: string) => {
    try {
      const { data: completedStatus } = await supabase
        .from('activity_status')
        .select('id')
        .eq('is_closed', true)
        .limit(1)
        .single();

      if (completedStatus) {
        await supabase
          .from('activity')
          .update({
            status_id: completedStatus.id,
            completed_at: new Date().toISOString()
          })
          .eq('id', taskId);

        fetchData();
        if (selectedTask?.id === taskId) {
          setSelectedTask(null);
          setSelectedContact(null);
        }
      }
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  const dismissTask = async (taskId: string) => {
    await completeTask(taskId);
  };

  const getContactName = (contact: FollowUpTask['contact']) => {
    if (!contact) return 'Unknown';
    return `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown';
  };

  const getDaysOverdue = (dateString: string) => {
    const date = new Date(dateString);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  };

  // Search contacts for new follow-up
  const searchContacts = useCallback(async (query: string) => {
    console.log('🔍 searchContacts called with:', query);
    if (query.length < 2) {
      setContactSearchResults([]);
      return;
    }

    setSearchingContacts(true);
    try {
      const { data, error } = await supabase
        .from('contact')
        .select(`
          id, first_name, last_name, company, email, phone, mobile_phone, title,
          target_id, linkedin_url, address_city, address_state,
          target:target!contact_target_id_fkey(id, concept_name, signal_strength, industry_segment, website, score_reasoning)
        `)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);

      console.log('🔍 Contact search results:', data?.length, error);
      setContactSearchResults((data || []) as ContactDetails[]);
    } catch (err) {
      console.error('Error searching contacts:', err);
    } finally {
      setSearchingContacts(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    console.log('🔍 contactSearch changed:', contactSearch);
    const timer = setTimeout(() => {
      if (contactSearch) {
        searchContacts(contactSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch, searchContacts]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="flex gap-6 h-[calc(100vh-220px)]">
      {/* Left side: Task lists */}
      <div className="flex-1 space-y-6 overflow-y-auto">
        {/* Stats Row */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{followUpsDue.length}</p>
            <p className="text-sm text-gray-500">Due Today</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-red-600">{overdueFollowUps.length}</p>
            <p className="text-sm text-gray-500">Overdue</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center">
            <p className="text-3xl font-bold text-orange-600">{newHunterLeads.length}</p>
            <p className="text-sm text-gray-500">New Leads</p>
          </div>
          <button
            onClick={() => setShowNewFollowUpModal(true)}
            className="bg-orange-600 rounded-lg shadow-sm border border-orange-600 p-4 text-center hover:bg-orange-700 transition-colors text-white"
          >
            <CalendarDaysIcon className="w-8 h-8 mx-auto" />
            <p className="text-sm mt-1">New Follow-up</p>
          </button>
          <button
            onClick={fetchData}
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 text-center hover:bg-gray-50 transition-colors"
          >
            <ArrowPathIcon className="w-8 h-8 text-gray-400 mx-auto" />
            <p className="text-sm text-gray-500 mt-1">Refresh</p>
          </button>
        </div>

        {/* Follow-ups Due Today */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          <div className="px-4 py-3 border-b border-gray-200">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <CalendarDaysIcon className="w-5 h-5 text-blue-600" />
              Due Today ({followUpsDue.length})
            </h3>
          </div>
          <div className="divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {followUpsDue.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                <CheckCircleIcon className="w-10 h-10 mx-auto text-green-400 mb-2" />
                <p>No follow-ups due today!</p>
              </div>
            ) : (
              followUpsDue.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskSelect(task)}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedTask?.id === task.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 truncate">
                        {getContactName(task.contact)}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {task.contact?.company || task.target?.concept_name || 'No company'}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{task.subject}</p>
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Overdue */}
        {overdueFollowUps.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ExclamationTriangleIcon className="w-5 h-5 text-red-600" />
                Overdue ({overdueFollowUps.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {overdueFollowUps.map((task) => (
                <div
                  key={task.id}
                  onClick={() => handleTaskSelect(task)}
                  className={`p-3 cursor-pointer transition-colors ${
                    selectedTask?.id === task.id ? 'bg-orange-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900 truncate">
                          {getContactName(task.contact)}
                        </p>
                        <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">
                          {getDaysOverdue(task.activity_date)}d
                        </span>
                      </div>
                      <p className="text-sm text-gray-500 truncate">
                        {task.contact?.company || task.target?.concept_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); completeTask(task.id); }}
                        className="p-1.5 text-green-600 hover:bg-green-50 rounded"
                        title="Complete"
                      >
                        <CheckIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); dismissTask(task.id); }}
                        className="p-1.5 text-gray-400 hover:bg-gray-100 rounded"
                        title="Dismiss"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* New Hunter Leads */}
        {newHunterLeads.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <SparklesIcon className="w-5 h-5 text-orange-600" />
                New Leads ({newHunterLeads.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
              {newHunterLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                  className="p-3 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{lead.concept_name}</p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[lead.signal_strength]}`}>
                          {lead.signal_strength}
                        </span>
                      </div>
                      {lead.score_reasoning && (
                        <p className="text-sm text-gray-500 truncate">{lead.score_reasoning}</p>
                      )}
                    </div>
                    <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right side: Contact detail panel */}
      <div className="w-96 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {selectedContact ? (
          <>
            {/* Contact Header */}
            <div className="p-4 border-b border-gray-200 bg-gray-50">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedContact.first_name} {selectedContact.last_name}
                  </h3>
                  {selectedContact.title && (
                    <p className="text-sm text-gray-600">{selectedContact.title}</p>
                  )}
                  {selectedContact.company && (
                    <p className="text-sm text-gray-500">{selectedContact.company}</p>
                  )}
                </div>
                <button
                  onClick={() => setEditingContact(!editingContact)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                >
                  <PencilIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Target badge if linked */}
              {selectedContact.target && (
                <div className="mt-2 flex items-center gap-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[selectedContact.target.signal_strength]}`}>
                    {selectedContact.target.signal_strength}
                  </span>
                  <span className="text-xs text-gray-500">Hunter Lead</span>
                </div>
              )}
            </div>

            {/* Contact Info / Edit Form */}
            <div className="p-4 flex-1 overflow-y-auto">
              {editingContact ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="First name"
                      value={contactForm.first_name || ''}
                      onChange={(e) => setContactForm({ ...contactForm, first_name: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <input
                      type="text"
                      placeholder="Last name"
                      value={contactForm.last_name || ''}
                      onChange={(e) => setContactForm({ ...contactForm, last_name: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Title"
                    value={contactForm.title || ''}
                    onChange={(e) => setContactForm({ ...contactForm, title: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="text"
                    placeholder="Company"
                    value={contactForm.company || ''}
                    onChange={(e) => setContactForm({ ...contactForm, company: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="email"
                    placeholder="Email"
                    value={contactForm.email || ''}
                    onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="tel"
                    placeholder="Phone"
                    value={contactForm.phone || ''}
                    onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="tel"
                    placeholder="Mobile"
                    value={contactForm.mobile_phone || ''}
                    onChange={(e) => setContactForm({ ...contactForm, mobile_phone: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="url"
                    placeholder="LinkedIn URL"
                    value={contactForm.linkedin_url || ''}
                    onChange={(e) => setContactForm({ ...contactForm, linkedin_url: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                  />
                  <div className="flex gap-2 pt-2">
                    <button
                      onClick={() => setEditingContact(false)}
                      className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveContactChanges}
                      className="flex-1 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700"
                    >
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedContact.email && (
                    <a
                      href={`mailto:${selectedContact.email}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <EnvelopeIcon className="w-5 h-5 text-gray-400" />
                      <span className="text-blue-600">{selectedContact.email}</span>
                    </a>
                  )}
                  {selectedContact.phone && (
                    <a
                      href={`tel:${selectedContact.phone}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <PhoneIcon className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-700">{selectedContact.phone}</span>
                    </a>
                  )}
                  {selectedContact.mobile_phone && selectedContact.mobile_phone !== selectedContact.phone && (
                    <a
                      href={`tel:${selectedContact.mobile_phone}`}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <PhoneIcon className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-700">{selectedContact.mobile_phone} (mobile)</span>
                    </a>
                  )}
                  {selectedContact.linkedin_url && (
                    <a
                      href={selectedContact.linkedin_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 text-sm"
                    >
                      <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      <span className="text-blue-600">LinkedIn Profile</span>
                    </a>
                  )}
                  {(selectedContact.address_city || selectedContact.address_state) && (
                    <div className="flex items-center gap-3 p-2 text-sm">
                      <MapPinIcon className="w-5 h-5 text-gray-400" />
                      <span className="text-gray-700">
                        {[selectedContact.address_city, selectedContact.address_state].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Target info if linked */}
                  {selectedContact.target && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-500 uppercase mb-2">Hunter Lead</p>
                      <button
                        onClick={() => navigate(`/hunter/lead/${selectedContact.target!.id}`)}
                        className="w-full text-left p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <p className="font-medium text-gray-900">{selectedContact.target.concept_name}</p>
                        {selectedContact.target.industry_segment && (
                          <p className="text-sm text-purple-600">{selectedContact.target.industry_segment}</p>
                        )}
                        {selectedContact.target.score_reasoning && (
                          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{selectedContact.target.score_reasoning}</p>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Quick Actions & Activity Log Buttons */}
            {!editingContact && (
              <div className="p-4 border-t border-gray-200 bg-gray-50">
                {/* Quick Actions */}
                <p className="text-xs font-medium text-gray-500 uppercase mb-2">Quick Actions</p>
                <div className="flex gap-2 mb-4">
                  {selectedContact.email && (
                    <button
                      onClick={() => setShowComposeModal(true)}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <PaperAirplaneIcon className="w-4 h-4" />
                      Send Email
                    </button>
                  )}
                  {selectedContact.linkedin_url && (
                    <button
                      onClick={() => window.open(selectedContact.linkedin_url!, '_blank')}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                      LinkedIn
                    </button>
                  )}
                </div>

                <p className="text-xs font-medium text-gray-500 uppercase mb-3">Log Activity</p>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => logActivity('email')}
                    disabled={!!loggingActivity}
                    className="flex flex-col items-center gap-1 p-3 text-sm border border-gray-300 rounded-lg hover:bg-blue-50 hover:border-blue-300 hover:text-blue-600 transition-colors disabled:opacity-50"
                  >
                    <EnvelopeIcon className="w-5 h-5" />
                    <span className="text-xs">Email</span>
                  </button>
                  <button
                    onClick={() => logActivity('linkedin')}
                    disabled={!!loggingActivity}
                    className="flex flex-col items-center gap-1 p-3 text-sm border border-gray-300 rounded-lg hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                    </svg>
                    <span className="text-xs">LinkedIn</span>
                  </button>
                  <button
                    onClick={() => logActivity('sms')}
                    disabled={!!loggingActivity}
                    className="flex flex-col items-center gap-1 p-3 text-sm border border-gray-300 rounded-lg hover:bg-green-50 hover:border-green-300 hover:text-green-600 transition-colors disabled:opacity-50"
                  >
                    <ChatBubbleLeftIcon className="w-5 h-5" />
                    <span className="text-xs">SMS</span>
                  </button>
                  <button
                    onClick={() => logActivity('voicemail')}
                    disabled={!!loggingActivity}
                    className="flex flex-col items-center gap-1 p-3 text-sm border border-gray-300 rounded-lg hover:bg-yellow-50 hover:border-yellow-300 hover:text-yellow-600 transition-colors disabled:opacity-50"
                  >
                    <PhoneIcon className="w-5 h-5" />
                    <span className="text-xs">Voicemail</span>
                  </button>
                  <button
                    onClick={() => logActivity('call')}
                    disabled={!!loggingActivity}
                    className="flex flex-col items-center gap-1 p-3 text-sm border border-gray-300 rounded-lg hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-colors disabled:opacity-50"
                  >
                    <PhoneIcon className="w-5 h-5" />
                    <span className="text-xs">Call</span>
                  </button>
                  <button
                    onClick={() => logActivity('meeting')}
                    disabled={!!loggingActivity}
                    className="flex flex-col items-center gap-1 p-3 text-sm border border-gray-300 rounded-lg hover:bg-purple-50 hover:border-purple-300 hover:text-purple-600 transition-colors disabled:opacity-50"
                  >
                    <UserGroupIcon className="w-5 h-5" />
                    <span className="text-xs">Meeting</span>
                  </button>
                </div>

                {/* Complete Task Button */}
                {selectedTask && (
                  <button
                    onClick={() => completeTask(selectedTask.id)}
                    className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    <CheckIcon className="w-5 h-5" />
                    Complete Task
                  </button>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-gray-500">
            <BuildingOffice2Icon className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-700">Select a follow-up</p>
            <p className="text-sm text-center mt-2">
              Click on a task from the left to view contact details and log activities
            </p>
          </div>
        )}
      </div>

      {/* Follow-up Modal */}
      {selectedContact && (
        <FollowUpModal
          isOpen={showFollowUpModal}
          onClose={() => setShowFollowUpModal(false)}
          onFollowUpCreated={() => {
            setShowFollowUpModal(false);
            fetchData();
          }}
          contactId={selectedContact.id}
          contactName={`${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim()}
          contactCompany={selectedContact.company || undefined}
          targetId={selectedContact.target_id || undefined}
          isProspecting={true}
        />
      )}

      {/* Compose Email Modal */}
      {selectedContact && user?.email && (
        <ComposeEmailModal
          isOpen={showComposeModal}
          onClose={() => setShowComposeModal(false)}
          onSent={() => {
            setShowComposeModal(false);
            // Show follow-up modal after sending email
            setShowFollowUpModal(true);
          }}
          contact={selectedContact}
          userEmail={user.email}
        />
      )}

      {/* New Follow-up Modal - Contact Search */}
      {showNewFollowUpModal && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={() => {
            setShowNewFollowUpModal(false);
            setSelectedNewContact(null);
            setContactSearch('');
            setContactSearchResults([]);
          }} />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Schedule Prospecting Follow-up</h3>
                  <p className="text-sm text-gray-500">Search for a contact to schedule a follow-up</p>
                </div>
                <button
                  onClick={() => {
                    setShowNewFollowUpModal(false);
                    setSelectedNewContact(null);
                    setContactSearch('');
                    setContactSearchResults([]);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-4">
                <input
                  type="text"
                  value={contactSearch}
                  onChange={(e) => setContactSearch(e.target.value)}
                  placeholder="Search by name, company, or email..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  autoFocus
                />
              </div>

              <div className="flex-1 overflow-y-auto border-t border-gray-100">
                {searchingContacts ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mx-auto"></div>
                  </div>
                ) : contactSearchResults.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {contactSearchResults.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => {
                          setSelectedNewContact(contact);
                          setShowNewFollowUpModal(false);
                          setContactSearch('');
                          setContactSearchResults([]);
                        }}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {contact.first_name} {contact.last_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {contact.company || contact.email || 'No company'}
                            </p>
                          </div>
                          {contact.target && (
                            <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[contact.target.signal_strength]}`}>
                              {contact.target.signal_strength}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : contactSearch.length >= 2 ? (
                  <div className="p-4 text-center text-gray-500">
                    No contacts found
                  </div>
                ) : (
                  <div className="p-4 text-center text-gray-500">
                    Type at least 2 characters to search
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Follow-up modal for new contact */}
      {selectedNewContact && (
        <FollowUpModal
          isOpen={!!selectedNewContact}
          onClose={() => setSelectedNewContact(null)}
          onFollowUpCreated={() => {
            setSelectedNewContact(null);
            fetchData();
          }}
          contactId={selectedNewContact.id}
          contactName={`${selectedNewContact.first_name || ''} ${selectedNewContact.last_name || ''}`.trim()}
          contactCompany={selectedNewContact.company || undefined}
          targetId={selectedNewContact.target_id || undefined}
          isProspecting={true}
        />
      )}
    </div>
  );
}
