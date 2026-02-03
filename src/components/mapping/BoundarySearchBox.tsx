import React, { useState, useEffect, useRef } from 'react';
import { boundaryService, BoundarySearchResult } from '../../services/boundaryService';

interface BoundarySearchBoxProps {
  onSelect: (boundary: BoundarySearchResult) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /** Optional: filter search to a specific state FIPS code */
  stateFips?: string;
  /** Boundaries already in collection (to show "already added" state) */
  existingBoundaryIds?: Set<string>;
}

const BoundarySearchBox: React.FC<BoundarySearchBoxProps> = ({
  onSelect,
  disabled = false,
  placeholder = "Search counties by name...",
  className = "",
  stateFips,
  existingBoundaryIds = new Set(),
}) => {
  const [value, setValue] = useState('');
  const [suggestions, setSuggestions] = useState<BoundarySearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoading, setIsLoading] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced search
  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const results = await boundaryService.searchCounties(value.trim(), stateFips);
        setSuggestions(results);
        setShowSuggestions(results.length > 0);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Boundary search error:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value, stateFips]);

  // Handle clicking outside to close suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
        setSelectedIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showSuggestions || suggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && suggestions[selectedIndex]) {
          handleSelectSuggestion(suggestions[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelectSuggestion = (suggestion: BoundarySearchResult) => {
    // Don't select if already in collection
    if (existingBoundaryIds.has(suggestion.geoid)) {
      return;
    }

    // Clear and close
    setValue('');
    setShowSuggestions(false);
    setSelectedIndex(-1);
    setSuggestions([]);
    inputRef.current?.blur();

    // Notify parent
    onSelect(suggestion);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value);
    setSelectedIndex(-1);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0 && value.trim().length >= 2) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      <div className="relative">
        {/* Search icon */}
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="w-full pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {/* Loading indicator */}
        {isLoading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[10001] max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => {
            const isAlreadyAdded = existingBoundaryIds.has(suggestion.geoid);

            return (
              <div
                key={suggestion.geoid}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                  isAlreadyAdded
                    ? 'bg-gray-50 cursor-not-allowed'
                    : index === selectedIndex
                    ? 'bg-blue-50 text-blue-900'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className="mr-3 text-gray-400">
                      {/* County icon */}
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                      </svg>
                    </div>
                    <div>
                      <div className={`font-medium ${isAlreadyAdded ? 'text-gray-400' : 'text-gray-900'}`}>
                        {suggestion.name} County
                      </div>
                      <div className={`text-sm ${isAlreadyAdded ? 'text-gray-400' : 'text-gray-600'}`}>
                        {suggestion.state}
                      </div>
                    </div>
                  </div>

                  {isAlreadyAdded ? (
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded">
                      Added
                    </span>
                  ) : (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded">
                      + Add
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No results message */}
      {showSuggestions && !isLoading && value.trim().length >= 2 && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[10001] px-4 py-6 text-center text-gray-500">
          <div className="text-sm">No counties found matching "{value}"</div>
          <div className="text-xs mt-1">Try a different search term</div>
        </div>
      )}
    </div>
  );
};

export default BoundarySearchBox;
