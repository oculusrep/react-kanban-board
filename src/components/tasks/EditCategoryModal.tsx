import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabaseClient';
import {
  TASK_CATEGORY_COLORS,
  TaskCategoryColor,
  TaskCategoryRow,
} from '../../types/task';

// Modal for editing a task_category — rename, change color, or archive
// (soft delete). Permission to open this modal is decided by the caller
// (CategoryDropdown uses canEditCategory from lib/taskCategory). The
// modal itself trusts that gate; the DB also enforces uniqueness so
// even if a non-admin somehow opens it, a rename collision will fail.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  warning: '#A27B5C',
  danger: '#dc2626',
} as const;

const SWATCH_BG: Record<TaskCategoryColor, string> = {
  amber: 'bg-amber-300',
  blue: 'bg-blue-300',
  indigo: 'bg-indigo-300',
  gray: 'bg-gray-300',
  green: 'bg-green-300',
  slate: 'bg-slate-300',
  red: 'bg-red-300',
  teal: 'bg-teal-300',
};

interface EditCategoryModalProps {
  isOpen: boolean;
  category: TaskCategoryRow | null;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

export const EditCategoryModal: React.FC<EditCategoryModalProps> = ({
  isOpen,
  category,
  onClose,
  onSaved,
}) => {
  const [name, setName] = useState('');
  const [color, setColor] = useState<TaskCategoryColor>('blue');
  const [submitting, setSubmitting] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingArchive, setConfirmingArchive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen || !category) return;
    setName(category.name);
    setColor((category.color as TaskCategoryColor) ?? 'blue');
    setError(null);
    setConfirmingArchive(false);
    setSubmitting(false);
    setArchiving(false);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [isOpen, category]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !category) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    // No-op early-out so we don't waste a round-trip.
    if (trimmed === category.name && color === category.color) {
      onClose();
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from('task_category')
        .update({ name: trimmed, color })
        .eq('id', category.id);
      if (updateError) {
        if (updateError.code === '23505') {
          const where = category.scope === 'global' ? 'team-wide' : 'in your personal categories';
          setError(`A category named "${trimmed}" already exists ${where}.`);
        } else {
          setError(updateError.message);
        }
        return;
      }
      await onSaved();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const handleArchive = async () => {
    if (archiving) return;
    setArchiving(true);
    setError(null);
    try {
      const { error: archiveError } = await supabase
        .from('task_category')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', category.id);
      if (archiveError) {
        setError(archiveError.message);
        return;
      }
      await onSaved();
      onClose();
    } finally {
      setArchiving(false);
    }
  };

  const busy = submitting || archiving;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[80]"
        onMouseDown={onClose}
      />
      <div className="fixed inset-0 flex items-center justify-center z-[80] p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold" style={{ color: COLORS.midnight }}>
                Edit category
              </h3>
              <p className="mt-1 text-sm" style={{ color: COLORS.steel }}>
                {category.scope === 'global' ? 'Team-wide' : 'Personal'} category
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

          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: COLORS.steel }}
              >
                Name
              </label>
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={busy}
                maxLength={40}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: COLORS.steel }}
              >
                Color
              </label>
              <div className="flex gap-2 flex-wrap">
                {TASK_CATEGORY_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    disabled={busy}
                    aria-label={c}
                    className={`w-7 h-7 rounded-full ${SWATCH_BG[c]} transition-all ${
                      color === c
                        ? 'ring-2 ring-offset-2 ring-blue-500'
                        : 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            {error && (
              <div className="text-sm" style={{ color: COLORS.warning }}>
                {error}
              </div>
            )}

            <div className="flex justify-between gap-2 pt-2 border-t border-gray-200">
              {/* Archive (soft delete) lives on the left as a destructive
                  action, separate from the primary Save. Two-click confirm. */}
              {!confirmingArchive ? (
                <button
                  type="button"
                  onClick={() => setConfirmingArchive(true)}
                  disabled={busy}
                  className="px-3 py-2 text-sm font-medium rounded-lg border transition-colors disabled:opacity-50"
                  style={{ color: COLORS.danger, borderColor: COLORS.danger + '66' }}
                >
                  Archive
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs" style={{ color: COLORS.warning }}>
                    Hide from dropdowns?
                  </span>
                  <button
                    type="button"
                    onClick={handleArchive}
                    disabled={busy}
                    className="px-3 py-2 text-sm font-medium rounded-lg text-white transition-colors disabled:opacity-50"
                    style={{ backgroundColor: COLORS.danger }}
                  >
                    {archiving ? 'Archiving…' : 'Yes, archive'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmingArchive(false)}
                    disabled={busy}
                    className="px-2 py-2 text-xs font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                  >
                    No
                  </button>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy || !name.trim()}
                  className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: COLORS.midnight }}
                >
                  {submitting ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default EditCategoryModal;
