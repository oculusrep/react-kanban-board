// Modal for logging prospect responses (inbound engagement)
// src/components/hunter/LogResponseModal.tsx

import { useState, useEffect } from 'react';
import { XMarkIcon, CalendarIcon } from '@heroicons/react/24/outline';
import { ProspectingResponseType, RESPONSE_TYPE_INFO } from '../../lib/types';

interface LogResponseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (type: ProspectingResponseType, date: string, notes?: string) => Promise<boolean>;
  responseType: ProspectingResponseType;
}

export default function LogResponseModal({
  isOpen,
  onClose,
  onSave,
  responseType
}: LogResponseModalProps) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const responseInfo = RESPONSE_TYPE_INFO[responseType];

  useEffect(() => {
    if (isOpen) {
      setDate(new Date().toISOString().split('T')[0]);
      setNotes('');
    }
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const success = await onSave(responseType, date, notes || undefined);
      if (success) onClose();
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                <span className="text-green-600 text-sm">+</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-900">
                Log {responseInfo.label}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Response Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Response Date
              </label>
              <div className="relative">
                <CalendarIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  max={new Date().toISOString().split('T')[0]}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                When did they respond? Defaults to today.
              </p>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={getNotesPlaceholder(responseType)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>

            {/* Info Box */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-sm text-green-800">
                This will be counted as a <strong>Connection</strong> in your scorecard.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving...' : 'Save Response'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function getNotesPlaceholder(type: ProspectingResponseType): string {
  switch (type) {
    case 'email_response':
      return "e.g., They're interested in 2 locations...";
    case 'linkedin_response':
      return "e.g., Asked to connect on a call next week...";
    case 'sms_response':
      return "e.g., Replied with their availability...";
    case 'return_call':
      return "e.g., Called back, discussed their expansion plans...";
    default:
      return "Add any relevant details...";
  }
}
