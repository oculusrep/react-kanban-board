import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import ParentAccountSelector from './ParentAccountSelector';

type Client = Database['public']['Tables']['client']['Row'];
type ClientInsert = Database['public']['Tables']['client']['Insert'];

interface FormData {
  client_name: string;
  type: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  description: string | null;
  billing_street: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  billing_country: string | null;
  shipping_street: string | null;
  shipping_city: string | null;
  shipping_state: string | null;
  shipping_zip: string | null;
  shipping_country: string | null;
  industry: string | null;
  annual_revenue: number | null;
  number_of_employees: number | null;
  ownership: string | null;
  ticker_symbol: string | null;
  parent_account: string | null;
  account_source: string | null;
  rating: string | null;
  sic_code: string | null;
  naics_code: string | null;
  clean_status: string | null;
  customer_priority: string | null;
  upsell_opportunity: string | null;
  is_active_client: boolean;
}

interface ClientOverviewTabProps {
  client: Client | null;
  isNewClient: boolean;
  onSave: (client: Client) => void;
  onDelete?: () => void;
}

const ClientOverviewTab: React.FC<ClientOverviewTabProps> = ({
  client,
  isNewClient,
  onSave,
  onDelete
}) => {
  const [formData, setFormData] = useState<FormData>({
    client_name: '',
    type: null,
    phone: null,
    email: null,
    website: null,
    description: null,
    billing_street: null,
    billing_city: null,
    billing_state: null,
    billing_zip: null,
    billing_country: null,
    shipping_street: null,
    shipping_city: null,
    shipping_state: null,
    shipping_zip: null,
    shipping_country: null,
    industry: null,
    annual_revenue: null,
    number_of_employees: null,
    ownership: null,
    ticker_symbol: null,
    parent_account: null,
    account_source: null,
    rating: null,
    sic_code: null,
    naics_code: null,
    clean_status: null,
    customer_priority: null,
    upsell_opportunity: null,
    is_active_client: true
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [originalFormData, setOriginalFormData] = useState<FormData | null>(null);
  const [isClientTypeDropdownOpen, setIsClientTypeDropdownOpen] = useState(false);
  const clientTypeDropdownRef = React.useRef<HTMLDivElement>(null);

  // Client type options
  const clientTypes = [
    'Tenant',
    'Landlord',
    'Prospect',
    'Vendor',
    'Partner',
    'Competitor',
    'Other'
  ];

  // Industry options
  const industries = [
    'Retail',
    'Restaurant',
    'Healthcare',
    'Professional Services',
    'Financial Services',
    'Technology',
    'Real Estate',
    'Manufacturing',
    'Education',
    'Government',
    'Non-Profit',
    'Other'
  ];

  // Rating options
  const ratings = [
    'Hot',
    'Warm',
    'Cold'
  ];

  // Close client type dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clientTypeDropdownRef.current && !clientTypeDropdownRef.current.contains(event.target as Node)) {
        setIsClientTypeDropdownOpen(false);
      }
    };

    if (isClientTypeDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isClientTypeDropdownOpen]);

  // Load client data when component mounts or client changes
  useEffect(() => {
    if (client) {
      const newFormData = {
        client_name: client.client_name || '',
        type: client.sf_client_type,
        phone: client.phone,
        email: client.email,
        website: client.website,
        description: client.description,
        billing_street: client.billing_street,
        billing_city: client.billing_city,
        billing_state: client.billing_state,
        billing_zip: client.billing_zip,
        billing_country: client.billing_country,
        shipping_street: client.shipping_street,
        shipping_city: client.shipping_city,
        shipping_state: client.shipping_state,
        shipping_zip: client.shipping_zip,
        shipping_country: client.shipping_country,
        industry: client.industry,
        annual_revenue: client.annual_revenue,
        number_of_employees: client.number_of_employees,
        ownership: client.ownership,
        ticker_symbol: client.ticker_symbol,
        parent_account: client.parent_account,
        account_source: client.account_source,
        rating: client.rating,
        sic_code: client.sic_code,
        naics_code: client.naics_code,
        clean_status: client.clean_status,
        customer_priority: client.customer_priority,
        upsell_opportunity: client.upsell_opportunity,
        is_active_client: client.is_active_client ?? true
      };
      setFormData(newFormData);
      setOriginalFormData(newFormData);
      setHasChanges(false);
    }
  }, [client]);

  const handleInputChange = (field: keyof FormData, value: string | number | boolean | null) => {
    setFormData(prev => {
      const updated = {
        ...prev,
        [field]: value
      };

      // Check if there are changes compared to original
      if (originalFormData) {
        const changed = JSON.stringify(updated) !== JSON.stringify(originalFormData);
        setHasChanges(changed);
      } else {
        // For new clients, always show changes
        setHasChanges(true);
      }

      return updated;
    });

    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.client_name.trim()) {
      newErrors.client_name = 'Client name is required';
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (formData.website && !/^https?:\/\/.+/.test(formData.website)) {
      newErrors.website = 'Website must start with http:// or https://';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setLoading(true);
    try {
      if (isNewClient) {
        // Create new client
        const insertData: ClientInsert = {
          ...formData,
          client_name: formData.client_name.trim()
        };

        const { data, error } = await supabase
          .from('client')
          .insert([insertData])
          .select()
          .single();

        if (error) throw error;
        setHasChanges(false);
        onSave(data);
      } else {
        // Update existing client - only send fields that exist in the database
        const updateData = {
          client_name: formData.client_name.trim(),
          phone: formData.phone,
          website: formData.website,
          description: formData.description,
          billing_street: formData.billing_street,
          billing_city: formData.billing_city,
          billing_state: formData.billing_state,
          billing_zip: formData.billing_zip,
          billing_country: formData.billing_country,
          shipping_street: formData.shipping_street,
          shipping_city: formData.shipping_city,
          shipping_state: formData.shipping_state,
          shipping_zip: formData.shipping_zip,
          shipping_country: formData.shipping_country,
          is_active_client: formData.is_active_client,
          sf_client_type: formData.type,
          updated_at: new Date().toISOString()
        };

        console.log('💾 Saving client with data:', updateData);

        const { data, error } = await supabase
          .from('client')
          .update(updateData)
          .eq('id', client!.id)
          .select()
          .single();

        if (error) {
          console.error('❌ Save error:', error);
          throw error;
        }

        console.log('✅ Client saved successfully:', data);
        setHasChanges(false);
        onSave(data);
      }
    } catch (error) {
      console.error('Error saving client:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));

      // Extract detailed error message from Supabase error
      let errorMessage = 'An unexpected error occurred';
      if (error && typeof error === 'object') {
        if ('message' in error) {
          errorMessage = (error as any).message;
        }
        if ('details' in error) {
          console.error('Error details:', (error as any).details);
        }
        if ('hint' in error) {
          console.error('Error hint:', (error as any).hint);
        }
      }

      setErrors({ submit: `Failed to save client: ${errorMessage}` });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!client?.id || !onDelete) return;

    setLoading(true);
    try {
      const { error } = await supabase
        .from('client')
        .delete()
        .eq('id', client.id);

      if (error) throw error;
      onDelete();
    } catch (error) {
      console.error('Error deleting client:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
      setErrors({ submit: `Failed to delete client: ${errorMessage}` });
      setShowDeleteConfirm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleParentChange = async (parentId: string | null) => {
    if (!client?.id) return;

    try {
      const { error } = await supabase
        .from('client')
        .update({ parent_id: parentId })
        .eq('id', client.id);

      if (error) throw error;

      // Update the client state with new parent_id
      onSave({ ...client, parent_id: parentId });
    } catch (err) {
      console.error('Error updating parent account:', err);
      throw err;
    }
  };

  return (
    <div className="space-y-8">
      {/* Basic Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">Basic Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Name *
            </label>
            <input
              type="text"
              value={formData.client_name}
              onChange={(e) => handleInputChange('client_name', e.target.value)}
              className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${errors.client_name ? 'border-red-300' : ''}`}
              placeholder="Enter client name"
            />
            {errors.client_name && (
              <p className="mt-1 text-sm text-red-600">{errors.client_name}</p>
            )}
          </div>

          {/* Parent Account */}
          {client && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parent Account
              </label>
              <ParentAccountSelector
                currentClient={client}
                onParentChange={handleParentChange}
                hideLabel={true}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Website
            </label>
            <input
              type="url"
              value={formData.website || ''}
              onChange={(e) => handleInputChange('website', e.target.value || null)}
              className={`block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm ${errors.website ? 'border-red-300' : ''}`}
              placeholder="https://www.company.com"
            />
            {errors.website && (
              <p className="mt-1 text-sm text-red-600">{errors.website}</p>
            )}
          </div>

          <div className="relative" ref={clientTypeDropdownRef}>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Client Type
            </label>
            <button
              type="button"
              onClick={() => setIsClientTypeDropdownOpen(!isClientTypeDropdownOpen)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-0 py-2 text-left border-0 border-b bg-transparent hover:border-gray-400 transition-colors"
            >
              <div className="flex items-center justify-between">
                <span className={`truncate ${formData.type ? 'text-gray-900' : 'text-gray-400'}`}>
                  {formData.type || 'Select type...'}
                </span>
                <svg
                  className="w-4 h-4 ml-2 flex-shrink-0 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {/* Dropdown */}
            {isClientTypeDropdownOpen && (
              <div className="absolute left-0 top-full mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 z-50 py-2 max-h-64 overflow-y-auto">
                <div className="px-3 py-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Select Type
                </div>
                {clientTypes.map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      handleInputChange('type', type);
                      setIsClientTypeDropdownOpen(false);
                    }}
                    className={`
                      w-full text-left px-3 py-2 text-sm hover:bg-gray-100
                      transition-colors
                      ${formData.type === type ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}
                    `}
                  >
                    {type}
                  </button>
                ))}

                {/* Clear type option */}
                {formData.type && (
                  <>
                    <div className="border-t border-gray-200 my-1"></div>
                    <button
                      type="button"
                      onClick={() => {
                        handleInputChange('type', null);
                        setIsClientTypeDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-500 hover:bg-gray-100 transition-colors"
                    >
                      Clear type
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="is_active_client"
              checked={formData.is_active_client}
              onChange={(e) => handleInputChange('is_active_client', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label htmlFor="is_active_client" className="ml-2 block text-sm text-gray-900">
              Active Client
            </label>
          </div>
        </div>

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={formData.description || ''}
            onChange={(e) => handleInputChange('description', e.target.value || null)}
            rows={4}
            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
            placeholder="Additional information about the client..."
          />
        </div>
      </div>

      {/* Billing Address */}
      <div className="bg-white shadow rounded-lg p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-6">Billing Address</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Street Address
            </label>
            <input
              type="text"
              value={formData.billing_street || ''}
              onChange={(e) => handleInputChange('billing_street', e.target.value || null)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="123 Main St"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <input
              type="text"
              value={formData.billing_city || ''}
              onChange={(e) => handleInputChange('billing_city', e.target.value || null)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="New York"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              State
            </label>
            <input
              type="text"
              value={formData.billing_state || ''}
              onChange={(e) => handleInputChange('billing_state', e.target.value || null)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="NY"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ZIP Code
            </label>
            <input
              type="text"
              value={formData.billing_zip || ''}
              onChange={(e) => handleInputChange('billing_zip', e.target.value || null)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="10001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country
            </label>
            <input
              type="text"
              value={formData.billing_country || ''}
              onChange={(e) => handleInputChange('billing_country', e.target.value || null)}
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              placeholder="United States"
            />
          </div>
        </div>
      </div>

      {/* Error Display */}
      {errors.submit && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-600">{errors.submit}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center justify-between pt-6 border-t border-gray-200">
        {/* Only show save button when there are changes */}
        {(hasChanges || isNewClient) && (
          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Saving...' : isNewClient ? 'Create Client' : 'Save Changes'}
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3 text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
                <svg className="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mt-4">Delete Client</h3>
              <p className="text-sm text-gray-500 mt-2">
                Are you sure you want to delete this client? This action cannot be undone.
              </p>
              <div className="flex items-center justify-center mt-4 space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={loading}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={loading}
                  className="px-4 py-2 bg-red-600 border border-transparent rounded-md text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientOverviewTab;