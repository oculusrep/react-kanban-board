// components/SiteSubmitSelector.tsx
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

interface SiteSubmit {
  id: string;
  code: string;
  site_submit_name?: string;
  client_id?: string;
  property_id?: string;
  [key: string]: any;
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export default function SiteSubmitSelector({ 
  value, 
  onChange, 
  label = "Site Submit" 
}: Props) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<SiteSubmit[]>([]);
  const [selectedSiteSubmit, setSelectedSiteSubmit] = useState<SiteSubmit | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load the selected site submit details
  useEffect(() => {
    if (value) {
      supabase
        .from("site_submit")
        .select("*")
        .eq("id", value)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedSiteSubmit(data);
            setSearch(data.code || "");
          }
        });
    } else {
      setSelectedSiteSubmit(null);
      setSearch("");
    }
  }, [value]);

  // Search for site submits
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (search.length === 0) {
        setSuggestions([]);
        return;
      }

      // Search by code, site_submit_name, or any other relevant field
      const { data } = await supabase
        .from("site_submit")
        .select("*")
        .or(`code.ilike.%${search}%,site_submit_name.ilike.%${search}%`)
        .limit(10)
        .order("code");

      if (data) {
        setSuggestions(data);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [search]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current && 
        !dropdownRef.current.contains(event.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (siteSubmit: SiteSubmit) => {
    setSelectedSiteSubmit(siteSubmit);
    setSearch(siteSubmit.code || "");
    onChange(siteSubmit.id);
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setShowDropdown(true);
    
    // If the user clears the input, clear the selection
    if (e.target.value === "") {
      onChange(null);
      setSelectedSiteSubmit(null);
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
    // Only show dropdown if there's a search term
    if (search.length > 0) {
      setShowDropdown(true);
    }
  };

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <div className="relative mt-1">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={handleInputChange}
          onFocus={handleFocus}
          placeholder="Search by code or name..."
          className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        
        {/* Dropdown with suggestions */}
        {showDropdown && suggestions.length > 0 && (
          <div 
            ref={dropdownRef}
            className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto"
          >
            {suggestions.map((siteSubmit) => (
              <div
                key={siteSubmit.id}
                onClick={() => handleSelect(siteSubmit)}
                className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                <div className="font-medium">{siteSubmit.code}</div>
                {siteSubmit.site_submit_name && (
                  <div className="text-xs text-gray-500">{siteSubmit.site_submit_name}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Optional: Show a link to view details when selected */}
      {selectedSiteSubmit && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => {
              // TODO: Implement navigation to site submit details
              console.log("View site submit:", selectedSiteSubmit.id);
            }}
          >
            View Site Submit Details →
          </button>
        </div>
      )}
    </div>
  );
}