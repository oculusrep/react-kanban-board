/**
 * PropertyActivityTab
 *
 * Activity timeline component for properties. Displays a Slack-like
 * note-taking and activity logging experience similar to the Hunter
 * ContactDetailDrawer pattern.
 *
 * Features:
 * - Quick log activity buttons (Call, SMS, Voicemail, LinkedIn)
 * - Add notes with Cmd+Enter shortcut
 * - Timeline display with relative timestamps
 * - Contact linking for activities
 * - Migrated notes display with [Migrated] badge
 */

import { useState, useEffect } from 'react';
import {
  PhoneIcon,
  ChatBubbleLeftIcon,
  EnvelopeIcon,
  DocumentTextIcon,
  PaperAirplaneIcon,
  XMarkIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabaseClient';
import { usePropertyTimeline, PropertyActivityType } from '../../hooks/usePropertyTimeline';
import { UnifiedTimelineItem } from '../../types/timeline';

// LinkedIn icon (custom since not in Heroicons)
function LinkedInIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
    </svg>
  );
}

// Activity type configuration
const PROPERTY_ACTIVITY_CONFIG: Record<PropertyActivityType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  bgColor: string;
  hoverBg: string;
  hoverBorder: string;
}> = {
  phone_call: {
    label: 'Call',
    icon: PhoneIcon,
    color: 'text-blue-600',
    bgColor: 'bg-white',
    hoverBg: 'hover:bg-blue-50',
    hoverBorder: 'hover:border-blue-300',
  },
  sms: {
    label: 'SMS',
    icon: ChatBubbleLeftIcon,
    color: 'text-blue-600',
    bgColor: 'bg-white',
    hoverBg: 'hover:bg-blue-50',
    hoverBorder: 'hover:border-blue-300',
  },
  voicemail: {
    label: 'VM',
    icon: PhoneIcon,
    color: 'text-blue-600',
    bgColor: 'bg-white',
    hoverBg: 'hover:bg-blue-50',
    hoverBorder: 'hover:border-blue-300',
  },
  linkedin: {
    label: 'LinkedIn',
    icon: LinkedInIcon,
    color: 'text-blue-600',
    bgColor: 'bg-white',
    hoverBg: 'hover:bg-blue-50',
    hoverBorder: 'hover:border-blue-300',
  },
  email: {
    label: 'Email',
    icon: EnvelopeIcon,
    color: 'text-blue-600',
    bgColor: 'bg-white',
    hoverBg: 'hover:bg-blue-50',
    hoverBorder: 'hover:border-blue-300',
  },
};

