import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import { Assignment, AssignmentPriority } from '../lib/types';
import ClientSelector from './mapping/ClientSelector';
import { ClientSearchResult } from '../hooks/useClientSearch';
import { X } from 'lucide-react';

interface AddAssignmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (assignment: Assignment) => void;
  preselectedClientId?: string | null;
}

const AddAssignmentModal: React.FC<AddAssignmentModalProps> = ({
  isOpen,
  onClose,
  onSave,
  preselectedClientId
}) => {
  const [assignmentName, setAssignmentName] = useState('');
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const [assignmentValue, setAssignmentValue] = useState<string>('');
  const [dueDate, setDueDate] = useState('');
  const [siteCriteria, setSiteCriteria] = useState('');
  const [priorityId, setPriorityId] = useState<string>('');
  const [priorities, setPriorities] = useState<AssignmentPriority[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load assignment priorities
  useEffect(() => {
    const loadPriorities = async () => {
      const { data, error } = await supabase
        .from('assignment_priority')
        .select('*')
        .eq('active', true)
        .order('sort_order');

      if (data && !error) {
        setPriorities(data);
      }
    };

    if (isOpen) {
      loadPriorities();
    }
  }, [isOpen]);

  // Load preselected client if provided
  useEffect(() => {
    const loadPreselectedClient = async () => {
      if (preselectedClientId) {
        const { data, error } = await supabase
          .from('client')
          .select('id, client_name, sf_client_type, phone')
          .eq('id', preselectedClientId)
          .single();

        if (data && !error) {
          setSelectedClient({
            id: data.id,
            client_name: data.client_name || 'Unnamed Client',
            type: data.sf_client_type,
            phone: data.phone,
            deal_count: 0,
            site_submit_count: 0
          });
        }
      }
    };

    if (isOpen && preselectedClientId) {
      loadPreselectedClient();
    }
  }, [isOpen, preselectedClientId]);

  // Reset form when modal closes or opens
  useEffect(() => {
    if (!isOpen) {
      setAssignmentName('');
      setSelectedClient(null);
      setAssignmentValue('');
      setDueDate('');
      setSiteCriteria('');
      setPriorityId('');
      setError(null);
    }
  }, [isOpen]);

  const handleSave = async () => {
    // Validation
    if (!assignmentName.trim()) {
      setError('Assignment name is required');
      return;
    }
    if (!selectedClient) {
      setError('Client is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Get current user for owner_id
      const { data: { user } } = await supabase.auth.getUser();

      const insertData: any = {
        assignment_name: assignmentName,
        client_id: selectedClient.id,
        assignment_value: assignmentValue ? parseFloat(assignmentValue) : null,
        due_date: dueDate || null,
        site_criteria: siteCriteria || null,
        priority_id: priorityId || null,
        owner_id: user?.id || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const { data, error: insertError } = await supabase
        .from('assignment')
        .insert(prepareInsert(insertData))
        .select()
        .single();

      if (insertError) {
        console.error('Error creating assignment:', insertError);
        setError(insertError.message);
        return;
      }

      if (data) {
        console.log('✅ Assignment created successfully:', data);
        onSave(data);
        onClose();
      }
    } catch (err) {
      console.error('Error saving assignment:', err);
      setError(err instanceof Error ? err.message : 'Failed to save assignment');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-[70]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 flex items-center justify-center z-[70] p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-200 sticky top-0 bg-white">
            <h2 className="text-xl font-semibold text-gray-900">Create New Assignment</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title="Close"
            >
              <X size={20} className="text-gray-400" />
            </button>
          </div>

          {/* Form Content */}
          <div className="p-4 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Assignment Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignment Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={assignmentName}
                onChange={(e) => setAssignmentName(e.target.value)}
                placeholder="Enter assignment name..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                autoFocus
              />
            </div>

            {/* Client Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Client <span className="text-red-500">*</span>
              </label>
              <ClientSelector
                selectedClient={selectedClient}
                onClientSelect={setSelectedClient}
                placeholder="Search for client..."
              />
            </div>

            {/* Assignment Value */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assignment Value
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={assignmentValue}
                  onChange={(e) => setAssignmentValue(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priorityId}
                onChange={(e) => setPriorityId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select priority...</option>
                {priorities.map((priority) => (
                  <option key={priority.id} value={priority.id}>
                    {priority.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Site Criteria */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Site Criteria
              </label>
              <textarea
                rows={3}
                value={siteCriteria}
                onChange={(e) => setSiteCriteria(e.target.value)}
                placeholder="Enter site criteria and requirements..."
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-gray-200 p-4 bg-gray-50 flex justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Assignment'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AddAssignmentModal;
