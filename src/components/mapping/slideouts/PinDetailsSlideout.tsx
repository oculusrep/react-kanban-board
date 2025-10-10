import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from '../layers/LayerManager';
import { usePropertyRecordTypes } from '../../../hooks/usePropertyRecordTypes';
import { useProperty } from '../../../hooks/useProperty';
import PropertyInputField from '../../property/PropertyInputField';
import PropertyPSFField from '../../property/PropertyPSFField';
import PropertyCurrencyField from '../../property/PropertyCurrencyField';
import PropertySquareFootageField from '../../property/PropertySquareFootageField';
import { FileText, DollarSign, Building2, Activity, MapPin, Edit3, FolderOpen, Users, Trash2 } from 'lucide-react';
import { Database } from '../../../../database-schema';
import { getDropboxPropertySyncService } from '../../../services/dropboxPropertySync';
import FileManager from '../../FileManager/FileManager';
import AddContactsModal from '../../property/AddContactsModal';
import ContactFormModal from '../../ContactFormModal';

type PropertyRecordType = Database['public']['Tables']['property_record_type']['Row'];

interface Property {
  id: string;
  property_name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  property_notes?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  verified_latitude?: number | null;
  verified_longitude?: number | null;
  rent_psf?: number | null;
  nnn_psf?: number | null;
  acres?: number | null;
  building_sqft?: number | null;
  available_sqft?: number | null;
  property_record_type_id?: string | null;
  asking_purchase_price?: number | null;
  asking_lease_price?: number | null;
  lease_expiration_date?: string | null;
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
  onDataUpdate?: (updatedData: Property | SiteSubmit) => void; // Callback when data is updated
  onEditContact?: (contactId: string | null, propertyId: string) => void; // Callback to open contact form sidebar
  onDeleteProperty?: (propertyId: string) => void; // Callback to delete property
}

type TabType = 'property' | 'submit' | 'location' | 'files' | 'contacts';

