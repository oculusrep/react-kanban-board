import { useEffect } from 'react';
import './cf.css';

/** Dark "mission control" palette — mirrors the CSS variables in cf.css (for Recharts, which needs literals). */
export const CF = {
  bg: '#0B0F14',
  panel: '#11161D',
  border: '#1E2630',
  grid: '#1A212B',
  text: '#D0D7DE',
  muted: '#7D8590',
  faint: '#4A5360',
  green: '#3FB950',
  amber: '#D29922',
  red: '#F85149',
  cyan: '#39C5CF',
} as const;

const FONT_HREF =
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap';

/** Load the figure/label fonts once, only when a .cf view mounts. */
export function useCfFonts() {
  useEffect(() => {
    if (document.querySelector(`link[data-cf-fonts]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    l.setAttribute('data-cf-fonts', '1');
    document.head.appendChild(l);
  }, []);
}

/** Whole-dollar money with a true minus sign. */
export function money(n: number, cents = false): string {
  const s = Math.abs(n).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
  return n < -0.004 ? `−${s}` : s;
}

/**
 * Monospaced money. Negatives are always red. `tone` adds meaning for non-negatives:
 * 'in' = inflow (green), 'warn' = amber, 'bad' = red, 'plain' = grayscale.
 */
export function Money({ v, tone = 'plain', cents = false, className = '' }: { v: number; tone?: 'plain' | 'in' | 'warn' | 'bad'; cents?: boolean; className?: string }) {
  const color = v < -0.004 || tone === 'bad' ? 'cf-neg' : tone === 'in' && v > 0 ? 'cf-pos' : tone === 'warn' ? 'cf-warn' : '';
  return <span className={`cf-num ${color} ${className}`}>{money(v, cents)}</span>;
}
