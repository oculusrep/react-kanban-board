import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import { useAuth } from '../contexts/AuthContext';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';

type Contact = Database['public']['Tables']['contact']['Row'];
type ContactInsert = Database['public']['Tables']['contact']['Insert'];
type Client = Database['public']['Tables']['client']['Row'];

interface ContactFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave?: (contact: Contact) => void;
  onUpdate?: (contact: Contact) => void;
  contactId?: string;
  propertyId?: string;
  rightOffset?: number; // Offset from right edge in pixels
  showBackdrop?: boolean; // Whether to show the backdrop (default true)
}

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

const ContactFormModal: React.FC<ContactFormModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onUpdate,
  contactId,
  propertyId,
  rightOffset = 0,
  showBackdrop = true
}) => {
  const { user } = useAuth();
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

  // Source type options
  const sourceTypes = [
    'Contact',
    'Lead',
    'Hunter'
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
        if (contactId) {
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
              source_type: contactData.source_type || 'Contact',
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

    if (isOpen) {
      loadData();
    }
  }, [isOpen, contactId]);

  // Reset form when modal closes
  useEffect(() => {
    if (!isOpen) {
      setFormData({
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
      setErrors({});
    }
  }, [isOpen]);

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
    // source_type always defaults to 'Contact', no validation needed
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
      if (contactId) {
        // Update existing contact
        const updateData = {
          ...formData,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('contact')
          .update(prepareUpdate(updateData))
          .eq('id', contactId)
          .select()
          .single();

        if (error) throw error;
        onUpdate?.(data);
      } else {
        // Create new contact
        const contactData = prepareInsert({
          ...formData,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

        const { data, error } = await supabase
          .from('contact')
          .insert(contactData)
          .select()
          .single();

        if (error) throw error;
        
        // If we have a propertyId, create the property_contact association
        if (propertyId && data) {
          await supabase
            .from('property_contact')
            .insert({
              property_id: propertyId,
              contact_id: data.id,
            });
        }

        onSave?.(data);
      }

      onClose();

    } catch (error) {
      console.error('Error saving contact:', error);
      alert(`Error saving contact: ${error instanceof Error ? error.message : 'Unknown error'}. Please check the console for details.`);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  console.log('🎨 ContactFormModal rendering:', { isOpen, rightOffset, showBackdrop, contactId, propertyId });

  return (
    <>
      {/* Backdrop - Only show if showBackdrop is true */}
      {showBackdrop && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />
      )}

      {/* Modal */}
      <div
        className={`fixed bottom-0 left-0 lg:left-auto w-full lg:w-[450px] bg-white shadow-xl transform transition-transform duration-300 z-[60] ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        } flex flex-col`}
        style={{
          right: `${rightOffset}px`,
          top: '67px', // Align with navbar height, same as property slideout
          height: 'calc(100vh - 67px)' // Full height minus navbar
        }}
      >
        
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-white">
          <h2 className="text-lg font-semibold text-gray-900">
            {contactId ? 'Edit Contact' : 'New Contact'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
          >
            <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <>
              {/* Basic Information Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
                  Basic Information
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
                      Source Type
                    </label>
                    <select
                      value={formData.source_type}
                      onChange={(e) => updateFormData('source_type', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                    >
                      {sourceTypes.map((source) => (
                        <option key={source} value={source}>
                          {source}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Contact Information Section */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
                  Contact Information
                </h3>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
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

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
                  Mailing Address
                </h3>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
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

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
                  Professional Information
                </h3>

                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                    <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
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
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-gray-900 border-b border-gray-200 pb-1">
                  Tags & Tracking
                </h3>

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-0.5">
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

                {contactId && (
                  <div className="bg-gray-50 p-3 rounded-md">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Record Information</h4>
                    <div className="text-xs text-gray-500 space-y-1">
                      <p>Created: {/* Will show created date and user */}</p>
                      <p>Last Updated: {/* Will show updated date and user */}</p>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-gray-200 p-4 bg-gray-50">
          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save Contact'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ContactFormModal;