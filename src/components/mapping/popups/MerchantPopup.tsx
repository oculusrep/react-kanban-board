import React from 'react';
import type { MerchantLocationWithBrand } from '../layers/MerchantLayer';

interface MerchantPopupProps {
  location: MerchantLocationWithBrand;
  onClose: () => void;
}

const STATUS_DISPLAY: Record<string, { color: string; label: string }> = {
  OPERATIONAL: { color: '#22c55e', label: 'Operational' },
  CLOSED_TEMPORARILY: { color: '#eab308', label: 'Temporarily Closed' },
  CLOSED_PERMANENTLY: { color: '#ef4444', label: 'Permanently Closed' },
};

function formatVerifiedDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

const MerchantPopup: React.FC<MerchantPopupProps> = ({ location, onClose }) => {
  const status = STATUS_DISPLAY[location.business_status] || STATUS_DISPLAY.OPERATIONAL;
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
    location.formatted_address || `${location.latitude},${location.longitude}`,
  )}&destination_place_id=${location.google_place_id}`;

  return (
    <div
      style={{
        width: 280,
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        border: '1px solid #e5e7eb',
        overflow: 'hidden',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div style={{ padding: '12px 12px 0', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        {location.brand.logo_url && (
          <img
            src={location.brand.logo_url}
            alt={location.brand.name}
            style={{ width: 32, height: 32, objectFit: 'contain', flexShrink: 0 }}
            loading="lazy"
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#002147', lineHeight: 1.3 }}>
            {location.brand.name}
          </div>
          {location.name && location.name !== location.brand.name && (
            <div style={{ fontSize: 12, color: '#4A6B94' }}>{location.name}</div>
          )}
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#8FA9C8',
            fontSize: 18,
            lineHeight: 1,
            padding: 0,
            width: 20,
            height: 20,
          }}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      {location.formatted_address && (
        <div style={{ padding: '6px 12px', fontSize: 12, color: '#374151' }}>
          {location.formatted_address}
        </div>
      )}

      <div
        style={{
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 12,
        }}
      >
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: status.color,
            display: 'inline-block',
          }}
        />
        <span style={{ color: '#374151', fontWeight: 500 }}>{status.label}</span>
        <span style={{ color: '#8FA9C8', marginLeft: 'auto', fontSize: 11 }}>
          Verified {formatVerifiedDate(location.last_verified_at)}
        </span>
      </div>

      {(location.phone || location.website) && (
        <div style={{ padding: '4px 12px 8px', fontSize: 12, color: '#4A6B94' }}>
          {location.phone && <div>{location.phone}</div>}
          {location.website && (
            <a
              href={location.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: '#4A6B94', textDecoration: 'underline', wordBreak: 'break-all' }}
            >
              {location.website.replace(/^https?:\/\//, '').replace(/\/$/, '')}
            </a>
          )}
        </div>
      )}

      <div style={{ padding: '0 12px 12px' }}>
        <a
          href={directionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'block',
            textAlign: 'center',
            padding: '8px 12px',
            background: '#002147',
            color: 'white',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
          }}
        >
          Get Directions ↗
        </a>
      </div>
    </div>
  );
};

export default MerchantPopup;
