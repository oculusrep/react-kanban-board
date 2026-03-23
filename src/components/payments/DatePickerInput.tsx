import React, { useState, useEffect, useRef } from 'react';

interface DatePickerInputProps {
  value: string | null;
  onChange: (value: string | null) => void;
  onFocus?: () => void;
  className?: string;
}

/**
 * A date picker input that only commits changes when the user
 * explicitly selects a date or blurs out of the field.
 *
 * This prevents the native date picker's arrow navigation from
 * immediately triggering onChange events.
 */
const DatePickerInput: React.FC<DatePickerInputProps> = ({
  value,
  onChange,
  onFocus,
  className = '',
}) => {
  // Track the "draft" value while user is navigating the picker
  const [localValue, setLocalValue] = useState(value || '');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const lastCommittedValue = useRef(value);

  // Sync with external value when not editing
  useEffect(() => {
    if (!isEditing) {
      setLocalValue(value || '');
      lastCommittedValue.current = value;
    }
  }, [value, isEditing]);

  const handleFocus = () => {
    setIsEditing(true);
    onFocus?.();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Only commit if user clicked on a specific day (value changed meaningfully)
    // We detect this by checking if the input loses focus shortly after
    // For now, we'll commit on change but this could be refined
  };

  const handleBlur = () => {
    setIsEditing(false);

    // Only trigger onChange if value actually changed from what was committed
    if (localValue !== (lastCommittedValue.current || '')) {
      onChange(localValue || null);
      lastCommittedValue.current = localValue || null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Commit on Enter
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      // Revert on Escape
      setLocalValue(lastCommittedValue.current || '');
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="date"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      className={className}
    />
  );
};

export default DatePickerInput;
