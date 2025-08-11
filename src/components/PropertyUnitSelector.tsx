// components/PropertyUnitSelector.tsx
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";

interface PropertyUnit {
  id: string;
  property_unit_name: string;
  property_id?: string;
  sqft?: number;
  rent?: number;
  inline?: boolean;
  end_cap?: boolean;
  patio?: boolean;
  [key: string]: any;
}

interface Props {
  value: string | null;
  onChange: (value: string | null) => void;
  propertyId?: string | null; // Optional: filter by property
  label?: string;
}

export default function PropertyUnitSelector({ 
  value, 
  onChange, 
  propertyId,
  label = "Property Unit" 
}: Props) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<PropertyUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<PropertyUnit | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load the selected property unit details
  useEffect(() => {
    if (value) {
      supabase
        .from("property_unit")
        .select("*")
        .eq("id", value)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedUnit(data);
            setSearch(data.property_unit_name || "");
          }
        });
    } else {
      setSelectedUnit(null);
      setSearch("");
    }
  }, [value]);

  // Search for property units
  useEffect(() => {
    const fetchSuggestions = async () => {
      if (search.length === 0) {
        setSuggestions([]);
        return;
      }

      // Build query
      let query = supabase
        .from("property_unit")
        .select("*")
        .ilike("property_unit_name", `%${search}%`);

      // Filter by property if provided
      if (propertyId) {
        query = query.eq("property_id", propertyId);
      }

      const { data } = await query
        .limit(10)
        .order("property_unit_name");

      if (data) {
        setSuggestions(data);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [search, propertyId]);

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

  const handleSelect = (unit: PropertyUnit) => {
    setSelectedUnit(unit);
    setSearch(unit.property_unit_name || "");
    onChange(unit.id);
    setShowDropdown(false);
    setSuggestions([]);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setShowDropdown(true);
    
    // If the user clears the input, clear the selection
    if (e.target.value === "") {
      onChange(null);
      setSelectedUnit(null);
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

  // Format unit details for display
  const formatUnitDetails = (unit: PropertyUnit) => {
    const details = [];
    if (unit.sqft) details.push(`${unit.sqft.toLocaleString()} sqft`);
    if (unit.rent) details.push(`$${unit.rent.toLocaleString()}/mo`);
    
    const features = [];
    if (unit.inline) features.push("Inline");
    if (unit.end_cap) features.push("End Cap");
    if (unit.patio) features.push("Patio");
    
    if (features.length > 0) {
      details.push(features.join(", "));
    }
    
    return details.join(" • ");
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
          placeholder="Search property units..."
          className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
        />
        
        {/* Dropdown with suggestions */}
        {showDropdown && suggestions.length > 0 && (
          <div 
            ref={dropdownRef}
            className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto"
          >
            {suggestions.map((unit) => (
              <div
                key={unit.id}
                onClick={() => handleSelect(unit)}
                className="p-2 hover:bg-gray-100 cursor-pointer text-sm"
              >
                <div className="font-medium">{unit.property_unit_name}</div>
                <div className="text-xs text-gray-500">
                  {formatUnitDetails(unit)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Optional: Show a link to view details when selected */}
      {selectedUnit && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800"
            onClick={() => {
              // TODO: Implement navigation to property unit details
              console.log("View property unit:", selectedUnit.id);
            }}
          >
            View Property Unit Details →
          </button>
        </div>
      )}
    </div>
  );
}