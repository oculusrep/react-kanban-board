import React, { useState } from 'react';

type FieldType = 'currency' | 'percentage' | 'number';
type ColorScheme = 'green' | 'blue' | 'purple' | 'gray' | 'orange';

interface FormattedFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  type?: FieldType;
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
  helpText?: string;
  maxValue?: number;
  // Display options
  showLarge?: boolean;      // For prominent display values
  colorScheme?: ColorScheme; // Color of the display value
  decimalPlaces?: number;   // Number of decimal places
}

const FormattedField: React.FC<FormattedFieldProps> = ({
  label,
  value,
  onChange,
  type = 'number',
  placeholder = '0',
  disabled = false,
  tabIndex,
  helpText,
  maxValue,
  showLarge = false,
  colorScheme = 'gray',
  decimalPlaces = 2,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Format the display value based on type
  const formatValue = (amount: number | null): string => {
    if (amount === null || amount === undefined) {
      switch (type) {
        case 'currency':
          return '$0.00';
        case 'percentage':
          return '0.00%';
        default:
          return '0';
      }
    }

    switch (type) {
      case 'currency':
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: decimalPlaces,
          maximumFractionDigits: decimalPlaces,
        }).format(amount);

      case 'percentage':
        return `${amount.toFixed(decimalPlaces)}%`;

      default:
        return amount.toFixed(decimalPlaces);
    }
  };

  const displayValue = value !== null && value !== undefined ? formatValue(value) : 'Not set';

  // Color classes for display value
  const colorClasses: Record<ColorScheme, string> = {
    green: 'text-green-700',
    blue: 'text-blue-700',
    purple: 'text-purple-700',
    gray: 'text-gray-900',
    orange: 'text-orange-700',
  };

  const handleStartEdit = (initialValue?: string) => {
    if (disabled || isSaving) return;
    setIsEditing(true);
    setIsSaving(false);
    // If initialValue is provided (user typed a character), use it
    // Otherwise use the raw numeric value
    setEditValue(initialValue !== undefined ? initialValue : (value?.toString() || ''));
  };

  const handleFocus = () => {
    if (disabled) return;
    handleStartEdit();
  };

  const handleSave = () => {
    if (isSaving) return; // Prevent double saves
    setIsSaving(true);

    const numericValue = parseFloat(editValue.replace(/[^0-9.-]/g, ''));

    if (isNaN(numericValue)) {
      onChange(null);
    } else {
      // Round to specified decimal places
      const roundedValue = Math.round(numericValue * Math.pow(10, decimalPlaces)) / Math.pow(10, decimalPlaces);
      // Enforce max value if specified
      const finalValue = maxValue ? Math.min(roundedValue, maxValue) : roundedValue;
      onChange(finalValue);
    }

    setIsEditing(false);
    setEditValue('');

    // Reset saving flag after a brief delay
    setTimeout(() => setIsSaving(false), 100);
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
        <label className="block text-form-label font-medium text-gray-700 mb-form-label-gap">
          {label}
        </label>
        <input
          type="text"
          inputMode="decimal"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={(e) => {
            // Use a small delay to prevent conflicts with other events
            setTimeout(() => {
              if (isEditing && !isSaving) {
                handleSave();
              }
            }, 50);
          }}
          onKeyDown={handleKeyDown}
          onFocus={(e) => {
            // Select all text when focused for easy replacement
            setTimeout(() => e.target.select(), 0);
          }}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-form-input-lg min-h-input"
          tabIndex={tabIndex}
          autoFocus
        />
        {helpText && (
          <p className="text-form-help text-gray-500 mt-1">{helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-form-label font-medium text-gray-700 mb-form-label-gap">
        {label}
      </label>
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
          showLarge ? 'min-h-input-lg' : 'min-h-input'
        } ${
          disabled
            ? 'bg-gray-100 cursor-not-allowed border-gray-200'
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
        role="button"
        aria-label={`Click to edit ${label}`}
      >
        <span
          className={`${
            value !== null ? colorClasses[colorScheme] : 'text-gray-500'
          } ${showLarge ? 'text-display-value font-semibold' : 'text-form-input-lg font-medium'}`}
        >
          {displayValue}
        </span>
      </div>
      {helpText && (
        <p className="text-form-help text-gray-500 mt-1">{helpText}</p>
      )}
    </div>
  );
};

export default FormattedField;
