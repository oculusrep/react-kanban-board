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
  existingActivity?: any; // For editing existing calls
}

interface CallFormData {
  subject: string;
  comments: string;
  contact_id: string;
  related_object_id: string;
  related_object_type: string;
  is_prospecting_call: boolean;
  completed_call: boolean;
  meeting_held: boolean;
  is_property_prospecting_call: boolean;
  completed_property_call: boolean;
}

const LogCallModal: React.FC<LogCallModalProps> = ({
  isOpen,
  onClose,
  onCallLogged,
  parentObject,
  existingActivity
}) => {
  const [formData, setFormData] = useState<CallFormData>({
    subject: existingActivity?.subject || '',
    comments: existingActivity?.description || '',
    contact_id: existingActivity?.contact_id || '',
    related_object_id: existingActivity?.deal_id || existingActivity?.client_id || existingActivity?.property_id || existingActivity?.site_submit_id || parentObject?.id || '',
    related_object_type: existingActivity ? (existingActivity.deal_id ? 'deal' : existingActivity.client_id ? 'client' : existingActivity.property_id ? 'property' : existingActivity.site_submit_id ? 'site_submit' : existingActivity.contact_id ? 'contact' : '') : parentObject?.type || '',
    is_prospecting_call: existingActivity?.is_prospecting_call || false,
    completed_call: existingActivity?.completed_call || false,
    meeting_held: existingActivity?.meeting_held || false,
    is_property_prospecting_call: existingActivity?.is_property_prospecting_call || false,
    completed_property_call: existingActivity?.completed_property_call || false
  });

  const [contacts, setContacts] = useState<(RelatedOption & { company?: string })[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [showContactDropdown, setShowContactDropdown] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [selectedRelatedObject, setSelectedRelatedObject] = useState<RelatedOption | null>(null);

  // Search contacts with debouncing
  useEffect(() => {
    const searchContacts = async () => {
      if (contactSearch.length < 2) {
        setContacts([]);
        return;
      }

      try {
        // Handle spaces in search by creating multiple OR conditions
        const searchTerms = contactSearch.trim().split(/\s+/);
        let orConditions = [];

        if (searchTerms.length === 1) {
          // Single term - search in all fields
          orConditions = [
            `first_name.ilike.%${searchTerms[0]}%`,
            `last_name.ilike.%${searchTerms[0]}%`,
            `company.ilike.%${searchTerms[0]}%`
          ];
        } else {
          // Multiple terms - add all combinations
          for (const term of searchTerms) {
            orConditions.push(
              `first_name.ilike.%${term}%`,
              `last_name.ilike.%${term}%`,
              `company.ilike.%${term}%`
            );
          }

          // Also search for the full string in each field
          orConditions.push(
            `first_name.ilike.%${contactSearch}%`,
            `last_name.ilike.%${contactSearch}%`,
            `company.ilike.%${contactSearch}%`
          );
        }

        const { data, error } = await supabase
          .from('contact')
          .select('id, first_name, last_name, company')
          .or(orConditions.join(','))
          .limit(50); // Get more results for better sorting

        if (error) throw error;

        if (!data) {
          setContacts([]);
          return;
        }

        // Sort results by relevance
        const searchLower = contactSearch.toLowerCase().trim();
        const sortSearchTerms = searchLower.split(/\s+/);

        const sortedContacts = data.sort((a, b) => {
          const aFullName = `${a.first_name || ''} ${a.last_name || ''}`.trim().toLowerCase();
          const bFullName = `${b.first_name || ''} ${b.last_name || ''}`.trim().toLowerCase();
          const aFirstName = (a.first_name || '').toLowerCase();
          const aLastName = (a.last_name || '').toLowerCase();
          const bFirstName = (b.first_name || '').toLowerCase();
          const bLastName = (b.last_name || '').toLowerCase();

          // Exact full name match gets highest priority
          if (aFullName === searchLower) return -1;
          if (bFullName === searchLower) return 1;

          // Multi-term exact match (e.g., "john smith" matches first: John, last: Smith)
          if (sortSearchTerms.length >= 2) {
            const aExactMatch = aFirstName === sortSearchTerms[0] && aLastName === sortSearchTerms[1];
            const bExactMatch = bFirstName === sortSearchTerms[0] && bLastName === sortSearchTerms[1];
            if (aExactMatch && !bExactMatch) return -1;
            if (bExactMatch && !aExactMatch) return 1;

            // Multi-term starts with match
            const aStartsMatch = aFirstName.startsWith(sortSearchTerms[0]) && aLastName.startsWith(sortSearchTerms[1]);
            const bStartsMatch = bFirstName.startsWith(sortSearchTerms[0]) && bLastName.startsWith(sortSearchTerms[1]);
            if (aStartsMatch && !bStartsMatch) return -1;
            if (bStartsMatch && !aStartsMatch) return 1;
          }

          // Full name starts with search gets next priority
          if (aFullName.startsWith(searchLower) && !bFullName.startsWith(searchLower)) return -1;
          if (bFullName.startsWith(searchLower) && !aFullName.startsWith(searchLower)) return 1;

          // First name exact match
          if (aFirstName === searchLower && bFirstName !== searchLower) return -1;
          if (bFirstName === searchLower && aFirstName !== searchLower) return 1;

          // Last name exact match
          if (aLastName === searchLower && bLastName !== searchLower) return -1;
          if (bLastName === searchLower && aLastName !== searchLower) return 1;

          // First name starts with search
          if (aFirstName.startsWith(searchLower) && !bFirstName.startsWith(searchLower)) return -1;
          if (bFirstName.startsWith(searchLower) && !aFirstName.startsWith(searchLower)) return 1;

          // Last name starts with search
          if (aLastName.startsWith(searchLower) && !bLastName.startsWith(searchLower)) return -1;
          if (bLastName.startsWith(searchLower) && !aLastName.startsWith(searchLower)) return 1;

          // Finally, sort alphabetically by full name
          return aFullName.localeCompare(bFullName);
        });

        const contactOptions: (RelatedOption & { company?: string })[] = sortedContacts.slice(0, 10).map(contact => ({
          id: contact.id,
          label: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          type: 'contact',
          company: contact.company || undefined
        }));

        setContacts(contactOptions);
      } catch (error) {
        console.error('Error searching contacts:', error);
      }
    };

    const timeoutId = setTimeout(searchContacts, 300);
    return () => clearTimeout(timeoutId);
  }, [contactSearch]);

  // Removed complex related object search since we're using simplified approach

  // Fetch parent object data to populate name
  useEffect(() => {
    const fetchParentObjectData = async () => {
      if (!parentObject?.id || !parentObject.type) return;

      try {
        let query: any;
        let labelField: string;

        switch (parentObject.type) {
          case 'deal':
            query = supabase.from('deal').select('id, deal_name').eq('id', parentObject.id).single();
            labelField = 'deal_name';
            break;
          case 'contact':
            query = supabase.from('contact').select('id, first_name, last_name, company').eq('id', parentObject.id).single();
            labelField = 'name';
            break;
          case 'client':
            query = supabase.from('client').select('id, client_name').eq('id', parentObject.id).single();
            labelField = 'client_name';
            break;
          case 'property':
            query = supabase.from('property').select('id, property_name').eq('id', parentObject.id).single();
            labelField = 'property_name';
            break;
          case 'site_submit':
            query = supabase.from('site_submit').select('id, site_submit_name').eq('id', parentObject.id).single();
            labelField = 'site_submit_name';
            break;
          default:
            return;
        }

        const { data: objectData, error } = await query;
        if (error || !objectData) return;

        let label: string;
        if (parentObject.type === 'contact') {
          label = `${objectData.first_name || ''} ${objectData.last_name || ''}`.trim();
        } else {
          label = objectData[labelField as keyof typeof objectData] as string;
        }

        const defaultRelatedObject: RelatedOption = {
          id: objectData.id,
          label: label || parentObject.name,
          type: parentObject.type
        };

        setSelectedRelatedObject(defaultRelatedObject);
      } catch (error) {
        console.error('Error fetching parent object data:', error);
      }
    };

    fetchParentObjectData();
  }, [parentObject]);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData({
        subject: existingActivity?.subject || '',
        comments: existingActivity?.description || '',
        contact_id: existingActivity?.contact_id || '',
        related_object_id: existingActivity?.deal_id || existingActivity?.client_id || existingActivity?.property_id || existingActivity?.site_submit_id || parentObject?.id || '',
        related_object_type: existingActivity ? (existingActivity.deal_id ? 'deal' : existingActivity.client_id ? 'client' : existingActivity.property_id ? 'property' : existingActivity.site_submit_id ? 'site_submit' : existingActivity.contact_id ? 'contact' : '') : parentObject?.type || '',
        is_prospecting_call: existingActivity?.is_prospecting_call || false,
        completed_call: existingActivity?.completed_call || false,
        meeting_held: existingActivity?.meeting_held || false,
        is_property_prospecting_call: existingActivity?.is_property_prospecting_call || false,
        completed_property_call: existingActivity?.completed_property_call || false
      });

      // Set contact search to existing contact name if editing
      if (existingActivity?.contact) {
        const contactName = `${existingActivity.contact.first_name || ''} ${existingActivity.contact.last_name || ''}`.trim();
        setContactSearch(contactName);
      } else {
        setContactSearch('');
      }

      setErrors({});
      // selectedRelatedObject is set by fetchParentObjectData effect
    }
  }, [isOpen, parentObject, existingActivity]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form
    const newErrors: Record<string, string> = {};
    if (!formData.subject.trim()) {
      newErrors.subject = 'Subject is required';
    }
    // related_object_id is automatically set from parentObject, no need to validate

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setIsLoading(true);
    try {
      if (existingActivity) {
        // Update existing call
        const updateData: any = {
          subject: formData.subject,
          description: formData.comments || null,
          updated_at: new Date().toISOString(),
          contact_id: formData.contact_id || null,
          is_prospecting_call: formData.is_prospecting_call,
          completed_call: formData.completed_call,
          meeting_held: formData.meeting_held,
          is_property_prospecting_call: formData.is_property_prospecting_call,
          completed_property_call: formData.completed_property_call
        };

        const { error: updateError } = await supabase
          .from('activity')
          .update(updateData)
          .eq('id', existingActivity.id);

        if (updateError) {
          throw updateError;
        }
      } else {
        // Create new call
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
          is_prospecting_call: formData.is_prospecting_call,
          completed_call: formData.completed_call,
          meeting_held: formData.meeting_held,
          is_property_prospecting_call: formData.is_property_prospecting_call,
          completed_property_call: formData.completed_property_call
        };

        // Set the appropriate foreign key based on related_object_type
        switch (formData.related_object_type) {
          case 'deal':
            activityData.deal_id = formData.related_object_id;
            break;
          case 'contact':
            // Don't override contact_id if it's already set from the contact field
            if (!activityData.contact_id) {
              activityData.contact_id = formData.related_object_id;
            }
            break;
          case 'client':
            activityData.client_id = formData.related_object_id;
            break;
          case 'property':
            activityData.property_id = formData.related_object_id;
            break;
          case 'site_submit':
            activityData.site_submit_id = formData.related_object_id;
            break;
          default:
            // Use generic related_object fields as fallback
            activityData.related_object_type = formData.related_object_type;
            activityData.related_object_id = formData.related_object_id;
            break;
        }

        // Create the call activity
        const { error: insertError } = await supabase
          .from('activity')
          .insert([activityData]);

        if (insertError) {
          throw insertError;
        }
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
    setContactSearch(contact.label);
    setShowContactDropdown(false);
  };

  // Removed selectRelatedObject since we're using simplified approach

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[60]" onClick={onClose} />
      
      {/* Modal */}
      <div className={`fixed inset-0 lg:inset-y-0 lg:right-0 lg:left-auto w-full lg:w-[600px] bg-white shadow-xl transform transition-transform duration-300 z-[60] ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } flex flex-col`}>
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-2">
            <PhoneIcon className="w-5 h-5 text-green-600" />
            <h3 className="text-lg font-semibold text-gray-900">{existingActivity ? 'Edit Call' : 'Log Call'}</h3>
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
        <div className="flex-1 overflow-y-auto">
          <form id="log-call-form" onSubmit={handleSubmit} className="p-4 space-y-6">
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
                        <div className="font-medium text-gray-900">{contact.label}</div>
                        {contact.company && (
                          <div className="text-sm text-gray-500">{contact.company}</div>
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

          {/* Related To (Read-only for debugging) */}
          {selectedRelatedObject && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Related To
              </label>
              <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                <div className="font-medium text-gray-900">{selectedRelatedObject.label}</div>
                <div className="text-sm text-gray-500 capitalize">
                  {selectedRelatedObject.type}
                </div>
              </div>
            </div>
          )}

          {/* Boolean Fields */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-gray-700">Call Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.is_prospecting_call}
                  onChange={(e) => setFormData(prev => ({ ...prev, is_prospecting_call: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Prospecting Call</span>
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
                  checked={formData.completed_property_call}
                  onChange={(e) => setFormData(prev => ({ ...prev, completed_property_call: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Completed Property Call</span>
              </label>

              <label className="flex items-center md:col-span-2">
                <input
                  type="checkbox"
                  checked={formData.meeting_held}
                  onChange={(e) => setFormData(prev => ({ ...prev, meeting_held: e.target.checked }))}
                  className="rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50"
                />
                <span className="ml-2 text-sm text-gray-700">Meeting Held</span>
              </label>
            </div>
          </div>

          </form>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200 bg-white">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="log-call-form"
            disabled={isLoading}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                {existingActivity ? 'Updating Call...' : 'Logging Call...'}
              </>
            ) : (
              <>
                <PhoneIcon className="w-4 h-4" />
                {existingActivity ? 'Update Call' : 'Log Call'}
              </>
            )}
          </button>
        </div>
      </div>
    </>
  );
};

export default LogCallModal;