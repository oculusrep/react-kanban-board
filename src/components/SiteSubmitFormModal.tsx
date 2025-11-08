import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import PropertySelector from './PropertySelector';
import PropertyUnitSelector from './PropertyUnitSelector';
import EmailComposerModal, { EmailData } from './EmailComposerModal';
import Toast from './Toast';
import { useToast } from '../hooks/useToast';
import { useAutosave } from '../hooks/useAutosave';
import ClientSelector from './mapping/ClientSelector';
import { ClientSearchResult } from '../hooks/useClientSearch';
import { generateSiteSubmitEmailTemplate, PropertyUnitFile } from '../utils/siteSubmitEmailTemplate';
import DropboxService from '../services/dropboxService';
import AutosaveIndicator from './AutosaveIndicator';

type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];
type SiteSubmitInsert = Database['public']['Tables']['site_submit']['Insert'];
type Client = Database['public']['Tables']['client']['Row'];
type SubmitStage = Database['public']['Tables']['submit_stage']['Row'];

interface SiteSubmitFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (siteSubmit: SiteSubmit) => void;
  onUpdate?: (siteSubmit: SiteSubmit) => void;
  siteSubmitId?: string;
  propertyId?: string;
  propertyUnitId?: string;
  assignmentId?: string;
  // Pre-fill coordinates from map pin dropping
  initialLatitude?: number;
  initialLongitude?: number;
}

interface FormData {
  site_submit_name: string;
  client_id: string | null;
  property_id: string | null;
  property_unit_id: string | null;
  assignment_id: string | null;
  submit_stage_id: string | null;
  date_submitted: string;
  loi_written: boolean;
  loi_date: string;
  delivery_date: string;
  delivery_timeframe: string;
  notes: string;
  customer_comments: string;
  competitor_data: string;
  record_type_id: string | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  year_1_rent: number | null;
  ti: number | null;
}

