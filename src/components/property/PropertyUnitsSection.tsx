import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';

type PropertyUnit = Database['public']['Tables']['property_unit']['Row'];

interface PropertyUnitsSectionProps {
  propertyId: string;
  isEditing?: boolean;
  onUnitsChange?: (units: PropertyUnit[]) => void;
  isExpanded?: boolean;
  onToggle?: () => void;
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
}> = ({ label, value, onChange, helpText }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <div className="relative">
      <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
      <input
        type="number"
        step="0.01"
        value={value ? value.toFixed(2) : ''}
        onChange={(e) => onChange(e.target.value ? parseFloat(e.target.value) : null)}
        className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
      />
    </div>
    {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
  </div>
);

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
  onToggle
}) => {
  const [units, setUnits] = useState<PropertyUnit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      property_unit_name: `Unit ${units.length + 1}`,
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
      
      const updatedUnits = [...units, data];
      setUnits(updatedUnits);
      onUnitsChange?.(updatedUnits);
    } catch (err) {
      console.error('Error creating unit:', err);
      setError(err instanceof Error ? err.message : 'Failed to create unit');
    }
  };

  const updateUnit = async (unitId: string, field: keyof PropertyUnit, value: any) => {
    try {
      const { error } = await supabase
        .from('property_unit')
        .update({ [field]: value })
        .eq('id', unitId);

      if (error) throw error;

      const updatedUnits = units.map(unit => 
        unit.id === unitId ? { ...unit, [field]: value } : unit
      );
      setUnits(updatedUnits);
      onUnitsChange?.(updatedUnits);
    } catch (err) {
      console.error('Error updating unit:', err);
      setError(err instanceof Error ? err.message : 'Failed to update unit');
    }
  };

  const deleteUnit = async (unitId: string) => {
    if (!confirm('Are you sure you want to delete this unit?')) return;

    try {
      const { error } = await supabase
        .from('property_unit')
        .delete()
        .eq('id', unitId);

      if (error) throw error;

      const updatedUnits = units.filter(unit => unit.id !== unitId);
      setUnits(updatedUnits);
      onUnitsChange?.(updatedUnits);
    } catch (err) {
      console.error('Error deleting unit:', err);
      setError(err instanceof Error ? err.message : 'Failed to delete unit');
    }
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
        summary += ` • $${unit.rent.toFixed(2)}/sqft rent`;
      }
      if (unit.nnn) {
        summary += ` • $${unit.nnn.toFixed(2)}/sqft NNN`;
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
      summary += ` • $${totalRent.toFixed(2)}/sqft total rent`;
    }
    if (totalNNN > 0) {
      summary += ` • $${totalNNN.toFixed(2)}/sqft total NNN`;
    }
    
    return summary;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center space-x-3">
          <svg
            className={`w-5 h-5 text-gray-400 transform transition-transform ${
              isExpanded ? 'rotate-180' : ''
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          <div className="text-left">
            <h3 className="text-lg font-medium text-gray-900">Property Units</h3>
            <p className="text-sm text-gray-500">{getSummary()}</p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {units.length > 0 && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {units.length}
            </span>
          )}
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 pb-6 border-t border-gray-100">
          <div className="flex items-center justify-between mb-4 pt-4">
            <p className="text-sm text-gray-600">Manage individual units within this property</p>
            <button
              onClick={addUnit}
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Unit
            </button>
          </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {units.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <div className="w-16 h-16 mx-auto mb-4 bg-gray-100 rounded-full flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <p className="text-sm font-medium">No units yet</p>
          <p className="text-xs mt-1">Click "Add Unit" to start adding units to this property</p>
        </div>
      ) : (
        <div className="space-y-4">
          {units.map((unit, index) => (
            <div key={unit.id} className="border border-gray-200 rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-medium text-gray-700">Unit {index + 1}</span>
                <button
                  onClick={() => deleteUnit(unit.id)}
                  className="p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                  title="Delete unit"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Unit Name */}
                <InputField
                  label="Unit Name"
                  value={unit.property_unit_name}
                  onChange={(value) => updateUnit(unit.id, 'property_unit_name', value)}
                  placeholder="e.g., Suite 101"
                  required
                />

                {/* Unit Notes */}
                <InputField
                  label="Unit Notes"
                  value={unit.unit_notes}
                  onChange={(value) => updateUnit(unit.id, 'unit_notes', value)}
                  placeholder="Any special notes about this unit"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
                {/* Square Feet */}
                <InputField
                  label="Square Feet"
                  value={unit.sqft?.toString() || null}
                  onChange={(value) => updateUnit(unit.id, 'sqft', value ? Number(value) : null)}
                  type="number"
                  placeholder="0"
                />

                {/* Rent */}
                <CurrencyField
                  label="Rent"
                  value={unit.rent}
                  onChange={(value) => updateUnit(unit.id, 'rent', value)}
                  helpText="Base rent amount"
                />

                {/* NNN */}
                <CurrencyField
                  label="NNN"
                  value={unit.nnn}
                  onChange={(value) => updateUnit(unit.id, 'nnn', value)}
                  helpText="Net, Net, Net charges"
                />

                {/* Lease Expiration */}
                <InputField
                  label="Lease Expiration"
                  value={unit.lease_expiration_date ? new Date(unit.lease_expiration_date).toISOString().split('T')[0] : null}
                  onChange={(value) => updateUnit(unit.id, 'lease_expiration_date', value ? new Date(value).toISOString() : null)}
                  type="date"
                />
              </div>

              {/* Unit Features */}
              <div className="border-t border-gray-200 pt-4">
                <div className="text-sm font-medium text-gray-700 mb-3">Unit Features</div>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
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
            </div>
          ))}
        </div>
      )}

          {units.length > 0 && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
              <p className="text-blue-800 text-sm">
                ℹ️ Units are automatically saved as you make changes. You can add, edit, or remove units at any time.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PropertyUnitsSection;