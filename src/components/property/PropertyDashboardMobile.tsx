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
import ContactsSidebar from './ContactsSidebar';

type Property = Database['public']['Tables']['property']['Row'];
type PropertyType = Database['public']['Tables']['property_type']['Row'];
type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];
type PropertyStage = Database['public']['Tables']['property_stage']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];

interface PropertyDashboardMobileProps {
  propertyId?: string;
  mode?: 'view' | 'create';
  initialLocation?: { lat: number; lng: number };
  onSave?: (property: Property) => void;
  onBack?: () => void;
}

const PropertyDashboardMobile: React.FC<PropertyDashboardMobileProps> = ({
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
  const [showContactsSidebar, setShowContactsSidebar] = useState(false);
  const [activeSection, setActiveSection] = useState('overview');

  // Dashboard-specific state
  const [deals, setDeals] = useState<Deal[]>([]);
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
          setPropertyRecordTypes([]);
        }
      } catch (err) {
        console.error('Error loading dropdown data:', err);
        setPropertyRecordTypes([]);
      }
    };

    loadDropdownData();
  }, []);

  // Load dashboard data
  useEffect(() => {
    if (!propertyId) return;

    const loadDashboardData = async () => {
      setDashboardLoading(true);
      try {
        const { data: dealsData, error: dealsError } = await supabase
          .from('deal')
          .select('*')
          .eq('property_id', propertyId)
          .order('created_at', { ascending: false });

        if (!dealsError) {
          setDeals(dealsData || []);
        }
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setDashboardLoading(false);
      }
    };

    loadDashboardData();
  }, [propertyId]);

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

  const sections = [
    { 
      id: 'overview', 
      name: 'Overview', 
      icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2H5a2 2 0 00-2-2z',
      description: 'Property details & info'
    },
    { 
      id: 'deals', 
      name: 'Deals', 
      icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1',
      description: `${deals.length} active deals`,
      count: deals.length
    },
    { 
      id: 'contacts', 
      name: 'Contacts', 
      icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
      description: 'Property contacts'
    },
    { 
      id: 'units', 
      name: 'Units', 
      icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
      description: 'Available units',
      comingSoon: true
    },
    { 
      id: 'site-submits', 
      name: 'Site Submits', 
      icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
      description: 'Submission history',
      comingSoon: true
    }
  ];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="animate-pulse">
          <div className="bg-slate-800 h-32"></div>
          <div className="p-4 space-y-4">
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
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-red-200 p-6 max-w-md">
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

  if (activeSection === 'contacts') {
    return (
      <div className="min-h-screen bg-gray-50">
        <PropertyHeader
          property={{
            ...currentProperty,
            property_type: propertyTypes.find(t => t.id === currentProperty.property_type_id),
            property_stage: propertyStages.find(s => s.id === currentProperty.property_stage_id)
          }}
          isEditing={isEditing}
          onToggleEdit={() => {}}
          onBack={() => setActiveSection('overview')}
          onGetLocation={() => handleGetCurrentLocation().then(coords => {
            handleFieldUpdate('latitude', coords.lat);
            handleFieldUpdate('longitude', coords.lng);
          })}
          onCallContact={handleCallContact}
        />
        
        {propertyId && (
          <ContactsSidebar
            propertyId={propertyId}
            isOpen={true}
            onClose={() => setActiveSection('overview')}
            isMobile={true}
          />
        )}
      </div>
    );
  }

  if (activeSection === 'deals') {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="sticky top-0 z-10 bg-gradient-to-r from-slate-800 to-slate-700 border-b border-slate-600 text-white">
          <div className="px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <button
                  onClick={() => setActiveSection('overview')}
                  className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-600 hover:bg-slate-500 transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h1 className="text-xl font-bold">Deals</h1>
              </div>
              <button className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm">
                + New Deal
              </button>
            </div>
          </div>
        </div>

        <div className="p-4">
          {dashboardLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-20 bg-white rounded-lg"></div>
                </div>
              ))}
            </div>
          ) : deals.length === 0 ? (
            <div className="bg-white rounded-lg p-8 text-center">
              <svg className="w-16 h-16 mx-auto text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
              </svg>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">No Deals Yet</h3>
              <p className="text-gray-500 mb-4">Create your first deal for this property</p>
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">
                + Create Deal
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {deals.map((deal) => (
                <div key={deal.id} className="bg-white rounded-lg border border-gray-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-gray-900">{deal.deal_name || 'Unnamed Deal'}</h3>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                      {deal.deal_stage || 'No stage'}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Type:</span>
                      <span className="font-medium">{deal.deal_type || 'Not specified'}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Value:</span>
                      <span className="font-medium text-green-600">
                        ${deal.deal_size?.toLocaleString() || '0'}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Close Date:</span>
                      <span className="font-medium">
                        {deal.close_date ? new Date(deal.close_date).toLocaleDateString() : 'Not set'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PropertyHeader
        property={{
          ...currentProperty,
          property_type: propertyTypes.find(t => t.id === currentProperty.property_type_id),
          property_stage: propertyStages.find(s => s.id === currentProperty.property_stage_id)
        }}
        isEditing={isEditing}
        onToggleEdit={() => {}}
        onBack={onBack}
        onGetLocation={() => handleGetCurrentLocation().then(coords => {
          handleFieldUpdate('latitude', coords.lat);
          handleFieldUpdate('longitude', coords.lng);
        })}
        onCallContact={handleCallContact}
      />

      {activeSection === 'overview' ? (
        <>
          {/* Dashboard Menu Grid */}
          <div className="p-4">
            <div className="grid grid-cols-2 gap-3 mb-6">
              {sections.slice(1).map((section) => (
                <button
                  key={section.id}
                  onClick={() => !section.comingSoon && setActiveSection(section.id)}
                  className={`relative bg-white rounded-lg border border-gray-200 p-4 text-left transition-colors ${
                    section.comingSoon 
                      ? 'opacity-50 cursor-not-allowed' 
                      : 'hover:bg-gray-50 active:bg-gray-100'
                  }`}
                  disabled={section.comingSoon}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      section.comingSoon ? 'bg-gray-100' : 'bg-blue-100'
                    }`}>
                      <svg className={`w-4 h-4 ${
                        section.comingSoon ? 'text-gray-400' : 'text-blue-600'
                      }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={section.icon} />
                      </svg>
                    </div>
                    {section.count !== undefined && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-medium">
                        {section.count}
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 mb-1">{section.name}</h3>
                  <p className="text-sm text-gray-500">{section.description}</p>
                  {section.comingSoon && (
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full text-xs font-medium">
                        Soon
                      </span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Property Details - Collapsed View */}
            <div className="space-y-4">
              <PropertyDetailsSection
                property={currentProperty}
                isEditing={isEditing}
                onFieldUpdate={handleFieldUpdate}
                propertyRecordTypes={propertyRecordTypes}
                isMobile={true}
              />

              <LocationSection
                property={currentProperty}
                onFieldUpdate={handleFieldUpdate}
                onGetCurrentLocation={handleGetCurrentLocation}
                isMobile={true}
              />

              <FinancialSection
                property={{
                  ...currentProperty,
                  property_record_type: propertyRecordTypes.find(rt => rt.id === currentProperty.property_record_type_id)
                }}
                onFieldUpdate={handleFieldUpdate}
                isMobile={true}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default PropertyDashboardMobile;