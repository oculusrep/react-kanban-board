import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabaseClient';

interface AutocompleteOption {
  value: string;
  count: number; // Number of properties with this trade area
}

interface PropertyAutocompleteFieldProps {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  field: string; // Database field to search (e.g., 'trade_area')
  placeholder?: string;
  disabled?: boolean;
  tabIndex?: number;
}

const PropertyAutocompleteField: React.FC<PropertyAutocompleteFieldProps> = ({
  label,
  value,
  onChange,
  field,
  placeholder,
  disabled = false,
  tabIndex
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteOption[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loading, setLoading] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const displayValue = value || '';

  // Fetch suggestions based on input
  const fetchSuggestions = async (searchTerm: string) => {
    if (searchTerm.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('property')
        .select(field)
        .not(field, 'is', null)
        .ilike(field, `%${searchTerm}%`);

      if (error) throw error;

      // Count occurrences and create suggestions
      const counts: { [key: string]: number } = {};
      data?.forEach((item: any) => {
        const fieldValue = item[field];
        if (fieldValue) {
          counts[fieldValue] = (counts[fieldValue] || 0) + 1;
        }
      });

      // Convert to suggestions array and sort by count (most used first)
      const suggestionList = Object.entries(counts)
        .map(([val, count]) => ({ value: val, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8); // Limit to 8 suggestions

      setSuggestions(suggestionList);
    } catch (error) {
      console.error('Error fetching suggestions:', error);
      setSuggestions([]);
    } finally {
      setLoading(false);
    }
  };

  // Debounce the suggestions fetch
  useEffect(() => {
    if (!isEditing) return;

    const timer = setTimeout(() => {
      fetchSuggestions(inputValue);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, isEditing, field]);

  const handleStartEdit = (initialValue?: string) => {
    if (disabled) return;
    setIsEditing(true);
    setInputValue(initialValue !== undefined ? initialValue : value || '');
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const handleFocus = () => {
    if (disabled) return;
    handleStartEdit();
  };

  const handleSave = (saveValue?: string) => {
    const finalValue = saveValue ?? inputValue;
    onChange(finalValue.trim() || null);
    setIsEditing(false);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedIndex(-1);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setShowSuggestions(false);
    setSuggestions([]);
    setInputValue('');
    setSelectedIndex(-1);
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
    handleSave(suggestion);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedIndex >= 0 && suggestions[selectedIndex]) {
        handleSave(suggestions[selectedIndex].value);
      } else {
        handleSave();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInputValue(newValue);
    setShowSuggestions(true);
    setSelectedIndex(-1);
  };

  const handleBlur = () => {
    // Delay hiding suggestions to allow clicks
    setTimeout(() => {
      if (!suggestionsRef.current?.contains(document.activeElement)) {
        handleSave();
      }
    }, 150);
  };

  if (isEditing) {
    return (
      <div className="relative">
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-base min-h-[44px]"
          tabIndex={tabIndex}
          autoFocus
        />
        
        {/* Suggestions Dropdown */}
        {showSuggestions && (suggestions.length > 0 || loading) && (
          <div
            ref={suggestionsRef}
            className="absolute z-50 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto"
          >
            {loading && (
              <div className="px-3 py-2 text-sm text-gray-500 flex items-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                Loading suggestions...
              </div>
            )}
            
            {!loading && suggestions.map((suggestion, index) => (
              <button
                key={suggestion.value}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur
                  handleSuggestionClick(suggestion.value);
                }}
                className={`w-full px-3 py-2 text-left hover:bg-blue-50 flex items-center justify-between ${
                  index === selectedIndex ? 'bg-blue-50 text-blue-900' : 'text-gray-900'
                }`}
              >
                <span className="truncate">{suggestion.value}</span>
                <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                  {suggestion.count} properties
                </span>
              </button>
            ))}
            
            {!loading && suggestions.length === 0 && inputValue.trim().length >= 2 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                No matching {label.toLowerCase()} found
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div
        onClick={() => handleStartEdit()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleStartEdit();
          } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Handle direct typing - start editing with the typed character
            e.preventDefault();
            handleStartEdit(e.key);
          }
        }}
        onFocus={handleFocus}
        tabIndex={tabIndex || 0}
        className={`mt-1 px-3 py-2 rounded-md shadow-sm border text-base min-h-[44px] flex items-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          disabled 
            ? 'bg-gray-100 cursor-not-allowed border-gray-200' 
            : 'cursor-pointer hover:bg-blue-50 border-transparent hover:border-blue-200 bg-white'
        }`}
        title={disabled ? 'Not editable' : 'Click to edit - suggestions will appear as you type'}
        role="button"
        aria-label={`Click to edit ${label}`}
      >
        <span className={value ? 'text-gray-900' : 'text-gray-500'}>
          {displayValue}
        </span>
      </div>
    </div>
  );
};

export default PropertyAutocompleteField;