/**
 * CreateAssignmentModal - Lightweight modal for creating a new assignment
 * from within the SiteSubmitCreateForm.
 *
 * Pre-fills the client and auto-generates a name.
 * Only requires essential fields — the rest can be filled in later
 * from the full AssignmentDetailsForm.
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import { prepareInsert } from '../../lib/supabaseHelpers';
import { AssignmentSearchResult } from '../../hooks/useAssignmentSearch';

interface CreateAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (assignment: AssignmentSearchResult) => void;
  clientId: string;
  clientName: string;
}

export default function CreateAssignmentModal({
  isOpen,
  onClose,
  onCreated,
  clientId,
  clientName,
}: CreateAssignmentModalProps) {
  const [assignmentName, setAssignmentName] = useState('');
  const [siteCriteria, setSiteCriteria] = useState('');
  const [priorityId, setPriorityId] = useState('');
  const [priorityOptions, setPriorityOptions] = useState<{ id: string; label: string; is_default?: boolean | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch priorities and set defaults when modal opens
  useEffect(() => {
    if (!isOpen) return;

    // Reset form
    setAssignmentName(`${clientName} - New Assignment`);
    setSiteCriteria('');
    setError(null);

    const fetchPriorities = async () => {
      const { data } = await supabase
        .from('assignment_priority')
        .select('id, label, is_default')
        .eq('active', true)
        .order('sort_order');

      if (data) {
        setPriorityOptions(data);
        const defaultPriority = data.find(p => p.is_default);
        if (defaultPriority) {
          setPriorityId(defaultPriority.id);
        }
      }
    };

    fetchPriorities();
  }, [isOpen, clientName]);

  const handleCreate = async () => {
    if (!assignmentName.trim()) {
      setError('Assignment name is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        assignment_name: assignmentName.trim(),
        client_id: clientId,
        site_criteria: siteCriteria.trim() || null,
        priority_id: priorityId || null,
      };

      const { data, error: insertError } = await supabase
        .from('assignment')
        .insert(prepareInsert(payload))
        .select('id, assignment_name, client_id, assignment_value, due_date, progress')
        .single();

      if (insertError) throw insertError;

      onCreated({
        id: data.id,
        assignment_name: data.assignment_name || '',
        client_id: data.client_id,
        client_name: clientName,
        assignment_value: data.assignment_value,
        due_date: data.due_date,
        progress: data.progress,
      });
      onClose();
    } catch (err: any) {
      console.error('Error creating assignment:', err);
      setError(err.message || 'Failed to create assignment');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[10002]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-[10003] flex items-center justify-center p-4">
        <div
          className="bg-white rounded-lg shadow-xl w-full max-w-md"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-[#002147]">Create New Assignment</h3>
            <p className="text-sm text-gray-500 mt-1">for {clientName}</p>
          </div>

          {/* Body */}
          <div className="px-6 py-4 space-y-4">
            {/* Assignment Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignment Name *
              </label>
              <input
                type="text"
                value={assignmentName}
                onChange={(e) => {
                  setAssignmentName(e.target.value);
                  if (error) setError(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Assignment name"
                autoFocus
              />
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priorityId}
                onChange={(e) => setPriorityId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select priority...</option>
                {priorityOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Site Criteria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Site Criteria</label>
              <textarea
                value={siteCriteria}
                onChange={(e) => setSiteCriteria(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                placeholder="Describe the site requirements..."
              />
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex gap-3 justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !assignmentName.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-[#002147] rounded hover:bg-[#003167] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Assignment'
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
