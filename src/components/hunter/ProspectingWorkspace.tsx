// Prospecting Workspace - Full prospecting command center
// Shows follow-ups due with contact details panel for quick action
// src/components/hunter/ProspectingWorkspace.tsx

import { useEffect, useState, useCallback, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
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
  MapPinIcon,
  PaperAirplaneIcon,
  ArrowUturnLeftIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  DocumentTextIcon,
  CalendarIcon,
  Cog6ToothIcon,
  PaperClipIcon
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

  // Selected task and contact panel
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

  // New note input
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Email compose
  const [showEmailCompose, setShowEmailCompose] = useState(false);
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
  const [showBulkDatePicker, setShowBulkDatePicker] = useState(false);
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
    setShowEmailCompose(false);
    setShowActivityNoteInput(null);
    if (task.contact_id) {
      loadContactDetails(task.contact_id);
    } else if (task.contact?.id) {
      loadContactDetails(task.contact.id);
    } else {
      setSelectedContact(null);
      setActivityFeed([]);
    }
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

      // Send via Gmail (attachments currently not supported by edge function)
      const response = await supabase.functions.invoke('hunter-send-outreach', {
        body: {
          outreach_id: outreach.id,
          user_email: user.email,
          to: [selectedContact.email],
          subject: emailSubject,
          body_html: emailBody, // Already HTML from ReactQuill
          body_text: emailBody.replace(/<[^>]*>/g, ''), // Strip HTML tags for plain text
          attachments: emailAttachments.length > 0 ? emailAttachments : undefined
        }
      });

      if (response.error) throw new Error(response.error.message);

      // Log as email activity
      await logActivity('email', `Sent: "${emailSubject}"`);

      setShowEmailCompose(false);
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
          setSelectedTask(null);
          setSelectedContact(null);
          setActivityFeed([]);
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
      setShowBulkDatePicker(false);
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
    <div className="flex gap-4 h-[calc(100vh-220px)]">
      {/* Left side: Task lists - narrower */}
      <div className="w-[360px] flex-shrink-0 space-y-4 overflow-y-auto">
        {/* Stats Row - more compact */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 text-center">
            <p className="text-xl font-bold text-blue-600">{followUpsDue.length}</p>
            <p className="text-xs text-gray-500">Today</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 text-center">
            <p className="text-xl font-bold text-red-600">{overdueFollowUps.length}</p>
            <p className="text-xs text-gray-500">Overdue</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-2 text-center">
            <p className="text-xl font-bold text-orange-600">{newHunterLeads.length}</p>
            <p className="text-xs text-gray-500">Leads</p>
          </div>
        </div>

        {/* Action buttons row */}
        <div className="flex gap-2">
          <button
            onClick={() => setShowNewFollowUpModal(true)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm"
          >
            <CalendarDaysIcon className="w-4 h-4" />
            New Follow-up
          </button>
          <button
            onClick={fetchData}
            className="px-3 py-2 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
          >
            <ArrowPathIcon className="w-4 h-4 text-gray-500" />
          </button>
        </div>

        {/* Combined Task List - Due Today + Overdue */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-1 flex flex-col min-h-0">
          <div className="px-3 py-2 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
            <h3 className="font-medium text-gray-900 text-sm flex items-center gap-2">
              <CalendarDaysIcon className="w-4 h-4 text-orange-600" />
              Follow-ups ({overdueFollowUps.length + followUpsDue.length})
            </h3>
            {(overdueFollowUps.length + followUpsDue.length) > 0 && (
              <button
                onClick={() => {
                  const allTasks = [...overdueFollowUps, ...followUpsDue];
                  toggleSelectAll(allTasks, !allTasks.every(t => selectedTaskIds.has(t.id)));
                }}
                className="text-xs text-orange-600 hover:text-orange-800"
              >
                {[...overdueFollowUps, ...followUpsDue].every(t => selectedTaskIds.has(t.id)) ? 'Deselect All' : 'Select All'}
              </button>
            )}
          </div>

          {/* Bulk date change bar - shows when tasks selected */}
          {selectedTaskIds.size > 0 && (
            <div className="px-3 py-2 bg-orange-50 border-b border-orange-200 flex items-center gap-2">
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

          <div className="divide-y divide-gray-100 flex-1 overflow-y-auto">
            {(overdueFollowUps.length + followUpsDue.length) === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <CheckCircleIcon className="w-8 h-8 mx-auto text-green-400 mb-1" />
                <p>All caught up!</p>
              </div>
            ) : (
              <>
                {/* Overdue tasks first - sorted oldest first */}
                {overdueFollowUps.map((task) => {
                  const daysOver = getDaysOverdue(task.activity_date);
                  return (
                    <div
                      key={task.id}
                      onClick={() => handleTaskSelect(task)}
                      className={`px-3 py-2 cursor-pointer transition-colors group ${
                        selectedTask?.id === task.id ? 'bg-orange-50 border-l-2 border-orange-500' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={selectedTaskIds.has(task.id)}
                          onChange={(e) => toggleTaskSelection(task.id, e as unknown as React.MouseEvent)}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900 text-sm truncate flex-1">
                              {getContactName(task.contact)}
                            </p>
                            <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded font-medium">
                              {daysOver}d overdue
                            </span>
                          </div>
                          <p className="text-xs text-gray-500 truncate">
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
                            className="text-xs border border-gray-300 rounded px-1 py-0.5"
                          />
                        ) : (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDateTaskId(task.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
                            title="Change date"
                          >
                            <CalendarIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Today divider */}
                {overdueFollowUps.length > 0 && followUpsDue.length > 0 && (
                  <div className="px-3 py-1.5 bg-blue-50 text-xs font-medium text-blue-700 border-y border-blue-100">
                    Due Today
                  </div>
                )}

                {/* Due today tasks */}
                {followUpsDue.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => handleTaskSelect(task)}
                    className={`px-3 py-2 cursor-pointer transition-colors group ${
                      selectedTask?.id === task.id ? 'bg-orange-50 border-l-2 border-orange-500' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedTaskIds.has(task.id)}
                        onChange={(e) => toggleTaskSelection(task.id, e as unknown as React.MouseEvent)}
                        onClick={(e) => e.stopPropagation()}
                        className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">
                          {getContactName(task.contact)}
                        </p>
                        <p className="text-xs text-gray-500 truncate">
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
                          className="text-xs border border-gray-300 rounded px-1 py-0.5"
                        />
                      ) : (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingDateTaskId(task.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-gray-600 transition-opacity"
                          title="Change date"
                        >
                          <CalendarIcon className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>

        {/* New Leads - collapsible, at bottom */}
        {newHunterLeads.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 flex-shrink-0">
            <div className="px-3 py-2 border-b border-gray-200 bg-orange-50">
              <h3 className="font-medium text-gray-900 text-sm flex items-center gap-2">
                <SparklesIcon className="w-4 h-4 text-orange-600" />
                New Leads ({newHunterLeads.length})
              </h3>
            </div>
            <div className="divide-y divide-gray-100 max-h-[120px] overflow-y-auto">
              {newHunterLeads.map((lead) => (
                <div
                  key={lead.id}
                  onClick={() => navigate(`/hunter/lead/${lead.id}`)}
                  className="px-3 py-1.5 hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-gray-900 text-sm truncate flex-1">{lead.concept_name}</p>
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded border ${SIGNAL_COLORS[lead.signal_strength]}`}>
                      {lead.signal_strength}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Right side: Contact panel - wider */}
      <div className="flex-1 bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col">
        {selectedContact ? (
          <>
            {/* Contact Header */}
            <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-semibold text-gray-900">
                      {selectedContact.first_name} {selectedContact.last_name}
                    </h2>
                    {selectedContact.target && (
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[selectedContact.target.signal_strength]}`}>
                        {selectedContact.target.signal_strength}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-sm text-gray-600">
                    {selectedContact.title && <span>{selectedContact.title}</span>}
                    {selectedContact.title && selectedContact.company && <span>•</span>}
                    {selectedContact.company && <span className="font-medium">{selectedContact.company}</span>}
                  </div>
                  {/* Quick contact info */}
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    {selectedContact.email && (
                      <a href={`mailto:${selectedContact.email}`} className="text-blue-600 hover:underline flex items-center gap-1">
                        <EnvelopeIcon className="w-3 h-3" />
                        {selectedContact.email}
                      </a>
                    )}
                    {selectedContact.phone && (
                      <a href={`tel:${selectedContact.phone}`} className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
                        <PhoneIcon className="w-3 h-3" />
                        {selectedContact.phone}
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingContact(!editingContact)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                  {selectedContact.linked_in_profile_link && (
                    <a
                      href={selectedContact.linked_in_profile_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                      </svg>
                    </a>
                  )}
                </div>
              </div>

              {/* Activity Buttons - Compact pills */}
              {!editingContact && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {/* Outreach buttons - blue tones */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 mr-1">Outreach:</span>
                    {OUTREACH_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => handleActivityClick(type)}
                        disabled={!!loggingActivity}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                          showActivityNoteInput === type
                            ? 'bg-blue-600 text-white'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                        } disabled:opacity-50`}
                      >
                        <ActivityIcon type={type} className="w-3 h-3" />
                        {ACTIVITY_CONFIG[type].label}
                      </button>
                    ))}
                  </div>
                  {/* Connection buttons - green tones */}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-500 mr-1">Connect:</span>
                    {CONNECTION_TYPES.map((type) => (
                      <button
                        key={type}
                        onClick={() => handleActivityClick(type)}
                        disabled={!!loggingActivity}
                        className={`flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full transition-colors ${
                          showActivityNoteInput === type
                            ? 'bg-emerald-600 text-white'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
                        } disabled:opacity-50`}
                      >
                        <ActivityIcon type={type} className="w-3 h-3" />
                        {ACTIVITY_CONFIG[type].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity note input - shows when button is clicked */}
              {showActivityNoteInput && (
                <div className="mt-3 flex items-center gap-2">
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
                    placeholder={`Add note for ${ACTIVITY_CONFIG[showActivityNoteInput].label}... (Enter to log, Esc to cancel)`}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    autoFocus
                  />
                  <button
                    onClick={() => logActivity(showActivityNoteInput, activityNote)}
                    disabled={!!loggingActivity}
                    className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
                  >
                    {loggingActivity ? 'Logging...' : 'Log'}
                  </button>
                  <button
                    onClick={() => setShowActivityNoteInput(null)}
                    className="p-1.5 text-gray-400 hover:text-gray-600"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Main content area */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {editingContact ? (
                /* Edit Form */
                <div className="p-4 space-y-3 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-3">
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
                  <div className="grid grid-cols-2 gap-3">
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
                <>
                  {/* Email Compose Section - Expandable */}
                  <div className="border-b border-gray-200">
                    <button
                      onClick={() => {
                        setShowEmailCompose(!showEmailCompose);
                        if (!showEmailCompose && selectedContact) {
                          setEmailSubject(`Following up - ${selectedContact.company || `${selectedContact.first_name} ${selectedContact.last_name}`}`);
                          // Initialize with greeting and signature
                          let initialBody = `<p>Hi ${selectedContact.first_name || 'there'},</p><p><br></p><p><br></p><p>Best regards</p>`;
                          if (emailSignature?.signature_html) {
                            initialBody += '<br>' + emailSignature.signature_html;
                          }
                          setEmailBody(initialBody);
                          setEmailAttachments([]);
                        }
                      }}
                      className="w-full px-4 py-2 flex items-center justify-between text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <PaperAirplaneIcon className="w-4 h-4 text-blue-600" />
                        Compose Email
                      </div>
                      {showEmailCompose ? (
                        <ChevronUpIcon className="w-4 h-4" />
                      ) : (
                        <ChevronDownIcon className="w-4 h-4" />
                      )}
                    </button>

                    {showEmailCompose && (
                      <div className="p-4 border-t border-gray-100 bg-gray-50 space-y-3">
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
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg"
                        />

                        {/* Rich Text Editor */}
                        <div className="border border-gray-300 rounded-lg overflow-hidden bg-white">
                          <Suspense fallback={<div className="h-48 flex items-center justify-center text-gray-400">Loading editor...</div>}>
                            <ReactQuill
                              theme="snow"
                              value={emailBody}
                              onChange={setEmailBody}
                              modules={quillModules}
                              formats={quillFormats}
                              style={{ height: '200px' }}
                            />
                          </Suspense>
                        </div>

                        {/* Attachments */}
                        <div className="flex items-center gap-2 pt-2">
                          <label className="cursor-pointer px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-100 flex items-center gap-1">
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
                            <div className="flex flex-wrap gap-1 flex-1">
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

                        {/* Send buttons */}
                        <div className="flex justify-between items-center pt-2">
                          <div className="text-xs text-gray-400">
                            {!emailSignature && (
                              <Link to="/hunter/settings" className="text-blue-600 hover:underline">
                                Add email signature
                              </Link>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                setShowEmailCompose(false);
                                setEmailAttachments([]);
                              }}
                              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={sendEmail}
                              disabled={sendingEmail || !emailSubject.trim() || !emailBody.trim() || !selectedContact?.email}
                              className="flex items-center gap-2 px-4 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
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
                    )}
                  </div>

                  {/* Unified Activity Feed */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-3 border-b border-gray-100 bg-gray-50 sticky top-0">
                      <p className="text-xs font-medium text-gray-500 uppercase">Activity & Notes</p>
                    </div>

                    {loadingFeed ? (
                      <div className="p-4 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-orange-600 mx-auto"></div>
                      </div>
                    ) : activityFeed.length === 0 ? (
                      <div className="p-6 text-center text-gray-400">
                        <DocumentTextIcon className="w-10 h-10 mx-auto mb-2" />
                        <p className="text-sm">No activity yet</p>
                        <p className="text-xs mt-1">Log an activity or add a note to get started</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {activityFeed.map((item) => (
                          <div key={item.id} className="p-3 hover:bg-gray-50 group">
                            <div className="flex items-start gap-3">
                              <div className={`p-1.5 rounded-full ${
                                item.type === 'note' ? 'bg-gray-100 text-gray-600' :
                                OUTREACH_TYPES.includes(item.type as OutreachType) ? 'bg-blue-100 text-blue-600' :
                                'bg-emerald-100 text-emerald-600'
                              }`}>
                                <ActivityIcon type={item.type} className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className={`text-xs font-medium ${
                                    item.type === 'note' ? 'text-gray-500' :
                                    OUTREACH_TYPES.includes(item.type as OutreachType) ? 'text-blue-600' :
                                    'text-emerald-600'
                                  }`}>
                                    {item.type === 'note' ? 'Note' : ACTIVITY_CONFIG[item.type as ActivityType]?.label || item.type}
                                  </span>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                                    <button
                                      onClick={() => deleteActivityItem(item)}
                                      className="opacity-0 group-hover:opacity-100 p-1 text-gray-400 hover:text-red-500"
                                    >
                                      <XMarkIcon className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                {item.email_subject && (
                                  <p className="text-sm text-gray-700 font-medium mt-0.5">{item.email_subject}</p>
                                )}
                                {item.content && (
                                  <p className="text-sm text-gray-700 whitespace-pre-wrap mt-0.5">{item.content}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Add Note Input - always visible at bottom */}
                  <div className="p-3 border-t border-gray-200 bg-gray-50">
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
                        className="p-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
                      >
                        {addingNote ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <PaperAirplaneIcon className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Complete Task Button */}
                  {selectedTask && (
                    <div className="p-3 border-t border-gray-200">
                      <button
                        onClick={() => completeTask(selectedTask.id)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                      >
                        <CheckIcon className="w-5 h-5" />
                        Complete Task
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
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
