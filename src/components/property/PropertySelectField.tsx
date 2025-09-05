import React, { useState } from 'react';

interface PropertySelectFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { id: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
  required?: boolean;
  defaultText?: string;
}

const PropertySelectField: React.FC<PropertySelectFieldProps> = ({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  tabIndex,
  required = false,
  defaultText = "Not set"
}) => {
  const [isEditing, setIsEditing] = useState(false);

  const selectedOption = options.find(opt => opt.id === value);
  const displayValue = selectedOption?.label || defaultText;
  const isEmpty = !value;
  const showRequiredStyling = required && isEmpty;

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
          className={`w-full px-3 py-2 rounded-md shadow-sm text-base min-h-[44px] ${
            showRequiredStyling
              ? 'border-red-300 bg-red-50 focus:ring-red-500 focus:border-red-500'
              : 'border-gray-300 bg-white focus:ring-blue-500 focus:border-blue-500'
          }`}
          tabIndex={tabIndex}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStartEdit();
          }
        }}
        onFocus={handleStartEdit}
        tabIndex={tabIndex || 0}
        className={`mt-1 px-3 py-2 rounded-md shadow-sm border text-base min-h-[44px] flex items-center transition-colors focus:outline-none focus:ring-2 ${
          disabled 
            ? 'bg-gray-100 cursor-not-allowed border-gray-200' 
            : showRequiredStyling
            ? 'cursor-pointer bg-red-50 border-red-300 hover:bg-red-100 hover:border-red-400 focus:ring-red-500 focus:border-red-500'
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white focus:ring-blue-500 focus:border-blue-500'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
        role="button"
        aria-label={`Click to edit ${label}`}
      >
        <span className={
          value 
            ? 'text-gray-900' 
            : showRequiredStyling
            ? 'text-red-600 font-medium'
            : 'text-gray-500'
        }>
          {displayValue}
        </span>
      </div>
    </div>
  );
};

export default PropertySelectField;