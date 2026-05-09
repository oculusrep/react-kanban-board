import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import {
  ensureInstancesForDate,
  moveScheduledTask,
  useBlockInstancesForDate,
  useTaskBlockTemplates,
} from '../../../hooks/useTaskBlocks';
import { MANUAL_RANK_STEP, localDateString } from '../../../types/taskBlock';
import AdHocBlockCreator from './AdHocBlockCreator';
import BlockRow from './BlockRow';
import TaskDetailSlideout from '../TaskDetailSlideout';
import TodaysTasksList from './TodaysTasksList';

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

  // Used by the picker so it can flag tasks that are already in some other
  // block today (the unique-on-task_id constraint will move them).
  const scheduledTaskIdsAcrossDay = useMemo(() => {
    const ids: string[] = [];
    for (const inst of instances) {
      for (const st of inst.scheduled_tasks ?? []) ids.push(st.task.id);
    }
    return ids;
  }, [instances]);

  // Drag-end: compute the new rank from the destination block's existing
  // ranks (excluding the dragged item to avoid self-reference) and update
  // both the rank and block_instance_id in one call. Optimistic refetch
  // after the write — mis-ordering during the round trip is fine because
  // the source-of-truth is the DB.
  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }
    const destBlock = instances.find((i) => i.id === destination.droppableId);
    if (!destBlock) return;

    // The dragged task's id within the destination block is `draggableId`.
    // Filter it out to compute neighbor ranks correctly.
    const destTasks = (destBlock.scheduled_tasks ?? []).filter((st) => st.id !== draggableId);

    let newRank: number;
    if (destTasks.length === 0) {
      newRank = MANUAL_RANK_STEP;
    } else if (destination.index <= 0) {
      newRank = destTasks[0].manual_rank - MANUAL_RANK_STEP;
    } else if (destination.index >= destTasks.length) {
      newRank = destTasks[destTasks.length - 1].manual_rank + MANUAL_RANK_STEP;
    } else {
      const prev = destTasks[destination.index - 1].manual_rank;
      const next = destTasks[destination.index].manual_rank;
      newRank = Math.floor((prev + next) / 2);
      // Defensive: if neighbors collapsed to consecutive ints, kick the
      // ranks apart by stepping the new value down. The deterministic
      // created_at tiebreak in the read still keeps render order stable.
      if (newRank === prev) newRank = prev - 1;
    }

    try {
      await moveScheduledTask({
        scheduledTaskId: draggableId,
        newBlockInstanceId: destination.droppableId,
        newRank,
      });
      refetch();
    } catch (err) {
      console.error('[TodaysTimeline] drag move failed:', err);
      alert(err instanceof Error ? err.message : 'Move failed');
      refetch();
    }
  };

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
      <DragDropContext onDragEnd={handleDragEnd}>
        <div>
          {instances.map((inst) => {
            const [sh, sm] = inst.start_time.split(':').map((s) => parseInt(s, 10));
            const endMin = sh * 60 + sm + inst.duration_minutes;
            const isPast = isToday && endMin <= nowMin;
            return (
              <BlockRow
                key={inst.id}
                instance={inst}
                ownerId={ownerId}
                scheduledTaskIdsAcrossDay={scheduledTaskIdsAcrossDay}
                isCurrent={inst.id === currentBlockId}
                isPast={isPast}
                onTaskClick={setOpenTaskId}
                onChanged={refetch}
              />
            );
          })}
        </div>
      </DragDropContext>

      <TaskDetailSlideout
        taskId={openTaskId}
        onClose={() => setOpenTaskId(null)}
        onChanged={refetch}
      />
    </>
  );
};

export default TodaysTimeline;
