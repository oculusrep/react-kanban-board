import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { Database } from '../../database-schema';
import PropertySelector from '../components/PropertySelector';
import PropertyUnitSelector from '../components/PropertyUnitSelector';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import EmailComposerModal from '../components/EmailComposerModal';
import { useToast } from '../hooks/useToast';
import { useRecentlyViewed } from '../hooks/useRecentlyViewed';
import { useAutosave } from '../hooks/useAutosave';
import ClientSelector from '../components/mapping/ClientSelector';
import { ClientSearchResult } from '../hooks/useClientSearch';
import AssignmentSelector from '../components/mapping/AssignmentSelector';
import { AssignmentSearchResult } from '../hooks/useAssignmentSearch';
import AddAssignmentModal from '../components/AddAssignmentModal';
import AutosaveIndicator from '../components/AutosaveIndicator';
import { useSiteSubmitEmail } from '../hooks/useSiteSubmitEmail';
import RecordMetadata from '../components/RecordMetadata';
import ConvertSiteSubmitToDealModal from '../components/ConvertSiteSubmitToDealModal';

type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];
type SiteSubmitInsert = Database['public']['Tables']['site_submit']['Insert'];
type Client = Database['public']['Tables']['client']['Row'];
type SubmitStage = Database['public']['Tables']['submit_stage']['Row'];

