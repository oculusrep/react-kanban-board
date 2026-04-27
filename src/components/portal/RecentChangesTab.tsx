import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface RecentChangesTabProps {
  clientIds: string[];
  onSelectSiteSubmit?: (id: string) => void;
}

interface ActivityRow {
  id: string;
  site_submit_id: string;
  activity_type: 'comment' | 'file_shared' | 'status_change';
  payload: Record<string, any>;
  created_at: string;
  actor_kind: string;
}

interface SiteSubmitRow {
  id: string;
  site_submit_name: string | null;
  client_id: string | null;
}

interface SiteSubmitWithActivity {
  siteSubmit: SiteSubmitRow;
  activities: ActivityRow[];
  lastChangeAt: string;
}

export default function RecentChangesTab({ clientIds, onSelectSiteSubmit }: RecentChangesTabProps) {
  const [grouped, setGrouped] = useState<SiteSubmitWithActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (clientIds.length === 0) {
      setGrouped([]);
      return;
    }
    load();
  }, [JSON.stringify(clientIds)]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: activity, error: activityError } = await supabase
        .from('site_submit_activity')
        .select('id, site_submit_id, activity_type, payload, created_at, actor_kind')
        .in('client_id', clientIds)
        .eq('client_visible', true)
        .gte('created_at', sevenDaysAgo)
        .order('created_at', { ascending: false });

      if (activityError) throw activityError;

      const rows = (activity || []) as ActivityRow[];
      if (rows.length === 0) {
        setGrouped([]);
        return;
      }

      const ssIds = Array.from(new Set(rows.map((r) => r.site_submit_id)));
      const { data: siteSubmits, error: ssError } = await supabase
        .from('site_submit')
        .select('id, site_submit_name, client_id')
        .in('id', ssIds);

      if (ssError) throw ssError;

      const ssById = new Map<string, SiteSubmitRow>();
      for (const ss of (siteSubmits || []) as SiteSubmitRow[]) ssById.set(ss.id, ss);

      const groupedMap = new Map<string, SiteSubmitWithActivity>();
      for (const row of rows) {
        const ss = ssById.get(row.site_submit_id);
        if (!ss) continue;
        if (!groupedMap.has(row.site_submit_id)) {
          groupedMap.set(row.site_submit_id, {
            siteSubmit: ss,
            activities: [],
            lastChangeAt: row.created_at,
          });
        }
        groupedMap.get(row.site_submit_id)!.activities.push(row);
      }

      const result = Array.from(groupedMap.values()).sort((a, b) =>
        b.lastChangeAt.localeCompare(a.lastChangeAt)
      );
      setGrouped(result);
    } catch (err: any) {
      console.error('[RecentChangesTab] Load error:', err);
      setError(err?.message || 'Failed to load recent changes');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: '#002147' }}></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center text-red-600 p-6">{error}</div>
    );
  }

  if (grouped.length === 0) {
    return (
      <div className="text-center p-12" style={{ color: '#8FA9C8' }}>
        <p>No changes in the last 7 days.</p>
      </div>
    );
  }

  return (
    <table className="min-w-full divide-y divide-gray-200">
      <thead className="bg-gray-50 sticky top-0">
        <tr>
          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#4A6B94' }}>Site Submit</th>
          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#4A6B94' }}>Last Change</th>
          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#4A6B94' }}>What Changed</th>
          <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider" style={{ color: '#4A6B94' }}>Details</th>
        </tr>
      </thead>
      <tbody className="bg-white divide-y divide-gray-200">
        {grouped.map((g) => {
          const counts = countByType(g.activities);
          return (
            <tr
              key={g.siteSubmit.id}
              onClick={() => onSelectSiteSubmit?.(g.siteSubmit.id)}
              className="hover:bg-blue-50 cursor-pointer transition-colors"
            >
              <td className="px-4 py-3 text-sm font-medium" style={{ color: '#002147' }}>
                {g.siteSubmit.site_submit_name || '—'}
              </td>
              <td className="px-4 py-3 text-sm" style={{ color: '#4A6B94' }}>
                {formatRelativeTime(g.lastChangeAt)}
              </td>
              <td className="px-4 py-3 text-sm" style={{ color: '#002147' }}>
                <div className="flex gap-2">
                  {counts.comment > 0 && <span title={`${counts.comment} comment${counts.comment > 1 ? 's' : ''}`}>💬 {counts.comment}</span>}
                  {counts.file_shared > 0 && <span title={`${counts.file_shared} file${counts.file_shared > 1 ? 's' : ''} shared`}>📎 {counts.file_shared}</span>}
                  {counts.status_change > 0 && <span title={`${counts.status_change} status change${counts.status_change > 1 ? 's' : ''}`}>🔄 {counts.status_change}</span>}
                </div>
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: '#4A6B94' }}>
                {summarizeLatest(g.activities[0])}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function countByType(activities: ActivityRow[]): Record<string, number> {
  const counts: Record<string, number> = { comment: 0, file_shared: 0, status_change: 0 };
  for (const a of activities) counts[a.activity_type] = (counts[a.activity_type] || 0) + 1;
  return counts;
}

function summarizeLatest(a: ActivityRow): string {
  if (a.activity_type === 'comment') {
    const text = String(a.payload?.text || '');
    return `"${text.slice(0, 60)}${text.length > 60 ? '…' : ''}"`;
  }
  if (a.activity_type === 'file_shared') {
    return `Shared: ${a.payload?.file_name || a.payload?.dropbox_path || 'file'}`;
  }
  if (a.activity_type === 'status_change') {
    return `${a.payload?.from_stage_label || '—'} → ${a.payload?.to_stage_label || '—'}`;
  }
  return '';
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' });
}
