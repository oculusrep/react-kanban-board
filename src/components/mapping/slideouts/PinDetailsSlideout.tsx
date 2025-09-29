import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from '../layers/LayerManager';
import { FileText, DollarSign, Building2, Activity, MapPin } from 'lucide-react';

interface Property {
  id: string;
  property_name?: string;
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  property_notes?: string;
  latitude: number;
  longitude: number;
  verified_latitude?: number;
  verified_longitude?: number;
  rent_psf?: number;
  nnn_psf?: number;
  acres?: number;
  building_sqft?: number;
  available_sqft?: number;
}

interface SiteSubmit {
  id: string;
  site_submit_name?: string;
  property_id: string;
  client_id?: string;
  submit_stage_id?: string;
  year_1_rent?: number;
  ti?: number;
  notes?: string;
  // New fields for Submit tab
  sf_property_unit?: string; // Database field name
  date_submitted?: string;
  loi_written?: boolean;
  loi_date?: string;
  delivery_date?: string;
  delivery_timeframe?: string;
  created_at?: string;
  updated_at?: string;
  // Related data
  property?: Property;
  client?: { client_name: string };
  submit_stage?: { id: string; name: string };
  property_unit?: { property_unit_name: string };
}

interface PinDetailsSlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  data: Property | SiteSubmit | null;
  type: 'property' | 'site_submit' | null;
  onVerifyLocation?: (propertyId: string) => void;
  isVerifyingLocation?: boolean;
  onViewPropertyDetails?: (property: Property) => void;
  rightOffset?: number; // Offset from right edge in pixels
  onCenterOnPin?: (lat: number, lng: number) => void; // Function to center map on pin
}

type TabType = 'property' | 'submit' | 'financial' | 'activity' | 'location';

