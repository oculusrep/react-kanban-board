import React from 'react';
import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { FilterGroup as FilterGroupType, FilterCondition as FilterConditionType, createEmptyCondition } from '../../types/advanced-search';
import FilterCondition from './FilterCondition';

interface FilterGroupProps {
  group: FilterGroupType;
  groupIndex: number;
  onUpdate: (group: FilterGroupType) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function FilterGroup({ group, groupIndex, onUpdate, onRemove, canRemove }: FilterGroupProps) {
  const handleConditionUpdate = (index: number, condition: FilterConditionType) => {
    const newConditions = [...group.conditions];
    newConditions[index] = condition;
    onUpdate({ ...group, conditions: newConditions });
  };

  const handleConditionRemove = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index);
    onUpdate({ ...group, conditions: newConditions });
  };

  const handleAddCondition = () => {
    onUpdate({
      ...group,
      conditions: [...group.conditions, createEmptyCondition()],
    });
  };

  return (
    <div className="relative bg-white border border-[#8FA9C8] rounded-lg p-4 shadow-sm">
      {/* Group header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[#002147]">
            Filter Group {groupIndex + 1}
          </span>
          <span className="text-xs text-[#4A6B94] bg-[#F8FAFC] px-2 py-0.5 rounded">
            Conditions are AND'd
          </span>
        </div>
        {canRemove && (
          <button
            onClick={onRemove}
            className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
            title="Remove group"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-3">
        {group.conditions.map((condition, index) => (
          <div key={condition.id}>
            {index > 0 && (
              <div className="flex items-center gap-2 my-2">
                <div className="flex-1 border-t border-gray-200"></div>
                <span className="text-xs font-medium text-[#4A6B94] uppercase">AND</span>
                <div className="flex-1 border-t border-gray-200"></div>
              </div>
            )}
            <FilterCondition
              condition={condition}
              onUpdate={(updated) => handleConditionUpdate(index, updated)}
              onRemove={() => handleConditionRemove(index)}
              canRemove={group.conditions.length > 1}
            />
          </div>
        ))}
      </div>

      {/* Add condition button */}
      <button
        onClick={handleAddCondition}
        className="mt-4 flex items-center gap-1 text-sm text-[#4A6B94] hover:text-[#002147] transition-colors"
      >
        <PlusIcon className="h-4 w-4" />
        Add Condition
      </button>
    </div>
  );
}
