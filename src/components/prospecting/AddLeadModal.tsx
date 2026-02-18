/**
 * AddLeadModal - Quick add a new lead/contact from the prospecting workspace
 *
 * Simplified form with essential fields for prospecting workflow:
 * - First Name, Last Name, Company
 * - Email, Phone, Mobile
 * - LinkedIn URL
 *
 * Auto-sets source_type to 'Lead' and optionally creates a follow-up task for today's call list.
 */

import { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { XMarkIcon, UserPlusIcon } from '@heroicons/react/24/outline';

interface AddLeadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLeadAdded: (contactId: string, contactName: string) => void;
}

interface FormData {
  first_name: string;
  last_name: string;
  company: string;
  email: string;
  phone: string;
  mobile_phone: string;
  linked_in_profile_link: string;
}

const initialFormData: FormData = {
  first_name: '',
  last_name: '',
  company: '',
  email: '',
  phone: '',
  mobile_phone: '',
  linked_in_profile_link: '',
};

export default function AddLeadModal({ isOpen, onClose, onLeadAdded }: AddLeadModalProps) {
  const [formData, setFormData] = useState<FormData>(initialFormData);
  const [addToCallList, setAddToCallList] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const resetForm = () => {
    setFormData(initialFormData);
    setAddToCallList(true);
    setErrors({});
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const updateField = (field: keyof FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.first_name.trim()) {
      newErrors.first_name = 'First name is required';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'Last name is required';
    }
    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setSaving(true);
    try {
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

      // Create the contact with source_type = 'Lead'
      const { data: contact, error: contactError } = await supabase
        .from('contact')
        .insert({
          first_name: formData.first_name.trim(),
          last_name: formData.last_name.trim(),
          company: formData.company.trim() || null,
          email: formData.email.trim() || null,
          phone: formData.phone.trim() || null,
          mobile_phone: formData.mobile_phone.trim() || null,
          linked_in_profile_link: formData.linked_in_profile_link.trim() || null,
          source_type: 'Lead',
          created_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .select()
        .single();

      if (contactError) throw contactError;

      // If "Add to call list" is checked, create a follow-up activity for today
      if (addToCallList && contact) {
        // Get the default/open status
        const { data: openStatus } = await supabase
          .from('activity_status')
          .select('id')
          .eq('is_default', true)
          .single();

        // Get Call activity type
        const { data: callType } = await supabase
          .from('activity_type')
          .select('id')
          .eq('name', 'Call')
          .single();

        if (openStatus) {
          await supabase
            .from('activity')
            .insert({
              contact_id: contact.id,
              subject: `Call ${formData.first_name} ${formData.last_name}${formData.company ? ` at ${formData.company}` : ''}`,
              activity_date: today,
              status_id: openStatus.id,
              activity_type_id: callType?.id || null,
              is_prospecting: true,
              // Note: is_prospecting_call and completed_call are NOT set
              // This creates an open task that appears in the call list
              // Those flags are set when the call is actually completed
              created_at: now.toISOString(),
              updated_at: now.toISOString(),
            });
        }
      }

      const contactName = `${formData.first_name} ${formData.last_name}`.trim();
      onLeadAdded(contact.id, contactName);
      handleClose();
    } catch (err) {
      console.error('Error saving lead:', err);
      alert('Failed to save lead. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-[71] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
          {/* Header */}
          <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-green-600 to-emerald-600">
            <div className="flex items-center gap-2 text-white">
              <UserPlusIcon className="w-5 h-5" />
              <h2 className="text-lg font-semibold">Add Lead to Call List</h2>
            </div>
            <button
              onClick={handleClose}
              className="p-1 text-white/80 hover:text-white hover:bg-white/20 rounded-full transition-colors"
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Form */}
          <div className="p-5 space-y-4 overflow-y-auto flex-1">
            {/* Name Row */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.first_name}
                  onChange={(e) => updateField('first_name', e.target.value)}
                  placeholder="John"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    errors.first_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                  autoFocus
                />
                {errors.first_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.first_name}</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.last_name}
                  onChange={(e) => updateField('last_name', e.target.value)}
                  placeholder="Smith"
                  className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                    errors.last_name ? 'border-red-300' : 'border-gray-300'
                  }`}
                />
                {errors.last_name && (
                  <p className="mt-1 text-xs text-red-600">{errors.last_name}</p>
                )}
              </div>
            </div>

            {/* Company */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company
              </label>
              <input
                type="text"
                value={formData.company}
                onChange={(e) => updateField('company', e.target.value)}
                placeholder="Acme Corp"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => updateField('email', e.target.value)}
                placeholder="john@acme.com"
                className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 ${
                  errors.email ? 'border-red-300' : 'border-gray-300'
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-xs text-red-600">{errors.email}</p>
              )}
            </div>

            {/* Phone Numbers */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => updateField('phone', e.target.value)}
                  placeholder="(555) 123-4567"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mobile
                </label>
                <input
                  type="tel"
                  value={formData.mobile_phone}
                  onChange={(e) => updateField('mobile_phone', e.target.value)}
                  placeholder="(555) 987-6543"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            {/* LinkedIn */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                LinkedIn URL
              </label>
              <input
                type="url"
                value={formData.linked_in_profile_link}
                onChange={(e) => updateField('linked_in_profile_link', e.target.value)}
                placeholder="https://linkedin.com/in/johnsmith"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* Add to call list checkbox */}
            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="addToCallList"
                checked={addToCallList}
                onChange={(e) => setAddToCallList(e.target.checked)}
                className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
              />
              <label htmlFor="addToCallList" className="text-sm text-gray-700">
                Add to today's call list
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-4 border-t border-gray-200 bg-gray-50 flex justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? (
                <>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <UserPlusIcon className="w-4 h-4" />
                  Add Lead
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
