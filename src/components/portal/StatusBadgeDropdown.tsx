import { useState, useRef, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface SubmitStage {
  id: string;
  name: string;
}

interface StatusBadgeDropdownProps {
  currentStageId: string | null;
  currentStageName: string | null;
  siteSubmitId: string;
  stages: SubmitStage[];
  canEdit: boolean;
  onStatusChange?: (newStageId: string, newStageName: string) => void;
}

// Stage color mapping for visual distinction
const STAGE_COLORS: Record<string, { bg: string; text: string; hoverBg: string }> = {
  'Submitted-Reviewing': { bg: 'bg-yellow-100', text: 'text-yellow-800', hoverBg: 'hover:bg-yellow-200' },
  'LOI': { bg: 'bg-blue-100', text: 'text-blue-800', hoverBg: 'hover:bg-blue-200' },
  'At Lease/PSA': { bg: 'bg-indigo-100', text: 'text-indigo-800', hoverBg: 'hover:bg-indigo-200' },
  'Under Contract/Contingent': { bg: 'bg-purple-100', text: 'text-purple-800', hoverBg: 'hover:bg-purple-200' },
  'Booked': { bg: 'bg-green-100', text: 'text-green-800', hoverBg: 'hover:bg-green-200' },
  'Executed Payable': { bg: 'bg-emerald-100', text: 'text-emerald-800', hoverBg: 'hover:bg-emerald-200' },
  'Store Opened': { bg: 'bg-teal-100', text: 'text-teal-800', hoverBg: 'hover:bg-teal-200' },
  'Pass': { bg: 'bg-gray-100', text: 'text-gray-800', hoverBg: 'hover:bg-gray-200' },
  'Use Declined': { bg: 'bg-orange-100', text: 'text-orange-800', hoverBg: 'hover:bg-orange-200' },
  'Use Conflict': { bg: 'bg-red-100', text: 'text-red-800', hoverBg: 'hover:bg-red-200' },
  'Not Available': { bg: 'bg-slate-100', text: 'text-slate-800', hoverBg: 'hover:bg-slate-200' },
  'Lost / Killed': { bg: 'bg-red-100', text: 'text-red-800', hoverBg: 'hover:bg-red-200' },
};

const DEFAULT_COLORS = { bg: 'bg-blue-100', text: 'text-blue-800', hoverBg: 'hover:bg-blue-200' };

export default function StatusBadgeDropdown({
  currentStageId,
  currentStageName,
  siteSubmitId,
  stages,
  canEdit,
  onStatusChange,
}: StatusBadgeDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const colors = currentStageName ? (STAGE_COLORS[currentStageName] || DEFAULT_COLORS) : DEFAULT_COLORS;

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // Close dropdown on escape key
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click from firing
    if (canEdit && !isUpdating) {
      setIsOpen(!isOpen);
    }
  };

  const handleStageSelect = async (stage: SubmitStage, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent row click from firing

    if (stage.id === currentStageId) {
      setIsOpen(false);
      return;
    }

    setIsUpdating(true);
    setIsOpen(false);

    try {
      const { error } = await supabase
        .from('site_submit')
        .update({
          submit_stage_id: stage.id,
          updated_at: new Date().toISOString()
        })
        .eq('id', siteSubmitId);

      if (error) {
        console.error('Error updating status:', error);
        return;
      }

      // Log status change as activity comment (detected via content pattern matching)
      const { data: user } = await supabase.auth.getUser();
      if (user.user) {
        await supabase.from('site_submit_comment').insert({
          site_submit_id: siteSubmitId,
          author_id: user.user.id,
          content: `changed status from "${currentStageName || 'Unknown'}" to "${stage.name}"`,
          visibility: 'client',
        });
      }

      // Notify parent of change for optimistic UI update
      if (onStatusChange) {
        onStatusChange(stage.id, stage.name);
      }
    } catch (err) {
      console.error('Error updating status:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Non-editable badge (for client view)
  if (!canEdit) {
    return (
      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${colors.bg} ${colors.text}`}>
        {currentStageName || '-'}
      </span>
    );
  }

  // Editable badge with dropdown
  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        onClick={handleBadgeClick}
        disabled={isUpdating}
        className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${colors.bg} ${colors.text} ${colors.hoverBg} cursor-pointer transition-colors ${
          isUpdating ? 'opacity-50' : ''
        }`}
        title="Click to change status"
      >
        {isUpdating ? (
          <svg className="animate-spin h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        ) : null}
        {currentStageName || '-'}
        <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-48 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 max-h-60 overflow-auto">
          <div className="py-1">
            {stages.map((stage) => {
              const stageColors = STAGE_COLORS[stage.name] || DEFAULT_COLORS;
              const isSelected = stage.id === currentStageId;

              return (
                <button
                  key={stage.id}
                  onClick={(e) => handleStageSelect(stage, e)}
                  className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between hover:bg-gray-100 ${
                    isSelected ? 'bg-gray-50' : ''
                  }`}
                >
                  <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${stageColors.bg} ${stageColors.text}`}>
                    {stage.name}
                  </span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
