// components/PercentageInput.tsx
import React, { useState } from 'react';

interface PercentageInputProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
}

const PercentageInput: React.FC<PercentageInputProps> = ({
  label,
  value,
  onChange,
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayValue = value ? `${value.toFixed(1)}%` : '0.0%';

  const handleStartEdit = () => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(value?.toString() || '');
  };

  const handleSave = () => {
    const numValue = parseFloat(editValue);
    onChange(isNaN(numValue) ? null : numValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          type="number"
          step="0.1"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          autoFocus
        />
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div
        onClick={handleStartEdit}
        className={`mt-1 block w-full rounded border-gray-300 shadow-sm px-3 py-2 transition-colors border text-sm ${
          disabled 
            ? 'bg-gray-100 cursor-not-allowed border-gray-200' 
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
      >
        {displayValue}
      </div>
    </div>
  );
};

export default PercentageInput;