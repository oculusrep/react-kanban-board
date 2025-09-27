import React, { useState } from 'react';
import { ChevronUp, ChevronDown, Eye, EyeOff } from 'lucide-react';
import { SiteSubmitPin, STAGE_CATEGORIES } from './SiteSubmitPin';

interface SiteSubmitLegendProps {
  visibleStages: Set<string>;
  onStageToggle: (stageName: string) => void;
  onCategoryToggle?: (categoryKey: string) => void;
  onShowAll?: () => void;
  onHideAll?: () => void;
  totalCounts?: Record<string, number>;
  className?: string;
  forceExpanded?: boolean;
}

const SiteSubmitLegend: React.FC<SiteSubmitLegendProps> = ({
  visibleStages,
  onStageToggle,
  onCategoryToggle,
  onShowAll,
  onHideAll,
  totalCounts = {},
  className = '',
  forceExpanded = false
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use forceExpanded prop to override local state
  const effectiveIsExpanded = forceExpanded || isExpanded;
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const toggleCategory = (categoryKey: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryKey)) {
      newExpanded.delete(categoryKey);
    } else {
      newExpanded.add(categoryKey);
    }
    setExpandedCategories(newExpanded);
  };

  const toggleAllStagesInCategory = (categoryKey: string) => {
    const category = STAGE_CATEGORIES[categoryKey as keyof typeof STAGE_CATEGORIES];
    if (onCategoryToggle) {
      onCategoryToggle(categoryKey);
    } else {
      // Fallback: toggle each stage individually
      category.stages.forEach(stage => {
        onStageToggle(stage);
      });
    }
  };

  const getCategoryVisibility = (categoryKey: string) => {
    const category = STAGE_CATEGORIES[categoryKey as keyof typeof STAGE_CATEGORIES];
    const visibleCount = category.stages.filter(stage => visibleStages.has(stage)).length;
    if (visibleCount === 0) return 'none';
    if (visibleCount === category.stages.length) return 'all';
    return 'partial';
  };

  const getTotalVisibleStages = () => {
    return Array.from(visibleStages).length;
  };

  const getTotalStageCount = () => {
    return Object.values(STAGE_CATEGORIES).reduce((total, category) => total + category.stages.length, 0);
  };

  // Get all stages that have site submits (count > 0) in custom order
  const getStagesWithCounts = () => {
    const stagesWithData = Object.keys(totalCounts).filter(stageName => (totalCounts[stageName] || 0) > 0);
    console.log('🏷️ Stages with site submits:', stagesWithData);
    console.log('📊 Stage counts:', totalCounts);
    console.log('🔍 Looking for Submitted-Reviewing in counts:', totalCounts['Submitted-Reviewing']);
    console.log('🔍 All stage names from database:', Object.keys(totalCounts));

    // Custom order as requested - priority from top to bottom
    const customOrder = [
      'Submitted-Reviewing',
      'Ready to Submit',
      'Pre-Submittal',
      'Mike to Review',
      'Pursuing Ownership',
      'Pass',
      'Use Declined',
      'Use Conflict',
      'Not Available',
      'Protected',
      'Unassigned Territory',
      'Lost / Killed',
      'Monitor',
      'LOI',
      'At Lease/PSA',
      'Under Contract / Contingent',
      'Booked',
      'Executed Deal',
      'Closed - Under Construction',
      'Store Open'
    ];

    // Filter and sort stages based on custom order, then add any remaining stages
    const orderedStages = customOrder.filter(stage => stagesWithData.includes(stage));
    const remainingStages = stagesWithData.filter(stage => !customOrder.includes(stage));

    return [...orderedStages, ...remainingStages];
  };

  // Calculate dynamic height based on number of stages
  const stagesWithCounts = getStagesWithCounts();
  const stageCount = stagesWithCounts.length;

  // Each stage row is approximately 28px (py-1 + content + space-y-0.5)
  // Plus minimal padding (8px top/bottom) and footer (56px)
  const calculateContentHeight = () => {
    const baseHeight = (stageCount * 28) + 8 + 56;
    const maxHeight = typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600;
    return Math.min(baseHeight, maxHeight);
  };

  const dynamicHeight = effectiveIsExpanded ? `${calculateContentHeight()}px` : '0px';

  return (
    <div className={`fixed bottom-0 left-4 bg-white rounded-t-lg shadow-lg border border-gray-200 border-b-0 z-50 transition-transform duration-300 ease-in-out ${className} ${
      effectiveIsExpanded ? 'translate-y-0' : 'translate-y-[calc(100%-3rem)]'
    }`}>
      {/* Header */}
      <div
        className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 rounded-t-lg"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center space-x-2">
          <h3 className="font-semibold text-gray-800">Site Submit Legend</h3>
        </div>
        {effectiveIsExpanded ? (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        )}
      </div>

      {/* Expanded Content */}
      <div
        className={`border-t border-gray-200 transition-all duration-300 ${
          effectiveIsExpanded ? 'opacity-100' : 'opacity-0 overflow-hidden'
        }`}
        style={{
          height: dynamicHeight,
          maxHeight: effectiveIsExpanded ? `${typeof window !== 'undefined' ? window.innerHeight * 0.7 : 600}px` : '0px'
        }}
      >
          <div className="p-1 space-y-0.5">
            {stagesWithCounts.map(stage => {
              const isVisible = visibleStages.has(stage);
              const count = totalCounts[stage] || 0;

              return (
                <div
                  key={stage}
                  className="flex items-center justify-between py-1 px-2 hover:bg-gray-50 rounded cursor-pointer"
                  onClick={() => onStageToggle(stage)}
                >
                  <div className="flex items-center space-x-2">
                    <SiteSubmitPin stageName={stage} size={20} showTooltip={false} />
                    <span className={`text-xs ${isVisible ? 'text-gray-800' : 'text-gray-400'}`}>
                      {stage} ({count})
                    </span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStageToggle(stage);
                    }}
                    className="p-0.5 hover:bg-gray-100 rounded transition-colors"
                    title={`${isVisible ? 'Hide' : 'Show'} ${stage} pins`}
                  >
                    {isVisible ? (
                      <Eye className="w-3 h-3 text-green-600" />
                    ) : (
                      <EyeOff className="w-3 h-3 text-gray-400" />
                    )}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Footer Actions */}
          <div className="p-1.5 bg-gray-50 rounded-b-lg border-t border-gray-200">
            <div className="flex justify-between space-x-2">
              <button
                onClick={() => {
                  if (onShowAll) {
                    onShowAll();
                  } else {
                    // Fallback to individual toggles
                    getStagesWithCounts().forEach(stage => {
                      if (!visibleStages.has(stage)) {
                        onStageToggle(stage);
                      }
                    });
                  }
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
              >
                Show All
              </button>
              <button
                onClick={() => {
                  if (onHideAll) {
                    onHideAll();
                  } else {
                    // Fallback to individual toggles
                    getStagesWithCounts().forEach(stage => {
                      if (visibleStages.has(stage)) {
                        onStageToggle(stage);
                      }
                    });
                  }
                }}
                className="flex-1 px-3 py-1.5 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors"
              >
                Hide All
              </button>
            </div>
          </div>
        </div>
    </div>
  );
};

export default SiteSubmitLegend;