// Contacts Tab Component
const ContactsTabContent: React.FC<{
  propertyId: string;
  onEditContact?: (contactId: string | null, propertyId: string) => void;
}> = ({ propertyId, onEditContact }) => {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showContactForm, setShowContactForm] = useState(false);
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);

  const loadContacts = async () => {
    if (!propertyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('property_contact')
        .select(`
          *,
          contact!fk_property_contact_contact_id (*)
        `)
        .eq('property_id', propertyId);

      if (error) throw error;

      const contactsData = (data || [])
        .map((pc: any) => pc.contact)
        .filter(Boolean);

      setContacts(contactsData);
    } catch (err) {
      console.error('Error loading contacts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [propertyId]);

  const handleRemoveContact = async (contactId: string) => {
    if (!confirm('Remove this contact from the property?')) return;

    try {
      const { error } = await supabase
        .from('property_contact')
        .delete()
        .eq('property_id', propertyId)
        .eq('contact_id', contactId);

      if (error) throw error;

      setContacts(prev => prev.filter(c => c.id !== contactId));
    } catch (err) {
      console.error('Error removing contact:', err);
      alert('Failed to remove contact');
    }
  };

  if (!propertyId) {
    return (
      <div className="flex items-center justify-center h-32 text-gray-500">
        <p>No property selected</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {/* Add Contact Button */}
        <button
          onClick={() => setShowAddModal(true)}
          className="w-full px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
        >
          <Users size={16} />
          Add Contacts
        </button>

        {/* Contacts List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-8 text-gray-500 text-sm">
            <Users size={32} className="mx-auto mb-2 text-gray-300" />
            <p>No contacts associated</p>
            <p className="text-xs mt-1">Click "Add Contacts" to get started</p>
          </div>
        ) : (
          <div className="space-y-2">
            {contacts.map((contact) => {
              const isExpanded = expandedContactId === contact.id;
              const displayPhone = contact.mobile_phone || contact.phone;
              const phoneLabel = contact.mobile_phone ? 'Mobile' : 'Phone';

              return (
                <div key={contact.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="group flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div
                      className="flex items-center space-x-3 flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedContactId(isExpanded ? null : contact.id)}
                    >
                      <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-medium text-xs">
                          {(contact.first_name?.charAt(0) || '').toUpperCase()}
                          {(contact.last_name?.charAt(0) || '').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-medium text-gray-900 truncate">
                            {contact.first_name} {contact.last_name}
                          </span>
                          {displayPhone && (
                            <span className="text-xs text-gray-500 truncate">{phoneLabel}: {displayPhone}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveContact(contact.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-50 rounded transition-all"
                        title="Remove contact"
                      >
                        <svg className="w-4 h-4 text-gray-400 hover:text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <div
                        className="cursor-pointer"
                        onClick={() => setExpandedContactId(isExpanded ? null : contact.id)}
                      >
                        <svg
                          className={`w-3 h-3 text-gray-400 transform transition-transform ${
                            isExpanded ? 'rotate-90' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Contact Details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 bg-blue-25">
                      <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                            <span className="font-medium text-blue-900">Contact Details</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onEditContact) {
                                onEditContact(contact.id, propertyId);
                              } else {
                                setEditingContactId(contact.id);
                                setShowContactForm(true);
                              }
                            }}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                            title="Edit contact"
                          >
                            Edit
                          </button>
                        </div>
                        <div className="space-y-1 ml-4">
                          {contact.title && (
                            <div><span className="font-medium text-blue-800">Title:</span> <span className="text-blue-700">{contact.title}</span></div>
                          )}
                          {contact.company && (
                            <div><span className="font-medium text-blue-800">Company:</span> <span className="text-blue-700">{contact.company}</span></div>
                          )}
                          {contact.email && (
                            <div><span className="font-medium text-blue-800">Email:</span> <span className="text-blue-700">{contact.email}</span></div>
                          )}
                          {contact.phone && (
                            <div><span className="font-medium text-blue-800">Phone:</span> <span className="text-blue-700">{contact.phone}</span></div>
                          )}
                          {contact.mobile_phone && (
                            <div><span className="font-medium text-blue-800">Mobile:</span> <span className="text-blue-700">{contact.mobile_phone}</span></div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Contacts Modal */}
      {showAddModal && (
        <div>
          <AddContactsModal
            isOpen={showAddModal}
            onClose={() => setShowAddModal(false)}
            propertyId={propertyId}
            existingContactIds={contacts.map(c => c.id)}
            onContactsAdded={() => {
              loadContacts();
              setShowAddModal(false);
            }}
            onCreateNew={() => {
              if (onEditContact) {
                setShowAddModal(false);
                onEditContact(null, propertyId);
              } else {
                setShowContactForm(true);
              }
            }}
          />
        </div>
      )}

      {/* Contact Form Modal */}
      {showContactForm && (
        <div>
          <ContactFormModal
            isOpen={showContactForm}
            onClose={() => {
              setShowContactForm(false);
              setEditingContactId(null);
            }}
            propertyId={propertyId}
            contactId={editingContactId || undefined}
            onSave={() => {
              loadContacts();
              setShowContactForm(false);
              setEditingContactId(null);
            }}
            onUpdate={() => {
              loadContacts();
              setShowContactForm(false);
              setEditingContactId(null);
            }}
          />
        </div>
      )}
    </>
  );
};

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
  onCenterOnPin,
  onDataUpdate,
  onEditContact,
  onDeleteProperty
}) => {
  console.log('PinDetailsSlideout rendering with:', { isOpen, data, type, rightOffset });
  const [activeTab, setActiveTab] = useState<TabType>(type === 'site_submit' ? 'submit' : 'property');
  const [submitStages, setSubmitStages] = useState<{ id: string; name: string }[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<any>(null);
  const [isEditingPropertyType, setIsEditingPropertyType] = useState(false);

  // Local state for property data (so we can update it immediately)
  const [localPropertyData, setLocalPropertyData] = useState<Property | null>(null);
  const [hasPropertyChanges, setHasPropertyChanges] = useState(false);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
  const [originalPropertyName, setOriginalPropertyName] = useState<string | null>(null);

  // Use shared hooks
  const { propertyRecordTypes, isLoading: isLoadingRecordTypes } = usePropertyRecordTypes();
  const { updateProperty } = useProperty(localPropertyData?.id || undefined);

  // Sync local property data with incoming data prop
  useEffect(() => {
    console.log('🔄 Syncing localPropertyData:', { data, type, hasData: !!data });
    if (data && type === 'property') {
      const property = data as Property;
      setLocalPropertyData(property);
      setOriginalPropertyName(property.property_name || null);
      console.log('✅ Set localPropertyData:', property.id, property.property_name);
    }
  }, [data, type]);

  // Form state for site submit fields
  const [formData, setFormData] = useState({
    dateSubmitted: '',
    loiDate: '',
    deliveryDate: '',
    deliveryTimeframe: '',
    notes: ''
  });


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

  // Property record types are now loaded via usePropertyRecordTypes hook

  if (!data || !type) return null;

  const isProperty = type === 'property';
  const property = isProperty ? localPropertyData : (data as SiteSubmit)?.property;
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


  // Handle field updates for property (track changes, save on button click)
  const handlePropertyFieldUpdate = (field: keyof Property, value: any) => {
    console.log(`🎯 handlePropertyFieldUpdate called:`, { field, value, hasLocalPropertyData: !!localPropertyData });

    if (!localPropertyData) {
      console.error('❌ No localPropertyData, cannot update field');
      return;
    }

    // Update local state immediately for instant UI feedback
    const updatedProperty = { ...localPropertyData, [field]: value };
    setLocalPropertyData(updatedProperty);
    console.log('📝 Updated localPropertyData:', updatedProperty);

    // Mark that there are unsaved changes
    setHasPropertyChanges(true);
  };

  // Retry Dropbox sync
  const handleRetryDropboxSync = async () => {
    if (!localPropertyData || !localPropertyData.id || !localPropertyData.property_name) return;

    try {
      setDropboxSyncError(null);

      // Get the current Dropbox folder name to use as "old name"
      const syncService = getDropboxPropertySyncService();
      const { currentFolderName } = await syncService.checkSyncStatus(
        localPropertyData.id,
        'property',
        localPropertyData.property_name
      );

      if (currentFolderName) {
        const result = await syncService.syncPropertyName(
          localPropertyData.id,
          currentFolderName,
          localPropertyData.property_name
        );

        if (!result.success) {
          setDropboxSyncError(result.error || 'Failed to sync folder name to Dropbox');
        } else {
          setOriginalPropertyName(localPropertyData.property_name);
          console.log('✅ Retry: Property name synced to Dropbox successfully');
        }
      }
    } catch (err) {
      console.error('Retry Dropbox sync error:', err);
      setDropboxSyncError('Unexpected error syncing to Dropbox');
    }
  };

  // Save property changes to database
  const handleSavePropertyChanges = async () => {
    if (!localPropertyData) return;

    try {
      setIsSavingProperty(true);
      setDropboxSyncError(null);
      console.log('💾 Saving property changes:', localPropertyData);

      // Extract only the editable fields (exclude system fields and id)
      const propertyUpdates: Partial<Database['public']['Tables']['property']['Update']> = {
        property_name: localPropertyData.property_name,
        address: localPropertyData.address,
        city: localPropertyData.city,
        state: localPropertyData.state,
        zip: localPropertyData.zip,
        property_notes: localPropertyData.property_notes,
        latitude: localPropertyData.latitude,
        longitude: localPropertyData.longitude,
        verified_latitude: localPropertyData.verified_latitude,
        verified_longitude: localPropertyData.verified_longitude,
        rent_psf: localPropertyData.rent_psf,
        nnn_psf: localPropertyData.nnn_psf,
        acres: localPropertyData.acres,
        building_sqft: localPropertyData.building_sqft,
        available_sqft: localPropertyData.available_sqft,
        property_record_type_id: localPropertyData.property_record_type_id,
        asking_purchase_price: localPropertyData.asking_purchase_price,
        asking_lease_price: localPropertyData.asking_lease_price,
        lease_expiration_date: localPropertyData.lease_expiration_date,
      };

      // Save all changes to database
      await updateProperty(propertyUpdates);

      console.log('✅ Property saved successfully');

      // If property_name changed, sync to Dropbox
      const nameChanged = originalPropertyName !== localPropertyData.property_name;
      if (nameChanged && originalPropertyName && localPropertyData.property_name) {
        const syncService = getDropboxPropertySyncService();
        const result = await syncService.syncPropertyName(
          localPropertyData.id,
          originalPropertyName,
          localPropertyData.property_name
        );

        if (!result.success) {
          setDropboxSyncError(result.error || 'Failed to sync folder name to Dropbox');
          console.warn('Dropbox sync failed:', result.error);
        } else {
          // Update original name if sync was successful
          setOriginalPropertyName(localPropertyData.property_name);
          console.log('✅ Property name synced to Dropbox successfully');
        }
      }

      // Notify parent of the update so it can update its state
      if (onDataUpdate) {
        onDataUpdate(localPropertyData as Property);
      }

      // Clear the changes flag
      setHasPropertyChanges(false);

      // Refresh both property and site submit layers to show updated data
      // Site submit layer needs refresh because it caches property data
      refreshLayer('properties');
      refreshLayer('site_submits');
    } catch (err) {
      console.error('💥 Failed to save property:', err);
      alert('Failed to save property changes. Please try again.');
    } finally {
      setIsSavingProperty(false);
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
        { id: 'contacts' as TabType, label: 'CONTACTS', icon: <Users size={16} /> },
        { id: 'files' as TabType, label: 'FILES', icon: <FolderOpen size={16} /> },
      ];
    } else {
      return [
        { id: 'submit' as TabType, label: 'SUBMIT', icon: <FileText size={16} /> },
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

            {/* Submit Site Button */}
            {siteSubmit?.id && (
              <div className="pt-3 border-t border-gray-200">
                <button
                  onClick={() => {
                    // Navigate to the site submit details page where the email function exists
                    window.location.href = `/site-submit/${siteSubmit.id}`;
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  Submit Site
                </button>
              </div>
            )}
          </div>
        );

      case 'property':
        // Determine property type for conditional field display
        const propertyRecordTypeLabel = property?.property_record_type_id && propertyRecordTypes.length > 0
          ? propertyRecordTypes.find(type => type.id === property.property_record_type_id)?.label?.toLowerCase() || ''
          : '';
        const isShoppingCenterType = propertyRecordTypeLabel.includes('shopping') || propertyRecordTypeLabel.includes('retail');
        const isLandType = propertyRecordTypeLabel.includes('land');

        return (
          <div className="space-y-2 text-sm">
            {isProperty ? (
              <>
                {/* Property Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Property Name</label>
                  <input
                    type="text"
                    value={property?.property_name || ''}
                    onChange={(e) => handlePropertyFieldUpdate('property_name', e.target.value)}
                    placeholder="Enter property name..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                  {/* Show Dropbox sync error with retry button */}
                  {dropboxSyncError && (
                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div className="flex items-start gap-2">
                        <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <div className="flex-1">
                          <p className="text-xs text-yellow-800 font-medium">Dropbox Sync Warning</p>
                          <p className="text-xs text-yellow-700 mt-1">{dropboxSyncError}</p>
                          <button
                            onClick={handleRetryDropboxSync}
                            className="mt-2 text-xs font-medium text-yellow-800 hover:text-yellow-900 underline"
                          >
                            Retry Sync
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Address */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                  <input
                    type="text"
                    value={property?.address || ''}
                    onChange={(e) => handlePropertyFieldUpdate('address', e.target.value)}
                    placeholder="Enter address..."
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                {/* City, State, ZIP on one line */}
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                    <input
                      type="text"
                      value={property?.city || ''}
                      onChange={(e) => handlePropertyFieldUpdate('city', e.target.value)}
                      placeholder="City..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                    <input
                      type="text"
                      value={property?.state || ''}
                      onChange={(e) => handlePropertyFieldUpdate('state', e.target.value)}
                      placeholder="State..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">ZIP</label>
                    <input
                      type="text"
                      value={property?.zip || ''}
                      onChange={(e) => handlePropertyFieldUpdate('zip', e.target.value)}
                      placeholder="ZIP..."
                      className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                {/* Financial Fields - For Shopping Centers */}
                {isShoppingCenterType && (
                  <>
                    {/* Available Sqft */}
                    <div className="pt-2 border-t border-gray-200">
                      <PropertySquareFootageField
                        label="Available Sqft"
                        value={property?.available_sqft || null}
                        onChange={(value) => handlePropertyFieldUpdate('available_sqft', value)}
                        compact={true}
                      />
                    </div>

                    {/* Rent PSF and NNN PSF */}
                    <div className="grid grid-cols-2 gap-2">
                      <PropertyPSFField
                        label="Rent PSF"
                        value={property?.rent_psf || null}
                        onChange={(value) => handlePropertyFieldUpdate('rent_psf', value)}
                        helpText="Base rent per square foot"
                        compact={true}
                      />
                      <PropertyPSFField
                        label="NNN PSF"
                        value={property?.nnn_psf || null}
                        onChange={(value) => handlePropertyFieldUpdate('nnn_psf', value)}
                        helpText="Triple net charges per square foot"
                        compact={true}
                      />
                    </div>

                    {/* All-In Rent Calculation */}
                    {property?.rent_psf && property?.nnn_psf && property?.available_sqft && (
                      <div className="p-2 bg-blue-50 rounded text-xs">
                        <div className="font-medium text-blue-900">All-In Rent</div>
                        <div className="text-sm font-bold text-blue-700">
                          ${(property.rent_psf + property.nnn_psf).toFixed(2)} / SF
                        </div>
                        <div className="text-xs text-blue-600">
                          Total annual: ${((property.rent_psf + property.nnn_psf) * property.available_sqft).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Land Fields */}
                {isLandType && (
                  <>
                    <div className="pt-2 border-t border-gray-200">
                      <h4 className="text-sm font-semibold text-gray-900 mb-2">Land Information</h4>

                      {/* Row 1: Asking Purchase Price, Asking Ground Lease Price */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Asking Purchase Price</label>
                          <input
                            type="number"
                            value={property?.asking_purchase_price || ''}
                            onChange={(e) => handlePropertyFieldUpdate('asking_purchase_price', e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="0"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Asking Ground Lease Price</label>
                          <input
                            type="number"
                            value={property?.asking_lease_price || ''}
                            onChange={(e) => handlePropertyFieldUpdate('asking_lease_price', e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="0"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Row 2: NNN, Acres */}
                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">NNN</label>
                          <input
                            type="number"
                            step="0.01"
                            value={property?.nnn_psf || ''}
                            onChange={(e) => handlePropertyFieldUpdate('nnn_psf', e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Acres</label>
                          <input
                            type="number"
                            step="0.01"
                            value={property?.acres || ''}
                            onChange={(e) => handlePropertyFieldUpdate('acres', e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="0.00"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>

                      {/* Row 3: Building Sqft, Lease Expiration Date */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Building Sqft</label>
                          <input
                            type="number"
                            value={property?.building_sqft || ''}
                            onChange={(e) => handlePropertyFieldUpdate('building_sqft', e.target.value ? parseFloat(e.target.value) : null)}
                            placeholder="0"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Lease Expiration Date</label>
                          <input
                            type="text"
                            value={property?.lease_expiration_date || ''}
                            onChange={(e) => handlePropertyFieldUpdate('lease_expiration_date', e.target.value)}
                            placeholder="MM/DD/YYYY"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
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

      case 'files':
        return (
          <div className="h-full">
            {localPropertyData?.id ? (
              <FileManager
                entityType="property"
                entityId={localPropertyData.id}
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                <p>No property selected</p>
              </div>
            )}
          </div>
        );

      case 'contacts':
        return <ContactsTabContent propertyId={localPropertyData?.id || ''} onEditContact={onEditContact} />;

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
              {/* Delete Button - Only for properties */}
              {isProperty && onDeleteProperty && localPropertyData?.id && (
                <button
                  onClick={() => onDeleteProperty(localPropertyData.id)}
                  className="p-2 bg-red-500 bg-opacity-80 hover:bg-red-600 hover:bg-opacity-90 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                  title="Delete property"
                >
                  <Trash2 size={16} className="text-white" />
                </button>
              )}

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
                      ? (property?.property_name || property?.address || 'Unnamed Property')
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

                {/* Property Type - For properties only */}
                {isProperty && property && (
                  <div className="mt-2">
                    {!isEditingPropertyType ? (
                      <div
                        className="inline-flex items-center gap-2 px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-medium cursor-pointer hover:bg-green-200 transition-colors"
                        onClick={() => setIsEditingPropertyType(true)}
                      >
                        <span>
                          {property.property_record_type_id && propertyRecordTypes.length > 0
                            ? propertyRecordTypes.find(type => type.id === property.property_record_type_id)?.label || 'Unknown Type'
                            : 'Set Property Type'
                          }
                        </span>
                        <Edit3 size={12} className="text-green-600" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          value={property.property_record_type_id || ''}
                          onChange={(e) => {
                            handlePropertyFieldUpdate('property_record_type_id', e.target.value);
                            setIsEditingPropertyType(false);
                          }}
                          className="px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 bg-white"
                          autoFocus
                          onBlur={() => setIsEditingPropertyType(false)}
                          disabled={isLoadingRecordTypes}
                        >
                          <option value="">
                            {isLoadingRecordTypes ? 'Loading types...' : 'Select property type...'}
                          </option>
                          {propertyRecordTypes.map(type => (
                            <option key={type.id} value={type.id}>
                              {type.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                )}

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
          <div className="space-y-2">
            {/* Update Property button - only show when changes made to properties */}
            {hasPropertyChanges && isProperty && (
              <div className="flex items-center justify-center">
                <button
                  onClick={handleSavePropertyChanges}
                  disabled={isSavingProperty}
                  className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSavingProperty ? 'SAVING...' : 'UPDATE PROPERTY'}
                </button>
              </div>
            )}

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