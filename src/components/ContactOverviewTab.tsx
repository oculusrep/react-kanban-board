import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import { useContactForm } from '../hooks/useContactForm';

type Contact = Database['public']['Tables']['contact']['Row'];
type ContactInsert = Database['public']['Tables']['contact']['Insert'];
type Client = Database['public']['Tables']['client']['Row'];

interface ContactOverviewTabProps {
  contact: Contact | null;
  isNewContact: boolean;
  onSave: (contact: Contact) => void;
}

const ContactOverviewTab: React.FC<ContactOverviewTabProps> = ({
  contact,
  isNewContact,
  onSave
}) => {
  const [clients, setClients] = useState<Client[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Use the custom hook for form state and validation
  const {
    formData,
    updateField,
    validation,
    resetForm
  } = useContactForm(contact || undefined);

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

  // Load dropdown data (clients and contacts for lookups)
  useEffect(() => {
    const loadData = async () => {
      try {
        const [clientsResult, contactsResult] = await Promise.all([
          supabase.from('client').select('*').order('client_name'),
          supabase.from('contact').select('id, first_name, last_name, company').order('last_name, first_name')
        ]);

        if (clientsResult.data) setClients(clientsResult.data);
        if (contactsResult.data) setContacts(contactsResult.data);
      } catch (error) {
        console.error('Error loading form data:', error);
      }
    };

    loadData();
  }, []);

  // Handle field updates with auto-save (following PropertyDetailScreen pattern)
  const handleFieldUpdate = async (field: keyof Contact, value: any) => {
    updateField(field, value);

    // Auto-save immediately on field change (inline editing pattern)
    if (!isNewContact && contact?.id) {
      try {
        setAutoSaveStatus('saving');

        const updateData = {
          [field]: value,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('contact')
          .update(updateData)
          .eq('id', contact.id)
          .select()
          .single();

        if (error) throw error;

        setAutoSaveStatus('saved');
        onSave(data);

        // Clear saved status after 2 seconds
        setTimeout(() => setAutoSaveStatus('idle'), 2000);
      } catch (err) {
        console.error('Auto-save failed:', err);
        setAutoSaveStatus('error');
      }
    }
  };

  // Handle manual save for new contacts
  const handleCreateContact = async () => {
    // Validate using hook's validation
    if (!validation.isValid) {
      return;
    }

    setAutoSaveStatus('saving');
    try {
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
      setAutoSaveStatus('saved');
      onSave(data);

      // Clear saved status after 2 seconds
      setTimeout(() => setAutoSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Error creating contact:', error);
      setAutoSaveStatus('error');
    }
  };


  return (
    <div className="space-y-8">
      {/* Create Contact Button for New Contacts */}
      {isNewContact && (
        <div className="flex justify-end mb-4">
          <button
            onClick={handleCreateContact}
            disabled={autoSaveStatus === 'saving' || !validation.isValid}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {autoSaveStatus === 'saving' ? 'Creating...' : 'Create Contact'}
          </button>
        </div>
      )}

      {/* Auto-save Status Indicator */}
      {!isNewContact && (
        <div className="flex justify-end mb-4">
          <div className="flex items-center space-x-2 text-sm">
            {autoSaveStatus === 'saving' && (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                <span className="text-gray-600">Saving...</span>
              </>
            )}
            {autoSaveStatus === 'saved' && (
              <>
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-green-600">Saved</span>
              </>
            )}
            {autoSaveStatus === 'error' && (
              <span className="text-red-600">Error saving</span>
            )}
          </div>
        </div>
      )}

      {/* Basic Information Section */}
      <div className="bg-white shadow rounded-lg p-6 space-y-4">
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
              value={formData.first_name || ''}
              onChange={(e) => handleFieldUpdate('first_name', e.target.value)}
              className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                validation.errors.first_name ? 'border-red-300' : ''
              }`}
              placeholder="Enter first name"
            />
            {validation.errors.first_name && (
              <p className="mt-1 text-sm text-red-600">{validation.errors.first_name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              value={formData.last_name || ''}
              onChange={(e) => handleFieldUpdate('last_name', e.target.value)}
              className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                validation.errors.last_name ? 'border-red-300' : ''
              }`}
              placeholder="Enter last name"
            />
            {validation.errors.last_name && (
              <p className="mt-1 text-sm text-red-600">{validation.errors.last_name}</p>
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
              onChange={(e) => handleFieldUpdate('title', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('company', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('client_id', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('source_type', e.target.value)}
              className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
                validation.errors.source_type ? 'border-red-300' : ''
              }`}
            >
              <option value="">Select source...</option>
              {sourceTypes.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
            {validation.errors.source_type && (
              <p className="mt-1 text-sm text-red-600">{validation.errors.source_type}</p>
            )}
          </div>
        </div>
      </div>

      {/* Contact Information Section */}
      <div className="bg-white shadow rounded-lg p-6 space-y-4">
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
            onChange={(e) => handleFieldUpdate('email', e.target.value || null)}
            className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${
              validation.errors.email ? 'border-red-300' : ''
            }`}
            placeholder="Enter email address"
          />
          {validation.errors.email && (
            <p className="mt-1 text-sm text-red-600">{validation.errors.email}</p>
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
              onChange={(e) => handleFieldUpdate('phone', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('mobile_phone', e.target.value || null)}
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
            onChange={(e) => handleFieldUpdate('website', e.target.value || null)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            placeholder="https://example.com"
          />
        </div>
      </div>

      {/* Mailing Address Section */}
      <div className="bg-white shadow rounded-lg p-6 space-y-4">
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
            onChange={(e) => handleFieldUpdate('mailing_street', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('mailing_city', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('mailing_state', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('mailing_zip', e.target.value || null)}
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
            onChange={(e) => handleFieldUpdate('mailing_country', e.target.value || null)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            placeholder="United States"
          />
        </div>
      </div>

      {/* Professional Information Section */}
      <div className="bg-white shadow rounded-lg p-6 space-y-4">
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
              onChange={(e) => handleFieldUpdate('linked_in_profile_link', e.target.value || null)}
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
              onChange={(e) => handleFieldUpdate('icsc_profile_link', e.target.value || null)}
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
            onChange={(e) => handleFieldUpdate('tenant_rep_contact_id', e.target.value || null)}
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
                onChange={(e) => handleFieldUpdate('linked_in_connection', e.target.checked)}
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
                onChange={(e) => handleFieldUpdate('is_site_selector', e.target.checked)}
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
                onChange={(e) => handleFieldUpdate('tenant_repped', e.target.checked)}
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
      <div className="bg-white shadow rounded-lg p-6 space-y-4">
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
            onChange={(e) => handleFieldUpdate('contact_tags', e.target.value || null)}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            placeholder="Tags separated by commas (e.g., VIP, Decision Maker, Cold Lead)"
          />
        </div>
      </div>
    </div>
  );
};

export default ContactOverviewTab;