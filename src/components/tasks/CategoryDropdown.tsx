import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { invalidateCategoryCache } from '../../lib/taskCategory';
import { TaskCategoryColor, TaskCategoryRow } from '../../types/task';
import CreateCategoryModal from './CreateCategoryModal';

// Inline pill-style category picker. Modeled on StatusBadgeDropdown
// (the established OVIS inline-pill pattern). Categories are now
// team-wide, user-extensible — fetched from the task_category table.
// Bottom of the menu has a "+ New category…" option that opens the
// CreateCategoryModal.

const COLOR_STYLES: Record<TaskCategoryColor, { bg: string; text: string; hoverBg: string }> = {
  amber:  { bg: 'bg-amber-100',  text: 'text-amber-800',  hoverBg: 'hover:bg-amber-200' },
  blue:   { bg: 'bg-blue-100',   text: 'text-blue-800',   hoverBg: 'hover:bg-blue-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800', hoverBg: 'hover:bg-indigo-200' },
  gray:   { bg: 'bg-gray-100',   text: 'text-gray-800',   hoverBg: 'hover:bg-gray-200' },
  green:  { bg: 'bg-green-100',  text: 'text-green-800',  hoverBg: 'hover:bg-green-200' },
  slate:  { bg: 'bg-slate-100',  text: 'text-slate-800',  hoverBg: 'hover:bg-slate-200' },
  red:    { bg: 'bg-red-100',    text: 'text-red-800',    hoverBg: 'hover:bg-red-200' },
  teal:   { bg: 'bg-teal-100',   text: 'text-teal-800',   hoverBg: 'hover:bg-teal-200' },
};

const PLACEHOLDER_STYLE = {
  bg: 'bg-white border border-slate-300',
  text: 'text-slate-500',
  hoverBg: 'hover:bg-slate-50',
};

const styleFor = (color: string | undefined) =>
  (color && color in COLOR_STYLES)
    ? COLOR_STYLES[color as TaskCategoryColor]
    : COLOR_STYLES.slate;

interface CategoryDropdownProps {
  /** Currently-selected category id (the FK value on task.category_id). */
  value: string | null;
  /** Pass the category id (UUID) the user picks. */
  onChange: (categoryId: string) => void;
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
  const [createOpen, setCreateOpen] = useState(false);
  const [categories, setCategories] = useState<TaskCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const loadCategories = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('task_category')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) {
      console.error('[CategoryDropdown] load failed:', error);
    } else {
      setCategories(data ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadCategories();
  }, []);

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

  const selected = categories.find((c) => c.id === value) ?? null;
  const triggerStyle = selected ? styleFor(selected.color) : PLACEHOLDER_STYLE;

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    setIsOpen((prev) => !prev);
  };

  const handleSelect = (e: React.MouseEvent, cat: TaskCategoryRow) => {
    e.stopPropagation();
    setIsOpen(false);
    if (cat.id !== value) onChange(cat.id);
  };

  const handleOpenCreate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    setCreateOpen(true);
  };

  const handleCreated = async (newCat: TaskCategoryRow) => {
    // Refetch so sort_order positioning reflects what was inserted, then
    // auto-select the new one — assuming the user wants to apply what they
    // just created. Also bust the global cache so updateTask's sync logic
    // and other dropdown instances see the new row.
    invalidateCategoryCache();
    await loadCategories();
    onChange(newCat.id);
  };

  return (
    <>
      <div ref={containerRef} className="relative inline-block">
        <button
          type="button"
          onClick={handleToggle}
          disabled={disabled}
          className={`inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${triggerStyle.bg} ${triggerStyle.text} ${triggerStyle.hoverBg}`}
        >
          {selected?.name ?? placeholder}
          <svg className="w-3 h-3 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {isOpen && (
          <div className="absolute z-50 mt-1 w-44 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5 max-h-72 overflow-auto">
            <div className="py-1">
              {loading && (
                <div className="px-3 py-1.5 text-xs italic text-gray-500">Loading…</div>
              )}
              {!loading && categories.length === 0 && (
                <div className="px-3 py-1.5 text-xs italic text-gray-500">No categories yet.</div>
              )}
              {!loading &&
                categories.map((cat) => {
                  const style = styleFor(cat.color);
                  const isSelected = cat.id === value;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={(e) => handleSelect(e, cat)}
                      className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between hover:bg-gray-100 ${isSelected ? 'bg-gray-50' : ''}`}
                    >
                      <span className={`inline-flex px-2 py-0.5 text-[11px] font-medium rounded-full ${style.bg} ${style.text}`}>
                        {cat.name}
                      </span>
                      {isSelected && (
                        <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  );
                })}
              <div className="border-t border-gray-200 my-1" />
              <button
                type="button"
                onClick={handleOpenCreate}
                className="w-full text-left px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 font-medium"
              >
                + New category…
              </button>
            </div>
          </div>
        )}
      </div>

      <CreateCategoryModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />
    </>
  );
};

export default CategoryDropdown;
