import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TodaysTimeline from '../components/tasks/dashboard/TodaysTimeline';
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
  const isViewingToday = viewDate === today;
  const headerLabel = isViewingToday ? "Today's Timeline" : "Tomorrow's Plan";

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
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
          <TodaysTimeline key={viewDate} ownerId={userTableId} onDate={viewDate} />
        ) : (
          <div className="text-sm" style={{ color: COLORS.slate }}>
            Not authenticated.
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksDashboardPage;
