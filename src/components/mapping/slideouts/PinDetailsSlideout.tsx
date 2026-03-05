import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from '../layers/LayerManager';
import { usePropertyRecordTypes } from '../../../hooks/usePropertyRecordTypes';
import { useProperty } from '../../../hooks/useProperty';
import { useToast } from '../../../hooks/useToast';
import { useAutosave } from '../../../hooks/useAutosave';
import { useAuth } from '../../../contexts/AuthContext';
import PropertyInputField from '../../property/PropertyInputField';
import PropertyPSFField from '../../property/PropertyPSFField';
import PropertyCurrencyField from '../../property/PropertyCurrencyField';
import PropertySquareFootageField from '../../property/PropertySquareFootageField';
import FormattedField from '../../shared/FormattedField';
import { FileText, DollarSign, Building2, Activity, MapPin, Edit3, FolderOpen, Users, Trash2, Grid3x3, ExternalLink, Map } from 'lucide-react';
import { Database } from '../../../../database-schema';
import { getDropboxPropertySyncService } from '../../../services/dropboxPropertySync';
import FileManager from '../../FileManager/FileManager';
import AddContactsModal from '../../property/AddContactsModal';
import ContactFormModal from '../../ContactFormModal';
import ClientSelector from '../ClientSelector';
import PropertyUnitSelector from '../../PropertyUnitSelector';
import PropertyUnitsSection from '../../property/PropertyUnitsSection';
import Toast from '../../Toast';
import DeleteConfirmationModal from '../../DeleteConfirmationModal';
import AssignmentSelector from '../AssignmentSelector';
import { AssignmentSearchResult } from '../../../hooks/useAssignmentSearch';
import AddAssignmentModal from '../../AddAssignmentModal';
import AutosaveIndicator from '../../AutosaveIndicator';
import EmailComposerModal from '../../EmailComposerModal';
import { useSiteSubmitEmail } from '../../../hooks/useSiteSubmitEmail';
import RecordMetadata from '../../RecordMetadata';
import SalesTrendChart from '../../charts/SalesTrendChart';
import PropertyActivityTab from '../../property/PropertyActivityTab';

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
  property_record_type?: PropertyRecordType | null;
  property_type_id?: string | null;
  property_type?: { id: string; label: string } | null;
  asking_purchase_price?: number | null;
  asking_lease_price?: number | null;
  lease_expiration_date?: string | null;
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
}

interface SiteSubmit {
  id: string;
  site_submit_name?: string;
  property_id: string;
  client_id?: string;
  assignment_id?: string | null;
  property_unit_id?: string | null;
  submit_stage_id?: string;
  year_1_rent?: number;
  ti?: number;
  notes?: string;
  customer_comments?: string;
  // New fields for Submit tab
  sf_property_unit?: string; // Database field name
  date_submitted?: string;
  loi_written?: boolean;
  loi_date?: string;
  delivery_date?: string;
  delivery_timeframe?: string;
  created_at?: string;
  created_by_id?: string | null;
  updated_at?: string;
  updated_by_id?: string | null;
  // Related data
  property?: Property;
  client?: { client_name: string };
  submit_stage?: { id: string; name: string };
  property_unit?: { property_unit_name: string };
  _isNew?: boolean; // Flag for create mode
}

interface Restaurant {
  store_no: string;
  chain?: string | null;
  geoaddress?: string | null;
  geocity?: string | null;
  geostate?: string | null;
  geozip?: string | null;
  county?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  verified_latitude?: number | null;
  verified_longitude?: number | null;
  yr_built?: number | null;
  trends?: Array<{
    trend_id: string;
    store_no: string;
    year: number;
    curr_natl_grade?: string | null;
    curr_annual_sls_k?: number | null;
  }>;
  latest_trend?: {
    trend_id: string;
    store_no: string;
    year: number;
    curr_natl_grade?: string | null;
    curr_annual_sls_k?: number | null;
  } | null;
}

interface PinDetailsSlideoutProps {
  isOpen: boolean;
  onClose: () => void;
  onOpen?: () => void;
  data: Property | SiteSubmit | Restaurant | null;
  type: 'property' | 'site_submit' | 'restaurant' | null;
  onVerifyLocation?: (propertyId: string) => void;
  isVerifyingLocation?: boolean;
  onViewPropertyDetails?: (property: Property) => void;
  rightOffset?: number; // Offset from right edge in pixels
  onCenterOnPin?: (lat: number, lng: number) => void; // Function to center map on pin
  onDataUpdate?: (updatedData: Property | SiteSubmit) => void; // Callback when data is updated
  onEditContact?: (contactId: string | null, propertyId: string) => void; // Callback to open contact form sidebar
  onDeleteProperty?: (propertyId: string) => void; // Callback to delete property
  onDeleteSiteSubmit?: (siteSubmitId: string, siteSubmitName: string) => void; // Callback to delete site submit
  onViewSiteSubmitDetails?: (siteSubmit: SiteSubmit) => void; // Callback to open site submit slideout from property
  onCreateSiteSubmit?: (propertyId: string) => void; // Callback to create new site submit for property
  submitsRefreshTrigger?: number; // Trigger to refresh submits list
  initialTab?: TabType; // Initial tab to open
  onOpenFullSiteSubmit?: (siteSubmitId: string) => void; // Callback to open full site submit slideout
}

type TabType = 'property' | 'activity' | 'submit' | 'location' | 'files' | 'contacts' | 'submits' | 'units';

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

