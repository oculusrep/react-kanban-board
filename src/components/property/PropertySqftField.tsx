import React, { useState } from 'react';

interface PropertySqftFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
  helpText?: string;
  compact?: boolean;
}

const PropertySqftField: React.FC<PropertySqftFieldProps> = ({
  label,
  value,
  onChange,
  placeholder = "10,000",
  disabled = false,
  tabIndex,
  helpText,
  compact = false
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const formatSqft = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '0';
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const displayValue = value !== null && value !== undefined ? `${formatSqft(value)} SF` : 'Not set';

  const handleStartEdit = (initialValue?: string) => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(initialValue !== undefined ? initialValue : (value?.toString() || ''));
  };

  const handleFocus = () => {
    if (disabled) return;
    handleStartEdit();
  };

  const handleSave = () => {
    const numericValue = parseFloat(editValue.replace(/[^0-9.-]/g, '')) || null;
    onChange(numericValue);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      handleSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      handleCancel();
    }
  };

  if (isEditing) {
    return (
      <div>
        <label className={`block font-medium text-gray-700 mb-1 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</label>
        <input
          type="text"
          inputMode="numeric"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            // Select all text when focused for easy replacement
            setTimeout(() => e.target.select(), 0);
          }}
          placeholder={placeholder}
          className={`w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 ${compact ? 'text-sm' : 'text-base min-h-[44px]'}`}
          tabIndex={tabIndex}
          autoFocus
        />
        {helpText && !compact && (
          <p className="text-xs text-gray-500 mt-1">{helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className={`block font-medium text-gray-700 mb-1 ${compact ? 'text-xs' : 'text-sm'}`}>{label}</label>
      <div
        onClick={() => handleStartEdit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStartEdit();
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Handle direct typing - start editing with the typed character
            e.preventDefault();
            handleStartEdit(e.key);
          }
        }}
        onFocus={handleFocus}
        tabIndex={tabIndex || 0}
        className={`mt-1 px-3 py-2 rounded-md shadow-sm border flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          compact ? 'text-sm' : 'text-base min-h-[44px]'
        } ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed border-gray-200'
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
        role="button"
        aria-label={`Click to edit ${label}`}
      >
        <span className={`${value !== null ? 'text-gray-900' : 'text-gray-500'} font-medium`}>
          {displayValue}
        </span>
      </div>
      {helpText && !compact && (
        <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      )}
    </div>
  );
};

export default PropertySqftField;