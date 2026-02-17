/**
 * ContactDetailDrawer
 *
 * Reusable contact detail drawer with unified activity timeline.
 * Can be used in Hunter, CRM, deals, and other contexts.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  XMarkIcon,
  PencilIcon,
  GlobeAltIcon,
  SparklesIcon,
  EnvelopeIcon,
  PhoneIcon,
  ChatBubbleLeftIcon,
  CalendarDaysIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  ClipboardIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../../lib/supabaseClient';
import { useContactTimeline } from '../../../hooks/useContactTimeline';
import { UnifiedTimelineItem, TimelineActivityType } from '../../../types/timeline';
import {
  ContactDetailDrawerProps,
  ContactData,
  DrawerFeatures,
  DEFAULT_FEATURES,
  ACTIVITY_CONFIG,
  OUTREACH_TYPES,
  CONNECTION_TYPES,
  SIGNAL_COLORS,
  QuickLogActivityType,
} from './types';

// Activity icon component
function ActivityIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'email':
    case 'email_sent':
    case 'email_received':
      return <EnvelopeIcon className={className} />;
    case 'call':
    case 'voicemail':
      return <PhoneIcon className={className} />;
    case 'linkedin':
    case 'sms':
      return <ChatBubbleLeftIcon className={className} />;
    case 'meeting':
      return <CalendarDaysIcon className={className} />;
    case 'note':
      return <DocumentTextIcon className={className} />;
    default:
      return <DocumentTextIcon className={className} />;
  }
}

// Format time for display
function formatActivityTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function ContactDetailDrawer({
  isOpen,
  contact,
  context,
  taskId,
  callbacks,
  features: featureOverrides,
  timelineSources,
  initialTab = 'activity',
  width = '600px',
  zIndex = 50,
  emailTemplates,
  emailSignature,
  onOpenEmailCompose,
  onZoomInfoEnrich,
  zoomInfoLoading,
}: ContactDetailDrawerProps) {
  // Merge features with defaults for context
  const features: DrawerFeatures = {
    ...DEFAULT_FEATURES[context],
    ...featureOverrides,
  };

  // Local state
  const [activeTab, setActiveTab] = useState<'activity' | 'emails'>(initialTab);
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState<Partial<ContactData>>({});
  const [savingContact, setSavingContact] = useState(false);

  // Activity logging state
  const [showActivityNoteInput, setShowActivityNoteInput] = useState<QuickLogActivityType | null>(null);
  const [activityNote, setActivityNote] = useState('');
  const [loggingActivity, setLoggingActivity] = useState<QuickLogActivityType | null>(null);
  const [recentlyLogged, setRecentlyLogged] = useState<{ type: string; timestamp: number } | null>(null);

  // Note input state
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);

  // Clipboard state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Use the timeline hook
  const {
    items: timelineItems,
    groupedItems,
    loading: loadingTimeline,
    refresh: refreshTimeline,
    addNote: hookAddNote,
    logActivity: hookLogActivity,
  } = useContactTimeline({
    contactId: contact?.id || null,
    targetId: contact?.target_id,
    sources: timelineSources,
  });

  // Reset form when contact changes
  useEffect(() => {
    if (contact) {
      setContactForm(contact);
    }
  }, [contact]);

  // Copy to clipboard
  const copyToClipboard = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  // Handle activity click
  const handleActivityClick = useCallback((type: QuickLogActivityType) => {
    if (showActivityNoteInput === type) {
      // Submit with current note
      handleLogActivity(type, activityNote);
    } else {
      // Show note input for this type
      setShowActivityNoteInput(type);
      setActivityNote('');
    }
  }, [showActivityNoteInput, activityNote]);

  // Log activity
  const handleLogActivity = useCallback(async (type: QuickLogActivityType, note?: string) => {
    if (!contact) return;

    setLoggingActivity(type);
    try {
      const newItem = await hookLogActivity(type as TimelineActivityType, { notes: note });

      if (newItem) {
        // Show success feedback
        setRecentlyLogged({ type, timestamp: Date.now() });
        setTimeout(() => setRecentlyLogged(null), 3000);

        // Clear input state
        setActivityNote('');
        setShowActivityNoteInput(null);

        // Notify parent
        callbacks.onActivityLogged?.(newItem);
      }
    } catch (err) {
      console.error('Error logging activity:', err);
    } finally {
      setLoggingActivity(null);
    }
  }, [contact, hookLogActivity, callbacks]);

  // Add note
  const handleAddNote = useCallback(async () => {
    if (!contact || !newNoteText.trim()) return;

    setAddingNote(true);
    try {
      const newItem = await hookAddNote(newNoteText.trim());

      if (newItem) {
        setNewNoteText('');
        callbacks.onNoteAdded?.(newItem);
      }
    } catch (err) {
      console.error('Error adding note:', err);
    } finally {
      setAddingNote(false);
    }
  }, [contact, newNoteText, hookAddNote, callbacks]);

  // Save contact edits
  const handleSaveContact = useCallback(async () => {
    if (!contact) return;

    setSavingContact(true);
    try {
      const { error } = await supabase
        .from('contact')
        .update({
          first_name: contactForm.first_name,
          last_name: contactForm.last_name,
          title: contactForm.title,
          company: contactForm.company,
          email: contactForm.email,
          phone: contactForm.phone,
          mobile_phone: contactForm.mobile_phone,
        })
        .eq('id', contact.id);

      if (error) throw error;

      const updatedContact: ContactData = {
        ...contact,
        ...contactForm,
      };

      setEditingContact(false);
      callbacks.onContactUpdate?.(updatedContact);
    } catch (err) {
      console.error('Error saving contact:', err);
    } finally {
      setSavingContact(false);
    }
  }, [contact, contactForm, callbacks]);

  // Complete task
  const handleCompleteTask = useCallback(async () => {
    if (!taskId) return;
    callbacks.onTaskComplete?.(taskId);
  }, [taskId, callbacks]);

  // Don't render if no contact
  if (!contact) return null;

  const contactName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown Contact';

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
          style={{ zIndex: zIndex - 10 }}
          onClick={callbacks.onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width, zIndex }}
      >
        <div className="h-full flex flex-col">
          {/* Header */}
          <div className="p-5 border-b border-gray-200 bg-gradient-to-br from-gray-50 to-white">
            <div className="flex items-start justify-between mb-4">
              <button
                onClick={callbacks.onClose}
                className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                {features.canEdit && (
                  <button
                    onClick={() => setEditingContact(!editingContact)}
                    className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
                    title="Edit contact"
                  >
                    <PencilIcon className="w-4 h-4" />
                  </button>
                )}
                {features.showLinkedInButton && contact.linked_in_profile_link && (
                  <a
                    href={contact.linked_in_profile_link}
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
                {features.showWebsiteButton && contact.target?.website && (
                  <a
                    href={contact.target.website.startsWith('http') ? contact.target.website : `https://${contact.target.website}`}
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
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveContact}
                    disabled={savingContact}
                    className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {savingContact ? 'Saving...' : 'Save Changes'}
                  </button>
                  <button
                    onClick={() => {
                      setEditingContact(false);
                      setContactForm(contact);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Contact Display */
              <>
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                    {(contact.first_name?.[0] || contact.last_name?.[0] || '?').toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold text-gray-900 truncate">{contactName}</h2>
                      {features.showSignalStrength && contact.target?.signal_strength && (
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${SIGNAL_COLORS[contact.target.signal_strength]}`}>
                          {contact.target.signal_strength}
                        </span>
                      )}
                    </div>
                    {contact.title && (
                      <p className="text-sm text-gray-600">{contact.title}</p>
                    )}
                    {(contact.company || contact.target?.concept_name) && (
                      <p className="text-sm font-medium text-gray-800">
                        {contact.company || contact.target?.concept_name}
                      </p>
                    )}
                  </div>
                </div>

                {/* Contact details */}
                <div className="mt-4 space-y-2">
                  {contact.email && (
                    <div
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer group"
                      onClick={() => copyToClipboard(contact.email!, 'email')}
                    >
                      <EnvelopeIcon className="w-4 h-4 text-gray-400" />
                      <span className="truncate">{contact.email}</span>
                      {copiedField === 'email' ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                      ) : (
                        <ClipboardIcon className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />
                      )}
                    </div>
                  )}
                  {contact.phone && (
                    <div
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer group"
                      onClick={() => copyToClipboard(contact.phone!, 'phone')}
                    >
                      <PhoneIcon className="w-4 h-4 text-gray-400" />
                      <span>{contact.phone}</span>
                      {copiedField === 'phone' ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                      ) : (
                        <ClipboardIcon className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />
                      )}
                    </div>
                  )}
                  {contact.mobile_phone && contact.mobile_phone !== contact.phone && (
                    <div
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 cursor-pointer group"
                      onClick={() => copyToClipboard(contact.mobile_phone!, 'mobile')}
                    >
                      <PhoneIcon className="w-4 h-4 text-gray-400" />
                      <span>{contact.mobile_phone} (mobile)</span>
                      {copiedField === 'mobile' ? (
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                      ) : (
                        <ClipboardIcon className="w-4 h-4 text-gray-300 opacity-0 group-hover:opacity-100" />
                      )}
                    </div>
                  )}
                </div>

                {/* ZoomInfo Enrich */}
                {features.showZoomInfoEnrich && onZoomInfoEnrich && (
                  <button
                    onClick={onZoomInfoEnrich}
                    disabled={zoomInfoLoading}
                    className="mt-3 flex items-center gap-2 text-sm text-purple-600 hover:text-purple-800 hover:bg-purple-50 px-2 py-1 rounded transition-colors"
                  >
                    <SparklesIcon className="w-4 h-4" />
                    {zoomInfoLoading ? 'Searching ZoomInfo...' : 'Enrich with ZoomInfo'}
                  </button>
                )}
              </>
            )}
          </div>

          {!editingContact && (
            <>
              {/* Quick Actions */}
              {(features.canLogActivity || features.canComposeEmail) && (
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  {/* Success feedback */}
                  {recentlyLogged && (
                    <div className="mb-3 px-3 py-2 bg-green-100 border border-green-300 text-green-800 rounded-lg text-sm flex items-center gap-2 animate-pulse">
                      <CheckCircleIcon className="w-4 h-4" />
                      {ACTIVITY_CONFIG[recentlyLogged.type as QuickLogActivityType]?.label || recentlyLogged.type} logged
                    </div>
                  )}

                  {/* Complete Task Button */}
                  {features.canCompleteTask && taskId && (
                    <div className="mb-4">
                      <button
                        onClick={handleCompleteTask}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
                      >
                        <CheckCircleIcon className="w-5 h-5" />
                        Complete Task
                      </button>
                    </div>
                  )}

                  {/* Send Email - Primary action */}
                  {features.canComposeEmail && onOpenEmailCompose && (
                    <div className="mb-4">
                      <button
                        onClick={onOpenEmailCompose}
                        disabled={!contact.email}
                        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                      >
                        <EnvelopeIcon className="w-5 h-5" />
                        Compose & Send Email
                      </button>
                      {!contact.email && (
                        <p className="text-xs text-gray-500 mt-1 text-center">No email address on file</p>
                      )}
                    </div>
                  )}

                  {/* Log Activity Section */}
                  {features.canLogActivity && (
                    <div className="border-t border-gray-200 pt-3">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                        Quick Log Activity
                      </p>
                      <div className="grid grid-cols-5 gap-2">
                        {/* Outreach activities (except email - that's handled above) */}
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
                                  handleLogActivity(showActivityNoteInput, activityNote);
                                } else if (e.key === 'Escape') {
                                  setShowActivityNoteInput(null);
                                }
                              }}
                              placeholder="Add optional note... (Enter to log)"
                              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                              autoFocus
                            />
                            <button
                              onClick={() => handleLogActivity(showActivityNoteInput, activityNote)}
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
                  )}
                </div>
              )}

              {/* Tabs */}
              <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
                <button
                  onClick={() => setActiveTab('activity')}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'activity'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Activity Timeline
                </button>
                <button
                  onClick={() => setActiveTab('emails')}
                  className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === 'emails'
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Email History
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto min-h-0 flex flex-col">
                {activeTab === 'activity' ? (
                  /* Activity Timeline Tab - Filter out hidden items */
                  <>
                    <div className="flex-1 overflow-y-auto">
                      {loadingTimeline ? (
                        <div className="p-8 text-center">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                        </div>
                      ) : timelineItems.filter(item => !item.hidden_from_timeline).length === 0 ? (
                        <div className="p-8 text-center text-gray-400">
                          <DocumentTextIcon className="w-12 h-12 mx-auto mb-2" />
                          <p className="font-medium">No activity yet</p>
                          <p className="text-sm mt-1">Log an activity or add a note</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-100">
                          {timelineItems.filter(item => !item.hidden_from_timeline).map((item) => (
                            <div key={item.id} className="p-4 hover:bg-gray-50 group">
                              <div className="flex items-start gap-3">
                                <div className={`p-2 rounded-full ${
                                  item.type === 'note' ? 'bg-gray-100 text-gray-600' :
                                  item.type === 'task' ? 'bg-slate-100 text-slate-600' :
                                  item.type === 'email_received' ? 'bg-green-100 text-green-600' :
                                  ['email', 'email_sent', 'linkedin', 'sms', 'voicemail'].includes(item.type) ? 'bg-blue-100 text-blue-600' :
                                  'bg-emerald-100 text-emerald-600'
                                }`}>
                                  <ActivityIcon type={item.type} className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <span className={`text-sm font-medium ${
                                      item.type === 'note' ? 'text-gray-700' :
                                      item.type === 'task' ? 'text-slate-700' :
                                      item.type === 'email_received' ? 'text-green-700' :
                                      ['email', 'email_sent', 'linkedin', 'sms', 'voicemail'].includes(item.type) ? 'text-blue-700' :
                                      'text-emerald-700'
                                    }`}>
                                      {item.type === 'note' ? 'Note' :
                                       item.type === 'email_sent' ? 'Email Sent' :
                                       item.type === 'email_received' ? 'Email Received' :
                                       item.activity_type_name ? item.activity_type_name :
                                       ACTIVITY_CONFIG[item.type as QuickLogActivityType]?.label || item.type}
                                    </span>
                                    <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                                  </div>
                                  {(item.email_subject || item.subject) && (
                                    <p className="text-sm text-gray-800 font-medium mt-1">{item.email_subject || item.subject}</p>
                                  )}
                                  {item.content && (
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{item.content}</p>
                                  )}
                                  {item.email_body_preview && !item.content && (
                                    <p className="text-sm text-gray-600 mt-1 line-clamp-2">{item.email_body_preview}</p>
                                  )}
                                  {item.source === 'activity' && (
                                    <span className="inline-flex items-center mt-1 text-xs text-gray-400">
                                      from contact record
                                    </span>
                                  )}
                                  {item.source === 'email' && (
                                    <span className="inline-flex items-center mt-1 text-xs text-gray-400">
                                      {item.direction === 'inbound' ? 'received' : 'sent'} via Gmail
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
                    {features.canAddNote && (
                      <div className="p-4 border-t border-gray-200 bg-white flex-shrink-0">
                        <div className="flex items-end gap-2">
                          <textarea
                            value={newNoteText}
                            onChange={(e) => setNewNoteText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                e.preventDefault();
                                handleAddNote();
                              }
                            }}
                            placeholder="Add a note... (Cmd+Enter to save)"
                            rows={2}
                            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                          />
                          <button
                            onClick={handleAddNote}
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
                    )}
                  </>
                ) : (
                  /* Email History Tab */
                  <div className="flex-1 overflow-y-auto">
                    {loadingTimeline ? (
                      <div className="p-8 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto"></div>
                      </div>
                    ) : (
                      <>
                        {timelineItems.filter(item => ['email', 'email_sent', 'email_received'].includes(item.type)).length === 0 ? (
                          <div className="p-8 text-center text-gray-400">
                            <EnvelopeIcon className="w-12 h-12 mx-auto mb-2" />
                            <p className="font-medium">No emails yet</p>
                            <p className="text-sm mt-1">Email history will appear here</p>
                          </div>
                        ) : (
                          <div className="divide-y divide-gray-100">
                            {timelineItems
                              .filter(item => ['email', 'email_sent', 'email_received'].includes(item.type))
                              .map((item) => (
                                <div key={item.id} className="p-4 hover:bg-gray-50">
                                  <div className="flex items-start gap-3">
                                    <div className={`p-2 rounded-full ${
                                      item.type === 'email_received' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'
                                    }`}>
                                      <EnvelopeIcon className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center justify-between">
                                        <span className={`text-sm font-medium ${
                                          item.type === 'email_received' ? 'text-green-700' : 'text-blue-700'
                                        }`}>
                                          {item.type === 'email_received' ? 'Email Received' : 'Email Sent'}
                                        </span>
                                        <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                                      </div>
                                      {item.email_subject && (
                                        <p className="text-sm text-gray-800 font-medium mt-1">{item.email_subject}</p>
                                      )}
                                      {(item.email_body_preview || item.content) && (
                                        <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                                          {item.email_body_preview || item.content}
                                        </p>
                                      )}
                                      {item.sender_email && item.type === 'email_received' && (
                                        <p className="text-xs text-gray-400 mt-1">
                                          From: {item.sender_name || item.sender_email}
                                        </p>
                                      )}
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
            </>
          )}
        </div>
      </div>
    </>
  );
}
