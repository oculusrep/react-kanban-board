import React from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { FilterGroup as FilterGroupType, createEmptyGroup } from '../../types/advanced-search';
import FilterGroup from './FilterGroup';

interface QueryBuilderProps {
  filterGroups: FilterGroupType[];
  onChange: (groups: FilterGroupType[]) => void;
}

export default function QueryBuilder({ filterGroups, onChange }: QueryBuilderProps) {
  const handleGroupUpdate = (index: number, group: FilterGroupType) => {
    const newGroups = [...filterGroups];
    newGroups[index] = group;
    onChange(newGroups);
  };

  const handleGroupRemove = (index: number) => {
    const newGroups = filterGroups.filter((_, i) => i !== index);
    onChange(newGroups);
  };

  const handleAddGroup = () => {
    onChange([...filterGroups, createEmptyGroup()]);
  };

  return (
    <div className="space-y-4">
      {filterGroups.map((group, index) => (
        <div key={group.id}>
          {index > 0 && (
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 border-t border-[#8FA9C8]"></div>
              <span className="text-sm font-semibold text-[#002147] bg-[#F8FAFC] px-3 py-1 rounded-full border border-[#8FA9C8]">
                OR
              </span>
              <div className="flex-1 border-t border-[#8FA9C8]"></div>
            </div>
          )}
          <FilterGroup
            group={group}
            groupIndex={index}
            onUpdate={(updated) => handleGroupUpdate(index, updated)}
            onRemove={() => handleGroupRemove(index)}
            canRemove={filterGroups.length > 1}
          />
        </div>
      ))}

      <button
        onClick={handleAddGroup}
        className="w-full py-3 border-2 border-dashed border-[#8FA9C8] rounded-lg text-[#4A6B94] hover:border-[#002147] hover:text-[#002147] hover:bg-[#F8FAFC] transition-colors flex items-center justify-center gap-2"
      >
        <PlusIcon className="h-5 w-5" />
        Add Filter Group (OR)
      </button>
    </div>
  );
}
