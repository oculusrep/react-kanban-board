import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { StarbucksStoreWithSnapshot, StarbucksSnapshot } from '../layers/StarbucksLayer';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface StarbucksSlideoutProps {
  store: StarbucksStoreWithSnapshot;
  onClose: () => void;
  topOffset?: number;
}

const STARBUCKS_GREEN = '#00704A';

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  if (Math.abs(val) >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (Math.abs(val) >= 1_000) return `$${Math.round(val / 1_000)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(val);
}

function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

const StarbucksSlideout: React.FC<StarbucksSlideoutProps> = ({ store, onClose, topOffset = 0 }) => {
  const [snapshots, setSnapshots] = useState<StarbucksSnapshot[]>(
    store.latest_snapshot ? [store.latest_snapshot] : []
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('starbucks_snapshot')
          .select('*')
          .eq('store_number', store.store_number)
          .order('snapshot_date', { ascending: false });
        if (!error && data) setSnapshots(data);
      } catch (err) {
        console.error('Failed to load Starbucks snapshots:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [store.store_number]);

  // Chart data — RTM Sales over time, ascending for the chart
  const chartData = [...snapshots]
    .filter(s => s.rtm_sales !== null)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    .map(s => ({
      date: formatDate(s.snapshot_date),
      sales: s.rtm_sales,
    }));

  const hasChart = chartData.length >= 2;

  return (
    <div
      style={{
        position: 'fixed',
        top: 64 + topOffset,
        right: 0,
        bottom: 0,
        width: 480,
        background: '#0f172a',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#e2e8f0' }}>
              {store.store_name || `Store ${store.store_number}`}
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
              #{store.store_number} · {[store.city, store.county].filter(Boolean).join(', ')}
            </div>
            {store.market && (
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>{store.market}</div>
            )}
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >
            ×
          </button>
        </div>

        {/* Quick stats from latest snapshot */}
        {store.latest_snapshot && (
          <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
            <Stat label="Open Date" value={formatDate(store.open_date)} />
            <Stat label="Type" value={store.latest_snapshot.store_type || '—'} />
            <Stat label="Deal" value={store.latest_snapshot.deal_type || '—'} />
            <Stat label="Age" value={store.latest_snapshot.store_age != null ? `${store.latest_snapshot.store_age}y` : '—'} />
          </div>
        )}
      </div>

      {/* Snapshot history table */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 16px' }}>
        <div style={{ padding: '12px 20px 6px', fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Snapshot History {loading && '(loading...)'}
        </div>

        {snapshots.length === 0 && !loading && (
          <div style={{ padding: '16px 20px', color: '#64748b', fontSize: 13 }}>No snapshots available.</div>
        )}

        {snapshots.map(snap => (
          <div
            key={snap.id}
            style={{
              margin: '0 16px 8px',
              background: '#1e293b',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', marginBottom: 8 }}>
              {formatDate(snap.snapshot_date)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px' }}>
              <SnapRow label="RTM Sales"    value={formatCurrency(snap.rtm_sales)} />
              <SnapRow label="Annual Rent"  value={formatCurrency(snap.annual_rent)} />
              <SnapRow label="RTM Contrib"  value={formatCurrency(snap.rtm_contribution)} />
              <SnapRow label="RTM Cash Flow" value={formatCurrency(snap.rtm_cash_flow)} />
              <SnapRow label="Rent % Sales" value={formatPct(snap.rent_pct_of_sales)} />
              <SnapRow label="TC %"         value={formatPct(snap.tc_pct)} />
              <SnapRow label="AWS 12 Wk"   value={formatCurrency(snap.aws_last_12_wks)} />
              <SnapRow label="Store Age"    value={snap.store_age != null ? `${snap.store_age}y` : '—'} />
              {snap.lease_exp_date && <SnapRow label="Lease Exp" value={formatDate(snap.lease_exp_date)} />}
              {snap.landlord && <SnapRow label="Landlord" value={snap.landlord} />}
              {snap.sales_channel_mix && (
                <div style={{ gridColumn: '1 / -1', marginTop: 2 }}>
                  <span style={{ fontSize: 10, color: '#64748b' }}>Channel Mix: </span>
                  <span style={{ fontSize: 10, color: '#94a3b8' }}>{snap.sales_channel_mix}</span>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* RTM Sales chart — below snapshot cards */}
        {hasChart && (
          <div style={{ margin: '16px 16px 8px' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              RTM Sales Performance
            </div>
            <div
              style={{
                position: 'relative',
                borderRadius: 16,
                overflow: 'hidden',
                height: 300,
                background: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
                boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
              }}
            >
              {/* Glow */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.35,
                background: `radial-gradient(circle at 20% 50%, rgba(0,112,74,0.25), transparent 50%), radial-gradient(circle at 80% 50%, rgba(0,178,118,0.15), transparent 50%)`,
              }} />
              {/* Grid */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none', opacity: 0.05,
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }} />
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 28, right: 24, left: 16, bottom: 28 }}>
                  <defs>
                    <linearGradient id="sbSalesGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={STARBUCKS_GREEN} stopOpacity={0.45} />
                      <stop offset="55%" stopColor={STARBUCKS_GREEN} stopOpacity={0.15} />
                      <stop offset="100%" stopColor={STARBUCKS_GREEN} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#334155', strokeWidth: 2 }}
                    tickLine={false}
                    label={{ value: 'Snapshot', position: 'bottom', offset: 10, fill: '#cbd5e1', fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 600 }}
                    axisLine={{ stroke: '#334155', strokeWidth: 2 }}
                    tickLine={false}
                    tickFormatter={v => `$${(v / 1_000_000).toFixed(1)}M`}
                    width={60}
                    label={{ value: 'RTM Sales', angle: -90, position: 'insideLeft', offset: -5, fill: '#cbd5e1', fontSize: 11, fontWeight: 700 }}
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: 8, color: '#f8fafc' }}
                    formatter={(v: any) => [formatCurrency(v as number), 'RTM Sales']}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    stroke={STARBUCKS_GREEN}
                    strokeWidth={3}
                    fill="url(#sbSalesGradient)"
                    dot={{ fill: STARBUCKS_GREEN, stroke: '#00a86b', strokeWidth: 2, r: 5 }}
                    activeDot={{ fill: '#00a86b', stroke: STARBUCKS_GREEN, strokeWidth: 2, r: 7 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ fontSize: 13, color: '#e2e8f0', fontWeight: 600, marginTop: 1 }}>{value}</div>
  </div>
);

const SnapRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
    <span style={{ color: '#64748b' }}>{label}</span>
    <span style={{ color: '#e2e8f0', fontWeight: 500 }}>{value}</span>
  </div>
);

export default StarbucksSlideout;
