// components/PropertySelector.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

interface Property {
  id: string;
  property_name: string;
  property_stage_id?: string;
  property_type_id?: string;
  sf_id?: string;
  property_type?: { label: string };
  property_stage?: { label: string };
  [key: string]: any;
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  label?: string;
}

export default function PropertySelector({ 
  value, 
  onChange, 
  label = "Property" 
}: Props) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load the selected property details when value changes
  useEffect(() => {
    if (value) {
      supabase
        .from("property")
        .select("*")
        .eq("id", value)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedProperty(data);
            setSearch(data.property_name || "");
          }
        });
    } else {
      setSelectedProperty(null);
      setSearch("");
    }
  }, [value]);

  // Fetch suggestions based on search term
  useEffect(() => {
    const fetchSuggestions = async () => {
      // Don't search if empty
      if (!search || search.trim().length === 0) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);
      
      console.log("Searching for:", search); // Debug log

const { data, error } = await supabase
  .from("property")
  .select("*")
  .ilike("property_name", `%${search}%`)
  .limit(10)
  .order("property_name");
      
      if (data) {
        setSuggestions(data);
      } else {
        setSuggestions([]);
      }
      
      setIsLoading(false);
    };

    // Debounce the search
    const timer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(timer);
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

  const handleSelect = (property: Property) => {
    setSelectedProperty(property);
    setSearch(property.property_name || "");
    onChange(property.id);
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setSearch(newValue);
    
    // Show dropdown when typing
    if (newValue.length > 0) {
      setShowDropdown(true);
    }
    
    // Clear selection if user is typing something different
    if (selectedProperty && newValue !== selectedProperty.property_name) {
      setSelectedProperty(null);
      onChange(null);
    }
    
    // Clear everything if input is empty
    if (newValue === "") {
      onChange(null);
      setSelectedProperty(null);
      setSuggestions([]);
      setShowDropdown(false);
    }
  };

  const handleFocus = () => {
    if (inputRef.current) {
      inputRef.current.select();
    }
    // Show dropdown if we have suggestions
    if (suggestions.length > 0) {
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
          placeholder="Type to search properties..."
          className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        
        {/* Dropdown with suggestions */}
        {showDropdown && (
          <div 
            ref={dropdownRef}
            className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto"
          >
            {isLoading ? (
              <div className="p-2 text-sm text-gray-500">Loading...</div>
            ) : suggestions.length > 0 ? (
              suggestions.map((property) => (
                <div
                  key={property.id}
                  onClick={() => handleSelect(property)}
                  className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
                >
                  <div className="font-medium">{property.property_name}</div>
                  {(property.property_type?.label || property.property_stage?.label) && (
                    <div className="text-xs text-gray-500">
                      {[property.property_type?.label, property.property_stage?.label]
                        .filter(Boolean)
                        .join(" • ")}
                    </div>
                  )}
                </div>
              ))
            ) : search.length > 0 ? (
              <div className="p-2 text-sm text-gray-500">No properties found</div>
            ) : null}
          </div>
        )}
      </div>
      
      {/* Link to view details when selected */}
      {selectedProperty && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800 transition-colors"
            onClick={() => {
              navigate(`/property/${selectedProperty.id}`);
            }}
          >
            View Property Details →
          </button>
        </div>
      )}
    </div>
  );
}