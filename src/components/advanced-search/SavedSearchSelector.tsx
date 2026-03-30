import React, { useState, useRef, useEffect } from 'react';
import {
  ChevronDownIcon,
  BookmarkIcon,
  GlobeAltIcon,
  UserIcon,
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
} from '@heroicons/react/24/outline';
import { SavedSearch } from '../../types/advanced-search';
import { useAuth } from '../../contexts/AuthContext';

interface SavedSearchSelectorProps {
  savedSearches: SavedSearch[];
  mySearches: SavedSearch[];
  publicSearches: SavedSearch[];
  currentSearchId: string | null;
  onSelect: (search: SavedSearch) => void;
  onEdit: (search: SavedSearch) => void;
  onDelete: (search: SavedSearch) => void;
  onCopy: (search: SavedSearch) => void;
  onSaveNew: () => void;
  onSaveCurrent: () => void;
  hasUnsavedChanges: boolean;
}

export default function SavedSearchSelector({
  mySearches,
  publicSearches,
  currentSearchId,
  onSelect,
  onEdit,
  onDelete,
  onCopy,
  onSaveNew,
  onSaveCurrent,
  hasUnsavedChanges,
}: SavedSearchSelectorProps) {
  const { user } = useAuth();
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

  const currentSearch = [...mySearches, ...publicSearches].find(s => s.id === currentSearchId);
  const isOwner = currentSearch?.created_by_id === user?.id;

  return (
    <div className="flex items-center gap-2">
      {/* Saved Search Dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-3 py-2 text-sm text-[#002147] border border-[#8FA9C8] rounded-md hover:bg-[#F8FAFC] transition-colors min-w-[200px]"
        >
          <BookmarkIcon className="h-4 w-4 text-[#4A6B94]" />
          <span className="flex-1 text-left truncate">
            {currentSearch ? currentSearch.name : 'Saved Searches'}
          </span>
          <ChevronDownIcon className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {isOpen && (
          <div className="absolute left-0 mt-2 w-80 bg-white border border-[#8FA9C8] rounded-lg shadow-lg z-50 max-h-96 overflow-hidden flex flex-col">
            {/* My Searches */}
            {mySearches.length > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-[#4A6B94] uppercase flex items-center gap-1">
                  <UserIcon className="h-3 w-3" />
                  My Searches
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {mySearches.map(search => (
                    <SearchItem
                      key={search.id}
                      search={search}
                      isSelected={search.id === currentSearchId}
                      isOwner={true}
                      onSelect={() => {
                        onSelect(search);
                        setIsOpen(false);
                      }}
                      onEdit={() => {
                        onEdit(search);
                        setIsOpen(false);
                      }}
                      onDelete={() => {
                        onDelete(search);
                        setIsOpen(false);
                      }}
                      onCopy={() => {
                        onCopy(search);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Public Searches */}
            {publicSearches.length > 0 && (
              <div className="border-b border-gray-200">
                <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-[#4A6B94] uppercase flex items-center gap-1">
                  <GlobeAltIcon className="h-3 w-3" />
                  Public Searches
                </div>
                <div className="max-h-40 overflow-y-auto">
                  {publicSearches.map(search => (
                    <SearchItem
                      key={search.id}
                      search={search}
                      isSelected={search.id === currentSearchId}
                      isOwner={false}
                      onSelect={() => {
                        onSelect(search);
                        setIsOpen(false);
                      }}
                      onCopy={() => {
                        onCopy(search);
                        setIsOpen(false);
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Empty state */}
            {mySearches.length === 0 && publicSearches.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                No saved searches yet
              </div>
            )}
          </div>
        )}
      </div>

      {/* Save / Save As buttons */}
      {currentSearchId && isOwner && (
        <button
          onClick={onSaveCurrent}
          disabled={!hasUnsavedChanges}
          className="px-3 py-2 text-sm text-[#4A6B94] border border-[#8FA9C8] rounded-md hover:bg-[#F8FAFC] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Save changes to current search"
        >
          Save
        </button>
      )}
      <button
        onClick={onSaveNew}
        className="px-3 py-2 text-sm text-[#4A6B94] border border-[#8FA9C8] rounded-md hover:bg-[#F8FAFC] transition-colors"
        title="Save as new search"
      >
        Save As...
      </button>
    </div>
  );
}

// Individual search item in the dropdown
function SearchItem({
  search,
  isSelected,
  isOwner,
  onSelect,
  onEdit,
  onDelete,
  onCopy,
}: {
  search: SavedSearch;
  isSelected: boolean;
  isOwner: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
}) {
  return (
    <div
      className={`group flex items-center justify-between px-3 py-2 hover:bg-gray-50 cursor-pointer ${
        isSelected ? 'bg-[#002147] bg-opacity-10' : ''
      }`}
    >
      <div className="flex-1 min-w-0" onClick={onSelect}>
        <div className="text-sm text-[#002147] truncate">
          {search.name}
          {search.is_public && (
            <GlobeAltIcon className="inline-block h-3 w-3 ml-1 text-[#4A6B94]" />
          )}
        </div>
        {search.description && (
          <div className="text-xs text-gray-500 truncate">{search.description}</div>
        )}
        {!isOwner && search.created_by_name && (
          <div className="text-xs text-gray-400">by {search.created_by_name}</div>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {isOwner && onEdit && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="p-1 text-gray-400 hover:text-[#002147] rounded"
            title="Edit"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onCopy();
          }}
          className="p-1 text-gray-400 hover:text-[#002147] rounded"
          title="Copy"
        >
          <DocumentDuplicateIcon className="h-4 w-4" />
        </button>
        {isOwner && onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-gray-400 hover:text-red-500 rounded"
            title="Delete"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
