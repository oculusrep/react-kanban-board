import React, { useEffect, useRef, useState } from 'react';
import { TaskCategory } from '../../types/task';

// Inline pill-style category picker. Modeled on StatusBadgeDropdown
// (the established OVIS inline-pill pattern) — custom button trigger,
// per-option color chips, click-outside / Escape to close.

const CATEGORIES: TaskCategory[] = ['prospecting', 'pipeline', 'ovis', 'email', 'personal', 'other'];

const CATEGORY_STYLES: Record<TaskCategory, { bg: string; text: string; hoverBg: string }> = {
  prospecting: { bg: 'bg-amber-100', text: 'text-amber-800', hoverBg: 'hover:bg-amber-200' },
  pipeline: { bg: 'bg-blue-100', text: 'text-blue-800', hoverBg: 'hover:bg-blue-200' },
  ovis: { bg: 'bg-indigo-100', text: 'text-indigo-800', hoverBg: 'hover:bg-indigo-200' },
  email: { bg: 'bg-gray-100', text: 'text-gray-800', hoverBg: 'hover:bg-gray-200' },
  personal: { bg: 'bg-green-100', text: 'text-green-800', hoverBg: 'hover:bg-green-200' },
  other: { bg: 'bg-slate-100', text: 'text-slate-800', hoverBg: 'hover:bg-slate-200' },
};

const PLACEHOLDER_STYLE = {
  bg: 'bg-white border border-slate-300',
  text: 'text-slate-500',
  hoverBg: 'hover:bg-slate-50',
};

interface CategoryDropdownProps {
  value: TaskCategory | null;
  onChange: (category: TaskCategory) => void;
  placeholder?: string;
  disabled?: boolean;
}

export const CategoryDropdown: React.FC<CategoryDropdownProps> = ({
  value,
  onChange,
  placeholder = 'Category…',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const triggerStyle = value ? CATEGORY_STYLES[value] : PLACEHOLDER_STYLE;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (e: React.MouseEvent, category: TaskCategory) => {
    e.stopPropagation();
    setIsOpen(false);
    if (category !== value) onChange(category);
  };

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${triggerStyle.bg} ${triggerStyle.text} ${triggerStyle.hoverBg}`}
      >
        {value ?? placeholder}
        <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute z-50 mt-1 w-40 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 max-h-60 overflow-auto">
          <div className="py-1">
            {CATEGORIES.map((c) => {
              const style = CATEGORY_STYLES[c];
              const isSelected = c === value;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={(e) => handleSelect(e, c)}
                  className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-gray-100 ${isSelected ? 'bg-gray-50' : ''}`}
                >
                  <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${style.bg} ${style.text}`}>
                    {c}
                  </span>
                  {isSelected && (
                    <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryDropdown;
