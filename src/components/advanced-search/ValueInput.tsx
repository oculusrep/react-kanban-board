import React from 'react';
import { FieldType, Operator } from '../../types/advanced-search';

interface ValueInputProps {
  fieldType: FieldType | null;
  operator: Operator | null;
  value: string | number | boolean | null;
  value2?: string | number | null;
  onChange: (value: string | number | boolean | null, value2?: string | number | null) => void;
}

export default function ValueInput({ fieldType, operator, value, value2, onChange }: ValueInputProps) {
  // Ensure values are never undefined for controlled inputs
  const displayValue = value !== null && value !== undefined ? String(value) : '';
  const displayValue2 = value2 !== null && value2 !== undefined ? String(value2) : '';

  // No value input needed for empty checks or boolean operators
  if (!fieldType || !operator) {
    return (
      <input
        type="text"
        disabled
        value=""
        placeholder="Select field and operator..."
        className="block w-full rounded-md border border-[#8FA9C8] bg-gray-100 px-3 py-2 text-sm text-gray-500 cursor-not-allowed"
      />
    );
  }

  if (operator === 'is_empty' || operator === 'is_not_empty' || operator === 'is_true' || operator === 'is_false') {
    return (
      <div className="block w-full rounded-md border border-[#8FA9C8] bg-gray-50 px-3 py-2 text-sm text-gray-500 italic">
        No value needed
      </div>
    );
  }

  const inputClassName = "block w-full rounded-md border border-[#8FA9C8] bg-white px-3 py-2 text-sm text-[#002147] focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]";

  // Between operator needs two inputs
  if (operator === 'between') {
    if (fieldType === 'numeric') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={displayValue}
            onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null, value2)}
            placeholder="Min"
            className={inputClassName}
          />
          <span className="text-sm text-gray-500">and</span>
          <input
            type="number"
            value={displayValue2}
            onChange={(e) => onChange(value, e.target.value ? Number(e.target.value) : null)}
            placeholder="Max"
            className={inputClassName}
          />
        </div>
      );
    }
    if (fieldType === 'date') {
      return (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={displayValue}
            onChange={(e) => onChange(e.target.value || null, value2)}
            className={inputClassName}
          />
          <span className="text-sm text-gray-500">and</span>
          <input
            type="date"
            value={displayValue2}
            onChange={(e) => onChange(value, e.target.value || null)}
            className={inputClassName}
          />
        </div>
      );
    }
  }

  // Single value inputs based on field type
  switch (fieldType) {
    case 'text':
      return (
        <input
          type="text"
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Enter value..."
          className={inputClassName}
        />
      );

    case 'numeric':
      return (
        <input
          type="number"
          value={displayValue}
          onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder="Enter number..."
          className={inputClassName}
        />
      );

    case 'date':
      return (
        <input
          type="date"
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          className={inputClassName}
        />
      );

    default:
      return (
        <input
          type="text"
          value={displayValue}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder="Enter value..."
          className={inputClassName}
        />
      );
  }
}
