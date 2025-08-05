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
}

export default function FormattedInput({
  label,
  value,
  onChange,
  format,
  editingField,
  setEditingField,
  fieldKey,
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
        />
      ) : (
        <div
          onClick={() => setEditingField(fieldKey)}
          className="mt-1 p-2 bg-gray-100 rounded text-sm cursor-pointer"
        >
          {value === null || value === undefined || value === ""
            ? ""
            : format(value)}
        </div>
      )}
    </div>
  );
}
