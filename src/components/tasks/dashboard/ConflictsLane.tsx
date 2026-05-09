import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useBlockInstancesForDate } from '../../../hooks/useTaskBlocks';
import {
  useExternalCalendarEvents,
  useGoogleCalendarConnection,
} from '../../../hooks/useGoogleCalendar';
import { ExternalCalendarEvent } from '../../../types/calendar';
import { BlockInstanceWithTasks } from '../../../types/taskBlock';

// Conflicts lane (spec §9.4). Detects overlaps between block instances and
// pulled calendar events for (owner, date). Per the resolved Phase 3
// decision, math is client-side — both sets are small (max ~7 blocks +
// ~10 events per day), and avoiding a SQL function keeps the moving parts
// in JS where they're visible.
//
// Per spec §11.1 the lane sits in the row above the timeline alongside
// Top 3 and Inbox. The user resolves manually (shrink/move block, accept
// overlap, fix in Google). All-day events are intentionally ignored —
// they're informational, not blocking.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  warning: '#A27B5C',
  success: '#16a34a',
} as const;

interface ConflictPair {
  block: BlockInstanceWithTasks;
  event: ExternalCalendarEvent;
}

// Pair each block with all events that overlap it. A block at 9–11 with two
// events at 9:30 and 10:30 produces two conflict rows so the user can resolve
// them independently.
const computeConflicts = (
  blocks: BlockInstanceWithTasks[],
  events: ExternalCalendarEvent[],
  onDate: string
): ConflictPair[] => {
  // Anchor block start/end as local timestamps on the viewed date.
  const [y, m, d] = onDate.split('-').map((s) => parseInt(s, 10));
  const pairs: ConflictPair[] = [];
  for (const block of blocks) {
    if (block.status === 'skipped') continue;
    const [sh, sm] = block.start_time.split(':').map((s) => parseInt(s, 10));
    const blockStart = new Date(y, m - 1, d, sh, sm, 0, 0).getTime();
    const blockEnd = blockStart + block.duration_minutes * 60_000;
    for (const event of events) {
      if (event.is_all_day) continue;
      const eventStart = new Date(event.start_at).getTime();
      const eventEnd = new Date(event.end_at).getTime();
      // Standard half-open overlap test.
      if (blockStart < eventEnd && eventStart < blockEnd) {
        pairs.push({ block, event });
      }
    }
  }
  return pairs;
};

const formatTimeRange = (event: ExternalCalendarEvent): string => {
  const start = new Date(event.start_at);
  const end = new Date(event.end_at);
  const fmt = (d: Date) =>
    d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });
  return `${fmt(start)}–${fmt(end)}`;
};

interface ConflictsLaneProps {
  ownerId: string;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  viewDate: string;
}

export const ConflictsLane: React.FC<ConflictsLaneProps> = ({ ownerId, viewDate }) => {
  const { connection } = useGoogleCalendarConnection(ownerId);
  const { instances } = useBlockInstancesForDate({ ownerId, onDate: viewDate });
  const { events, loading, error } = useExternalCalendarEvents({
    userId: ownerId,
    fromDate: viewDate,
    toDate: viewDate,
  });

  const conflicts = useMemo(
    () => computeConflicts(instances, events, viewDate),
    [instances, events, viewDate]
  );

  // No calendar connection → CTA to set one up.
  if (!connection?.is_active) {
    return (
      <div
        className="bg-white rounded-lg border p-3"
        style={{ borderColor: COLORS.slate + '66' }}
      >
        <h3 className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: COLORS.midnight }}>
          Conflicts
        </h3>
        <div className="text-xs italic" style={{ color: COLORS.slate }}>
          Connect Google Calendar to surface conflicts with your time blocks.{' '}
          <Link
            to="/settings/calendars"
            className="font-medium hover:underline not-italic"
            style={{ color: COLORS.midnight }}
          >
            Set up →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-lg border p-3"
      style={{ borderColor: COLORS.slate + '66' }}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: COLORS.midnight }}>
          Conflicts
        </h3>
        <span className="text-xs" style={{ color: conflicts.length > 0 ? COLORS.warning : COLORS.success }}>
          {conflicts.length}
        </span>
      </div>
      {error && (
        <div className="text-xs px-1 py-0.5 rounded mb-1" style={{ color: COLORS.warning }}>
          {error}
        </div>
      )}
      {loading && (
        <div className="text-xs italic" style={{ color: COLORS.slate }}>
          Checking…
        </div>
      )}
      {!loading && conflicts.length === 0 && (
        <div className="text-xs italic" style={{ color: COLORS.slate }}>
          ✓ No conflicts on this day.
        </div>
      )}
      {!loading &&
        conflicts.map(({ block, event }, i) => (
          <div
            key={`${block.id}-${event.id}-${i}`}
            className="py-1 px-1 border-b last:border-b-0 text-xs"
            style={{ borderColor: COLORS.slate + '22' }}
          >
            <div style={{ color: COLORS.midnight }}>
              <span className="font-medium">{block.name}</span>{' '}
              <span style={{ color: COLORS.slate }}>↔</span>{' '}
              <span>{event.summary || '(no title)'}</span>
            </div>
            <div className="mt-0.5 flex items-center gap-2" style={{ color: COLORS.slate }}>
              <span>{formatTimeRange(event)}</span>
              {event.html_link && (
                <a
                  href={event.html_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                  style={{ color: COLORS.steel }}
                >
                  Open in Google →
                </a>
              )}
            </div>
          </div>
        ))}
    </div>
  );
};

export default ConflictsLane;
