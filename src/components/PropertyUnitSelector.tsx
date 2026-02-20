// components/PropertyUnitSelector.tsx
import React, { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { prepareInsert } from "../lib/supabaseHelpers";

interface PropertyUnit {
  id: string;
  property_unit_name: string;
  property_id?: string;
  sqft?: number;
  rent?: number;
  nnn?: number;
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
  allowCreate?: boolean; // Allow creating new units
}

export default function PropertyUnitSelector({
  value,
  onChange,
  propertyId,
  label = "Property Unit",
  allowCreate = true
}: Props) {
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<PropertyUnit[]>([]);
  const [selectedUnit, setSelectedUnit] = useState<PropertyUnit | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newUnitName, setNewUnitName] = useState("");
  const [newUnitSqft, setNewUnitSqft] = useState<string>("");
  const [newUnitRent, setNewUnitRent] = useState<string>("");
  const [newUnitNnn, setNewUnitNnn] = useState<string>("");
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

  // Handle opening create modal
  const handleOpenCreateModal = () => {
    setShowDropdown(false);
    setNewUnitName(search); // Pre-fill with search term if any
    setNewUnitSqft("");
    setNewUnitRent("");
    setNewUnitNnn("");
    setShowCreateModal(true);
  };

  // Handle creating a new unit
  const handleCreateUnit = async () => {
    if (!propertyId || !newUnitName.trim()) return;

    setCreating(true);
    try {
      const newUnit = {
        property_id: propertyId,
        property_unit_name: newUnitName.trim(),
        sqft: newUnitSqft ? parseFloat(newUnitSqft) : null,
        rent: newUnitRent ? parseFloat(newUnitRent) : null,
        nnn: newUnitNnn ? parseFloat(newUnitNnn) : null,
        patio: false,
        inline: false,
        end_cap: false,
        end_cap_drive_thru: false,
      };

      const insertData = prepareInsert(newUnit);
      const { data, error } = await supabase
        .from('property_unit')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Select the newly created unit
      if (data) {
        handleSelect(data);
      }

      setShowCreateModal(false);
    } catch (err) {
      console.error('Error creating property unit:', err);
      alert('Failed to create unit. Please try again.');
    } finally {
      setCreating(false);
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
          placeholder={propertyId ? "Search or select unit..." : "Select a property first"}
          disabled={!propertyId}
          className="block w-full rounded border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
        />

        {/* Dropdown with suggestions */}
        {showDropdown && propertyId && (
          <div
            ref={dropdownRef}
            className="absolute z-[10001] mt-1 w-full bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-auto"
          >
            {/* Create new unit option */}
            {allowCreate && (
              <div
                onClick={handleOpenCreateModal}
                className="p-2 hover:bg-blue-50 cursor-pointer text-sm border-b border-gray-200 flex items-center gap-2 text-blue-600"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                <span className="font-medium">Create New Unit{search ? `: "${search}"` : ''}</span>
              </div>
            )}

            {/* Existing units */}
            {suggestions.length > 0 ? (
              suggestions.map((unit) => (
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
              ))
            ) : (
              <div className="p-2 text-sm text-gray-500">
                {search ? 'No units found matching your search' : 'No units for this property'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Unit Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Create New Unit</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-4">
              {/* Unit Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newUnitName}
                  onChange={(e) => setNewUnitName(e.target.value)}
                  placeholder="e.g., Suite 100, Unit A"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  autoFocus
                />
              </div>

              {/* Square Footage */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Square Footage
                </label>
                <input
                  type="number"
                  value={newUnitSqft}
                  onChange={(e) => setNewUnitSqft(e.target.value)}
                  placeholder="e.g., 1500"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                />
              </div>

              {/* Rent */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monthly Rent
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={newUnitRent}
                    onChange={(e) => setNewUnitRent(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>

              {/* NNN */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  NNN (per month)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={newUnitNnn}
                    onChange={(e) => setNewUnitNnn(e.target.value)}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUnit}
                disabled={creating || !newUnitName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {creating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Unit'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
