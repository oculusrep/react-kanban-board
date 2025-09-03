import React, { useState, useEffect } from 'react';
import { useProperty } from '../../hooks/useProperty';
import { usePropertyForm } from '../../hooks/usePropertyForm';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';

import PropertyHeader from './PropertyHeader';
import LocationSection from './LocationSection';
import FinancialSection from './FinancialSection';
import PropertyDetailsSection from './PropertyDetailsSection';
import MarketAnalysisSection from './MarketAnalysisSection';
import LinksSection from './LinksSection';
import NotesSection from './NotesSection';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];

interface PropertyDetailScreenProps {
  propertyId?: string;
  mode?: 'view' | 'create';
  initialLocation?: { lat: number; lng: number };
  onSave?: (property: Property) => void;
  onBack?: () => void;
}

const PropertyDetailScreen: React.FC<PropertyDetailScreenProps> = ({
  propertyId,
  mode = 'view',
  initialLocation,
  onSave,
  onBack = () => window.history.back()
}) => {
  const [isEditing, setIsEditing] = useState(false); // Always false - we use inline editing
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [propertyStages, setPropertyStages] = useState<PropertyStage[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const { 
    property, 
    loading, 
    error, 
    updateProperty, 
    createProperty,
    refreshProperty 
  } = useProperty(propertyId);

  const { 
    formData, 
    updateField, 
    validation, 
    isDirty, 
    resetForm 
  } = usePropertyForm(property || undefined);

  // Load property types and stages
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const [typesResponse, stagesResponse] = await Promise.all([
          supabase.from('property_type').select('*').eq('active', true).order('sort_order'),
          supabase.from('property_stage').select('*').eq('active', true).order('sort_order')
        ]);

        if (typesResponse.data) setPropertyTypes(typesResponse.data);
        if (stagesResponse.data) setPropertyStages(stagesResponse.data);
      } catch (err) {
        console.error('Error loading dropdown data:', err);
      }
    };

    loadDropdownData();
  }, []);

  // Set initial location for new properties
  useEffect(() => {
    if (mode === 'create' && initialLocation && !formData.latitude && !formData.longitude) {
      updateField('latitude', initialLocation.lat);
      updateField('longitude', initialLocation.lng);
    }
  }, [mode, initialLocation, formData.latitude, formData.longitude, updateField]);

  // Reset form when property changes
  useEffect(() => {
    if (property) {
      resetForm(property);
    }
  }, [property, resetForm]);

  const handleToggleEdit = async () => {
    // No global edit mode - using inline editing like Commission/Payment tabs
    return;
  };

  const handleSave = async () => {
    if (!propertyId) return;

    try {
      setAutoSaveStatus('saving');
      await updateProperty(formData);
      setAutoSaveStatus('saved');
      setIsEditing(false);
      
      if (onSave && property) {
        onSave({ ...property, ...formData });
      }
    } catch (err) {
      console.error('Error saving property:', err);
      setAutoSaveStatus('error');
    }
  };

  const handleCreate = async () => {
    if (!validation.isValid) {
      alert('Please fix the validation errors before saving.');
      return;
    }

    try {
      setAutoSaveStatus('saving');
      const newProperty = await createProperty(formData as Omit<Property, 'id' | 'created_at' | 'updated_at'>);
      setAutoSaveStatus('saved');
      setIsEditing(false);
      
      if (onSave) {
        onSave(newProperty);
      }
    } catch (err) {
      console.error('Error creating property:', err);
      setAutoSaveStatus('error');
    }
  };

  const handleFieldUpdate = async (field: keyof Property, value: any) => {
    updateField(field, value);
    
    // Auto-save immediately on field change (inline editing pattern)
    if (propertyId && mode !== 'create') {
      try {
        setAutoSaveStatus('saving');
        await updateProperty({ [field]: value });
        setAutoSaveStatus('saved');
        
        // Clear saved status after 2 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('error');
      }
    }
  };

  const handleGetCurrentLocation = (): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation is not supported by this browser'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => {
          reject(new Error('Failed to get current location: ' + error.message));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 300000 // 5 minutes
        }
      );
    });
  };

  const handleCallContact = () => {
    // TODO: Implement contact calling functionality
    console.log('Call contact for property:', propertyId);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="animate-pulse">
          <div className="bg-slate-800 h-32"></div>
          <div className="max-w-4xl mx-auto p-4 space-y-4">
            <div className="bg-white rounded-lg p-6 space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && mode !== 'create') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg border border-red-200 p-6 max-w-md mx-4">
          <div className="text-red-600 text-center">
            <svg className="w-12 h-12 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.732 15.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <h3 className="text-lg font-semibold mb-2">Error Loading Property</h3>
            <p className="text-sm text-gray-600 mb-4">{error}</p>
            <button
              onClick={onBack}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  const currentProperty = mode === 'create' ? (formData as Property) : (property || formData as Property);

  return (
    <div className="min-h-screen bg-gray-50">
      <PropertyHeader
        property={{
          ...currentProperty,
          property_type: propertyTypes.find(t => t.id === currentProperty.property_type_id),
          property_stage: propertyStages.find(s => s.id === currentProperty.property_stage_id)
        }}
        isEditing={isEditing}
        onToggleEdit={handleToggleEdit}
        onBack={onBack}
        onGetLocation={() => handleGetCurrentLocation().then(coords => {
          handleFieldUpdate('latitude', coords.lat);
          handleFieldUpdate('longitude', coords.lng);
        })}
        onCallContact={handleCallContact}
      />

      <div className="max-w-4xl mx-auto p-4 pb-8">
        {/* Validation Warnings */}
        {isEditing && validation.warnings.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">Recommendations</h3>
                <ul className="mt-1 text-xs text-yellow-700 list-disc list-inside">
                  {validation.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* Auto-save Status */}
        {isEditing && autoSaveStatus !== 'idle' && (
          <div className={`p-2 rounded-md text-sm mb-4 ${
            autoSaveStatus === 'saving' ? 'bg-blue-50 text-blue-700' :
            autoSaveStatus === 'saved' ? 'bg-green-50 text-green-700' :
            'bg-red-50 text-red-700'
          }`}>
            {autoSaveStatus === 'saving' && 'Saving changes...'}
            {autoSaveStatus === 'saved' && 'Changes saved successfully'}
            {autoSaveStatus === 'error' && 'Error saving changes'}
          </div>
        )}

        <PropertyDetailsSection
          property={currentProperty}
          isEditing={isEditing}
          onFieldUpdate={handleFieldUpdate}
          propertyTypes={propertyTypes}
        />

        <LocationSection
          property={currentProperty}
          isEditing={isEditing}
          onFieldUpdate={handleFieldUpdate}
          onGetCurrentLocation={handleGetCurrentLocation}
        />

        <FinancialSection
          property={currentProperty}
          isEditing={isEditing}
          onFieldUpdate={handleFieldUpdate}
        />

        <MarketAnalysisSection
          property={currentProperty}
          onFieldUpdate={handleFieldUpdate}
        />

        <LinksSection
          property={currentProperty}
          isEditing={isEditing}
          onFieldUpdate={handleFieldUpdate}
        />

        <NotesSection
          property={currentProperty}
          isEditing={isEditing}
          onFieldUpdate={handleFieldUpdate}
        />

        {/* Validation Errors */}
        {isEditing && !validation.isValid && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Please fix these errors:</h3>
                <ul className="mt-1 text-xs text-red-700 list-disc list-inside">
                  {Object.entries(validation.errors).map(([field, error]) => (
                    <li key={field}><strong>{field}:</strong> {error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PropertyDetailScreen;