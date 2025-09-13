import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { ParentObject, RelatedOption } from '../types/activity';
import { 
  XMarkIcon,
  PhoneIcon,
  MagnifyingGlassIcon,
  CheckIcon
} from '@heroicons/react/24/outline';

interface LogCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCallLogged?: () => void;
  parentObject?: ParentObject | null;
}

interface CallFormData {
  subject: string;
  comments: string;
  contact_id: string;
  related_to: string;
  related_to_type: string;
  is_prospecting: boolean;
  completed_call: boolean;
  meeting_held: boolean;
  is_property_prospecting_call: boolean;
  completed_property_call: boolean;
}

const LogCallModal: React.FC<LogCallModalProps> = ({ 
  isOpen, 
  onClose, 
  onCallLogged,
  parentObject
}) => {
  const [formData, setFormData] = useState<CallFormData>({
    subject: '',
    comments: '',
    contact_id: '',
    related_to: parentObject?.id || '',
    related_to_type: parentObject?.type || '',
    is_prospecting: false,
    completed_call: true, // Default to true for logged calls
    meeting_held: false,
    is_property_prospecting_call: false,
    completed_property_call: false
  });

  const [contacts, setContacts] = useState<RelatedOption[]>([]);
  const [relatedOptions, setRelatedOptions] = useState<RelatedOption[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [relatedSearch, setRelatedSearch] = useState(parentObject?.name || '');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [showRelatedDropdown, setShowRelatedDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Search contacts with debouncing
  useEffect(() => {
    const searchContacts = async () => {
      if (contactSearch.length < 2) {
        setContacts([]);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('contact')
          .select('id, first_name, last_name, company')
          .or(`first_name.ilike.%${contactSearch}%,last_name.ilike.%${contactSearch}%,company.ilike.%${contactSearch}%`)
          .limit(10);

        if (error) throw error;

        const contactOptions: RelatedOption[] = (data || []).map(contact => ({
          id: contact.id,
          name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          type: 'contact',
          subtitle: contact.company || undefined
        }));

        setContacts(contactOptions);
      } catch (error) {
        console.error('Error searching contacts:', error);
      }
    };

    const timeoutId = setTimeout(searchContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [contactSearch]);

  // Search related objects with debouncing
  useEffect(() => {
    const searchRelated = async () => {
      if (relatedSearch.length < 2) {
        setRelatedOptions([]);
        return;
      }

      try {
        const searches = await Promise.all([
          // Search deals
          supabase
            .from('deal')
            .select('id, name')
            .ilike('name', `%${relatedSearch}%`)
            .limit(5),
          
          // Search contacts
          supabase
            .from('contact')
            .select('id, first_name, last_name, company')
            .or(`first_name.ilike.%${relatedSearch}%,last_name.ilike.%${relatedSearch}%,company.ilike.%${relatedSearch}%`)
            .limit(5),
          
          // Search clients
          supabase
            .from('client')
            .select('id, name')
            .ilike('name', `%${relatedSearch}%`)
            .limit(5),
        ]);

        const options: RelatedOption[] = [];

        // Add deals
        if (searches[0].data) {
          searches[0].data.forEach(deal => {
            options.push({
              id: deal.id,
              name: deal.name,
              type: 'deal'
            });
          });
        }

        // Add contacts
        if (searches[1].data) {
          searches[1].data.forEach(contact => {
            options.push({
              id: contact.id,
              name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
              type: 'contact',
              subtitle: contact.company || undefined
            });
          });
        }

        // Add clients
        if (searches[2].data) {
          searches[2].data.forEach(client => {
            options.push({
              id: client.id,
              name: client.name,
              type: 'client'
            });
          });
        }

        setRelatedOptions(options);
      } catch (error) {
        console.error('Error searching related objects:', error);
      }
    };

    const timeoutId = setTimeout(searchRelated, 300);
    return () => clearTimeout(timeoutId);
  }, [relatedSearch]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        subject: '',
        comments: '',
        contact_id: '',
        related_to: parentObject?.id || '',
        related_to_type: parentObject?.type || '',
        is_prospecting: false,
        completed_call: true,
        meeting_held: false,
        is_property_prospecting_call: false,
        completed_property_call: false
      });
      setRelatedSearch(parentObject?.name || '');
      setContactSearch('');
      setErrors({});
    }
  }, [isOpen, parentObject]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const newErrors: Record<string, string> = {};
    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }
    if (!formData.related_to) {
      newErrors.related_to = 'Related to field is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      // Get Call activity type
      const { data: callType, error: typeError } = await supabase
        .from('activity_type')
        .select('id')
        .eq('name', 'Call')
        .single();

      if (typeError || !callType) {
        throw new Error('Could not find Call activity type');
      }

      // Get Completed status
      const { data: completedStatus, error: statusError } = await supabase
        .from('activity_status')
        .select('id')
        .eq('name', 'Completed')
        .single();

      if (statusError || !completedStatus) {
        throw new Error('Could not find Completed status');
      }

      // Prepare the activity data
      const activityData: any = {
        subject: formData.subject,
        description: formData.comments || null,
        activity_type_id: callType.id,
        status_id: completedStatus.id,
        activity_date: new Date().toISOString(),
        completed_at: new Date().toISOString(),
        contact_id: formData.contact_id || null,
        is_prospecting: formData.is_prospecting,
        completed_call: formData.completed_call,
        meeting_held: formData.meeting_held,
        is_property_prospecting_call: formData.is_property_prospecting_call,
        completed_property_call: formData.completed_property_call
      };

      // Set the appropriate foreign key based on related_to_type
      switch (formData.related_to_type) {
        case 'deal':
          activityData.deal_id = formData.related_to;
          break;
        case 'contact':
          activityData.contact_id = formData.related_to;
          break;
        case 'client':
          activityData.client_id = formData.related_to;
          break;
        case 'property':
          activityData.property_id = formData.related_to;
          break;
        case 'site_submit':
          activityData.site_submit_id = formData.related_to;
          break;
        default:
          // Use generic related_object fields as fallback
          activityData.related_object_type = formData.related_to_type;
          activityData.related_object_id = formData.related_to;
          break;
      }

      // Create the call activity
      const { error: insertError } = await supabase
        .from('activity')
        .insert([activityData]);

      if (insertError) {
        throw insertError;
      }

      // Success
      onCallLogged?.();
      onClose();

    } catch (error) {
      console.error('Error logging call:', error);
      setErrors({ general: 'Failed to log call. Please try again.' });
    } finally {
      setIsLoading(false);
    }
  };

  const selectContact = (contact: RelatedOption) => {
    setFormData(prev => ({ ...prev, contact_id: contact.id }));
    setContactSearch(contact.name);
    setShowContactDropdown(false);
  };

  const selectRelatedObject = (option: RelatedOption) => {
    setFormData(prev => ({ 
      ...prev, 
      related_to: option.id,
      related_to_type: option.type
    }));
    setRelatedSearch(option.name);
    setShowRelatedDropdown(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-2xl shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b">
          <div className="flex items-center gap-2">
            <PhoneIcon className="w-5 h-5 text-blue-600" />
            <h3 className="text-lg font-semibold text-gray-900">Log Call</h3>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close modal"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* General Error */}
          {errors.general && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{errors.general}</p>
            </div>
          )}

          {/* Subject */}
          <div>
            <label htmlFor="subject" className="block text-sm font-medium text-gray-700 mb-1">
              Subject *
            </label>
            <input
              type="text"
              id="subject"
              value={formData.subject}
              onChange={(e) => setFormData(prev => ({ ...prev, subject: e.target.value }))}
              className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.subject ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter call subject"
            />
            {errors.subject && <p className="mt-1 text-sm text-red-600">{errors.subject}</p>}
          </div>

          {/* Comments */}
          <div>
            <label htmlFor="comments" className="block text-sm font-medium text-gray-700 mb-1">
              Comments
            </label>
            <textarea
              id="comments"
              value={formData.comments}
              onChange={(e) => setFormData(prev => ({ ...prev, comments: e.target.value }))}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter call notes or comments"
            />
          </div>

          {/* Related Contact */}
          <div className="relative">
            <label htmlFor="contact" className="block text-sm font-medium text-gray-700 mb-1">
              Related Contact
            </label>
            <div className="relative">
              <input
                type="text"
                value={contactSearch}
                onChange={(e) => {
                  setContactSearch(e.target.value);
                  setShowContactDropdown(true);
                }}
                onFocus={() => setShowContactDropdown(true)}
                className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search contacts..."
              />
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
            
            {/* Contact Dropdown */}
            {showContactDropdown && contacts.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {contacts.map((contact) => (
                  <button
                    key={contact.id}
                    type="button"
                    onClick={() => selectContact(contact)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{contact.name}</div>
                        {contact.subtitle && (
                          <div className="text-sm text-gray-500">{contact.subtitle}</div>
                        )}
                      </div>
                      {formData.contact_id === contact.id && (
                        <CheckIcon className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Related To */}
          <div className="relative">
            <label htmlFor="related" className="block text-sm font-medium text-gray-700 mb-1">
              Related To *
            </label>
            <div className="relative">
              <input
                type="text"
                value={relatedSearch}
                onChange={(e) => {
                  setRelatedSearch(e.target.value);
                  setShowRelatedDropdown(true);
                }}
                onFocus={() => setShowRelatedDropdown(true)}
                className={`w-full px-3 py-2 pl-10 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.related_to ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Search deals, contacts, clients..."
              />
              <MagnifyingGlassIcon className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            </div>
            
            {/* Related Dropdown */}
            {showRelatedDropdown && relatedOptions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                {relatedOptions.map((option) => (
                  <button
                    key={`${option.type}-${option.id}`}
                    type="button"
                    onClick={() => selectRelatedObject(option)}
                    className="w-full px-3 py-2 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{option.name}</div>
                        <div className="text-sm text-gray-500 capitalize">{option.type}</div>
                      </div>
                      {formData.related_to === option.id && formData.related_to_type === option.type && (
                        <CheckIcon className="w-4 h-4 text-blue-600" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            {errors.related_to && <p className="mt-1 text-sm text-red-600">{errors.related_to}</p>}
          </div>

          {/* Boolean Fields */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Call Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_prospecting}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_prospecting: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Prospecting Call</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.completed_call}
                  onChange={(e) => setFormData(prev => ({ ...prev, completed_call: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Completed Call</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.meeting_held}
                  onChange={(e) => setFormData(prev => ({ ...prev, meeting_held: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Meeting Held</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_property_prospecting_call}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_property_prospecting_call: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Property Prospecting Call</span>
              </label>

              <label className="flex items-center md:col-span-2">
                <input
                  type="checkbox"
                  checked={formData.completed_property_call}
                  onChange={(e) => setFormData(prev => ({ ...prev, completed_property_call: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Completed Property Call</span>
              </label>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Logging Call...
                </>
              ) : (
                <>
                  <PhoneIcon className="w-4 h-4" />
                  Log Call
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default LogCallModal;