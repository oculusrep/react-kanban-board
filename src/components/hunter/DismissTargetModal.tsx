// Modal for dismissing/passing on a target with a reason
// src/components/hunter/DismissTargetModal.tsx

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import {
  XMarkIcon,
  HandThumbDownIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

// Dismiss reasons that make sense for sales prospecting
const DISMISS_REASONS = [
  { value: 'too_small', label: 'Too Small', description: 'AUV or unit count too low' },
  { value: 'wrong_segment', label: 'Wrong Segment', description: 'Not our target industry/segment' },
  { value: 'wrong_geography', label: 'Wrong Geography', description: 'Not expanding to our markets' },
  { value: 'already_represented', label: 'Already Represented', description: 'Has existing broker relationship' },
  { value: 'bad_reputation', label: 'Bad Reputation', description: 'Known issues or poor track record' },
  { value: 'not_franchising', label: 'Not Franchising', description: 'Corporate-owned only, no franchise opportunities' },
  { value: 'already_client', label: 'Already a Client', description: 'We already work with them' },
  { value: 'competitor_client', label: 'Competitor Client', description: 'Works with a competitor' },
  { value: 'timing', label: 'Bad Timing', description: 'Not the right time to pursue' },
  { value: 'other', label: 'Other', description: 'Different reason' }
];

interface DismissTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetId: string;
  targetName: string;
  onDismissed: () => void;
}

export default function DismissTargetModal({
  isOpen,
  onClose,
  targetId,
  targetName,
  onDismissed
}: DismissTargetModalProps) {
  const [selectedReason, setSelectedReason] = useState<string>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen) return null;

  async function handleDismiss() {
    if (!selectedReason) {
      alert('Please select a reason');
      return;
    }

    setSaving(true);
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update target status to dismissed and store the reason
      const { error: updateError } = await supabase
        .from('target')
        .update({
          status: 'dismissed',
          dismiss_reason: selectedReason,
          dismiss_note: note.trim() || null,
          dismissed_at: new Date().toISOString(),
          dismissed_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', targetId);

      if (updateError) throw updateError;

      // Also log this as feedback for Hunter learning
      await supabase
        .from('hunter_feedback')
        .insert({
          target_id: targetId,
          feedback_type: 'lead_dismissed',
          original_value: null,
          corrected_value: selectedReason,
          feedback_note: note.trim() || null,
          concept_name: targetName,
          created_by: user.id
        });

      // Reject any pending outreach drafts for this target
      await supabase
        .from('hunter_outreach_draft')
        .update({
          status: 'rejected',
          updated_at: new Date().toISOString()
        })
        .eq('target_id', targetId)
        .in('status', ['draft', 'approved']);

      onDismissed();
      onClose();
    } catch (err) {
      console.error('Error dismissing target:', err);
      alert('Failed to dismiss target');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gray-100 rounded-lg">
              <HandThumbDownIcon className="w-5 h-5 text-gray-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pass on Target</h2>
              <p className="text-sm text-gray-500">{targetName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Why are you passing on this target?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {DISMISS_REASONS.map((reason) => (
                <button
                  key={reason.value}
                  onClick={() => setSelectedReason(reason.value)}
                  className={`p-3 text-left rounded-lg border transition-colors ${
                    selectedReason === reason.value
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300 text-gray-700'
                  }`}
                >
                  <p className="font-medium text-sm">{reason.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{reason.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g., AUV is only $225k, not interested now..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500 text-sm"
              rows={3}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0" />
            <div className="text-sm">
              <p className="font-medium text-amber-800">This won't delete the target</p>
              <p className="text-amber-700 mt-0.5">
                You can always view passed targets later and reconsider them.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleDismiss}
            disabled={saving || !selectedReason}
            className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Pass on Target'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Export the reasons for use in other components
export { DISMISS_REASONS };
