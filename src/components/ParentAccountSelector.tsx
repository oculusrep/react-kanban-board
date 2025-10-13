import React, { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Client = Database['public']['Tables']['client']['Row'];

interface ParentAccountSelectorProps {
  currentClient: Client;
  onParentChange: (parentId: string | null) => Promise<void>;
  disabled?: boolean;
  hideLabel?: boolean;
}

export const ParentAccountSelector: React.FC<ParentAccountSelectorProps> = ({
  currentClient,
  onParentChange,
  disabled = false,
  hideLabel = false
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [parentAccount, setParentAccount] = useState<Client | null>(null);
  const [searchResults, setSearchResults] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch current parent account
  useEffect(() => {
    const fetchParent = async () => {
      if (!currentClient.parent_id) {
        setParentAccount(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('client')
          .select('*')
          .eq('id', currentClient.parent_id)
          .single();

        if (error) throw error;
        setParentAccount(data);
      } catch (err) {
        console.error('Error fetching parent account:', err);
        setParentAccount(null);
      }
    };

    fetchParent();
  }, [currentClient.parent_id]);

  // Search for accounts
  useEffect(() => {
    const searchAccounts = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      setIsSearching(true);
      try {
        const { data, error } = await supabase
          .from('client')
          .select('*')
          .neq('id', currentClient.id) // Don't show current account
          .ilike('client_name', `%${searchQuery}%`)
          .order('client_name')
          .limit(10);

        if (error) throw error;

        // Filter out children of current client to prevent circular hierarchy
        const filtered = data.filter(c => c.parent_id !== currentClient.id);
        setSearchResults(filtered || []);
      } catch (err) {
        console.error('Error searching accounts:', err);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    };

    const debounce = setTimeout(() => {
      searchAccounts();
    }, 300);

    return () => clearTimeout(debounce);
  }, [searchQuery, currentClient.id]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleParentSelect = async (parentId: string | null) => {
    setIsLoading(true);
    try {
      await onParentChange(parentId);
      setIsOpen(false);
      setSearchQuery('');
    } catch (err) {
      console.error('Failed to update parent account:', err);
      alert('Failed to update parent account. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Current Parent Display */}
      <div className="flex items-center justify-between">
        <div className="flex-1">
          {!hideLabel && (
            <div className="text-xs font-semibold text-gray-500 mb-1">
              Parent Account
            </div>
          )}
          <button
            onClick={() => !disabled && setIsOpen(!isOpen)}
            disabled={disabled || isLoading}
            className={`
              block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-0 py-2 text-left border-0 border-b bg-transparent hover:border-gray-400 transition-colors
              ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              ${isLoading ? 'opacity-50' : ''}
            `}
          >
            <div className="flex items-center justify-between">
              <span className={`truncate ${parentAccount ? 'text-gray-900' : 'text-gray-400'}`}>
                {parentAccount ? parentAccount.client_name : 'No parent account'}
              </span>
              <svg
                className="w-4 h-4 ml-2 flex-shrink-0 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </button>
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-2">
          {/* Search input */}
          <div className="px-3 mb-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search accounts..."
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Search results */}
          <div className="max-h-64 overflow-y-auto">
            {isSearching && (
              <div className="px-3 py-2 text-sm text-gray-500">
                Searching...
              </div>
            )}

            {!isSearching && searchQuery && searchResults.length === 0 && (
              <div className="px-3 py-2 text-sm text-gray-500">
                No accounts found
              </div>
            )}

            {!isSearching && searchResults.length > 0 && (
              <>
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Select Parent
                </div>
                {searchResults.map((account) => (
                  <button
                    key={account.id}
                    onClick={() => handleParentSelect(account.id)}
                    disabled={isLoading}
                    className={`
                      w-full text-left px-3 py-2 text-sm hover:bg-gray-100
                      transition-colors
                      ${parentAccount?.id === account.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'}
                      ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                  >
                    <div className="font-medium">{account.client_name}</div>
                    {account.sf_client_type && (
                      <div className="text-xs text-gray-500">{account.sf_client_type}</div>
                    )}
                  </button>
                ))}
              </>
            )}
          </div>

          {/* Clear parent option */}
          {parentAccount && (
            <>
              <div className="border-t border-gray-200 my-1"></div>
              <button
                onClick={() => handleParentSelect(null)}
                disabled={isLoading}
                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                Remove parent account
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default ParentAccountSelector;
