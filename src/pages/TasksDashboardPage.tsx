import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { DragDropContext, DropResult } from '@hello-pangea/dnd';
import { useAuth } from '../contexts/AuthContext';
import { updateTask } from '../hooks/useTasks';
import {
  moveScheduledTask,
  scheduleTaskInBlock,
  unscheduleTask,
  useBlockInstancesForDate,
} from '../hooks/useTaskBlocks';
import { MANUAL_RANK_STEP } from '../types/taskBlock';
import TodaysTimeline from '../components/tasks/dashboard/TodaysTimeline';
import Top3Lane from '../components/tasks/dashboard/Top3Lane';
import InboxLane from '../components/tasks/dashboard/InboxLane';
import WatchingLane from '../components/tasks/dashboard/WatchingLane';
import ConflictsLane from '../components/tasks/dashboard/ConflictsLane';
import OverdueLane from '../components/tasks/dashboard/OverdueLane';
import AwaitingLane from '../components/tasks/dashboard/AwaitingLane';
import BrainDumpModal from '../components/tasks/BrainDumpModal';
import QuickCaptureBar from '../components/tasks/QuickCaptureBar';
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
  // Single shared signal: any lane (or Brain Dump / Quick Capture) bumps
  // this after a mutation, every lane re-keys, every useTaskList re-runs.
  // Cheap; lanes are small. Slideouts keep using local refetch so editing
  // in a slideout doesn't close it.
  const [dashboardRefreshKey, setDashboardRefreshKey] = useState(0);
  const bumpDashboardRefresh = useCallback(
    () => setDashboardRefreshKey((k) => k + 1),
    []
  );
  const [syncing, setSyncing] = useState(false);
  const { connection: calendarConnection } = useGoogleCalendarConnection(userTableId);
  // Lifted here so the unified drag handler can compute manual_rank when
  // moving across blocks. TodaysTimeline still has its own instance of
  // the same hook; both refetch in sync via dashboardRefreshKey.
  const { instances } = useBlockInstancesForDate({
    ownerId: userTableId,
    onDate: viewDate,
  });
  const isViewingToday = viewDate === today;
  const headerLabel = isViewingToday ? "Today's Timeline" : "Tomorrow's Plan";

  // Unified drag-and-drop. One DragDropContext spans the right-column lanes
  // (Overdue / Top 3 / Inbox / Conflicts) AND the left-column TodaysTimeline,
  // so a task can be dragged from the Inbox directly into a time block.
  //
  // Draggable id scheme is prefix-encoded so a task that's BOTH pinned to
  // Top 3 AND scheduled into a block (legal under spec §7.4.1 multi-
  // placement) doesn't collide:
  //   inbox:<task.id>
  //   top3:<task.id>
  //   block:<scheduled_task.id>:<task.id>
  //
  // Droppable ids:
  //   inbox-zone, top3-zone, <block_instance.id>
  const handleDragEnd = useCallback(async (result: DropResult) => {
    if (!result.destination) return;
    const { draggableId, source, destination } = result;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    ) {
      return;
    }

    // Parse the draggable id. block: carries both scheduled and task ids.
    const parts = draggableId.split(':');
    const sourceKind = parts[0]; // 'inbox' | 'top3' | 'block'
    let taskId: string;
    let scheduledTaskId: string | undefined;
    if (sourceKind === 'block') {
      scheduledTaskId = parts[1];
      taskId = parts[2];
    } else {
      taskId = parts[1];
    }

    // Identify destination. A block droppableId is a UUID (any string that's
    // not one of the two well-known zones).
    const dest = destination.droppableId;
    const destIsBlock = dest !== 'inbox-zone' && dest !== 'top3-zone';

    try {
      if (sourceKind === 'inbox' || sourceKind === 'top3') {
        if (dest === 'top3-zone' && sourceKind === 'inbox') {
          await updateTask(taskId, { top3_date: viewDate });
        } else if (dest === 'inbox-zone' && sourceKind === 'top3') {
          // recomputeIsInbox restores is_inbox=true unless another
          // placement (block / triaged_at) holds the task out.
          await updateTask(taskId, { top3_date: null });
        } else if (destIsBlock) {
          // Drop into a block. scheduleTaskInBlock auto-appends at the
          // bottom; multi-placement (Top 3 + block) is legal per spec, so
          // pin stays even when source was Top 3.
          await scheduleTaskInBlock({ blockInstanceId: dest, taskId });
        } else {
          return;
        }
      } else if (sourceKind === 'block') {
        if (destIsBlock) {
          // Move within or across blocks — compute rank from destination
          // neighbors. Same logic that used to live in TodaysTimeline.
          const destBlock = instances.find((i) => i.id === dest);
          if (!destBlock || !scheduledTaskId) return;
          const destTasks = (destBlock.scheduled_tasks ?? []).filter(
            (st) => st.id !== scheduledTaskId
          );
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
            if (newRank === prev) newRank = prev - 1;
          }
          await moveScheduledTask({
            scheduledTaskId,
            newBlockInstanceId: dest,
            newRank,
          });
        } else if (dest === 'inbox-zone' || dest === 'top3-zone') {
          // Out of the block. recomputeIsInbox handles inbox restore.
          await unscheduleTask(taskId);
          if (dest === 'top3-zone') {
            await updateTask(taskId, { top3_date: viewDate });
          }
        } else {
          return;
        }
      } else {
        return;
      }
      bumpDashboardRefresh();
    } catch (err) {
      console.error('[Dashboard] drag move failed:', err);
      alert(err instanceof Error ? err.message : 'Move failed');
    }
  }, [viewDate, instances, bumpDashboardRefresh]);

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
            <QuickCaptureBar ownerId={userTableId} onSaved={bumpDashboardRefresh} />

            {/* Two-column dashboard (spec §11): Today's Timeline as the primary
                column on the left so it's always in view; planning lanes stack
                vertically on the right. The shared DragDropContext spans both
                columns so Inbox ⇆ Top 3 drag still works. Each right-column
                lane internally caps its own scroll height — see InboxLane —
                so a tall Inbox can't push other lanes off-screen. */}
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
                <div>
                  <TodaysTimeline
                    key={`timeline-${viewDate}-${dashboardRefreshKey}`}
                    ownerId={userTableId}
                    onDate={viewDate}
                  />
                </div>
                <div className="space-y-3">
                  <OverdueLane
                    key={`overdue-${dashboardRefreshKey}`}
                    ownerId={userTableId}
                    viewDate={viewDate}
                    onTaskChanged={bumpDashboardRefresh}
                  />
                  <Top3Lane
                    key={`top3-${dashboardRefreshKey}`}
                    ownerId={userTableId}
                    viewDate={viewDate}
                    onTaskChanged={bumpDashboardRefresh}
                  />
                  <InboxLane
                    key={`inbox-${dashboardRefreshKey}`}
                    ownerId={userTableId}
                    viewDate={viewDate}
                    onTaskChanged={bumpDashboardRefresh}
                  />
                  <ConflictsLane ownerId={userTableId} viewDate={viewDate} />
                </div>
              </div>
            </DragDropContext>

            {/* Awaiting + Watching span the full width below — both secondary,
                hide entirely when empty. */}
            <AwaitingLane
              key={`awaiting-${dashboardRefreshKey}`}
              ownerId={userTableId}
              onTaskChanged={bumpDashboardRefresh}
            />
            <WatchingLane
              key={`watching-${dashboardRefreshKey}`}
              assignerId={userTableId}
            />
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
        onSaved={bumpDashboardRefresh}
      />
    </div>
  );
};

export default TasksDashboardPage;
