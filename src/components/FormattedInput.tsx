// components/FormattedInput.tsx
import { useState, useEffect, useRef } from "react";

interface Props {
  label: string;
  value: number | null;
  onChange: (val: string) => void;
  format: (val: number | null) => string;
  editingField: string | null;
  setEditingField: (key: string | null) => void;
  fieldKey: string;
  tabIndex?: number;
}

export default function FormattedInput({
  label,
  value,
  onChange,
  format,
  editingField,
  setEditingField,
  fieldKey,
  tabIndex,
}: Props) {
  const isEditing = editingField === fieldKey;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const handleBlur = () => {
    setEditingField(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setEditingField(fieldKey);
    }
  };

  const handleFocus = () => {
    setEditingField(fieldKey);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      {isEditing ? (
        <input
          ref={inputRef}
          type="number"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
          tabIndex={tabIndex}
        />
      ) : (
        <div
          onClick={() => setEditingField(fieldKey)}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          className="mt-1 p-2 bg-gray-100 rounded text-sm cursor-pointer"
          tabIndex={tabIndex}
        >
          {value === null || value === undefined || value === ""
            ? ""
            : format(value)}
        </div>
      )}
    </div>
  );
}
