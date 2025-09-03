import React, { useState } from 'react';

interface PropertySelectFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}

const PropertySelectField: React.FC<PropertySelectFieldProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const selectedOption = options.find(opt => opt.id === value);
  const displayValue = selectedOption?.label || 'Not set';

  const handleStartEdit = () => {
    if (disabled) return;
    setIsEditing(true);
  };

  const handleSave = (selectedValue: string) => {
    onChange(selectedValue || null);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <select
          value={value || ''}
          onChange={(e) => handleSave(e.target.value)}
          onBlur={handleCancel}
          onKeyDown={handleKeyDown}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
          autoFocus
        >
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div
        onClick={handleStartEdit}
        className={`mt-1 px-3 py-2 rounded-md shadow-sm border text-base min-h-[44px] flex items-center transition-colors ${
          disabled 
            ? 'bg-gray-100 cursor-not-allowed border-gray-200' 
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {displayValue}
        </span>
      </div>
    </div>
  );
};

export default PropertySelectField;