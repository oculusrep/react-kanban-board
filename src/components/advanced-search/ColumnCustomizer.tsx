import React, { useState, useRef, useEffect } from 'react';
import { Cog6ToothIcon, CheckIcon } from '@heroicons/react/24/outline';
import { ALL_AVAILABLE_COLUMNS, DEFAULT_COLUMNS } from '../../types/advanced-search';

interface ColumnCustomizerProps {
  selectedColumns: string[];
  onChange: (columns: string[]) => void;
}

export default function ColumnCustomizer({ selectedColumns, onChange }: ColumnCustomizerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleColumn = (columnKey: string) => {
    if (selectedColumns.includes(columnKey)) {
      // Don't allow removing all columns
      if (selectedColumns.length > 1) {
        onChange(selectedColumns.filter(c => c !== columnKey));
      }
    } else {
      onChange([...selectedColumns, columnKey]);
    }
  };

  const resetToDefault = () => {
    onChange([...DEFAULT_COLUMNS]);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 text-sm text-[#4A6B94] border border-[#8FA9C8] rounded-md hover:bg-[#F8FAFC] transition-colors"
      >
        <Cog6ToothIcon className="h-4 w-4" />
        Columns
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white border border-[#8FA9C8] rounded-lg shadow-lg z-50">
          <div className="p-3 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#002147]">Customize Columns</span>
              <button
                onClick={resetToDefault}
                className="text-xs text-[#4A6B94] hover:text-[#002147]"
              >
                Reset to default
              </button>
            </div>
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {ALL_AVAILABLE_COLUMNS.map(column => {
              const isSelected = selectedColumns.includes(column.key);
              return (
                <button
                  key={column.key}
                  onClick={() => toggleColumn(column.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                    isSelected
                      ? 'bg-[#002147] bg-opacity-10 text-[#002147]'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <div className={`w-4 h-4 border rounded flex items-center justify-center ${
                    isSelected ? 'bg-[#002147] border-[#002147]' : 'border-gray-300'
                  }`}>
                    {isSelected && <CheckIcon className="h-3 w-3 text-white" />}
                  </div>
                  {column.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