const PinDetailsSlideout: React.FC<PinDetailsSlideoutProps> = ({
  isOpen,
  onClose,
  onOpen,
  data,
  type,
  onVerifyLocation,
  isVerifyingLocation = false,
  onViewPropertyDetails,
  rightOffset = 0,
  onCenterOnPin
}) => {
  console.log('PinDetailsSlideout rendering with:', { isOpen, data, type });
  const [activeTab, setActiveTab] = useState<TabType>(type === 'site_submit' ? 'submit' : 'property');
  const [isEditing, setIsEditing] = useState(false);
  const [propertyStatus, setPropertyStatus] = useState<'lease' | 'purchase'>('lease');
  const [submitStages, setSubmitStages] = useState<{ id: string; name: string }[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<any>(null);

  // Form state for site submit fields
  const [formData, setFormData] = useState({
    dateSubmitted: '',
    loiDate: '',
    deliveryDate: '',
    deliveryTimeframe: '',
    notes: ''
  });

  // Form state for property fields
  const [propertyFormData, setPropertyFormData] = useState({
    property_name: '',
    address: '',
    city: '',
    zip: '',
    rent_psf: null as number | null,
    nnn_psf: null as number | null,
    acres: null as number | null,
    building_sqft: null as number | null,
    available_sqft: null as number | null
  });

  const [hasPropertyChanges, setHasPropertyChanges] = useState(false);
  const [lastSavedPropertyData, setLastSavedPropertyData] = useState<Property | null>(null);

  const { refreshLayer } = useLayerManager();

  // Reset to default tab when type changes
  useEffect(() => {
    setActiveTab(type === 'site_submit' ? 'submit' : 'property');
  }, [type]);

  // Initialize form data when data loads
  useEffect(() => {
    if (type === 'site_submit' && data) {
      const siteSubmitData = data as SiteSubmit;

      // Check if we have saved data and it matches the current data
      const shouldUseSavedData = lastSavedData &&
        lastSavedData.id === siteSubmitData.id &&
        lastSavedData.date_submitted;

      console.log('🔍 Form initialization check:', {
        type,
        hasData: !!data,
        dataId: data?.id,
        shouldUseSavedData,
        lastSavedData: lastSavedData ? { id: lastSavedData.id, date_submitted: lastSavedData.date_submitted } : null,
        currentData: { id: siteSubmitData.id, date_submitted: siteSubmitData.date_submitted }
      });

      if (shouldUseSavedData) {
        console.log('🔄 Using last saved data for form initialization');
        setFormData({
          dateSubmitted: lastSavedData.date_submitted ? lastSavedData.date_submitted.split('T')[0] : '',
          loiDate: lastSavedData.loi_date ? lastSavedData.loi_date.split('T')[0] : '',
          deliveryDate: lastSavedData.delivery_date ? lastSavedData.delivery_date.split('T')[0] : '',
          deliveryTimeframe: lastSavedData.delivery_timeframe || '',
          notes: lastSavedData.notes || ''
        });
      } else {
        console.log('📥 Initializing form data with fresh siteSubmit:', siteSubmitData);
        setFormData({
          dateSubmitted: siteSubmitData.date_submitted || (siteSubmitData.created_at ? siteSubmitData.created_at.split('T')[0] : ''),
          loiDate: siteSubmitData.loi_date ? siteSubmitData.loi_date.split('T')[0] : '',
          deliveryDate: siteSubmitData.delivery_date ? siteSubmitData.delivery_date.split('T')[0] : '',
          deliveryTimeframe: siteSubmitData.delivery_timeframe || '',
          notes: siteSubmitData.notes || ''
        });
      }

      setHasChanges(false);
    }
  }, [data, type, lastSavedData]);

  // Initialize property form data when data loads
  useEffect(() => {
    if (type === 'property' && data) {
      const propertyData = data as Property;

      // Check if we have saved data and it matches the current data
      const shouldUseSavedData = lastSavedPropertyData &&
        lastSavedPropertyData.id === propertyData.id;

      console.log('📥 Property form initialization check:', {
        type,
        hasData: !!data,
        dataId: data?.id,
        shouldUseSavedData,
        hasPropertyChanges,
        lastSavedPropertyData: lastSavedPropertyData ? {
          id: lastSavedPropertyData.id,
          property_name: lastSavedPropertyData.property_name
        } : null,
        currentData: {
          id: propertyData.id,
          property_name: propertyData.property_name
        }
      });

      // Only initialize form if we don't have unsaved changes and no saved data
      if (!hasPropertyChanges && !shouldUseSavedData) {
        console.log('📥 Initializing property form data from props:', propertyData);
        setPropertyFormData({
          property_name: propertyData.property_name || '',
          address: propertyData.address || '',
          city: propertyData.city || '',
          zip: propertyData.zip || '',
          rent_psf: propertyData.rent_psf || null,
          nnn_psf: propertyData.nnn_psf || null,
          acres: propertyData.acres || null,
          building_sqft: propertyData.building_sqft || null,
          available_sqft: propertyData.available_sqft || null
        });

        // Set property status based on existing data - if has acres, likely purchase; if has rent_psf, likely lease
        if (propertyData.acres && !propertyData.rent_psf) {
          setPropertyStatus('purchase');
        } else {
          setPropertyStatus('lease');
        }

        setHasPropertyChanges(false);
      } else if (shouldUseSavedData) {
        console.log('🔄 Using last saved property data for form initialization');
        // Data is already up to date from the save operation
      } else {
        console.log('⚠️ Skipping property form initialization - has unsaved changes');
      }
    }
  }, [data, type, lastSavedPropertyData, hasPropertyChanges]);

  // Initialize current stage ID when data changes
  useEffect(() => {
    if (type === 'site_submit' && data) {
      const siteSubmitData = data as SiteSubmit;
      setCurrentStageId(siteSubmitData.submit_stage_id || '');
    }
  }, [data, type]);

  // Center map on property when sidebar opens
  useEffect(() => {
    if (isOpen && data && onCenterOnPin) {
      const isProperty = type === 'property';
      const property = isProperty ? (data as Property) : (data as SiteSubmit).property;

      if (property) {
        // Use verified coordinates if available, otherwise use regular coordinates
        const coords = property.verified_latitude && property.verified_longitude
          ? { lat: property.verified_latitude, lng: property.verified_longitude }
          : { lat: property.latitude, lng: property.longitude };

        console.log('🎯 Centering map on property:', {
          propertyId: property.id,
          propertyName: property.property_name,
          coordinates: coords
        });

        onCenterOnPin(coords.lat, coords.lng);
      }
    }
  }, [isOpen, data, type, onCenterOnPin]);

  // Load submit stages for dropdown
  useEffect(() => {
    const loadSubmitStages = async () => {
      try {
        const { data, error } = await supabase
          .from('submit_stage')
          .select('id, name')
          .order('name');

        if (error) {
          console.error('Error loading submit stages:', error);
        } else if (data) {
          setSubmitStages(data);
        }
      } catch (err) {
        console.error('Failed to load submit stages:', err);
      }
    };

    if (type === 'site_submit') {
      loadSubmitStages();
    }
  }, [type]);

  if (!data || !type) return null;

  const isProperty = type === 'property';
  const property = isProperty ? (data as Property) : (data as SiteSubmit).property;
  const siteSubmit = !isProperty ? (data as SiteSubmit) : null;

  // Handle stage change with immediate database update
  const handleStageChange = async (newStageId: string) => {
    if (!siteSubmit || !newStageId) return;

    try {
      console.log(`🔄 Updating stage for site submit ${siteSubmit.id} to stage ${newStageId}`);

      // Update database immediately
      const { data: updatedData, error } = await supabase
        .from('site_submit')
        .update({
          submit_stage_id: newStageId,
          updated_at: new Date().toISOString()
        })
        .eq('id', siteSubmit.id)
        .select(`
          *,
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          )
        `)
        .single();

      if (error) {
        console.error('Error updating stage:', error);
        // Could show error notification here
      } else {
        console.log('✅ Stage updated successfully:', updatedData);
        // Update local state immediately to show new stage in dropdown
        setCurrentStageId(newStageId);
        // Trigger refresh of site submit layer to show changes immediately
        refreshLayer('site_submits');
      }
    } catch (err) {
      console.error('Failed to update stage:', err);
    }
  };

  // Handle saving property changes
  const handleSavePropertyChanges = async () => {
    console.log('🔍 handleSavePropertyChanges called');
    console.log('🔍 property:', property);
    console.log('🔍 propertyFormData:', propertyFormData);
    console.log('🔍 hasPropertyChanges:', hasPropertyChanges);

    if (!property) {
      console.log('❌ No property data, returning early');
      return;
    }

    try {
      console.log(`💾 Saving property changes for ${property.id}`);
      console.log('📝 Property form data being saved:', propertyFormData);

      // Prepare the update object
      const updateData = {
        property_name: propertyFormData.property_name || null,
        address: propertyFormData.address || null,
        city: propertyFormData.city || null,
        zip: propertyFormData.zip || null,
        rent_psf: propertyFormData.rent_psf,
        nnn_psf: propertyFormData.nnn_psf,
        acres: propertyFormData.acres,
        building_sqft: propertyFormData.building_sqft,
        available_sqft: propertyFormData.available_sqft,
        updated_at: new Date().toISOString()
      };

      console.log('📝 Database update object:', updateData);

      // Update database with property data
      const { data: updatedData, error } = await supabase
        .from('property')
        .update(updateData)
        .eq('id', property.id)
        .select(`
          id,
          property_name,
          address,
          city,
          state,
          zip,
          latitude,
          longitude,
          verified_latitude,
          verified_longitude,
          rent_psf,
          nnn_psf,
          acres,
          building_sqft,
          available_sqft
        `)
        .single();

      if (error) {
        console.error('❌ Error saving property changes:', error);
        console.error('❌ Error details:', {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        });
        // Could show error notification here
      } else {
        console.log('✅ Property changes saved successfully:', updatedData);

        // Update the form data to match what was actually saved in the database
        setPropertyFormData({
          property_name: updatedData.property_name || '',
          address: updatedData.address || '',
          city: updatedData.city || '',
          zip: updatedData.zip || '',
          rent_psf: updatedData.rent_psf || null,
          nnn_psf: updatedData.nnn_psf || null,
          acres: updatedData.acres || null,
          building_sqft: updatedData.building_sqft || null,
          available_sqft: updatedData.available_sqft || null
        });

        // Store the saved data to prevent form reinitialization
        setLastSavedPropertyData(updatedData);

        setHasPropertyChanges(false);

        // Trigger refresh of property layer to show changes immediately
        refreshLayer('properties');

        console.log('🔄 Property data synchronized with database');
      }
    } catch (err) {
      console.error('💥 Failed to save property changes:', err);
    }
  };

  // Handle saving all form data changes
  const handleSaveChanges = async () => {
    if (!siteSubmit) return;

    try {
      console.log(`💾 Saving changes for site submit ${siteSubmit.id}`);
      console.log('📝 Form data being saved:', formData);

      // Update database with all form data
      const { data: updatedData, error } = await supabase
        .from('site_submit')
        .update({
          date_submitted: formData.dateSubmitted || null,
          loi_date: formData.loiDate || null,
          delivery_date: formData.deliveryDate || null,
          delivery_timeframe: formData.deliveryTimeframe || null,
          notes: formData.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', siteSubmit.id)
        .select()
        .single();

      if (error) {
        console.error('❌ Error saving changes:', error);
        // Could show error notification here
      } else {
        console.log('✅ Changes saved successfully:', updatedData);
        console.log('📅 Updated date_submitted in DB:', updatedData.date_submitted);

        // Update form data with fresh values from database to ensure consistency
        const newFormData = {
          dateSubmitted: updatedData.date_submitted ? updatedData.date_submitted.split('T')[0] : '',
          loiDate: updatedData.loi_date ? updatedData.loi_date.split('T')[0] : '',
          deliveryDate: updatedData.delivery_date ? updatedData.delivery_date.split('T')[0] : '',
          deliveryTimeframe: updatedData.delivery_timeframe || '',
          notes: updatedData.notes || ''
        };

        console.log('🔄 Setting form data to:', newFormData);
        setFormData(newFormData);

        setHasChanges(false);
        setLastSavedData(updatedData); // Store the saved data to use on reopen
        // Trigger refresh of site submit layer to show changes immediately
        refreshLayer('site_submits');
      }
    } catch (err) {
      console.error('💥 Failed to save changes:', err);
    }
  };

  // Tab configuration based on type with modern Lucide icons
  const getAvailableTabs = (): { id: TabType; label: string; icon: React.ReactNode }[] => {
    if (isProperty) {
      return [
        { id: 'property' as TabType, label: 'PROPERTY', icon: <Building2 size={16} /> },
        { id: 'financial' as TabType, label: 'FINANCIAL', icon: <DollarSign size={16} /> },
        { id: 'activity' as TabType, label: 'ACTIVITY', icon: <Activity size={16} /> },
      ];
    } else {
      return [
        { id: 'submit' as TabType, label: 'SUBMIT', icon: <FileText size={16} /> },
        { id: 'financial' as TabType, label: 'FINANCIAL', icon: <DollarSign size={16} /> },
        { id: 'activity' as TabType, label: 'ACTIVITY', icon: <Activity size={16} /> },
        { id: 'location' as TabType, label: 'PROPERTY', icon: <Building2 size={16} /> },
      ];
    }
  };

  const availableTabs = getAvailableTabs();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'submit':
        return (
          <div className="space-y-3">
            {/* Stage & Date Submitted in same row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Stage</label>
                <select
                  value={currentStageId}
                  onChange={(e) => {
                    handleStageChange(e.target.value);
                    setHasChanges(true);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="">Select Stage...</option>
                  {submitStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Date Submitted</label>
                <input
                  type="date"
                  value={formData.dateSubmitted}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, dateSubmitted: e.target.value }));
                    setHasChanges(true);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent "
                />
              </div>
            </div>

            {/* LOI Written Boolean */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">LOI Written</label>
              <div className="flex items-center space-x-3">
                <label className="flex items-center text-sm">
                  <input
                    type="radio"
                    name="loi_written"
                    checked={siteSubmit?.loi_written === true}
                    onChange={() => {}}
                    readOnly
                    className="mr-1 scale-90"
                  />
                  Yes
                </label>
                <label className="flex items-center text-sm">
                  <input
                    type="radio"
                    name="loi_written"
                    checked={siteSubmit?.loi_written === false}
                    onChange={() => {}}
                    readOnly
                    className="mr-1 scale-90"
                  />
                  No
                </label>
              </div>
            </div>

            {/* LOI Date */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                LOI Date {!siteSubmit?.loi_written && <span className="text-gray-400">(if applicable)</span>}
              </label>
              <input
                type="date"
                value={formData.loiDate}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, loiDate: e.target.value }));
                  setHasChanges(true);
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent "
              />
            </div>

            {/* Est Delivery Date & Delivery Timeframe in same row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Est Delivery Date</label>
                <input
                  type="date"
                  value={formData.deliveryDate}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, deliveryDate: e.target.value }));
                    setHasChanges(true);
                  }}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent "
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Delivery Timeframe</label>
                <input
                  type="text"
                  value={formData.deliveryTimeframe}
                  onChange={(e) => {
                    setFormData(prev => ({ ...prev, deliveryTimeframe: e.target.value }));
                    setHasChanges(true);
                  }}
                  placeholder="e.g., 60-90 days..."
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent "
                />
              </div>
            </div>


            {/* Notes */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
              <textarea
                rows={3}
                value={formData.notes}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, notes: e.target.value }));
                  setHasChanges(true);
                }}
                placeholder="Enter notes..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent "
              />
            </div>
          </div>
        );

      case 'property':
        return (
          <div className="space-y-3">
            {isProperty ? (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Property Name</label>
                  <input
                    type="text"
                    value={propertyFormData.property_name || ''}
                    onChange={(e) => {
                      setPropertyFormData(prev => ({ ...prev, property_name: e.target.value }));
                      setHasPropertyChanges(true);
                    }}
                    placeholder="Enter property name..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={propertyFormData.address || ''}
                    onChange={(e) => {
                      setPropertyFormData(prev => ({ ...prev, address: e.target.value }));
                      setHasPropertyChanges(true);
                    }}
                    placeholder="Enter address..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={propertyFormData.city || ''}
                      onChange={(e) => {
                        setPropertyFormData(prev => ({ ...prev, city: e.target.value }));
                        setHasPropertyChanges(true);
                      }}
                      placeholder="Enter city..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">ZIP</label>
                    <input
                      type="text"
                      value={propertyFormData.zip || ''}
                      onChange={(e) => {
                        setPropertyFormData(prev => ({ ...prev, zip: e.target.value }));
                        setHasPropertyChanges(true);
                      }}
                      placeholder="Enter ZIP..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Site Submit Name</label>
                  <input
                    type="text"
                    value={siteSubmit?.site_submit_name || ''}
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={property?.address || ''}
                    readOnly
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded bg-gray-50"
                  />
                </div>
              </>
            )}

            {/* Lease/Purchase Toggle - only for properties */}
            {isProperty && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                <div className="flex rounded-md border border-gray-300 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setPropertyStatus('lease')}
                    className={`flex-1 px-3 py-2 text-xs font-medium transition-all duration-200 ${
                      propertyStatus === 'lease'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Lease
                  </button>
                  <button
                    type="button"
                    onClick={() => setPropertyStatus('purchase')}
                    className={`flex-1 px-3 py-2 text-xs font-medium border-l border-gray-300 transition-all duration-200 ${
                      propertyStatus === 'purchase'
                        ? 'bg-blue-500 text-white'
                        : 'bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    Purchase
                  </button>
                </div>
              </div>
            )}

            {/* Financial Fields - only for properties */}
            {isProperty && (
              <>
                {propertyStatus === 'lease' ? (
                  /* Lease Fields */
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Available Sq Ft</label>
                      <input
                        type="number"
                        value={propertyFormData.available_sqft || ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          setPropertyFormData(prev => ({ ...prev, available_sqft: value }));
                          setHasPropertyChanges(true);
                        }}
                        placeholder="10,000"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Rent PSF</label>
                        <input
                          type="number"
                          step="0.01"
                          value={propertyFormData.rent_psf || ''}
                          onChange={(e) => {
                            const value = e.target.value ? parseFloat(e.target.value) : null;
                            setPropertyFormData(prev => ({ ...prev, rent_psf: value }));
                            setHasPropertyChanges(true);
                          }}
                          placeholder="25.00"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">NNN PSF</label>
                        <input
                          type="number"
                          step="0.01"
                          value={propertyFormData.nnn_psf || ''}
                          onChange={(e) => {
                            const value = e.target.value ? parseFloat(e.target.value) : null;
                            setPropertyFormData(prev => ({ ...prev, nnn_psf: value }));
                            setHasPropertyChanges(true);
                          }}
                          placeholder="8.50"
                          className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  /* Purchase Fields */
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Building Sq Ft</label>
                      <input
                        type="number"
                        value={propertyFormData.building_sqft || ''}
                        onChange={(e) => {
                          const value = e.target.value ? parseInt(e.target.value) : null;
                          setPropertyFormData(prev => ({ ...prev, building_sqft: value }));
                          setHasPropertyChanges(true);
                        }}
                        placeholder="50,000"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Acres</label>
                      <input
                        type="number"
                        step="0.01"
                        value={propertyFormData.acres || ''}
                        onChange={(e) => {
                          setPropertyFormData(prev => ({
                            ...prev,
                            acres: e.target.value ? parseFloat(e.target.value) : null
                          }));
                          setHasPropertyChanges(true);
                        }}
                        placeholder="2.5"
                        className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                      />
                    </div>
                  </>
                )}
              </>
            )}

            {!isProperty && siteSubmit?.submit_stage && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Stage</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                  {siteSubmit.submit_stage.name}
                </div>
              </div>
            )}
          </div>
        );

      case 'location':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isProperty ? 'Property Name' : 'Site Submit Name'}
              </label>
              <div className="text-gray-900 font-medium">
                {isProperty ? property?.property_name || 'N/A' : siteSubmit?.site_submit_name || 'N/A'}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <div className="text-gray-900">
                {property?.address && (
                  <>
                    <div>{property.address}</div>
                    {(property?.city || property?.state || property?.zip) && (
                      <div>
                        {property?.city && `${property.city}, `}
                        {property?.state && `${property.state}  `}
                        {property?.zip && property.zip}
                      </div>
                    )}
                  </>
                )}
                {!property?.address && 'N/A'}
              </div>
            </div>

          </div>
        );

      case 'financial':
        return (
          <div className="space-y-6">
            {isProperty ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Market Rent PSF</label>
                    <input
                      type="number"
                      placeholder="Enter value..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent  transition-all duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-3">Annual Gross Rent</label>
                    <input
                      type="number"
                      placeholder="$ 0"
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent  transition-all duration-200"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Lease Type</label>
                    <select
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    >
                      <option>Full Service/Modified Gross</option>
                      <option>Triple Net</option>
                      <option>Gross</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Square Footage</label>
                    <input
                      type="number"
                      placeholder="Enter value..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Tenant Allowance PSF</label>
                    <input
                      type="number"
                      placeholder="$ 0"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Leasing Agent</label>
                    <input
                      type="text"
                      placeholder="Enter name..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Year 1 Rent & TI in same row */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">Year 1 Rent</label>
                    <input
                      type="number"
                      value={siteSubmit?.year_1_rent || ''}
                      onChange={() => {}}
                      readOnly
                      placeholder="Amount..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">TI (Tenant Improvement)</label>
                    <input
                      type="number"
                      value={siteSubmit?.ti || ''}
                      onChange={() => {}}
                      readOnly
                      placeholder="Amount..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        );

      case 'activity':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">Notes</label>
              <textarea
                rows={6}
                value={property?.property_notes || ''}
                disabled={!isEditing}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-50"
                placeholder="Enter value..."
              />
            </div>
            {!isProperty && (
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Client</label>
                <div className="px-3 py-2 bg-gray-50 border border-gray-200 rounded-md">
                  {siteSubmit?.client?.client_name || 'No client assigned'}
                </div>
              </div>
            )}
          </div>
        );

      default:
        return <div>Content for {activeTab}</div>;
    }
  };

  return (
    <>
      {/* Slideout - Match PropertySidebar styling */}
      <div
        className={`fixed top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 z-40 ${
          !isOpen ? 'translate-x-full' : isMinimized ? 'w-12' : 'w-[500px]'
        } ${isMinimized ? 'overflow-hidden' : 'overflow-y-auto'}`}
        style={{
          right: `${rightOffset}px`,
          top: '67px', // Match navbar height
          height: 'calc(100vh - 67px)',
          transform: !isOpen ? 'translateX(100%)' : 'translateX(0)'
        }}
      >
        {/* Hero Section */}
        <div className="relative">
          {/* Hero Image */}
          <div className={`${isMinimized ? 'h-16' : 'h-48'} bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600 relative overflow-hidden transition-all duration-300`}>
            {/* Property Image Placeholder */}
            <div className="absolute inset-0 bg-black bg-opacity-20 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-4xl mb-2">🏢</div>
                <div className="text-sm opacity-90">Property Image</div>
              </div>
            </div>

            {/* Header Controls */}
            <div className="absolute top-4 right-4 flex space-x-2">
              {/* Minimize/Expand Button */}
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-2 bg-black bg-opacity-20 hover:bg-black hover:bg-opacity-40 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                title={isMinimized ? "Expand sidebar" : "Minimize sidebar"}
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {isMinimized ? (
                    // Expand icon
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M4 12h16" />
                  ) : (
                    // Minimize icon
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M20 12H4" />
                  )}
                </svg>
              </button>

              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 bg-black bg-opacity-20 hover:bg-black hover:bg-opacity-40 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                title="Close details"
              >
                <svg
                  className="w-5 h-5 text-white transition-transform duration-200 hover:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Entity Type Badge */}
            <div className="absolute top-4 left-4">
              <div className={`text-white px-3 py-1 rounded text-xs font-semibold ${
                isProperty ? 'bg-blue-600' : 'bg-purple-600'
              }`}>
                {isProperty ? 'PROPERTY' : 'SITE SUBMIT'}
              </div>
            </div>
          </div>

          {/* Property Header Info */}
          {!isMinimized && (
          <div className="px-6 py-3 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h1 className={`font-bold text-gray-900 mb-1 ${isProperty ? 'text-lg' : 'text-base'}`}>
                    {isProperty
                      ? (propertyFormData.property_name || propertyFormData.address || property?.address || 'Unnamed Property')
                      : (siteSubmit?.site_submit_name || siteSubmit?.property?.property_name || 'Site Submit')
                    }
                  </h1>

                  {/* Pin icon to center map on property */}
                  {onCenterOnPin && property && (
                    <button
                      onClick={() => {
                        const coords = property.verified_latitude && property.verified_longitude
                          ? { lat: property.verified_latitude, lng: property.verified_longitude }
                          : { lat: property.latitude, lng: property.longitude };
                        onCenterOnPin(coords.lat, coords.lng);
                      }}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-all duration-200"
                      title="Center map on this property"
                    >
                      <MapPin size={16} />
                    </button>
                  )}
                </div>

                {/* Property Information - For site submits only */}
                {!isProperty && siteSubmit && (
                  <div className="mb-2 space-y-0.5">
                    <p className="text-sm text-gray-600">
                      <span className="font-medium">Property:</span> {siteSubmit?.property?.property_name || 'Not specified'}
                    </p>
                    {(siteSubmit?.property_unit?.property_unit_name || siteSubmit?.sf_property_unit) && (
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Unit:</span> {siteSubmit?.property_unit?.property_unit_name || siteSubmit?.sf_property_unit}
                      </p>
                    )}
                  </div>
                )}

                {/* Property Status - Only show for properties */}
                {isProperty && (
                  <div className="flex items-center space-x-2">
                    <div className="text-xs text-gray-600 font-medium">For:</div>
                    <div className="flex space-x-1">
                      <button
                        onClick={() => setPropertyStatus('lease')}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
                          propertyStatus === 'lease'
                            ? 'bg-orange-100 text-orange-700 border-orange-200 shadow-sm'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {propertyStatus === 'lease' ? '●' : '○'} Lease
                      </button>
                      <button
                        onClick={() => setPropertyStatus('purchase')}
                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
                          propertyStatus === 'purchase'
                            ? 'bg-orange-100 text-orange-700 border-orange-200 shadow-sm'
                            : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                        }`}
                      >
                        {propertyStatus === 'purchase' ? '●' : '○'} Purchase
                      </button>
                    </div>
                  </div>
                )}
              </div>

            </div>
          </div>
          )}
        </div>

        {/* Tabs - Modern Compact Design */}
        {!isMinimized && (
        <div className="border-b border-gray-200 bg-white">
          <nav className="flex px-4 overflow-x-auto scrollbar-hide">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex-shrink-0 flex items-center gap-2 px-4 py-3 text-xs font-medium transition-all duration-200 border-b-2 ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className={`transition-colors duration-200 ${
                  activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {tab.icon}
                </span>
                <span className="font-semibold tracking-wide whitespace-nowrap">
                  {tab.label}
                </span>

                {/* Active tab indicator */}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                )}
              </button>
            ))}
          </nav>
        </div>
        )}

        {/* Content */}
        {!isMinimized && (
        <div
          className="flex-1 overflow-y-auto px-4 py-3"
          style={{
            scrollBehavior: 'smooth',
            minHeight: 0 // Ensures flex-1 works properly with overflow
          }}
        >
          {renderTabContent()}
        </div>
        )}

        {/* Footer Actions */}
        {!isMinimized && (
        <div className="border-t border-gray-200 p-3 bg-gray-50">
          {isEditing ? (
            <div className="flex items-center justify-center space-x-3">
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md"
              >
                SAVE CHANGES
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-all duration-200 font-medium text-sm"
              >
                CANCEL
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Update Site Submit button - only show when changes made to site submits */}
              {hasChanges && !isProperty && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={handleSaveChanges}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md"
                  >
                    UPDATE SITE SUBMIT
                  </button>
                </div>
              )}

              {/* Update Property button - only show when changes made to properties */}
              {hasPropertyChanges && isProperty && (
                <div className="flex items-center justify-center">
                  <button
                    onClick={handleSavePropertyChanges}
                    className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md"
                  >
                    UPDATE PROPERTY
                  </button>
                </div>
              )}

              {/* Tertiary Actions */}
              {!hasChanges && !hasPropertyChanges && (
                <div className="flex items-center justify-center pt-1">
                  <button
                    onClick={() => {
                      if (!isProperty && property && onViewPropertyDetails) {
                        onViewPropertyDetails(property);
                      }
                    }}
                    className="text-xs text-gray-500 hover:text-gray-700 transition-colors font-medium"
                  >
                    VIEW FULL DETAILS →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </div>



      {/* Expand Arrow - When slideout is minimized */}
      {isOpen && isMinimized && (
        <div
          className="fixed z-[60] transition-all duration-300 ease-out cursor-pointer"
          style={{
            top: 'calc(50vh + 33.5px)',
            right: '7px', // Just outside the minimized slideout
            transform: 'translateY(-50%)'
          }}
          onClick={() => setIsMinimized(false)}
        >
          <div className="bg-blue-500 text-white px-2 py-3 rounded-l-md shadow-xl hover:bg-blue-600 transition-all duration-200">
            <svg className="w-4 h-4 transform rotate-180" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}

      {/* Slide In Arrow - When slideout is closed but property is selected */}
      {!isOpen && data && (
        <div
          className="fixed z-50 transition-all duration-300 ease-out cursor-pointer"
          style={{
            top: 'calc(50vh + 33.5px)', // Center of available map area
            right: '20px',
            transform: 'translateY(-50%)',
            animation: 'slideArrow 2s ease-in-out infinite'
          }}
          onClick={onOpen}
        >
          <div className="bg-blue-500 text-white p-3 rounded-l-lg shadow-lg hover:bg-blue-600 transition-all duration-200">
            <svg className="w-5 h-5 transform rotate-180" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M12.293 5.293a1 1 0 011.414 0l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-2.293-2.293a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </div>
        </div>
      )}
    </>
  );
};

export default PinDetailsSlideout;