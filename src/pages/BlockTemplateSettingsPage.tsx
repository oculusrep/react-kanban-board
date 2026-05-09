import React, { useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  createBlockTemplate,
  deleteBlockTemplate,
  updateBlockTemplate,
  useTaskBlockTemplates,
} from '../hooks/useTaskBlocks';
import {
  IsoWeekday,
  TaskBlockCategory,
  TaskBlockTemplate,
} from '../types/taskBlock';

// Block template management page (spec §5.2). Lives at /settings/time-blocks.
// Each user defines their own recurring block templates from scratch — no
// pre-seeded defaults (per spec §5.2 first-run UX).

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

// Renders an "8:00 AM" string from a 'HH:MM' or 'HH:MM:SS' time-of-day value.
const formatTime12 = (t: string): string => {
  const [hh, mm] = t.split(':');
  const h = parseInt(hh, 10);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mm} ${period}`;
};

// "8:00 AM - 10:00 AM" plus a "(2 hr)" or "(30 min)" duration tag.
const formatScheduleRange = (start: string, durationMin: number): string => {
  const [hh, mm] = start.split(':').map((s) => parseInt(s, 10));
  const startMin = hh * 60 + mm;
  const endMin = startMin + durationMin;
  const endH = Math.floor(endMin / 60) % 24;
  const endM = endMin % 60;
  const endStr = `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}`;
  const durationStr =
    durationMin >= 60
      ? `${(durationMin / 60).toFixed(durationMin % 60 ? 1 : 0).replace(/\.0$/, '')} hr`
      : `${durationMin} min`;
  return `${formatTime12(start)} – ${formatTime12(endStr)} (${durationStr})`;
};

// Compresses [1,2,3,4,5] → "Mon–Fri", [1,3,5] → "Mon, Wed, Fri", [6,7] → "Sat, Sun".
// Detects a contiguous range only when all values fall in a single ascending span.
const formatWeekdays = (days: number[]): string => {
  if (!days || days.length === 0) return '—';
  const sorted = [...days].sort((a, b) => a - b);
  const isContiguous = sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1);
  if (isContiguous && sorted.length >= 2) {
    const first = WEEKDAYS.find((w) => w.value === sorted[0])?.short;
    const last = WEEKDAYS.find((w) => w.value === sorted[sorted.length - 1])?.short;
    return `${first}–${last}`;
  }
  return sorted
    .map((v) => WEEKDAYS.find((w) => w.value === v)?.short ?? '?')
    .join(', ');
};

interface FormState {
  name: string;
  category: TaskBlockCategory;
  byweekday: IsoWeekday[];
  start_time: string; // 'HH:MM'
  duration_minutes: number;
  active: boolean;
}

const blankForm = (): FormState => ({
  name: '',
  category: 'pipeline',
  byweekday: [1, 2, 3, 4, 5],
  start_time: '09:00',
  duration_minutes: 60,
  active: true,
});

const fromTemplate = (t: TaskBlockTemplate): FormState => ({
  name: t.name,
  category: t.category as TaskBlockCategory,
  byweekday: (t.byweekday ?? []) as IsoWeekday[],
  start_time: t.start_time.slice(0, 5),
  duration_minutes: t.duration_minutes,
  active: t.active,
});

export const BlockTemplateSettingsPage: React.FC = () => {
  const { userTableId } = useAuth();
  const { templates, loading, error, refetch } = useTaskBlockTemplates({
    ownerId: userTableId,
    activeOnly: false,
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(blankForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { active, inactive } = useMemo(() => {
    const a: TaskBlockTemplate[] = [];
    const i: TaskBlockTemplate[] = [];
    for (const t of templates) (t.active ? a : i).push(t);
    return { active: a, inactive: i };
  }, [templates]);

  const openCreate = () => {
    setForm(blankForm());
    setCreating(true);
    setEditingId(null);
    setFormError(null);
  };

  const openEdit = (t: TaskBlockTemplate) => {
    setForm(fromTemplate(t));
    setEditingId(t.id);
    setCreating(false);
    setFormError(null);
  };

  const cancelForm = () => {
    setCreating(false);
    setEditingId(null);
    setFormError(null);
  };

  const validate = (f: FormState): string | null => {
    if (!f.name.trim()) return 'Name is required.';
    if (f.byweekday.length === 0) return 'Pick at least one day of the week.';
    if (!f.start_time) return 'Start time is required.';
    if (!Number.isFinite(f.duration_minutes) || f.duration_minutes <= 0) {
      return 'Duration must be greater than 0 minutes.';
    }
    return null;
  };

  const handleSave = async () => {
    if (!userTableId) {
      setFormError('Not authenticated.');
      return;
    }
    const v = validate(form);
    if (v) {
      setFormError(v);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      if (editingId) {
        await updateBlockTemplate(editingId, {
          name: form.name.trim(),
          category: form.category,
          byweekday: form.byweekday,
          start_time: form.start_time,
          duration_minutes: form.duration_minutes,
          active: form.active,
        });
      } else {
        await createBlockTemplate({
          owner_id: userTableId,
          name: form.name.trim(),
          category: form.category,
          byweekday: form.byweekday,
          start_time: form.start_time,
          duration_minutes: form.duration_minutes,
          active: form.active,
        });
      }
      cancelForm();
      refetch();
    } catch (err) {
      console.error(err);
      setFormError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (t: TaskBlockTemplate) => {
    try {
      await updateBlockTemplate(t.id, { active: !t.active });
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to toggle active');
    }
  };

  const handleDelete = async (t: TaskBlockTemplate) => {
    if (!confirm(`Delete template "${t.name}"? Existing instances will keep their data but lose the link to the template.`)) return;
    try {
      await deleteBlockTemplate(t.id);
      refetch();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const toggleDay = (d: IsoWeekday) => {
    setForm((f) => ({
      ...f,
      byweekday: f.byweekday.includes(d)
        ? f.byweekday.filter((x) => x !== d)
        : [...f.byweekday, d].sort((a, b) => a - b),
    }));
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold" style={{ color: COLORS.midnight }}>
            Time Blocks
          </h1>
          {!creating && !editingId && (
            <button
              type="button"
              onClick={openCreate}
              className="text-sm font-medium px-3 py-1.5 rounded"
              style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
            >
              + New template
            </button>
          )}
        </div>
        <p className="text-sm mb-6" style={{ color: COLORS.steel }}>
          Recurring block definitions. Each block reserves a chunk of your day for one
          category of work and can hold tasks scheduled into it. New here? Start with
          one or two and grow from there.
        </p>

        {(creating || editingId) && (
          <div
            className="bg-white rounded-lg p-5 mb-4 border"
            style={{ borderColor: COLORS.slate + '66' }}
          >
            <h2 className="text-lg font-semibold mb-3" style={{ color: COLORS.midnight }}>
              {editingId ? 'Edit template' : 'New template'}
            </h2>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                  Name
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Prospecting"
                  className="w-full px-3 py-1.5 text-sm rounded border"
                  style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                  Category
                </label>
                <select
                  value={form.category}
                  onChange={(e) =>
                    setForm({ ...form, category: e.target.value as TaskBlockCategory })
                  }
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

              <div>
                <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                  Days of week
                </label>
                <div className="flex gap-1 flex-wrap">
                  {WEEKDAYS.map((d) => {
                    const on = form.byweekday.includes(d.value);
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

              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                    Start time
                  </label>
                  <input
                    type="time"
                    value={form.start_time}
                    onChange={(e) => setForm({ ...form, start_time: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm rounded border"
                    style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium mb-1" style={{ color: COLORS.steel }}>
                    Duration (minutes)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step={15}
                    value={form.duration_minutes}
                    onChange={(e) =>
                      setForm({ ...form, duration_minutes: parseInt(e.target.value || '0', 10) })
                    }
                    className="w-full px-3 py-1.5 text-sm rounded border"
                    style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
                  />
                </div>
              </div>

              {editingId && (
                <label className="flex items-center gap-2 text-sm" style={{ color: COLORS.steel }}>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(e) => setForm({ ...form, active: e.target.checked })}
                  />
                  Active
                </label>
              )}

              {formError && (
                <div className="text-sm" style={{ color: COLORS.warning }}>
                  {formError}
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="text-sm font-medium px-3 py-1.5 rounded disabled:opacity-50"
                  style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  onClick={cancelForm}
                  disabled={saving}
                  className="text-sm font-medium px-3 py-1.5 rounded border disabled:opacity-50"
                  style={{ borderColor: COLORS.slate, color: COLORS.steel }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div
            className="mb-4 p-3 rounded text-sm"
            style={{ color: COLORS.warning, backgroundColor: '#fff5ec' }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-sm" style={{ color: COLORS.slate }}>
            Loading templates…
          </div>
        ) : templates.length === 0 && !creating ? (
          <div
            className="bg-white rounded-lg p-6 border text-center"
            style={{ borderColor: COLORS.slate + '66', color: COLORS.slate }}
          >
            <p className="text-sm">No templates yet. Click "+ New template" to add one.</p>
          </div>
        ) : (
          <>
            <TemplateSection title="Active" templates={active}>
              {(t) => (
                <TemplateRow
                  key={t.id}
                  template={t}
                  onEdit={() => openEdit(t)}
                  onToggleActive={() => handleToggleActive(t)}
                  onDelete={() => handleDelete(t)}
                />
              )}
            </TemplateSection>
            {inactive.length > 0 && (
              <TemplateSection title="Inactive" templates={inactive}>
                {(t) => (
                  <TemplateRow
                    key={t.id}
                    template={t}
                    onEdit={() => openEdit(t)}
                    onToggleActive={() => handleToggleActive(t)}
                    onDelete={() => handleDelete(t)}
                  />
                )}
              </TemplateSection>
            )}
          </>
        )}
      </div>
    </div>
  );
};

const TemplateSection: React.FC<{
  title: string;
  templates: TaskBlockTemplate[];
  children: (t: TaskBlockTemplate) => React.ReactNode;
}> = ({ title, templates, children }) => {
  if (templates.length === 0) return null;
  return (
    <div className="mb-5">
      <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: COLORS.steel }}>
        {title} ({templates.length})
      </h3>
      <div className="space-y-2">{templates.map((t) => children(t))}</div>
    </div>
  );
};

const TemplateRow: React.FC<{
  template: TaskBlockTemplate;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
}> = ({ template, onEdit, onToggleActive, onDelete }) => {
  return (
    <div
      className="bg-white rounded-lg p-3 border flex items-center justify-between"
      style={{
        borderColor: COLORS.slate + '66',
        opacity: template.active ? 1 : 0.65,
      }}
    >
      <div className="min-w-0">
        <div className="text-sm font-medium" style={{ color: COLORS.midnight }}>
          {template.name}
        </div>
        <div className="text-xs mt-0.5" style={{ color: COLORS.steel }}>
          <span className="capitalize">{template.category}</span>
          {' · '}
          {formatWeekdays(template.byweekday ?? [])}
          {' · '}
          {formatScheduleRange(template.start_time, template.duration_minutes)}
        </div>
      </div>
      <div className="flex items-center gap-1 ml-3">
        <button
          type="button"
          onClick={onEdit}
          className="text-xs px-2 py-1 rounded hover:bg-gray-50"
          style={{ color: COLORS.steel }}
        >
          Edit
        </button>
        <button
          type="button"
          onClick={onToggleActive}
          className="text-xs px-2 py-1 rounded hover:bg-gray-50"
          style={{ color: COLORS.steel }}
        >
          {template.active ? 'Deactivate' : 'Activate'}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="text-xs px-2 py-1 rounded hover:bg-red-50"
          style={{ color: '#dc2626' }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default BlockTemplateSettingsPage;
