import React from 'react';
import type { StarbucksLicensedStore } from '../layers/StarbucksLicensedStoreLayer';

interface StarbucksLicensedStorePopupProps {
  store: StarbucksLicensedStore;
  onClose: () => void;
}

const STARBUCKS_GREEN = '#00704A';

function fmtCoord(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'N/A';
  return v.toFixed(6);
}

function fmtSqft(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'N/A';
  return new Intl.NumberFormat('en-US').format(v) + ' sqft';
}

const StarbucksLicensedStorePopup: React.FC<StarbucksLicensedStorePopupProps> = ({ store, onClose }) => {
  // Prefer verified coords if present (shows the actual pin position)
  const lat = store.verified_latitude ?? store.latitude;
  const lng = store.verified_longitude ?? store.longitude;
  const isVerified = store.verified_latitude != null && store.verified_longitude != null;

  return (
    <div
      style={{
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
        width: 280,
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
            #{store.store_number} · Licensed Store
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
            <Row label="Store Type" value={store.store_type || 'N/A'} highlight />
            <Row label="Segment"    value={store.segment || 'N/A'} />
            <Row label="Address"    value={[store.address, store.suite].filter(Boolean).join(', ') || 'N/A'} />
            <Row label="City"       value={store.city || 'N/A'} />
            <Row label="State"      value={store.state || 'N/A'} />
            <Row label="Postal Code" value={store.postal_code || 'N/A'} />
            <Row label="Latitude"   value={fmtCoord(lat)} />
            <Row label="Longitude"  value={fmtCoord(lng)} />
            <Row label="Store Sqft" value={fmtSqft(store.store_sqft)} />
          </tbody>
        </table>

        {isVerified && (
          <div style={{ fontSize: 10, color: STARBUCKS_GREEN, marginTop: 6, textAlign: 'right', fontWeight: 600 }}>
            ✓ Verified location
          </div>
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string; highlight?: boolean }> = ({ label, value, highlight }) => (
  <tr>
    <td style={{ color: '#666', paddingBottom: 4, width: '40%', verticalAlign: 'top' }}>{label}</td>
    <td style={{ fontWeight: highlight ? 600 : 400, color: highlight ? '#002147' : '#111', paddingBottom: 4 }}>
      {value}
    </td>
  </tr>
);

export default StarbucksLicensedStorePopup;
