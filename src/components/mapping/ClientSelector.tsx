import React, { useState, useEffect, useRef } from 'react';
import { useClientSearch, ClientSearchResult } from '../../hooks/useClientSearch';

interface ClientSelectorProps {
  selectedClient: ClientSearchResult | null;
  onClientSelect: (client: ClientSearchResult | null) => void;
  placeholder?: string;
  className?: string;
}

const ClientSelector: React.FC<ClientSelectorProps> = ({
  selectedClient,
  onClientSelect,
  placeholder = "Search clients...",
  className = ""
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ClientSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const { searchActiveClients, getAllActiveClients, loading } = useClientSearch();
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync query with selectedClient when it changes from outside
  useEffect(() => {
    if (selectedClient) {
      setQuery(selectedClient.client_name);
    } else if (query && !selectedClient) {
      // Clear query if selectedClient is cleared externally
      setQuery('');
    }
  }, [selectedClient]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      if (showDropdown) {
        // Show all clients when no query but dropdown is open
        getAllActiveClients().then(setResults);
      } else {
        setResults([]);
      }
      return;
    }

    const timeoutId = setTimeout(() => {
      searchActiveClients(query).then(setResults);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query, searchActiveClients, getAllActiveClients, showDropdown]);

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
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleSelectClient(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  const handleSelectClient = (client: ClientSearchResult) => {
    onClientSelect(client);
    setQuery(client.client_name);
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  const handleClearSelection = () => {
    onClientSelect(null);
    setQuery('');
    setResults([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  const handleInputFocus = () => {
    setShowDropdown(true);
    if (!query.trim()) {
      getAllActiveClients().then(setResults);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowDropdown(true);
    setSelectedIndex(-1);
  };

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      <div className="relative">
        <div className="relative flex-1">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full px-3 py-2 pr-8 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
          />

          {/* Loading spinner */}
          {loading && (
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}

          {/* Clear button */}
          {selectedClient && (
            <button
              onClick={handleClearSelection}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear selection"
            >
              ✕
            </button>
          )}
        </div>

        {/* Dropdown */}
        {showDropdown && results.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-64 overflow-y-auto">
            {results.map((client, index) => (
              <div
                key={client.id}
                onClick={() => handleSelectClient(client)}
                className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 ${
                  index === selectedIndex
                    ? 'bg-blue-50 text-blue-900'
                    : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">
                      {client.client_name}
                    </div>
                    <div className="text-sm text-gray-600">
                      {client.type && (
                        <span className="inline-flex items-center space-x-1">
                          <span>{client.type}</span>
                          {client.phone && <span>• {client.phone}</span>}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    {client.site_submit_count} submits
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No results message */}
        {showDropdown && !loading && query.trim() && results.length === 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 px-4 py-6 text-center text-gray-500">
            <div className="text-sm">No active clients found for "{query}"</div>
            <div className="text-xs mt-1">Try searching with different keywords</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientSelector;