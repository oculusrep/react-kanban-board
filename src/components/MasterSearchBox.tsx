import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMasterSearch, SearchResult } from '../hooks/useMasterSearch';
import AdvancedSearchModal from './AdvancedSearchModal';
import { supabase } from '../lib/supabaseClient';

interface MasterSearchBoxProps {
  placeholder?: string;
  className?: string;
  onSelect?: (result: SearchResult) => void;
}

const MasterSearchBox: React.FC<MasterSearchBoxProps> = ({
  placeholder = "Search deals, clients, contacts, properties, site submits...",
  className = "",
  onSelect
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [showAdvancedModal, setShowAdvancedModal] = useState(false);
  
  const { search, loading } = useMasterSearch();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Test database connectivity on mount
  useEffect(() => {
    const testDB = async () => {
      try {
        console.log('🔌 Testing database connectivity...');
        const { data, error } = await supabase.from('deal').select('id, deal_name').limit(1);
        if (error) {
          console.error('❌ Database connection error:', error);
        } else {
          console.log('✅ Database connected successfully, sample data:', data);
        }
      } catch (err) {
        console.error('❌ Database test failed:', err);
      }
    };
    testDB();
  }, []);

  // Debounced search
  useEffect(() => {
    console.log(`📝 MasterSearchBox query changed: "${query}"`);
    
    if (!query.trim()) {
      console.log('🚫 Empty query, clearing results');
      setResults([]);
      setShowDropdown(false);
      return;
    }

    console.log(`⏰ Setting up debounced search for: "${query}"`);
    const timeoutId = setTimeout(async () => {
      console.log(`🚀 Executing search for: "${query}"`);
      try {
        const searchResults = await search(query, { limit: 10 });
        console.log(`📊 MasterSearchBox received ${searchResults.length} results:`, searchResults);
        setResults(searchResults);
        setShowDropdown(searchResults.length > 0);
      } catch (error) {
        console.error('❌ Search failed in MasterSearchBox:', error);
      }
    }, 300);

    return () => {
      console.log(`🗑️ Clearing timeout for: "${query}"`);
      clearTimeout(timeoutId);
    };
  }, [query, search]);

  // Click outside handler
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


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelectedIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || results.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => 
          prev < results.length - 1 ? prev + 1 : prev
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
        break;
      case 'Enter':
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          // Ctrl/Cmd + Enter opens advanced search
          setShowAdvancedModal(true);
          setShowDropdown(false);
        } else if (selectedIndex >= 0) {
          handleResultSelect(results[selectedIndex]);
        } else if (results.length > 0) {
          handleResultSelect(results[0]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleResultSelect = (result: SearchResult) => {
    setQuery(result.title);
    setShowDropdown(false);
    setSelectedIndex(-1);
    
    if (onSelect) {
      onSelect(result);
    } else if (result.url) {
      navigate(result.url);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'deal':
        return (
          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
          </svg>
        );
      case 'client':
        return (
          <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        );
      case 'contact':
        return (
          <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        );
      case 'property':
        return (
          <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        );
      case 'site_submit':
        return (
          <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      default:
        return (
          <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        );
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'deal': return 'Deal';
      case 'client': return 'Client';
      case 'contact': return 'Contact';
      case 'property': return 'Property';
      case 'site_submit': return 'Site Submit';
      default: return '';
    }
  };

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
          </svg>
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          className="block w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm"
          placeholder={placeholder}
        />
        {loading && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-96 overflow-y-auto">
          {results.map((result, index) => (
            <div
              key={`${result.type}-${result.id}`}
              className={`px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 ${
                index === selectedIndex ? 'bg-blue-50' : ''
              }`}
              onClick={() => handleResultSelect(result)}
            >
              <div className="flex items-start space-x-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getTypeIcon(result.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {result.title}
                    </p>
                    <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                      {getTypeLabel(result.type)}
                    </span>
                  </div>
                  {result.subtitle && (
                    <p className="text-sm text-gray-600 truncate">
                      {result.subtitle}
                    </p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    {result.description && (
                      <p className="text-xs text-gray-500 truncate">
                        {result.description}
                      </p>
                    )}
                    {result.metadata && (
                      <span className="ml-2 text-xs text-gray-400 truncate">
                        {result.metadata}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {/* Advanced Search Link */}
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => {
                setShowAdvancedModal(true);
                setShowDropdown(false);
              }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all results in advanced search
            </button>
            <span className="text-xs text-gray-500 ml-2">
              (Ctrl+Enter)
            </span>
          </div>
        </div>
      )}

      {/* No Results Message */}
      {showDropdown && results.length === 0 && query.trim() && !loading && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
          <div className="px-4 py-3 text-sm text-gray-500 text-center">
            No results found for "{query}"
          </div>
          <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
            <button
              onClick={() => {
                setShowAdvancedModal(true);
                setShowDropdown(false);
              }}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              Try advanced search
            </button>
          </div>
        </div>
      )}

      {/* Advanced Search Modal */}
      <AdvancedSearchModal
        isOpen={showAdvancedModal}
        onClose={() => setShowAdvancedModal(false)}
        initialQuery={query}
      />
    </div>
  );
};

export default MasterSearchBox;