import { useEffect, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { Car } from 'lucide-react';
import { etClockMinutes, etHHMM, etWallTimeToDate, formatClock12, formatDriveMinutes, formatMinutesDuration } from '../../lib/tourRouting';

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
  /** Focused on the map (in/out legs highlighted). */
  highlight?: boolean;
  /** Live day: already visited (at/before the latest departure stamp). */
  done?: boolean;
}

export function TourStopCard({ number, color, title, meta, subtext: sub, footer, aside, badgeProps, badgeTitle, dragging, highlight, done }: TourStopCardProps) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        background: dragging || highlight ? '#F0F4FA' : done ? '#F4F6F9' : '#FFFFFF',
        border: highlight ? `2px solid ${midnight}` : `1px solid ${cardBorder}`,
        margin: highlight ? -1 : 0, // keep layout steady with the thicker border
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
          background: done ? slate : color,
          color: '#FFFFFF',
          fontSize: done ? 14 : 12,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          cursor: badgeProps ? 'grab' : 'default',
        }}
      >
        {done ? '✓' : number}
      </div>
      <div style={{ flex: 1, minWidth: 0, opacity: done ? 0.6 : 1 }}>
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

// Stop name as a link + small ↗ that opens the site submit sidebar (overlay, no navigation).
// Stops propagation so the card's own click (map focus) doesn't also fire.
export function OpenSiteLink({ text, onOpen, color = midnight }: { text: ReactNode; onOpen: () => void; color?: string }) {
  const open = (e: import("react").MouseEvent) => {
    e.stopPropagation();
    onOpen();
  };
  const btn: CSSProperties = { border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', font: 'inherit', color, textAlign: 'left' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, minWidth: 0 }}>
      <button
        type="button"
        onClick={open}
        title="Open site details"
        style={{ ...btn, textDecoration: 'underline', textDecorationColor: slate, textUnderlineOffset: 2 }}
      >
        {text}
      </button>
      <button type="button" onClick={open} title="Open site details" aria-label="Open site details" style={{ ...btn, color: steel, fontSize: 12, fontWeight: 600 }}>
        ↗
      </button>
    </span>
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

export function DriveConnector({ minutes, label, color }: { minutes: number | null | undefined; label?: string; color: string }) {
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
        {label && <span style={{ fontWeight: 400, color: slate }}>{label}</span>}
      </div>
    </div>
  );
}

// ---- per-day totals footer ----

export interface DayTotals {
  driveMin: number | null; // null = unknown (route unavailable)
  stopMin: number;
  finishMin: number | null; // null = no start time (projected on a live day)
  plannedFinishMin?: number | null; // live day with stamps: the plan's finish, for comparison
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
          <Stat
            label={(totals.plannedFinishMin != null ? 'Projected finish' : 'Finish') + (totals.overEnd ? ' · past end' : '')}
            value={formatClock12(totals.finishMin)}
            warn={totals.overEnd}
          />
        )}
      </div>
      {totals.finishMin != null && totals.plannedFinishMin != null && (
        <div style={{ fontSize: 12, color: totals.overEnd ? terracotta : steel, marginTop: 4, fontWeight: 600 }}>
          {(() => {
            const delta = Math.round(totals.finishMin - totals.plannedFinishMin);
            const sign = delta > 0 ? '+' : delta < 0 ? '−' : '±';
            return `Finish ${formatClock12(totals.finishMin)} (planned ${formatClock12(totals.plannedFinishMin)}, ${sign}${Math.abs(delta)} min)`;
          })()}
        </div>
      )}
      {totals.note && <div style={{ fontSize: 11, color: steel, marginTop: 4 }}>{totals.note}</div>}
    </div>
  );
}

// ---- custom approach tag ----

interface ApproachTagProps {
  source: 'tour' | 'site' | null;
  /** Map only: clear actions. Panel shows the tag alone. */
  onClearTour?: () => void;
  onClearSite?: () => void;
  onSkipOnTour?: () => void;
}

