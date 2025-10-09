import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useProperty } from '../../hooks/useProperty';
import { usePropertyForm } from '../../hooks/usePropertyForm';
import { supabase } from '../../lib/supabaseClient';
import { Database } from '../../../database-schema';
import { getDropboxPropertySyncService } from '../../services/dropboxPropertySync';

import PropertyHeader from './PropertyHeader';
import LocationSection from './LocationSection';
import FinancialSection from './FinancialSection';
import PropertyDetailsSection from './PropertyDetailsSection';
import MarketAnalysisSection from './MarketAnalysisSection';
import LinksSection from './LinksSection';
import NotesSection from './NotesSection';
import PropertySidebar from './PropertySidebar';
import PropertyUnitsSection from './PropertyUnitsSection';
import GenericActivityTab from '../GenericActivityTab';
import FileManager from '../FileManager/FileManager';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];

interface PropertyDetailScreenProps {
  propertyId?: string;
  mode?: 'view' | 'create';
  initialLocation?: { lat: number; lng: number };
  onSave?: (property: Property) => void;
  onBack?: () => void;
  onDelete?: () => void;
}

const PropertyDetailScreen: React.FC<PropertyDetailScreenProps> = ({
  propertyId,
  mode = 'view',
  initialLocation,
  onSave,
  onBack = () => window.history.back(),
  onDelete
}) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isEditing, setIsEditing] = useState(false); // Always false - we use inline editing
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [propertyStages, setPropertyStages] = useState<PropertyStage[]>([]);
  const [propertyRecordTypes, setPropertyRecordTypes] = useState<PropertyRecordType[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sidebarMinimized, setSidebarMinimized] = useState(false);
  const [unitsExpanded, setUnitsExpanded] = useState(false);
  const [highlightedUnitId, setHighlightedUnitId] = useState<string | null>(null);
  const [siteSubmitModalOpen, setSiteSubmitModalOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);

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

  // Check URL parameters for section expansion and unit highlighting
  useEffect(() => {
    const section = searchParams.get('section');
    const unitId = searchParams.get('unitId');

    if (section === 'units') {
      setUnitsExpanded(true);
      if (unitId) {
        setHighlightedUnitId(unitId);
        // Scroll to units section after a brief delay to ensure it's expanded
        setTimeout(() => {
          const unitsSection = document.getElementById('property-units-section');
          if (unitsSection) {
            unitsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 300);
      }
    }
  }, [searchParams]);

  // Load property types and stages
  useEffect(() => {
    const loadDropdownData = async () => {
      try {
        const [typesResponse, stagesResponse, recordTypesResponse] = await Promise.all([
          supabase.from('property_type').select('*').eq('active', true).order('sort_order'),
          supabase.from('property_stage').select('*').eq('active', true).order('sort_order'),
          supabase.from('property_record_type').select('*').eq('active', true).order('sort_order')
        ]);

        if (typesResponse.data) setPropertyTypes(typesResponse.data);
        if (stagesResponse.data) setPropertyStages(stagesResponse.data);
        if (recordTypesResponse.data) {
          setPropertyRecordTypes(recordTypesResponse.data);
        } else {
          // If no record types found, log this for debugging
          console.log('No property record types found in lookup table');
          setPropertyRecordTypes([]);
        }
      } catch (err) {
        console.error('Error loading dropdown data:', err);
        // Set empty arrays as fallback
        setPropertyRecordTypes([]);
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
    const oldValue = property?.[field];
    updateField(field, value);

    // Auto-save immediately on field change (inline editing pattern)
    if (propertyId && mode !== 'create') {
      try {
        setAutoSaveStatus('saving');
        setDropboxSyncError(null);

        const updates: Record<string, any> = { [field]: value };

        // If coordinates changed, auto-generate and save map_link
        if (field === 'latitude' || field === 'longitude' || field === 'verified_latitude' || field === 'verified_longitude') {
          // Get the best coordinates (prioritize verified)
          const newLat = field === 'verified_latitude' ? value : (property?.verified_latitude || (field === 'latitude' ? value : property?.latitude));
          const newLng = field === 'verified_longitude' ? value : (property?.verified_longitude || (field === 'longitude' ? value : property?.longitude));

          if (newLat && newLng) {
            updates.map_link = `https://www.google.com/maps?q=${newLat},${newLng}`;
            updateField('map_link', updates.map_link);
          }
        }

        await updateProperty(updates);
        setAutoSaveStatus('saved');

        // If property_name changed, sync to Dropbox
        if (field === 'property_name' && oldValue !== value && property?.property_name) {
          await syncPropertyNameToDropbox(property.property_name, value as string);
        }

        // Clear saved status after 2 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('error');
      }
    }
  };

  const syncPropertyNameToDropbox = async (oldName: string, newName: string) => {
    if (!propertyId) return;

    try {
      const syncService = getDropboxPropertySyncService();
      const result = await syncService.syncPropertyName(
        propertyId,
        oldName,
        newName
      );

      if (!result.success) {
        setDropboxSyncError(result.error || 'Failed to sync folder name to Dropbox');
        console.warn('Dropbox sync failed:', result.error);
      } else {
        setDropboxSyncError(null);
        console.log('✅ Property name synced to Dropbox successfully');
      }
    } catch (err) {
      console.error('Dropbox sync error:', err);
      setDropboxSyncError('Unexpected error syncing to Dropbox');
    }
  };

  const handleRetryDropboxSync = async () => {
    if (!property || !propertyId) return;

    // Get the current Dropbox folder name to use as "old name"
    const syncService = getDropboxPropertySyncService();
    const { currentFolderName } = await syncService.checkSyncStatus(
      propertyId,
      property.property_name || ''
    );

    if (currentFolderName) {
      await syncPropertyNameToDropbox(currentFolderName, property.property_name || '');
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

  const handleDealClick = (dealId: string) => {
    navigate(`/deal/${dealId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="animate-pulse">
          <div className="bg-slate-800 h-32"></div>
          <div className="flex h-screen">
            <div className="flex-1 p-4 space-y-4">
              <div className="bg-white rounded-lg p-6 space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                </div>
              </div>
            </div>
            <div className="w-80 bg-white border-l border-gray-200 p-4">
              <div className="animate-pulse space-y-4">
                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                <div className="space-y-2">
                  <div className="h-8 bg-gray-200 rounded"></div>
                  <div className="h-8 bg-gray-200 rounded"></div>
                </div>
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Property Header - Full Width */}
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
        onDelete={onDelete}
      />


      {/* Main Content Area with Static Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className={`flex-1 overflow-y-auto transition-all duration-300 ease-in-out ${
          siteSubmitModalOpen ? 'lg:-translate-x-[350px]' : contactModalOpen ? 'lg:-translate-x-[400px]' : ''
        }`}>
          <div className="max-w-4xl mx-auto p-4 pb-8">
            {/* Tab Navigation */}
            {propertyId && (
              <div className="border-b border-gray-200 mb-6">
                <nav className="-mb-px flex space-x-8">
                  <button
                    onClick={() => setActiveTab('details')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'details'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Property Details
                  </button>
                  <button
                    onClick={() => setActiveTab('activity')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'activity'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Activity
                  </button>
                  <button
                    onClick={() => setActiveTab('files')}
                    className={`py-2 px-1 border-b-2 font-medium text-sm ${
                      activeTab === 'files'
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Files
                  </button>
                </nav>
              </div>
            )}

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

            {/* Tab Content */}
            {activeTab === 'details' && (
              <>
                <PropertyDetailsSection
                  property={currentProperty}
                  isEditing={isEditing}
                  onFieldUpdate={handleFieldUpdate}
                  propertyRecordTypes={propertyRecordTypes}
                  dropboxSyncError={dropboxSyncError}
                  onRetryDropboxSync={handleRetryDropboxSync}
                />

                <LocationSection
                  property={currentProperty}
                  onFieldUpdate={handleFieldUpdate}
                  onGetCurrentLocation={handleGetCurrentLocation}
                />

                {/* Property Units Section */}
                {propertyId && (
                  <div id="property-units-section">
                    <PropertyUnitsSection
                      propertyId={propertyId}
                      isEditing={isEditing}
                      isExpanded={unitsExpanded}
                      onToggle={() => setUnitsExpanded(!unitsExpanded)}
                      onUnitsChange={(units) => {
                        console.log('Units updated:', units);
                      }}
                      highlightedUnitId={highlightedUnitId}
                    />
                  </div>
                )}

                <FinancialSection
                  property={{
                    ...currentProperty,
                    property_record_type: propertyRecordTypes.find(rt => rt.id === currentProperty.property_record_type_id)
                  }}
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
              </>
            )}

            {activeTab === 'activity' && propertyId && (
              <div className="bg-white rounded-lg border border-gray-200 mb-6">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Activities</h2>
                  <p className="text-sm text-gray-600 mt-1">Track all activities and tasks related to this property</p>
                </div>
                <div className="p-6">
                  <GenericActivityTab
                    config={{
                      parentObject: {
                        id: propertyId,
                        type: 'property' as const,
                        name: currentProperty.property_name || 'Property'
                      },
                      title: 'Property Activities',
                      showSummary: true,
                      allowAdd: true
                    }}
                  />
                </div>
              </div>
            )}

            {activeTab === 'files' && propertyId && (
              <div className="mb-6">
                <FileManager
                  entityType="property"
                  entityId={propertyId}
                />
              </div>
            )}

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

        {/* Property Sidebar */}
        {propertyId && (
          <PropertySidebar
            propertyId={propertyId}
            isMinimized={sidebarMinimized}
            onMinimize={() => setSidebarMinimized(!sidebarMinimized)}
            onDealClick={handleDealClick}
            onSiteSubmitModalChange={setSiteSubmitModalOpen}
            onContactModalChange={setContactModalOpen}
          />
        )}
      </div>
    </div>
  );
};

export default PropertyDetailScreen;