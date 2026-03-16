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
 * HandoffBadge - Clickable pill showing document handoff status
 *
 * Displays:
 * - "Us • 5d" (teal) when document is with us
 * - "LL • 3d" (amber) when document is with landlord
 * - Nothing when no status set yet
 *
 * Clicking toggles the holder and sets date to today.
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
  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    e.preventDefault();

    if (isUpdating) return;

    setIsUpdating(true);

    try {
      // Determine new holder (toggle, or set to 'us' if no current holder)
      const newHolder: 'us' | 'll' = holder === 'us' ? 'll' : 'us';

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

  // Styles based on holder
  const isUs = holder === 'us';
  const bgColor = isUs ? 'bg-cyan-100' : 'bg-amber-100';
  const textColor = isUs ? 'text-cyan-800' : 'text-amber-800';
  const hoverBg = isUs ? 'hover:bg-cyan-200' : 'hover:bg-amber-200';
  const label = isUs ? 'Us' : 'LL';

  // Size classes
  const sizeClasses = size === 'sm'
    ? 'text-xs px-2 py-0.5'
    : 'text-sm px-3 py-1';

  return (
    <button
      onClick={handleClick}
      disabled={isUpdating}
      className={`
        inline-flex items-center gap-1 rounded-full font-medium
        ${bgColor} ${textColor} ${hoverBg}
        ${sizeClasses}
        transition-colors cursor-pointer
        ${isUpdating ? 'opacity-50 cursor-wait' : ''}
      `}
      title={`Click to toggle to ${isUs ? 'LL' : 'Us'}`}
    >
      <span>{label}</span>
      <span className="opacity-75">•</span>
      <span>{daysHeld}d</span>
      {showTurns && turnsCount > 0 && (
        <>
          <span className="opacity-50">|</span>
          <span className="opacity-75">{turnsCount} turns</span>
        </>
      )}
    </button>
  );
}
