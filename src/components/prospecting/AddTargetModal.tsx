import React, { useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { prepareInsert } from '../../lib/supabaseHelpers';
import { useAuth } from '../../contexts/AuthContext';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { COMMON_SOURCES } from '../../types/prospecting';

interface AddTargetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTargetAdded?: () => void;
}

const AddTargetModal: React.FC<AddTargetModalProps> = ({
  isOpen,
  onClose,
  onTargetAdded
}) => {
  const { user } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [website, setWebsite] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState('');
  const [customSource, setCustomSource] = useState('');
  const [priority, setPriority] = useState(3);

  const resetForm = () => {
    setCompanyName('');
    setWebsite('');
    setNotes('');
    setSource('');
    setCustomSource('');
    setPriority(3);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) return;

    setIsSubmitting(true);
    try {
      // Get current user ID
      let ownerId = null;
      if (user?.email) {
        const { data: userData } = await supabase
          .from('user')
          .select('id')
          .eq('email', user.email)
          .single();
        ownerId = userData?.id;
      }

      const targetData = {
        company_name: companyName.trim(),
        website: website.trim() || null,
        notes: notes.trim() || null,
        source: source === 'Other' ? customSource.trim() : source || null,
        priority,
        status: 'needs_research',
        owner_id: ownerId,
        created_by_id: ownerId
      };

      const { error } = await supabase
        .from('prospecting_target')
        .insert(prepareInsert(targetData));

      if (error) {
        throw error;
      }

      console.log('✅ Target added successfully');
      resetForm();
      onTargetAdded?.();
      onClose();
    } catch (error) {
      console.error('Error adding target:', error);
      alert('Failed to add target. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-[70]" onClick={handleClose} />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Add Target Company</h3>
              <p className="text-sm text-gray-500">Add a company to research and prospect</p>
            </div>
            <button
              onClick={handleClose}
              className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {/* Company Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Acme Corporation"
                required
                autoFocus
              />
            </div>

            {/* Website */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Website
              </label>
              <input
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="https://example.com"
              />
            </div>

            {/* Source */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Source
              </label>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select source...</option>
                {COMMON_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              {source === 'Other' && (
                <input
                  type="text"
                  value={customSource}
                  onChange={(e) => setCustomSource(e.target.value)}
                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter custom source"
                />
              )}
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <div className="flex gap-2">
                {[
                  { value: 1, label: 'Hot', color: 'bg-red-500' },
                  { value: 2, label: 'High', color: 'bg-orange-500' },
                  { value: 3, label: 'Medium', color: 'bg-yellow-500' },
                  { value: 4, label: 'Low', color: 'bg-blue-500' },
                  { value: 5, label: 'Cold', color: 'bg-gray-400' }
                ].map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors ${
                      priority === p.value
                        ? `${p.color} text-white`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Why is this a good target? Any context for research..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={handleClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !companyName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Adding...' : 'Add Target'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
};

export default AddTargetModal;