const linkBtn: CSSProperties = { border: 'none', background: 'transparent', color: steel, fontSize: 11, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

export function ApproachTag({ source, onClearTour, onClearSite, onSkipOnTour }: ApproachTagProps) {
  if (!source) return null;
  return (
    // Clicks on these actions shouldn't also toggle the card's map focus.
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={(e) => e.stopPropagation()}>
      <span
        title={source === 'tour' ? 'Custom approach — this tour only' : 'Custom approach — saved for this site'}
        style={{ fontSize: 11, color: midnight, border: `1px dashed ${slate}`, borderRadius: 999, padding: '0 7px', fontWeight: 600, whiteSpace: 'nowrap' }}
      >
        custom approach{source === 'tour' ? ' · tour' : ''}
      </span>
      {source === 'tour' && onClearTour && (
        <button type="button" onClick={onClearTour} style={linkBtn} title="Remove this tour's approach (falls back to the site's saved approach, if any)">
          clear
        </button>
      )}
      {source === 'site' && onSkipOnTour && (
        <button type="button" onClick={onSkipOnTour} style={linkBtn} title="Don't use the site's approach on this tour">
          skip on tour
        </button>
      )}
      {source === 'site' && onClearSite && (
        <button type="button" onClick={onClearSite} style={linkBtn} title="Delete the site's saved approach (affects every tour)">
          clear for site
        </button>
      )}
    </span>
  );
}


// ---- live day: narrow-screen detection ----

export function useIsNarrow(maxWidth = 700): boolean {
  const query = `(max-width: ${maxWidth}px)`;
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia?.(query).matches);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return narrow;
}

// ---- live day: "Leaving now" (current stop only) + stamped time ----

// Every tap in these stays here (map cards toggle focus on click).
const stopProp = (e: { stopPropagation(): void }) => e.stopPropagation();

/** Desktop: small pill on line 2, same height as the category pill. Phone: full-width, 36px. */
export function LeavingNowButton({ onStamp, busy, block }: { onStamp: (iso: string) => void; busy?: boolean; block?: boolean }) {
  const common: CSSProperties = {
    border: 'none',
    background: midnight,
    color: '#FFFFFF',
    fontWeight: 700,
    cursor: busy ? 'wait' : 'pointer',
    opacity: busy ? 0.6 : 1,
    touchAction: 'manipulation',
    whiteSpace: 'nowrap',
  };
  const style: CSSProperties = block
    ? { ...common, width: '100%', height: 36, borderRadius: 8, fontSize: 15, marginTop: 8 }
    : { ...common, borderRadius: 999, padding: '1px 9px', fontSize: 11, lineHeight: '18px' };
  return (
    <button type="button" disabled={busy} onClick={(e) => (stopProp(e), onStamp(new Date().toISOString()))} style={style}>
      Leaving now ▸
    </button>
  );
}

/** Small "✓ Left 10:42 AM" text; tap to edit (native time picker) or clear. */
export function StampedDeparture({
  stampedAt,
  dayDate,
  onStamp,
  busy,
}: {
  stampedAt: string; // UTC ISO
  dayDate: string; // YYYY-MM-DD (the live day, Eastern)
  onStamp: (iso: string | null) => void;
  busy?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const at = new Date(stampedAt);

  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          stopProp(e);
          setDraft(etHHMM(at));
          setEditing(true);
        }}
        title="Edit or clear the departure time"
        style={{ border: 'none', background: 'transparent', padding: 0, color: steel, fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
      >
        ✓ Left {formatClock12(etClockMinutes(at))}
      </button>
    );
  }

  const btn: CSSProperties = { height: 32, borderRadius: 6, fontSize: 13, fontWeight: 600, padding: '0 10px', cursor: 'pointer', touchAction: 'manipulation' };
  return (
    // flexBasis 100% drops the editor onto its own row inside the card's wrapping meta line.
    <span onClick={stopProp} style={{ flexBasis: '100%', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
      <input
        type="time"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        style={{ height: 32, fontSize: 16, border: `1px solid ${slate}`, borderRadius: 6, padding: '0 6px' }}
      />
      <button
        type="button"
        disabled={!draft || busy}
        onClick={() => {
          onStamp(etWallTimeToDate(dayDate, draft).toISOString());
          setEditing(false);
        }}
        style={{ ...btn, border: 'none', background: midnight, color: '#fff' }}
      >
        Save
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          onStamp(null);
          setEditing(false);
        }}
        style={{ ...btn, border: `1px solid ${terracotta}`, background: '#fff', color: terracotta }}
      >
        Clear
      </button>
      <button type="button" onClick={() => setEditing(false)} style={{ ...btn, border: `1px solid ${cardBorder}`, background: '#fff', color: steel }}>
        Cancel
      </button>
    </span>
  );
}
