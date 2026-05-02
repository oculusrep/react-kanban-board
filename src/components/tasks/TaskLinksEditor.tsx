import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { updateTask } from '../../hooks/useTasks';
import { TaskWithRelations, TaskLinkableObjectType } from '../../types/task';

// Editable links section for the TaskDetailSlideout. Lets a user add a new
// link, change an existing one, or clear it — for any of the six linkable
// object types (spec §7.1). Used inside the slideout but composable enough to
// drop elsewhere later.
//
// Search is per-type, ilike against the primary display field (with
// reasonable fallbacks for contact's first+last name and property's
// name+address). Results limited to 10.

interface TaskLinksEditorProps {
  task: TaskWithRelations;
  onChanged: () => void; // hint for parent to refetch
}

type LinkType = TaskLinkableObjectType;

interface LinkConfig {
  type: LinkType;
  label: string;
  fkColumn: keyof TaskWithRelations & string;
  table: 'client' | 'deal' | 'property' | 'site_submit' | 'assignment' | 'contact';
  routePrefix: string;
}

const LINK_CONFIGS: LinkConfig[] = [
  { type: 'client',      label: 'Client',      fkColumn: 'client_id',      table: 'client',      routePrefix: '/client/' },
  { type: 'deal',        label: 'Deal',        fkColumn: 'deal_id',        table: 'deal',        routePrefix: '/deal/' },
  { type: 'property',    label: 'Property',    fkColumn: 'property_id',    table: 'property',    routePrefix: '/property/' },
  { type: 'site_submit', label: 'Site Submit', fkColumn: 'site_submit_id', table: 'site_submit', routePrefix: '/site-submit/' },
  { type: 'assignment',  label: 'Assignment',  fkColumn: 'assignment_id',  table: 'assignment',  routePrefix: '/assignment/' },
  { type: 'contact',     label: 'Contact',     fkColumn: 'contact_id',     table: 'contact',     routePrefix: '/contact/' },
];

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
} as const;

interface SearchHit {
  id: string;
  label: string;
}

const buildSearchQuery = (table: LinkConfig['table'], term: string) => {
  const q = `%${term}%`;
  switch (table) {
    case 'client':
      return supabase.from('client').select('id, client_name').ilike('client_name', q).limit(10);
    case 'deal':
      return supabase.from('deal').select('id, deal_name').ilike('deal_name', q).limit(10);
    case 'property':
      return supabase
        .from('property')
        .select('id, property_name, address')
        .or(`property_name.ilike.${q},address.ilike.${q}`)
        .limit(10);
    case 'site_submit':
      return supabase
        .from('site_submit')
        .select('id, site_submit_name')
        .ilike('site_submit_name', q)
        .limit(10);
    case 'assignment':
      return supabase
        .from('assignment')
        .select('id, assignment_name')
        .ilike('assignment_name', q)
        .limit(10);
    case 'contact':
      return supabase
        .from('contact')
        .select('id, first_name, last_name, email')
        .or(`first_name.ilike.${q},last_name.ilike.${q},email.ilike.${q}`)
        .limit(10);
  }
};

const rowLabel = (row: Record<string, unknown>, table: LinkConfig['table']): string => {
  switch (table) {
    case 'client':
      return (row.client_name as string) || 'Unnamed';
    case 'deal':
      return (row.deal_name as string) || 'Unnamed';
    case 'property':
      return (row.property_name as string) || (row.address as string) || 'Unnamed';
    case 'site_submit':
      return (row.site_submit_name as string) || 'Unnamed';
    case 'assignment':
      return (row.assignment_name as string) || 'Unnamed';
    case 'contact': {
      const name = [row.first_name, row.last_name].filter(Boolean).join(' ');
      return name || (row.email as string) || 'Unnamed';
    }
  }
};

const currentLinkLabel = (
  task: TaskWithRelations,
  type: LinkType
): { id: string | null; label: string | null } => {
  switch (type) {
    case 'client':
      return task.client
        ? { id: task.client.id, label: task.client.client_name || 'Client' }
        : { id: null, label: null };
    case 'deal':
      return task.deal
        ? { id: task.deal.id, label: task.deal.deal_name || 'Deal' }
        : { id: null, label: null };
    case 'property':
      return task.property
        ? {
            id: task.property.id,
            label: task.property.property_name || task.property.address || 'Property',
          }
        : { id: null, label: null };
    case 'site_submit':
      return task.site_submit
        ? {
            id: task.site_submit.id,
            label: task.site_submit.site_submit_name || 'Site Submit',
          }
        : { id: null, label: null };
    case 'assignment':
      return task.assignment
        ? {
            id: task.assignment.id,
            label: task.assignment.assignment_name || 'Assignment',
          }
        : { id: null, label: null };
    case 'contact':
      return task.contact
        ? {
            id: task.contact.id,
            label:
              [task.contact.first_name, task.contact.last_name].filter(Boolean).join(' ') ||
              task.contact.email ||
              'Contact',
          }
        : { id: null, label: null };
  }
};

interface LinkRowProps {
  taskId: string;
  config: LinkConfig;
  currentId: string | null;
  currentLabel: string | null;
  onChanged: () => void;
}

const LinkRow: React.FC<LinkRowProps> = ({ taskId, config, currentId, currentLabel, onChanged }) => {
  const [editing, setEditing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    if (!editing) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data, error } = await buildSearchQuery(config.table, query.trim());
        if (error) throw error;
        const hits: SearchHit[] = (data ?? []).map((row: Record<string, unknown>) => ({
          id: row.id as string,
          label: rowLabel(row, config.table),
        }));
        setResults(hits);
      } catch (err) {
        console.error('[task link search]', err);
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, editing, config.table]);

  const setLink = async (newId: string | null) => {
    setSaving(true);
    try {
      await updateTask(taskId, { [config.fkColumn]: newId } as Record<string, unknown>);
      setEditing(false);
      setQuery('');
      setResults([]);
      onChanged();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to update link');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex items-start gap-2 py-1">
      <span
        className="text-xs font-medium pt-1 w-20 shrink-0"
        style={{ color: COLORS.steel }}
      >
        {config.label}
      </span>

      <div className="flex-1 min-w-0">
        {!editing && currentId && (
          <div className="flex items-center gap-1 flex-wrap">
            <Link
              to={`${config.routePrefix}${currentId}`}
              className="text-xs px-2 py-0.5 rounded hover:underline"
              style={{ backgroundColor: COLORS.slate + '33', color: COLORS.steel }}
              title="Open (still navigates as a page; future overlay)"
            >
              {currentLabel}
            </Link>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs px-1.5 py-0.5 rounded hover:bg-gray-100"
              style={{ color: COLORS.steel }}
              disabled={saving}
            >
              Change
            </button>
            <button
              type="button"
              onClick={() => setLink(null)}
              className="text-xs px-1.5 py-0.5 rounded hover:bg-red-50"
              style={{ color: '#dc2626' }}
              disabled={saving}
            >
              Clear
            </button>
          </div>
        )}

        {!editing && !currentId && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs px-2 py-0.5 rounded border border-dashed hover:bg-gray-50"
            style={{ borderColor: COLORS.slate, color: COLORS.slate }}
          >
            + Link {config.label}
          </button>
        )}

        {editing && (
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <input
                type="text"
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${config.label.toLowerCase()}…`}
                className="flex-1 px-2 py-1 text-xs rounded border"
                style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
              />
              <button
                type="button"
                onClick={() => {
                  setEditing(false);
                  setQuery('');
                  setResults([]);
                }}
                className="text-xs px-1.5 py-1 rounded hover:bg-gray-100"
                style={{ color: COLORS.steel }}
              >
                Cancel
              </button>
            </div>
            {searching && (
              <div className="text-xs italic" style={{ color: COLORS.slate }}>
                Searching…
              </div>
            )}
            {!searching && query.trim() && results.length === 0 && (
              <div className="text-xs italic" style={{ color: COLORS.slate }}>
                No matches.
              </div>
            )}
            {results.length > 0 && (
              <div
                className="border rounded max-h-48 overflow-y-auto"
                style={{ borderColor: COLORS.slate + '66' }}
              >
                {results.map((hit) => (
                  <button
                    key={hit.id}
                    type="button"
                    onClick={() => setLink(hit.id)}
                    disabled={saving}
                    className="block w-full text-left px-2 py-1 text-xs hover:bg-gray-50 border-b last:border-b-0"
                    style={{ borderColor: COLORS.slate + '33', color: COLORS.midnight }}
                  >
                    {hit.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export const TaskLinksEditor: React.FC<TaskLinksEditorProps> = ({ task, onChanged }) => {
  const rows = useMemo(
    () =>
      LINK_CONFIGS.map((cfg) => {
        const { id, label } = currentLinkLabel(task, cfg.type);
        return { cfg, id, label };
      }),
    [task]
  );

  return (
    <div className="space-y-1">
      {rows.map(({ cfg, id, label }) => (
        <LinkRow
          key={cfg.type}
          taskId={task.id}
          config={cfg}
          currentId={id}
          currentLabel={label}
          onChanged={onChanged}
        />
      ))}
    </div>
  );
};

export default TaskLinksEditor;
