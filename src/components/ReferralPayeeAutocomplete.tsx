// components/ReferralPayeeAutocomplete.tsx
import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

interface ReferralPayeeAutocompleteProps {
  value: string | null; // This will be the client ID from database
  onChange: (clientId: string | null) => void; // Save client ID to database
  label?: string;
  tabIndex?: number;
}

interface ClientSuggestion {
  id: string;
  label: string;
}

const ReferralPayeeAutocomplete: React.FC<ReferralPayeeAutocompleteProps> = ({
  value,
  onChange,
  label = "Referral Payee",
  tabIndex
}) => {
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<ClientSuggestion[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the client name from the client ID when component mounts or value changes
  useEffect(() => {
    const loadClientName = async () => {
      if (value) {
        // Value is a client ID, fetch the client name
        const { data } = await supabase
          .from('client')
          .select('client_name')
          .eq('id', value)
          .single();
        
        if (data?.client_name) {
          setSearch(data.client_name);
        }
      } else {
        setSearch('');
      }
    };
    
    loadClientName();
  }, [value]);

  // Autocomplete search - EXACTLY like DealDetailsForm
  useEffect(() => {
    const run = async () => {
      const term = search.trim();
      if (!term) return setSuggestions([]);
      const { data } = await supabase
        .from("client")
        .select("id, client_name")
        .ilike("client_name", `%${term}%`)
        .order("client_name", { ascending: true })
        .limit(5);
      if (data) setSuggestions(data.map(c => ({ id: c.id, label: c.client_name })));
    };
    const handle = setTimeout(run, 150);
    return () => clearTimeout(handle);
  }, [search]);

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
  };

  const handleSelect = (clientId: string, clientName: string) => {
    onChange(clientId); // Save the client ID to the database
    setSearch(clientName); // Display the client name in the input
    setSuggestions([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch(newValue);
    
    // If user clears the input, clear the selection
    if (newValue === '') {
      onChange(null);
    }
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        ref={inputRef}
        type="text"
        value={search}
        onChange={handleInputChange}
        onFocus={handleFocus}
        placeholder={`Search ${label.toLowerCase()}...`}
        className="mt-1 block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        tabIndex={tabIndex}
      />
      {suggestions.filter((s) => s.label !== search).length > 0 && (
        <ul className="bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto">
          {suggestions
            .filter((s) => s.label !== search)
            .map((s) => (
              <li
                key={s.id}
                onClick={() => handleSelect(s.id, s.label)}
                className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                {s.label}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
};

export default ReferralPayeeAutocomplete;