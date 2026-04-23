import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useAuth } from '../../../contexts/AuthContext';
import {
  BRAND_COLOR_DARK,
  BRAND_COLOR_LIGHT,
  BRAND_COLOR_MED,
  BRAND_COLOR_WARN,
} from './shared';

interface ClosureAlert {
  id: string;
  location_id: string;
  detected_at: string;
  previous_status: string | null;
  new_status: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
  merchant_location: {
    id: string;
    name: string;
    formatted_address: string | null;
    brand_id: string;
    merchant_brand: {
      name: string;
      merchant_category: { name: string } | null;
    } | null;
  } | null;
}

type AckFilter = 'unacknowledged' | 'all';

export default function ClosureAlertsTab() {
  const { userTableId } = useAuth();
  const [alerts, setAlerts] = useState<ClosureAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AckFilter>('unacknowledged');
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadAlerts = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: selErr } = await supabase
        .from('merchant_closure_alert')
        .select(
          'id, location_id, detected_at, previous_status, new_status, acknowledged_by, acknowledged_at, merchant_location(id, name, formatted_address, brand_id, merchant_brand(name, merchant_category(name)))',
        )
        .order('detected_at', { ascending: false })
        .limit(500);
      if (selErr) throw selErr;
      setAlerts((data as unknown as ClosureAlert[]) ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load alerts');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const filtered = useMemo(
    () =>
      alerts.filter((a) => (filter === 'unacknowledged' ? a.acknowledged_at === null : true)),
    [alerts, filter],
  );

  const acknowledge = async (alert: ClosureAlert) => {
    if (!userTableId) {
      window.alert('Unable to acknowledge: current user not found in the user table.');
      return;
    }
    setSavingId(alert.id);
    try {
      const now = new Date().toISOString();
      const { error: updErr } = await supabase
        .from('merchant_closure_alert')
        .update({ acknowledged_by: userTableId, acknowledged_at: now })
        .eq('id', alert.id);
      if (updErr) throw updErr;
      setAlerts((prev) =>
        prev.map((a) =>
          a.id === alert.id ? { ...a, acknowledged_by: userTableId, acknowledged_at: now } : a,
        ),
      );
    } catch (e: unknown) {
      window.alert(`Acknowledge failed: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setSavingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = alerts.length;
    const unacked = alerts.filter((a) => a.acknowledged_at === null).length;
    return { total, unacked };
  }, [alerts]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard label="Total alerts (last 500)" value={stats.total} />
        <StatCard
          label="Unacknowledged"
          value={stats.unacked}
          accent={stats.unacked > 0 ? BRAND_COLOR_WARN : BRAND_COLOR_LIGHT}
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200 flex justify-between items-center">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as AckFilter)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="unacknowledged">Unacknowledged only</option>
            <option value="all">All alerts</option>
          </select>
          <button
            onClick={loadAlerts}
            className="px-3 py-2 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-100"
          >
            Refresh
          </button>
        </div>

        {loading && (
          <div className="p-8 text-center text-gray-500 text-sm">Loading alerts…</div>
        )}
        {error && (
          <div className="p-6 text-sm text-red-700 bg-red-50 border border-red-200 rounded m-4">
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <EmptyState filter={filter} />
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  <th className="px-4 py-3">Detected</th>
                  <th className="px-4 py-3">Brand</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3 w-48">Status change</th>
                  <th className="px-4 py-3 w-32">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((a) => {
                  const isSaving = savingId === a.id;
                  const isAcked = a.acknowledged_at !== null;
                  const brand = a.merchant_location?.merchant_brand;
                  return (
                    <tr
                      key={a.id}
                      className={`${isAcked ? 'opacity-60' : ''} hover:bg-gray-50`}
                    >
                      <td className="px-4 py-3 text-xs text-gray-600">
                        {formatDate(a.detected_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium" style={{ color: BRAND_COLOR_DARK }}>
                          {brand?.name ?? '—'}
                        </div>
                        {brand?.merchant_category?.name && (
                          <div className="text-xs text-gray-500">
                            {brand.merchant_category.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-sm">{a.merchant_location?.name ?? '—'}</div>
                        {a.merchant_location?.formatted_address && (
                          <div className="text-xs text-gray-500">
                            {a.merchant_location.formatted_address}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge previous={a.previous_status} next={a.new_status} />
                      </td>
                      <td className="px-4 py-3">
                        {isAcked ? (
                          <span
                            className="text-xs italic text-gray-500"
                            title={`Acknowledged ${formatDate(a.acknowledged_at!)}`}
                          >
                            acknowledged
                          </span>
                        ) : (
                          <button
                            onClick={() => acknowledge(a)}
                            disabled={isSaving}
                            className="px-2 py-1 text-xs text-white rounded hover:opacity-90 disabled:opacity-50"
                            style={{ backgroundColor: BRAND_COLOR_MED }}
                          >
                            {isSaving ? 'Saving…' : 'Acknowledge'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="text-xs font-medium uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-bold mt-1" style={{ color: accent ?? BRAND_COLOR_DARK }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

function StatusBadge({ previous, next }: { previous: string | null; next: string }) {
  const label = (s: string) =>
    s
      .replace('_', ' ')
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="px-2 py-0.5 rounded bg-gray-100 text-gray-600">
        {previous ? label(previous) : '—'}
      </span>
      <span className="text-gray-400">→</span>
      <span
        className="px-2 py-0.5 rounded font-medium"
        style={{
          backgroundColor: next === 'OPERATIONAL' ? '#DCFCE7' : '#FEE2E2',
          color: next === 'OPERATIONAL' ? '#166534' : '#991B1B',
        }}
      >
        {label(next)}
      </span>
    </div>
  );
}

function EmptyState({ filter }: { filter: AckFilter }) {
  return (
    <div className="p-12 text-center">
      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
        style={{ backgroundColor: '#F1F5F9' }}>
        <span className="text-2xl">🔕</span>
      </div>
      <h3 className="text-base font-medium" style={{ color: BRAND_COLOR_DARK }}>
        {filter === 'unacknowledged' ? 'No unacknowledged alerts' : 'No alerts yet'}
      </h3>
      <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
        {filter === 'unacknowledged'
          ? "All caught up. New alerts appear here when the monthly refresh job detects a business_status change."
          : 'Alerts will appear here once the monthly Google Places refresh job detects closures or re-openings across cached merchant locations.'}
      </p>
    </div>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}
