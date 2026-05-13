import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ensureInstancesForDate,
  useBlockInstancesForDate,
  useTaskBlockTemplates,
} from '../../../hooks/useTaskBlocks';
import { localDateString } from '../../../types/taskBlock';
import AdHocBlockCreator from './AdHocBlockCreator';
import BlockRow from './BlockRow';
import EventRow from './EventRow';
import TaskDetailSlideout from '../TaskDetailSlideout';
import TodaysTasksList from './TodaysTasksList';
import { useExternalCalendarEvents } from '../../../hooks/useGoogleCalendar';

// Today's Timeline lane (spec §11). Reads block instances for one (owner, date)
// and renders them chronologically with their queued tasks.
//   PR 5 — read-only render
//   PR 6 — drag-rank scheduling (this PR)
//   PR 7 — block edit / skip / ad-hoc / Plan Tomorrow / adaptive layout
//   PR 8 — replaces /tasks at cutover

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

// Proportional calendar-view constants.
// 1 px per minute = 60 px/hour. 16-hour day (8 AM – 12 AM = 960 px) is the
// default visible window; we extend bounds outward if any block or event
// falls outside.
const PIXELS_PER_MIN = 1;
const TIME_AXIS_WIDTH_PX = 56;
const DEFAULT_START_HOUR = 8;
const DEFAULT_END_HOUR = 20;
const NOW_TICK_INTERVAL_MS = 60_000;

// "8 AM" / "12 PM" labels for the time axis.
const formatHourLabel = (h: number): string => {
  const period = h >= 12 && h < 24 ? 'PM' : 'AM';
  const display = h === 0 || h === 24 ? 12 : h > 12 ? h - 12 : h;
  return `${display} ${period}`;
};

interface TodaysTimelineProps {
  ownerId: string;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  onDate: string;
}

// Returns the id of the block whose [start, start+duration] window contains
// the current local time. Only meaningful when onDate === today.
const useCurrentBlockId = (
  instances: ReturnType<typeof useBlockInstancesForDate>['instances'],
  onDate: string
): string | null => {
  return useMemo(() => {
    if (onDate !== localDateString()) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    for (const inst of instances) {
      const [sh, sm] = inst.start_time.split(':').map((s) => parseInt(s, 10));
      const startMin = sh * 60 + sm;
      const endMin = startMin + inst.duration_minutes;
      if (nowMin >= startMin && nowMin < endMin) return inst.id;
    }
    return null;
  }, [instances, onDate]);
};

