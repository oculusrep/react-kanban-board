import React, { useState } from 'react';

interface PropertyInputFieldProps {
  label: string;
  value: string | number | null;
  onChange: (value: string | number | null) => void;
  type?: 'text' | 'number' | 'email' | 'url';
  placeholder?: string;
  disabled?: boolean;
  multiline?: boolean;
  rows?: number;
  inputMode?: 'text' | 'decimal' | 'numeric' | 'email' | 'url';
  tabIndex?: number;
}

const PropertyInputField: React.FC<PropertyInputFieldProps> = ({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  disabled = false,
  multiline = false,
  rows = 1,
  inputMode,
  tabIndex
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const displayValue = (value !== null && value !== undefined && value !== '' && value !== 0) ? value : '';

  const handleStartEdit = () => {
    if (disabled) return;
    setIsEditing(true);
    setEditValue(value?.toString() || '');
  };

  const handleFocus = () => {
    if (disabled) return;
    handleStartEdit();
  };

  const handleSave = () => {
    if (type === 'number') {
      const numValue = parseFloat(editValue);
      onChange(isNaN(numValue) ? null : numValue);
    } else {
      onChange(editValue.trim() || null);
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
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
    const InputComponent = multiline ? 'textarea' : 'input';
    
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <InputComponent
          type={multiline ? undefined : type}
          inputMode={inputMode}
          value={editValue}
          onChange={(e: any) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={multiline ? rows : undefined}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px] resize-none"
          tabIndex={tabIndex}
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
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStartEdit();
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Handle direct typing - start editing with the typed character
            e.preventDefault();
            setIsEditing(true);
            setEditValue(e.key);
          }
        }}
        onFocus={handleFocus}
        tabIndex={tabIndex || 0}
        className={`mt-1 px-3 py-2 rounded-md shadow-sm border text-base min-h-[44px] flex items-start transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled 
            ? 'bg-gray-100 cursor-not-allowed border-gray-200' 
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit'}
        role="button"
        aria-label={`Click to edit ${label}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {multiline ? (
            <div className="whitespace-pre-wrap">{displayValue}</div>
          ) : (
            displayValue
          )}
        </span>
      </div>
    </div>
  );
};

export default PropertyInputField;