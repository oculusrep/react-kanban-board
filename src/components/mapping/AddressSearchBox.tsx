import React, { useState, useEffect, useRef } from 'react';
import { geocodingService } from '../../services/geocodingService';
import { supabase } from '../../lib/supabaseClient';

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

interface PropertyResult {
  id: string;
  property_name: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  latitude: number;
  longitude: number;
  verified_latitude?: number;
  verified_longitude?: number;
}

interface SearchSuggestion {
  type: 'address' | 'property' | 'place';
  addressData?: AddressSuggestion;
  propertyData?: PropertyResult;
  placeData?: AddressSuggestion; // Places use same structure as addresses
  display: {
    main_text: string;
    secondary_text: string;
  };
}

interface AddressSearchBoxProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: () => void;
  onPropertySelect?: (property: PropertyResult) => void; // Callback for when property is selected
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

const AddressSearchBox: React.FC<AddressSearchBoxProps> = ({
  value,
  onChange,
  onSearch,
  onPropertySelect,
  disabled = false,
  placeholder = "Search Address, City, State, or Property Name...",
  className = ""
}) => {
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);
  const [suppressSearch, setSuppressSearch] = useState(false);

  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Search properties by name
  const searchProperties = async (query: string): Promise<SearchSuggestion[]> => {
    try {
      console.log('🏢 Searching properties for:', query);

      // Search with case-insensitive partial matching on property name, address, and city
      const { data, error } = await supabase
        .from('property')
        .select(`
          id,
          property_name,
          address,
          city,
          state,
          zip,
          latitude,
          longitude,
          verified_latitude,
          verified_longitude,
          property_record_type_id,
          rent_psf,
          nnn_psf,
          acres,
          building_sqft,
          available_sqft,
          property_notes
        `)
        .or(`property_name.ilike.*${query}*,address.ilike.*${query}*,city.ilike.*${query}*`)
        .limit(10); // Increase limit before filtering

      if (error) {
        console.error('❌ Property search error:', error);
        return [];
      }

      console.log(`🔍 Raw query returned ${data?.length || 0} properties`);

      // Filter to only show properties with coordinates
      const propertiesWithCoords = (data || []).filter(property =>
        (property.latitude && property.longitude) ||
        (property.verified_latitude && property.verified_longitude)
      );

      console.log(`✅ After coordinate filter: ${propertiesWithCoords.length} properties`);

      const propertySuggestions: SearchSuggestion[] = propertiesWithCoords
        .slice(0, 5) // Limit to 5 after filtering
        .map(property => ({
          type: 'property',
          propertyData: property,
          display: {
            main_text: property.property_name || property.address,
            secondary_text: `${property.address}${property.city ? `, ${property.city}` : ''}${property.state ? `, ${property.state}` : ''}`
          }
        }));

      console.log('✅ Returning', propertySuggestions.length, 'property matches');
      if (propertySuggestions.length > 0) {
        console.log('📋 Property names:', propertySuggestions.map(p => p.display.main_text));
      }
      return propertySuggestions;
    } catch (error) {
      console.error('❌ Property search error:', error);
      return [];
    }
  };

  // Debounced search for both addresses and properties
  useEffect(() => {
    console.log('🔍 Search effect triggered:', { value, suppressSearch, length: value?.trim()?.length });

    if (!value || value.trim().length < 3 || suppressSearch) {
      console.log('⚠️ Search skipped:', {
        noValue: !value,
        tooShort: value?.trim()?.length < 3,
        suppressed: suppressSearch
      });
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        setIsLoadingSuggestions(true);

        // Search properties first (faster query)
        const propertyResults = await searchProperties(value);

        // Check if Google Maps API is available with a retry mechanism
        const checkGoogleMapsAvailable = () => {
          return window.google &&
                 window.google.maps &&
                 window.google.maps.places &&
                 window.google.maps.places.AutocompleteService;
        };

        // Wait for Google Maps API to be available (with timeout)
        let retries = 0;
        const maxRetries = 10; // 5 seconds max
        while (!checkGoogleMapsAvailable() && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 500));
          retries++;
        }

        let addressSuggestions: SearchSuggestion[] = [];

        if (checkGoogleMapsAvailable()) {
          console.log('🔍 Requesting suggestions for:', value);

          const autocompleteService = new window.google.maps.places.AutocompleteService();

          // Search for both addresses AND places (businesses)
          const [addressResults, placeResults] = await Promise.all([
            // Search for addresses
            new Promise<SearchSuggestion[]>((resolve) => {
              autocompleteService.getPlacePredictions(
                {
                  input: value,
                  types: ['geocode'], // Street addresses
                  componentRestrictions: { country: 'us' }
                },
                (predictions: any[], status: any) => {
                  console.log('📍 Address suggestions response:', { status, predictions: predictions?.length || 0 });

                  if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length > 0) {
                    const suggestions = predictions.slice(0, 3).map((prediction): SearchSuggestion => ({
                      type: 'address',
                      addressData: prediction,
                      display: {
                        main_text: prediction.structured_formatting.main_text,
                        secondary_text: prediction.structured_formatting.secondary_text
                      }
                    }));
                    console.log('✅ Found', suggestions.length, 'address suggestions');
                    resolve(suggestions);
                  } else {
                    console.log('⚠️ No address suggestions found');
                    resolve([]);
                  }
                }
              );
            }),
            // Search for places/businesses
            new Promise<SearchSuggestion[]>((resolve) => {
              autocompleteService.getPlacePredictions(
                {
                  input: value,
                  types: ['establishment'], // Businesses and places
                  componentRestrictions: { country: 'us' }
                },
                (predictions: any[], status: any) => {
                  console.log('🏢 Place suggestions response:', { status, predictions: predictions?.length || 0 });

                  if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions && predictions.length > 0) {
                    const suggestions = predictions.slice(0, 4).map((prediction): SearchSuggestion => ({
                      type: 'place',
                      placeData: prediction,
                      display: {
                        main_text: prediction.structured_formatting.main_text,
                        secondary_text: prediction.structured_formatting.secondary_text
                      }
                    }));
                    console.log('✅ Found', suggestions.length, 'place suggestions');
                    resolve(suggestions);
                  } else {
                    console.log('⚠️ No place suggestions found');
                    resolve([]);
                  }
                }
              );
            })
          ]);

          // Combine address and place results
          addressSuggestions = [...addressResults, ...placeResults];
        }

        // Combine results with properties first
        const allSuggestions = [...propertyResults, ...addressSuggestions].slice(0, 8); // Limit total to 8

        setIsLoadingSuggestions(false);

        if (allSuggestions.length > 0) {
          setSuggestions(allSuggestions);
          setShowSuggestions(true);
          console.log('✅ Showing', allSuggestions.length, 'total suggestions');
        } else {
          setSuggestions([]);
          setShowSuggestions(false);
          console.log('⚠️ No suggestions found');
        }
      } catch (error) {
        setIsLoadingSuggestions(false);
        console.log('❌ Search error:', error);
        setSuggestions([]);
        setShowSuggestions(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [value, suppressSearch]);

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

  const handleSelectSuggestion = (suggestion: SearchSuggestion) => {
    console.log('🔍 Suggestion selected:', suggestion.type, suggestion.display.main_text);

    // Immediately close dropdown and clear suggestions
    setShowSuggestions(false);
    setSelectedIndex(-1);
    setSuggestions([]);

    // Suppress search to prevent retriggering when we update the input value
    console.log('🚫 Setting suppressSearch to true');
    setSuppressSearch(true);

    // Blur the input field to remove focus
    inputRef.current?.blur();

    if (suggestion.type === 'property' && suggestion.propertyData && onPropertySelect) {
      // Handle property selection
      console.log('🏢 Calling onPropertySelect with:', suggestion.propertyData);
      onChange(suggestion.display.main_text);
      // Use setTimeout to ensure dropdown closing happens before callback
      setTimeout(() => {
        onPropertySelect(suggestion.propertyData!);
        // Don't automatically re-enable search - let user input do it
      }, 0);
    } else if (suggestion.type === 'address' && suggestion.addressData) {
      // Handle address selection
      console.log('📍 Handling address selection:', suggestion.addressData.description);
      onChange(suggestion.addressData.description);
      setTimeout(() => {
        onSearch();
        // Don't automatically re-enable search - let user input do it
      }, 100);
    } else if (suggestion.type === 'place' && suggestion.placeData) {
      // Handle place/business selection
      console.log('🏪 Handling place selection:', suggestion.placeData.description);
      onChange(suggestion.placeData.description);
      setTimeout(() => {
        onSearch();
        // Don't automatically re-enable search - let user input do it
      }, 100);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    console.log('⌨️ Input changed manually:', newValue);
    onChange(newValue);
    setSelectedIndex(-1);
    // Re-enable search when user manually types
    console.log('✅ Re-enabling search due to manual input');
    setSuppressSearch(false);
  };

  const handleInputFocus = () => {
    // Only show suggestions if we have them and they're not stale
    if (suggestions.length > 0 && value.trim().length >= 3) {
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
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[10001] max-h-64 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <div
              key={
                suggestion.type === 'property'
                  ? `property-${suggestion.propertyData?.id}`
                  : suggestion.type === 'place'
                  ? `place-${suggestion.placeData?.place_id}`
                  : `address-${suggestion.addressData?.place_id}`
              }
              onClick={() => handleSelectSuggestion(suggestion)}
              className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                index === selectedIndex
                  ? 'bg-blue-50 text-blue-900'
                  : 'hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center">
                <div className="mr-3 text-gray-400">
                  {suggestion.type === 'property' ? '🏢' : suggestion.type === 'place' ? '🏪' : '📍'}
                </div>
                <div>
                  <div className="font-medium text-gray-900">
                    {suggestion.display.main_text}
                  </div>
                  <div className="text-sm text-gray-600">
                    {suggestion.display.secondary_text}
                  </div>
                  {suggestion.type === 'property' && (
                    <div className="text-xs text-blue-600 mt-1">
                      Property in your database
                    </div>
                  )}
                  {suggestion.type === 'place' && (
                    <div className="text-xs text-green-600 mt-1">
                      Business from Google Places
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No suggestions message */}
      {showSuggestions && !isLoadingSuggestions && value.trim().length >= 3 && suggestions.length === 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-[10001] px-4 py-6 text-center text-gray-500">
          <div className="text-sm">No address suggestions found</div>
          <div className="text-xs mt-1">Press Enter to search anyway</div>
        </div>
      )}
    </div>
  );
};

export default AddressSearchBox;