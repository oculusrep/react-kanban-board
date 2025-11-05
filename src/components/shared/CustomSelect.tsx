// components/shared/CustomSelect.tsx
import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

interface Option {
  id: string;
  label: string;
}

interface Props {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: Option[];
  placeholder?: string;
  allowClear?: boolean;
}

export default function CustomSelect({
  label,
  value,
  onChange,
  options,
  placeholder = "Select...",
  allowClear = true,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (optionId: string | null) => {
    onChange(optionId);
    setIsOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>

      {/* Custom Select Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-full bg-white border border-gray-300 rounded-md shadow-sm pl-3 pr-10 py-2 text-left cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm hover:bg-gray-50 transition-colors"
      >
        <span className={selectedOption ? "text-gray-900" : "text-gray-400"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform duration-200 ${
              isOpen ? "transform rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-[10001] mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
        >
          {/* Clear option */}
          {allowClear && value && (
            <>
              <div
                onClick={() => handleSelect(null)}
                className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm text-gray-500 border-b border-gray-200"
              >
                Clear selection
              </div>
            </>
          )}

          {/* Options */}
          {options.length > 0 ? (
            options.map((option) => (
              <div
                key={option.id}
                onClick={() => handleSelect(option.id)}
                className={`px-3 py-2 cursor-pointer text-sm flex items-center justify-between ${
                  value === option.id
                    ? "bg-blue-50 text-blue-900"
                    : "hover:bg-gray-100 text-gray-900"
                }`}
              >
                <span>{option.label}</span>
                {value === option.id && (
                  <Check className="h-4 w-4 text-blue-600" />
                )}
              </div>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-gray-500">No options available</div>
          )}
        </div>
      )}
    </div>
  );
}
