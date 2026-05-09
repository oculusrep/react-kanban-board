import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import TodaysTimeline from '../components/tasks/dashboard/TodaysTimeline';
import { localDateString } from '../types/taskBlock';

// Preview route for Phase 2 PR 5. The full /tasks dashboard lands at
// cutover (PR 8). Until then this page lets us iterate on the timeline
// without touching the existing /tasks (flat list) page.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
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

export const TasksDashboardPreviewPage: React.FC = () => {
  const { userTableId } = useAuth();
  const today = localDateString();

  return (
    <div className="min-h-screen" style={{ backgroundColor: COLORS.bg }}>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-baseline justify-between mb-4">
          <h1 className="text-2xl font-bold" style={{ color: COLORS.midnight }}>
            Today's Timeline
            <span className="text-sm font-normal ml-2" style={{ color: COLORS.steel }}>
              {formatHumanDate(today)}
            </span>
          </h1>
          <Link
            to="/settings/time-blocks"
            className="text-xs font-medium hover:underline"
            style={{ color: COLORS.steel }}
          >
            Manage templates →
          </Link>
        </div>

        <p className="text-xs mb-4" style={{ color: COLORS.slate }}>
          Preview of the Phase 2 dashboard. Read-only for now — scheduling tasks into
          blocks lands in PR 6, edit / skip / ad-hoc in PR 7. The full dashboard
          replaces /tasks at PR 8 cutover.
        </p>

        {userTableId ? (
          <TodaysTimeline ownerId={userTableId} onDate={today} />
        ) : (
          <div className="text-sm" style={{ color: COLORS.slate }}>
            Not authenticated.
          </div>
        )}
      </div>
    </div>
  );
};

export default TasksDashboardPreviewPage;
