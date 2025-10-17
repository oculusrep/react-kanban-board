import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { buildFuzzyOrQuery, sortByRelevance } from '../utils/searchUtils';

interface EntityAutocompleteProps {
  entityType: 'client' | 'deal' | 'contact' | 'property' | 'assignment' | 'user';
  value: string | null;
  onChange: (id: string | null, name: string) => void;
  placeholder?: string;
  className?: string;
}

interface EntitySuggestion {
  id: string;
  label: string;
}

const EntityAutocomplete: React.FC<EntityAutocompleteProps> = ({
  entityType,
  value,
  onChange,
  placeholder,
  className = "text-xs border border-gray-300 rounded px-2 py-1"
}) => {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<EntitySuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the entity name from the ID when component mounts or value changes
  useEffect(() => {
    const loadEntityName = async () => {
      if (value) {
        let query = supabase.from(entityType);
        let nameField = '';

        switch (entityType) {
          case 'client':
            nameField = 'client_name';
            break;
          case 'deal':
            nameField = 'deal_name';
            break;
          case 'contact':
            nameField = 'first_name, last_name, source_type';
            break;
          case 'property':
            nameField = 'property_name, address';
            break;
          case 'assignment':
            nameField = 'assignment_name';
            break;
          case 'user':
            nameField = 'first_name, last_name, email';
            break;
        }

        const { data } = await query
          .select(`id, ${nameField}`)
          .eq('id', value)
          .single();

        if (data) {
          let displayName = '';
          switch (entityType) {
            case 'client':
              displayName = data.client_name || '';
              break;
            case 'deal':
              displayName = data.deal_name || '';
              break;
            case 'contact':
              const contactFullName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
              const isLead = data.source_type === 'Lead' ? ' (Lead)' : '';
              displayName = contactFullName + isLead;
              break;
            case 'property':
              displayName = data.property_name || data.address || '';
              break;
            case 'assignment':
              displayName = data.assignment_name || '';
              break;
            case 'user':
              const fullName = `${data.first_name || ''} ${data.last_name || ''}`.trim();
              displayName = fullName || data.email || '';
              break;
          }
          setSearch(displayName);
        }
      } else {
        setSearch('');
      }
    };

    loadEntityName();
  }, [value, entityType]);

  // Autocomplete search
  useEffect(() => {
    const run = async () => {
      const term = search.trim();
      if (!term || !isOpen) return setSuggestions([]);

      let query = supabase.from(entityType);
      let nameField = '';
      let searchFields: string[] = [];
      let sortField = '';

      switch (entityType) {
        case 'client':
          nameField = 'client_name';
          searchFields = ['client_name'];
          sortField = 'client_name';
          break;
        case 'deal':
          nameField = 'deal_name';
          searchFields = ['deal_name'];
          sortField = 'deal_name';
          break;
        case 'contact':
          nameField = 'first_name, last_name, source_type';
          searchFields = ['first_name', 'last_name', 'email', 'company'];
          sortField = 'first_name';
          break;
        case 'property':
          nameField = 'property_name, address, city';
          searchFields = ['property_name', 'address', 'city'];
          sortField = 'property_name';
          break;
        case 'assignment':
          nameField = 'assignment_name';
          searchFields = ['assignment_name'];
          sortField = 'assignment_name';
          break;
        case 'user':
          nameField = 'first_name, last_name, email';
          searchFields = ['first_name', 'last_name', 'email'];
          sortField = 'first_name';
          break;
      }

      // Use fuzzy search with multiple patterns
      const fuzzyQuery = buildFuzzyOrQuery(searchFields, term);
      const { data } = await query
        .select(`id, ${nameField}`)
        .or(fuzzyQuery)
        .limit(15); // Fetch more for better fuzzy results

      if (data) {
        const mappedSuggestions = data.map(item => {
          let label = '';
          switch (entityType) {
            case 'client':
              label = item.client_name || 'Unnamed Client';
              break;
            case 'deal':
              label = item.deal_name || 'Unnamed Deal';
              break;
            case 'contact':
              const fullName = `${item.first_name || ''} ${item.last_name || ''}`.trim() || 'Unnamed Contact';
              const contactType = item.source_type === 'Lead' ? ' (Lead)' : '';
              label = fullName + contactType;
              break;
            case 'property':
              label = item.property_name || item.address || 'Unnamed Property';
              break;
            case 'assignment':
              label = item.assignment_name || 'Unnamed Assignment';
              break;
            case 'user':
              const userFullName = `${item.first_name || ''} ${item.last_name || ''}`.trim();
              label = userFullName || item.email || 'Unnamed User';
              break;
          }
          return { id: item.id, label };
        });

        // Sort by relevance and limit to top 5 results
        const sorted = sortByRelevance(mappedSuggestions, term, 'label');
        setSuggestions(sorted.slice(0, 5));
      }
    };

    const handle = setTimeout(run, 150);
    return () => clearTimeout(handle);
  }, [search, entityType, isOpen]);

  const handleFocus = () => {
    setIsOpen(true);
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleBlur = () => {
    // Delay closing to allow for suggestion clicks
    setTimeout(() => setIsOpen(false), 200);
  };

  const handleSelect = (id: string, label: string) => {
    onChange(id, label);
    setSearch(label);
    setSuggestions([]);
    setIsOpen(false);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch(newValue);
    setIsOpen(true);

    // If user clears the input, clear the selection
    if (newValue === '') {
      onChange(null, '');
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder || `Search ${entityType}...`}
        className={className}
        onClick={(e) => e.stopPropagation()}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto shadow-lg w-full">
          {suggestions.map((suggestion) => (
            <li
              key={suggestion.id}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect(suggestion.id, suggestion.label);
              }}
              className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
            >
              {suggestion.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default EntityAutocomplete;