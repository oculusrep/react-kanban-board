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
  PlusCircleIcon
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
  type: 'note' | 'email' | 'linkedin' | 'sms' | 'voicemail' | 'call' | 'meeting';
  content: string | null; // Note content or activity notes
  email_subject?: string | null;
  created_at: string;
  created_by?: string;
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

// Activity type definitions
const OUTREACH_TYPES = ['email', 'linkedin', 'sms', 'voicemail'] as const;
const CONNECTION_TYPES = ['call', 'meeting'] as const;
type OutreachType = typeof OUTREACH_TYPES[number];
type ConnectionType = typeof CONNECTION_TYPES[number];
type ActivityType = OutreachType | ConnectionType;

const ACTIVITY_CONFIG: Record<ActivityType, { label: string; icon: string; color: string }> = {
  email: { label: 'Email', icon: 'envelope', color: 'blue' },
  linkedin: { label: 'LinkedIn', icon: 'linkedin', color: 'indigo' },
  sms: { label: 'SMS', icon: 'chat', color: 'green' },
  voicemail: { label: 'VM', icon: 'phone', color: 'yellow' },
  call: { label: 'Call', icon: 'phone-solid', color: 'emerald' },
  meeting: { label: 'Meeting', icon: 'users', color: 'purple' },
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

  // Multi-select and date change
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [editingDateTaskId, setEditingDateTaskId] = useState<string | null>(null);
  const [bulkNewDate, setBulkNewDate] = useState('');

  // ============================================================================
  // Data Fetching
  // ============================================================================

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      const todayStart = `${today}T00:00:00`;
      const todayEnd = `${today}T23:59:59`;
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
  const loadActivityFeed = useCallback(async (contactId: string) => {
    setLoadingFeed(true);
    try {
      // Fetch activities
      const { data: activities } = await supabase
        .from('prospecting_activity')
        .select('id, activity_type, notes, email_subject, created_at, created_by')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      // Fetch notes
      const { data: notes } = await supabase
        .from('prospecting_note')
        .select('id, content, created_at, created_by')
        .eq('contact_id', contactId)
        .order('created_at', { ascending: false });

      // Combine and sort chronologically
      const feedItems: ActivityFeedItem[] = [
        ...(activities || []).map(a => ({
          id: a.id,
          type: a.activity_type as ActivityFeedItem['type'],
          content: a.notes,
          email_subject: a.email_subject,
          created_at: a.created_at,
          created_by: a.created_by
        })),
        ...(notes || []).map(n => ({
          id: n.id,
          type: 'note' as const,
          content: n.content,
          created_at: n.created_at,
          created_by: n.created_by
        }))
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
    loadActivityFeed(contactId);
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
    try {
      const table = item.type === 'note' ? 'prospecting_note' : 'prospecting_activity';
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

      // Send via Gmail
      const response = await supabase.functions.invoke('hunter-send-outreach', {
        body: {
          outreach_id: outreach.id,
          user_email: user.email,
          to: [selectedContact.email],
          subject: emailSubject,
          body_html: emailBody,
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
          closeDrawer();
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
        {/* Stats Row */}
        <div className="grid grid-cols-4 gap-4 mb-4 flex-shrink-0">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-blue-600">{followUpsDue.length}</p>
            <p className="text-sm text-gray-500">Due Today</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-red-600">{overdueFollowUps.length}</p>
            <p className="text-sm text-gray-500">Overdue</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-green-600">{overdueFollowUps.length + followUpsDue.length}</p>
            <p className="text-sm text-gray-500">Total Tasks</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
            <p className="text-3xl font-bold text-orange-600">{newHunterLeads.length}</p>
            <p className="text-sm text-gray-500">New Leads</p>
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex gap-2 mb-4 flex-shrink-0">
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
                Call List ({overdueFollowUps.length + followUpsDue.length})
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
              ) : (
                <div className="divide-y divide-gray-100">
                  {/* Overdue tasks */}
                  {overdueFollowUps.map((task) => {
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
                  {overdueFollowUps.length > 0 && followUpsDue.length > 0 && (
                    <div className="px-4 py-2 bg-blue-50 text-sm font-medium text-blue-700 border-y border-blue-100">
                      Due Today
                    </div>
                  )}

                  {/* Due today tasks */}
                  {followUpsDue.map((task) => (
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

          {/* New Leads Column */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col min-h-0">
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
                      <h2 className="text-xl font-bold text-gray-900 truncate">
                        {selectedContact.first_name} {selectedContact.last_name}
                      </h2>
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
                      <a href={`mailto:${selectedContact.email}`} className="flex items-center gap-2 text-gray-600 hover:text-blue-600 truncate">
                        <EnvelopeIcon className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">{selectedContact.email}</span>
                      </a>
                    )}
                    {selectedContact.phone && (
                      <a href={`tel:${selectedContact.phone}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                        <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                        {selectedContact.phone}
                      </a>
                    )}
                    {selectedContact.mobile_phone && (
                      <a href={`tel:${selectedContact.mobile_phone}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
                        <PhoneIcon className="w-4 h-4 flex-shrink-0" />
                        {selectedContact.mobile_phone} (M)
                      </a>
                    )}
                    {(selectedContact.mailing_city || selectedContact.mailing_state) && (
                      <div className="flex items-center gap-2 text-gray-600">
                        <MapPinIcon className="w-4 h-4 flex-shrink-0" />
                        {[selectedContact.mailing_city, selectedContact.mailing_state].filter(Boolean).join(', ')}
                      </div>
                    )}
                  </div>
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
                        ) : activityFeed.length === 0 ? (
                          <div className="p-8 text-center text-gray-400">
                            <DocumentTextIcon className="w-12 h-12 mx-auto mb-2" />
                            <p className="font-medium">No activity yet</p>
                            <p className="text-sm mt-1">Log an activity or add a note</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {activityFeed.map((item) => (
                              <div key={item.id} className="p-4 hover:bg-gray-50 group">
                                <div className="flex items-start gap-3">
                                  <div className={`p-2 rounded-full ${
                                    item.type === 'note' ? 'bg-gray-100 text-gray-600' :
                                    OUTREACH_TYPES.includes(item.type as OutreachType) ? 'bg-blue-100 text-blue-600' :
                                    'bg-emerald-100 text-emerald-600'
                                  }`}>
                                    <ActivityIcon type={item.type} className="w-4 h-4" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center justify-between">
                                      <span className={`text-sm font-medium ${
                                        item.type === 'note' ? 'text-gray-700' :
                                        OUTREACH_TYPES.includes(item.type as OutreachType) ? 'text-blue-700' :
                                        'text-emerald-700'
                                      }`}>
                                        {item.type === 'note' ? 'Note' : ACTIVITY_CONFIG[item.type as ActivityType]?.label || item.type}
                                      </span>
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                                        <button
                                          onClick={() => deleteActivityItem(item)}
                                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500 transition-opacity"
                                        >
                                          <XMarkIcon className="w-4 h-4" />
                                        </button>
                                      </div>
                                    </div>
                                    {item.email_subject && (
                                      <p className="text-sm text-gray-800 font-medium mt-1">{item.email_subject}</p>
                                    )}
                                    {item.content && (
                                      <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{item.content}</p>
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

      {/* Email Compose Modal */}
      {showEmailModal && selectedContact && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={() => setShowEmailModal(false)} />
          <div className="fixed inset-4 md:inset-x-20 md:inset-y-8 bg-white rounded-xl shadow-2xl z-[60] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Compose Email</h3>
                <p className="text-sm text-gray-500">
                  To: {selectedContact.first_name} {selectedContact.last_name} &lt;{selectedContact.email}&gt;
                </p>
              </div>
              <button
                onClick={() => setShowEmailModal(false)}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Template selector + Settings link */}
              <div className="flex gap-2">
                {emailTemplates.length > 0 ? (
                  <select
                    value={selectedTemplate}
                    onChange={(e) => handleTemplateSelect(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg"
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
                    className="flex-1 px-3 py-2 text-sm text-gray-500 border border-gray-300 border-dashed rounded-lg hover:bg-gray-50 text-center"
                  >
                    + Create email templates
                  </Link>
                )}
                <Link
                  to="/hunter/settings"
                  className="px-3 py-2 text-gray-500 hover:text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100"
                  title="Manage templates & signature"
                >
                  <Cog6ToothIcon className="w-5 h-5" />
                </Link>
              </div>

              {/* Subject */}
              <input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Subject"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg text-base"
              />

              {/* Rich Text Editor */}
              <div className="border border-gray-300 rounded-lg overflow-hidden bg-white" style={{ minHeight: '300px' }}>
                <Suspense fallback={<div className="h-72 flex items-center justify-center text-gray-400">Loading editor...</div>}>
                  <ReactQuill
                    theme="snow"
                    value={emailBody}
                    onChange={setEmailBody}
                    modules={quillModules}
                    formats={quillFormats}
                    style={{ height: '250px' }}
                  />
                </Suspense>
              </div>

              {/* Attachments */}
              <div className="flex items-center gap-2">
                <label className="cursor-pointer px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-2">
                  <input
                    type="file"
                    multiple
                    onChange={handleFileAttachment}
                    className="sr-only"
                  />
                  <PaperClipIcon className="w-4 h-4" />
                  Attach Files
                </label>
                {emailAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 flex-1">
                    {emailAttachments.map((att, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 rounded text-sm"
                      >
                        {att.filename}
                        <button
                          onClick={() => removeAttachment(idx)}
                          className="text-gray-400 hover:text-red-500"
                        >
                          <XMarkIcon className="w-4 h-4" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
              <div className="text-sm text-gray-500">
                {!emailSignature && (
                  <Link to="/hunter/settings" className="text-blue-600 hover:underline">
                    Add email signature
                  </Link>
                )}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowEmailModal(false)}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={sendEmail}
                  disabled={sendingEmail || !emailSubject.trim() || !emailBody.replace(/<[^>]*>/g, '').trim() || !selectedContact?.email}
                  className="flex items-center gap-2 px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {sendingEmail ? (
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
