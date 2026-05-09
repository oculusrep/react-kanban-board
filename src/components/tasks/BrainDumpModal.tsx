import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';

// Brain Dump modal (spec §7.3). Full-screen textarea; each non-blank line
// becomes a new task in the Inbox. Tasks get is_inbox=TRUE, category='other'
// (column is NOT NULL, user re-categorizes during triage), owner=current user.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

interface BrainDumpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const parseLines = (text: string): string[] =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

export const BrainDumpModal: React.FC<BrainDumpModalProps> = ({ isOpen, onClose, onSaved }) => {
  const { userTableId } = useAuth();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lines = useMemo(() => parseLines(text), [text]);

  useEffect(() => {
    if (!isOpen) return;
    setText('');
    setError(null);
    // Defer focus so the textarea is mounted.
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
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

  const handleSave = async () => {
    if (!userTableId) {
      setError('Not authenticated.');
      return;
    }
    if (lines.length === 0) {
      setError('Type at least one line.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const rows = lines.map((subject) => ({
        subject,
        category: 'other' as const,
        owner_id: userTableId,
        created_by_id: userTableId,
        is_inbox: true,
        status: 'open' as const,
      }));
      // Single bulk insert — atomic, one round-trip.
      const { error: insertError } = await supabase.from('task').insert(rows);
      if (insertError) throw insertError;
      onSaved();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4 py-8"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col"
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: COLORS.slate + '33' }}
        >
          <h2 className="text-base font-semibold" style={{ color: COLORS.midnight }}>
            Brain Dump
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xl leading-none px-2"
            style={{ color: COLORS.slate }}
          >
            ×
          </button>
        </div>

        <div className="px-4 py-3 flex-1 flex flex-col min-h-0">
          <p className="text-xs mb-2" style={{ color: COLORS.steel }}>
            One task per line. They land in your Inbox for triage — set category, schedule, or pin later.
          </p>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Call Acme re: lease renewal\nFollow up with George on the LOI\nNetpay calculator for Brewster site'}
            className="flex-1 w-full px-3 py-2 text-sm rounded border resize-none font-mono"
            style={{ borderColor: COLORS.slate, color: COLORS.midnight, minHeight: 240 }}
          />
          {error && (
            <div className="mt-2 text-sm" style={{ color: COLORS.warning }}>
              {error}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: COLORS.slate + '33' }}
        >
          <span className="text-xs" style={{ color: COLORS.slate }}>
            {lines.length === 0
              ? 'No tasks yet.'
              : `${lines.length} task${lines.length === 1 ? '' : 's'} will be created.`}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="text-sm font-medium px-3 py-1.5 rounded border disabled:opacity-50"
              style={{ borderColor: COLORS.slate, color: COLORS.steel }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || lines.length === 0}
              className="text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50"
              style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
            >
              {saving ? 'Saving…' : `Save ${lines.length || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BrainDumpModal;
