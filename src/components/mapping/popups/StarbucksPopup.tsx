import React from 'react';
import { StarbucksStoreWithSnapshot } from '../layers/StarbucksLayer';

interface StarbucksPopupProps {
  store: StarbucksStoreWithSnapshot;
  onViewDetails?: () => void;
  onClose: () => void;
}

const STARBUCKS_GREEN = '#00704A';

function formatCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(val);
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return 'N/A';
  const [y, m, d] = dateStr.split('-');
  return `${m}/${d}/${y}`;
}

const StarbucksPopup: React.FC<StarbucksPopupProps> = ({ store, onViewDetails, onClose }) => {
  const snap = store.latest_snapshot;

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        width: 260,
        fontFamily: 'system-ui, sans-serif',
        fontSize: 13,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          background: STARBUCKS_GREEN,
          color: 'white',
          padding: '10px 12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.2 }}>
            {store.store_name || `Store ${store.store_number}`}
          </div>
          <div style={{ opacity: 0.85, fontSize: 11, marginTop: 2 }}>
            #{store.store_number} · {store.city || ''}
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: 16,
            lineHeight: 1,
            padding: '0 0 0 8px',
            opacity: 0.8,
          }}
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div style={{ padding: '10px 12px' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <Row label="Store Type"  value={snap?.store_type || 'N/A'} />
            <Row label="Deal Type"   value={snap?.deal_type || 'N/A'} />
            <Row label="Open Date"   value={formatDate(store.open_date)} />
            <Row label="Store Age"   value={snap?.store_age != null ? `${snap.store_age} yrs` : 'N/A'} />
            <Row label="Annual Rent" value={formatCurrency(snap?.annual_rent)} highlight />
            <Row label="RTM Sales"   value={formatCurrency(snap?.rtm_sales)} highlight />
          </tbody>
        </table>

        {snap?.snapshot_date && (
          <div style={{ fontSize: 10, color: '#999', marginTop: 6, textAlign: 'right' }}>
            As of {formatDate(snap.snapshot_date)}
          </div>
        )}

        {onViewDetails && (
          <button
            onClick={onViewDetails}
            style={{
              marginTop: 10,
              width: '100%',
              padding: '7px 0',
              background: STARBUCKS_GREEN,
              color: 'white',
              border: 'none',
              borderRadius: 5,
              cursor: 'pointer',
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            View Trends →
          </button>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <tr>
    <td style={{ color: '#666', paddingBottom: 4, width: '45%', verticalAlign: 'top' }}>{label}</td>
    <td style={{ fontWeight: highlight ? 600 : 400, color: highlight ? '#002147' : '#111', paddingBottom: 4 }}>
      {value}
    </td>
  </tr>
);

export default StarbucksPopup;
