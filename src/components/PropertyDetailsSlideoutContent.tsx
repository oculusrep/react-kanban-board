import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import PropertyInputField from './property/PropertyInputField';
import FormattedField from './shared/FormattedField';
import PropertyUnitsSection from './property/PropertyUnitsSection';
import PropertySubmitsTab from './property/PropertySubmitsTab';
import PropertyContactsTab from './property/PropertyContactsTab';
import PropertyFilesTab from './property/PropertyFilesTab';
import AutosaveIndicator from './AutosaveIndicator';
import DemographicsModal from './shared/DemographicsModal';
import { useAutosave } from '../hooks/useAutosave';
import { usePropertyGeoenrichment, isEnrichmentStale, formatEnrichmentDate } from '../hooks/usePropertyGeoenrichment';
import { FileText, DollarSign, Building2, MapPin, Users, Grid3x3 } from 'lucide-react';

type Property = Database['public']['Tables']['property']['Row'];

type TabType = 'property' | 'units' | 'submits' | 'contacts' | 'files';

interface PropertyDetailsSlideoutContentProps {
  propertyId: string;
  onSiteSubmitClick?: (siteSubmitId: string) => void;
}

// Helper functions for formatting - used in demographics summary section
const formatCurrency = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatNumber = (value: number | null | undefined) => {
  if (value === null || value === undefined) return '-';
  return value.toLocaleString();
};

