import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ensureInstancesForDate, useBlockInstancesForDate } from '../../../hooks/useTaskBlocks';
import { localDateString } from '../../../types/taskBlock';
import BlockRow from './BlockRow';
import TaskDetailSlideout from '../TaskDetailSlideout';

// Today's Timeline lane (spec §11). Reads block instances for one (owner, date)
// and renders them chronologically with their queued tasks. PR 5 scope:
// read-only render + click-into-task slideout. Scheduling, ad-hoc creation,
// and edit-semantics land in PRs 6 and 7.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  bg: '#F8FAFC',
  warning: '#A27B5C',
} as const;

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

  // Per-block "is past" determination (today only).
  const isToday = onDate === localDateString();
  const nowMin = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : -1;

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

  if (loading || generating) {
    return (
      <div className="p-4 text-sm" style={{ color: COLORS.slate }}>
        Loading timeline…
      </div>
    );
  }

  if (instances.length === 0) {
    return (
      <div
        className="bg-white rounded-lg border p-6 text-center"
        style={{ borderColor: COLORS.slate + '66' }}
      >
        <p className="text-sm mb-2" style={{ color: COLORS.steel }}>
          No time blocks for {isToday ? 'today' : 'this date'}.
        </p>
        <Link
          to="/settings/time-blocks"
          className="text-sm font-medium hover:underline"
          style={{ color: COLORS.midnight }}
        >
          Set up time blocks →
        </Link>
      </div>
    );
  }

  return (
    <>
      <div>
        {instances.map((inst) => {
          const [sh, sm] = inst.start_time.split(':').map((s) => parseInt(s, 10));
          const endMin = sh * 60 + sm + inst.duration_minutes;
          const isPast = isToday && endMin <= nowMin;
          return (
            <BlockRow
              key={inst.id}
              instance={inst}
              isCurrent={inst.id === currentBlockId}
              isPast={isPast}
              onTaskClick={setOpenTaskId}
            />
          );
        })}
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
