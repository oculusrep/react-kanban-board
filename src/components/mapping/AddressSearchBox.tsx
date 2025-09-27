import React, { useState, useEffect, useRef } from 'react';
import { geocodingService } from '../../services/geocodingService';

// Google Maps types
declare global {
  interface Window {
    google: any;
  }
}

interface AddressSuggestion {
  place_id: string;
  description: string;
  structured_formatting: {
    main_text: string;
    secondary_text: string;
  };
}

interface AddressSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const AddressSearchBox: React.FC<AddressSearchBoxProps> = ({
  value,
  onChange,
  onSearch,
  disabled = false,
  placeholder = "Search Address, City, State...",
  className = ""
}) => {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Debounced address suggestions
  useEffect(() => {
    if (!value || value.trim().length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true);

        // Check if Google Maps API is available with a retry mechanism
        const checkGoogleMapsAvailable = () => {
          return window.google &&
                 window.google.maps &&
                 window.google.maps.places &&
                 window.google.maps.places.AutocompleteService;
        };

        // Wait for Google Maps API to be available (with timeout)
        let retries = 0;
        const maxRetries = 20; // 10 seconds max
        while (!checkGoogleMapsAvailable() && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }

        if (!checkGoogleMapsAvailable()) {
          setIsLoadingSuggestions(false);
          console.log('❌ Google Maps Places API not available after timeout');
          setSuggestions([]);
          setShowSuggestions(false);
          return;
        }

        console.log('🔍 Requesting address suggestions for:', value);

        const autocompleteService = new window.google.maps.places.AutocompleteService();

        autocompleteService.getPlacePredictions(
          {
            input: value,
            types: ['geocode'], // Use geocode for all address types
            componentRestrictions: { country: 'us' } // Restrict to US addresses
          },
          (predictions: any[], status: any) => {
            setIsLoadingSuggestions(false);
            console.log('📍 Address suggestions response:', { status, predictions: predictions?.length || 0 });

            if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length > 0) {
              setSuggestions(predictions.slice(0, 5)); // Limit to 5 suggestions
              setShowSuggestions(true);
              console.log('✅ Showing', predictions.length, 'address suggestions');
            } else {
              setSuggestions([]);
              setShowSuggestions(false);
              console.log('⚠️ No address suggestions found or API error');
            }
          }
        );
      } catch (error) {
        setIsLoadingSuggestions(false);
        console.log('❌ Address suggestions error:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value]);

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
      if (e.key === 'Enter') {
        e.preventDefault();
        onSearch();
      }
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
        } else {
          onSearch();
        }
        break;
      case 'Escape':
        setShowSuggestions(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelectSuggestion = (suggestion: AddressSuggestion) => {
    onChange(suggestion.description);
    setShowSuggestions(false);
    setSelectedIndex(-1);
    // Automatically trigger search when suggestion is selected
    setTimeout(onSearch, 100);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);
  };

  const handleInputFocus = () => {
    if (suggestions.length > 0) {
      setShowSuggestions(true);
    }
  };

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          className="px-3 py-1 border border-gray-300 rounded text-sm w-80 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />

        {/* Loading indicator */}
        {isLoadingSuggestions && (
          <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin h-3 w-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.place_id}
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                index === selectedIndex
                  ? 'bg-blue-50 text-blue-900'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center">
                <div className="mr-3 text-gray-400">
                  📍
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {suggestion.structured_formatting.main_text}
                  </div>
                  <div className="text-sm text-gray-600">
                    {suggestion.structured_formatting.secondary_text}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No suggestions message */}
      {showSuggestions && !isLoadingSuggestions && value.trim().length >= 3 && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 px-4 py-6 text-center text-gray-500">
          <div className="text-sm">No address suggestions found</div>
          <div className="text-xs mt-1">Press Enter to search anyway</div>
        </div>
      )}
    </div>
  );
};

export default AddressSearchBox;