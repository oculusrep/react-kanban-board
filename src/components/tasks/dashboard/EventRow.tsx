import React from 'react';
import { ExternalCalendarEvent } from '../../../types/calendar';

// Renders one calendar event as a fixed slot in the timeline.
// Visually distinct from block rows: greyer, narrower, with a "calendar"
// tag so the user knows this came from Google. Clicking opens the event in
// Google Calendar.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
} as const;

const formatTime12 = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

const formatRange = (event: ExternalCalendarEvent): string =>
  `${formatTime12(event.start_at)} – ${formatTime12(event.end_at)}`;

interface EventRowProps {
  event: ExternalCalendarEvent;
}

export const EventRow: React.FC<EventRowProps> = ({ event }) => {
  const inner = (
    <div className="flex items-stretch">
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: COLORS.slate }} />
      <div className="flex-1 px-3 py-2 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="text-xs font-medium whitespace-nowrap"
            style={{ color: COLORS.steel }}
          >
            {formatRange(event)}
          </span>
          <span className="text-sm truncate" style={{ color: COLORS.midnight }}>
            ⛔ {event.summary || '(no title)'}
          </span>
          <span
            className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wide"
            style={{ backgroundColor: COLORS.slate + '22', color: COLORS.steel }}
          >
            calendar
          </span>
          {event.location && (
            <span className="text-xs italic" style={{ color: COLORS.slate }}>
              {event.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="bg-white rounded-lg border mb-2 overflow-hidden"
      style={{ borderColor: COLORS.slate + '33', backgroundColor: COLORS.bg }}
    >
      {event.html_link ? (
        <a
          href={event.html_link}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:opacity-80"
          title="Open in Google Calendar"
        >
          {inner}
        </a>
      ) : (
        inner
      )}
    </div>
  );
};

export default EventRow;
