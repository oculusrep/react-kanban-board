import React, { useState, useEffect, useRef } from 'react';
import { useAssignmentSearch, AssignmentSearchResult } from '../../hooks/useAssignmentSearch';
import { Plus } from 'lucide-react';

interface AssignmentSelectorProps {
  selectedAssignment: AssignmentSearchResult | null;
  onAssignmentSelect: (assignment: AssignmentSearchResult | null) => void;
  onCreateNew?: () => void;
  placeholder?: string;
  className?: string;
  limit?: number; // Number of results to show before "Add New" option
  clientId?: string | null; // Filter assignments by client ID
}

const AssignmentSelector: React.FC<AssignmentSelectorProps> = ({
  selectedAssignment,
  onAssignmentSelect,
  onCreateNew,
  placeholder = "Search assignments...",
  className = "",
  limit = 5,
  clientId
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AssignmentSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const { searchAssignments, getAllAssignments, loading } = useAssignmentSearch();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync query with selectedAssignment when it changes from outside
  useEffect(() => {
    if (selectedAssignment) {
      setQuery(selectedAssignment.assignment_name);
    } else if (query && !selectedAssignment) {
      // Clear query if selectedAssignment is cleared externally
      setQuery('');
    }
  }, [selectedAssignment]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      if (showDropdown) {
        // Show all assignments when no query but dropdown is open
        getAllAssignments(clientId).then(setResults);
      } else {
        setResults([]);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      searchAssignments(query, clientId).then(setResults);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, searchAssignments, getAllAssignments, showDropdown, clientId]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    const totalItems = Math.min(results.length, limit) + (onCreateNew ? 1 : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < totalItems - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (selectedIndex < Math.min(results.length, limit)) {
            // Select an assignment
            handleSelectAssignment(results[selectedIndex]);
          } else if (onCreateNew) {
            // "Add New Assignment" option selected
            handleCreateNew();
          }
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelectAssignment = (assignment: AssignmentSearchResult) => {
    onAssignmentSelect(assignment);
    setQuery(assignment.assignment_name);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const handleClearSelection = () => {
    onAssignmentSelect(null);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
    setShowDropdown(true);
    // Always load assignments for the client when focusing
    // This ensures we show all assignments even if there's text in the field
    if (!selectedAssignment) {
      getAllAssignments(clientId).then(setResults);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowDropdown(true);
    setSelectedIndex(-1);

    // Clear selection if user is typing something different
    if (selectedAssignment && value !== selectedAssignment.assignment_name) {
      onAssignmentSelect(null);
    }

    // Clear everything if input is empty
    if (value === "") {
      onAssignmentSelect(null);
      setResults([]);
      setShowDropdown(false);
    }
  };

  const handleCreateNew = () => {
    setShowDropdown(false);
    setSelectedIndex(-1);
    if (onCreateNew) {
      onCreateNew();
    }
  };

  // Limit results to show before "Add New" option
  const displayedResults = results.slice(0, limit);
  const hasMore = results.length > limit;

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleInputFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
      />

      {/* Dropdown with suggestions */}
      {showDropdown && (
        <div className="absolute z-[10001] mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-auto">
          {loading ? (
            <div className="p-2 text-sm text-gray-500">Loading...</div>
          ) : displayedResults.length > 0 ? (
            <>
              {displayedResults.map((assignment, index) => (
                <div
                  key={assignment.id}
                  onClick={() => handleSelectAssignment(assignment)}
                  className={`p-2 hover:bg-gray-100 cursor-pointer text-sm border-b border-gray-100 last:border-b-0 ${
                    index === selectedIndex ? 'bg-gray-100' : ''
                  }`}
                >
                  <div className="font-medium">{assignment.assignment_name}</div>
                </div>
              ))}

              {/* Show "Add New Assignment" option after results */}
              {onCreateNew && (
                <div
                  onClick={handleCreateNew}
                  className={`p-2 hover:bg-green-50 cursor-pointer text-sm border-t border-gray-200 ${
                    selectedIndex === displayedResults.length ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-green-600 font-medium">
                    <Plus size={16} />
                    <span>Add New Assignment</span>
                  </div>
                </div>
              )}

              {hasMore && (
                <div className="p-2 text-xs text-gray-400 text-center bg-gray-50">
                  Showing {limit} of {results.length} results
                </div>
              )}
            </>
          ) : query.trim().length > 0 ? (
            <>
              <div className="p-2 text-sm text-gray-500">
                No assignments found{clientId ? ' for this client' : ''}
              </div>
              {onCreateNew && (
                <div
                  onClick={handleCreateNew}
                  className={`p-2 hover:bg-green-50 cursor-pointer text-sm border-t border-gray-200 ${
                    selectedIndex === 0 ? 'bg-green-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 text-green-600 font-medium">
                    <Plus size={16} />
                    <span>Add New Assignment</span>
                  </div>
                </div>
              )}
            </>
          ) : onCreateNew ? (
            <>
              {clientId && results.length === 0 && (
                <div className="p-2 text-sm text-gray-500 border-b border-gray-200">
                  No assignments for this client
                </div>
              )}
              <div
                onClick={handleCreateNew}
                className="p-2 hover:bg-green-50 cursor-pointer text-sm"
              >
                <div className="flex items-center gap-2 text-green-600 font-medium">
                  <Plus size={16} />
                  <span>Add New Assignment</span>
                </div>
              </div>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AssignmentSelector;
