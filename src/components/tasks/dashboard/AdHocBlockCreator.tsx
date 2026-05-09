import React, { useState } from 'react';
import { createBlockInstance } from '../../../hooks/useTaskBlocks';
import { TaskBlockCategory } from '../../../types/taskBlock';

// Inline form for creating an ad-hoc one-off block on a specific date
// (spec §5.5). Stored as task_block_instance with template_id = NULL —
// only this date is affected.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

const CATEGORIES: { value: TaskBlockCategory; label: string }[] = [
  { value: 'prospecting', label: 'Prospecting' },
  { value: 'pipeline', label: 'Pipeline' },
  { value: 'ovis', label: 'OVIS' },
  { value: 'email', label: 'Email' },
  { value: 'personal', label: 'Personal' },
  { value: 'other', label: 'Other' },
];

interface AdHocBlockCreatorProps {
  ownerId: string;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  onDate: string;
  onCreated: () => void;
}

const defaultStartTime = (): string => {
  const d = new Date();
  // Round up to the next 30 minutes.
  const m = d.getMinutes();
  const round = m === 0 ? 0 : m <= 30 ? 30 : 60;
  const h = round === 60 ? d.getHours() + 1 : d.getHours();
  const mm = round === 60 ? 0 : round;
  return `${String(h % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const AdHocBlockCreator: React.FC<AdHocBlockCreatorProps> = ({
  ownerId,
  onDate,
  onCreated,
}) => {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TaskBlockCategory>('pipeline');
  const [startTime, setStartTime] = useState(defaultStartTime());
  const [duration, setDuration] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setCategory('pipeline');
    setStartTime(defaultStartTime());
    setDuration(60);
    setError(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      setError('Duration must be greater than 0.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createBlockInstance({
        template_id: null,
        owner_id: ownerId,
        on_date: onDate,
        start_time: startTime,
        duration_minutes: duration,
        name: name.trim(),
        category,
        status: 'scheduled',
      });
      reset();
      setOpen(false);
      onCreated();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium px-2 py-1 rounded hover:bg-gray-50"
        style={{ color: COLORS.steel }}
      >
        + Ad-hoc block
      </button>
    );
  }

  return (
    <div
      className="bg-white rounded-lg border p-3 mb-2"
      style={{ borderColor: COLORS.slate + '99' }}
    >
      <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.steel }}>
        New ad-hoc block
      </div>
      <div className="space-y-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Site visit prep)"
          className="w-full px-2 py-1 text-sm rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
          autoFocus
        />
        <div className="flex gap-2">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as TaskBlockCategory)}
            className="flex-1 px-2 py-1 text-sm rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <input
            type="time"
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            className="px-2 py-1 text-sm rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
          />
          <input
            type="number"
            min={1}
            step={15}
            value={duration}
            onChange={(e) => setDuration(parseInt(e.target.value || '0', 10))}
            placeholder="min"
            className="w-16 px-2 py-1 text-sm rounded border"
            style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
          />
        </div>
        {error && (
          <div className="text-xs" style={{ color: COLORS.warning }}>
            {error}
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving}
            className="text-xs font-medium px-2.5 py-1 rounded disabled:opacity-50"
            style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
          >
            {saving ? 'Adding…' : 'Add block'}
          </button>
          <button
            type="button"
            onClick={() => {
              reset();
              setOpen(false);
            }}
            disabled={saving}
            className="text-xs font-medium px-2.5 py-1 rounded border disabled:opacity-50"
            style={{ borderColor: COLORS.slate, color: COLORS.steel }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdHocBlockCreator;
