import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import PropertySelector from '../components/PropertySelector';
import PropertyUnitSelector from '../components/PropertyUnitSelector';
import Toast from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import EmailComposerModal, { EmailData } from '../components/EmailComposerModal';
import { useToast } from '../hooks/useToast';

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

  const [formData, setFormData] = useState<FormData>({
    site_submit_name: '',
    client_id: null,
    property_id: null,
    property_unit_id: null,
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
    verified_latitude: null,
    verified_longitude: null,
    year_1_rent: null,
    ti: null,
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [submitStages, setSubmitStages] = useState<SubmitStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [propertyName, setPropertyName] = useState<string>('');
  const [userEditedName, setUserEditedName] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [emailDefaultData, setEmailDefaultData] = useState<{
    subject: string;
    body: string;
    recipients: any[];
  }>({ subject: '', body: '', recipients: [] });

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
        // Load clients and submit stages
        const [clientsResult, stagesResult] = await Promise.all([
          supabase.from('client').select('*').order('client_name'),
          supabase.from('submit_stage').select('*').order('name')
        ]);

        if (clientsResult.data) setClients(clientsResult.data);
        if (stagesResult.data) setSubmitStages(stagesResult.data);

        // Load existing site submit if editing
        if (siteSubmitId && !isNewSiteSubmit) {
          const { data: siteSubmitData, error } = await supabase
            .from('site_submit')
            .select('*')
            .eq('id', siteSubmitId)
            .single();

          if (error) {
            console.error('Error loading site submit:', error);
          } else if (siteSubmitData) {
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

    loadData();
  }, [siteSubmitId, isNewSiteSubmit]);

  // Auto-generate site submit name from client and property
  const generateSiteSubmitName = (clientId: string | null, propName: string): string => {
    if (!clientId || !propName) return '';
    
    const client = clients.find(c => c.id === clientId);
    if (!client) return '';
    
    return `${client.client_name} - ${propName}`;
  };

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }

    // Auto-generate site submit name when client changes (only if user hasn't manually edited it)
    if (field === 'client_id' && !userEditedName && propertyName) {
      const autoName = generateSiteSubmitName(value, propertyName);
      if (autoName) {
        setFormData(prev => ({ ...prev, site_submit_name: autoName }));
      }
    }

    // Auto-generate site submit name when property changes (only if user hasn't manually edited it)
    if (field === 'property_id' && !userEditedName && formData.client_id) {
      // We need to fetch the new property name
      if (value) {
        supabase.from('property')
          .select('property_name')
          .eq('id', value)
          .single()
          .then(({ data }) => {
            if (data?.property_name) {
              setPropertyName(data.property_name);
              const autoName = generateSiteSubmitName(formData.client_id, data.property_name);
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

        const { data, error } = await supabase
          .from('site_submit')
          .update(updateData)
          .eq('id', siteSubmitId)
          .select()
          .single();

        if (error) throw error;
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

        const { data, error } = await supabase
          .from('site_submit')
          .insert(submitData)
          .select()
          .single();

        if (error) throw error;
        
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

    try {
      // Fetch site submit data with related information to generate email template
      const { data: siteSubmitData, error: siteSubmitError } = await supabase
        .from('site_submit')
        .select(`
          *,
          client:client_id (
            id,
            client_name
          ),
          property:property_id (
            id,
            property_name,
            address,
            city,
            state,
            zip
          ),
          property_unit:property_unit_id (
            id,
            property_unit_name
          )
        `)
        .eq('id', siteSubmitId)
        .single();

      if (siteSubmitError) throw siteSubmitError;
      if (!siteSubmitData) throw new Error('Site submit not found');

      // Fetch Site Selector contacts for this client
      const { data: contacts, error: contactsError } = await supabase
        .from('contact')
        .select('id, first_name, last_name, email')
        .eq('client_id', siteSubmitData.client_id)
        .eq('is_site_selector', true)
        .not('email', 'is', null);

      if (contactsError) throw contactsError;

      if (!contacts || contacts.length === 0) {
        showToast('No Site Selector contacts found for this client with email addresses', { type: 'error' });
        return;
      }

      // Generate default email template
      const defaultSubject = `New site for Review – ${siteSubmitData.property?.property_name || 'Untitled'} – ${siteSubmitData.client?.client_name || 'N/A'}`;
      const defaultBody = generateEmailTemplate(siteSubmitData, contacts[0]);

      // Set email default data and show composer modal
      setEmailDefaultData({
        subject: defaultSubject,
        body: defaultBody,
        recipients: contacts,
      });
      setShowEmailComposer(true);
    } catch (error) {
      console.error('Error preparing email:', error);
      showToast(
        `Error preparing email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { type: 'error' }
      );
    }
  };

  const handleSendEmailFromComposer = async (emailData: EmailData) => {
    setSendingEmail(true);
    try {
      const { data: { session, user } } = await supabase.auth.getSession();

      if (!session) {
        throw new Error('Not authenticated');
      }

      // Fetch user email from the user table
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

      showToast(
        `Successfully sent ${result.emailsSent} email(s)`,
        { type: 'success' }
      );
    } catch (error) {
      console.error('Error sending email:', error);
      showToast(
        `Error sending email: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { type: 'error' }
      );
      throw error; // Re-throw to keep modal open on error
    } finally {
      setSendingEmail(false);
    }
  };

  const generateEmailTemplate = (siteSubmit: any, contact: any): string => {
    const clientName = siteSubmit.client?.client_name || 'N/A';
    const propertyName = siteSubmit.property?.property_name || 'N/A';
    const propertyAddress = siteSubmit.property
      ? `${siteSubmit.property.address || ''}, ${siteSubmit.property.city || ''}, ${siteSubmit.property.state || ''} ${siteSubmit.property.zip || ''}`.trim()
      : 'N/A';
    const dateSubmitted = siteSubmit.date_submitted
      ? new Date(siteSubmit.date_submitted).toLocaleDateString()
      : 'N/A';

    return `
      <p>${contact.first_name || 'Hi there'},</p>
      <p>Please find below a new site submit for <strong>${siteSubmit.site_submit_name || 'New Whole Foods Coming Soon – Cumming'}</strong>. Your feedback on this site is appreciated.</p>
      <p><strong>Property Name:</strong> ${propertyName}<br/>
      <strong>Trade Area:</strong> ${siteSubmit.property?.city || 'N/A'}<br/>
      <strong>Map Link:</strong> <a href="#">View Map</a><br/>
      <strong>Address:</strong> ${propertyAddress}<br/>
      <strong>Base Rent:</strong> ${siteSubmit.year_1_rent ? `$${siteSubmit.year_1_rent.toLocaleString()}` : 'N/A'}<br/>
      <strong>NNN:</strong> ${siteSubmit.ti ? `$${siteSubmit.ti.toLocaleString()}` : 'N/A'}</p>

      ${siteSubmit.property_unit?.property_unit_name ? `<p><strong>Unit:</strong> ${siteSubmit.property_unit.property_unit_name}</p>` : ''}

      ${siteSubmit.delivery_timeframe ? `<p><strong>Delivery Timeframe:</strong> ${siteSubmit.delivery_timeframe}</p>` : ''}

      ${siteSubmit.notes ? `<p><strong>Site Notes:</strong><br/>${siteSubmit.notes}</p>` : ''}

      ${siteSubmit.customer_comments ? `<p><strong>Customer Comments:</strong><br/>${siteSubmit.customer_comments}</p>` : ''}

      <p>If this property is a pass, please just respond back to this email with a brief reason as to why it's a pass. If you need more information or want to discuss further, let me know that as well.</p>

      <p>Best,</p>
    `;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="bg-white shadow rounded-lg mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isNewSiteSubmit ? 'New Site Submit' : 'Edit Site Submit'}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {isNewSiteSubmit ? 'Create a new site submit record' : 'Update site submit information'}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => navigate('/master-pipeline')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back to Pipeline
                </button>
                {!isNewSiteSubmit && (
                  <>
                    <button
                      onClick={handleSendEmail}
                      disabled={sendingEmail || loading}
                      className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                    >
                      {sendingEmail ? (
                        <>
                          <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Sending...
                        </>
                      ) : (
                        <>
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                          </svg>
                          Submit Site
                        </>
                      )}
                    </button>
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Site Submit'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Form Content */}
        <div className="bg-white shadow rounded-lg">
          <div className="p-6 space-y-8">
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
                    <select
                      value={formData.client_id || ''}
                      onChange={(e) => updateFormData('client_id', e.target.value || null)}
                      className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                        errors.client_id ? 'border-red-300' : ''
                      }`}
                    >
                      <option value="">Select a client...</option>
                      {clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.client_name}
                        </option>
                      ))}
                    </select>
                    {errors.client_id && (
                      <p className="mt-1 text-sm text-red-600">{errors.client_id}</p>
                    )}
                  </div>

                  <PropertySelector
                    value={formData.property_id}
                    onChange={(value) => updateFormData('property_id', value)}
                    label="Property *"
                  />
                  {errors.property_id && (
                    <p className="mt-1 text-sm text-red-600">{errors.property_id}</p>
                  )}

                  {formData.property_id && (
                    <PropertyUnitSelector
                      propertyId={formData.property_id}
                      value={formData.property_unit_id}
                      onChange={(value) => updateFormData('property_unit_id', value)}
                      label="Property Unit (Optional)"
                    />
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
      />
    </div>
  );
};

export default SiteSubmitDetailsPage;