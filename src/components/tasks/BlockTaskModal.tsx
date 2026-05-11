import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';

// Modal for entering the "Awaiting" reason when ⏸ is clicked on a task.
// Replaces the native window.prompt — matches the OVIS modal style used
// elsewhere (FollowUpModal, etc.): backdrop + centered white card with
// header, body, footer.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  warning: '#A27B5C',
} as const;

interface BlockTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Resolved with the user's reason; called only on submit (not cancel). */
  onSubmit: (reason: string) => void | Promise<void>;
  /** Subject of the task being blocked, shown for context. */
  taskSubject?: string;
}

export const BlockTaskModal: React.FC<BlockTaskModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  taskSubject,
}) => {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setReason('');
    setSubmitting(false);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(trimmed);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[70]"
        onMouseDown={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: COLORS.midnight }}>
                ⏸ Awaiting
              </h3>
              <p className="mt-1 text-sm" style={{ color: COLORS.steel }}>
                {taskSubject
                  ? `What are you waiting on for "${taskSubject}"?`
                  : 'What are you waiting on?'}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Body — single input form so Enter submits */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: COLORS.steel }}
              >
                Reason
              </label>
              <input
                ref={inputRef}
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Waiting on attorney to review LOI"
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !reason.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: COLORS.midnight }}
              >
                {submitting ? 'Saving…' : 'Park as Awaiting'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default BlockTaskModal;
