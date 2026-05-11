import React, { useEffect, useRef, useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  TASK_CATEGORY_COLORS,
  TaskCategoryColor,
  TaskCategoryRow,
  TaskCategoryScope,
} from '../../types/task';

// Modal for creating a new task_category. Matches OVIS modal style
// (FollowUpModal pattern). Insert is direct against task_category;
// uniqueness is enforced by the DB UNIQUE constraint on `name` so
// duplicates surface as a validation error.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  warning: '#A27B5C',
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

interface CreateCategoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the newly-created row after successful insert. */
  onCreated: (cat: TaskCategoryRow) => void | Promise<void>;
}

export const CreateCategoryModal: React.FC<CreateCategoryModalProps> = ({
  isOpen,
  onClose,
  onCreated,
}) => {
  const { userTableId } = useAuth();
  const [name, setName] = useState('');
  const [color, setColor] = useState<TaskCategoryColor>('blue');
  const [scope, setScope] = useState<TaskCategoryScope>('personal');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setColor('blue');
    setScope('personal');
    setError(null);
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
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // sort_order: place new categories at the bottom by default.
      // Personal categories require created_by_id (DB CHECK constraint).
      const { data, error: insertError } = await supabase
        .from('task_category')
        .insert({
          name: trimmed,
          color,
          scope,
          sort_order: 1000,
          created_by_id: userTableId ?? null,
        })
        .select()
        .single();
      if (insertError) {
        if (insertError.code === '23505') {
          const where = scope === 'global' ? 'team-wide' : 'in your personal categories';
          setError(`A category named "${trimmed}" already exists ${where}.`);
        } else {
          setError(insertError.message);
        }
        return;
      }
      if (data) {
        await onCreated(data as TaskCategoryRow);
        onClose();
      }
    } finally {
      setSubmitting(false);
    }
  };

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
                New category
              </h3>
              <p className="mt-1 text-sm" style={{ color: COLORS.steel }}>
                Choose whether this category is just yours or visible to the whole team.
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

          <form onSubmit={handleSubmit} className="space-y-4">
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
                placeholder="e.g., Bookkeeping"
                disabled={submitting}
                maxLength={40}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label
                className="block text-sm font-medium mb-1"
                style={{ color: COLORS.steel }}
              >
                Visibility
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScope('personal')}
                  disabled={submitting}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                    scope === 'personal'
                      ? 'bg-blue-50 border-blue-500 text-blue-900'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Just me
                </button>
                <button
                  type="button"
                  onClick={() => setScope('global')}
                  disabled={submitting}
                  className={`flex-1 px-3 py-2 text-sm rounded border transition-colors ${
                    scope === 'global'
                      ? 'bg-blue-50 border-blue-500 text-blue-900'
                      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Team-wide
                </button>
              </div>
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
                    disabled={submitting}
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
                disabled={submitting || !name.trim()}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: COLORS.midnight }}
              >
                {submitting ? 'Creating…' : 'Create category'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default CreateCategoryModal;
