import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTaskList } from '../../../hooks/useTasks';
import { scheduleTaskInBlock } from '../../../hooks/useTaskBlocks';
import { TaskWithRelations } from '../../../types/task';

// Compact popover that lists open tasks owned by the current user and lets
// them pick one to schedule into the block. Already-scheduled tasks (in any
// block, today or otherwise) appear with a "(scheduled)" hint — picking one
// moves it into this block via the unique-on-task_id upsert.

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  white: '#FFFFFF',
  bg: '#F8FAFC',
} as const;

interface BlockTaskPickerProps {
  ownerId: string;
  blockInstanceId: string;
  /** task ids already scheduled into THIS block — hidden from the picker. */
  excludeTaskIds: string[];
  /** task ids scheduled into ANY block — shown but flagged as already scheduled. */
  scheduledTaskIds: string[];
  onPicked: () => void;
  onClose: () => void;
}

export const BlockTaskPicker: React.FC<BlockTaskPickerProps> = ({
  ownerId,
  blockInstanceId,
  excludeTaskIds,
  scheduledTaskIds,
  onPicked,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState('');
  const [scheduling, setScheduling] = useState(false);

  const { tasks, loading } = useTaskList({
    status: 'open',
    owner_id: ownerId,
  });

  // Focus search on mount; close on outside click / Esc.
  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    // Defer the click handler so the trigger button click that opened us
    // doesn't immediately close us.
    const t = setTimeout(() => window.addEventListener('mousedown', handleClick), 0);
    return () => {
      window.removeEventListener('keydown', handleKey);
      clearTimeout(t);
      window.removeEventListener('mousedown', handleClick);
    };
  }, [onClose]);

  const excludeSet = useMemo(() => new Set(excludeTaskIds), [excludeTaskIds]);
  const scheduledSet = useMemo(() => new Set(scheduledTaskIds), [scheduledTaskIds]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tasks
      .filter((t) => !excludeSet.has(t.id))
      .filter((t) => {
        if (!term) return true;
        const hay = `${t.subject} ${t.description ?? ''}`.toLowerCase();
        return hay.includes(term);
      });
  }, [tasks, excludeSet, search]);

  const handlePick = async (task: TaskWithRelations) => {
    if (scheduling) return;
    setScheduling(true);
    try {
      await scheduleTaskInBlock({ blockInstanceId, taskId: task.id });
      onPicked();
      onClose();
    } catch (err) {
      console.error(err);
      alert(err instanceof Error ? err.message : 'Failed to schedule task');
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div
      ref={popoverRef}
      className="absolute z-30 mt-1 right-0 w-80 bg-white rounded-lg border shadow-lg"
      style={{ borderColor: COLORS.slate + '99' }}
    >
      <div className="p-2 border-b" style={{ borderColor: COLORS.slate + '33' }}>
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search open tasks…"
          className="w-full px-2 py-1 text-sm rounded border"
          style={{ borderColor: COLORS.slate, color: COLORS.midnight }}
        />
      </div>
      <div className="max-h-80 overflow-y-auto">
        {loading && (
          <div className="px-3 py-3 text-xs italic" style={{ color: COLORS.slate }}>
            Loading…
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="px-3 py-3 text-xs italic" style={{ color: COLORS.slate }}>
            {search ? 'No matches.' : 'No open tasks to schedule.'}
          </div>
        )}
        {!loading &&
          filtered.map((task) => {
            const alreadyScheduled = scheduledSet.has(task.id);
            return (
              <button
                key={task.id}
                type="button"
                onClick={() => handlePick(task)}
                disabled={scheduling}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 disabled:opacity-50"
                style={{ borderColor: COLORS.slate + '22' }}
              >
                <div className="flex items-baseline gap-2">
                  <span className="text-sm flex-1 truncate" style={{ color: COLORS.midnight }}>
                    {task.high_flag && <span className="mr-1" title="High priority">⚑</span>}
                    {task.subject}
                  </span>
                  <span
                    className="text-[10px] px-1 py-0.5 rounded uppercase tracking-wide flex-shrink-0"
                    style={{ backgroundColor: COLORS.slate + '22', color: COLORS.steel }}
                  >
                    {task.category}
                  </span>
                </div>
                {alreadyScheduled && (
                  <div className="text-[11px] italic mt-0.5" style={{ color: COLORS.steel }}>
                    Already scheduled — will be moved to this block.
                  </div>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
};

export default BlockTaskPicker;
