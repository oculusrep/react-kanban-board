import React from 'react';
import { SearchableField, PROPERTY_FIELDS, UNIT_FIELDS } from '../../types/advanced-search';

interface FieldSelectorProps {
  value: SearchableField | null;
  onChange: (field: SearchableField | null) => void;
}

export default function FieldSelector({ value, onChange }: FieldSelectorProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    if (!selectedKey) {
      onChange(null);
      return;
    }

    const allFields = [...PROPERTY_FIELDS, ...UNIT_FIELDS];
    const field = allFields.find(f => f.key === selectedKey);
    onChange(field || null);
  };

  return (
    <select
      value={value?.key || ''}
      onChange={handleChange}
      className="block w-full rounded-md border border-[#8FA9C8] bg-white px-3 py-2 text-sm text-[#002147] focus:border-[#002147] focus:outline-none focus:ring-1 focus:ring-[#002147]"
    >
      <option value="">Select field...</option>
      <optgroup label="Property Fields">
        {PROPERTY_FIELDS.map(field => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </optgroup>
      <optgroup label="Unit Fields">
        {UNIT_FIELDS.map(field => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </optgroup>
    </select>
  );
}
