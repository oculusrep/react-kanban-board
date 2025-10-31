import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import PropertyInputField from './property/PropertyInputField';
import PropertyPSFField from './property/PropertyPSFField';
import PropertyCurrencyField from './property/PropertyCurrencyField';
import PropertySquareFootageField from './property/PropertySquareFootageField';
import PropertyUnitsSection from './property/PropertyUnitsSection';
import AutosaveIndicator from './AutosaveIndicator';
import { useAutosave } from '../hooks/useAutosave';
import { FileText, DollarSign, Building2, MapPin, Users, Grid3x3 } from 'lucide-react';

type Property = Database['public']['Tables']['property']['Row'];

type TabType = 'property' | 'units' | 'submits' | 'contacts' | 'files';

interface PropertyDetailsSlideoutContentProps {
  propertyId: string;
}

export default function PropertyDetailsSlideoutContent({ propertyId }: PropertyDetailsSlideoutContentProps) {
  const [activeTab, setActiveTab] = useState<TabType>('property');
  const [property, setProperty] = useState<Property | null>(null);
  const [formData, setFormData] = useState<Partial<Property>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch property data
  useEffect(() => {
    const fetchProperty = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase
          .from('property')
          .select('*')
          .eq('id', propertyId)
          .single();

        if (fetchError) throw fetchError;

        if (data) {
          setProperty(data);
          setFormData(data);
        }
      } catch (err) {
        console.error('Error fetching property:', err);
        setError(err instanceof Error ? err.message : 'Failed to load property');
      } finally {
        setLoading(false);
      }
    };

    if (propertyId) {
      fetchProperty();
    }
  }, [propertyId]);

  // Autosave
  const { status: autosaveStatus, lastSavedAt } = useAutosave({
    data: formData,
    onSave: async (data) => {
      const { error } = await supabase
        .from('property')
        .update(data)
        .eq('id', propertyId);
      if (error) throw error;
    },
    delay: 1500,
    enabled: !loading && !!property,
  });

  const updateFormData = (field: keyof Property, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const tabs = [
    { id: 'property' as TabType, label: 'PROPERTY', icon: Building2 },
    { id: 'units' as TabType, label: 'UNITS', icon: Grid3x3 },
    { id: 'submits' as TabType, label: 'SUBMITS', icon: FileText },
    { id: 'contacts' as TabType, label: 'CONTACTS', icon: Users },
    { id: 'files' as TabType, label: 'FILES', icon: FileText },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading property...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="text-red-500 font-medium mb-2">Error loading property</div>
          <div className="text-gray-600 text-sm">{error}</div>
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Property not found</div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Autosave Indicator */}
      <div className="px-6 pt-4">
        <AutosaveIndicator status={autosaveStatus} lastSavedAt={lastSavedAt} />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 px-6 mt-2">
        {tabs.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'property' && (
          <div className="space-y-6">
            {/* Property Name */}
            <PropertyInputField
              label="Property Name"
              value={formData.property_name || ''}
              onChange={(value) => updateFormData('property_name', value)}
            />

            {/* Address */}
            <PropertyInputField
              label="Address"
              value={formData.address || ''}
              onChange={(value) => updateFormData('address', value)}
            />

            {/* City, State, ZIP */}
            <div className="grid grid-cols-3 gap-4">
              <PropertyInputField
                label="City"
                value={formData.city || ''}
                onChange={(value) => updateFormData('city', value)}
              />
              <PropertyInputField
                label="State"
                value={formData.state || ''}
                onChange={(value) => updateFormData('state', value)}
              />
              <PropertyInputField
                label="ZIP"
                value={formData.zip || ''}
                onChange={(value) => updateFormData('zip', value)}
              />
            </div>

            {/* Square Footage */}
            <div className="grid grid-cols-2 gap-4">
              <PropertySquareFootageField
                label="Building Sqft"
                value={formData.building_sqft || null}
                onChange={(value) => updateFormData('building_sqft', value)}
              />
              <PropertySquareFootageField
                label="Available Sqft"
                value={formData.available_sqft || null}
                onChange={(value) => updateFormData('available_sqft', value)}
              />
            </div>

            {/* Rent PSF */}
            <div className="grid grid-cols-2 gap-4">
              <PropertyPSFField
                label="Rent PSF"
                value={formData.rent_psf || null}
                onChange={(value) => updateFormData('rent_psf', value)}
              />
              <PropertyPSFField
                label="NNN PSF"
                value={formData.nnn_psf || null}
                onChange={(value) => updateFormData('nnn_psf', value)}
              />
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-4">
              <PropertyCurrencyField
                label="Asking Purchase Price"
                value={formData.asking_purchase_price || null}
                onChange={(value) => updateFormData('asking_purchase_price', value)}
              />
              <PropertyCurrencyField
                label="Asking Lease Price"
                value={formData.asking_lease_price || null}
                onChange={(value) => updateFormData('asking_lease_price', value)}
              />
            </div>

            {/* Acres */}
            <PropertyInputField
              label="Acres"
              type="number"
              value={formData.acres?.toString() || ''}
              onChange={(value) => updateFormData('acres', value ? parseFloat(value) : null)}
            />

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Property Notes
              </label>
              <textarea
                value={formData.property_notes || ''}
                onChange={(e) => updateFormData('property_notes', e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <PropertyUnitsSection propertyId={propertyId} />
        )}

        {activeTab === 'submits' && (
          <div className="text-gray-500 text-center py-8">
            Site submits view - to be implemented
          </div>
        )}

        {activeTab === 'contacts' && (
          <div className="text-gray-500 text-center py-8">
            Contacts view - to be implemented
          </div>
        )}

        {activeTab === 'files' && (
          <div className="text-gray-500 text-center py-8">
            Files view - to be implemented
          </div>
        )}
      </div>
    </div>
  );
}