// Activity icon component
function ActivityIcon({ type, className = 'w-4 h-4' }: { type: string; className?: string }) {
  switch (type) {
    case 'email':
    case 'email_sent':
    case 'email_received':
      return <EnvelopeIcon className={className} />;
    case 'phone_call':
    case 'call':
    case 'voicemail':
      return <PhoneIcon className={className} />;
    case 'linkedin':
    case 'sms':
      return <ChatBubbleLeftIcon className={className} />;
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

// Get activity type label
function getActivityLabel(item: UnifiedTimelineItem): string {
  if (item.type === 'note') return 'Note';
  if (item.type === 'email_sent') return 'Email Sent';
  if (item.type === 'email_received') return 'Email Received';
  if (item.type === 'phone_call') return 'Call';

  const config = PROPERTY_ACTIVITY_CONFIG[item.type as PropertyActivityType];
  return config?.label || item.type;
}

interface Contact {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface PropertyActivityTabProps {
  propertyId: string;
  propertyContacts?: Contact[];
  onActivityLogged?: (activity: UnifiedTimelineItem) => void;
  onNoteAdded?: (note: UnifiedTimelineItem) => void;
}

export default function PropertyActivityTab({
  propertyId,
  propertyContacts = [],
  onActivityLogged,
  onNoteAdded,
}: PropertyActivityTabProps) {
  // Timeline hook
  const {
    items: timelineItems,
    loading: loadingTimeline,
    refresh: refreshTimeline,
    addNote,
    logActivity,
    deleteItem,
  } = usePropertyTimeline({ propertyId });

  // UI state
  const [selectedActivityType, setSelectedActivityType] = useState<PropertyActivityType | null>(null);
  const [activityNote, setActivityNote] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  const [loggingActivity, setLoggingActivity] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);

  // Handle deleting an activity or note
  const handleDeleteItem = async (item: UnifiedTimelineItem) => {
    // Don't allow deleting emails (they come from Gmail)
    if (item.source === 'email') return;

    setDeletingItemId(item.id);
    try {
      await deleteItem(item);
    } finally {
      setDeletingItemId(null);
    }
  };

  // Handle activity button click
  const handleActivityClick = (type: PropertyActivityType) => {
    if (selectedActivityType === type) {
      // Toggle off
      setSelectedActivityType(null);
      setActivityNote('');
      setSelectedContactId('');
    } else {
      setSelectedActivityType(type);
      setActivityNote('');
      setSelectedContactId('');
    }
  };

  // Handle logging activity
  const handleLogActivity = async () => {
    if (!selectedActivityType) return;

    setLoggingActivity(true);
    try {
      const result = await logActivity(selectedActivityType, {
        notes: activityNote || undefined,
        contactId: selectedContactId || undefined,
      });

      if (result) {
        onActivityLogged?.(result);
        setSelectedActivityType(null);
        setActivityNote('');
        setSelectedContactId('');
      }
    } finally {
      setLoggingActivity(false);
    }
  };

  // Handle adding a note
  const handleAddNote = async () => {
    if (!newNoteText.trim()) return;

    setAddingNote(true);
    try {
      const result = await addNote(newNoteText);
      if (result) {
        onNoteAdded?.(result);
        setNewNoteText('');
      }
    } finally {
      setAddingNote(false);
    }
  };

  // Activity types to show (excluding email since that's typically sent via composer)
  const activityTypes: PropertyActivityType[] = ['phone_call', 'sms', 'voicemail', 'linkedin'];

  return (
    <div className="flex flex-col h-full">
      {/* Quick Log Activity Section */}
      <div className="p-4 border-b border-gray-200 bg-gray-50">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Quick Log Activity
        </p>
        <div className="grid grid-cols-4 gap-2">
          {activityTypes.map((type) => {
            const config = PROPERTY_ACTIVITY_CONFIG[type];
            const Icon = config.icon;
            const isSelected = selectedActivityType === type;

            return (
              <button
                key={type}
                onClick={() => handleActivityClick(type)}
                disabled={loggingActivity}
                title={`Log ${config.label}`}
                className={`flex flex-col items-center gap-1 p-2 text-xs rounded-lg transition-all border ${
                  isSelected
                    ? 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300'
                    : `${config.bgColor} ${config.color} border-gray-200 ${config.hoverBg} ${config.hoverBorder}`
                } disabled:opacity-50`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{config.label}</span>
              </button>
            );
          })}
        </div>

        {/* Activity input when type selected */}
        {selectedActivityType && (
          <div className="mt-3 p-3 bg-white border border-gray-300 rounded-lg shadow-sm">
            <p className="text-sm font-medium text-gray-700 mb-2">
              Logging {PROPERTY_ACTIVITY_CONFIG[selectedActivityType].label}
            </p>

            {/* Contact selector */}
            {propertyContacts.length > 0 && (
              <div className="mb-2">
                <select
                  value={selectedContactId}
                  onChange={(e) => setSelectedContactId(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">No contact (optional)</option>
                  {propertyContacts.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {contact.first_name} {contact.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={activityNote}
                onChange={(e) => setActivityNote(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleLogActivity();
                  } else if (e.key === 'Escape') {
                    setSelectedActivityType(null);
                    setActivityNote('');
                    setSelectedContactId('');
                  }
                }}
                placeholder="Add optional note... (Enter to log)"
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
              <button
                onClick={handleLogActivity}
                disabled={loggingActivity}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {loggingActivity ? 'Logging...' : 'Log'}
              </button>
              <button
                onClick={() => {
                  setSelectedActivityType(null);
                  setActivityNote('');
                  setSelectedContactId('');
                }}
                className="p-2 text-gray-400 hover:text-gray-600"
              >
                <XMarkIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {loadingTimeline ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          </div>
        ) : timelineItems.length === 0 ? (
          <div className="p-8 text-center text-gray-400">
            <DocumentTextIcon className="w-12 h-12 mx-auto mb-2" />
            <p className="font-medium">No activity yet</p>
            <p className="text-sm mt-1">Log an activity or add a note to get started</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {timelineItems.map((item) => (
              <div key={item.id} className="p-4 hover:bg-gray-50 group">
                <div className="flex items-start gap-3">
                  {/* Activity icon */}
                  <div className={`p-2 rounded-full ${
                    item.type === 'note' ? 'bg-gray-100 text-gray-600' :
                    ['email_received'].includes(item.type) ? 'bg-green-100 text-green-600' :
                    ['email', 'email_sent'].includes(item.type) ? 'bg-blue-100 text-blue-600' :
                    'bg-blue-100 text-blue-600'
                  }`}>
                    <ActivityIcon type={item.type} className="w-4 h-4" />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`text-sm font-medium ${
                          item.type === 'note' ? 'text-gray-700' :
                          ['email_received'].includes(item.type) ? 'text-green-700' :
                          'text-blue-700'
                        }`}>
                          {getActivityLabel(item)}
                        </span>
                        {/* Migrated badge */}
                        {item.is_migrated && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                            Migrated
                          </span>
                        )}
                        {/* Contact name if linked */}
                        {item.contact_name && (
                          <span className="text-sm text-gray-500">
                            with {item.contact_name}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">{formatActivityTime(item.created_at)}</span>
                        {/* Delete button - only show for deletable items (not emails) */}
                        {item.source !== 'email' && (
                          <button
                            onClick={() => handleDeleteItem(item)}
                            disabled={deletingItemId === item.id}
                            className="p-1 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50"
                            title="Delete"
                          >
                            {deletingItemId === item.id ? (
                              <div className="w-3.5 h-3.5 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <TrashIcon className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Email subject */}
                    {(item.email_subject || item.subject) && (
                      <p className="text-sm text-gray-800 font-medium mt-1">{item.email_subject || item.subject}</p>
                    )}

                    {/* Note content or activity notes */}
                    {item.content && (
                      <p className="text-sm text-gray-600 whitespace-pre-wrap mt-1">{item.content}</p>
                    )}

                    {/* Source attribution */}
                    {item.source === 'email' && (
                      <span className="inline-flex items-center mt-1 text-xs text-gray-400">
                        {item.direction === 'inbound' ? 'received' : 'sent'} via Gmail
                      </span>
                    )}
                    {item.is_migrated && item.migrated_from && (
                      <span className="inline-flex items-center mt-1 text-xs text-gray-400">
                        from {item.migrated_from === 'property_notes' ? 'Property Notes' : 'Description'} field
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
                handleAddNote();
              }
            }}
            placeholder="Add a note... (Cmd+Enter to save)"
            rows={2}
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-2 resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <button
            onClick={handleAddNote}
            disabled={!newNoteText.trim() || addingNote}
            className="p-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {addingNote ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <PaperAirplaneIcon className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
