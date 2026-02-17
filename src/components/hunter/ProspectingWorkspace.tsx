// Prospecting Workspace - Full prospecting command center
// Shows call list with contact slide-out drawer for quick action
// src/components/hunter/ProspectingWorkspace.tsx

import { useEffect, useState, useCallback, useMemo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import FollowUpModal from '../FollowUpModal';
import {
  PhoneIcon,
  EnvelopeIcon,
  ChatBubbleLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  CheckIcon,
  XMarkIcon,
  ArrowPathIcon,
  UserGroupIcon,
  PencilIcon,
  SparklesIcon,
  BuildingOffice2Icon,
  MapPinIcon,
  PaperAirplaneIcon,
  DocumentTextIcon,
  CalendarIcon,
  Cog6ToothIcon,
  PaperClipIcon,
  GlobeAltIcon,
  ClipboardDocumentListIcon,
  PlusCircleIcon,
  ClipboardIcon,
  ArrowTopRightOnSquareIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline';

// Lazy load ReactQuill for email compose
const ReactQuill = lazy(() => import('react-quill').then(module => {
  import('react-quill/dist/quill.snow.css');
  return module;
}));

// ============================================================================
// Types
// ============================================================================

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
  linked_in_profile_link: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
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

// Unified activity feed item (combines notes and logged activities)
interface ActivityFeedItem {
  id: string;
  type: 'note' | 'email' | 'linkedin' | 'sms' | 'voicemail' | 'call' | 'meeting' | 'task';
  content: string | null; // Note content or activity notes
  email_subject?: string | null;
  created_at: string;
  created_by?: string;
  // For activities from the main activity table
  source?: 'prospecting' | 'contact_activity';
  subject?: string | null;
  activity_type_name?: string | null;
  completed_at?: string | null;
  hidden_from_timeline?: boolean; // Hidden from activity timeline but still in email history
}

interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  category: string | null;
  is_shared: boolean;
}

interface EmailSignature {
  id: string;
  user_id: string;
  name: string;
  signature_html: string;
  is_default: boolean;
}

interface EmailAttachment {
  filename: string;
  content: string; // Base64 encoded
  content_type: string;
}

// ZoomInfo enrichment match from API
interface ZoomInfoMatch {
  zoominfo_person_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  zoominfo_profile_url: string;
  city: string | null;
  state: string | null;
  country: string | null;
}

// Activity type definitions
const OUTREACH_TYPES = ['email', 'linkedin', 'sms', 'voicemail'] as const;
const CONNECTION_TYPES = ['call', 'meeting'] as const;
const OTHER_ACTIVITY_TYPES = ['task'] as const;
type OutreachType = typeof OUTREACH_TYPES[number];
type ConnectionType = typeof CONNECTION_TYPES[number];
type OtherActivityType = typeof OTHER_ACTIVITY_TYPES[number];
type ActivityType = OutreachType | ConnectionType | OtherActivityType;

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: string; color: string }> = {
  email: { label: 'Email', icon: 'envelope', color: 'blue' },
  linkedin: { label: 'LinkedIn', icon: 'linkedin', color: 'indigo' },
  sms: { label: 'SMS', icon: 'chat', color: 'green' },
  voicemail: { label: 'VM', icon: 'phone', color: 'yellow' },
  call: { label: 'Call', icon: 'phone-solid', color: 'emerald' },
  meeting: { label: 'Meeting', icon: 'users', color: 'purple' },
  task: { label: 'Task', icon: 'clipboard', color: 'slate' },
};

const SIGNAL_COLORS: Record<string, string> = {
  'HOT': 'bg-red-100 text-red-800 border-red-200',
  'WARM+': 'bg-orange-100 text-orange-800 border-orange-200',
  'WARM': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'COOL': 'bg-blue-100 text-blue-800 border-blue-200'
};

// ============================================================================
// Activity Icon Component
// ============================================================================

function ActivityIcon({ type, className = "w-4 h-4" }: { type: string; className?: string }) {
  switch (type) {
    case 'email':
      return <EnvelopeIcon className={className} />;
    case 'linkedin':
      return (
        <svg className={className} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      );
    case 'sms':
      return <ChatBubbleLeftIcon className={className} />;
    case 'voicemail':
    case 'call':
      return <PhoneIcon className={className} />;
    case 'meeting':
      return <UserGroupIcon className={className} />;
    case 'task':
      return <ClipboardDocumentListIcon className={className} />;
    case 'note':
      return <DocumentTextIcon className={className} />;
    default:
      return <DocumentTextIcon className={className} />;
  }
}

// ============================================================================
// Main Component
// ============================================================================

