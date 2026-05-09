import React, { useEffect, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import {
  deleteBlockInstance,
  updateBlockInstance,
  updateBlockTemplate,
} from '../../../hooks/useTaskBlocks';
import {
  IsoWeekday,
  TaskBlockCategory,
  TaskBlockInstance,
} from '../../../types/taskBlock';

// Block edit + skip + delete modal (spec §5.4). When the instance is linked
// to a template, the user picks an "apply to" scope: This day only / All
// future days. Ad-hoc instances (template_id = NULL) skip the scope choice
// since there's no template to fork from.

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

const WEEKDAYS: { value: IsoWeekday; short: string }[] = [
  { value: 1, short: 'Mon' },
  { value: 2, short: 'Tue' },
  { value: 3, short: 'Wed' },
  { value: 4, short: 'Thu' },
  { value: 5, short: 'Fri' },
  { value: 6, short: 'Sat' },
  { value: 7, short: 'Sun' },
];

type Scope = 'instance' | 'template';

interface BlockEditModalProps {
  instance: TaskBlockInstance;
  onClose: () => void;
  onChanged: () => void;
}

export const BlockEditModal: React.FC<BlockEditModalProps> = ({
  instance,
  onClose,
  onChanged,
}) => {
  const isTemplated = !!instance.template_id;
  const [name, setName] = useState(instance.name);
  const [category, setCategory] = useState<TaskBlockCategory>(
    instance.category as TaskBlockCategory
  );
  const [startTime, setStartTime] = useState(instance.start_time.slice(0, 5));
  const [duration, setDuration] = useState(instance.duration_minutes);
  const [byweekday, setByweekday] = useState<IsoWeekday[]>([1, 2, 3, 4, 5]);

  // Fetch the template's current byweekday on demand. Only matters when the
  // user picks "All future days" — otherwise we never read this.
  useEffect(() => {
    if (!instance.template_id) return;
    let cancelled = false;
    supabase
      .from('task_block_template')
      .select('byweekday')
      .eq('id', instance.template_id)
      .single()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.warn('[BlockEditModal] failed to load template byweekday:', error);
          return;
        }
        if (data?.byweekday) setByweekday(data.byweekday as IsoWeekday[]);
      });
    return () => {
      cancelled = true;
    };
  }, [instance.template_id]);
  const [scope, setScope] = useState<Scope>('instance');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleDay = (d: IsoWeekday) => {
    setByweekday((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    if (!Number.isFinite(duration) || duration <= 0) {
      setError('Duration must be greater than 0.');
      return;
    }
    if (isTemplated && scope === 'template' && byweekday.length === 0) {
      setError('Pick at least one day of the week.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (isTemplated && scope === 'template' && instance.template_id) {
        await updateBlockTemplate(instance.template_id, {
          name: name.trim(),
          category,
          start_time: startTime,
          duration_minutes: duration,
          byweekday,
        });
        // Today's instance is intentionally untouched per spec §5.4 ("All
        // future" leaves the current day alone).
      } else {
        await updateBlockInstance(instance.id, {
          name: name.trim(),
          category,
          start_time: startTime,
          duration_minutes: duration,
        });
      }
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!confirm(`Skip "${instance.name}" for this day?`)) return;
    setSaving(true);
    setError(null);
    try {
      await updateBlockInstance(instance.id, { status: 'skipped' });
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Skip failed');
    } finally {
      setSaving(false);
    }
  };

  const handleUnskip = async () => {
    setSaving(true);
    setError(null);
    try {
      await updateBlockInstance(instance.id, { status: 'scheduled' });
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Unskip failed');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAdhoc = async () => {
    if (!confirm(`Delete this ad-hoc block? Any tasks scheduled into it will be unscheduled.`)) return;
    setSaving(true);
    setError(null);
    try {
      await deleteBlockInstance(instance.id);
      onChanged();
      onClose();
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-start justify-center pt-16 px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-md"
        style={{ borderColor: COLORS.slate + '99' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center justify-between px-4 py-2 border-b"
          style={{ borderColor: COLORS.slate + '33' }}
        >
          <h2 className="text-base font-semibold" style={{ color: COLORS.midnight }}>
            Edit block {isTemplated ? '' : '(ad-hoc)'}
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

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-1.5 text-sm rounded border"
              style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
            />
          </div>

          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskBlockCategory)}
              className="w-full px-3 py-1.5 text-sm rounded border"
              style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                Start time
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-1.5 text-sm rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                Duration (min)
              </label>
              <input
                type="number"
                min={1}
                step={15}
                value={duration}
                onChange={(e) => setDuration(parseInt(e.target.value || '0', 10))}
                className="w-full px-3 py-1.5 text-sm rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
              />
            </div>
          </div>

          {isTemplated && (
            <>
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                  Apply to
                </label>
                <div className="flex gap-3 text-sm" style={{ color: COLORS.midnight }}>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={scope === 'instance'}
                      onChange={() => setScope('instance')}
                    />
                    This day only
                  </label>
                  <label className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      checked={scope === 'template'}
                      onChange={() => setScope('template')}
                    />
                    All future days
                  </label>
                </div>
              </div>

              {scope === 'template' && (
                <div>
                  <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                    Days of week (template)
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    {WEEKDAYS.map((d) => {
                      const on = byweekday.includes(d.value);
                      return (
                        <button
                          type="button"
                          key={d.value}
                          onClick={() => toggleDay(d.value)}
                          className="text-xs px-2.5 py-1 rounded border transition-colors"
                          style={{
                            backgroundColor: on ? COLORS.midnight : 'transparent',
                            color: on ? COLORS.white : COLORS.slate,
                            borderColor: on ? COLORS.midnight : COLORS.slate,
                          }}
                        >
                          {d.short}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {error && (
            <div className="text-sm" style={{ color: COLORS.warning }}>
              {error}
            </div>
          )}
        </div>

        <div
          className="flex items-center justify-between px-4 py-3 border-t"
          style={{ borderColor: COLORS.slate + '33' }}
        >
          <div>
            {instance.status === 'skipped' ? (
              <button
                type="button"
                onClick={handleUnskip}
                disabled={saving}
                className="text-xs font-medium px-2.5 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                style={{ color: COLORS.steel }}
              >
                Unskip this day
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSkip}
                disabled={saving}
                className="text-xs font-medium px-2.5 py-1 rounded hover:bg-gray-50 disabled:opacity-50"
                style={{ color: COLORS.steel }}
              >
                Skip this day
              </button>
            )}
            {!isTemplated && (
              <button
                type="button"
                onClick={handleDeleteAdhoc}
                disabled={saving}
                className="text-xs font-medium px-2.5 py-1 rounded hover:bg-red-50 disabled:opacity-50 ml-1"
                style={{ color: '#dc2626' }}
              >
                Delete
              </button>
            )}
          </div>
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
              disabled={saving}
              className="text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50"
              style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BlockEditModal;
