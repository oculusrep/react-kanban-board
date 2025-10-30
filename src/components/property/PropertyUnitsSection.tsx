import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import PropertySquareFootageField from './PropertySquareFootageField';
import PropertyCurrencyField from './PropertyCurrencyField';
import { useToast } from '../../hooks/useToast';
import Toast from '../Toast';
import FileManagerModule from '../sidebar/FileManagerModule';

type PropertyUnit = Database['public']['Tables']['property_unit']['Row'];

interface PropertyUnitsSectionProps {
  propertyId: string;
  isEditing?: boolean;
  onUnitsChange?: (units: PropertyUnit[]) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
  highlightedUnitId?: string | null;
}

// Input component for consistency
const InputField: React.FC<{
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
  helpText?: string;
}> = ({ label, value, onChange, placeholder, required = false, type = "text", helpText }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
    />
    {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
  </div>
);

const CurrencyField: React.FC<{
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  helpText?: string;
}> = ({ label, value, onChange, helpText }) => {
  const [displayValue, setDisplayValue] = useState<string>('');
  
  // Update display value when prop value changes
  useEffect(() => {
    if (value === null || value === undefined) {
      setDisplayValue('');
    } else {
      setDisplayValue(value.toFixed(2));
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    console.log(`[${label}] User typed:`, inputValue);
    setDisplayValue(inputValue);
    
    // Parse and store the exact value entered (no calculations)
    const numericValue = inputValue === '' ? null : parseFloat(inputValue);
    console.log(`[${label}] Parsed value:`, numericValue);
    console.log(`[${label}] Calling onChange with:`, numericValue);
    onChange(numericValue);
  };

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {label}
      </label>
      <div className="relative">
        <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
        <input
          type="number"
          step="0.01"
          min="0"
          value={displayValue}
          onChange={handleChange}
          placeholder="0.00"
          className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
        />
      </div>
      {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
    </div>
  );
};

const CheckboxField: React.FC<{
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ label, checked, onChange }) => (
  <div className="flex items-center">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
    />
    <label className="ml-2 block text-sm text-gray-700">
      {label}
    </label>
  </div>
);

const PropertyUnitsSection: React.FC<PropertyUnitsSectionProps> = ({
  propertyId,
  isEditing = false,
  onUnitsChange,
  isExpanded = false,
  onToggle,
  highlightedUnitId = null
}) => {
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUnitIds, setExpandedUnitIds] = useState<Set<string>>(new Set());
  const [editingUnitName, setEditingUnitName] = useState<{[key: string]: string}>({});
  const [editingUnitNotes, setEditingUnitNotes] = useState<{[key: string]: string}>({});
  const [pendingDeleteUnitId, setPendingDeleteUnitId] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  // Load existing units
  useEffect(() => {
    if (!propertyId) return;

    const loadUnits = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: unitsError } = await supabase
          .from('property_unit')
          .select('*')
          .eq('property_id', propertyId)
          .order('property_unit_name');

        if (unitsError) throw unitsError;
        
        console.log('[loadUnits] Data from database:', data);
        if (data) {
          data.forEach((unit, index) => {
            console.log(`[loadUnits] Unit ${index + 1}:`, {
              name: unit.property_unit_name,
              rent: unit.rent,
              nnn: unit.nnn,
              rentType: typeof unit.rent,
              nnnType: typeof unit.nnn
            });
          });
        }
        
        setUnits(data || []);
        onUnitsChange?.(data || []);
      } catch (err) {
        console.error('Error loading property units:', err);
        setError(err instanceof Error ? err.message : 'Failed to load units');
      } finally {
        setLoading(false);
      }
    };

    loadUnits();
  }, [propertyId, onUnitsChange]);

  const addUnit = async () => {
    const newUnit: Partial<PropertyUnit> = {
      property_id: propertyId,
      property_unit_name: '', // Empty name - require user to name it
      sqft: null,
      rent: null,
      nnn: null,
      patio: false,
      inline: false,
      end_cap: false,
      end_cap_drive_thru: false,
      second_gen_restaurant: false,
      lease_expiration_date: null,
      unit_notes: null
    };

    try {
      const { data, error } = await supabase
        .from('property_unit')
        .insert([newUnit])
        .select()
        .single();

      if (error) throw error;

      // Add new unit at the TOP of the list and expand it
      const updatedUnits = [data, ...units];
      setUnits(updatedUnits);
      setExpandedUnitIds(new Set([data.id])); // Auto-expand the new unit
      onUnitsChange?.(updatedUnits);
    } catch (err) {
      console.error('Error creating unit:', err);
      setError(err instanceof Error ? err.message : 'Failed to create unit');
    }
  };

  const toggleUnitExpanded = (unitId: string) => {
    const newExpanded = new Set(expandedUnitIds);
    if (newExpanded.has(unitId)) {
      newExpanded.delete(unitId);
    } else {
      newExpanded.add(unitId);
    }
    setExpandedUnitIds(newExpanded);
  };

  const updateUnit = async (unitId: string, field: keyof PropertyUnit, value: any) => {
    console.log(`[updateUnit] Updating unit ${unitId}, field: ${field}, value:`, value, typeof value);
    try {
      const updateData = { [field]: value };
      console.log(`[updateUnit] Sending to database:`, updateData);

      const { error } = await supabase
        .from('property_unit')
        .update(updateData)
        .eq('id', unitId);

      if (error) throw error;

      const updatedUnits = units.map(unit =>
        unit.id === unitId ? { ...unit, [field]: value } : unit
      );
      console.log(`[updateUnit] Updated unit in array:`, updatedUnits.find(u => u.id === unitId));
      setUnits(updatedUnits);
      onUnitsChange?.(updatedUnits);
    } catch (err) {
      console.error('Error updating unit:', err);
      setError(err instanceof Error ? err.message : 'Failed to update unit');
    }
  };

  const handleUnitNameChange = (unitId: string, value: string | null) => {
    // Update local editing state immediately for responsive typing
    setEditingUnitName(prev => ({ ...prev, [unitId]: value || '' }));
  };

  const handleUnitNameBlur = (unitId: string) => {
    // Save to database when user leaves the field
    const value = editingUnitName[unitId];
    if (value !== undefined) {
      updateUnit(unitId, 'property_unit_name', value);
      // Clear editing state
      setEditingUnitName(prev => {
        const newState = { ...prev };
        delete newState[unitId];
        return newState;
      });
    }
  };

  const handleUnitNotesChange = (unitId: string, value: string | null) => {
    // Update local editing state immediately for responsive typing
    setEditingUnitNotes(prev => ({ ...prev, [unitId]: value || '' }));
  };

  const handleUnitNotesBlur = (unitId: string) => {
    // Save to database when user leaves the field
    const value = editingUnitNotes[unitId];
    if (value !== undefined) {
      updateUnit(unitId, 'unit_notes', value);
      // Clear editing state
      setEditingUnitNotes(prev => {
        const newState = { ...prev };
        delete newState[unitId];
        return newState;
      });
    }
  };

  const promptDeleteUnit = (unitId: string) => {
    setPendingDeleteUnitId(unitId);
  };

  const confirmDeleteUnit = async () => {
    if (!pendingDeleteUnitId) return;

    const unitToDelete = units.find(u => u.id === pendingDeleteUnitId);
    const unitName = unitToDelete?.property_unit_name || 'this unit';

    try {
      const { error } = await supabase
        .from('property_unit')
        .delete()
        .eq('id', pendingDeleteUnitId);

      if (error) throw error;

      const updatedUnits = units.filter(unit => unit.id !== pendingDeleteUnitId);
      setUnits(updatedUnits);
      onUnitsChange?.(updatedUnits);

      // Show success toast
      showToast(`Unit "${unitName}" deleted successfully`, { type: 'success' });
    } catch (err) {
      console.error('Error deleting unit:', err);
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete unit';
      setError(errorMessage);
      showToast(errorMessage, { type: 'error' });
    } finally {
      setPendingDeleteUnitId(null);
    }
  };

  const cancelDeleteUnit = () => {
    setPendingDeleteUnitId(null);
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-24 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Generate summary text
  const getSummary = () => {
    if (loading) return 'Loading units...';
    if (units.length === 0) return 'No units yet';
    
    // For single unit, show the unit name instead of count
    if (units.length === 1) {
      const unit = units[0];
      let summary = unit.property_unit_name || 'Unit';
      if (unit.sqft) {
        summary += ` • ${unit.sqft.toLocaleString()} sqft`;
      }
      if (unit.rent) {
        summary += ` • $${unit.rent.toFixed(2)} rent`;
      }
      if (unit.nnn) {
        summary += ` • $${unit.nnn.toFixed(2)} NNN`;
      }
      return summary;
    }
    
    // For multiple units, show count and totals
    const totalSqft = units.reduce((sum, unit) => sum + (unit.sqft || 0), 0);
    const totalRent = units.reduce((sum, unit) => sum + (unit.rent || 0), 0);
    const totalNNN = units.reduce((sum, unit) => sum + (unit.nnn || 0), 0);
    
    let summary = `${units.length} units`;
    if (totalSqft > 0) {
      summary += ` • ${totalSqft.toLocaleString()} total sqft`;
    }
    if (totalRent > 0) {
      summary += ` • $${totalRent.toLocaleString()} total rent`;
    }
    if (totalNNN > 0) {
      summary += ` • $${totalNNN.toLocaleString()} total NNN`;
    }
    
    return summary;
  };

  return (
    <div className="space-y-3">
      {/* Add Unit Button - Bar across top */}
      <button
        onClick={addUnit}
        className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
        </svg>
        Add Unit
      </button>

      {/* Units List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : error ? (
        <div className="p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      ) : units.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          <svg className="w-8 h-8 mx-auto mb-2 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p>No units yet</p>
          <p className="text-xs mt-1">Click "Add Unit" to get started</p>
        </div>
      ) : (
        <div className="space-y-2">
          {units.map((unit, index) => {
            const isExpanded = expandedUnitIds.has(unit.id);
            // Use editing state if available, otherwise use unit values
            const currentName = editingUnitName[unit.id] !== undefined ? editingUnitName[unit.id] : unit.property_unit_name;
            const currentNotes = editingUnitNotes[unit.id] !== undefined ? editingUnitNotes[unit.id] : unit.unit_notes;
            const hasNoName = !currentName || currentName.trim() === '';

            return (
              <div
                key={unit.id}
                className={`border rounded-lg transition-all ${
                  highlightedUnitId === unit.id
                    ? 'border-blue-500 bg-blue-50 shadow-lg'
                    : 'border-gray-200 bg-white'
                }`}
              >
                {/* Summary Bar - Always Visible */}
                <div
                  className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleUnitExpanded(unit.id)}
                >
                  <div className="flex items-center space-x-3 flex-1 min-w-0">
                    <svg
                      className={`w-4 h-4 text-gray-400 transform transition-transform flex-shrink-0 ${
                        isExpanded ? 'rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm font-medium truncate ${hasNoName ? 'text-red-600 italic' : 'text-gray-900'}`}>
                          {hasNoName ? 'Name Required' : currentName}
                        </span>
                        {hasNoName && (
                          <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">Required</span>
                        )}
                      </div>

                      {!isExpanded && !hasNoName && (
                        <div className="flex items-center space-x-3 mt-0.5">
                          {unit.sqft && (
                            <span className="text-xs text-gray-600">
                              {unit.sqft.toLocaleString()} SF
                            </span>
                          )}
                          {unit.rent !== null && unit.rent !== undefined && (
                            <span className="text-xs text-gray-600">
                              Rent: ${unit.rent.toFixed(2)}
                            </span>
                          )}
                          {unit.nnn !== null && unit.nnn !== undefined && (
                            <span className="text-xs text-gray-600">
                              NNN: ${unit.nnn.toFixed(2)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      promptDeleteUnit(unit.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                    title="Delete unit"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-2 border-t border-gray-100 space-y-3">
                    {/* Unit Name - Required */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Unit Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={currentName || ''}
                        onChange={(e) => handleUnitNameChange(unit.id, e.target.value || null)}
                        onBlur={() => handleUnitNameBlur(unit.id)}
                        placeholder="e.g., Suite 101"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                      />
                    </div>

                    {/* Financial Details */}
                    <div className="grid grid-cols-3 gap-2">
                      <PropertySquareFootageField
                        label="Square Feet"
                        value={unit.sqft}
                        onChange={(value) => updateUnit(unit.id, 'sqft', value)}
                        compact={true}
                      />
                      <PropertyCurrencyField
                        label="Rent"
                        value={unit.rent}
                        onChange={(value) => updateUnit(unit.id, 'rent', value)}
                        compact={true}
                      />
                      <PropertyCurrencyField
                        label="NNN"
                        value={unit.nnn}
                        onChange={(value) => updateUnit(unit.id, 'nnn', value)}
                        compact={true}
                      />
                    </div>

                    {/* Lease Expiration & Notes */}
                    <div className="grid grid-cols-1 gap-2">
                      <InputField
                        label="Lease Expiration"
                        value={unit.lease_expiration_date ? new Date(unit.lease_expiration_date).toISOString().split('T')[0] : null}
                        onChange={(value) => updateUnit(unit.id, 'lease_expiration_date', value ? new Date(value).toISOString() : null)}
                        type="date"
                      />
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Unit Notes
                        </label>
                        <input
                          type="text"
                          value={currentNotes || ''}
                          onChange={(e) => handleUnitNotesChange(unit.id, e.target.value || null)}
                          onBlur={() => handleUnitNotesBlur(unit.id)}
                          placeholder="Any special notes about this unit"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                        />
                      </div>
                    </div>

                    {/* Unit Features */}
                    <div className="pt-2 border-t border-gray-100">
                      <div className="text-xs font-medium text-gray-700 mb-2">Unit Features</div>
                      <div className="grid grid-cols-2 gap-2">
                        <CheckboxField
                          label="Patio"
                          checked={unit.patio || false}
                          onChange={(checked) => updateUnit(unit.id, 'patio', checked)}
                        />
                        <CheckboxField
                          label="Inline"
                          checked={unit.inline || false}
                          onChange={(checked) => updateUnit(unit.id, 'inline', checked)}
                        />
                        <CheckboxField
                          label="End Cap"
                          checked={unit.end_cap || false}
                          onChange={(checked) => updateUnit(unit.id, 'end_cap', checked)}
                        />
                        <CheckboxField
                          label="End Cap Drive Thru"
                          checked={unit.end_cap_drive_thru || false}
                          onChange={(checked) => updateUnit(unit.id, 'end_cap_drive_thru', checked)}
                        />
                        <CheckboxField
                          label="2nd Gen Restaurant"
                          checked={unit.second_gen_restaurant || false}
                          onChange={(checked) => updateUnit(unit.id, 'second_gen_restaurant', checked)}
                        />
                      </div>
                    </div>

                    {/* Unit Files */}
                    <div className="pt-2 border-t border-gray-100">
                      <FileManagerModule
                        entityType="property_unit"
                        entityId={unit.id}
                        isExpanded={true}
                        onToggle={() => {}}
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Toast */}
      {pendingDeleteUnitId && (
        <div className="fixed bottom-4 right-4 z-50 bg-white border-2 border-red-500 rounded-lg shadow-xl p-4 max-w-sm">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Delete Unit?</h3>
              <p className="text-sm text-gray-700 mb-3">
                Are you sure you want to delete "{units.find(u => u.id === pendingDeleteUnitId)?.property_unit_name || 'this unit'}"?
              </p>
              <div className="flex space-x-2">
                <button
                  onClick={confirmDeleteUnit}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={cancelDeleteUnit}
                  className="px-3 py-1.5 bg-gray-200 text-gray-700 text-sm font-medium rounded hover:bg-gray-300 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => showToast(null)}
        />
      )}
    </div>
  );
};

export default PropertyUnitsSection;