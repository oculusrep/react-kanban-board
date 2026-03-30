import React from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { FilterCondition as FilterConditionType, SearchableField, Operator } from '../../types/advanced-search';
import FieldSelector from './FieldSelector';
import OperatorSelector from './OperatorSelector';
import ValueInput from './ValueInput';

interface FilterConditionProps {
  condition: FilterConditionType;
  onUpdate: (condition: FilterConditionType) => void;
  onRemove: () => void;
  canRemove: boolean;
}

export default function FilterCondition({ condition, onUpdate, onRemove, canRemove }: FilterConditionProps) {
  const handleFieldChange = (field: SearchableField | null) => {
    // Reset operator and value when field changes
    onUpdate({
      ...condition,
      field,
      operator: null,
      value: null,
      value2: undefined,
    });
  };

  const handleOperatorChange = (operator: Operator | null) => {
    // Reset value when operator changes
    onUpdate({
      ...condition,
      operator,
      value: null,
      value2: undefined,
    });
  };

  const handleValueChange = (value: string | number | boolean | null, value2?: string | number | null) => {
    onUpdate({
      ...condition,
      value,
      value2,
    });
  };

  return (
    <div className="flex items-start gap-3">
      <div className="flex-1 grid grid-cols-3 gap-3">
        <FieldSelector
          value={condition.field}
          onChange={handleFieldChange}
        />
        <OperatorSelector
          fieldType={condition.field?.type || null}
          value={condition.operator}
          onChange={handleOperatorChange}
        />
        <ValueInput
          fieldType={condition.field?.type || null}
          operator={condition.operator}
          value={condition.value}
          value2={condition.value2}
          onChange={handleValueChange}
        />
      </div>
      <button
        onClick={onRemove}
        disabled={!canRemove}
        className={`p-2 rounded-md transition-colors ${
          canRemove
            ? 'text-gray-400 hover:text-red-500 hover:bg-red-50'
            : 'text-gray-200 cursor-not-allowed'
        }`}
        title={canRemove ? 'Remove condition' : 'At least one condition required'}
      >
        <XMarkIcon className="h-5 w-5" />
      </button>
    </div>
  );
}
