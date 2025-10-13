// components/PropertyUnitSelector.tsx
import React, { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
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
      // Only show units if a property is selected
      if (!propertyId) {
        setSuggestions([]);
        return;
      }

      // Build query - ALWAYS filter by property
      let query = supabase
        .from("property_unit")
        .select("*")
        .eq("property_id", propertyId);

      // If there's a search term, also filter by name
      if (search.length > 0) {
        query = query.ilike("property_unit_name", `%${search}%`);
      }

      const { data } = await query
        .limit(20)
        .order("property_unit_name");

      if (data) {
        setSuggestions(data);
      }
    };

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [search, propertyId, showDropdown]);

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
    if (!propertyId) return; // Don't do anything if no property selected
    
    if (inputRef.current) {
      inputRef.current.select();
    }
    setShowDropdown(true);
  };

  // Format unit details for display
  const formatUnitDetails = (unit: PropertyUnit) => {
    const details: string[] = [];
    if (unit.sqft) details.push(`${Number(unit.sqft).toLocaleString()} sqft`);
    if (unit.rent) details.push(`$${Number(unit.rent).toLocaleString()}/mo`);
    
    const features: string[] = [];
    if (unit.inline === true) features.push("Inline");
    if (unit.end_cap === true) features.push("End Cap");
    if (unit.patio === true) features.push("Patio");
    
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
          placeholder={propertyId ? "Search or select unit..." : "Select a property first"}
          disabled={!propertyId}
          className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        
        {/* Dropdown with suggestions */}
        {showDropdown && suggestions.length > 0 && propertyId && (
          <div
            ref={dropdownRef}
            className="absolute z-[10001] mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-auto"
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

        {/* Show message if no units found */}
        {showDropdown && suggestions.length === 0 && propertyId && search.length > 0 && (
          <div className="absolute z-[10001] mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg p-2 text-sm text-gray-500">
            No units found for this property
          </div>
        )}
      </div>
      
      {/* Optional: Show a link to view details when selected */}
      {selectedUnit && selectedUnit.property_id && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
            onClick={() => {
              // Navigate to property details with units section expanded and unit highlighted
              navigate(`/property/${selectedUnit.property_id}?section=units&unitId=${selectedUnit.id}`);
            }}
          >
            View Property Unit Details →
          </button>
        </div>
      )}
    </div>
  );
}