// Submits Tab Component
const SubmitsTabContent: React.FC<{
  propertyId: string;
  onViewSiteSubmitDetails?: (siteSubmit: SiteSubmit) => void;
  onCreateSiteSubmit?: (propertyId: string) => void;
  refreshTrigger?: number;
}> = ({ propertyId, onViewSiteSubmitDetails, onCreateSiteSubmit, refreshTrigger }) => {
  const [siteSubmits, setSiteSubmits] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [siteSubmitToDelete, setSiteSubmitToDelete] = useState<{ id: string; name: string } | null>(null);
  const { showToast } = useToast();

  const loadSiteSubmits = async () => {
    if (!propertyId) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('site_submit')
        .select(`
          *,
          client!site_submit_client_id_fkey (
            id,
            client_name
          ),
          property_unit!site_submit_property_unit_id_fkey (
            property_unit_name
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          )
        `)
        .eq('property_id', propertyId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('❌ Error loading site submits:', error);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error details:', error.details);
        throw error;
      }

      console.log('📋 Loaded site submits for property:', propertyId, data);
      setSiteSubmits(data || []);
    } catch (err: any) {
      console.error('❌ Exception loading site submits:', err);
      console.error('❌ Exception message:', err?.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSiteSubmit = async (e: React.MouseEvent, siteSubmitId: string, siteSubmitName: string) => {
    e.stopPropagation(); // Prevent opening the site submit details
    setSiteSubmitToDelete({ id: siteSubmitId, name: siteSubmitName });
    setDeleteModalOpen(true);
  };

  const confirmDeleteSiteSubmit = async () => {
    if (!siteSubmitToDelete) return;

    try {
      const { error } = await supabase
        .from('site_submit')
        .delete()
        .eq('id', siteSubmitToDelete.id);

      if (error) throw error;

      console.log('✅ Site submit deleted successfully:', siteSubmitToDelete.id);

      showToast('Site submit deleted successfully', { type: 'success' });

      // Refresh the list
      loadSiteSubmits();

      // Close the modal
      setDeleteModalOpen(false);
      setSiteSubmitToDelete(null);
    } catch (err) {
      console.error('❌ Error deleting site submit:', err);
      showToast('Failed to delete site submit. Please try again.', { type: 'error' });
    }
  };

  useEffect(() => {
    loadSiteSubmits();
  }, [propertyId, refreshTrigger]);

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
      {/* Add Site Submit Button */}
      <button
        onClick={() => onCreateSiteSubmit?.(propertyId)}
        className="w-full px-3 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
      >
        <FileText size={16} />
        New Site Submit
      </button>

      {/* Site Submits List */}
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
        </div>
      ) : siteSubmits.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-sm">
          <FileText size={32} className="mx-auto mb-2 text-gray-300" />
          <p>No site submits associated</p>
          <p className="text-xs mt-1">Create a site submit from the map</p>
        </div>
      ) : (
        <div>
          {siteSubmits.map((siteSubmit) => (
            <div
              key={siteSubmit.id}
              className="p-3 hover:bg-green-50 cursor-pointer transition-colors border-b border-gray-100 last:border-b-0 group"
              onClick={() => onViewSiteSubmitDetails?.(siteSubmit)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium text-gray-900 truncate group-hover:text-green-900">
                      {siteSubmit.site_submit_name || siteSubmit.sf_account || 'Unnamed Submit'}
                    </p>
                    <svg className="w-3 h-3 text-gray-400 group-hover:text-green-600 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-green-600 font-medium">
                      {siteSubmit.submit_stage?.name || 'No Stage'}
                    </p>
                    {siteSubmit.property_unit?.property_unit_name && (
                      <p className="text-xs text-gray-600 font-medium">
                        {siteSubmit.property_unit.property_unit_name}
                      </p>
                    )}
                    <p className="text-xs text-gray-500 truncate ml-2">
                      {siteSubmit.client?.client_name || 'No client'}
                    </p>
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => handleDeleteSiteSubmit(e, siteSubmit.id, siteSubmit.site_submit_name || siteSubmit.sf_account || 'Unnamed Submit')}
                  className="ml-2 p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Delete site submit"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSiteSubmitToDelete(null);
        }}
        onConfirm={confirmDeleteSiteSubmit}
        title="Delete Site Submit"
        itemName={siteSubmitToDelete?.name || 'this site submit'}
        message="This action cannot be undone."
      />
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
  onDeleteProperty,
  onDeleteSiteSubmit,
  onViewSiteSubmitDetails,
  onCreateSiteSubmit,
  submitsRefreshTrigger,
  initialTab,
  onOpenFullSiteSubmit
}) => {
  const [activeTab, setActiveTab] = useState<TabType>(
    initialTab || (type === 'site_submit' ? 'submit' : 'property')
  );
  const [submitStages, setSubmitStages] = useState<{ id: string; name: string }[]>([]);
  const [currentStageId, setCurrentStageId] = useState<string>('');
  const [isMinimized, setIsMinimized] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<any>(null);
  const [isEditingPropertyType, setIsEditingPropertyType] = useState(false);
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddressValues, setEditAddressValues] = useState({
    property_name: '',
    address: '',
    city: '',
    state: '',
    zip: ''
  });

  // Local state for property data (so we can update it immediately)
  const [localPropertyData, setLocalPropertyData] = useState<Property | null>(null);
  const [hasPropertyChanges, setHasPropertyChanges] = useState(false);
  const [isSavingProperty, setIsSavingProperty] = useState(false);
  const [dropboxSyncError, setDropboxSyncError] = useState<string | null>(null);
  const [originalPropertyName, setOriginalPropertyName] = useState<string | null>(null);

  // User names for metadata
  const [createdByName, setCreatedByName] = useState<string>('');
  const [updatedByName, setUpdatedByName] = useState<string>('');

  // Use shared hooks
  const { propertyRecordTypes } = usePropertyRecordTypes();
  const { updateProperty } = useProperty(localPropertyData?.id || undefined);
  const { toast, showToast } = useToast();
  // Note: userTableId no longer needed - auth.uid() automatically sets created_by_id/updated_by_id

  // Sync activeTab with initialTab when it changes OR when slideout opens
  useEffect(() => {
    console.log('🔄 initialTab or isOpen changed:', { initialTab, isOpen });
    if (initialTab && isOpen) {
      console.log('✅ Setting activeTab to:', initialTab);
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  // Sync local property data with incoming data prop
  useEffect(() => {
    console.log('🔄 Syncing localPropertyData:', { data, type, hasData: !!data });
    if (data && type === 'property') {
      const property = data as Property;
      console.log('🔍 Property data received:', {
        id: property.id,
        property_name: property.property_name,
        property_notes: property.property_notes,
        hasPropertyNotes: property.property_notes !== undefined
      });
      setLocalPropertyData(property);
      setOriginalPropertyName(property.property_name || null);
      console.log('✅ Set localPropertyData:', property.id, property.property_name);
    }
  }, [data, type]);

  // Fetch user names for metadata
  useEffect(() => {
    const fetchUserNames = async () => {
      const record = type === 'property' ? (data as Property) : (data as SiteSubmit);
      if (!record) return;

      console.log('🔍 Fetching user names for:', { type, created_by_id: record.created_by_id, updated_by_id: record.updated_by_id });

      // Reset names
      setCreatedByName('');
      setUpdatedByName('');

      // Fetch created_by user name
      if (record.created_by_id && record.created_by_id !== 'undefined' && record.created_by_id !== 'null') {
        // Look up by both id (for old records) and auth_user_id (for new records)
        const { data: userData, error } = await supabase
          .from('user')
          .select('name, first_name, last_name')
          .or(`id.eq.${record.created_by_id},auth_user_id.eq.${record.created_by_id}`)
          .maybeSingle();

        console.log('👤 Created by user lookup:', { created_by_id: record.created_by_id, userData, error });

        if (userData) {
          // Use name field if available, otherwise construct from first_name and last_name
          const displayName = userData.name ||
            (userData.first_name && userData.last_name
              ? `${userData.first_name} ${userData.last_name}`
              : userData.first_name || userData.last_name || 'Unknown');
          setCreatedByName(displayName);
          console.log('✅ Created by name set to:', displayName);
        }
      }

      // Fetch updated_by user name
      if (record.updated_by_id && record.updated_by_id !== 'undefined' && record.updated_by_id !== 'null') {
        // Look up by both id (for old records) and auth_user_id (for new records)
        const { data: userData, error } = await supabase
          .from('user')
          .select('name, first_name, last_name')
          .or(`id.eq.${record.updated_by_id},auth_user_id.eq.${record.updated_by_id}`)
          .maybeSingle();

        console.log('👤 Updated by user lookup:', { updated_by_id: record.updated_by_id, userData, error });

        if (userData) {
          // Use name field if available, otherwise construct from first_name and last_name
          const displayName = userData.name ||
            (userData.first_name && userData.last_name
              ? `${userData.first_name} ${userData.last_name}`
              : userData.first_name || userData.last_name || 'Unknown');
          setUpdatedByName(displayName);
          console.log('✅ Updated by name set to:', displayName);
        }
      }
    };

    if (data) {
      fetchUserNames();
    }
  }, [data, type]);

  // Form state for site submit fields
  const [formData, setFormData] = useState({
    dateSubmitted: '',
    loiDate: '',
    deliveryDate: '',
    deliveryTimeframe: '',
    notes: '',
    customerComments: ''
  });

  // Site submit relational data
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSearchResult | null>(null);
  const [selectedPropertyUnit, setSelectedPropertyUnit] = useState<string | null>(null);
  const [siteSubmitName, setSiteSubmitName] = useState<string>('');
  const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);

  // Email composer hook for site submit emails
  const {
    showEmailComposer,
    setShowEmailComposer,
    sendingEmail,
    emailDefaultData,
    prepareEmail,
    sendEmail,
  } = useSiteSubmitEmail({ showToast });

  // Try to get refreshLayer, but handle cases where LayerManager isn't provided (like dashboard pages)
  let refreshLayer: ((layerId: string) => void) | undefined;
  try {
    const layerManager = useLayerManager();
    refreshLayer = layerManager?.refreshLayer;
  } catch (e) {
    // LayerManager not provided - that's ok for non-map pages
  }

  // Safe wrapper that only calls refreshLayer if it exists
  const safeRefreshLayer = (layerId: string) => {
    if (refreshLayer) {
      refreshLayer(layerId);
    }
  };

  // Autosave for site submit changes (only for existing site submits, not new ones)
  const siteSubmit = type === 'site_submit' ? (data as SiteSubmit) : null;
  const isNewSiteSubmit = siteSubmit?._isNew || !siteSubmit?.id;

  const { status: autosaveStatus, lastSavedAt } = useAutosave({
    data: {
      ...formData,
      selectedClient,
      selectedAssignment,
      selectedPropertyUnit,
      siteSubmitName,
      currentStageId,
    },
    onSave: async (saveData) => {
      if (!siteSubmit?.id || isNewSiteSubmit) return; // Don't autosave new records
      if (!selectedClient?.id) return; // Don't save without required fields

      console.log('💾 Autosaving site submit changes...');

      const { data: updatedData, error } = await supabase
        .from('site_submit')
        .update({
          site_submit_name: saveData.siteSubmitName,
          client_id: saveData.selectedClient?.id,
          assignment_id: saveData.selectedAssignment?.id || null,
          property_unit_id: saveData.selectedPropertyUnit || null,
          date_submitted: saveData.dateSubmitted || null,
          delivery_timeframe: saveData.deliveryTimeframe || null,
          notes: saveData.notes || null,
          customer_comments: saveData.customerComments || null,
          updated_at: new Date().toISOString()
          // updated_by_id set automatically by auth.uid() default
        })
        .eq('id', siteSubmit.id)
        .select(`
          *,
          property!site_submit_property_id_fkey (
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
            property_record_type_id
          ),
          client!site_submit_client_id_fkey (
            id,
            client_name
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          )
        `)
        .single();

      if (error) throw error;

      console.log('✅ Site submit autosaved successfully');
      console.log('📥 Updated site submit data with metadata:', updatedData);

      // Update lastSavedData to prevent form reinitialization on reopen
      if (updatedData) {
        setLastSavedData(updatedData);

        // Update parent's data so metadata shows immediately
        if (onDataUpdate) {
          onDataUpdate(updatedData);
        }
      }

      // Refresh the layer to show changes on map
      safeRefreshLayer('site_submits');
    },
    delay: 1500,
    enabled: type === 'site_submit' && !isNewSiteSubmit,
  });

  // Auto-generate site submit name when client is selected
  useEffect(() => {
    if (selectedClient && type === 'site_submit' && data) {
      const property = (data as SiteSubmit)?.property;
      if (property?.property_name && selectedClient.client_name) {
        const generatedName = `${property.property_name} - ${selectedClient.client_name}`;
        setSiteSubmitName(generatedName);
        setHasChanges(true); // Mark as having changes so save button appears
        console.log('📝 Auto-generated site submit name:', generatedName);
      }
    }
  }, [selectedClient, type, data]);

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
          notes: lastSavedData.notes || '',
          customerComments: lastSavedData.customer_comments || ''
        });
      } else {
        console.log('📥 Initializing form data with fresh siteSubmit:', siteSubmitData);
        setFormData({
          dateSubmitted: siteSubmitData.date_submitted ? siteSubmitData.date_submitted.split('T')[0] : '',
          loiDate: siteSubmitData.loi_date ? siteSubmitData.loi_date.split('T')[0] : '',
          deliveryDate: siteSubmitData.delivery_date ? siteSubmitData.delivery_date.split('T')[0] : '',
          deliveryTimeframe: siteSubmitData.delivery_timeframe || '',
          notes: siteSubmitData.notes || '',
          customerComments: siteSubmitData.customer_comments || ''
        });
      }

      setHasChanges(false);
    }
  }, [data, type]); // Removed lastSavedData from deps to prevent reinit on autosave


  // Track the last loaded site submit ID to prevent re-initialization on same submit
  const [lastLoadedSiteSubmitId, setLastLoadedSiteSubmitId] = useState<string | null>(null);

  // Initialize current stage ID when data changes
  useEffect(() => {
    if (type === 'site_submit' && data) {
      const siteSubmitData = data as SiteSubmit;
      console.log('🔄 Initializing site submit form data:', siteSubmitData);
      console.log('🔄 Initializing site submit form with stage:', siteSubmitData.submit_stage_id);

      // Only reinitialize if this is a DIFFERENT site submit (different ID or new)
      const currentId = siteSubmitData.id || null;
      const isNewSubmit = siteSubmitData._isNew;
      const isDifferentSubmit = currentId !== lastLoadedSiteSubmitId;

      if (isNewSubmit || isDifferentSubmit) {
        console.log('✅ New or different site submit - initializing stage:', siteSubmitData.submit_stage_id);
        setCurrentStageId(siteSubmitData.submit_stage_id || '');
        setLastLoadedSiteSubmitId(currentId);
      } else {
        console.log('⏭️ Same site submit - keeping current stage:', currentStageId);
      }

      // Initialize site submit name
      setSiteSubmitName(siteSubmitData.site_submit_name || '');

      // Initialize client if present
      console.log('🔍 Client check - client_id:', siteSubmitData.client_id);
      console.log('🔍 Client check - client object:', siteSubmitData.client);
      if (siteSubmitData.client_id && siteSubmitData.client) {
        console.log('✅ Initializing client with both ID and object:', siteSubmitData.client);
        setSelectedClient({
          id: siteSubmitData.client_id,
          client_name: siteSubmitData.client.client_name,
          site_submit_count: 0 // This is just for display
        });
      } else if (siteSubmitData.client_id) {
        // If we have client_id but no client object, fetch it
        console.log('🔍 Fetching client for ID:', siteSubmitData.client_id);
        supabase
          .from('client')
          .select('id, client_name')
          .eq('id', siteSubmitData.client_id)
          .single()
          .then(({ data: clientData, error }) => {
            if (clientData && !error) {
              console.log('✅ Fetched client from database:', clientData);
              setSelectedClient({
                id: clientData.id,
                client_name: clientData.client_name,
                site_submit_count: 0
              });
            } else {
              console.error('❌ Error fetching client:', error);
            }
          });
      } else {
        console.log('⚠️ No client_id found on site submit data - clearing client');
        setSelectedClient(null);
      }

      // Initialize property unit if present (explicitly check for undefined/null)
      console.log('🏢 Setting property unit from data:', siteSubmitData.property_unit_id, 'isNew:', siteSubmitData._isNew);
      setSelectedPropertyUnit(siteSubmitData.property_unit_id ?? null);

      // Initialize assignment if present
      if (siteSubmitData.assignment_id) {
        console.log('📋 Loading assignment for site submit:', siteSubmitData.assignment_id);
        // Load assignment data without nested joins
        supabase
          .from('assignment')
          .select('id, assignment_name, client_id, assignment_value, due_date, progress')
          .eq('id', siteSubmitData.assignment_id)
          .single()
          .then(async ({ data: assignmentData, error: assignmentError }) => {
            if (assignmentError) {
              console.error('❌ Error loading assignment:', assignmentError);
              setSelectedAssignment(null);
            } else if (assignmentData) {
              console.log('✅ Loaded assignment data:', assignmentData);

              // Fetch client name separately if needed
              let clientName = null;
              if (assignmentData.client_id) {
                const { data: clientData } = await supabase
                  .from('client')
                  .select('client_name')
                  .eq('id', assignmentData.client_id)
                  .single();
                clientName = clientData?.client_name || null;
              }

              setSelectedAssignment({
                id: assignmentData.id,
                assignment_name: assignmentData.assignment_name || 'Unnamed Assignment',
                client_id: assignmentData.client_id,
                client_name: clientName,
                assignment_value: assignmentData.assignment_value,
                due_date: assignmentData.due_date,
                progress: assignmentData.progress
              });
            } else {
              console.warn('⚠️ No assignment data found for ID:', siteSubmitData.assignment_id);
              setSelectedAssignment(null);
            }
          });
      } else {
        console.log('ℹ️ No assignment_id on site submit - clearing assignment');
        // Clear assignment if not present
        setSelectedAssignment(null);
      }
    }
  }, [data, type]);

  // NOTE: Map centering on property selection is now handled in MappingPageNew.tsx
  // via handlePinClick -> handleCenterOnPin pattern. The slideout should NOT
  // auto-center the map - this caused issues with map snapping back when panning.
  // The "Center on Pin" button in the UI still works via onCenterOnPin callback.

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

  // Restaurant-specific state (must be at top level to satisfy Rules of Hooks)
  const restaurant = type === 'restaurant' ? (data as Restaurant) : null;
  const [fullTrends, setFullTrends] = useState<any[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  // Initialize and lazy load full trend history for restaurants
  useEffect(() => {
    if (type !== 'restaurant' || !restaurant) return;

    // Initialize with existing trends
    if (restaurant.trends && restaurant.trends.length > 0) {
      setFullTrends(restaurant.trends);
    }

    // If we only have one trend, fetch the full history
    if (restaurant.trends && restaurant.trends.length === 1) {
      const loadFullTrends = async () => {
        setLoadingTrends(true);
        try {
          const { data: allTrends, error } = await supabase
            .from('restaurant_trend')
            .select('trend_id, store_no, year, curr_natl_grade, curr_mkt_grade, curr_annual_sls_k')
            .eq('store_no', restaurant.store_no)
            .order('year', { ascending: false });

          if (error) {
            console.error('Error loading full trends:', error);
          } else if (allTrends && allTrends.length > 1) {
            console.log(`✅ Loaded ${allTrends.length} trend records for ${restaurant.store_no}`);
            // Deduplicate by year, keeping the most recent entry for each year
            const uniqueTrends = Array.from(
              new Map(allTrends.map(t => [t.year, t])).values()
            );
            setFullTrends(uniqueTrends);
          }
        } catch (err) {
          console.error('Failed to load full trends:', err);
        } finally {
          setLoadingTrends(false);
        }
      };

      loadFullTrends();
    }
  }, [type, restaurant?.store_no, restaurant?.trends?.length]);

  if (!data || !type) return null;

  // Early return for restaurant type
  if (type === 'restaurant' && restaurant) {

    // Prepare chart data - deduplicate by year, sort by year ascending for the chart
    const trendsMap = new Map();
    fullTrends
      ?.filter(t => t.curr_annual_sls_k !== null && t.curr_annual_sls_k !== undefined)
      .forEach(trend => {
        // Keep only one entry per year (the first one we encounter, which is the most recent due to ordering)
        if (!trendsMap.has(trend.year)) {
          trendsMap.set(trend.year, trend);
        }
      });

    const chartData = Array.from(trendsMap.values())
      .sort((a, b) => a.year - b.year)
      .map(trend => ({
        year: trend.year.toString(),
        sales: trend.curr_annual_sls_k! * 1000, // Convert to actual dollars
        salesK: trend.curr_annual_sls_k!, // Keep K for display
      }));

    console.log('📊 Chart data for restaurant:', restaurant.store_no, chartData);

    // Check if all sales values are the same (no variation)
    const hasVariation = chartData.length > 1 &&
      new Set(chartData.map(d => d.sales)).size > 1;

    console.log('📊 Has variation:', hasVariation, 'unique values:', new Set(chartData.map(d => d.sales)).size);

    // Format ZIP code without decimal
    const formatZip = (zip: string | null) => {
      if (!zip) return '';
      return zip.split('.')[0];
    };

    // Format sales value for display
    const formatSalesValue = (value: number) => {
      if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)} mil`;
      }
      return `$${(value / 1000).toFixed(0)}K`;
    };

    return (
      <div
        className={`fixed top-0 right-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 z-40 flex flex-col w-[500px]`}
        style={{
          top: '67px',
          height: 'calc(100vh - 67px - 20px)',
        }}
      >
        <div className="p-6 overflow-y-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-bold text-gray-900 capitalize">
                {restaurant.chain?.toLowerCase() || 'Restaurant'}
              </h2>
              {restaurant.geoaddress && (
                <p className="text-sm text-gray-500 capitalize mt-1">
                  {restaurant.geoaddress.toLowerCase()}, {restaurant.geocity?.toLowerCase()}, {restaurant.geostate} {formatZip(restaurant.geozip)}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Year Built - small text */}
          {restaurant.yr_built && (
            <div className="mb-4">
              <p className="text-xs text-gray-500">Built {restaurant.yr_built}</p>
            </div>
          )}

          {/* Sales Trend Chart */}
          {chartData.length > 1 && hasVariation && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-white mb-3 flex items-center">
                <span className="bg-gradient-to-r from-red-500 to-orange-500 px-3 py-1 rounded-full">
                  📈 Sales Performance
                </span>
              </h3>
              <SalesTrendChart data={chartData} formatSalesValue={formatSalesValue} />
            </div>
          )}

          {/* Sales Data Table */}
          {fullTrends && fullTrends.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                Sales History
                {loadingTrends && <span className="text-xs text-gray-500">(Loading...)</span>}
              </h3>
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-gray-700">Year</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-700">Sales</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-700">Nat'l Grade</th>
                      <th className="px-3 py-2 text-center font-semibold text-gray-700">Mkt Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {fullTrends
                      .sort((a, b) => b.year - a.year) // Show most recent first in table
                      .map((trend) => (
                        <tr key={trend.trend_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-900">{trend.year}</td>
                          <td className="px-3 py-2 text-center text-gray-900 font-medium">
                            {trend.curr_annual_sls_k
                              ? `$${(trend.curr_annual_sls_k * 1000).toLocaleString()}`
                              : 'N/A'}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-700">
                            {trend.curr_natl_grade || '-'}
                          </td>
                          <td className="px-3 py-2 text-center text-gray-700">
                            {trend.curr_mkt_grade || '-'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  const isProperty = type === 'property';
  const property = isProperty ? localPropertyData : (data as SiteSubmit)?.property;

  // Handle stage change with immediate database update
  const handleStageChange = async (newStageId: string) => {
    if (!newStageId) return;

    console.log(`🔄 Changing stage to: ${newStageId}, site submit exists:`, !!siteSubmit?.id);

    // For new site submits (no ID yet), just update the local state
    if (!siteSubmit?.id || siteSubmit._isNew) {
      console.log('✅ Setting stage for new site submit:', newStageId);
      setCurrentStageId(newStageId);
      return;
    }

    // For existing site submits, update the database immediately
    try {
      console.log(`🔄 Updating stage in database for site submit ${siteSubmit.id} to stage ${newStageId}`);

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
        console.log('✅ Stage updated successfully in database:', updatedData);
        console.log('🔄 New stage name:', updatedData.submit_stage?.name);
        // Update local state immediately to show new stage in dropdown
        setCurrentStageId(newStageId);
        // Trigger refresh of site submit layer to show changes immediately
        console.log('🔄 Calling safeRefreshLayer for site_submits, refreshLayer available:', !!refreshLayer);
        safeRefreshLayer('site_submits');
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
    // Use functional update to ensure sequential calls build on each other
    setLocalPropertyData(prev => {
      if (!prev) return null;
      const updatedProperty = { ...prev, [field]: value };
      console.log('📝 Updated localPropertyData:', updatedProperty);
      return updatedProperty;
    });

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
      console.log('🔍 Property notes value before save:', localPropertyData.property_notes);

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
        property_type_id: localPropertyData.property_type_id,
        asking_purchase_price: localPropertyData.asking_purchase_price,
        asking_lease_price: localPropertyData.asking_lease_price,
        lease_expiration_date: localPropertyData.lease_expiration_date,
      };

      console.log('📤 Sending property updates to database:', propertyUpdates);
      console.log('🔍 Property notes in updates object:', propertyUpdates.property_notes);
      console.log('🔍 Property type_id in updates object:', propertyUpdates.property_type_id);

      // Save all changes to database (updated_by_id set automatically by auth.uid() default)
      await updateProperty(propertyUpdates);

      console.log('✅ updateProperty completed successfully');
      console.log('🔍 Property type_id after save:', localPropertyData.property_type_id);

      // Fetch the updated property with metadata fields to show instantly
      const { data: updatedProperty, error: fetchError } = await supabase
        .from('property')
        .select('*')
        .eq('id', localPropertyData.id)
        .single();

      if (fetchError) {
        console.error('❌ Failed to fetch updated property:', fetchError);
      } else if (updatedProperty) {
        console.log('📥 Fetched updated property with metadata:', updatedProperty);
        // Update local state with the fresh data including metadata
        setLocalPropertyData({ ...localPropertyData, ...updatedProperty });
      }

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
      safeRefreshLayer('properties');
      safeRefreshLayer('site_submits');
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
      // Check if this is a new site submit (create mode)
      const isNewSiteSubmit = siteSubmit._isNew || !siteSubmit.id;

      if (isNewSiteSubmit) {
        console.log('💾 Creating new site submit for property:', siteSubmit.property_id);
        console.log('📝 Form data for new site submit:', formData);
        console.log('📝 Full siteSubmit object:', siteSubmit);

        // Validation: require client
        if (!selectedClient?.id) {
          alert('Client is required');
          return;
        }

        // Get property coordinates for the site submit pin
        const propertyCoords = siteSubmit.property?.verified_latitude && siteSubmit.property?.verified_longitude
          ? { lat: siteSubmit.property.verified_latitude, lng: siteSubmit.property.verified_longitude }
          : { lat: siteSubmit.property?.latitude, lng: siteSubmit.property?.longitude };

        console.log('📍 Using property coordinates for site submit:', propertyCoords);

        // Prepare insert data
        // For new site submits, use the property_unit_id from the data (which should be null for fresh creates)
        // For existing, use the selectedPropertyUnit state
        const propertyUnitForInsert = siteSubmit.property_unit_id ?? selectedPropertyUnit ?? null;

        const insertData = {
          site_submit_name: siteSubmitName,
          property_id: siteSubmit.property_id,
          client_id: selectedClient.id,
          assignment_id: selectedAssignment?.id || null,
          property_unit_id: propertyUnitForInsert,
          submit_stage_id: currentStageId || null,
          date_submitted: formData.dateSubmitted || null,
          delivery_timeframe: formData.deliveryTimeframe || null,
          notes: formData.notes || null,
          customer_comments: formData.customerComments || null,
          verified_latitude: propertyCoords.lat,  // User-verified coordinates from map pin
          verified_longitude: propertyCoords.lng, // User-verified coordinates from map pin
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
          // created_by_id and updated_by_id set automatically by auth.uid() defaults
        };

        console.log('📝 Assignment being saved:', selectedAssignment?.id, selectedAssignment?.assignment_name);

        // Remove undefined fields so database defaults (created_by_id, updated_by_id) can apply
        Object.keys(insertData).forEach(key => {
          if (insertData[key] === undefined) {
            delete insertData[key];
          }
        });

        console.log('📝 Insert data being sent to Supabase:', insertData);
        console.log('🎯 Current stage ID at save time:', currentStageId);

        // Insert new site submit
        const { data: newSiteSubmit, error } = await supabase
          .from('site_submit')
          .insert(insertData)
          .select()
          .single();

        if (error) {
          console.error('❌ Error creating site submit:', error);
          console.error('Error details:', JSON.stringify(error, null, 2));
          console.error('Error message:', error.message);
          console.error('Error hint:', error.hint);
          console.error('Error code:', error.code);
          alert(`Failed to create site submit: ${error.message}`);
          return; // Stop execution on error
        } else {
          console.log('✅ Site submit created successfully:', newSiteSubmit);
          console.log('✅ Saved site submit property_id:', newSiteSubmit?.property_id);

          // Fetch the complete site submit data including property relationship
          const { data: completeSiteSubmit, error: fetchError } = await supabase
            .from('site_submit')
            .select(`
              *,
              properties!site_submit_property_id_fkey(*),
              clients!site_submit_client_id_fkey(client_name),
              property_unit:property_unit_id (property_unit_name),
              stages!site_submit_stage_id_fkey(id, name)
            `)
            .eq('id', newSiteSubmit.id)
            .single();

          if (fetchError) {
            console.error('❌ Error fetching complete site submit data:', fetchError);
          } else {
            console.log('✅ Fetched complete site submit with property:', completeSiteSubmit);
          }

          // Normalize the data structure (map new key names to old expected names)
          let finalData = completeSiteSubmit || newSiteSubmit;
          if (completeSiteSubmit) {
            finalData = {
              ...completeSiteSubmit,
              property: completeSiteSubmit.properties,
              client: completeSiteSubmit.clients,
              submit_stage: completeSiteSubmit.stages,
              // Keep the property_unit_id as a flat field for form initialization
              property_unit_id: completeSiteSubmit.property_unit_id
            };
          }

          if (onDataUpdate) {
            console.log('📤 Calling onDataUpdate with complete data');
            onDataUpdate(finalData);
          }

          setHasChanges(false);
          setLastSavedData(finalData);

          // Trigger refresh of site submit layer to show new pin
          console.log('🔄 Refreshing site_submits layer...');
          safeRefreshLayer('site_submits');

          showToast('Site submit created successfully!', { type: 'success' });

          // Close the slideout after successful creation
          onClose();
        }
      } else {
        console.log(`💾 Saving changes for site submit ${siteSubmit.id}`);
        console.log('📝 Form data being saved:', formData);

        // Validation: require client
        if (!selectedClient?.id) {
          alert('Client is required');
          return;
        }

        // Update existing site submit
        const { data: updatedData, error } = await supabase
          .from('site_submit')
          .update({
            site_submit_name: siteSubmitName,
            client_id: selectedClient.id,
            assignment_id: selectedAssignment?.id || null,
            property_unit_id: selectedPropertyUnit || null,
            date_submitted: formData.dateSubmitted || null,
            delivery_timeframe: formData.deliveryTimeframe || null,
            notes: formData.notes || null,
            customer_comments: formData.customerComments || null,
            updated_at: new Date().toISOString()
            // updated_by_id set automatically by auth.uid() default
          })
          .eq('id', siteSubmit.id)
          .select()
          .single();

        if (error) {
          console.error('❌ Error saving changes:', error);
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
          setLastSavedData(updatedData);

          // Update parent's data so metadata shows immediately
          if (onDataUpdate) {
            onDataUpdate(updatedData);
          }

          // Trigger refresh of site submit layer to show changes immediately
          safeRefreshLayer('site_submits');
        }
      }
    } catch (err) {
      console.error('💥 Failed to save changes:', err);
    }
  };

  // Handle sending site submit email
  const handleSendEmail = async () => {
    if (!siteSubmit?.id || isNewSiteSubmit) {
      showToast('Please save the site submit before sending emails', { type: 'error' });
      return;
    }

    await prepareEmail(siteSubmit.id);
  };

  const handleSendEmailFromComposer = async (emailData: any) => {
    if (!siteSubmit?.id) return;
    await sendEmail(siteSubmit.id, emailData);
  };

  // Tab configuration based on type with modern Lucide icons
  const getAvailableTabs = (): { id: TabType; label: string; icon: React.ReactNode }[] => {
    if (isProperty) {
      return [
        { id: 'property' as TabType, label: 'PROPERTY', icon: <Building2 size={16} /> },
        { id: 'activity' as TabType, label: 'ACTIVITY', icon: <Activity size={16} /> },
        { id: 'units' as TabType, label: 'UNITS', icon: <Grid3x3 size={16} /> },
        { id: 'submits' as TabType, label: 'SUBMITS', icon: <FileText size={16} /> },
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

  // Handle tab click - for site submits, clicking PROPERTY tab opens property sidebar
  const handleTabClick = (tabId: TabType) => {
    console.log('🔘 Tab clicked:', { tabId, isProperty, type, hasCallback: !!onViewPropertyDetails });

    // If it's a site submit and clicking the PROPERTY tab (which has id 'location')
    if (!isProperty && tabId === 'location' && onViewPropertyDetails) {
      const property = siteSubmit?.property || (data as SiteSubmit)?.property;
      console.log('🏢 Property tab clicked, property data:', {
        fromSiteSubmit: !!siteSubmit?.property,
        fromData: !!(data as SiteSubmit)?.property,
        propertyId: property?.id,
        propertyName: property?.property_name
      });

      if (property) {
        console.log('✅ Opening property sidebar for:', property.id);
        onViewPropertyDetails(property);
        return; // Don't switch tabs, open property sidebar instead
      } else {
        console.error('❌ No property data available to open property sidebar');
      }
    }
    // Otherwise, normal tab switching
    setActiveTab(tabId);
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'submit':
        const submitProperty = siteSubmit?.property || (data as SiteSubmit)?.property;
        const isShoppingCenter = submitProperty?.property_record_type?.property_type === 'Shopping Center';

        return (
          <div className="space-y-3">
            {/* Client - Required, at top */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <ClientSelector
                selectedClient={selectedClient}
                onClientSelect={(client) => {
                  setSelectedClient(client);
                  setHasChanges(true);
                }}
                placeholder="Search for client..."
                className="text-sm"
              />
            </div>

            {/* Property Unit - Optional */}
            {submitProperty?.id && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Property Unit (Optional)</label>
                <PropertyUnitSelector
                  key={`property-unit-${siteSubmit?.id || 'new'}-${selectedPropertyUnit}`}
                  value={selectedPropertyUnit}
                  onChange={(value) => {
                    setSelectedPropertyUnit(value);
                    setHasChanges(true);
                  }}
                  propertyId={submitProperty.id}
                  label=""
                />
              </div>
            )}

            {/* Assignment - Optional */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Assignment (Optional)</label>
              <AssignmentSelector
                selectedAssignment={selectedAssignment}
                onAssignmentSelect={(assignment) => {
                  setSelectedAssignment(assignment);
                  setHasChanges(true);
                }}
                onCreateNew={() => setShowAddAssignmentModal(true)}
                placeholder="Search for assignment..."
                limit={5}
                clientId={selectedClient?.id || null}
              />
              {!selectedClient && (
                <p className="mt-1 text-xs text-gray-500">Select a client first to filter assignments</p>
              )}
            </div>

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
                <div className="relative">
                  <input
                    type="date"
                    value={formData.dateSubmitted}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, dateSubmitted: e.target.value }));
                      setHasChanges(true);
                    }}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                  />
                  {formData.dateSubmitted && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({ ...prev, dateSubmitted: '' }));
                        setHasChanges(true);
                      }}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      title="Clear date"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Delivery Timeframe */}
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

            {/* Customer Comments */}
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Customer Comments</label>
              <textarea
                rows={3}
                value={formData.customerComments}
                onChange={(e) => {
                  setFormData(prev => ({ ...prev, customerComments: e.target.value }));
                  setHasChanges(true);
                }}
                placeholder="Enter customer comments..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-transparent "
              />
            </div>

            {/* Submit Site Button - Only show when there are no unsaved changes */}
            {siteSubmit?.id && !hasChanges && (
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

            {/* Record Metadata - Show for existing site submits */}
            {siteSubmit?.id && !isNewSiteSubmit && (
              <RecordMetadata
                createdAt={siteSubmit.created_at}
                createdById={siteSubmit.created_by_id}
                updatedAt={siteSubmit.updated_at}
                updatedById={siteSubmit.updated_by_id}
              />
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
          <div className="text-sm">
            {isProperty ? (
              <>
                {/* Show Dropbox sync error with retry button */}
                {dropboxSyncError && (
                  <div className="mb-4 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <div className="flex-1">
                        <p className="text-xs text-yellow-800 font-medium">Dropbox Sync Warning</p>
                        <p className="text-xs text-yellow-700 mt-1">{dropboxSyncError}</p>
                        <button onClick={handleRetryDropboxSync} className="mt-2 text-xs font-medium text-yellow-800 hover:text-yellow-900 underline">
                          Retry Sync
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Notes Section - Now read-only with link to Activity tab */}
                <div className="mb-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-4 py-2 -mx-4" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                    Notes
                  </h3>
                  <div className="py-2 px-2 -mx-2 bg-[#f0f3f7] rounded">
                    {property?.property_notes ? (
                      <>
                        <span className="text-sm text-gray-500 block mb-1">Property Notes (Legacy)</span>
                        <div className="w-full px-2 py-2 text-sm bg-gray-100 border border-gray-200 rounded text-gray-600 whitespace-pre-wrap">
                          {property.property_notes}
                        </div>
                      </>
                    ) : null}
                    <button
                      onClick={() => setActiveTab('activity')}
                      className="mt-2 flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      <Activity size={14} />
                      {property?.property_notes ? 'View all notes in Activity tab' : 'Add notes in Activity tab'}
                    </button>
                  </div>
                </div>

                {/* Financial Fields - For Shopping Centers */}
                {isShoppingCenterType && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-4 py-2 -mx-4" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                      Pricing Details
                    </h3>
                    <div className="space-y-1">
                      {/* Available Sqft */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 bg-[#f0f3f7] rounded items-center">
                        <span className="text-sm text-gray-500">Available Sqft</span>
                        <PropertySquareFootageField
                          label=""
                          value={property?.available_sqft || null}
                          onChange={(value) => handlePropertyFieldUpdate('available_sqft', value)}
                          compact={true}
                        />
                      </div>

                      {/* Rent PSF */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 rounded items-center">
                        <span className="text-sm text-gray-500">Rent PSF</span>
                        <PropertyPSFField
                          label=""
                          value={property?.rent_psf || null}
                          onChange={(value) => handlePropertyFieldUpdate('rent_psf', value)}
                          compact={true}
                        />
                      </div>

                      {/* NNN PSF */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 bg-[#f0f3f7] rounded items-center">
                        <span className="text-sm text-gray-500">NNN PSF</span>
                        <PropertyPSFField
                          label=""
                          value={property?.nnn_psf || null}
                          onChange={(value) => handlePropertyFieldUpdate('nnn_psf', value)}
                          compact={true}
                        />
                      </div>

                      {/* All-In Rent Calculation */}
                      {property?.rent_psf != null && property?.nnn_psf != null && (
                        <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 rounded items-center">
                          <span className="text-sm text-gray-500">All-In Rent</span>
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              ${(property.rent_psf + property.nnn_psf).toFixed(2)}/sf
                            </span>
                            {property?.available_sqft && (
                              <span className="text-xs text-gray-500 ml-2">
                                (${((property.rent_psf + property.nnn_psf) * property.available_sqft).toLocaleString()}/yr)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Land Fields */}
                {isLandType && (
                  <div className="mb-4">
                    <h3 className="text-xs font-semibold uppercase tracking-wider mb-3 px-4 py-2 -mx-4" style={{ backgroundColor: '#f1f5f9', color: '#475569' }}>
                      Land Information
                    </h3>
                    <div className="space-y-1">
                      {/* Asking Purchase Price */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 bg-[#f0f3f7] rounded items-center">
                        <span className="text-sm text-gray-500">Purchase Price</span>
                        <FormattedField
                          label=""
                          type="currency"
                          value={property?.asking_purchase_price ?? null}
                          onChange={(value) => handlePropertyFieldUpdate('asking_purchase_price', value)}
                        />
                      </div>

                      {/* Asking Ground Lease Price */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 rounded items-center">
                        <span className="text-sm text-gray-500">Ground Lease</span>
                        <FormattedField
                          label=""
                          type="currency"
                          value={property?.asking_lease_price ?? null}
                          onChange={(value) => handlePropertyFieldUpdate('asking_lease_price', value)}
                        />
                      </div>

                      {/* NNN */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 bg-[#f0f3f7] rounded items-center">
                        <span className="text-sm text-gray-500">NNN</span>
                        <FormattedField
                          label=""
                          type="currency"
                          value={property?.nnn_psf ?? null}
                          onChange={(value) => handlePropertyFieldUpdate('nnn_psf', value)}
                        />
                      </div>

                      {/* Acres */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 rounded items-center">
                        <span className="text-sm text-gray-500">Acres</span>
                        <FormattedField
                          label=""
                          type="number"
                          value={property?.acres ?? null}
                          onChange={(value) => handlePropertyFieldUpdate('acres', value)}
                          decimalPlaces={2}
                        />
                      </div>

                      {/* Building Sqft */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 bg-[#f0f3f7] rounded items-center">
                        <span className="text-sm text-gray-500">Building Sqft</span>
                        <input
                          type="number"
                          value={property?.building_sqft || ''}
                          onChange={(e) => handlePropertyFieldUpdate('building_sqft', e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="0"
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>

                      {/* Lease Expiration Date */}
                      <div className="grid grid-cols-[35%_1fr] gap-2 py-2 px-2 -mx-2 rounded items-center">
                        <span className="text-sm text-gray-500">Lease Expiration</span>
                        <input
                          type="text"
                          value={property?.lease_expiration_date || ''}
                          onChange={(e) => handlePropertyFieldUpdate('lease_expiration_date', e.target.value)}
                          placeholder="MM/DD/YYYY"
                          className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Metadata Section */}
                {(property?.created_at || property?.updated_at) && (
                  <div className="pt-4 mt-4 border-t border-gray-200">
                    <div className="space-y-1 text-xs text-gray-500">
                      {property?.updated_at && (
                        <div>
                          <span>Last Updated by </span>
                          <span className="font-medium">{updatedByName || 'Unknown'}</span>
                          <span> {new Date(property.updated_at).toLocaleDateString()} {new Date(property.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      )}
                      {property?.created_at && (
                        <div>
                          <span>Created by </span>
                          <span className="font-medium">{createdByName || 'Unknown'}</span>
                          <span> {new Date(property.created_at).toLocaleDateString()} {new Date(property.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                        </div>
                      )}
                    </div>
                  </div>
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

            {/* Metadata Section for Site Submit */}
            {!isProperty && (siteSubmit?.created_at || siteSubmit?.updated_at) && (
              <div className="pt-4 mt-4 border-t border-gray-200">
                <div className="space-y-1 text-xs text-gray-500">
                  {siteSubmit?.updated_at && (
                    <div>
                      <span>Last Updated by </span>
                      <span className="font-medium">{updatedByName || 'Unknown'}</span>
                      <span> {new Date(siteSubmit.updated_at).toLocaleDateString()} {new Date(siteSubmit.updated_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  )}
                  {siteSubmit?.created_at && (
                    <div>
                      <span>Created by </span>
                      <span className="font-medium">{createdByName || 'Unknown'}</span>
                      <span> {new Date(siteSubmit.created_at).toLocaleDateString()} {new Date(siteSubmit.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );

      case 'activity':
        return (
          <div className="h-full">
            {localPropertyData?.id ? (
              <PropertyActivityTab
                propertyId={localPropertyData.id}
                propertyContacts={[]} // TODO: Pass actual property contacts
                onActivityLogged={() => {}}
                onNoteAdded={() => {}}
              />
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                <p>No property selected</p>
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

            {/* Button to open full property details */}
            {!isProperty && property && onViewPropertyDetails && (
              <div className="pt-4 border-t border-gray-200">
                <button
                  onClick={() => onViewPropertyDetails(property)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md flex items-center justify-center gap-2"
                >
                  <Building2 size={16} />
                  View Full Property Details
                </button>
              </div>
            )}

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

      case 'submits':
        return <SubmitsTabContent propertyId={localPropertyData?.id || ''} onViewSiteSubmitDetails={onViewSiteSubmitDetails} onCreateSiteSubmit={onCreateSiteSubmit} refreshTrigger={submitsRefreshTrigger} />;

      case 'units':
        return (
          <div className="h-full">
            {localPropertyData?.id ? (
              <div className="space-y-3">
                <PropertyUnitsSection
                  propertyId={localPropertyData.id}
                  isEditing={true}
                  isExpanded={true}
                  onToggle={() => {}}
                  onUnitsChange={(units) => {
                    console.log('Units updated:', units);
                    // Optionally refresh property data if needed
                  }}
                />
              </div>
            ) : (
              <div className="flex items-center justify-center h-32 text-gray-500">
                <p>No property selected</p>
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
        className={`fixed top-0 h-full bg-white border-l border-gray-200 shadow-xl transition-all duration-300 z-40 flex flex-col ${
          !isOpen ? 'translate-x-full' : isMinimized ? 'w-12' : 'w-[500px]'
        } ${isMinimized ? 'overflow-hidden' : ''}`}
        style={{
          right: `${rightOffset}px`,
          top: '67px', // Match navbar height
          height: 'calc(100vh - 67px - 20px)', // Add 20px bottom margin to prevent cutoff
          transform: !isOpen ? 'translateX(100%)' : 'translateX(0)',
          touchAction: 'pan-y', // Prevent map scrolling on touch devices
          WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
        }}
      >
        {/* Header Section - Light blue for properties, matching SiteSubmitSidebar style */}
        {isProperty ? (
          <div
            className="flex-shrink-0 px-4 py-3 border-b border-gray-200"
            style={{ backgroundColor: '#60a5fa' }}
          >
            {/* Top row with title and action icons */}
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-semibold text-white truncate">
                  {property?.property_name || 'Unnamed Property'}
                </h2>
              </div>

              {/* Action icon buttons */}
              <div className="flex items-center gap-1 ml-2">
                {/* Open in New Tab Button */}
                {localPropertyData?.id && (
                  <button
                    onClick={() => window.open(`/property/${localPropertyData.id}`, '_blank')}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                    title="Open property in new tab"
                  >
                    <ExternalLink size={16} className="text-white" />
                  </button>
                )}

                {/* Center on Pin Button */}
                {onCenterOnPin && property && (
                  <button
                    onClick={() => {
                      const coords = property.verified_latitude && property.verified_longitude
                        ? { lat: property.verified_latitude, lng: property.verified_longitude }
                        : { lat: property.latitude, lng: property.longitude };
                      if (coords.lat && coords.lng) {
                        onCenterOnPin(coords.lat, coords.lng);
                      }
                    }}
                    className="p-2 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
                    title="Center map on this property"
                  >
                    <MapPin size={16} className="text-white" />
                  </button>
                )}

                {/* Delete Button */}
                {onDeleteProperty && localPropertyData?.id && (
                  <button
                    onClick={() => onDeleteProperty(localPropertyData.id)}
                    className="p-2 rounded-lg bg-red-500 hover:bg-red-600 transition-colors"
                    title="Delete property"
                  >
                    <Trash2 size={16} className="text-white" />
                  </button>
                )}

                {/* Close Button */}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                  aria-label="Close sidebar"
                >
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Address section with inline edit */}
            <div className="mt-2">
              {!isEditingAddress ? (
                <div className="flex items-start gap-2 group">
                  <div className="flex-1">
                    <p className="text-sm text-white/90 truncate">
                      {property?.address || 'No address'}
                      {property?.city && `, ${property.city}`}
                      {property?.state && `, ${property.state}`}
                      {property?.zip && ` ${property.zip}`}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setEditAddressValues({
                        property_name: property?.property_name || '',
                        address: property?.address || '',
                        city: property?.city || '',
                        state: property?.state || '',
                        zip: property?.zip || ''
                      });
                      setIsEditingAddress(true);
                    }}
                    className="p-1 rounded text-white/60 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Edit property name and address"
                  >
                    <Edit3 size={14} />
                  </button>
                </div>
              ) : (
                <div className="space-y-2 bg-white/10 rounded-lg p-2">
                  <input
                    type="text"
                    value={editAddressValues.property_name}
                    onChange={(e) => setEditAddressValues(prev => ({ ...prev, property_name: e.target.value }))}
                    placeholder="Property name..."
                    className="w-full px-2 py-1 text-sm border border-white/30 rounded bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/50 font-medium"
                    autoFocus
                  />
                  <input
                    type="text"
                    value={editAddressValues.address}
                    onChange={(e) => setEditAddressValues(prev => ({ ...prev, address: e.target.value }))}
                    placeholder="Address..."
                    className="w-full px-2 py-1 text-sm border border-white/30 rounded bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/50"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={editAddressValues.city}
                      onChange={(e) => setEditAddressValues(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City..."
                      className="px-2 py-1 text-sm border border-white/30 rounded bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/50"
                    />
                    <input
                      type="text"
                      value={editAddressValues.state}
                      onChange={(e) => setEditAddressValues(prev => ({ ...prev, state: e.target.value }))}
                      placeholder="State..."
                      className="px-2 py-1 text-sm border border-white/30 rounded bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/50"
                    />
                    <input
                      type="text"
                      value={editAddressValues.zip}
                      onChange={(e) => setEditAddressValues(prev => ({ ...prev, zip: e.target.value }))}
                      placeholder="ZIP..."
                      className="px-2 py-1 text-sm border border-white/30 rounded bg-white/20 text-white placeholder-white/50 focus:outline-none focus:ring-1 focus:ring-white/50"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setIsEditingAddress(false)}
                      className="px-2 py-1 text-xs text-white/70 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        handlePropertyFieldUpdate('property_name', editAddressValues.property_name);
                        handlePropertyFieldUpdate('address', editAddressValues.address);
                        handlePropertyFieldUpdate('city', editAddressValues.city);
                        handlePropertyFieldUpdate('state', editAddressValues.state);
                        handlePropertyFieldUpdate('zip', editAddressValues.zip);
                        setIsEditingAddress(false);
                      }}
                      className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 text-white rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Property Record Type Badge */}
            {property && (
              <div className="mt-2 flex items-center gap-2">
                <Building2 size={14} className="text-white/70 flex-shrink-0" />
                {!isEditingPropertyType ? (
                  <div
                    className="inline-flex items-center gap-2 px-2 py-1 bg-white/20 text-white rounded text-xs font-medium cursor-pointer hover:bg-white/30 transition-colors"
                    onClick={() => setIsEditingPropertyType(true)}
                  >
                    <span>
                      {property.property_record_type_id && propertyRecordTypes.length > 0
                        ? propertyRecordTypes.find(type => type.id === property.property_record_type_id)?.label || 'Unknown Type'
                        : 'Set Property Type'
                      }
                    </span>
                    <Edit3 size={12} className="text-white/70" />
                  </div>
                ) : (
                  <select
                    value={property.property_record_type_id || ''}
                    onChange={(e) => {
                      handlePropertyFieldUpdate('property_record_type_id', e.target.value);
                      setIsEditingPropertyType(false);
                    }}
                    className="px-2 py-1 text-xs border border-white/30 rounded bg-white/20 text-white focus:outline-none focus:ring-1 focus:ring-white/50"
                    autoFocus
                    onBlur={() => setIsEditingPropertyType(false)}
                  >
                    <option value="" className="text-gray-900">Select property type...</option>
                    {propertyRecordTypes.map(type => (
                      <option key={type.id} value={type.id} className="text-gray-900">
                        {type.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Original Hero Section for Site Submits (kept for backwards compatibility) */
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
                {/* Open Full Site Submit Button - For site submits */}
                {siteSubmit?.id && !isNewSiteSubmit && onOpenFullSiteSubmit && (
                  <button
                    onClick={() => onOpenFullSiteSubmit(siteSubmit.id)}
                    className="p-2 bg-blue-500 bg-opacity-80 hover:bg-blue-600 hover:bg-opacity-90 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                    title="Open full site submit details"
                  >
                    <ExternalLink size={16} className="text-white" />
                  </button>
                )}

                {/* Submit Site Button - For site submits (opens email composer modal) */}
                {siteSubmit?.id && !isNewSiteSubmit && (
                  <button
                    onClick={handleSendEmail}
                    disabled={sendingEmail}
                    className="p-2 bg-green-500 bg-opacity-80 hover:bg-green-600 hover:bg-opacity-90 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Submit Site - Send email to Site Selector contacts"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-white" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </button>
                )}

                {/* Delete Button - For site submits */}
                {onDeleteSiteSubmit && siteSubmit?.id && (
                  <button
                    onClick={() => {
                      const siteName = siteSubmit.site_submit_name || siteSubmit.client?.client_name || 'this site submit';
                      onDeleteSiteSubmit(siteSubmit.id, siteName);
                    }}
                    className="p-2 bg-red-500 bg-opacity-80 hover:bg-red-600 hover:bg-opacity-90 rounded-lg transition-all duration-200 hover:scale-110 active:scale-95"
                    title="Delete site submit"
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
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M4 12h16" />
                    ) : (
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
                  <svg className="w-5 h-5 text-white transition-transform duration-200 hover:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Entity Type Badge */}
              <div className="absolute top-4 left-4">
                <div className="text-white px-3 py-1 rounded text-xs font-semibold bg-purple-600">
                  SITE SUBMIT
                </div>
              </div>
            </div>

            {/* Site Submit Header Info */}
            {!isMinimized && (
              <div className="px-6 py-3 border-b border-gray-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h1 className="font-bold text-gray-900 mb-1 text-base">
                      {siteSubmitName || siteSubmit?.site_submit_name || siteSubmit?.property?.property_name || 'Site Submit'}
                    </h1>
                    <div className="mb-2 space-y-0.5">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium">Property:</span> {siteSubmit?.property?.property_name || 'Not specified'}
                      </p>
                      {siteSubmit?.property_unit?.property_unit_name && (
                        <p className="text-sm text-gray-600">
                          <span className="font-medium">Unit:</span> {siteSubmit?.property_unit?.property_unit_name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabs - Compact Design with Horizontal Scroll */}
        {!isMinimized && (
        <div className="border-b border-gray-200 bg-white relative">
          <nav className="flex px-2 overflow-x-auto scrollbar-hide scroll-smooth">
            {availableTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabClick(tab.id)}
                className={`relative flex-shrink-0 flex items-center gap-1.5 px-2.5 py-2 text-[11px] font-medium transition-all duration-200 border-b-2 ${
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
                <span className="font-semibold tracking-tight whitespace-nowrap">
                  {tab.label}
                </span>

                {/* Active tab indicator */}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                )}
              </button>
            ))}
          </nav>

          {/* Scroll indicator shadows */}
          <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-white to-transparent pointer-events-none opacity-0 transition-opacity" id="scroll-left-indicator"></div>
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-white to-transparent pointer-events-none opacity-0 transition-opacity" id="scroll-right-indicator"></div>
        </div>
        )}

        {/* Content */}
        {!isMinimized && (
        <div
          className="flex-1 overflow-y-auto px-4 py-3 pb-6"
          style={{
            scrollBehavior: 'smooth',
            minHeight: 0, // Ensures flex-1 works properly with overflow
            touchAction: 'pan-y', // Prevent map scrolling when scrolling slideout on touch devices
            WebkitOverflowScrolling: 'touch', // Smooth scrolling on iOS
            overscrollBehavior: 'contain' // Prevent scroll chaining to map
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

            {/* Site Submit: Show autosave indicator for existing, CREATE button for new */}
            {!isProperty && type === 'site_submit' && (
              <div className="flex flex-col gap-2">
                {/* Autosave indicator for existing site submits */}
                {!isNewSiteSubmit && (
                  <div className="flex items-center justify-center py-2">
                    <AutosaveIndicator status={autosaveStatus} lastSavedAt={lastSavedAt} />
                  </div>
                )}
                {/* CREATE button only for new site submits */}
                {isNewSiteSubmit && (
                  <div className="flex items-center justify-center">
                    <button
                      onClick={handleSaveChanges}
                      className="w-full px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-all duration-200 font-medium text-sm shadow-sm hover:shadow-md"
                    >
                      CREATE SITE SUBMIT
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tertiary Actions - removed VIEW FULL DETAILS button */}
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

      {/* Toast notification */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          visible={toast.visible}
          onClose={() => showToast(null)}
        />
      )}

      {/* Add Assignment Modal */}
      <AddAssignmentModal
        isOpen={showAddAssignmentModal}
        onClose={() => setShowAddAssignmentModal(false)}
        onSave={(newAssignment) => {
          // Convert Assignment to AssignmentSearchResult format
          const assignmentResult: AssignmentSearchResult = {
            id: newAssignment.id,
            assignment_name: newAssignment.assignment_name || 'Unnamed Assignment',
            client_id: newAssignment.client_id,
            client_name: null, // Will be populated if needed
            assignment_value: newAssignment.assignment_value,
            due_date: newAssignment.due_date,
            progress: newAssignment.progress
          };
          setSelectedAssignment(assignmentResult);
          setHasChanges(true);
          setShowAddAssignmentModal(false);
          showToast('Assignment created successfully!', { type: 'success' });
        }}
        preselectedClientId={selectedClient?.id || null}
      />

      {/* Email Composer Modal */}
      {showEmailComposer && (
        <EmailComposerModal
          isOpen={showEmailComposer}
          onClose={() => setShowEmailComposer(false)}
          onSend={handleSendEmailFromComposer}
          defaultSubject={emailDefaultData.subject}
          defaultBody={emailDefaultData.body}
          defaultRecipients={emailDefaultData.recipients}
          isSending={sendingEmail}
        />
      )}
    </>
  );
};

export default PinDetailsSlideout;