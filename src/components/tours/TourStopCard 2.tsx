import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { Car } from 'lucide-react';
import { formatClock12, formatDriveMinutes, formatMinutesDuration } from '../../lib/tourRouting';

// ---------------------------------------------------------------------------
// Shared presentation for tour stops — used by the tour map schedule and the
// Reorder stops panel so both read the same: stop cards, drive connectors
// between them, and a per-day totals footer. Display only; no data access.
// All components are module-level (never define them inline in a parent render:
// a re-render would remount them and swallow clicks/focus).
// ---------------------------------------------------------------------------

export const TOUR_COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
  cardBorder: '#DCE4EE',
  subtext: '#9CA3AF',
};

const { midnight, steel, slate, terracotta, cardBorder, subtext } = TOUR_COLORS;

// ---- category pill ----

const CATEGORY_STYLES: Record<string, { bg: string; fg: string }> = {
  'Scheduled Stop': { bg: '#E3E9F2', fg: midnight },
  Flyby: { bg: '#E9F0F8', fg: steel },
  Tabletop: { bg: '#F4ECE5', fg: '#7E5C40' },
};
const DEFAULT_CATEGORY_STYLE = { bg: '#EEF2F7', fg: steel };

export function categoryPillStyle(name: string | null | undefined): CSSProperties {
  const c = (name && CATEGORY_STYLES[name]) || DEFAULT_CATEGORY_STYLE;
  return {
    background: c.bg,
    color: c.fg,
    borderRadius: 999,
    padding: '1px 8px',
    fontSize: 11,
    fontWeight: 600,
    lineHeight: '18px',
    whiteSpace: 'nowrap',
  };
}

export function CategoryPill({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  return <span style={categoryPillStyle(name)}>{name}</span>;
}

// ---- stop card ----

interface TourStopCardProps {
  number: number;
  color: string;
  /** Line 1 — stop name (may include an inline editor). */
  title: ReactNode;
  /** Line 2 — arrival, minutes, category. */
  meta?: ReactNode;
  /** Line 3 — full site submit name, single line. */
  subtext?: ReactNode;
  /** Extra rows under the card body (e.g. notes editor). */
  footer?: ReactNode;
  /** Top-right control (e.g. remove). */
  aside?: ReactNode;
  /** Spread onto the number badge — the drag handle in the panel. */
  badgeProps?: HTMLAttributes<HTMLDivElement>;
  badgeTitle?: string;
  dragging?: boolean;
}

export function TourStopCard({ number, color, title, meta, subtext: sub, footer, aside, badgeProps, badgeTitle, dragging }: TourStopCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        background: dragging ? '#F0F4FA' : '#FFFFFF',
        border: `1px solid ${cardBorder}`,
        borderRadius: 10,
        padding: '10px 12px',
        boxShadow: dragging ? '0 4px 16px rgba(0,33,71,0.15)' : '0 1px 2px rgba(0,33,71,0.04)',
      }}
    >
      <div
        {...badgeProps}
        title={badgeTitle}
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: color,
          color: '#FFFFFF',
          fontSize: 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: badgeProps ? 'grab' : 'default',
        }}
      >
        {number}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: midnight, lineHeight: 1.3 }}>{title}</div>
        {meta && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap', fontSize: 12, color: steel }}>
            {meta}
          </div>
        )}
        {sub && (
          <div style={{ marginTop: 3, fontSize: 11, color: subtext, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sub}
          </div>
        )}
        {footer}
      </div>
      {aside && <div style={{ flexShrink: 0 }}>{aside}</div>}
    </div>
  );
}

export function ArriveText({ arrivalMin }: { arrivalMin: number | null | undefined }) {
  if (arrivalMin == null) return null;
  return <span style={{ fontWeight: 700, color: midnight }}>Arrive {formatClock12(arrivalMin)}</span>;
}

export function NoLocationTag() {
  return (
    <span
      title="No coordinates on this site submit or its property — not on the map or route"
      style={{ fontSize: 11, color: terracotta, border: `1px solid ${terracotta}`, borderRadius: 999, padding: '0 7px', fontWeight: 600 }}
    >
      no location
    </span>
  );
}

// ---- connector between cards (drive to next / to end) ----

// Badge centre = card padding (12) + half badge (13) => line at x=25.
const CONNECTOR_X = 25;

export function DriveConnector({ minutes, toEnd, color }: { minutes: number | null | undefined; toEnd?: boolean; color: string }) {
  if (minutes == null) return <div style={{ height: 8 }} />;
  return (
    <div style={{ position: 'relative', height: 30 }}>
      <div style={{ position: 'absolute', left: CONNECTOR_X - 1, top: 0, bottom: 0, width: 2, background: color, opacity: 0.45 }} />
      <div
        style={{
          position: 'absolute',
          left: CONNECTOR_X - 11,
          top: '50%',
          transform: 'translateY(-50%)',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          background: '#FFFFFF',
          border: `1px solid ${cardBorder}`,
          borderRadius: 999,
          padding: '1px 8px 1px 5px',
          fontSize: 11,
          fontWeight: 600,
          color: steel,
          whiteSpace: 'nowrap',
        }}
      >
        <Car size={12} color={color} />
        {formatDriveMinutes(minutes)}
        {toEnd && <span style={{ fontWeight: 400, color: slate }}>to end</span>}
      </div>
    </div>
  );
}

// ---- per-day totals footer ----

export interface DayTotals {
  driveMin: number | null; // null = unknown (route unavailable)
  stopMin: number;
  finishMin: number | null; // null = no start time
  overEnd: boolean;
  note?: string | null;
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <span style={{ fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase', color: slate, fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: warn ? terracotta : midnight }}>{value}</span>
    </div>
  );
}

export function DayTotalsFooter({ totals }: { totals: DayTotals }) {
  return (
    <div style={{ marginTop: 8, background: '#EEF2F7', border: `1px solid ${cardBorder}`, borderRadius: 8, padding: '8px 12px' }}>
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
        {totals.driveMin != null && <Stat label="Drive" value={formatMinutesDuration(totals.driveMin)} />}
        <Stat label="Stops" value={formatMinutesDuration(totals.stopMin)} />
        {totals.finishMin != null && (
          <Stat label={totals.overEnd ? 'Finish · past end' : 'Finish'} value={formatClock12(totals.finishMin)} warn={totals.overEnd} />
        )}
      </div>
      {totals.note && <div style={{ fontSize: 11, color: steel, marginTop: 4 }}>{totals.note}</div>}
    </div>
  );
}
