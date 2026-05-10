import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TodaysTimeline from '../components/tasks/dashboard/TodaysTimeline';
import Top3Lane from '../components/tasks/dashboard/Top3Lane';
import InboxLane from '../components/tasks/dashboard/InboxLane';
import WatchingLane from '../components/tasks/dashboard/WatchingLane';
import ConflictsLane from '../components/tasks/dashboard/ConflictsLane';
import BrainDumpModal from '../components/tasks/BrainDumpModal';
import { triggerSyncNow, useGoogleCalendarConnection } from '../hooks/useGoogleCalendar';
import { localDateString } from '../types/taskBlock';

// Phase 2 dashboard mounted at /tasks. The flat all-tasks list now lives at
// /tasks/all (was /tasks before the Phase 2 PR 8 cutover, 2026-05-09).

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
} as const;

const formatHumanDate = (iso: string): string => {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

// Add `days` to a YYYY-MM-DD date in local time, returning YYYY-MM-DD.
const addDaysLocal = (iso: string, days: number): string => {
  const [y, m, d] = iso.split('-').map((s) => parseInt(s, 10));
  const date = new Date(y, m - 1, d + days);
  return localDateString(date);
};

export const TasksDashboardPage: React.FC = () => {
  const { userTableId } = useAuth();
  const today = localDateString();
  const [viewDate, setViewDate] = useState(today);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  // Bumped after Brain Dump saves so the InboxLane keys-remount and pulls
  // the new tasks. Cheap; the lane is small.
  const [inboxRefreshKey, setInboxRefreshKey] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const { connection: calendarConnection } = useGoogleCalendarConnection(userTableId);
  const isViewingToday = viewDate === today;
  const headerLabel = isViewingToday ? "Today's Timeline" : "Tomorrow's Plan";

  const handleSyncCalendar = async () => {
    if (!userTableId) return;
    setSyncing(true);
    try {
      await triggerSyncNow(userTableId);
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-2xl font-bold" style={{ color: COLORS.midnight }}>
            {headerLabel}
            <span className="text-sm font-normal ml-2" style={{ color: COLORS.steel }}>
              {formatHumanDate(viewDate)}
            </span>
          </h1>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setBrainDumpOpen(true)}
              className="text-xs font-medium px-2.5 py-1 rounded border"
              style={{
                borderColor: COLORS.slate,
                color: COLORS.midnight,
                backgroundColor: COLORS.white,
              }}
              title="Brain Dump — capture a list of tasks to your Inbox"
            >
              🧠 Brain Dump
            </button>
            {calendarConnection?.is_active && (
              <button
                type="button"
                onClick={handleSyncCalendar}
                disabled={syncing}
                className="text-xs font-medium px-2.5 py-1 rounded border disabled:opacity-50"
                style={{
                  borderColor: COLORS.slate,
                  color: COLORS.midnight,
                  backgroundColor: COLORS.white,
                }}
                title="Sync Google Calendar now (cron also runs every 5 min)"
              >
                {syncing ? '↻ Syncing…' : '↻ Sync'}
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setViewDate(isViewingToday ? addDaysLocal(today, 1) : today)
              }
              className="text-xs font-medium px-2.5 py-1 rounded"
              style={{
                backgroundColor: isViewingToday ? COLORS.midnight : COLORS.white,
                color: isViewingToday ? COLORS.white : COLORS.midnight,
                border: isViewingToday ? 'none' : `1px solid ${COLORS.slate}`,
              }}
            >
              {isViewingToday ? 'Plan Tomorrow →' : '← Today'}
            </button>
            <Link
              to="/tasks/all"
              className="text-xs font-medium hover:underline"
              style={{ color: COLORS.steel }}
            >
              All tasks →
            </Link>
            <Link
              to="/settings/time-blocks"
              className="text-xs font-medium hover:underline"
              style={{ color: COLORS.steel }}
            >
              Manage templates →
            </Link>
          </div>
        </div>

        {userTableId ? (
          <>
            {/* Planning lanes — Top 3 / Inbox / Conflicts above the timeline (spec §11). */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
              <Top3Lane ownerId={userTableId} viewDate={viewDate} />
              <InboxLane key={inboxRefreshKey} ownerId={userTableId} viewDate={viewDate} />
              <ConflictsLane ownerId={userTableId} viewDate={viewDate} />
            </div>

            <TodaysTimeline key={viewDate} ownerId={userTableId} onDate={viewDate} />

            {/* Watching lane below the timeline — collapsible, hides when empty. */}
            <WatchingLane assignerId={userTableId} />
          </>
        ) : (
          <div className="text-sm" style={{ color: COLORS.slate }}>
            Not authenticated.
          </div>
        )}
      </div>

      <BrainDumpModal
        isOpen={brainDumpOpen}
        onClose={() => setBrainDumpOpen(false)}
        onSaved={() => setInboxRefreshKey((k) => k + 1)}
      />
    </div>
  );
};

export default TasksDashboardPage;
