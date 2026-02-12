// Quick activity logging buttons for lead/contact pages
// src/components/hunter/ActivityLogButtons.tsx

import { useState } from 'react';
import {
  EnvelopeIcon,
  PhoneIcon,
  ChatBubbleLeftIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';
import { ProspectingActivityType, ACTIVITY_TYPE_INFO } from '../../lib/types';

interface ActivityLogButtonsProps {
  onLogActivity: (type: ProspectingActivityType, notes?: string) => Promise<void>;
  loading?: boolean;
  size?: 'sm' | 'md';
}

const ACTIVITY_BUTTONS: { type: ProspectingActivityType; icon: React.ElementType; shortLabel: string }[] = [
  { type: 'email', icon: EnvelopeIcon, shortLabel: 'Email' },
  { type: 'linkedin', icon: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  ), shortLabel: 'LinkedIn' },
  { type: 'sms', icon: ChatBubbleLeftIcon, shortLabel: 'SMS' },
  { type: 'voicemail', icon: PhoneIcon, shortLabel: 'Voicemail' },
  { type: 'call', icon: () => (
    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>
      <path d="M14.5 2l5.5 5.5M20 2v6h-6" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ), shortLabel: 'Call' },
  { type: 'meeting', icon: UserGroupIcon, shortLabel: 'Meeting' }
];

const BUTTON_COLORS: Record<ProspectingActivityType, string> = {
  email: 'hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300',
  linkedin: 'hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-300',
  sms: 'hover:bg-green-50 hover:text-green-600 hover:border-green-300',
  voicemail: 'hover:bg-yellow-50 hover:text-yellow-600 hover:border-yellow-300',
  call: 'hover:bg-emerald-50 hover:text-emerald-600 hover:border-emerald-300',
  meeting: 'hover:bg-purple-50 hover:text-purple-600 hover:border-purple-300'
};

export default function ActivityLogButtons({ onLogActivity, loading, size = 'md' }: ActivityLogButtonsProps) {
  const [loggingType, setLoggingType] = useState<ProspectingActivityType | null>(null);

  const handleClick = async (type: ProspectingActivityType) => {
    setLoggingType(type);
    try {
      await onLogActivity(type);
    } finally {
      setLoggingType(null);
    }
  };

  const buttonClass = size === 'sm'
    ? 'px-2 py-1 text-xs'
    : 'px-3 py-1.5 text-sm';

  return (
    <div className="flex flex-wrap gap-2">
      {ACTIVITY_BUTTONS.map(({ type, icon: Icon, shortLabel }) => {
        const info = ACTIVITY_TYPE_INFO[type];
        const isLogging = loggingType === type;

        return (
          <button
            key={type}
            onClick={() => handleClick(type)}
            disabled={loading || isLogging}
            className={`
              inline-flex items-center gap-1.5 ${buttonClass}
              border border-gray-300 rounded-lg
              text-gray-600 bg-white
              transition-colors duration-150
              disabled:opacity-50 disabled:cursor-not-allowed
              ${BUTTON_COLORS[type]}
            `}
            title={info.label}
          >
            {isLogging ? (
              <span className="w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
            ) : (
              <Icon className="w-4 h-4" />
            )}
            <span>{shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