export default function ProspectingWorkspace() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [followUpsDue, setFollowUpsDue] = useState<FollowUpTask[]>([]);
  const [overdueFollowUps, setOverdueFollowUps] = useState<FollowUpTask[]>([]);
  const [newHunterLeads, setNewHunterLeads] = useState<NewHunterLead[]>([]);

  // Drawer state
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<'activity' | 'emails'>('activity');
  const [selectedTask, setSelectedTask] = useState<FollowUpTask | null>(null);
  const [selectedContact, setSelectedContact] = useState<ContactDetails | null>(null);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<Partial<ContactDetails>>({});

  // Activity feed (unified notes + activities)
  const [activityFeed, setActivityFeed] = useState<ActivityFeedItem[]>([]);
  const [loadingFeed, setLoadingFeed] = useState(false);

  // Activity logging
  const [loggingActivity, setLoggingActivity] = useState<ActivityType | null>(null);
  const [activityNote, setActivityNote] = useState('');
  const [showActivityNoteInput, setShowActivityNoteInput] = useState<ActivityType | null>(null);
  const [recentlyLogged, setRecentlyLogged] = useState<{ type: ActivityType; timestamp: number } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // New note input
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Email compose modal
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailSignature, setEmailSignature] = useState<EmailSignature | null>(null);
  const [emailAttachments, setEmailAttachments] = useState<EmailAttachment[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Follow-up modal
  const [showFollowUpModal, setShowFollowUpModal] = useState(false);

  // New follow-up scheduling
  const [showNewFollowUpModal, setShowNewFollowUpModal] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [contactSearchResults, setContactSearchResults] = useState<ContactDetails[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedNewContact, setSelectedNewContact] = useState<ContactDetails | null>(null);

  // Find contact modal (opens drawer directly)
  const [showFindContactModal, setShowFindContactModal] = useState(false);
  const [findContactSearch, setFindContactSearch] = useState('');
  const [findContactResults, setFindContactResults] = useState<ContactDetails[]>([]);
  const [searchingFindContact, setSearchingFindContact] = useState(false);

  // Multi-select and date change
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [editingDateTaskId, setEditingDateTaskId] = useState<string | null>(null);
  const [bulkNewDate, setBulkNewDate] = useState('');

  // Task list search/filter
  const [taskSearch, setTaskSearch] = useState('');

  // Recently contacted today
  const [recentlyContactedToday, setRecentlyContactedToday] = useState<ContactDetails[]>([]);

  // Daily prospecting stats
  const [todayStats, setTodayStats] = useState({ emails: 0, calls: 0, contacts: 0 });

  // ZoomInfo enrichment
  const [showZoomInfoModal, setShowZoomInfoModal] = useState(false);
  const [zoomInfoLoading, setZoomInfoLoading] = useState(false);
  const [zoomInfoMatches, setZoomInfoMatches] = useState<ZoomInfoMatch[]>([]);
  const [selectedZoomInfoMatch, setSelectedZoomInfoMatch] = useState<ZoomInfoMatch | null>(null);
  const [zoomInfoError, setZoomInfoError] = useState<string | null>(null);
  const [applyingZoomInfo, setApplyingZoomInfo] = useState(false);
  const [zoomInfoFieldSelections, setZoomInfoFieldSelections] = useState<Record<string, boolean>>({});

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Use local timezone for "today" calculations, then convert to ISO for Supabase
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Get Prospecting task category ID
      const { data: prospectingCategory } = await supabase
        .from('activity_task_type')
        .select('id')
        .eq('name', 'Prospecting')
        .single();
      const prospectingCategoryId = prospectingCategory?.id;

      // Get open status IDs
      const { data: openStatuses } = await supabase
        .from('activity_status')
        .select('id')
        .eq('is_closed', false);
      const openStatusIds = openStatuses?.map(s => s.id) || [];

      if (openStatusIds.length > 0 && prospectingCategoryId) {
        // Fetch follow-ups due today
        const { data: todayTasks } = await supabase
          .from('activity')
          .select(`
            id, subject, activity_date, contact_id, target_id,
            contact:contact!fk_activity_contact_id(
              id, first_name, last_name, company, email, phone, mobile_phone, title, target_id
            ),
            target:target(id, concept_name, signal_strength, industry_segment, website)
          `)
          .gte('activity_date', todayStart)
          .lte('activity_date', todayEnd)
          .in('status_id', openStatusIds)
          .eq('activity_task_type_id', prospectingCategoryId)
          .order('activity_date', { ascending: true });

        setFollowUpsDue((todayTasks || []) as FollowUpTask[]);

        // Fetch overdue follow-ups
        const { data: overdueTasks } = await supabase
          .from('activity')
          .select(`
            id, subject, activity_date, contact_id, target_id,
            contact:contact!fk_activity_contact_id(
              id, first_name, last_name, company, email, phone, mobile_phone, title, target_id
            ),
            target:target(id, concept_name, signal_strength, industry_segment, website)
          `)
          .lt('activity_date', todayStart)
          .gte('activity_date', thirtyDaysAgo.toISOString())
          .in('status_id', openStatusIds)
          .eq('activity_task_type_id', prospectingCategoryId)
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

      // Fetch contacts with prospecting activity logged today
      // Note: hidden_from_timeline column may not exist yet - don't select it to avoid query failure
      // PostgREST doesn't support multiple filters on the same column, so fetch recent activities
      // and filter in JS to avoid 400 error
      const { data: recentActivityData, error: recentlyContactedError } = await supabase
        .from('prospecting_activity')
        .select(`
          contact_id,
          activity_type,
          created_at,
          contact:contact!fk_prospecting_activity_contact_id(
            id, first_name, last_name, company, email, phone, mobile_phone, title, target_id
          )
        `)
        .gte('created_at', todayStart)
        .order('created_at', { ascending: false })
        .limit(500);

      // Filter to only include activities from today (in local timezone)
      const todayEndTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0).getTime();
      const recentlyContactedData = (recentActivityData || []).filter(item => {
        const itemTime = new Date(item.created_at).getTime();
        return itemTime < todayEndTime;
      });

      console.log('📊 Scorecard Debug:', {
        todayStart,
        todayEndTime: new Date(todayEndTime).toISOString(),
        rawCount: recentActivityData?.length || 0,
        filteredCount: recentlyContactedData?.length || 0,
        recentlyContactedError
      });

      // Deduplicate contacts and calculate stats
      const contactMap = new Map<string, ContactDetails>();
      let emailCount = 0;
      let callCount = 0;
      interface ActivityItem {
        contact_id: string;
        activity_type?: string;
        contact: ContactDetails | null;
      }
      (recentlyContactedData || []).forEach((item: ActivityItem) => {
        if (item.contact && !contactMap.has(item.contact_id)) {
          contactMap.set(item.contact_id, item.contact as ContactDetails);
        }
        // Count activity types
        if (item.activity_type === 'email') emailCount++;
        if (item.activity_type === 'call') callCount++;
      });
      setRecentlyContactedToday(Array.from(contactMap.values()));
      setTodayStats({
        emails: emailCount,
        calls: callCount,
        contacts: contactMap.size
      });

      // Get current user ID for templates and signature
      let userId: string | null = null;
      if (user?.email) {
        const { data: userData } = await supabase
          .from('user')
          .select('id')
          .eq('email', user.email)
          .single();
        userId = userData?.id || null;
        setCurrentUserId(userId);
      }

      if (userId) {
        // Fetch email templates (own + shared)
        const { data: templates } = await supabase
          .from('email_template')
          .select('id, name, subject, body, category, is_shared')
          .or(`created_by.eq.${userId},is_shared.eq.true`)
          .order('name');

        setEmailTemplates((templates || []) as EmailTemplate[]);

        // Fetch default signature
        const { data: signature } = await supabase
          .from('user_email_signature')
          .select('*')
          .eq('user_id', userId)
          .eq('is_default', true)
          .single();

        setEmailSignature(signature || null);
      }
    } catch (err) {
      console.error('Error fetching prospecting data:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.email]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Load unified activity feed when contact changes
  const loadActivityFeed = useCallback(async (contactId: string, targetId?: string | null) => {
    setLoadingFeed(true);
    try {
      // Build query filter to include activities on contact OR their linked target
      // Note: hidden_from_timeline column may not exist yet - omit to avoid query failure
      let activitiesQuery = supabase
        .from('prospecting_activity')
        .select('id, activity_type, notes, email_subject, created_at, created_by');

      let notesQuery = supabase
        .from('prospecting_note')
        .select('id, content, created_at, created_by');

      // If there's a target_id, get activities for both contact AND target
      if (targetId) {
        activitiesQuery = activitiesQuery.or(`contact_id.eq.${contactId},target_id.eq.${targetId}`);
        notesQuery = notesQuery.or(`contact_id.eq.${contactId},target_id.eq.${targetId}`);
      } else {
        activitiesQuery = activitiesQuery.eq('contact_id', contactId);
        notesQuery = notesQuery.eq('contact_id', contactId);
      }

      // Fetch prospecting activities
      const { data: activities } = await activitiesQuery.order('created_at', { ascending: false });

      // Fetch notes
      const { data: notes } = await notesQuery.order('created_at', { ascending: false });

      // Fetch contact activities from the main activity table (logged calls, tasks, etc.)
      const { data: contactActivities, error: contactActivitiesError } = await supabase
        .from('activity')
        .select(`
          id,
          subject,
          description,
          created_at,
          completed_at,
          completed_call,
          call_duration_seconds,
          activity_type!fk_activity_type_id (
            name
          )
        `)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      console.log('🔍 Contact activities query:', { contactId, contactActivities, contactActivitiesError });

      // Combine and sort chronologically
      const feedItems: ActivityFeedItem[] = [
        // Prospecting activities
        ...(activities || []).map(a => ({
          id: a.id,
          type: a.activity_type as ActivityFeedItem['type'],
          content: a.notes,
          email_subject: a.email_subject,
          created_at: a.created_at,
          created_by: a.created_by,
          source: 'prospecting' as const
        })),
        // Notes
        ...(notes || []).map(n => ({
          id: n.id,
          type: 'note' as const,
          content: n.content,
          created_at: n.created_at,
          created_by: n.created_by,
          source: 'prospecting' as const
        })),
        // Contact activities (logged calls, tasks, etc.)
        ...(contactActivities || []).map(a => {
          // Map activity type name to our feed item types
          const activityTypeName = (a.activity_type as { name: string } | null)?.name?.toLowerCase() || '';
          let type: ActivityFeedItem['type'] = 'task';
          if (activityTypeName === 'call' || a.completed_call) {
            type = 'call';
          } else if (activityTypeName === 'email') {
            type = 'email';
          } else if (activityTypeName === 'meeting') {
            type = 'meeting';
          }

          // Build content string
          let content = a.description || '';
          if (a.call_duration_seconds) {
            const mins = Math.floor(a.call_duration_seconds / 60);
            const secs = a.call_duration_seconds % 60;
            content = content ? `${content} (${mins}:${secs.toString().padStart(2, '0')})` : `Duration: ${mins}:${secs.toString().padStart(2, '0')}`;
          }

          return {
            id: a.id,
            type,
            content: content || null,
            subject: a.subject,
            created_at: a.created_at,
            completed_at: a.completed_at,
            source: 'contact_activity' as const,
            activity_type_name: (a.activity_type as { name: string } | null)?.name || null
          };
        })
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setActivityFeed(feedItems);
    } catch (err) {
      console.error('Error loading activity feed:', err);
    } finally {
      setLoadingFeed(false);
    }
  }, []);

  // Load contact details when task is selected
  const loadContactDetails = async (contactId: string) => {
    const { data: contactData, error } = await supabase
      .from('contact')
      .select(`
        id, first_name, last_name, company, email, phone, mobile_phone, title,
        target_id, linked_in_profile_link, mailing_city, mailing_state
      `)
      .eq('id', contactId)
      .single();

    if (error || !contactData) return;

    let target = null;
    if (contactData.target_id) {
      const { data: targetData } = await supabase
        .from('target')
        .select('id, concept_name, signal_strength, industry_segment, website, score_reasoning')
        .eq('id', contactData.target_id)
        .single();
      target = targetData;
    }

    const fullContact = { ...contactData, target };
    setSelectedContact(fullContact as ContactDetails);
    setContactForm(fullContact);
    loadActivityFeed(contactId, contactData.target_id);
  };

  const handleTaskSelect = (task: FollowUpTask) => {
    setSelectedTask(task);
    setEditingContact(false);
    setShowActivityNoteInput(null);
    setDrawerOpen(true);
    if (task.contact_id) {
      loadContactDetails(task.contact_id);
    } else if (task.contact?.id) {
      loadContactDetails(task.contact.id);
    } else {
      setSelectedContact(null);
      setActivityFeed([]);
    }
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => {
      setSelectedTask(null);
      setSelectedContact(null);
      setActivityFeed([]);
    }, 300); // Wait for animation
  };

  // ============================================================================
  // Activity Logging
  // ============================================================================

  const logActivity = async (activityType: ActivityType, note?: string) => {
    if (!selectedContact || !user) return;

    setLoggingActivity(activityType);
    try {
      const { data: activityData, error } = await supabase
        .from('prospecting_activity')
        .insert({
          contact_id: selectedContact.id,
          target_id: selectedContact.target_id,
          activity_type: activityType,
          notes: note || null,
          created_by: user.id
        })
        .select('id, activity_type, notes, created_at')
        .single();

      if (error) throw error;

      // Add to feed
      if (activityData) {
        setActivityFeed(prev => [{
          id: activityData.id,
          type: activityData.activity_type as ActivityFeedItem['type'],
          content: activityData.notes,
          created_at: activityData.created_at
        }, ...prev]);
      }

      // Update last_contacted_at on target if linked
      if (selectedContact.target_id) {
        await supabase
          .from('target')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', selectedContact.target_id);
      }

      // Auto-complete any open task for this contact
      if (selectedTask && selectedTask.contact_id === selectedContact.id) {
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
            .eq('id', selectedTask.id);

          // Clear the completed task but keep contact drawer open
          setSelectedTask(null);
          fetchData();
        }
      }

      // Add to "Contacted Today" list (at the top, avoiding duplicates)
      const isNewContact = !recentlyContactedToday.some(c => c.id === selectedContact.id);
      setRecentlyContactedToday(prev => {
        const filtered = prev.filter(c => c.id !== selectedContact.id);
        return [selectedContact, ...filtered];
      });

      // Update today's stats
      setTodayStats(prev => ({
        emails: prev.emails + (activityType === 'email' ? 1 : 0),
        calls: prev.calls + (activityType === 'call' ? 1 : 0),
        contacts: isNewContact ? prev.contacts + 1 : prev.contacts
      }));

      // Show success feedback
      setRecentlyLogged({ type: activityType, timestamp: Date.now() });
      setTimeout(() => setRecentlyLogged(null), 3000);

      setActivityNote('');
      setShowActivityNoteInput(null);
      setShowFollowUpModal(true);
    } catch (err) {
      console.error('Error logging activity:', err);
      alert('Failed to log activity');
    } finally {
      setLoggingActivity(null);
    }
  };

  const handleActivityClick = (type: ActivityType) => {
    if (showActivityNoteInput === type) {
      // Submit with current note
      logActivity(type, activityNote);
    } else {
      // Show note input for this type
      setShowActivityNoteInput(type);
      setActivityNote('');
    }
  };

  const addNote = async () => {
    if (!selectedContact || !user || !newNoteText.trim()) return;

    setAddingNote(true);
    try {
      const { data, error } = await supabase
        .from('prospecting_note')
        .insert({
          contact_id: selectedContact.id,
          target_id: selectedContact.target_id,
          content: newNoteText.trim(),
          created_by: user.id
        })
        .select('id, content, created_at')
        .single();

      if (error) throw error;

      if (data) {
        setActivityFeed(prev => [{
          id: data.id,
          type: 'note',
          content: data.content,
          created_at: data.created_at
        }, ...prev]);
      }

      setNewNoteText('');
    } catch (err) {
      console.error('Error adding note:', err);
      alert('Failed to add note');
    } finally {
      setAddingNote(false);
    }
  };

  const deleteActivityItem = async (item: ActivityFeedItem) => {
    // Don't allow deleting contact activities - they should be managed from the contact page
    if (item.source === 'contact_activity') {
      return;
    }
    try {
      const table = item.type === 'note' ? 'prospecting_note' : 'prospecting_activity';
      // Delete the activity (hide from timeline feature requires DB migration)
      const { error } = await supabase.from(table).delete().eq('id', item.id);
      if (error) throw error;
      setActivityFeed(prev => prev.filter(i => i.id !== item.id));
    } catch (err) {
      console.error('Error deleting item:', err);
    }
  };

  // ============================================================================
  // Email Sending
  // ============================================================================

  const openEmailModal = () => {
    if (!selectedContact) return;
    setEmailSubject(`Following up - ${selectedContact.company || `${selectedContact.first_name} ${selectedContact.last_name}`}`);
    let initialBody = `<p>Hi ${selectedContact.first_name || 'there'},</p><p><br></p><p><br></p><p>Best regards</p>`;
    if (emailSignature?.signature_html) {
      initialBody += '<br>' + emailSignature.signature_html;
    }
    setEmailBody(initialBody);
    setEmailAttachments([]);
    setSelectedTemplate('');
    setShowEmailModal(true);
  };

  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    const template = emailTemplates.find(t => t.id === templateId);
    if (template && selectedContact) {
      // Replace template variables
      let subject = template.subject;
      let body = template.body;

      const fullName = `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim();
      const vars: Record<string, string> = {
        '{{first_name}}': selectedContact.first_name || '',
        '{{last_name}}': selectedContact.last_name || '',
        '{{full_name}}': fullName || '',
        '{{company}}': selectedContact.company || '',
        '{{title}}': selectedContact.title || '',
      };

      Object.entries(vars).forEach(([key, value]) => {
        subject = subject.replace(new RegExp(key, 'g'), value);
        body = body.replace(new RegExp(key, 'g'), value);
      });

      // Append signature if available
      if (emailSignature?.signature_html) {
        body = body + '<br><br>' + emailSignature.signature_html;
      }

      setEmailSubject(subject);
      setEmailBody(body);
    }
  };

  // File attachment handling
  const handleFileAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const maxSize = 40 * 1024 * 1024; // 40MB limit
    const newAttachments: EmailAttachment[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 40MB.`);
        continue;
      }

      try {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') {
              resolve(reader.result.split(',')[1]);
            } else {
              reject(new Error('Failed to read file'));
            }
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        newAttachments.push({
          filename: file.name,
          content: base64,
          content_type: file.type || 'application/octet-stream',
        });
      } catch (error) {
        console.error(`Error reading file ${file.name}:`, error);
      }
    }

    setEmailAttachments([...emailAttachments, ...newAttachments]);
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setEmailAttachments(emailAttachments.filter((_, i) => i !== index));
  };

  // Quill modules for email compose
  const quillModules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      [{ 'font': [] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'align': [] }],
      ['link', 'image'],
      ['clean']
    ],
  }), []);

  const quillFormats = [
    'header', 'font',
    'bold', 'italic', 'underline', 'strike',
    'color', 'background',
    'list', 'bullet',
    'align',
    'link', 'image'
  ];

  const sendEmail = async () => {
    if (!selectedContact?.email || !user?.email) return;

    setSendingEmail(true);
    try {
      // Create outreach record
      const { data: outreach, error: outreachError } = await supabase
        .from('hunter_outreach_draft')
        .insert({
          target_id: selectedContact.target_id,
          outreach_type: 'email',
          contact_name: `${selectedContact.first_name || ''} ${selectedContact.last_name || ''}`.trim(),
          contact_email: selectedContact.email,
          subject: emailSubject,
          body: emailBody,
          status: 'approved',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (outreachError) throw outreachError;

      // Apply inline styles to normalize paragraph spacing (Gmail strips <style> tags)
      // Replace <p> tags with inline-styled versions
      let styledEmailBody = emailBody
        .replace(/<p>/gi, '<p style="margin: 0 0 8px 0; line-height: 1.4;">')
        .replace(/<p\s+style="/gi, '<p style="margin: 0 0 8px 0; line-height: 1.4; ')
        .replace(/<div>/gi, '<div style="line-height: 1.4;">')
        .replace(/<div\s+style="/gi, '<div style="line-height: 1.4; ');

      // Wrap in a container div with base styling
      styledEmailBody = `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4; color: #333;">${styledEmailBody}</div>`;

      // Send via Gmail
      const response = await supabase.functions.invoke('hunter-send-outreach', {
        body: {
          outreach_id: outreach.id,
          user_email: user.email,
          to: [selectedContact.email],
          subject: emailSubject,
          body_html: styledEmailBody,
          body_text: emailBody.replace(/<[^>]*>/g, ''),
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined
        }
      });

      if (response.error) throw new Error(response.error.message);

      // Log as email activity
      await logActivity('email', `Sent: "${emailSubject}"`);

      setShowEmailModal(false);
      setEmailSubject('');
      setEmailBody('');
      setSelectedTemplate('');
      setEmailAttachments([]);
    } catch (err) {
      console.error('Error sending email:', err);
      alert(`Failed to send email: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSendingEmail(false);
    }
  };

  // ============================================================================
  // Task Management
  // ============================================================================

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
          // Clear the completed task but keep the contact drawer open
          setSelectedTask(null);
        }
      }
    } catch (err) {
      console.error('Error completing task:', err);
    }
  };

  // Update single task date
  const updateTaskDate = async (taskId: string, newDate: string) => {
    try {
      await supabase
        .from('activity')
        .update({ activity_date: new Date(newDate).toISOString() })
        .eq('id', taskId);

      setEditingDateTaskId(null);
      fetchData();
    } catch (err) {
      console.error('Error updating task date:', err);
    }
  };

  // Bulk update selected task dates
  const bulkUpdateDates = async () => {
    if (!bulkNewDate || selectedTaskIds.size === 0) return;

    try {
      const newDateIso = new Date(bulkNewDate).toISOString();

      await supabase
        .from('activity')
        .update({ activity_date: newDateIso })
        .in('id', Array.from(selectedTaskIds));

      setSelectedTaskIds(new Set());
      setBulkNewDate('');
      fetchData();
    } catch (err) {
      console.error('Error bulk updating dates:', err);
    }
  };

  // Toggle task selection
  const toggleTaskSelection = (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  // Select/deselect all tasks in a list
  const toggleSelectAll = (tasks: FollowUpTask[], selectAll: boolean) => {
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      tasks.forEach(task => {
        if (selectAll) {
          next.add(task.id);
        } else {
          next.delete(task.id);
        }
      });
      return next;
    });
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
          linked_in_profile_link: contactForm.linked_in_profile_link,
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

  // ============================================================================
  // Helper Functions
  // ============================================================================

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

  const formatActivityTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return date.toLocaleDateString('en-US', { weekday: 'short' });
    } else {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
  };

  // Copy to clipboard helper
  const copyToClipboard = async (value: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(fieldName);
      setTimeout(() => setCopiedField(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // ZoomInfo enrichment - search for contact matches
  const searchZoomInfo = async () => {
    if (!selectedContact) return;

    setZoomInfoLoading(true);
    setZoomInfoError(null);
    setZoomInfoMatches([]);
    setSelectedZoomInfoMatch(null);
    setShowZoomInfoModal(true);

    try {
      const { data, error } = await supabase.functions.invoke('hunter-zoominfo-enrich', {
        body: {
          contact_id: selectedContact.id,
          first_name: selectedContact.first_name,
          last_name: selectedContact.last_name,
          email: selectedContact.email,
          company: selectedContact.company,
        },
      });

      if (error) {
        throw new Error(error.message || 'Failed to search ZoomInfo');
      }

      if (!data.success) {
        throw new Error(data.error || 'ZoomInfo search failed');
      }

      setZoomInfoMatches(data.matches || []);

      // Auto-select first match if only one
      if (data.matches?.length === 1) {
        selectZoomInfoMatch(data.matches[0]);
      }
    } catch (err) {
      console.error('ZoomInfo search error:', err);
      setZoomInfoError(err instanceof Error ? err.message : 'Failed to search ZoomInfo');
    } finally {
      setZoomInfoLoading(false);
    }
  };

  // Select a ZoomInfo match and calculate which fields to fill
  const selectZoomInfoMatch = (match: ZoomInfoMatch) => {
    setSelectedZoomInfoMatch(match);

    // Determine which fields should be selected by default
    // Fill empty fields, or offer to update with different values
    const selections: Record<string, boolean> = {};

    // Only select fields that are empty in current contact OR have different value
    if (!selectedContact?.email && match.email) {
      selections.email = true;
    } else if (selectedContact?.email && match.email && selectedContact.email !== match.email) {
      selections.email = false; // Different value - don't auto-select
    }

    if (!selectedContact?.phone && match.phone) {
      selections.phone = true;
    } else if (selectedContact?.phone && match.phone && selectedContact.phone !== match.phone) {
      selections.phone = false;
    }

    if (!selectedContact?.mobile_phone && match.mobile_phone) {
      selections.mobile_phone = true;
    } else if (selectedContact?.mobile_phone && match.mobile_phone && selectedContact.mobile_phone !== match.mobile_phone) {
      selections.mobile_phone = false;
    }

    if (!selectedContact?.title && match.title) {
      selections.title = true;
    } else if (selectedContact?.title && match.title && selectedContact.title !== match.title) {
      selections.title = false;
    }

    if (!selectedContact?.linked_in_profile_link && match.linkedin_url) {
      selections.linkedin_url = true;
    } else if (selectedContact?.linked_in_profile_link && match.linkedin_url && selectedContact.linked_in_profile_link !== match.linkedin_url) {
      selections.linkedin_url = false;
    }

    // Always track zoominfo profile URL
    selections.zoominfo_profile_url = true;

    setZoomInfoFieldSelections(selections);
  };

  // Apply selected ZoomInfo data to contact
  const applyZoomInfoData = async () => {
    if (!selectedContact || !selectedZoomInfoMatch) return;

    setApplyingZoomInfo(true);
    try {
      const updateData: Record<string, unknown> = {
        zoominfo_person_id: selectedZoomInfoMatch.zoominfo_person_id,
        zoominfo_profile_url: selectedZoomInfoMatch.zoominfo_profile_url,
        zoominfo_last_enriched_at: new Date().toISOString(),
        zoominfo_data: selectedZoomInfoMatch, // Store full response
      };

      // Add selected fields
      if (zoomInfoFieldSelections.email && selectedZoomInfoMatch.email) {
        updateData.email = selectedZoomInfoMatch.email;
      }
      if (zoomInfoFieldSelections.phone && selectedZoomInfoMatch.phone) {
        updateData.phone = selectedZoomInfoMatch.phone;
      }
      if (zoomInfoFieldSelections.mobile_phone && selectedZoomInfoMatch.mobile_phone) {
        updateData.mobile_phone = selectedZoomInfoMatch.mobile_phone;
      }
      if (zoomInfoFieldSelections.title && selectedZoomInfoMatch.title) {
        updateData.title = selectedZoomInfoMatch.title;
      }
      if (zoomInfoFieldSelections.linkedin_url && selectedZoomInfoMatch.linkedin_url) {
        updateData.linked_in_profile_link = selectedZoomInfoMatch.linkedin_url;
      }

      const { error } = await supabase
        .from('contact')
        .update(updateData)
        .eq('id', selectedContact.id);

      if (error) throw error;

      // Refresh contact data
      const { data: updatedContact } = await supabase
        .from('contact')
        .select(`
          id, first_name, last_name, company, email, phone, mobile_phone, title,
          target_id, linked_in_profile_link, mailing_city, mailing_state,
          target:target(id, concept_name, signal_strength, industry_segment, website, score_reasoning)
        `)
        .eq('id', selectedContact.id)
        .single();

      if (updatedContact) {
        setSelectedContact(updatedContact as ContactDetails);
      }

      setShowZoomInfoModal(false);
      setSelectedZoomInfoMatch(null);
      setZoomInfoMatches([]);
    } catch (err) {
      console.error('Failed to apply ZoomInfo data:', err);
      setZoomInfoError(err instanceof Error ? err.message : 'Failed to update contact');
    } finally {
      setApplyingZoomInfo(false);
    }
  };

  // Search contacts for new follow-up
  const searchContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setContactSearchResults([]);
      return;
    }

    setSearchingContacts(true);
    try {
      const { data: contacts } = await supabase
        .from('contact')
        .select(`
          id, first_name, last_name, company, email, phone, mobile_phone, title,
          target_id, linked_in_profile_link, mailing_city, mailing_state
        `)
        .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,company.ilike.%${query}%,email.ilike.%${query}%`)
        .limit(10);

      const targetIds = contacts?.filter(c => c.target_id).map(c => c.target_id) || [];
      let targets: Record<string, any> = {};

      if (targetIds.length > 0) {
        const { data: targetData } = await supabase
          .from('target')
          .select('id, concept_name, signal_strength, industry_segment, website, score_reasoning')
          .in('id', targetIds);

        targets = (targetData || []).reduce((acc, t) => {
          acc[t.id] = t;
          return acc;
        }, {} as Record<string, any>);
      }

      const data = contacts?.map(c => ({
        ...c,
        target: c.target_id ? targets[c.target_id] || null : null
      }));

      setContactSearchResults((data || []) as ContactDetails[]);
    } catch (err) {
      console.error('Error searching contacts:', err);
    } finally {
      setSearchingContacts(false);
    }
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (contactSearch) {
        searchContacts(contactSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [contactSearch, searchContacts]);

  // Search contacts for Find Contact modal
  const searchFindContacts = useCallback(async (query: string) => {
    if (query.length < 2) {
      setFindContactResults([]);
      return;
    }

    setSearchingFindContact(true);
    try {
      // Split query into terms for fuzzy multi-word matching
      const searchTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 0);
      const firstTerm = searchTerms[0];

      // Build OR filter for first term across all searchable fields
      const { data: contacts, error } = await supabase
        .from('contact')
        .select(`
          id, first_name, last_name, company, email, phone, mobile_phone, title,
          target_id, linked_in_profile_link, mailing_city, mailing_state
        `)
        .or(`first_name.ilike.%${firstTerm}%,last_name.ilike.%${firstTerm}%,company.ilike.%${firstTerm}%,email.ilike.%${firstTerm}%`)
        .limit(50);

      if (error) {
        console.error('Find Contact search error:', error);
        setFindContactResults([]);
        return;
      }

      // Client-side filtering for multi-term queries (e.g., "john smith" or "smith acme")
      let filteredContacts = contacts || [];
      if (searchTerms.length > 1) {
        filteredContacts = filteredContacts.filter(contact => {
          const searchableText = [
            contact.first_name,
            contact.last_name,
            contact.company,
            contact.email,
            contact.title
          ].filter(Boolean).join(' ').toLowerCase();

          return searchTerms.every(term => searchableText.includes(term));
        });
      }

      // Limit to 10 results
      filteredContacts = filteredContacts.slice(0, 10);

      const targetIds = filteredContacts.filter(c => c.target_id).map(c => c.target_id) || [];
      let targets: Record<string, any> = {};

      if (targetIds.length > 0) {
        const { data: targetData } = await supabase
          .from('target')
          .select('id, concept_name, signal_strength, industry_segment, website, score_reasoning')
          .in('id', targetIds);

        targets = (targetData || []).reduce((acc, t) => {
          acc[t.id] = t;
          return acc;
        }, {} as Record<string, any>);
      }

      const data = filteredContacts.map(c => ({
        ...c,
        target: c.target_id ? targets[c.target_id] || null : null
      }));

      setFindContactResults(data as ContactDetails[]);
    } catch (err) {
      console.error('Error searching contacts:', err);
    } finally {
      setSearchingFindContact(false);
    }
  }, []);

  // Debounced search for Find Contact
  useEffect(() => {
    const timer = setTimeout(() => {
      if (findContactSearch) {
        searchFindContacts(findContactSearch);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [findContactSearch, searchFindContacts]);

  // Open contact in drawer directly (without a task)
  const openContactInDrawer = useCallback((contact: ContactDetails) => {
    setSelectedContact(contact);
    setSelectedTask(null); // Clear any selected task
    setDrawerOpen(true);
    setDrawerTab('activity');
    // Load activity feed for this contact
    loadActivityFeed(contact.id, contact.target_id);
    // Close the find modal
    setShowFindContactModal(false);
    setFindContactSearch('');
    setFindContactResults([]);
  }, [loadActivityFeed]);

  // ============================================================================
  // Filtered Task Lists
  // ============================================================================

  const filterTasks = (tasks: FollowUpTask[]) => {
    if (!taskSearch.trim()) return tasks;
    const search = taskSearch.toLowerCase();
    return tasks.filter(task => {
      const contactName = getContactName(task.contact).toLowerCase();
      const company = (task.contact?.company || task.target?.concept_name || '').toLowerCase();
      return contactName.includes(search) || company.includes(search);
    });
  };

  const filteredOverdue = filterTasks(overdueFollowUps);
  const filteredDueToday = filterTasks(followUpsDue);

  // ============================================================================
  // Render
  // ============================================================================

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-220px)] relative">
      {/* Main Content Area - Full Width */}
      <div className="h-full flex flex-col">
        {/* Stats Row - Tasks */}
        <div className="grid grid-cols-7 gap-4 mb-4 flex-shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-blue-600">{followUpsDue.length}</p>
            <p className="text-sm text-gray-500">Due Today</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-red-600">{overdueFollowUps.length}</p>
            <p className="text-sm text-gray-500">Overdue</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-purple-600">{overdueFollowUps.length + followUpsDue.length}</p>
            <p className="text-sm text-gray-500">Total Tasks</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-orange-600">{newHunterLeads.length}</p>
            <p className="text-sm text-gray-500">New Leads</p>
          </div>
          {/* Prospecting Scorecard */}
          <div className="bg-gradient-to-br from-green-50 to-white rounded-lg shadow-sm border border-green-200 p-4">
            <p className="text-3xl font-bold text-green-600">{todayStats.emails}</p>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <EnvelopeIcon className="w-3.5 h-3.5" />
              Emails Sent
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-white rounded-lg shadow-sm border border-green-200 p-4">
            <p className="text-3xl font-bold text-green-600">{todayStats.calls}</p>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <PhoneIcon className="w-3.5 h-3.5" />
              Calls Made
            </p>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-white rounded-lg shadow-sm border border-green-200 p-4">
            <p className="text-3xl font-bold text-green-600">{todayStats.contacts}</p>
            <p className="text-sm text-gray-500 flex items-center gap-1">
              <UserGroupIcon className="w-3.5 h-3.5" />
              Contacts
            </p>
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex gap-2 mb-4 flex-shrink-0">
          <button
            onClick={() => setShowFindContactModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <MagnifyingGlassIcon className="w-5 h-5" />
            Find Contact
          </button>
          <button
            onClick={() => setShowNewFollowUpModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700"
          >
            <PlusCircleIcon className="w-5 h-5" />
            Schedule Task
          </button>
          <button
            onClick={fetchData}
            className="px-4 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <ArrowPathIcon className="w-5 h-5 text-gray-500" />
            Refresh
          </button>
        </div>

        {/* Main Content - Two Column Layout */}
        <div className="flex gap-4 flex-1 min-h-0">
          {/* Call List Column */}
          <div className="flex-[2] bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-0">
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardDocumentListIcon className="w-5 h-5 text-orange-600" />
                Call List ({taskSearch ? `${filteredOverdue.length + filteredDueToday.length} of ` : ''}{overdueFollowUps.length + followUpsDue.length})
              </h3>
              {(overdueFollowUps.length + followUpsDue.length) > 0 && (
                <button
                  onClick={() => {
                    const allTasks = [...overdueFollowUps, ...followUpsDue];
                    toggleSelectAll(allTasks, !allTasks.every(t => selectedTaskIds.has(t.id)));
                  }}
                  className="text-sm text-orange-600 hover:text-orange-800"
                >
                  {[...overdueFollowUps, ...followUpsDue].every(t => selectedTaskIds.has(t.id)) ? 'Deselect All' : 'Select All'}
                </button>
              )}
            </div>

            {/* Search bar */}
            <div className="px-4 py-2 border-b border-gray-200 flex-shrink-0">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or company..."
                  value={taskSearch}
                  onChange={(e) => setTaskSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                {taskSearch && (
                  <button
                    onClick={() => setTaskSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Bulk date change bar */}
            {selectedTaskIds.size > 0 && (
              <div className="px-4 py-2 bg-orange-50 border-b border-orange-200 flex items-center gap-3 flex-shrink-0">
                <span className="text-sm text-orange-800 font-medium">{selectedTaskIds.size} selected</span>
                <div className="flex-1" />
                <input
                  type="date"
                  value={bulkNewDate}
                  onChange={(e) => setBulkNewDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className="text-sm border border-orange-300 rounded px-2 py-1"
                />
                <button
                  onClick={bulkUpdateDates}
                  disabled={!bulkNewDate}
                  className="text-sm px-3 py-1 bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                >
                  Move to Date
                </button>
                <button
                  onClick={() => setSelectedTaskIds(new Set())}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Task list - scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {(overdueFollowUps.length + followUpsDue.length) === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <CheckCircleIcon className="w-12 h-12 mx-auto text-green-400 mb-2" />
                  <p className="text-lg font-medium">All caught up!</p>
                  <p className="text-sm mt-1">No tasks due</p>
                </div>
              ) : (filteredOverdue.length + filteredDueToday.length) === 0 && taskSearch ? (
                <div className="p-8 text-center text-gray-500">
                  <MagnifyingGlassIcon className="w-12 h-12 mx-auto text-gray-300 mb-2" />
                  <p className="text-lg font-medium">No matches found</p>
                  <p className="text-sm mt-1">Try a different search term</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* Overdue tasks */}
                  {filteredOverdue.map((task) => {
                    const daysOver = getDaysOverdue(task.activity_date);
                    return (
                      <div
                        key={task.id}
                        onClick={() => handleTaskSelect(task)}
                        className={`px-4 py-3 cursor-pointer transition-colors group ${
                          selectedTask?.id === task.id ? 'bg-orange-50 border-l-4 border-orange-500' : 'hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={selectedTaskIds.has(task.id)}
                            onChange={(e) => toggleTaskSelection(task.id, e as unknown as React.MouseEvent)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-gray-900 truncate">
                                {getContactName(task.contact)}
                              </p>
                              <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">
                                {daysOver}d overdue
                              </span>
                            </div>
                            <p className="text-sm text-gray-500 truncate">
                              {task.contact?.company || task.target?.concept_name}
                            </p>
                          </div>
                          {editingDateTaskId === task.id ? (
                            <input
                              type="date"
                              defaultValue={task.activity_date.split('T')[0]}
                              onChange={(e) => updateTaskDate(task.id, e.target.value)}
                              onBlur={() => setEditingDateTaskId(null)}
                              onClick={(e) => e.stopPropagation()}
                              autoFocus
                              className="text-sm border border-gray-300 rounded px-2 py-1"
                            />
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingDateTaskId(task.id);
                              }}
                              className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-gray-600 transition-opacity"
                              title="Change date"
                            >
                              <CalendarIcon className="w-5 h-5" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Today divider */}
                  {filteredOverdue.length > 0 && filteredDueToday.length > 0 && (
                    <div className="px-4 py-2 bg-blue-50 text-sm font-medium text-blue-700 border-y border-blue-100">
                      Due Today
                    </div>
                  )}

                  {/* Due today tasks */}
                  {filteredDueToday.map((task) => (
                    <div
                      key={task.id}
                      onClick={() => handleTaskSelect(task)}
                      className={`px-4 py-3 cursor-pointer transition-colors group ${
                        selectedTask?.id === task.id ? 'bg-orange-50 border-l-4 border-orange-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={(e) => toggleTaskSelection(task.id, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 truncate">
                            {getContactName(task.contact)}
                          </p>
                          <p className="text-sm text-gray-500 truncate">
                            {task.contact?.company || task.target?.concept_name || 'No company'}
                          </p>
                        </div>
                        {editingDateTaskId === task.id ? (
                          <input
                            type="date"
                            defaultValue={task.activity_date.split('T')[0]}
                            onChange={(e) => updateTaskDate(task.id, e.target.value)}
                            onBlur={() => setEditingDateTaskId(null)}
                            onClick={(e) => e.stopPropagation()}
                            autoFocus
                            className="text-sm border border-gray-300 rounded px-2 py-1"
                          />
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDateTaskId(task.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-2 text-gray-400 hover:text-gray-600 transition-opacity"
                            title="Change date"
                          >
                            <CalendarIcon className="w-5 h-5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Side Column - New Leads + Recently Contacted */}
          <div className="flex-1 flex flex-col gap-4 min-h-0">
            {/* New Leads */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-1 min-h-0">
              <div className="px-4 py-3 border-b border-gray-200 bg-orange-50 flex-shrink-0">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <SparklesIcon className="w-5 h-5 text-orange-600" />
                  New Leads ({newHunterLeads.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0">
                {newHunterLeads.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <SparklesIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm">No new leads</p>
                  </div>
                ) : (
                  newHunterLeads.map((lead) => (
                    <div
                      key={lead.id}
                      onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium text-gray-900 truncate">{lead.concept_name}</p>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[lead.signal_strength]}`}>
                          {lead.signal_strength}
                        </span>
                      </div>
                      {lead.industry_segment && (
                        <p className="text-sm text-gray-500 truncate mt-1">{lead.industry_segment}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Recently Contacted Today */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col flex-1 min-h-0">
              <div className="px-4 py-3 border-b border-gray-200 bg-green-50 flex-shrink-0">
                <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                  <CheckCircleIcon className="w-5 h-5 text-green-600" />
                  Contacted Today ({recentlyContactedToday.length})
                </h3>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 min-h-0">
                {recentlyContactedToday.length === 0 ? (
                  <div className="p-6 text-center text-gray-500">
                    <CheckCircleIcon className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm">No contacts reached yet today</p>
                  </div>
                ) : (
                  recentlyContactedToday.map((contact) => (
                    <div
                      key={contact.id}
                      onClick={() => {
                        setDrawerOpen(true);
                        loadContactDetails(contact.id);
                      }}
                      className="px-4 py-3 hover:bg-gray-50 cursor-pointer"
                    >
                      <p className="font-medium text-gray-900 truncate">
                        {contact.first_name} {contact.last_name}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {contact.company || 'No company'}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Slide-out Drawer Backdrop */}
      {drawerOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 z-40 transition-opacity"
          onClick={closeDrawer}
        />
      )}

      {/* Slide-out Contact Drawer - 600px wide */}
      <div
        className={`fixed top-0 right-0 h-full w-[600px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          drawerOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {selectedContact ? (
          <div className="h-full flex flex-col">
            {/* Drawer Header - Contact Card */}
            <div className="p-5 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
              <div className="flex items-start justify-between mb-4">
                <button
                  onClick={closeDrawer}
                  className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingContact(!editingContact)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="Edit contact"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  {selectedContact.linked_in_profile_link && (
                    <a
                      href={selectedContact.linked_in_profile_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                      title="View LinkedIn"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  )}
                  {selectedContact.target?.website && (
                    <a
                      href={selectedContact.target.website.startsWith('http') ? selectedContact.target.website : `https://${selectedContact.target.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg"
                      title="Visit website"
                    >
                      <GlobeAltIcon className="w-4 h-4" />
                    </a>
                  )}
                </div>
              </div>

              {editingContact ? (
                /* Edit Form */
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
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="tel"
                      placeholder="Phone"
                      value={contactForm.phone || ''}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                    <input
                      type="tel"
                      placeholder="Mobile"
                      value={contactForm.mobile_phone || ''}
                      onChange={(e) => setContactForm({ ...contactForm, mobile_phone: e.target.value })}
                      className="px-3 py-2 text-sm border border-gray-300 rounded-lg"
                    />
                  </div>
                  <input
                    type="url"
                    placeholder="LinkedIn URL"
                    value={contactForm.linked_in_profile_link || ''}
                    onChange={(e) => setContactForm({ ...contactForm, linked_in_profile_link: e.target.value })}
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
                /* Contact Display */
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-14 h-14 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xl font-semibold">
                      {(selectedContact.first_name?.[0] || '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-900 truncate">
                          {selectedContact.first_name} {selectedContact.last_name}
                        </h2>
                        <a
                          href={`/contact/${selectedContact.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 text-gray-400 hover:text-orange-600"
                          title="Open full contact profile"
                        >
                          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        </a>
                      </div>
                      <p className="text-sm text-gray-600 truncate">
                        {selectedContact.title}{selectedContact.title && selectedContact.company ? ' at ' : ''}{selectedContact.company}
                      </p>
                    </div>
                    {selectedContact.target && (
                      <span className={`px-2 py-1 text-xs font-bold rounded-full border ${SIGNAL_COLORS[selectedContact.target.signal_strength]}`}>
                        {selectedContact.target.signal_strength}
                      </span>
                    )}
                  </div>

                  {/* Contact Info Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {selectedContact.email && (
                      <div className="flex items-center gap-2 text-gray-600 group/item">
                        <a href={`mailto:${selectedContact.email}`} className="flex items-center gap-2 hover:text-blue-600 truncate flex-1 min-w-0">
                          <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{selectedContact.email}</span>
                        </a>
                        <button
                          onClick={() => copyToClipboard(selectedContact.email!, 'email')}
                          className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
                          title="Copy email"
                        >
                          {copiedField === 'email' ? (
                            <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <ClipboardIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {selectedContact.phone && (
                      <div className="flex items-center gap-2 text-gray-600 group/item">
                        <a href={`tel:${selectedContact.phone}`} className="flex items-center gap-2 hover:text-gray-900 flex-1 min-w-0">
                          <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                          {selectedContact.phone}
                        </a>
                        <button
                          onClick={() => copyToClipboard(selectedContact.phone!, 'phone')}
                          className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
                          title="Copy phone"
                        >
                          {copiedField === 'phone' ? (
                            <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <ClipboardIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {selectedContact.mobile_phone && (
                      <div className="flex items-center gap-2 text-gray-600 group/item">
                        <a href={`tel:${selectedContact.mobile_phone}`} className="flex items-center gap-2 hover:text-gray-900 flex-1 min-w-0">
                          <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                          {selectedContact.mobile_phone} (M)
                        </a>
                        <button
                          onClick={() => copyToClipboard(selectedContact.mobile_phone!, 'mobile')}
                          className="p-1 text-gray-400 hover:text-gray-600 opacity-0 group-hover/item:opacity-100 transition-opacity flex-shrink-0"
                          title="Copy mobile"
                        >
                          {copiedField === 'mobile' ? (
                            <CheckIcon className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <ClipboardIcon className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {(selectedContact.mailing_city || selectedContact.mailing_state) && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPinIcon className="w-4 h-4 flex-shrink-0" />
                        {[selectedContact.mailing_city, selectedContact.mailing_state].filter(Boolean).join(', ')}
                      </div>
                    )}
                    {selectedContact.linked_in_profile_link && (
                      <a
                        href={selectedContact.linked_in_profile_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800"
                      >
                        <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                        </svg>
                        <span>LinkedIn Profile</span>
                      </a>
                    )}
                  </div>

                  {/* ZoomInfo Enrich Button */}
                  <button
                    onClick={searchZoomInfo}
                    disabled={zoomInfoLoading}
                    className="mt-3 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded transition-colors"
                    title="Search ZoomInfo for additional contact data"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    {zoomInfoLoading ? 'Searching ZoomInfo...' : 'Enrich with ZoomInfo'}
                  </button>
                </>
              )}
            </div>

            {!editingContact && (
              <>
                {/* Quick Actions */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  {/* Success feedback toast */}
                  {recentlyLogged && (
                    <div className="mb-3 px-3 py-2 bg-green-100 border border-green-300 text-green-800 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                      <CheckCircleIcon className="w-4 h-4" />
                      {ACTIVITY_CONFIG[recentlyLogged.type].label} logged successfully
                    </div>
                  )}

                  {/* Send Email - Primary action with call to action */}
                  <div className="mb-4">
                    <button
                      onClick={openEmailModal}
                      disabled={!selectedContact.email}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                      <EnvelopeIcon className="w-5 h-5" />
                      Compose & Send Email
                    </button>
                    {!selectedContact.email && (
                      <p className="text-xs text-gray-500 mt-1 text-center">No email address on file</p>
                    )}
                  </div>

                  {/* Log Activity Section - clearly labeled */}
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      Quick Log Activity
                    </p>
                    <div className="grid grid-cols-5 gap-2">
                      {/* Outreach activities */}
                      {OUTREACH_TYPES.filter(t => t !== 'email').map((type) => (
                        <button
                          key={type}
                          onClick={() => handleActivityClick(type)}
                          disabled={!!loggingActivity}
                          title={`Log ${ACTIVITY_CONFIG[type].label}`}
                          className={`flex flex-col items-center gap-1 p-2 text-xs rounded-lg transition-all ${
                            showActivityNoteInput === type
                              ? 'bg-blue-600 text-white ring-2 ring-blue-300'
                              : 'bg-white text-gray-600 border border-gray-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700'
                          } disabled:opacity-50`}
                        >
                          <ActivityIcon type={type} className="w-5 h-5" />
                          <span className="font-medium">{ACTIVITY_CONFIG[type].label}</span>
                        </button>
                      ))}
                      {/* Connection activities */}
                      {CONNECTION_TYPES.map((type) => (
                        <button
                          key={type}
                          onClick={() => handleActivityClick(type)}
                          disabled={!!loggingActivity}
                          title={`Log ${ACTIVITY_CONFIG[type].label}`}
                          className={`flex flex-col items-center gap-1 p-2 text-xs rounded-lg transition-all ${
                            showActivityNoteInput === type
                              ? 'bg-emerald-600 text-white ring-2 ring-emerald-300'
                              : 'bg-white text-gray-600 border border-gray-200 hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-700'
                          } disabled:opacity-50`}
                        >
                          <ActivityIcon type={type} className="w-5 h-5" />
                          <span className="font-medium">{ACTIVITY_CONFIG[type].label}</span>
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2 text-center">
                      Click to log activity to timeline
                    </p>
                  </div>

                  {/* Activity note input */}
                  {showActivityNoteInput && (
                    <div className="mt-3 p-3 bg-white border border-gray-300 rounded-lg shadow-sm">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        Logging {ACTIVITY_CONFIG[showActivityNoteInput].label}
                      </p>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={activityNote}
                          onChange={(e) => setActivityNote(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              logActivity(showActivityNoteInput, activityNote);
                            } else if (e.key === 'Escape') {
                              setShowActivityNoteInput(null);
                            }
                          }}
                          placeholder="Add optional note... (Enter to log)"
                          className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          autoFocus
                        />
                        <button
                          onClick={() => logActivity(showActivityNoteInput, activityNote)}
                          disabled={!!loggingActivity}
                          className="px-4 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 font-medium"
                        >
                          {loggingActivity ? 'Logging...' : 'Log'}
                        </button>
                        <button
                          onClick={() => setShowActivityNoteInput(null)}
                          className="p-2 text-gray-400 hover:text-gray-600"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Drawer Tabs */}
                <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
                  <button
                    onClick={() => setDrawerTab('activity')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      drawerTab === 'activity'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Activity Timeline
                  </button>
                  <button
                    onClick={() => setDrawerTab('emails')}
                    className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                      drawerTab === 'emails'
                        ? 'border-orange-500 text-orange-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    Email History
                  </button>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                  {drawerTab === 'activity' ? (
                    /* Activity Timeline Tab */
                    <>
                      <div className="flex-1 overflow-y-auto">
                        {loadingFeed ? (
                          <div className="p-8 text-center">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                          </div>
                        ) : activityFeed.filter(i => !i.hidden_from_timeline).length === 0 ? (
                          <div className="p-8 text-center text-gray-400">
                            <DocumentTextIcon className="w-12 h-12 mx-auto mb-2" />
                            <p className="font-medium">No activity yet</p>
                            <p className="text-sm mt-1">Log an activity or add a note</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {activityFeed.filter(i => !i.hidden_from_timeline).map((item) => (
                              <div key={item.id} className="p-4 hover:bg-gray-50 group">
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-full ${
                                    item.type === 'note' ? 'bg-gray-100 text-gray-600' :
                                    item.type === 'task' ? 'bg-slate-100 text-slate-600' :
                                    OUTREACH_TYPES.includes(item.type as OutreachType) ? 'bg-blue-100 text-blue-600' :
                                    'bg-emerald-100 text-emerald-600'
                                  }`}>
                                    <ActivityIcon type={item.type} className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className={`text-sm font-medium ${
                                        item.type === 'note' ? 'text-gray-700' :
                                        item.type === 'task' ? 'text-slate-700' :
                                        OUTREACH_TYPES.includes(item.type as OutreachType) ? 'text-blue-700' :
                                        'text-emerald-700'
                                      }`}>
                                        {item.type === 'note' ? 'Note' :
                                         item.source === 'contact_activity' && item.activity_type_name ? item.activity_type_name :
                                         ACTIVITY_CONFIG[item.type as ActivityType]?.label || item.type}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                                        {item.source !== 'contact_activity' && (
                                          <button
                                            onClick={() => deleteActivityItem(item)}
                                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                                            title={item.type === 'email' ? 'Hide from timeline' : 'Delete'}
                                          >
                                            <XMarkIcon className="w-4 h-4" />
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {(item.email_subject || item.subject) && (
                                      <p className="text-sm text-gray-800 font-medium mt-1">{item.email_subject || item.subject}</p>
                                    )}
                                    {item.content && (
                                      <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{item.content}</p>
                                    )}
                                    {item.source === 'contact_activity' && (
                                      <span className="inline-flex items-center mt-1 text-xs text-gray-400">
                                        from contact record
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Add Note Input */}
                      <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
                        <div className="flex items-end gap-2">
                          <textarea
                            value={newNoteText}
                            onChange={(e) => setNewNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                addNote();
                              }
                            }}
                            placeholder="Add a note... (Cmd+Enter to save)"
                            rows={2}
                            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          />
                          <button
                            onClick={addNote}
                            disabled={!newNoteText.trim() || addingNote}
                            className="p-2.5 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                          >
                            {addingNote ? (
                              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <PaperAirplaneIcon className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Email History Tab */
                    <div className="flex-1 overflow-y-auto">
                      {loadingFeed ? (
                        <div className="p-8 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                        </div>
                      ) : (
                        <>
                          {/* Filter to only show email activities */}
                          {activityFeed.filter(item => item.type === 'email').length === 0 ? (
                            <div className="p-8 text-center text-gray-400">
                              <EnvelopeIcon className="w-12 h-12 mx-auto mb-2" />
                              <p className="font-medium">No emails sent yet</p>
                              <p className="text-sm mt-1">Sent emails will appear here</p>
                            </div>
                          ) : (
                            <div className="divide-y divide-gray-100">
                              {activityFeed
                                .filter(item => item.type === 'email')
                                .map((item) => (
                                  <div key={item.id} className="p-4 hover:bg-gray-50 group">
                                    <div className="flex items-start gap-3">
                                      <div className="p-2 rounded-full bg-blue-100 text-blue-600">
                                        <EnvelopeIcon className="w-4 h-4" />
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between">
                                          <span className="text-sm font-medium text-blue-700">
                                            Email Sent
                                          </span>
                                          <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                                        </div>
                                        {item.email_subject && (
                                          <p className="text-sm text-gray-800 font-medium mt-1">{item.email_subject}</p>
                                        )}
                                        {item.content && (
                                          <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{item.content}</p>
                                        )}
                                        <p className="text-xs text-gray-400 mt-2">
                                          Email thread viewing coming soon
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Complete Task Button */}
                {selectedTask && (
                  <div className="p-4 border-t border-gray-200 bg-gray-50">
                    <button
                      onClick={() => completeTask(selectedTask.id)}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                    >
                      <CheckIcon className="w-5 h-5" />
                      Complete Task
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="h-full flex flex-col items-center justify-center p-8 text-gray-500">
            <BuildingOffice2Icon className="w-16 h-16 text-gray-300 mb-4" />
            <p className="text-lg font-medium text-gray-700">No contact selected</p>
          </div>
        )}
      </div>

      {/* Email Compose Panel - Positioned to leave drawer visible */}
      {showEmailModal && selectedContact && (
        <>
          {/* Semi-transparent backdrop that doesn't cover the drawer */}
          <div
            className="fixed inset-0 bg-black bg-opacity-30 z-[55]"
            style={{ right: '620px' }}
            onClick={() => setShowEmailModal(false)}
          />
          {/* Compact email composer positioned to the left of the drawer */}
          <div
            className="fixed top-4 bottom-4 left-4 bg-white rounded-xl shadow-2xl z-[55] flex flex-col overflow-hidden"
            style={{ right: '640px', minWidth: '500px' }}
          >
            {/* Modal Header - More compact */}
            <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-semibold text-gray-900">Compose Email</h3>
                <p className="text-xs text-gray-500 truncate">
                  To: {selectedContact.first_name} {selectedContact.last_name} &lt;{selectedContact.email}&gt;
                </p>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg ml-2"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - More compact spacing */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Template selector + Settings link */}
              <div className="flex gap-2">
                {emailTemplates.length > 0 ? (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
                  >
                    <option value="">Select a template...</option>
                    {emailTemplates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}{t.category ? ` (${t.category})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Link
                    to="/hunter/settings"
                    className="flex-1 px-3 py-1.5 text-sm text-gray-500 border border-gray-300 border-dashed rounded-lg hover:bg-gray-50 text-center"
                  >
                    + Create email templates
                  </Link>
                )}
                <Link
                  to="/hunter/settings"
                  className="px-2 py-1.5 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
                  title="Manage templates & signature"
                >
                  <Cog6ToothIcon className="w-4 h-4" />
                </Link>
              </div>

              {/* Subject */}
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />

              {/* Rich Text Editor - Smaller */}
              <div className="border border-gray-300 rounded-lg overflow-hidden bg-white flex-1" style={{ minHeight: '200px' }}>
                <Suspense fallback={<div className="h-48 flex items-center justify-center text-gray-400">Loading editor...</div>}>
                  <ReactQuill
                    theme="snow"
                    value={emailBody}
                    onChange={setEmailBody}
                    modules={quillModules}
                    formats={quillFormats}
                    style={{ height: '180px' }}
                  />
                </Suspense>
              </div>

              {/* Attachments */}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-1.5">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileAttachment}
                    className="sr-only"
                  />
                  <PaperClipIcon className="w-4 h-4" />
                  Attach
                </label>
                {emailAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 flex-1">
                    {emailAttachments.map((att, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs"
                      >
                        {att.filename}
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <XMarkIcon className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer - More compact */}
            <div className="px-4 py-3 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-xs text-gray-500">
                {!emailSignature && (
                  <Link to="/hunter/settings" className="text-blue-600 hover:underline">
                    Add signature
                  </Link>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendEmail}
                  disabled={sendingEmail || !emailSubject.trim() || !emailBody.replace(/<[^>]*>/g, '').trim() || !selectedContact?.email}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendingEmail ? (
                    <>
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="w-4 h-4" />
                      Send
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

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
                  <p className="text-sm text-gray-500">Search for a contact</p>
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
                  <div className="p-4 text-center text-gray-500">No contacts found</div>
                ) : (
                  <div className="p-4 text-center text-gray-500">Type at least 2 characters to search</div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Find Contact Modal - opens drawer directly */}
      {showFindContactModal && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={() => {
            setShowFindContactModal(false);
            setFindContactSearch('');
            setFindContactResults([]);
          }} />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[80vh] flex flex-col">
              <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">Find Contact</h3>
                  <p className="text-sm text-gray-500">Search for any contact to view details or log activity</p>
                </div>
                <button
                  onClick={() => {
                    setShowFindContactModal(false);
                    setFindContactSearch('');
                    setFindContactResults([]);
                  }}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <XMarkIcon className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="p-4">
                <input
                  type="text"
                  value={findContactSearch}
                  onChange={(e) => setFindContactSearch(e.target.value)}
                  placeholder="Search by name, company, or email..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  autoFocus
                />
              </div>

              <div className="flex-1 overflow-y-auto border-t border-gray-100">
                {searchingFindContact ? (
                  <div className="p-4 text-center text-gray-500">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mx-auto"></div>
                  </div>
                ) : findContactResults.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {findContactResults.map((contact) => (
                      <button
                        key={contact.id}
                        onClick={() => openContactInDrawer(contact)}
                        className="w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-gray-900">
                              {contact.first_name} {contact.last_name}
                            </p>
                            <p className="text-sm text-gray-500">
                              {contact.title ? `${contact.title} at ` : ''}{contact.company || contact.email || 'No company'}
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
                ) : findContactSearch.length >= 2 ? (
                  <div className="p-4 text-center text-gray-500">No contacts found</div>
                ) : (
                  <div className="p-4 text-center text-gray-500">Type at least 2 characters to search</div>
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

      {/* ZoomInfo Enrichment Modal */}
      {showZoomInfoModal && selectedContact && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-[70]"
            onClick={() => {
              setShowZoomInfoModal(false);
              setZoomInfoMatches([]);
              setSelectedZoomInfoMatch(null);
              setZoomInfoError(null);
            }}
          />
          <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden">
              {/* Modal Header */}
              <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-purple-50 to-indigo-50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <SparklesIcon className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">ZoomInfo Enrichment</h3>
                    <p className="text-sm text-gray-500">
                      {selectedContact.first_name} {selectedContact.last_name}
                      {selectedContact.company ? ` at ${selectedContact.company}` : ''}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowZoomInfoModal(false);
                    setZoomInfoMatches([]);
                    setSelectedZoomInfoMatch(null);
                    setZoomInfoError(null);
                  }}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="flex-1 overflow-y-auto">
                {zoomInfoLoading ? (
                  <div className="p-12 text-center">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    <p className="text-gray-600">Searching ZoomInfo...</p>
                    <p className="text-sm text-gray-400 mt-1">This may take a few seconds</p>
                  </div>
                ) : zoomInfoError ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <XMarkIcon className="w-6 h-6 text-red-600" />
                    </div>
                    <p className="text-gray-900 font-medium">Search Failed</p>
                    <p className="text-sm text-red-600 mt-2">{zoomInfoError}</p>
                    <button
                      onClick={searchZoomInfo}
                      className="mt-4 px-4 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                    >
                      Try Again
                    </button>
                  </div>
                ) : zoomInfoMatches.length === 0 ? (
                  <div className="p-8 text-center">
                    <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <SparklesIcon className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-medium">No Matches Found</p>
                    <p className="text-sm text-gray-500 mt-2">
                      ZoomInfo did not find any profiles matching this contact
                    </p>
                  </div>
                ) : !selectedZoomInfoMatch ? (
                  /* Match Selection View */
                  <div className="p-4">
                    <p className="text-sm text-gray-600 mb-4">
                      Found {zoomInfoMatches.length} potential match{zoomInfoMatches.length !== 1 ? 'es' : ''}. Select the correct profile:
                    </p>
                    <div className="space-y-3">
                      {zoomInfoMatches.map((match, idx) => (
                        <button
                          key={match.zoominfo_person_id}
                          onClick={() => selectZoomInfoMatch(match)}
                          className="w-full text-left p-4 border border-gray-200 rounded-lg hover:border-purple-300 hover:bg-purple-50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-medium text-gray-900">
                                {match.first_name} {match.last_name}
                              </p>
                              <p className="text-sm text-gray-600">
                                {match.title}{match.title && match.company ? ' at ' : ''}{match.company}
                              </p>
                              {match.email && (
                                <p className="text-sm text-gray-500 mt-1">{match.email}</p>
                              )}
                              {(match.city || match.state) && (
                                <p className="text-xs text-gray-400 mt-1">
                                  {[match.city, match.state, match.country].filter(Boolean).join(', ')}
                                </p>
                              )}
                            </div>
                            <span className="text-xs text-gray-400">#{idx + 1}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  /* Field Selection View */
                  <div className="p-4">
                    <div className="mb-4 p-3 bg-purple-50 border border-purple-100 rounded-lg">
                      <p className="text-sm font-medium text-purple-900">
                        Selected: {selectedZoomInfoMatch.first_name} {selectedZoomInfoMatch.last_name}
                        {selectedZoomInfoMatch.company ? ` at ${selectedZoomInfoMatch.company}` : ''}
                      </p>
                      <button
                        onClick={() => setSelectedZoomInfoMatch(null)}
                        className="text-sm text-purple-600 hover:text-purple-800 underline mt-1"
                      >
                        Choose different match
                      </button>
                    </div>

                    <p className="text-sm text-gray-600 mb-4">
                      Select which fields to update on your contact:
                    </p>

                    <div className="space-y-3">
                      {/* Email */}
                      {selectedZoomInfoMatch.email && (
                        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={zoomInfoFieldSelections.email || false}
                            onChange={(e) => setZoomInfoFieldSelections(prev => ({ ...prev, email: e.target.checked }))}
                            className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">Email</p>
                            <p className="text-sm text-green-600">{selectedZoomInfoMatch.email}</p>
                            {selectedContact?.email && selectedContact.email !== selectedZoomInfoMatch.email && (
                              <p className="text-xs text-gray-400 mt-1">Current: {selectedContact.email}</p>
                            )}
                          </div>
                        </label>
                      )}

                      {/* Phone */}
                      {selectedZoomInfoMatch.phone && (
                        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={zoomInfoFieldSelections.phone || false}
                            onChange={(e) => setZoomInfoFieldSelections(prev => ({ ...prev, phone: e.target.checked }))}
                            className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">Phone</p>
                            <p className="text-sm text-green-600">{selectedZoomInfoMatch.phone}</p>
                            {selectedContact?.phone && selectedContact.phone !== selectedZoomInfoMatch.phone && (
                              <p className="text-xs text-gray-400 mt-1">Current: {selectedContact.phone}</p>
                            )}
                          </div>
                        </label>
                      )}

                      {/* Mobile Phone */}
                      {selectedZoomInfoMatch.mobile_phone && (
                        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={zoomInfoFieldSelections.mobile_phone || false}
                            onChange={(e) => setZoomInfoFieldSelections(prev => ({ ...prev, mobile_phone: e.target.checked }))}
                            className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">Mobile Phone</p>
                            <p className="text-sm text-green-600">{selectedZoomInfoMatch.mobile_phone}</p>
                            {selectedContact?.mobile_phone && selectedContact.mobile_phone !== selectedZoomInfoMatch.mobile_phone && (
                              <p className="text-xs text-gray-400 mt-1">Current: {selectedContact.mobile_phone}</p>
                            )}
                          </div>
                        </label>
                      )}

                      {/* Title */}
                      {selectedZoomInfoMatch.title && (
                        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={zoomInfoFieldSelections.title || false}
                            onChange={(e) => setZoomInfoFieldSelections(prev => ({ ...prev, title: e.target.checked }))}
                            className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">Title</p>
                            <p className="text-sm text-green-600">{selectedZoomInfoMatch.title}</p>
                            {selectedContact?.title && selectedContact.title !== selectedZoomInfoMatch.title && (
                              <p className="text-xs text-gray-400 mt-1">Current: {selectedContact.title}</p>
                            )}
                          </div>
                        </label>
                      )}

                      {/* LinkedIn */}
                      {selectedZoomInfoMatch.linkedin_url && (
                        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={zoomInfoFieldSelections.linkedin_url || false}
                            onChange={(e) => setZoomInfoFieldSelections(prev => ({ ...prev, linkedin_url: e.target.checked }))}
                            className="mt-1 h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900">LinkedIn Profile</p>
                            <a
                              href={selectedZoomInfoMatch.linkedin_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-sm text-blue-600 hover:underline truncate block"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {selectedZoomInfoMatch.linkedin_url}
                            </a>
                            {selectedContact?.linked_in_profile_link && selectedContact.linked_in_profile_link !== selectedZoomInfoMatch.linkedin_url && (
                              <p className="text-xs text-gray-400 mt-1 truncate">Current: {selectedContact.linked_in_profile_link}</p>
                            )}
                          </div>
                        </label>
                      )}

                      {/* ZoomInfo Profile URL - Always included */}
                      <div className="flex items-start gap-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <CheckIcon className="w-5 h-5 text-purple-600 mt-0.5" />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900">ZoomInfo Profile Link</p>
                          <a
                            href={selectedZoomInfoMatch.zoominfo_profile_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-purple-600 hover:underline"
                          >
                            View in ZoomInfo
                          </a>
                          <p className="text-xs text-gray-500 mt-1">Always saved for future reference</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              {selectedZoomInfoMatch && (
                <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
                  <button
                    onClick={() => {
                      setShowZoomInfoModal(false);
                      setZoomInfoMatches([]);
                      setSelectedZoomInfoMatch(null);
                    }}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={applyZoomInfoData}
                    disabled={applyingZoomInfo}
                    className="flex items-center gap-2 px-6 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                  >
                    {applyingZoomInfo ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        Applying...
                      </>
                    ) : (
                      <>
                        <CheckIcon className="w-4 h-4" />
                        Apply Selected Fields
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