export default function PropertyDetailsSlideoutContent({ propertyId, onSiteSubmitClick }: PropertyDetailsSlideoutContentProps) {

  const [activeTab, setActiveTab] = useState<TabType>('property');
  const [property, setProperty] = useState<Property | null>(null);
  const [formData, setFormData] = useState<Partial<Property>>({});
  const [showDemographicsModal, setShowDemographicsModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demographics enrichment
  const { isEnriching, enrichError, enrichProperty, saveEnrichmentToProperty, clearError } = usePropertyGeoenrichment();

  // Fetch property data
  useEffect(() => {
    if (!propertyId) return;

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

    fetchProperty();
  }, [propertyId]);

  // Stable save callback to prevent infinite re-renders
  const handleSave = useCallback(async (data: Partial<Property>) => {
    const { error} = await supabase
      .from('property')
      .update(data)
      .eq('id', propertyId);
    if (error) throw error;
  }, [propertyId]);

  // Autosave
  const { status: autosaveStatus, lastSavedAt } = useAutosave({
    data: formData,
    onSave: handleSave,
    delay: 1500,
    enabled: !loading && !!property,
  });

  const updateFormData = (field: keyof Property, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  // Demographics enrichment handling
  // Use verified coordinates if available, otherwise fall back to regular coordinates
  const enrichmentLatitude = property?.verified_latitude ?? property?.latitude;
  const enrichmentLongitude = property?.verified_longitude ?? property?.longitude;
  const hasCoordinates = !!(enrichmentLatitude && enrichmentLongitude);
  const hasEnrichmentData = !!property?.esri_enriched_at;
  const dataIsStale = isEnrichmentStale(property?.esri_enriched_at ?? null);

  const handleEnrichDemographics = async (forceRefresh = false) => {
    if (!propertyId || !hasCoordinates) return;

    clearError();

    const result = await enrichProperty(
      propertyId,
      enrichmentLatitude!,
      enrichmentLongitude!,
      forceRefresh
    );

    if (result) {
      const saved = await saveEnrichmentToProperty(
        propertyId,
        result,
        enrichmentLatitude!,
        enrichmentLongitude!
      );
      if (saved) {
        // Refresh the property data
        const { data: updatedProperty } = await supabase
          .from('property')
          .select('*')
          .eq('id', propertyId)
          .single();

        if (updatedProperty) {
          setProperty(updatedProperty);
          setFormData(updatedProperty);
        }
      }
    }
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
              <FormattedField
                label="Building Sqft"
                type="number"
                value={formData.building_sqft || null}
                onChange={(value) => updateFormData('building_sqft', value)}
                decimalPlaces={0}
              />
              <FormattedField
                label="Available Sqft"
                type="number"
                value={formData.available_sqft || null}
                onChange={(value) => updateFormData('available_sqft', value)}
                decimalPlaces={0}
              />
            </div>

            {/* Rent PSF */}
            <div className="grid grid-cols-2 gap-4">
              <FormattedField
                label="Rent PSF"
                type="currency"
                value={formData.rent_psf || null}
                onChange={(value) => updateFormData('rent_psf', value)}
              />
              <FormattedField
                label="NNN PSF"
                type="currency"
                value={formData.nnn_psf || null}
                onChange={(value) => updateFormData('nnn_psf', value)}
              />
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-4">
              <FormattedField
                label="Asking Purchase Price"
                type="currency"
                value={formData.asking_purchase_price || null}
                onChange={(value) => updateFormData('asking_purchase_price', value)}
              />
              <FormattedField
                label="Asking Lease Price"
                type="currency"
                value={formData.asking_lease_price || null}
                onChange={(value) => updateFormData('asking_lease_price', value)}
              />
            </div>

            {/* Acres */}
            <FormattedField
              label="Acres"
              type="number"
              value={formData.acres || null}
              onChange={(value) => updateFormData('acres', value)}
              decimalPlaces={2}
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

            {/* Demographics Section */}
            <div className="mt-8">
              <div
                className="flex items-center justify-between px-4 py-2 -mx-4 rounded-t"
                style={{ backgroundColor: '#f1f5f9' }}
              >
                <h3
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: '#475569' }}
                >
                  Demographics
                </h3>
                <div className="flex items-center gap-2">
                  {hasEnrichmentData && (
                    <button
                      onClick={() => setShowDemographicsModal(true)}
                      className="text-xs font-medium hover:underline transition-colors"
                      style={{ color: '#4A6B94' }}
                    >
                      View All →
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1 mt-3">
                {/* Tapestry Segment */}
                {property.tapestry_segment_code && (
                  <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                    <span className="text-gray-600">Tapestry Segment</span>
                    <span className="text-gray-900 font-medium">
                      {property.tapestry_segment_code} - {property.tapestry_segment_name}
                      {property.tapestry_lifemodes && (
                        <span className="text-gray-500 text-xs ml-1">({property.tapestry_lifemodes})</span>
                      )}
                    </span>
                  </div>
                )}

                {/* Population */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Population (3 mi)</span>
                  <span className="text-gray-900 font-medium">
                    {property.pop_3_mile != null ? formatNumber(property.pop_3_mile) : '-'}
                  </span>
                </div>

                {/* Population - 10 min drive */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Population (10-min drive)</span>
                  <span className="text-gray-900 font-medium">
                    {property.pop_10min_drive != null ? formatNumber(property.pop_10min_drive) : '-'}
                  </span>
                </div>

                {/* Households */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Households (3 mi)</span>
                  <span className="text-gray-900 font-medium">
                    {property.households_3_mile != null ? formatNumber(property.households_3_mile) : '-'}
                  </span>
                </div>

                {/* Daytime Population */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Daytime Pop (3 mi)</span>
                  <span className="text-gray-900 font-medium">
                    {property.daytime_pop_3_mile != null ? formatNumber(property.daytime_pop_3_mile) : '-'}
                  </span>
                </div>

                {/* Median HH Income */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Median HH Income (3 mi)</span>
                  <span className="text-gray-900 font-medium">
                    {property.hh_income_median_3_mile != null ? formatCurrency(property.hh_income_median_3_mile) : '-'}
                  </span>
                </div>

                {/* Avg HH Income */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Avg HH Income (3 mi)</span>
                  <span className="text-gray-900 font-medium">
                    {property.hh_income_avg_3_mile != null ? formatCurrency(property.hh_income_avg_3_mile) : '-'}
                  </span>
                </div>

                {/* Median Age */}
                <div className="flex justify-between py-1.5 text-sm border-b border-gray-100">
                  <span className="text-gray-600">Median Age (3 mi)</span>
                  <span className="text-gray-900 font-medium">
                    {property.median_age_3_mile != null ? property.median_age_3_mile.toFixed(1) : '-'}
                  </span>
                </div>

                {/* Last Enriched and Re-enrich button */}
                {hasEnrichmentData && (
                  <div className="flex justify-between items-center py-1.5 text-sm mt-2">
                    <span className="text-gray-400 text-xs">
                      Data as of {formatEnrichmentDate(property.esri_enriched_at)}
                      {dataIsStale && <span className="text-amber-600 ml-1">(stale)</span>}
                    </span>
                    {hasCoordinates && (
                      <button
                        onClick={() => handleEnrichDemographics(true)}
                        disabled={isEnriching}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
                        title="Re-enrich demographics data"
                      >
                        {isEnriching ? (
                          <>
                            <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Enriching...
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Re-enrich
                          </>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* Error Message */}
                {enrichError && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    {enrichError}
                    <button onClick={clearError} className="ml-2 underline">Dismiss</button>
                  </div>
                )}

                {/* No data - show enrich button */}
                {!hasEnrichmentData && (
                  <div className="py-3">
                    {hasCoordinates ? (
                      <button
                        onClick={() => handleEnrichDemographics(false)}
                        disabled={isEnriching}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50"
                        style={{ backgroundColor: '#002147', color: '#ffffff' }}
                      >
                        {isEnriching ? (
                          <>
                            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Enriching Demographics...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                            Enrich with Demographics
                          </>
                        )}
                      </button>
                    ) : (
                      <div className="text-sm text-gray-400 italic text-center">
                        No coordinates available for demographic enrichment.
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'units' && (
          <PropertyUnitsSection propertyId={propertyId} />
        )}

        {activeTab === 'submits' && (
          <PropertySubmitsTab
            propertyId={propertyId}
            onSiteSubmitClick={onSiteSubmitClick}
          />
        )}

        {activeTab === 'contacts' && (
          <PropertyContactsTab propertyId={propertyId} />
        )}

        {activeTab === 'files' && (
          <PropertyFilesTab propertyId={propertyId} />
        )}
      </div>

      {/* Demographics Modal */}
      {showDemographicsModal && property && (
        <DemographicsModal
          data={property}
          onClose={() => setShowDemographicsModal(false)}
        />
      )}
    </div>
  );
}
