import React, { useState } from 'react';

interface PropertyCurrencyFieldProps {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
  helpText?: string;
  showLarge?: boolean; // For prominent display
  colorScheme?: 'green' | 'blue' | 'purple' | 'gray' | 'orange';
}

const PropertyCurrencyField: React.FC<PropertyCurrencyFieldProps> = ({
  label,
  value,
  onChange,
  placeholder = "0",
  disabled = false,
  tabIndex,
  helpText,
  showLarge = false,
  colorScheme = 'gray'
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const formatCurrency = (amount: number | null): string => {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const displayValue = value !== null && value !== undefined ? formatCurrency(value) : 'Not set';

  const colorClasses = {
    green: 'text-green-700',
    blue: 'text-blue-700', 
    purple: 'text-purple-700',
    gray: 'text-gray-900',
    orange: 'text-orange-700'
  };

  const handleStartEdit = (initialValue?: string) => {
    if (disabled || isSaving) return;
    console.log(`[${label}] Starting edit, current value:`, value, 'initialValue:', initialValue);
    setIsEditing(true);
    setIsSaving(false); // Reset saving flag
    // If initialValue is provided (user typed a character), use it
    // Otherwise use the raw numeric value, not the formatted display
    setEditValue(initialValue !== undefined ? initialValue : (value?.toString() || ''));
  };

  const handleFocus = () => {
    if (disabled) return;
    handleStartEdit();
  };

  const handleSave = () => {
    if (isSaving) return; // Prevent double saves
    setIsSaving(true);
    
    const numericValue = parseFloat(editValue.replace(/[^0-9.-]/g, '')) || null;
    console.log(`[${label}] Saving value:`, editValue, '→', numericValue);
    
    onChange(numericValue);
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
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
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
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
          tabIndex={tabIndex}
          autoFocus
        />
        {helpText && (
          <p className="text-xs text-gray-500 mt-1">{helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
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
        className={`mt-1 px-3 py-2 rounded-md shadow-sm border ${showLarge ? 'min-h-[48px]' : 'min-h-[44px]'} flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled 
            ? 'bg-gray-100 cursor-not-allowed border-gray-200' 
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
        role="button"
        aria-label={`Click to edit ${label}`}
      >
        <span className={`${value !== null ? colorClasses[colorScheme] : 'text-gray-500'} ${showLarge ? 'text-lg font-semibold' : 'font-medium'}`}>
          {displayValue}
        </span>
      </div>
      {helpText && (
        <p className="text-xs text-gray-500 mt-1">{helpText}</p>
      )}
    </div>
  );
};

export default PropertyCurrencyField;