export const TodaysTimeline: React.FC<TodaysTimelineProps> = ({ ownerId, onDate }) => {
  const [generating, setGenerating] = useState(true);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const { instances, loading, error, refetch } = useBlockInstancesForDate({
    ownerId,
    onDate,
  });
  // Used by the empty-state branch to decide between "no templates → show
  // the simple Today's Tasks list" (spec §11.1) vs "templates exist but
  // none today → show the empty-day message".
  const { templates, loading: templatesLoading } = useTaskBlockTemplates({
    ownerId,
    activeOnly: true,
  });

  // Phase 3 PR 8: pulled calendar events for the viewed date.
  // Interleaved chronologically with blocks; all-day events render as a
  // small banner above the timeline.
  const { events: calendarEvents } = useExternalCalendarEvents({
    userId: ownerId,
    fromDate: onDate,
    toDate: onDate,
  });

  // Idempotent — safe to fire on every (owner,date) change. Refetch after
  // generation so any newly-created instances appear.
  useEffect(() => {
    if (!ownerId || !onDate) return;
    let cancelled = false;
    setGenerating(true);
    ensureInstancesForDate({ ownerId, onDate })
      .then((res) => {
        if (cancelled) return;
        if (res.generated > 0) refetch();
      })
      .catch((err) => {
        console.warn('[TodaysTimeline] ensureInstancesForDate failed:', err);
      })
      .finally(() => {
        if (!cancelled) setGenerating(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ownerId, onDate, refetch]);

  const currentBlockId = useCurrentBlockId(instances, onDate);

  // Re-render once a minute so the "now" line moves and "isPast" determinations
  // stay accurate without a full data refetch. Only ticks when viewing today.
  const [nowTick, setNowTick] = useState(0);
  const isToday = onDate === localDateString();
  useEffect(() => {
    if (!isToday) return;
    const id = setInterval(() => setNowTick((t) => t + 1), NOW_TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isToday]);
  // useMemo deps include nowTick so isPast flags recompute each tick.
  const nowMin = useMemo(() => {
    if (!isToday) return -1;
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, nowTick]);

  // Scroll container ref so we can auto-scroll the "now" line into view on
  // mount (and when flipping back to today after viewing tomorrow).
  const scrollRef = useRef<HTMLDivElement>(null);

  // Used by the picker so it can flag tasks that are already in some other
  // block today (the unique-on-task_id constraint will move them).
  const scheduledTaskIdsAcrossDay = useMemo(() => {
    const ids: string[] = [];
    for (const inst of instances) {
      for (const st of inst.scheduled_tasks ?? []) ids.push(st.task.id);
    }
    return ids;
  }, [instances]);

  // Drag-end is now owned by TasksDashboardPage so a single DragDropContext
  // can span both the lanes column and the timeline. See handleDragEnd in
  // src/pages/TasksDashboardPage.tsx for the routing logic — moves, pin to
  // Top 3, schedule from Inbox, etc. all flow through one place.

  // Split events: all-day stays in the strip above; timed events overlay
  // the proportional timeline at their actual start time. Computed up
  // here (before early returns) so the useMemo / useEffect below it stay
  // in a stable hook position across loading / loaded renders — without
  // that, React throws #310 because the early-return branches skip these
  // hooks on first render.
  const allDayEvents = calendarEvents.filter((e) => e.is_all_day);
  const timedEvents = calendarEvents.filter((e) => !e.is_all_day);

  // Compute the visible time window. Default 8 AM – 8 PM; extend outward
  // (floor / ceil to the hour) so any block or event that falls outside
  // the default still renders.
  const { startHour, endHour } = useMemo(() => {
    let earliestMin = DEFAULT_START_HOUR * 60;
    let latestMin = DEFAULT_END_HOUR * 60;
    for (const inst of instances) {
      const [sh, sm] = inst.start_time.split(':').map((s) => parseInt(s, 10));
      const sMin = sh * 60 + sm;
      const eMin = sMin + inst.duration_minutes;
      if (sMin < earliestMin) earliestMin = sMin;
      if (eMin > latestMin) latestMin = eMin;
    }
    for (const ev of timedEvents) {
      const start = new Date(ev.start_at);
      const end = new Date(ev.end_at);
      const sMin = start.getHours() * 60 + start.getMinutes();
      const eMin = end.getHours() * 60 + end.getMinutes();
      if (sMin < earliestMin) earliestMin = sMin;
      if (eMin > latestMin) latestMin = eMin;
    }
    return {
      startHour: Math.max(0, Math.floor(earliestMin / 60)),
      endHour: Math.min(24, Math.ceil(latestMin / 60)),
    };
  }, [instances, timedEvents]);

  const totalMins = (endHour - startHour) * 60;
  const totalPx = totalMins * PIXELS_PER_MIN;
  const minsFromTop = (minOfDay: number) =>
    (minOfDay - startHour * 60) * PIXELS_PER_MIN;

  const nowTopPx = isToday ? minsFromTop(nowMin) : -1;
  const showNowLine = isToday && nowTopPx >= 0 && nowTopPx <= totalPx;

  // Auto-scroll so "now" sits ~1/3 down the visible viewport. Runs once
  // after first render with content; re-runs when flipping back to today.
  useEffect(() => {
    if (!scrollRef.current || !isToday) return;
    const target = Math.max(0, nowTopPx - scrollRef.current.clientHeight / 3);
    scrollRef.current.scrollTop = target;
    // Only on initial mount per date — don't snap back every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isToday, onDate]);

  if (error) {
    return (
      <div
        className="p-3 rounded text-sm"
        style={{ color: COLORS.warning, backgroundColor: '#fff5ec' }}
      >
        {error}
      </div>
    );
  }

  if (loading || generating || templatesLoading) {
    return (
      <div className="p-4 text-sm" style={{ color: COLORS.slate }}>
        Loading timeline…
      </div>
    );
  }

  if (instances.length === 0) {
    // Spec §11.1: when the user has no active templates AND no instances,
    // render the simplified Today's Tasks list. Templates that exist but
    // don't run today get the lighter "no blocks for this date" message
    // instead — the user knows blocks are set up; today just isn't one.
    if (templates.length === 0) {
      return (
        <>
          <div className="flex justify-end mb-2">
            <AdHocBlockCreator ownerId={ownerId} onDate={onDate} onCreated={refetch} />
          </div>
          <TodaysTasksList ownerId={ownerId} viewDate={onDate} />
        </>
      );
    }
    return (
      <>
        <div className="flex justify-end mb-2">
          <AdHocBlockCreator ownerId={ownerId} onDate={onDate} onCreated={refetch} />
        </div>
        <div
          className="bg-white rounded-lg border p-6 text-center"
          style={{ borderColor: COLORS.slate + '66' }}
        >
          <p className="text-sm mb-2" style={{ color: COLORS.steel }}>
            No time blocks for {isToday ? 'today' : 'this date'}. Add an ad-hoc block above
            or{' '}
            <Link
              to="/settings/time-blocks"
              className="font-medium hover:underline"
              style={{ color: COLORS.midnight }}
            >
              edit templates
            </Link>
            .
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="flex justify-end mb-2">
        <AdHocBlockCreator ownerId={ownerId} onDate={onDate} onCreated={refetch} />
      </div>

      {allDayEvents.length > 0 && (
        <div
          className="mb-2 px-3 py-1.5 rounded text-xs flex flex-wrap gap-x-3 gap-y-1"
          style={{ backgroundColor: COLORS.slate + '22', color: COLORS.steel }}
        >
          <span className="font-semibold uppercase tracking-wide">All-day</span>
          {allDayEvents.map((e) => (
            <a
              key={e.id}
              href={e.html_link ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:underline"
            >
              {e.summary || '(no title)'}
            </a>
          ))}
        </div>
      )}

      {/* Proportional calendar view — hour axis on the left, blocks
          positioned absolutely by start time + duration, calendar events
          overlaid as a sidecar column, red "now" line spanning both. */}
      <div
        ref={scrollRef}
        className="bg-white rounded-lg border overflow-y-auto"
        style={{
          borderColor: COLORS.slate + '66',
          maxHeight: '70vh',
        }}
      >
        <div className="relative" style={{ height: totalPx }}>
          {/* Hour grid lines + labels */}
          {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
            const hour = startHour + i;
            const top = i * 60 * PIXELS_PER_MIN;
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 border-t pointer-events-none"
                style={{ top, borderColor: COLORS.slate + '33' }}
              >
                <span
                  className="absolute left-1 text-[10px] bg-white px-0.5"
                  style={{ color: COLORS.slate, top: -7 }}
                >
                  {formatHourLabel(hour)}
                </span>
              </div>
            );
          })}

          {/* Half-hour grid (lighter) for visual density */}
          {Array.from({ length: endHour - startHour }).map((_, i) => {
            const top = (i * 60 + 30) * PIXELS_PER_MIN;
            return (
              <div
                key={`half-${i}`}
                className="absolute pointer-events-none border-t border-dashed"
                style={{
                  top,
                  left: TIME_AXIS_WIDTH_PX,
                  right: 0,
                  borderColor: COLORS.slate + '22',
                }}
              />
            );
          })}

          {/* Blocks */}
          {instances.map((inst) => {
            const [sh, sm] = inst.start_time.split(':').map((s) => parseInt(s, 10));
            const startMin = sh * 60 + sm;
            const endMin = startMin + inst.duration_minutes;
            const isPast = isToday && endMin <= nowMin;
            return (
              <div
                key={inst.id}
                className="absolute overflow-hidden"
                style={{
                  top: minsFromTop(startMin),
                  height: inst.duration_minutes * PIXELS_PER_MIN,
                  left: TIME_AXIS_WIDTH_PX,
                  // Block column takes most of the width; leave 40% on the
                  // right for calendar-event overlays so they're always
                  // visible even when overlapping a block.
                  right: timedEvents.length > 0 ? '40%' : 0,
                }}
              >
                <BlockRow
                  instance={inst}
                  ownerId={ownerId}
                  scheduledTaskIdsAcrossDay={scheduledTaskIdsAcrossDay}
                  isCurrent={inst.id === currentBlockId}
                  isPast={isPast}
                  onTaskClick={setOpenTaskId}
                  onChanged={refetch}
                />
              </div>
            );
          })}

          {/* Calendar events (sidecar column on the right) */}
          {timedEvents.map((ev) => {
            const start = new Date(ev.start_at);
            const end = new Date(ev.end_at);
            const sMin = start.getHours() * 60 + start.getMinutes();
            const eMin = end.getHours() * 60 + end.getMinutes();
            // Floor event height to 22px so 15-min events stay readable.
            const heightPx = Math.max(22, (eMin - sMin) * PIXELS_PER_MIN);
            return (
              <div
                key={`event-${ev.id}`}
                className="absolute overflow-hidden"
                style={{
                  top: minsFromTop(sMin),
                  height: heightPx,
                  right: 0,
                  width: '38%',
                }}
              >
                <EventRow event={ev} />
              </div>
            );
          })}

          {/* "Now" line — red horizontal rule + dot, spans full width */}
          {showNowLine && (
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{ top: nowTopPx, zIndex: 10 }}
            >
              <div
                style={{ borderTop: '2px solid #dc2626' }}
              />
              <div
                className="absolute rounded-full"
                style={{
                  left: TIME_AXIS_WIDTH_PX - 6,
                  top: -5,
                  width: 10,
                  height: 10,
                  backgroundColor: '#dc2626',
                }}
              />
            </div>
          )}
        </div>
      </div>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </>
  );
};

export default TodaysTimeline;
