import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { Database } from '../../database-schema';
import PropertySelector from './PropertySelector';
import PropertyUnitSelector from './PropertyUnitSelector';

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
  propertyUnitId
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

        // Load existing site submit if editing
        if (siteSubmitId) {
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

    if (isOpen) {
      loadData();
    }
  }, [isOpen, siteSubmitId]);

  // Reset form when modal closes or siteSubmitId changes
  useEffect(() => {
    if (!isOpen) {
      // Reset form when modal closes
      setFormData({
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
        verified_latitude: null,
        verified_longitude: null,
        year_1_rent: null,
        ti: null,
      });
      setErrors({});
      setUserEditedName(false); // Reset name editing flag
      setPropertyName('');
    }
  }, [isOpen, propertyId, propertyUnitId]);

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
          .update(updateData)
          .eq('id', siteSubmitId)
          .select(`
            *,
            submit_stage (
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

        const { data, error } = await supabase
          .from('site_submit')
          .insert(submitData)
          .select(`
            *,
            submit_stage (
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
          <h2 className="text-xl font-semibold text-gray-900">
            {siteSubmitId ? 'Edit Site Submit' : 'New Site Submit'}
          </h2>
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
              {saving ? 'Saving...' : 'Save Site Submit'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default SiteSubmitFormModal;