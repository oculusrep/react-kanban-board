import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { unscheduleTask } from '../../../hooks/useTaskBlocks';
import {
  BlockInstanceWithTasks,
  ScheduledTaskWithTask,
} from '../../../types/taskBlock';

// Pipeline grouped-by-client view (spec §15.2). Collapsible per-client
// sections rolled up via task → client (direct), then task → deal/property/
// site_submit → client (FK chain). Tasks without a client roll-up land in
// "Unlinked" at the bottom.
//
// Drag-and-drop is intentionally disabled in this view — reorder by
// flipping back to Flat. The grouped view is for visual rollup, not
// planning. Same trade-off the spec implies (§15.2 calls it a view mode).

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
} as const;

const ownerInitials = (st: ScheduledTaskWithTask): string => {
  const u = st.task.owner;
  if (!u) return '?';
  const first = u.first_name?.[0] ?? '';
  const last = u.last_name?.[0] ?? '';
  return (first + last).toUpperCase() || u.email?.[0]?.toUpperCase() || '?';
};

const ownerName = (st: ScheduledTaskWithTask): string => {
  const u = st.task.owner;
  if (!u) return 'Unassigned';
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email || 'Unnamed';
};

// Resolve the client_id this task should group under. Direct task.client_id
// wins; otherwise walk the FK chain through deal → property → site_submit.
// `task.deal` is the full row from the join, so `client_id` is on it without
// any extra fetch.
const resolveClientId = (st: ScheduledTaskWithTask): string | null => {
  const t = st.task;
  if (t.client_id) return t.client_id;
  // Each linked-object row has a client_id column (where applicable). Some
  // may be null; fall through to the next.
  const deal = t.deal as { client_id?: string | null } | undefined;
  if (deal?.client_id) return deal.client_id;
  const property = t.property as { client_id?: string | null } | undefined;
  if (property?.client_id) return property.client_id;
  const siteSubmit = t.site_submit as { client_id?: string | null } | undefined;
  if (siteSubmit?.client_id) return siteSubmit.client_id;
  return null;
};

interface PipelineGroupedViewProps {
  instance: BlockInstanceWithTasks;
  onTaskClick?: (taskId: string) => void;
  onChanged: () => void;
}

export const PipelineGroupedView: React.FC<PipelineGroupedViewProps> = ({
  instance,
  onTaskClick,
  onChanged,
}) => {
  const [clientNames, setClientNames] = useState<Map<string, string>>(new Map());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Group tasks by resolved client_id. 'unlinked' is the sentinel bucket.
  const groups = useMemo(() => {
    const map = new Map<string, ScheduledTaskWithTask[]>();
    for (const st of instance.scheduled_tasks ?? []) {
      const cid = resolveClientId(st) ?? 'unlinked';
      const arr = map.get(cid) ?? [];
      arr.push(st);
      map.set(cid, arr);
    }
    return map;
  }, [instance.scheduled_tasks]);

  // One round-trip to resolve client names for the current set of group ids.
  useEffect(() => {
    const ids = Array.from(groups.keys()).filter((id) => id !== 'unlinked');
    if (ids.length === 0) return;
    let cancelled = false;
    supabase
      .from('client')
      .select('id, client_name')
      .in('id', ids)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const next = new Map<string, string>();
        for (const c of data as { id: string; client_name: string | null }[]) {
          next.set(c.id, c.client_name || 'Client');
        }
        setClientNames(next);
      });
    return () => {
      cancelled = true;
    };
  }, [groups]);

  const toggleCollapsed = (cid: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(cid)) next.delete(cid);
      else next.add(cid);
      return next;
    });
  };

  const handleRemove = async (e: React.MouseEvent, taskId: string) => {
    e.stopPropagation();
    try {
      await unscheduleTask(taskId);
      onChanged();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to remove task');
    }
  };

  // Stable order: named clients alphabetical first, "Unlinked" last.
  const sortedKeys = useMemo(() => {
    const keys = Array.from(groups.keys());
    return keys.sort((a, b) => {
      if (a === 'unlinked') return 1;
      if (b === 'unlinked') return -1;
      const an = clientNames.get(a) ?? a;
      const bn = clientNames.get(b) ?? b;
      return an.localeCompare(bn);
    });
  }, [groups, clientNames]);

  return (
    <div className="mt-2 space-y-2">
      {sortedKeys.map((cid) => {
        const tasks = groups.get(cid) ?? [];
        const label = cid === 'unlinked' ? 'Unlinked' : clientNames.get(cid) ?? 'Loading…';
        const isCollapsed = collapsed.has(cid);
        return (
          <div key={cid} className="rounded border" style={{ borderColor: COLORS.slate + '33' }}>
            <button
              type="button"
              onClick={() => toggleCollapsed(cid)}
              className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-gray-50"
            >
              <div className="flex items-center gap-1.5">
                <span style={{ color: COLORS.slate }}>{isCollapsed ? '▸' : '▾'}</span>
                <span className="text-xs font-semibold" style={{ color: COLORS.midnight }}>
                  {label}
                </span>
                <span className="text-xs" style={{ color: COLORS.slate }}>
                  ({tasks.length})
                </span>
              </div>
            </button>
            {!isCollapsed && (
              <div className="space-y-1 px-2 pb-2">
                {tasks.map((st) => {
                  const completed = st.task.status === 'completed';
                  return (
                    <div
                      key={st.id}
                      className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                      style={{ color: COLORS.midnight }}
                      onClick={() => onTaskClick?.(st.task.id)}
                    >
                      <span style={{ color: completed ? '#16a34a' : COLORS.slate }}>
                        {completed ? '✓' : '○'}
                      </span>
                      <span
                        className="flex-1 truncate"
                        style={{
                          textDecoration: completed ? 'line-through' : undefined,
                          opacity: completed ? 0.6 : 1,
                        }}
                        title={st.task.subject}
                      >
                        {st.task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                        {st.task.subject}
                      </span>
                      {st.task.duration_minutes && (
                        <span className="text-xs whitespace-nowrap" style={{ color: COLORS.slate }}>
                          {st.task.duration_minutes}m
                        </span>
                      )}
                      <span
                        className="text-xs whitespace-nowrap"
                        style={{ color: COLORS.steel }}
                        title={ownerName(st)}
                      >
                        {ownerInitials(st)}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => handleRemove(e, st.task.id)}
                        className="text-xs px-1 rounded hover:bg-red-50 ml-1"
                        style={{ color: '#dc2626' }}
                        title="Remove from block (task itself is not deleted)"
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default PipelineGroupedView;