const SiteSubmitFormModal: React.FC<SiteSubmitFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  siteSubmitId,
  propertyId,
  assignmentId,
  propertyUnitId,
  initialLatitude,
  initialLongitude
}) => {
  const [formData, setFormData] = useState<FormData>({
    site_submit_name: '',
    client_id: null,
    property_id: propertyId || null,
    property_unit_id: propertyUnitId || null,
    assignment_id: null,
    submit_stage_id: null,
    date_submitted: new Date().toISOString().split('T')[0],
    loi_written: false,
    loi_date: '',
    delivery_date: '',
    delivery_timeframe: '',
    notes: '',
    customer_comments: '',
    competitor_data: '',
    record_type_id: null,
    verified_latitude: initialLatitude || null,
    verified_longitude: initialLongitude || null,
    year_1_rent: null,
    ti: null,
  });

  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [submitStages, setSubmitStages] = useState<SubmitStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [propertyName, setPropertyName] = useState<string>('');
  const [userEditedName, setUserEditedName] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailDefaultData, setEmailDefaultData] = useState<any>(null);
  const [sendingEmail, setSendingEmail] = useState(false);
  const { toast, showToast, hideToast } = useToast();

  // Determine if this is a new site submit
  const isNewSiteSubmit = !siteSubmitId;

  // Autosave for existing site submits (not for new ones)
  const { status: autosaveStatus, lastSavedAt } = useAutosave({
    data: formData,
    onSave: async (data) => {
      if (isNewSiteSubmit) return; // Don't autosave new records

      const updateData = {
        ...data,
        // Convert empty date strings to null for database compatibility
        date_submitted: data.date_submitted || null,
        loi_date: data.loi_date || null,
        delivery_date: data.delivery_date || null,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('site_submit')
        .update(prepareUpdate(updateData))
        .eq('id', siteSubmitId!);

      if (error) throw error;
      console.log('✅ Site submit autosaved in modal');
    },
    delay: 1500,
    enabled: !isNewSiteSubmit && !loading && isOpen, // Only enable for existing records when modal is open
  });

  // Load dropdown data and existing site submit if editing
  useEffect(() => {
    const loadData = async () => {
      console.log('🔍 SiteSubmitFormModal loadData - isOpen:', isOpen, 'siteSubmitId:', siteSubmitId);
      setLoading(true);
      try {
        // Load submit stages only (clients loaded via ClientSelector)
        const { data: stagesData } = await supabase
          .from('submit_stage')
          .select('*')
          .order('name');

        if (stagesData) setSubmitStages(stagesData);

        // Load property name for auto-generation
        if (propertyId) {
          const { data: propertyData } = await supabase
            .from('property')
            .select('property_name')
            .eq('id', propertyId)
            .single();

          if (propertyData?.property_name) {
            setPropertyName(propertyData.property_name);
          }
        }

        // Load assignment data for auto-population when creating from assignment
        if (assignmentId && !siteSubmitId) {
          const { data: assignmentData } = await supabase
            .from('assignment')
            .select(`
              client_id,
              deal_id,
              client!assignment_client_id_fkey (
                id,
                client_name,
                phone
              )
            `)
            .eq('id', assignmentId)
            .single();

          if (assignmentData) {
            setFormData(prev => ({
              ...prev,
              client_id: assignmentData.client_id,
              assignment_id: assignmentId,
            }));

            // Set selected client for ClientSelector
            if (assignmentData.client) {
              setSelectedClient({
                id: assignmentData.client.id,
                client_name: assignmentData.client.client_name,
                phone: assignmentData.client.phone,
                site_submit_count: 0
              });
            }
          }
        }

        // Load existing site submit if editing
        if (siteSubmitId) {
          console.log('📥 Loading site submit data for ID:', siteSubmitId);
          const { data: siteSubmitData, error } = await supabase
            .from('site_submit')
            .select(`
              *,
              client!site_submit_client_id_fkey (
                id,
                client_name,
                phone
              )
            `)
            .eq('id', siteSubmitId)
            .single();

          if (error) {
            console.error('❌ Error loading site submit:', error);
          } else if (siteSubmitData) {
            console.log('✅ Loaded site submit data:', siteSubmitData);
            console.log('💬 customer_comments value:', siteSubmitData.customer_comments);
            setFormData({
              site_submit_name: siteSubmitData.site_submit_name || '',
              client_id: siteSubmitData.client_id,
              property_id: siteSubmitData.property_id,
              property_unit_id: siteSubmitData.property_unit_id,
              assignment_id: siteSubmitData.assignment_id,
              submit_stage_id: siteSubmitData.submit_stage_id,
              date_submitted: siteSubmitData.date_submitted?.split('T')[0] || new Date().toISOString().split('T')[0],
              loi_written: siteSubmitData.loi_written || false,
              loi_date: siteSubmitData.loi_date?.split('T')[0] || '',
              delivery_date: siteSubmitData.delivery_date?.split('T')[0] || '',
              delivery_timeframe: siteSubmitData.delivery_timeframe || '',
              notes: siteSubmitData.notes || '',
              customer_comments: siteSubmitData.customer_comments || '',
              competitor_data: siteSubmitData.competitor_data || '',
              record_type_id: siteSubmitData.record_type_id,
              verified_latitude: siteSubmitData.verified_latitude,
              verified_longitude: siteSubmitData.verified_longitude,
              year_1_rent: siteSubmitData.year_1_rent,
              ti: siteSubmitData.ti,
            });

            // Set selected client for ClientSelector
            if (siteSubmitData.client) {
              setSelectedClient({
                id: siteSubmitData.client.id,
                client_name: siteSubmitData.client.client_name,
                phone: siteSubmitData.client.phone,
                site_submit_count: 0 // Not needed for editing
              });
            }

            // Mark as user edited since we're loading an existing name
            setUserEditedName(true);
          }
        }
      } catch (error) {
        console.error('Error loading form data:', error);
      } finally {
        setLoading(false);
      }
    };

    if (isOpen) {
      loadData();
    }
  }, [isOpen, siteSubmitId, assignmentId]);

  // Reset form when modal closes or siteSubmitId changes
  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setFormData({
        site_submit_name: '',
        client_id: null,
        property_id: propertyId || null,
        property_unit_id: propertyUnitId || null,
        assignment_id: assignmentId || null,
        submit_stage_id: null,
        date_submitted: new Date().toISOString().split('T')[0],
        loi_written: false,
        loi_date: '',
        delivery_date: '',
        delivery_timeframe: '',
        notes: '',
        customer_comments: '',
        competitor_data: '',
        record_type_id: null,
        verified_latitude: initialLatitude || null,
        verified_longitude: initialLongitude || null,
        year_1_rent: null,
        ti: null,
      });
      setErrors({});
      setUserEditedName(false); // Reset name editing flag
      setPropertyName('');
      setSelectedClient(null); // Reset selected client
    }
  }, [isOpen, propertyId, propertyUnitId, initialLatitude, initialLongitude]);

  // Handler for client selection
  const handleClientSelect = (client: ClientSearchResult | null) => {
    setSelectedClient(client);
    const clientId = client?.id || null;
    setFormData(prev => ({ ...prev, client_id: clientId }));

    if (errors.client_id) {
      setErrors(prev => ({ ...prev, client_id: '' }));
    }

    // Auto-generate site submit name when client changes (only if user hasn't manually edited it)
    if (!userEditedName && propertyName && client) {
      const autoName = `${client.client_name} - ${propertyName}`;
      setFormData(prev => ({ ...prev, site_submit_name: autoName }));
    }
  };

  // Auto-generate site submit name from client and property
  const generateSiteSubmitName = (clientName: string | null, propName: string): string => {
    if (!clientName || !propName) return '';
    return `${clientName} - ${propName}`;
  };

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-generate site submit name when property changes (only if user hasn't manually edited it)
    if (field === 'property_id' && !userEditedName && selectedClient) {
      // We need to fetch the new property name
      if (value) {
        supabase.from('property')
          .select('property_name')
          .eq('id', value)
          .single()
          .then(({ data }) => {
            if (data?.property_name) {
              setPropertyName(data.property_name);
              const autoName = generateSiteSubmitName(selectedClient.client_name, data.property_name);
              if (autoName) {
                setFormData(prev => ({ ...prev, site_submit_name: autoName }));
              }
            }
          });
      }
    }

    // Track if user manually edits the site submit name
    if (field === 'site_submit_name') {
      setUserEditedName(true);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.site_submit_name?.trim()) {
      newErrors.site_submit_name = 'Site submit name is required';
    }
    if (!formData.client_id) {
      newErrors.client_id = 'Client selection is required';
    }
    // Property is required unless we're creating from an assignment
    if (!formData.property_id && !assignmentId) {
      newErrors.property_id = 'Property selection is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (siteSubmitId) {
        // Update existing site submit - convert empty date strings to null
        const updateData = {
          ...formData,
          // Convert empty date strings to null for database compatibility
          date_submitted: formData.date_submitted || null,
          loi_date: formData.loi_date || null,
          delivery_date: formData.delivery_date || null,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('site_submit')
          .update(prepareUpdate(updateData))
          .eq('id', siteSubmitId)
          .select(`
            *,
            submit_stage!site_submit_submit_stage_id_fkey (
              name
            ),
            client!client_id (
              client_name
            )
          `)
          .single();

        if (error) throw error;
        onUpdate?.(data);
      } else {
        // Create new site submit - convert empty date strings to null
        const submitData: SiteSubmitInsert = {
          ...formData,
          // Convert empty date strings to null for database compatibility
          date_submitted: formData.date_submitted || null,
          loi_date: formData.loi_date || null,
          delivery_date: formData.delivery_date || null,
          // sf_id is legacy field - will be null for new site submits
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log('About to insert site submit data:', submitData);
        console.log('Form validation passed. FormData:', formData);

        const { data, error } = await supabase
          .from('site_submit')
          .insert(prepareInsert(submitData))
          .select(`
            *,
            submit_stage!site_submit_submit_stage_id_fkey (
              name
            ),
            client!client_id (
              client_name
            )
          `)
          .single();

        if (error) throw error;
        onSave?.(data);
      }

      onClose();

    } catch (error) {
      console.error('Error saving site submit:', error);
      console.error('Full error object:', JSON.stringify(error, null, 2));
      // Log more detailed error information
      if (error instanceof Error) {
        console.error('Error message:', error.message);
      }
      console.log('Attempted to save data:', siteSubmitId ? 'UPDATE' : 'CREATE');
      console.log('Form data:', formData);
      
      // TODO: Add toast notification for user feedback
      alert(`Error saving site submit: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitSite = async () => {
    if (!siteSubmitId) {
      alert('Please save the site submit before sending emails');
      return;
    }

    try {
      // Fetch site submit data with all required fields for email template
      const { data: siteSubmitData, error: siteSubmitError } = await supabase
        .from('site_submit')
        .select(`
          *,
          client:client_id (id, client_name),
          property:property_id (
            id, property_name, address, city, state, zip,
            trade_area, map_link, latitude, longitude,
            verified_latitude, verified_longitude,
            available_sqft, acres, building_sqft,
            rent_psf, asking_lease_price, asking_purchase_price, nnn_psf,
            marketing_materials, site_plan, demographics,
            traffic_count, traffic_count_2nd, total_traffic,
            1_mile_pop, 3_mile_pop, hh_income_median_3_mile
          ),
          property_unit:property_unit_id (
            id, property_unit_name, sqft, rent, nnn
          )
        `)
        .eq('id', siteSubmitId)
        .single();

      if (siteSubmitError) throw siteSubmitError;
      if (!siteSubmitData) throw new Error('Site submit not found');

      // Fetch Site Selector contacts using new role system
      const { data: contactRoles, error: contactsError } = await supabase
        .from('contact_client_role')
        .select(`
          contact:contact_id (
            id,
            first_name,
            last_name,
            email
          ),
          role:role_id (
            role_name
          )
        `)
        .eq('client_id', siteSubmitData.client_id)
        .eq('is_active', true);

      if (contactsError) throw contactsError;

      // Filter for Site Selector role and contacts with email addresses
      const contacts = contactRoles
        ?.filter((item: any) =>
          item.role?.role_name === 'Site Selector' &&
          item.contact?.email
        )
        .map((item: any) => item.contact)
        || [];

      // Deduplicate contacts by email (in case a contact has multiple associations)
      const uniqueContacts = Array.from(
        new Map(contacts.map((c: any) => [c.email, c])).values()
      );

      if (uniqueContacts.length === 0) {
        alert('No Site Selector contacts found for this client with email addresses');
        return;
      }

      // Fetch user data for signature
      const { data: { session } } = await supabase.auth.getSession();
      let userData = null;

      if (session?.user?.id) {
        const { data } = await supabase
          .from('user')
          .select('first_name, last_name, email, mobile_phone')
          .eq('id', session.user.id)
          .single();
        userData = data;
      }

      // Fetch property unit files if property_unit_id exists
      let propertyUnitFiles: PropertyUnitFile[] = [];
      if (siteSubmitData.property_unit_id) {
        try {
          const { data: dropboxMapping } = await supabase
            .from('dropbox_mapping')
            .select('dropbox_folder_path')
            .eq('entity_type', 'property_unit')
            .eq('entity_id', siteSubmitData.property_unit_id)
            .single();

          if (dropboxMapping?.dropbox_folder_path) {
            // Initialize Dropbox service
            const dropboxService = new DropboxService(
              import.meta.env.VITE_DROPBOX_ACCESS_TOKEN || '',
              import.meta.env.VITE_DROPBOX_REFRESH_TOKEN || '',
              import.meta.env.VITE_DROPBOX_APP_KEY || '',
              import.meta.env.VITE_DROPBOX_APP_SECRET || ''
            );

            // Fetch files from the folder
            const files = await dropboxService.listFolderContents(dropboxMapping.dropbox_folder_path);

            // Filter to only include files (not folders) and generate shared links
            const filePromises = files
              .filter(file => file.type === 'file')
              .map(async (file) => {
                try {
                  const sharedLink = await dropboxService.getSharedLink(file.path);
                  return {
                    name: file.name,
                    sharedLink: sharedLink
                  };
                } catch (error) {
                  console.error(`Failed to get shared link for ${file.name}:`, error);
                  return null;
                }
              });

            const filesWithLinks = await Promise.all(filePromises);
            propertyUnitFiles = filesWithLinks.filter((file): file is PropertyUnitFile => file !== null);
          }
        } catch (error) {
          console.error('Error fetching property unit files:', error);
          // Continue with empty array if there's an error
        }
      }

      // Generate email template
      const defaultSubject = `New site for Review – ${siteSubmitData.property?.property_name || 'Untitled'} – ${siteSubmitData.client?.client_name || 'N/A'}`;
      const defaultBody = generateEmailTemplate(siteSubmitData, uniqueContacts, userData, propertyUnitFiles);

      setEmailDefaultData({
        subject: defaultSubject,
        body: defaultBody,
        recipients: uniqueContacts,
      });
      setShowEmailComposer(true);
    } catch (error) {
      console.error('Error preparing email:', error);
      alert(`Error preparing email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const generateEmailTemplate = (siteSubmit: any, contacts: any[], userData: any, propertyUnitFiles: PropertyUnitFile[] = []): string => {
    return generateSiteSubmitEmailTemplate({
      siteSubmit,
      property: siteSubmit.property,
      propertyUnit: siteSubmit.property_unit,
      contacts,
      userData,
      propertyUnitFiles,
    });
  };

  const handleSendEmailFromComposer = async (emailData: EmailData) => {
    setSendingEmail(true);
    try {
      const { data: { session, user } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      const { data: userData } = await supabase
        .from('user')
        .select('email')
        .eq('id', user?.id)
        .single();

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-site-submit-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            siteSubmitId,
            customEmail: emailData,
            submitterEmail: userData?.email || user?.email
          }),
        }
      );

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.message || 'Failed to send email');
      }

      // Close email composer immediately but keep parent modal open for toast
      setShowEmailComposer(false);
      showToast(`Successfully sent ${result.emailsSent} email(s)`, { type: 'success' });
    } catch (error) {
      console.error('Error sending email:', error);
      showToast(`Error sending email: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
      throw error;
    } finally {
      setSendingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />
      
      {/* Modal */}
      <div className={`fixed inset-0 lg:inset-y-0 lg:right-0 lg:left-auto w-full lg:w-[700px] bg-white shadow-xl transform transition-transform duration-300 z-[60] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } flex flex-col`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-gray-900">
              {siteSubmitId ? 'Edit Site Submit' : 'New Site Submit'}
            </h2>
            {/* Autosave indicator - only show for existing records */}
            {!isNewSiteSubmit && (
              <AutosaveIndicator status={autosaveStatus} lastSavedAt={lastSavedAt} />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Basic Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Basic Information
                </h3>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Site Submit Name *
                  </label>
                  <input
                    type="text"
                    value={formData.site_submit_name}
                    onChange={(e) => updateFormData('site_submit_name', e.target.value)}
                    className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                      errors.site_submit_name ? 'border-red-300' : ''
                    }`}
                    placeholder="Enter site submit name"
                  />
                  {errors.site_submit_name && (
                    <p className="mt-1 text-sm text-red-600">{errors.site_submit_name}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Client *
                  </label>
                  <ClientSelector
                    selectedClient={selectedClient}
                    onClientSelect={handleClientSelect}
                    placeholder="Search for active clients..."
                    className={errors.client_id ? 'border-red-300' : ''}
                  />
                  {errors.client_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.client_id}</p>
                  )}
                </div>

                {formData.property_id && (
                  <PropertyUnitSelector
                    propertyId={formData.property_id}
                    value={formData.property_unit_id}
                    onChange={(value) => updateFormData('property_unit_id', value)}
                    label="Property Unit (Optional)"
                  />
                )}

                <PropertySelector
                  value={formData.property_id}
                  onChange={(value) => updateFormData('property_id', value)}
                  label="Property *"
                />
                {errors.property_id && (
                  <p className="mt-1 text-sm text-red-600">{errors.property_id}</p>
                )}
              </div>

              {/* Submission Details Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Submission Details
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Submit Stage
                  </label>
                  <select
                    value={formData.submit_stage_id || ''}
                    onChange={(e) => updateFormData('submit_stage_id', e.target.value || null)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  >
                    <option value="">Select stage...</option>
                    {submitStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Date Submitted
                  </label>
                  <input
                    type="date"
                    value={formData.date_submitted}
                    onChange={(e) => updateFormData('date_submitted', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    id="loi_written"
                    checked={formData.loi_written}
                    onChange={(e) => updateFormData('loi_written', e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="loi_written" className="text-sm font-medium text-gray-700">
                    LOI Written
                  </label>
                </div>

                {formData.loi_written && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      LOI Date
                    </label>
                    <input
                      type="date"
                      value={formData.loi_date}
                      onChange={(e) => updateFormData('loi_date', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Date
                  </label>
                  <input
                    type="date"
                    value={formData.delivery_date}
                    onChange={(e) => updateFormData('delivery_date', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Delivery Timeframe
                  </label>
                  <input
                    type="text"
                    value={formData.delivery_timeframe}
                    onChange={(e) => updateFormData('delivery_timeframe', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="e.g., 30-60 days, Q1 2024"
                  />
                </div>
              </div>

              {/* Financial Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Financial Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Year 1 Rent ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.year_1_rent || ''}
                      onChange={(e) => updateFormData('year_1_rent', e.target.value ? parseFloat(e.target.value) : null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      TI ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.ti || ''}
                      onChange={(e) => updateFormData('ti', e.target.value ? parseFloat(e.target.value) : null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>

              {/* Location Information Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Location Verification
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Verified Latitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.verified_latitude || ''}
                      onChange={(e) => updateFormData('verified_latitude', e.target.value ? parseFloat(e.target.value) : null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="e.g., 40.7128"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Verified Longitude
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={formData.verified_longitude || ''}
                      onChange={(e) => updateFormData('verified_longitude', e.target.value ? parseFloat(e.target.value) : null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="e.g., -74.0060"
                    />
                  </div>
                </div>
              </div>

              {/* Notes and Comments Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                  Notes & Comments
                </h3>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notes
                  </label>
                  <textarea
                    rows={3}
                    value={formData.notes}
                    onChange={(e) => updateFormData('notes', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="Internal notes..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer Comments
                  </label>
                  <textarea
                    rows={3}
                    value={formData.customer_comments}
                    onChange={(e) => updateFormData('customer_comments', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="Customer feedback or requirements..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Competitor Data
                  </label>
                  <textarea
                    rows={3}
                    value={formData.competitor_data}
                    onChange={(e) => updateFormData('competitor_data', e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    placeholder="Competitive landscape information..."
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex justify-between items-center">
            {/* Submit Site button on the left (only for existing site submits) */}
            <div>
              {siteSubmitId && (
                <button
                  type="button"
                  onClick={handleSubmitSite}
                  disabled={saving || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 flex items-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                    <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                  </svg>
                  Submit Site
                </button>
              )}
            </div>

            {/* Cancel and Save buttons on the right */}
            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                Cancel
              </button>
              {/* Only show Save button for new records */}
              {isNewSiteSubmit && (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Create Site Submit'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email Composer Modal */}
      {showEmailComposer && emailDefaultData && (
        <EmailComposerModal
          isOpen={showEmailComposer}
          onClose={() => setShowEmailComposer(false)}
          onSend={handleSendEmailFromComposer}
          defaultSubject={emailDefaultData.subject}
          defaultBody={emailDefaultData.body}
          defaultRecipients={emailDefaultData.recipients || []}
          siteSubmitName={formData.site_submit_name || 'Untitled'}
        />
      )}

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
        onClose={hideToast}
      />
    </>
  );
};

export default SiteSubmitFormModal;