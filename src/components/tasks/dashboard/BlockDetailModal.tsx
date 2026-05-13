import React, { useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { BlockInstanceWithTasks } from '../../../types/taskBlock';
import BlockRow from './BlockRow';

// Detail modal for a single time-block. Opens from the compact block
// surface in the proportional TodaysTimeline view so users can see /
// edit the block's task list without the timeline having to make room
// for it. Wraps the full (non-compact) BlockRow so all existing
// affordances (+ Add picker, drag-rank, edit/skip, capacity bar,
// remove task) work unchanged inside the modal.

interface BlockDetailModalProps {
  isOpen: boolean;
  instance: BlockInstanceWithTasks | null;
  ownerId: string;
  scheduledTaskIdsAcrossDay: string[];
  isCurrent?: boolean;
  isPast?: boolean;
  onClose: () => void;
  onTaskClick?: (taskId: string) => void;
  onChanged: () => void;
}

const COLORS = {
  midnight: '#002147',
  steel: '#4A6B94',
} as const;

export const BlockDetailModal: React.FC<BlockDetailModalProps> = ({
  isOpen,
  instance,
  ownerId,
  scheduledTaskIdsAcrossDay,
  isCurrent,
  isPast,
  onClose,
  onTaskClick,
  onChanged,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen || !instance) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[60]"
        onMouseDown={onClose}
      />
      <div className="fixed inset-0 flex items-start justify-center z-[60] p-4 pt-16 pointer-events-none">
        <div
          className="bg-white rounded-lg shadow-xl max-w-2xl w-full pointer-events-auto"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between px-4 py-3 border-b border-gray-200">
            <div>
              <h3 className="text-sm font-semibold" style={{ color: COLORS.midnight }}>
                {instance.name}
              </h3>
              <p className="text-xs mt-0.5" style={{ color: COLORS.steel }}>
                Block detail · click any task to open it · drag to reorder
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
              aria-label="Close"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          <div className="p-4">
            {/* Render the FULL (non-compact) BlockRow so all existing
                affordances stay intact inside the modal. */}
            <BlockRow
              instance={instance}
              ownerId={ownerId}
              scheduledTaskIdsAcrossDay={scheduledTaskIdsAcrossDay}
              isCurrent={isCurrent}
              isPast={isPast}
              onTaskClick={(taskId) => {
                onTaskClick?.(taskId);
                onClose();
              }}
              onChanged={onChanged}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default BlockDetailModal;
