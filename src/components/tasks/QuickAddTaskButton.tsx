import React, { useState } from 'react';
import { QuickAddTaskPopover } from './QuickAddTaskPopover';
import { Task, TaskLinkableObjectType } from '../../types/task';

// Drop-in wrapper for object detail page headers (spec §7.2). Renders
// "+ Task" in OVIS's primary color and opens an anchored popover. Pages
// that want custom styling can use QuickAddTaskPopover directly.

interface QuickAddTaskButtonProps {
  linkedObjectType: TaskLinkableObjectType;
  linkedObjectId: string;
  linkedObjectLabel?: string;
  onTaskCreated?: (task: Task) => void;
  className?: string;
}

const COLORS = {
  midnight: '#002147',
  white: '#FFFFFF',
} as const;

export const QuickAddTaskButton: React.FC<QuickAddTaskButtonProps> = ({
  linkedObjectType,
  linkedObjectId,
  linkedObjectLabel,
  onTaskCreated,
  className,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className={`relative inline-block ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm rounded-md font-medium transition-colors"
        style={{ backgroundColor: COLORS.midnight, color: COLORS.white }}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span aria-hidden>+</span>
        Task
      </button>
      <QuickAddTaskPopover
        isOpen={open}
        onClose={() => setOpen(false)}
        onTaskCreated={(task) => {
          setOpen(false);
          onTaskCreated?.(task);
        }}
        linkedObjectType={linkedObjectType}
        linkedObjectId={linkedObjectId}
        linkedObjectLabel={linkedObjectLabel}
      />
    </div>
  );
};

export default QuickAddTaskButton;