interface FormData {
  site_submit_name: string;
  client_id: string | null;
  property_id: string | null;
  property_unit_id: string | null;
  assignment_id: string | null;
  deal_id: string | null;
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

const SiteSubmitDetailsPage: React.FC = () => {
  const { siteSubmitId } = useParams<{ siteSubmitId: string }>();
  const navigate = useNavigate();
  const isNewSiteSubmit = siteSubmitId === 'new';
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const { toast, showToast } = useToast();
  const { addRecentItem } = useRecentlyViewed();

  // Check if we're in an iframe (sidebar view)
  const isInIframe = window.self !== window.top;

  const [formData, setFormData] = useState<FormData>({
    site_submit_name: '',
    client_id: null,
    property_id: null,
    property_unit_id: null,
    assignment_id: null,
    deal_id: null,
    submit_stage_id: null,
    date_submitted: '',
    loi_written: false,
    loi_date: '',
    delivery_date: '',
    delivery_timeframe: '',
    notes: '',
    customer_comments: '',
    competitor_data: '',
    record_type_id: null,
    verified_latitude: null,
    verified_longitude: null,
    year_1_rent: null,
    ti: null,
  });

  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSearchResult | null>(null);
  const [dealName, setDealName] = useState<string | null>(null);
  const [showAddAssignmentModal, setShowAddAssignmentModal] = useState(false);
  const [showConvertToDealModal, setShowConvertToDealModal] = useState(false);
  const [siteSubmitCode, setSiteSubmitCode] = useState<string>('');
  const [submitStages, setSubmitStages] = useState<SubmitStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [propertyName, setPropertyName] = useState<string>('');
  const [propertyDetails, setPropertyDetails] = useState<{
    available_sqft?: number | null;
    rent_psf?: number | null;
    nnn_psf?: number | null;
  } | null>(null);
  const [unitDetails, setUnitDetails] = useState<{
    sqft?: number | null;
    rent?: number | null;
    nnn?: number | null;
  } | null>(null);
  const [userEditedName, setUserEditedName] = useState(false);

  // State for metadata display
  const [siteSubmitMetadata, setSiteSubmitMetadata] = useState<{
    created_at?: string;
    created_by_id?: string;
    updated_at?: string;
    updated_by_id?: string;
    email_sent_at?: string;
    email_sent_by_id?: string;
  } | null>(null);

  // Email composer hook for site submit emails
  const {
    showEmailComposer,
    setShowEmailComposer,
    sendingEmail,
    emailDefaultData,
    prepareEmail,
    sendEmail,
  } = useSiteSubmitEmail({ showToast });

  // Collapsible section states
  const [isFinancialExpanded, setIsFinancialExpanded] = useState(false);
  const [isLocationExpanded, setIsLocationExpanded] = useState(false);

  // Autosave for existing site submits (not for new ones)
  const { status: autosaveStatus, lastSavedAt } = useAutosave({
    data: formData,
    onSave: async (data) => {
      if (!siteSubmitId || isNewSiteSubmit) return; // Don't autosave new records
      if (!validateForm()) return; // Don't save invalid data

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
        .eq('id', siteSubmitId);

      if (error) throw error;
    },
    delay: 1500,
    enabled: !isNewSiteSubmit && !loading, // Only enable for existing records
  });

  // Handle viewing property details - post message to parent if in iframe
  const handleViewPropertyDetails = (propertyId: string) => {
    if (isInIframe) {
      // Send message to parent window to open property slideout
      window.parent.postMessage({
        type: 'OPEN_PROPERTY_SLIDEOUT',
        propertyId: propertyId
      }, '*');
    } else {
      // Navigate normally
      navigate(`/property/${propertyId}`);
    }
  };

  // Handle verify location - open map with site submit verification
  const handleVerifyLocation = () => {
    const mapUrl = `/mapping?site-submit=${siteSubmitId}&verify=true`;

    if (isInIframe) {
      // If in iframe (slideout), open in parent window's new tab
      window.parent.open(mapUrl, '_blank');
    } else {
      // If standalone page, open normally
      window.open(mapUrl, '_blank');
    }
  };

  // Fetch property details when property changes
  useEffect(() => {
    if (formData.property_id) {
      supabase
        .from('property')
        .select('available_sqft, rent_psf, nnn_psf')
        .eq('id', formData.property_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setPropertyDetails(data);
          }
        });
    } else {
      setPropertyDetails(null);
    }
  }, [formData.property_id]);

  // Fetch unit details when unit changes
  useEffect(() => {
    if (formData.property_unit_id) {
      supabase
        .from('property_unit')
        .select('sqft, rent, nnn')
        .eq('id', formData.property_unit_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setUnitDetails(data);
          }
        });
    } else {
      setUnitDetails(null);
    }
  }, [formData.property_unit_id]);

  // Set page title
  useEffect(() => {
    if (isNewSiteSubmit) {
      document.title = "New Site Submit | OVIS";
    } else if (formData.site_submit_name) {
      document.title = `${formData.site_submit_name} | OVIS`;
    } else {
      document.title = "Site Submit | OVIS";
    }
  }, [formData.site_submit_name, isNewSiteSubmit]);

  // Load dropdown data and existing site submit if editing
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load submit stages (clients loaded via ClientSelector)
        const { data: stagesData } = await supabase
          .from('submit_stage')
          .select('*')
          .order('name');

        if (stagesData) setSubmitStages(stagesData);

        // Load existing site submit if editing
        if (siteSubmitId && !isNewSiteSubmit) {
          const { data: siteSubmitData, error } = await supabase
            .from('site_submit')
            .select(`
              *,
              client!site_submit_client_id_fkey (
                id,
                client_name,
                phone
              ),
              property!site_submit_property_id_fkey (
                id,
                property_name
              )
            `)
            .eq('id', siteSubmitId)
            .single();

          if (error) {
            console.error('Error loading site submit:', error);
          } else if (siteSubmitData) {
            console.log('📥 Loaded site submit data:', siteSubmitData);
            console.log('📅 date_submitted value:', siteSubmitData.date_submitted);
            console.log('📋 assignment_id from database:', siteSubmitData.assignment_id);

            // Store metadata for display
            setSiteSubmitMetadata({
              created_at: siteSubmitData.created_at,
              created_by_id: siteSubmitData.created_by_id,
              updated_at: siteSubmitData.updated_at,
              updated_by_id: siteSubmitData.updated_by_id,
              email_sent_at: (siteSubmitData as any).email_sent_at,
              email_sent_by_id: (siteSubmitData as any).email_sent_by_id
            });

            // Store site submit code for convert to deal modal
            setSiteSubmitCode(siteSubmitData.code || '');

            setFormData({
              site_submit_name: siteSubmitData.site_submit_name || '',
              client_id: siteSubmitData.client_id,
              property_id: siteSubmitData.property_id,
              property_unit_id: siteSubmitData.property_unit_id,
              assignment_id: siteSubmitData.assignment_id,
              submit_stage_id: siteSubmitData.submit_stage_id,
              date_submitted: siteSubmitData.date_submitted?.split('T')[0] || '',
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

            // Load assignment if present
            if (siteSubmitData.assignment_id) {
              console.log('📋 Loading assignment for site submit:', siteSubmitData.assignment_id);
              supabase
                .from('assignment')
                .select('id, assignment_name, client_id, assignment_value, due_date, progress')
                .eq('id', siteSubmitData.assignment_id)
                .single()
                .then(({ data: assignmentData, error: assignmentError }) => {
                  if (assignmentError) {
                    console.error('❌ Error loading assignment:', assignmentError);
                  } else if (assignmentData) {
                    console.log('✅ Loaded assignment data:', assignmentData);
                    setSelectedAssignment({
                      id: assignmentData.id,
                      assignment_name: assignmentData.assignment_name || 'Unnamed Assignment',
                      client_id: assignmentData.client_id,
                      client_name: null,
                      assignment_value: assignmentData.assignment_value,
                      due_date: assignmentData.due_date,
                      progress: assignmentData.progress
                    });
                  } else {
                    console.warn('⚠️ No assignment data found for ID:', siteSubmitData.assignment_id);
                  }
                });
            } else {
              console.log('ℹ️ No assignment_id in site submit data');
            }

            // Load deal if present
            if (siteSubmitData.deal_id) {
              console.log('🤝 Loading deal for site submit:', siteSubmitData.deal_id);
              supabase
                .from('deal')
                .select('id, deal_name')
                .eq('id', siteSubmitData.deal_id)
                .single()
                .then(({ data: dealData, error: dealError }) => {
                  if (dealError) {
                    console.error('❌ Error loading deal:', dealError);
                  } else if (dealData) {
                    console.log('✅ Loaded deal data:', dealData);
                    setDealName(dealData.deal_name);
                  }
                });
            }

            // Load property name for auto-generation
            if (siteSubmitData.property?.property_name) {
              setPropertyName(siteSubmitData.property.property_name);
            }

            // Mark as user edited since we're loading an existing name
            setUserEditedName(true);

            // Track recently viewed
            addRecentItem({
              id: siteSubmitData.id,
              name: siteSubmitData.site_submit_name || 'Untitled Site Submit',
              type: 'site_submit',
              path: `/site-submit/${siteSubmitData.id}`
            });
          }
        }
      } catch (error) {
        console.error('Error loading form data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [siteSubmitId, isNewSiteSubmit, addRecentItem]);

  // Handler for client selection
  const handleClientSelect = (client: ClientSearchResult | null) => {
    setSelectedClient(client);
    const clientId = client?.id || null;
    setFormData(prev => ({ ...prev, client_id: clientId }));

    if (errors.client_id) {
      setErrors(prev => ({ ...prev, client_id: '' }));
    }

    // Auto-generate site submit name when client changes if we have a property
    if (propertyName && client) {
      const autoName = `${client.client_name} - ${propertyName}`;
      setFormData(prev => ({ ...prev, site_submit_name: autoName }));
      // Reset the edited flag since we're auto-generating
      setUserEditedName(false);
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

    // Auto-generate site submit name when property changes if we have a client
    if (field === 'property_id' && selectedClient) {
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
                // Reset the edited flag since we're auto-generating
                setUserEditedName(false);
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
    if (!formData.property_id) {
      newErrors.property_id = 'Property selection is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (siteSubmitId && !isNewSiteSubmit) {
        // Update existing site submit - convert empty date strings to null
        const updateData = {
          ...formData,
          // Convert empty date strings to null for database compatibility
          date_submitted: formData.date_submitted || null,
          loi_date: formData.loi_date || null,
          delivery_date: formData.delivery_date || null,
          updated_at: new Date().toISOString(),
        };

        console.log('💾 Saving site submit with assignment_id:', updateData.assignment_id);

        const { data, error } = await supabase
          .from('site_submit')
          .update(prepareUpdate(updateData))
          .eq('id', siteSubmitId)
          .select()
          .single();

        if (error) throw error;
        console.log('✅ Site submit saved successfully with assignment:', data?.assignment_id);
      } else {
        // Create new site submit - convert empty date strings to null
        const submitData: SiteSubmitInsert = {
          ...formData,
          // Convert empty date strings to null for database compatibility
          date_submitted: formData.date_submitted || null,
          loi_date: formData.loi_date || null,
          delivery_date: formData.delivery_date || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log('💾 Creating new site submit with assignment_id:', submitData.assignment_id);

        const { data, error } = await supabase
          .from('site_submit')
          .insert(prepareInsert(submitData))
          .select()
          .single();

        if (error) throw error;

        console.log('✅ New site submit created successfully with assignment:', data?.assignment_id);

        // Navigate to the new site submit's detail page
        if (data) {
          navigate(`/site-submit/${data.id}`, { replace: true });
        }
      }

      // Show success message
      showToast('Site submit saved successfully!', { type: 'success' });

    } catch (error) {
      console.error('Error saving site submit:', error);
      showToast(`Error saving site submit: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (!siteSubmitId || isNewSiteSubmit) return;
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    setShowDeleteConfirm(false);

    try {
      const { error } = await supabase
        .from('site_submit')
        .delete()
        .eq('id', siteSubmitId);

      if (error) throw error;

      showToast('Site submit deleted successfully!', { type: 'success' });

      // Navigate after a brief delay to show the toast
      setTimeout(() => {
        navigate('/master-pipeline');
      }, 1000);
    } catch (error) {
      console.error('Error deleting site submit:', error);
      showToast(`Error deleting site submit: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
    }
  };

  const handleSendEmail = async () => {
    if (!siteSubmitId || isNewSiteSubmit) {
      showToast('Please save the site submit before sending emails', { type: 'error' });
      return;
    }

    await prepareEmail(siteSubmitId);
  };

  const handleSendEmailFromComposer = async (emailData: any) => {
    if (!siteSubmitId) return;
    await sendEmail(siteSubmitId, emailData);
  };

  const generateEmailTemplate = (siteSubmit: any, contacts: any[], userData: any, propertyUnitFiles: any[] = [], signatureHtml?: string): string => {
    return generateSiteSubmitEmailTemplate({
      siteSubmit,
      siteSubmitId: siteSubmit.id,
      property: siteSubmit.property,
      propertyUnit: siteSubmit.property_unit,
      contacts,
      userData,
      propertyUnitFiles,
      portalBaseUrl: window.location.origin,
      userSignatureHtml: signatureHtml,
    });
  };

  return (
    <div className={isInIframe ? "min-h-screen bg-white" : "min-h-screen bg-gray-50"}>
      <div className={isInIframe ? "py-4 px-4" : "max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8"}>
        {/* Header */}
        <div className={isInIframe ? "mb-4" : "bg-white shadow rounded-lg mb-6"}>
          <div className={isInIframe ? "pb-3 border-b border-gray-200" : "px-6 py-4 border-b border-gray-200"}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className={isInIframe ? "text-lg font-bold text-gray-900" : "text-2xl font-bold text-gray-900"}>
                  {isNewSiteSubmit ? 'New Site Submit' : 'Edit Site Submit'}
                </h1>
                {/* Autosave indicator - only show for existing records */}
                {!isNewSiteSubmit && (
                  <AutosaveIndicator status={autosaveStatus} lastSavedAt={lastSavedAt} />
                )}
              </div>
              <div className="flex space-x-2">
                {!isNewSiteSubmit && (
                  <>
                    <button
                      onClick={handleVerifyLocation}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 border border-transparent rounded hover:bg-purple-700 flex items-center gap-1.5"
                      title="Open map to verify location"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                      </svg>
                      Verify Location
                    </button>
                    <button
                      onClick={handleSendEmail}
                      disabled={sendingEmail || loading}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {sendingEmail ? (
                        <>
                          <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                          Submit Site
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => setShowConvertToDealModal(true)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 border border-transparent rounded hover:bg-green-700 flex items-center gap-1"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Convert to Deal
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 border border-transparent rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </>
                )}
                {/* Only show Save button for new records */}
                {isNewSiteSubmit && (
                  <button
                    onClick={handleSave}
                    disabled={saving || loading}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Create Site Submit'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className={isInIframe ? "space-y-6" : "bg-white shadow rounded-lg"}>
          <div className={isInIframe ? "space-y-6" : "p-6 space-y-8"}>
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

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client *
                      </label>
                      <ClientSelector
                        selectedClient={selectedClient}
                        onClientSelect={handleClientSelect}
                        placeholder="Type to search clients..."
                        className={errors.client_id ? 'border-red-300' : ''}
                      />
                      {errors.client_id && (
                        <p className="mt-1 text-sm text-red-600">{errors.client_id}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Assignment (Optional)
                      </label>
                      <AssignmentSelector
                        selectedAssignment={selectedAssignment}
                        onAssignmentSelect={(assignment) => {
                          setSelectedAssignment(assignment);
                          setFormData(prev => ({ ...prev, assignment_id: assignment?.id || null }));
                        }}
                        onCreateNew={() => setShowAddAssignmentModal(true)}
                        placeholder="Search for assignment..."
                        limit={5}
                        clientId={selectedClient?.id || null}
                      />
                      {!selectedClient && (
                        <p className="mt-1 text-xs text-gray-500">Select a client first</p>
                      )}
                    </div>
                  </div>

                  {/* Deal Name - Read Only */}
                  {dealName && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Associated Deal
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-md text-sm text-gray-900">
                        {dealName}
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <PropertySelector
                        value={formData.property_id}
                        onChange={(value) => updateFormData('property_id', value)}
                        label="Property *"
                        onViewDetails={handleViewPropertyDetails}
                      />
                      {errors.property_id && (
                        <p className="mt-1 text-sm text-red-600">{errors.property_id}</p>
                      )}
                      {/* Display property details when no unit is selected */}
                      {formData.property_id && !formData.property_unit_id && propertyDetails && (
                        <div className="mt-2 text-xs text-gray-600">
                          <div className="flex gap-3">
                            {propertyDetails.available_sqft && (
                              <span>{propertyDetails.available_sqft.toLocaleString()} sqft</span>
                            )}
                            {propertyDetails.rent_psf && (
                              <span>Rent: ${propertyDetails.rent_psf.toLocaleString()}/sqft</span>
                            )}
                            {propertyDetails.nnn_psf && (
                              <span>NNN: ${propertyDetails.nnn_psf.toLocaleString()}/sqft</span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {formData.property_id && (
                      <div>
                        <PropertyUnitSelector
                          propertyId={formData.property_id}
                          value={formData.property_unit_id}
                          onChange={(value) => updateFormData('property_unit_id', value)}
                          label="Property Unit (Optional)"
                        />
                        {/* Display unit details when unit is selected, fallback to property details */}
                        {formData.property_unit_id && (
                          <div className="mt-2 text-xs text-gray-600">
                            <div className="flex gap-3">
                              {/* Show sqft - prefer unit, fallback to property */}
                              {(unitDetails?.sqft || propertyDetails?.available_sqft) && (
                                <span>
                                  {unitDetails?.sqft
                                    ? `${unitDetails.sqft.toLocaleString()} sqft`
                                    : `${propertyDetails.available_sqft!.toLocaleString()} sqft`}
                                </span>
                              )}
                              {/* Show rent - prefer unit, fallback to property */}
                              {(unitDetails?.rent || propertyDetails?.rent_psf) && (
                                <span>
                                  Rent: ${unitDetails?.rent
                                    ? unitDetails.rent.toLocaleString()
                                    : `${propertyDetails.rent_psf!.toLocaleString()}/sqft`}
                                </span>
                              )}
                              {/* Show NNN - prefer unit, fallback to property */}
                              {(unitDetails?.nnn || propertyDetails?.nnn_psf) && (
                                <span>
                                  NNN: ${unitDetails?.nnn
                                    ? unitDetails.nnn.toLocaleString()
                                    : `${propertyDetails.nnn_psf!.toLocaleString()}/sqft`}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Submission Details Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Submission Details
                  </h3>

                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                </div>

                {/* Financial Information Section */}
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsFinancialExpanded(!isFinancialExpanded)}
                    className="w-full flex items-center justify-between text-lg font-medium text-gray-900 border-b border-gray-200 pb-2 hover:text-blue-600 transition-colors"
                  >
                    <span>Financial Information</span>
                    <svg
                      className={`w-5 h-5 transform transition-transform ${isFinancialExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isFinancialExpanded && (
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
                  )}
                </div>

                {/* Location Information Section */}
                <div className="space-y-4">
                  <button
                    type="button"
                    onClick={() => setIsLocationExpanded(!isLocationExpanded)}
                    className="w-full flex items-center justify-between text-lg font-medium text-gray-900 border-b border-gray-200 pb-2 hover:text-blue-600 transition-colors"
                  >
                    <span>Location Verification</span>
                    <svg
                      className={`w-5 h-5 transform transition-transform ${isLocationExpanded ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isLocationExpanded && (
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
                  )}
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

                {/* Record Metadata - Show for existing site submits */}
                {!isNewSiteSubmit && siteSubmitMetadata && (
                  <RecordMetadata
                    createdAt={siteSubmitMetadata.created_at}
                    createdById={siteSubmitMetadata.created_by_id}
                    updatedAt={siteSubmitMetadata.updated_at}
                    updatedById={siteSubmitMetadata.updated_by_id}
                    emailSentAt={siteSubmitMetadata.email_sent_at}
                    emailSentById={siteSubmitMetadata.email_sent_by_id}
                  />
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Site Submit"
        message="Are you sure you want to delete this site submit? This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
      />

      {/* Email Composer Modal */}
      <EmailComposerModal
        isOpen={showEmailComposer}
        onClose={() => setShowEmailComposer(false)}
        onSend={handleSendEmailFromComposer}
        defaultSubject={emailDefaultData.subject}
        defaultBody={emailDefaultData.body}
        defaultRecipients={emailDefaultData.recipients}
        siteSubmitName={formData.site_submit_name}
        templateData={emailDefaultData.templateData}
        availableFiles={emailDefaultData.availableFiles}
      />

      {/* Add Assignment Modal */}
      <AddAssignmentModal
        isOpen={showAddAssignmentModal}
        onClose={() => setShowAddAssignmentModal(false)}
        onSave={(newAssignment) => {
          const assignmentResult: AssignmentSearchResult = {
            id: newAssignment.id,
            assignment_name: newAssignment.assignment_name || 'Unnamed Assignment',
            client_id: newAssignment.client_id,
            client_name: null,
            assignment_value: newAssignment.assignment_value,
            due_date: newAssignment.due_date,
            progress: newAssignment.progress
          };
          setSelectedAssignment(assignmentResult);
          setFormData(prev => ({ ...prev, assignment_id: assignmentResult.id }));
          setShowAddAssignmentModal(false);
          showToast('Assignment created successfully!', { type: 'success' });
        }}
        preselectedClientId={selectedClient?.id || null}
      />

      {/* Convert to Deal Modal */}
      {!isNewSiteSubmit && (
        <ConvertSiteSubmitToDealModal
          isOpen={showConvertToDealModal}
          onClose={() => setShowConvertToDealModal(false)}
          siteSubmitId={siteSubmitId || ''}
          siteSubmitCode={siteSubmitCode}
          siteSubmitName={formData.site_submit_name}
          clientId={formData.client_id}
          clientName={selectedClient?.client_name || null}
          propertyId={formData.property_id}
          propertyName={propertyName}
          propertyUnitId={formData.property_unit_id}
          onSuccess={(dealId) => {
            showToast('Deal created successfully!', { type: 'success' });
            setShowConvertToDealModal(false);

            // Navigate to the newly created deal
            if (isInIframe) {
              // If in iframe (sidebar), close the sidebar first then navigate to deal
              window.parent.postMessage({
                type: 'CLOSE_SLIDEOUT'
              }, '*');
              // Small delay to ensure slideout closes before navigation
              setTimeout(() => {
                window.parent.postMessage({
                  type: 'NAVIGATE',
                  path: `/deal/${dealId}`
                }, '*');
              }, 100);
            } else {
              // If standalone page, navigate normally
              navigate(`/deal/${dealId}`);
            }
          }}
        />
      )}
    </div>
  );
};

export default SiteSubmitDetailsPage;
