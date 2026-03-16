import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface HandoffBadgeProps {
  dealId: string;
  holder: 'us' | 'll' | null;
  changedAt: string | null;
  documentType: 'LOI' | 'Lease' | null;
  stageLabel: string; // To determine if badge should show
  onUpdate?: () => void; // Callback after successful update
  showTurns?: boolean; // Whether to show turn count (for deal page)
  turnsCount?: number; // Number of turns
  size?: 'sm' | 'md'; // Badge size
}

/**
 * HandoffBadge - Segmented control showing document handoff status
 *
 * Displays a toggle switch with two slots: [ Us ] [ LL ]
 * - Active side highlights and shows days count
 * - Inactive side is grayed out
 * - Clicking inactive side toggles the holder
 */
export default function HandoffBadge({
  dealId,
  holder,
  changedAt,
  documentType,
  stageLabel,
  onUpdate,
  showTurns = false,
  turnsCount = 0,
  size = 'sm',
}: HandoffBadgeProps) {
  const [isUpdating, setIsUpdating] = useState(false);

  // Only show badge for tracked stages
  const trackedStages = ['Negotiating LOI', 'At Lease / PSA', 'At Lease/PSA'];
  const isTrackedStage = trackedStages.includes(stageLabel);

  if (!isTrackedStage) {
    return null;
  }

  // Determine document type based on stage
  const inferredDocType: 'LOI' | 'Lease' = stageLabel === 'Negotiating LOI' ? 'LOI' : 'Lease';

  // Calculate days held
  const getDaysHeld = (): number => {
    if (!changedAt) return 0;
    const changed = new Date(changedAt);
    const now = new Date();
    const diffTime = now.getTime() - changed.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  const daysHeld = getDaysHeld();

  // Handle click to toggle holder
  const handleToggle = async (newHolder: 'us' | 'll', e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    e.preventDefault();

    // If clicking the already-active side, do nothing
    if (holder === newHolder || isUpdating) return;

    setIsUpdating(true);

    try {
      // Get today's date in local timezone (Eastern Time per CLAUDE.md)
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Insert new handoff record
      const { error: insertError } = await supabase
        .from('document_handoff')
        .insert({
          deal_id: dealId,
          document_type: documentType || inferredDocType,
          holder: newHolder,
          changed_at: today,
        });

      if (insertError) {
        console.error('Error inserting handoff:', insertError);
        return;
      }

      // Trigger refresh
      if (onUpdate) {
        onUpdate();
      }
    } catch (error) {
      console.error('Error toggling handoff:', error);
    } finally {
      setIsUpdating(false);
    }
  };

  // If no holder set, show nothing (per spec: no badge until manually started)
  if (!holder) {
    return null;
  }

  const isUs = holder === 'us';

  // Size classes
  const containerClasses = size === 'sm'
    ? 'text-[10px] h-5'
    : 'text-xs h-6';

  const segmentClasses = size === 'sm'
    ? 'px-1.5'
    : 'px-2';

  return (
    <div
      className={`
        inline-flex rounded overflow-hidden border border-gray-200
        ${containerClasses}
        ${isUpdating ? 'opacity-50' : ''}
      `}
      title={showTurns && turnsCount > 0 ? `${turnsCount} turns` : undefined}
    >
      {/* TT (Tenant) segment - Indigo/Navy for "Action" */}
      <button
        onClick={(e) => handleToggle('us', e)}
        disabled={isUpdating}
        className={`
          flex items-center gap-0.5 font-medium transition-all
          ${segmentClasses}
          ${isUs
            ? 'bg-indigo-100 text-indigo-800'
            : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-500 cursor-pointer'
          }
        `}
      >
        <span>TT</span>
        {isUs && <span className="opacity-70">•</span>}
        {isUs && <span>{daysHeld}d</span>}
      </button>

      {/* LL segment - Amber/Sage for "Waiting" */}
      <button
        onClick={(e) => handleToggle('ll', e)}
        disabled={isUpdating}
        className={`
          flex items-center gap-0.5 font-medium transition-all
          ${segmentClasses}
          ${!isUs
            ? 'bg-amber-100 text-amber-800'
            : 'bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-500 cursor-pointer'
          }
        `}
      >
        <span>LL</span>
        {!isUs && <span className="opacity-70">•</span>}
        {!isUs && <span>{daysHeld}d</span>}
      </button>
    </div>
  );
}
