import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { getCategoryIdByName } from '../../lib/taskCategory';

// Quick Capture bar (spec §11 #1). Always-visible single-line input at the
// top of the dashboard. Type → Enter → task lands in Inbox just like one
// Brain Dump line. Use this for the common one-task case; reach for the
// Brain Dump modal when capturing several at once.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  warning: '#A27B5C',
} as const;

interface QuickCaptureBarProps {
  ownerId: string;
  /** Bump shared dashboard refresh signal so Inbox lane refetches. */
  onSaved: () => void;
}

export const QuickCaptureBar: React.FC<QuickCaptureBarProps> = ({ ownerId, onSaved }) => {
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const subject = text.trim();
    if (!subject || saving) return;
    setSaving(true);
    setError(null);
    try {
      const otherCategoryId = await getCategoryIdByName('other');
      if (!otherCategoryId) {
        throw new Error('Default category "other" not found.');
      }
      const { error: insertError } = await supabase.from('task').insert({
        subject,
        category: 'other',
        category_id: otherCategoryId,
        owner_id: ownerId,
        created_by_id: ownerId,
        is_inbox: true,
        status: 'open',
      });
      if (insertError) throw insertError;
      setText('');
      onSaved();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Quick capture failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mb-4">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Quick capture: type a task and press Enter…"
          disabled={saving}
          className="flex-1 px-3 py-2 text-sm rounded border bg-white disabled:opacity-50"
          style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
        />
        <button
          type="submit"
          disabled={saving || !text.trim()}
          className="text-sm font-medium px-3 py-2 rounded disabled:opacity-50"
          style={{ backgroundColor: COLORS.midnight, color: '#FFFFFF' }}
        >
          {saving ? 'Saving…' : '+ Task'}
        </button>
      </div>
      {error && (
        <div className="mt-1 text-xs" style={{ color: COLORS.warning }}>
          {error}
        </div>
      )}
    </form>
  );
};

export default QuickCaptureBar;
