import React from 'react';
import { Operator, FieldType, OPERATORS_BY_TYPE } from '../../types/advanced-search';

interface OperatorSelectorProps {
  fieldType: FieldType | null;
  value: Operator | null;
  onChange: (operator: Operator | null) => void;
}

export default function OperatorSelector({ fieldType, value, onChange }: OperatorSelectorProps) {
  const operators = fieldType ? OPERATORS_BY_TYPE[fieldType] : [];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    onChange(selectedValue ? (selectedValue as Operator) : null);
  };

  return (
    <select
      value={value || ''}
      onChange={handleChange}
      disabled={!fieldType}
      className="block w-full rounded-md border border-[#8FA9C8] bg-white px-3 py-2 text-sm text-[#002147] focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147] disabled:bg-gray-100 disabled:cursor-not-allowed"
    >
      <option value="">Select operator...</option>
      {operators.map(op => (
        <option key={op.value} value={op.value}>
          {op.label}
        </option>
      ))}
    </select>
  );
}
