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
    console.log('🧹 ClientSelector: Clearing client selection');
    onClientSelect(null);
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
    if (!query.trim()) {
      getAllActiveClients().then(setResults);
    } else if (results.length > 0) {
      // Show dropdown if we have suggestions
      setShowDropdown(true);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    setShowDropdown(true);
    setSelectedIndex(-1);

    // Clear selection if user is typing something different
    if (selectedClient && value !== selectedClient.client_name) {
      onClientSelect(null);
    }

    // Clear everything if input is empty
    if (value === "") {
      console.log('🧹 ClientSelector: Input cleared, deselecting client');
      onClientSelect(null);
      setResults([]);
      setShowDropdown(false);
    }
  };

  return (
    <div className={`relative ${className}`} ref={searchRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm pr-8"
        />
        {/* Clear button - only show when there's a selected client or query */}
        {(selectedClient || query) && (
          <button
            type="button"
            onClick={handleClearSelection}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none"
            aria-label="Clear selection"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Dropdown with suggestions */}
      {showDropdown && (
        <div className="absolute z-[10001] mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto">
          {loading ? (
            <div className="p-2 text-sm text-gray-500">Loading...</div>
          ) : results.length > 0 ? (
            results.map((client, index) => (
              <div
                key={client.id}
                onClick={() => handleSelectClient(client)}
                className={`p-2 hover:bg-gray-100 cursor-pointer text-sm ${
                  index === selectedIndex ? 'bg-gray-100' : ''
                }`}
              >
                <div className="font-medium">{client.client_name}</div>
                {client.type && (
                  <div className="text-xs text-gray-500">
                    {client.type}
                    {client.phone && ` • ${client.phone}`}
                  </div>
                )}
              </div>
            ))
          ) : query.trim().length > 0 ? (
            <div className="p-2 text-sm text-gray-500">No active clients found</div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default ClientSelector;