import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';

type Contact = Database['public']['Tables']['contact']['Row'];
type ContactInsert = Database['public']['Tables']['contact']['Insert'];
type Client = Database['public']['Tables']['client']['Row'];

interface FormData {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  company: string | null;
  client_id: string | null;
  source_type: string;
  mailing_street: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  mailing_country: string | null;
  website: string | null;
  linked_in_profile_link: string | null;
  icsc_profile_link: string | null;
  linked_in_connection: boolean;
  is_site_selector: boolean;
  tenant_repped: boolean;
  tenant_rep_contact_id: string | null;
  contact_tags: string | null;
}

const ContactDetailsPage: React.FC = () => {
  const { contactId } = useParams<{ contactId: string }>();
  const navigate = useNavigate();
  const isNewContact = contactId === 'new';

  const [formData, setFormData] = useState<FormData>({
    first_name: '',
    last_name: '',
    email: null,
    phone: null,
    mobile_phone: null,
    title: null,
    company: null,
    client_id: null,
    source_type: 'Contact',
    mailing_street: null,
    mailing_city: null,
    mailing_state: null,
    mailing_zip: null,
    mailing_country: null,
    website: null,
    linked_in_profile_link: null,
    icsc_profile_link: null,
    linked_in_connection: false,
    is_site_selector: false,
    tenant_repped: false,
    tenant_rep_contact_id: null,
    contact_tags: null,
  });

  const [clients, setClients] = useState<Client[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Source type options (Contact vs Lead)
  const sourceTypes = [
    'Contact',
    'Lead'
  ];

  // US States
  const states = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  // Load dropdown data and existing contact if editing
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        // Load clients and contacts for lookups
        const [clientsResult, contactsResult] = await Promise.all([
          supabase.from('client').select('*').order('client_name'),
          supabase.from('contact').select('id, first_name, last_name, company').order('last_name, first_name')
        ]);

        if (clientsResult.data) setClients(clientsResult.data);
        if (contactsResult.data) setContacts(contactsResult.data);

        // Load existing contact if editing
        if (contactId && !isNewContact) {
          const { data: contactData, error } = await supabase
            .from('contact')
            .select('*')
            .eq('id', contactId)
            .single();

          if (error) {
            console.error('Error loading contact:', error);
          } else if (contactData) {
            setFormData({
              first_name: contactData.first_name || '',
              last_name: contactData.last_name || '',
              email: contactData.email,
              phone: contactData.phone,
              mobile_phone: contactData.mobile_phone,
              title: contactData.title,
              company: contactData.company,
              client_id: contactData.client_id,
              source_type: contactData.source_type,
              mailing_street: contactData.mailing_street,
              mailing_city: contactData.mailing_city,
              mailing_state: contactData.mailing_state,
              mailing_zip: contactData.mailing_zip,
              mailing_country: contactData.mailing_country,
              website: contactData.website,
              linked_in_profile_link: contactData.linked_in_profile_link,
              icsc_profile_link: contactData.icsc_profile_link,
              linked_in_connection: contactData.linked_in_connection || false,
              is_site_selector: contactData.is_site_selector || false,
              tenant_repped: contactData.tenant_repped || false,
              tenant_rep_contact_id: contactData.tenant_rep_contact_id,
              contact_tags: contactData.contact_tags,
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
  }, [contactId, isNewContact]);

  const updateFormData = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.first_name?.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name?.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (!formData.source_type?.trim()) {
      newErrors.source_type = 'Source type is required';
    }
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setSaving(true);
    try {
      if (contactId && !isNewContact) {
        // Update existing contact
        const updateData = {
          ...formData,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('contact')
          .update(updateData)
          .eq('id', contactId)
          .select()
          .single();

        if (error) throw error;
      } else {
        // Create new contact
        const contactData: ContactInsert = {
          ...formData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('contact')
          .insert(contactData)
          .select()
          .single();

        if (error) throw error;
        
        // Navigate to the new contact's detail page
        if (data) {
          navigate(`/contact/${data.id}`, { replace: true });
        }
      }

      // Show success message
      alert('Contact saved successfully!');

    } catch (error) {
      console.error('Error saving contact:', error);
      alert(`Error saving contact: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!contactId || isNewContact) return;

    if (!confirm('Are you sure you want to delete this contact? This action cannot be undone.')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('contact')
        .delete()
        .eq('id', contactId);

      if (error) throw error;

      alert('Contact deleted successfully!');
      navigate('/master-pipeline');
    } catch (error) {
      console.error('Error deleting contact:', error);
      alert(`Error deleting contact: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
                  {isNewContact ? 'New Contact' : 'Edit Contact'}
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  {isNewContact ? 'Create a new contact record' : 'Update contact information'}
                </p>
              </div>
              <div className="flex space-x-3">
                <button
                  onClick={() => navigate('/master-pipeline')}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Back to Pipeline
                </button>
                {!isNewContact && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md hover:bg-red-700"
                  >
                    Delete
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Contact'}
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
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        First Name *
                      </label>
                      <input
                        type="text"
                        value={formData.first_name}
                        onChange={(e) => updateFormData('first_name', e.target.value)}
                        className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                          errors.first_name ? 'border-red-300' : ''
                        }`}
                        placeholder="Enter first name"
                      />
                      {errors.first_name && (
                        <p className="mt-1 text-sm text-red-600">{errors.first_name}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Last Name *
                      </label>
                      <input
                        type="text"
                        value={formData.last_name}
                        onChange={(e) => updateFormData('last_name', e.target.value)}
                        className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                          errors.last_name ? 'border-red-300' : ''
                        }`}
                        placeholder="Enter last name"
                      />
                      {errors.last_name && (
                        <p className="mt-1 text-sm text-red-600">{errors.last_name}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Title
                      </label>
                      <input
                        type="text"
                        value={formData.title || ''}
                        onChange={(e) => updateFormData('title', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="Job title"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Company
                      </label>
                      <input
                        type="text"
                        value={formData.company || ''}
                        onChange={(e) => updateFormData('company', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="Company name"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Client
                      </label>
                      <select
                        value={formData.client_id || ''}
                        onChange={(e) => updateFormData('client_id', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      >
                        <option value="">Select a client...</option>
                        {clients.map((client) => (
                          <option key={client.id} value={client.id}>
                            {client.client_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Source Type *
                      </label>
                      <select
                        value={formData.source_type}
                        onChange={(e) => updateFormData('source_type', e.target.value)}
                        className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                          errors.source_type ? 'border-red-300' : ''
                        }`}
                      >
                        <option value="">Select source...</option>
                        {sourceTypes.map((source) => (
                          <option key={source} value={source}>
                            {source}
                          </option>
                        ))}
                      </select>
                      {errors.source_type && (
                        <p className="mt-1 text-sm text-red-600">{errors.source_type}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contact Information Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Contact Information
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Email
                    </label>
                    <input
                      type="email"
                      value={formData.email || ''}
                      onChange={(e) => updateFormData('email', e.target.value || null)}
                      className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                        errors.email ? 'border-red-300' : ''
                      }`}
                      placeholder="Enter email address"
                    />
                    {errors.email && (
                      <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.phone || ''}
                        onChange={(e) => updateFormData('phone', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="(555) 123-4567"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Mobile Phone
                      </label>
                      <input
                        type="tel"
                        value={formData.mobile_phone || ''}
                        onChange={(e) => updateFormData('mobile_phone', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Website
                    </label>
                    <input
                      type="url"
                      value={formData.website || ''}
                      onChange={(e) => updateFormData('website', e.target.value || null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="https://example.com"
                    />
                  </div>
                </div>

                {/* Mailing Address Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Mailing Address
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Street Address
                    </label>
                    <input
                      type="text"
                      value={formData.mailing_street || ''}
                      onChange={(e) => updateFormData('mailing_street', e.target.value || null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="123 Main St"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={formData.mailing_city || ''}
                        onChange={(e) => updateFormData('mailing_city', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="City"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        State
                      </label>
                      <select
                        value={formData.mailing_state || ''}
                        onChange={(e) => updateFormData('mailing_state', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      >
                        <option value="">Select state...</option>
                        {states.map((state) => (
                          <option key={state} value={state}>
                            {state}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ZIP Code
                      </label>
                      <input
                        type="text"
                        value={formData.mailing_zip || ''}
                        onChange={(e) => updateFormData('mailing_zip', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="12345"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.mailing_country || ''}
                      onChange={(e) => updateFormData('mailing_country', e.target.value || null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="United States"
                    />
                  </div>
                </div>

                {/* Professional Information Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Professional Information
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        LinkedIn Profile
                      </label>
                      <input
                        type="url"
                        value={formData.linked_in_profile_link || ''}
                        onChange={(e) => updateFormData('linked_in_profile_link', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="https://linkedin.com/in/profile"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        ICSC Profile Link
                      </label>
                      <input
                        type="url"
                        value={formData.icsc_profile_link || ''}
                        onChange={(e) => updateFormData('icsc_profile_link', e.target.value || null)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                        placeholder="https://icsc.com/profile"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Tenant Rep Contact
                    </label>
                    <select
                      value={formData.tenant_rep_contact_id || ''}
                      onChange={(e) => updateFormData('tenant_rep_contact_id', e.target.value || null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                      <option value="">Select contact...</option>
                      {contacts.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.first_name} {contact.last_name} {contact.company && `(${contact.company})`}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Professional Flags */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Professional Attributes</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="linked_in_connection"
                          checked={formData.linked_in_connection}
                          onChange={(e) => updateFormData('linked_in_connection', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="linked_in_connection" className="text-sm text-gray-700">
                          LinkedIn Connection
                        </label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="is_site_selector"
                          checked={formData.is_site_selector}
                          onChange={(e) => updateFormData('is_site_selector', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="is_site_selector" className="text-sm text-gray-700">
                          Site Selector
                        </label>
                      </div>

                      <div className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          id="tenant_repped"
                          checked={formData.tenant_repped}
                          onChange={(e) => updateFormData('tenant_repped', e.target.checked)}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <label htmlFor="tenant_repped" className="text-sm text-gray-700">
                          Tenant Repped
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Tags and Tracking Section */}
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-gray-900 border-b border-gray-200 pb-2">
                    Tags & Tracking
                  </h3>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Contact Tags
                    </label>
                    <textarea
                      rows={2}
                      value={formData.contact_tags || ''}
                      onChange={(e) => updateFormData('contact_tags', e.target.value || null)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                      placeholder="Tags separated by commas (e.g., VIP, Decision Maker, Cold Lead)"
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactDetailsPage;