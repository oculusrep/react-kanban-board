import { useEffect, useRef, useState } from 'react';
import { googleMapsDayLegs, type LatLngPoint } from '../../lib/tourGoogleMapsLinks';

const MIDNIGHT = '#002147';
const SLATE = '#8FA9C8';

// Per-day "Open in Google Maps" hand-off (new tab → the Google Maps app on iPhone), plus a
// copy-link icon. Days with more than 11 points split into chained Leg 1 / Leg 2 / … links.
export function GoogleMapsDayLinks({ points }: { points: LatLngPoint[] }) {
  const legs = googleMapsDayLegs(points);
  const [copied, setCopied] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (legs.length === 0) return null;

  const copy = async (url: string, i: number) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      window.prompt('Copy this link:', url);
      return;
    }
    setCopied(i);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, paddingLeft: 20, margin: '2px 0 8px' }}>
      {legs.map((url, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'stretch' }}>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 44,
              padding: '0 14px',
              background: MIDNIGHT,
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              textDecoration: 'none',
              borderRadius: '6px 0 0 6px',
              whiteSpace: 'nowrap',
            }}
          >
            <span aria-hidden>🧭</span>
            {legs.length > 1 ? `Google Maps · Leg ${i + 1}` : 'Open in Google Maps'}
          </a>
          <button
            type="button"
            onClick={() => copy(url, i)}
            title="Copy link"
            aria-label={legs.length > 1 ? `Copy Google Maps link for leg ${i + 1}` : 'Copy Google Maps link'}
            style={{
              minWidth: 44,
              minHeight: 44,
              border: `1px solid ${MIDNIGHT}`,
              borderLeft: `1px solid ${SLATE}`,
              borderRadius: '0 6px 6px 0',
              background: '#FFFFFF',
              color: MIDNIGHT,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 600,
              padding: '0 10px',
            }}
          >
            {copied === i ? (
              '✓ Copied'
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>
        </div>
      ))}
    </div>
  );
}
