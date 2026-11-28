import React, { useState } from 'react';
import { mapLayerService, type MapLayerShape } from '../../services/mapLayerService';

/**
 * Collapsible list of a custom layer's shapes, shown under the layer in the
 * map's Layers menu, with inline rename (✏️ → type → Enter / ✓; Esc cancels).
 *
 * Before this, renaming a shape meant: Edit layer → select the shape on the
 * map → Format → Name. That path still works; this is the direct one.
 */
interface Props {
  shapes: (Pick<MapLayerShape, 'id' | 'name' | 'shape_type' | 'color'> & Partial<Pick<MapLayerShape, 'sort_order' | 'created_at'>>)[];
  onRenamed: () => void;
  onError: (message: string) => void;
}

const TYPE_LABEL: Record<string, string> = {
  polygon: 'Polygon',
  rectangle: 'Rectangle',
  circle: 'Circle',
  polyline: 'Line',
  point: 'Point',
};

export const CustomLayerShapeList: React.FC<Props> = ({ shapes, onRenamed, onError }) => {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  // Optimistic names so the list updates before the layer refetch lands.
  const [localNames, setLocalNames] = useState<Record<string, string | null>>({});

  if (!shapes || shapes.length === 0) return null;

  // Stable order (the embed returns shapes unordered), so "Unnamed Polygon 3" stays put.
  const ordered = [...shapes].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || (a.created_at ?? '').localeCompare(b.created_at ?? '')
  );

  const nameOf = (s: Props['shapes'][number]) => (s.id in localNames ? localNames[s.id] : s.name);

  const startEdit = (s: Props['shapes'][number]) => {
    setEditingId(s.id);
    setDraft(nameOf(s) ?? '');
  };

  const save = async (id: string) => {
    const trimmed = draft.trim();
    setSaving(true);
    try {
      // updateShape skips undefined fields, so clearing a name needs an explicit null.
      await mapLayerService.updateShape(id, { name: trimmed === '' ? (null as unknown as string) : trimmed });
      setLocalNames((prev) => ({ ...prev, [id]: trimmed === '' ? null : trimmed }));
      setEditingId(null);
      onRenamed();
    } catch (err: any) {
      onError(err?.message || 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-1 pl-11">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-xs text-gray-500 hover:text-gray-800"
      >
        {open ? '▾' : '▸'} Shapes ({shapes.length})
      </button>
      {open && (
        <ul className="mt-1 max-h-40 overflow-y-auto space-y-0.5 pr-1">
          {ordered.map((s, i) => {
            const label = nameOf(s);
            const fallback = `Unnamed ${TYPE_LABEL[s.shape_type] ?? 'shape'} ${i + 1}`;
            return (
              <li key={s.id} className="flex items-center gap-1.5 text-xs">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
                {editingId === s.id ? (
                  <>
                    <input
                      autoFocus
                      value={draft}
                      disabled={saving}
                      onChange={(e) => setDraft(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') save(s.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                      placeholder={fallback}
                      className="flex-1 min-w-0 border border-[#8FA9C8] rounded px-1 py-0.5 text-xs text-gray-900"
                    />
                    <button
                      type="button"
                      disabled={saving}
                      onClick={(e) => {
                        e.stopPropagation();
                        save(s.id);
                      }}
                      className="px-1 text-green-700 hover:bg-green-50 rounded"
                      title="Save name"
                    >
                      ✓
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingId(null);
                      }}
                      className="px-1 text-gray-500 hover:bg-gray-100 rounded"
                      title="Cancel"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className={`flex-1 min-w-0 truncate ${label ? 'text-gray-800' : 'text-gray-400 italic'}`} title={label || fallback}>
                      {label || fallback}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(s);
                      }}
                      className="px-1 text-gray-500 hover:bg-gray-100 rounded"
                      title="Rename shape"
                    >
                      ✏️
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default CustomLayerShapeList;
