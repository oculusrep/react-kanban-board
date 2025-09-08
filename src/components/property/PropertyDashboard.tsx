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
import StaticContactsSidebar from './StaticContactsSidebar';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];

interface PropertyDashboardProps {
  propertyId?: string;
  mode?: 'view' | 'create';
  initialLocation?: { lat: number; lng: number };
  onSave?: (property: Property) => void;
  onBack?: () => void;
}

const PropertyDashboard: React.FC<PropertyDashboardProps> = ({
  propertyId,
  mode = 'view',
  initialLocation,
  onSave,
  onBack = () => window.history.back()
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [propertyTypes, setPropertyTypes] = useState<PropertyType[]>([]);
  const [propertyStages, setPropertyStages] = useState<PropertyStage[]>([]);
  const [propertyRecordTypes, setPropertyRecordTypes] = useState<PropertyRecordType[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('details');

  // Dashboard-specific state
  const [deals, setDeals] = useState<Deal[]>([]);
  const [units, setUnits] = useState<any[]>([]);
  const [siteSubmits, setSiteSubmits] = useState<any[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(false);

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
          console.log('No property record types found in lookup table');
          setPropertyRecordTypes([]);
        }
      } catch (err) {
        console.error('Error loading dropdown data:', err);
        setPropertyRecordTypes([]);
      }
    };

    loadDropdownData();
  }, []);

  // Load dashboard data (deals, units, site submits)
  useEffect(() => {
    if (!propertyId) return;

    const loadDashboardData = async () => {
      setDashboardLoading(true);
      try {
        // Load deals
        const { data: dealsData, error: dealsError } = await supabase
          .from('deal')
          .select('*')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (dealsError) {
          console.error('Error loading deals:', dealsError);
        } else {
          setDeals(dealsData || []);
        }

        // TODO: Load units when units table is available
        // const { data: unitsData } = await supabase
        //   .from('units')
        //   .select('*')
        //   .eq('property_id', propertyId);
        // setUnits(unitsData || []);

        // TODO: Load site submits when site_submits table is available
        // const { data: siteSubmitsData } = await supabase
        //   .from('site_submits')
        //   .select('*')
        //   .eq('property_id', propertyId);
        // setSiteSubmits(siteSubmitsData || []);

      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setDashboardLoading(false);
      }
    };

    loadDashboardData();
  }, [propertyId]);

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
    return;
  };

  const handleFieldUpdate = async (field: keyof Property, value: any) => {
    updateField(field, value);
    
    if (propertyId && mode !== 'create') {
      try {
        setAutoSaveStatus('saving');
        await updateProperty({ [field]: value });
        setAutoSaveStatus('saved');
        
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
          maximumAge: 300000
        }
      );
    });
  };

  const handleCallContact = () => {
    console.log('Call contact for property:', propertyId);
  };

  const tabs = [
    { 
      id: 'details', 
      name: 'Details', 
      icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
      count: null
    },
    { 
      id: 'deals', 
      name: 'Deals', 
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1',
      count: deals.length
    },
    { 
      id: 'units', 
      name: 'Units', 
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      count: units.length
    },
    { 
      id: 'site-submits', 
      name: 'Site Submits', 
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      count: siteSubmits.length
    }
  ];

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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'details':
        return (
          <div className="space-y-6">
            <PropertyDetailsSection
              property={currentProperty}
              isEditing={isEditing}
              onFieldUpdate={handleFieldUpdate}
              propertyRecordTypes={propertyRecordTypes}
            />

            <LocationSection
              property={currentProperty}
              onFieldUpdate={handleFieldUpdate}
              onGetCurrentLocation={handleGetCurrentLocation}
            />

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
          </div>
        );

      case 'deals':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Property Deals</h3>
              <button className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
                + New Deal
              </button>
            </div>
            
            {dashboardLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse">
                    <div className="h-16 bg-gray-200 rounded"></div>
                  </div>
                ))}
              </div>
            ) : deals.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                </svg>
                <p className="text-gray-500">No deals found for this property</p>
              </div>
            ) : (
              <div className="space-y-3">
                {deals.map((deal) => (
                  <div key={deal.id} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium text-gray-900">{deal.deal_name || 'Unnamed Deal'}</h4>
                        <p className="text-sm text-gray-500">
                          {deal.deal_stage || 'No stage'} • {deal.deal_type || 'No type'}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium text-gray-900">
                          ${deal.deal_size?.toLocaleString() || '0'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {deal.close_date ? new Date(deal.close_date).toLocaleDateString() : 'No close date'}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 'units':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Property Units</h3>
              <button className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
                + New Unit
              </button>
            </div>
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <p className="text-gray-500">Units feature coming soon</p>
            </div>
          </div>
        );

      case 'site-submits':
        return (
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Site Submits</h3>
              <button className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm hover:bg-blue-700">
                + New Submit
              </button>
            </div>
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-500">Site submits feature coming soon</p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

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
      />

      {/* Dashboard Tabs */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex space-x-8 px-4">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center space-x-2 py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={tab.icon} />
              </svg>
              <span>{tab.name}</span>
              {tab.count !== null && (
                <span className={`inline-flex items-center justify-center px-2 py-1 rounded-full text-xs font-medium ${
                  activeTab === tab.id 
                    ? 'bg-blue-100 text-blue-800' 
                    : 'bg-gray-100 text-gray-800'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area with Static Sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto p-4 pb-8">
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
            {renderTabContent()}

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

        {/* Static Contacts Sidebar */}
        {propertyId && (
          <StaticContactsSidebar
            propertyId={propertyId}
            isCollapsed={sidebarCollapsed}
            onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          />
        )}
      </div>
    </div>
  );
};

export default PropertyDashboard;