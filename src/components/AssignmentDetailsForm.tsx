import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { Assignment, AssignmentPriority } from "../lib/types";
import { formatCurrency } from "../utils/format";
import ReferralPayeeAutocomplete from "./ReferralPayeeAutocomplete";
import AssignmentCurrencyField from "./AssignmentCurrencyField";
import AssignmentPercentField from "./AssignmentPercentField";
import ConvertToDealModal from "./ConvertToDealModal";

interface Props {
  assignment: Assignment;
  onSave: (updatedAssignment: Assignment) => void;
}

export default function AssignmentDetailsForm({ assignment, onSave }: Props) {
  const navigate = useNavigate();
  const [form, setForm] = useState<Assignment>(assignment);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showConvertModal, setShowConvertModal] = useState(false);
  
  // Lookup options
  const [priorityOptions, setPriorityOptions] = useState<AssignmentPriority[]>([]);
  const [clientOptions, setClientOptions] = useState<{ id: string; label: string }[]>([]);
  const [dealOptions, setDealOptions] = useState<{ id: string; label: string }[]>([]);
  const [userOptions, setUserOptions] = useState<{ id: string; label: string }[]>([]);
  
  // Search states for autocomplete
  const [clientSearch, setClientSearch] = useState("");
  const [clientSuggestions, setClientSuggestions] = useState<{ id: string; label: string }[]>([]);
  const [dealSearch, setDealSearch] = useState("");
  const [dealSuggestions, setDealSuggestions] = useState<{ id: string; label: string }[]>([]);

  useEffect(() => {
    // Calculate fee on initial load
    const assignmentWithFee = { ...assignment };
    if (assignment.assignment_value && assignment.commission) {
      const calculatedFee = (assignment.assignment_value || 0) * ((assignment.commission || 0) / 100);
      assignmentWithFee.fee = Math.round(calculatedFee * 100) / 100;
    }
    
    setForm(assignmentWithFee);
    setErrors({});
    
    // Clear search suggestions when switching assignments
    setClientSuggestions([]);
    setDealSuggestions([]);
    
    // Set initial search values if assignment has related records, or clear if not
    if (assignment.client_id) {
      supabase
        .from('client')
        .select('client_name')
        .eq('id', assignment.client_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setClientSearch(data.client_name || '');
          }
        });
    } else {
      setClientSearch('');
    }
    
    if (assignment.deal_id) {
      supabase
        .from('deal')
        .select('deal_name')
        .eq('id', assignment.deal_id)
        .single()
        .then(({ data }) => {
          if (data) {
            setDealSearch(data.deal_name || '');
          }
        });
    } else {
      setDealSearch('');
    }
  }, [assignment]);

  // Fetch lookup options
  useEffect(() => {
    const fetchLookups = async () => {
      // Fetch assignment priorities
      const { data: priorities } = await supabase
        .from('assignment_priority')
        .select('*')
        .eq('active', true)
        .order('sort_order');
      
      if (priorities) setPriorityOptions(priorities);

      // Fetch users for owner selection
      const { data: users } = await supabase
        .from('user')
        .select('id, name')
        .order('name');
      
      if (users) setUserOptions(users.map(u => ({ id: u.id, label: u.name || 'Unknown User' })));
    };
    
    fetchLookups();
  }, []);

  // Client search functionality
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (clientSearch.trim().length > 0) {
        const { data } = await supabase
          .from('client')
          .select('id, client_name')
          .ilike('client_name', `%${clientSearch}%`)
          .limit(5);
        
        if (data) {
          setClientSuggestions(data.map(c => ({ 
            id: c.id, 
            label: c.client_name || 'Unnamed Client' 
          })));
        }
      } else {
        setClientSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [clientSearch]);

  // Deal search functionality
  useEffect(() => {
    const searchTimeout = setTimeout(async () => {
      if (dealSearch.trim().length > 0) {
        const { data } = await supabase
          .from('deal')
          .select('id, deal_name')
          .ilike('deal_name', `%${dealSearch}%`)
          .limit(5);
        
        if (data) {
          setDealSuggestions(data.map(d => ({ 
            id: d.id, 
            label: d.deal_name || 'Unnamed Deal' 
          })));
        }
      } else {
        setDealSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(searchTimeout);
  }, [dealSearch]);

  const updateField = async (field: keyof Assignment, value: any) => {
    // Update form state immediately
    let updatedForm = { ...form, [field]: value };
    
    // Calculate fee if assignment_value or commission changed
    if (field === 'assignment_value' || field === 'commission') {
      const assignmentValue = field === 'assignment_value' ? value : updatedForm.assignment_value;
      const commission = field === 'commission' ? value : updatedForm.commission;
      const calculatedFee = (assignmentValue || 0) * ((commission || 0) / 100);
      updatedForm.fee = Math.round(calculatedFee * 100) / 100; // Round to 2 decimal places
    }
    
    setForm(updatedForm);
    
    // Clear field-specific errors
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }

    // Auto-save to database (except for new assignments)
    if (form.id && form.id !== 'new') {
      try {
        const assignmentPayload = {
          assignment_name: updatedForm.assignment_name,
          assignment_value: updatedForm.assignment_value,
          client_id: updatedForm.client_id,
          deal_id: updatedForm.deal_id,
          owner_id: updatedForm.owner_id,
          priority_id: updatedForm.priority_id,
          transaction_type_id: updatedForm.transaction_type_id,
          due_date: updatedForm.due_date,
          commission: updatedForm.commission,
          fee: updatedForm.fee,
          referral_fee: updatedForm.referral_fee,
          referral_payee_id: updatedForm.referral_payee_id,
          scoped: updatedForm.scoped,
          site_criteria: updatedForm.site_criteria,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from('assignment')
          .update(assignmentPayload)
          .eq('id', form.id)
          .select()
          .single();

        if (error) throw error;
        if (data) {
          // Update parent component with saved data
          onSave(data);
        }
      } catch (err) {
        console.error('Error auto-saving assignment:', err);
        // Show a brief error message but don't block the UI
        alert(`Auto-save failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    if (!form.assignment_name?.trim()) {
      newErrors.assignment_name = 'Assignment name is required';
    }
    
    if (!form.priority_id) {
      newErrors.priority_id = 'Priority is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleCreateNewAssignment = async () => {
    if (!validateForm()) return;
    
    setSaving(true);
    
    // Calculate fee before saving
    const calculatedFee = (form.assignment_value || 0) * ((form.commission || 0) / 100);
    
    const assignmentPayload = {
      assignment_name: form.assignment_name,
      assignment_value: form.assignment_value,
      client_id: form.client_id,
      deal_id: form.deal_id,
      owner_id: form.owner_id,
      priority_id: form.priority_id,
      transaction_type_id: form.transaction_type_id,
      due_date: form.due_date,
      commission: form.commission,
      fee: Math.round(calculatedFee * 100) / 100,
      referral_fee: form.referral_fee,
      referral_payee_id: form.referral_payee_id,
      scoped: form.scoped,
      site_criteria: form.site_criteria,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { data, error } = await supabase
        .from('assignment')
        .insert([assignmentPayload])
        .select()
        .single();
      
      if (error) throw error;
      if (data) onSave(data);
    } catch (err) {
      console.error('Error creating assignment:', err);
      alert(`Error creating assignment: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Assignment Details Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Assignment Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Assignment Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assignment Name *
            </label>
            <input
              type="text"
              value={form.assignment_name || ''}
              onChange={(e) => updateField('assignment_name', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.assignment_name ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Enter assignment name"
              tabIndex={1}
            />
            {errors.assignment_name && (
              <p className="mt-1 text-sm text-red-600">{errors.assignment_name}</p>
            )}
          </div>

          {/* Assignment Value */}
          <AssignmentCurrencyField
            label="Assignment Value"
            value={form.assignment_value}
            onChange={(v) => updateField('assignment_value', v)}
            placeholder="0.00"
            maxValue={1000000000}
            tabIndex={2}
          />

          {/* Priority */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority *
            </label>
            <select
              value={form.priority_id || ''}
              onChange={(e) => updateField('priority_id', e.target.value || null)}
              className={`w-full px-3 py-2 border rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.priority_id ? 'border-red-500' : 'border-gray-300'
              }`}
              tabIndex={3}
            >
              <option value="">Select priority...</option>
              {priorityOptions.map(priority => (
                <option key={priority.id} value={priority.id}>
                  {priority.label}
                </option>
              ))}
            </select>
            {errors.priority_id && (
              <p className="mt-1 text-sm text-red-600">{errors.priority_id}</p>
            )}
          </div>

          {/* Owner */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Owner
            </label>
            <select
              value={form.owner_id || ''}
              onChange={(e) => updateField('owner_id', e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              tabIndex={4}
            >
              <option value="">Select owner...</option>
              {userOptions.map(user => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </select>
          </div>

        </div>
      </div>

      {/* Relationships Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Relationships</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Client Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Client</label>
            <input
              type="text"
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Search clients..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              tabIndex={5}
            />
            {clientSuggestions.filter((s) => s.label !== clientSearch).length > 0 && (
              <ul className="bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto shadow-lg">
                {clientSuggestions
                  .filter((s) => s.label !== clientSearch)
                  .map((client) => (
                    <li
                      key={client.id}
                      onClick={() => {
                        updateField('client_id', client.id);
                        setClientSearch(client.label);
                        setClientSuggestions([]);
                      }}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {client.label}
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* Deal Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Deal</label>
            <input
              type="text"
              value={dealSearch}
              onChange={(e) => setDealSearch(e.target.value)}
              onFocus={(e) => e.target.select()}
              placeholder="Search deals..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              tabIndex={6}
            />
            {dealSuggestions.filter((s) => s.label !== dealSearch).length > 0 && (
              <ul className="bg-white border border-gray-300 rounded mt-1 max-h-48 overflow-auto shadow-lg">
                {dealSuggestions
                  .filter((s) => s.label !== dealSearch)
                  .map((deal) => (
                    <li
                      key={deal.id}
                      onClick={() => {
                        updateField('deal_id', deal.id);
                        setDealSearch(deal.label);
                        setDealSuggestions([]);
                      }}
                      className="px-3 py-2 hover:bg-gray-100 cursor-pointer text-sm"
                    >
                      {deal.label}
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Financial Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Financial Details</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Row 1: Commission and Fee */}
          <AssignmentPercentField
            label="Commission %"
            value={form.commission}
            onChange={(v) => updateField('commission', v)}
            placeholder="0.00"
            maxValue={100}
            tabIndex={7}
          />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Calculated Fee</label>
            <div className="mt-1 p-2 bg-gray-100 rounded text-sm">
              {formatCurrency(form.fee, 2)}
            </div>
          </div>

          {/* Row 2: Referral Fee and Referral Payee */}
          <AssignmentPercentField
            label="Referral Fee %"
            value={form.referral_fee}
            onChange={(v) => updateField('referral_fee', v)}
            placeholder="0.00"
            maxValue={100}
            tabIndex={8}
          />

          <ReferralPayeeAutocomplete
            value={form.referral_payee_id}
            onChange={(clientId) => updateField('referral_payee_id', clientId)}
            label="Referral Payee"
            tabIndex={9}
          />
        </div>
      </div>

      {/* Additional Details Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Additional Details</h3>
        
        <div className="space-y-4">
          {/* Scoped Checkbox */}
          <div className="flex items-center">
            <input
              type="checkbox"
              id="scoped"
              checked={form.scoped || false}
              onChange={(e) => updateField('scoped', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              tabIndex={10}
            />
            <label htmlFor="scoped" className="ml-2 block text-sm text-gray-900">
              Scoped Assignment
            </label>
          </div>

          {/* Site Criteria */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site Criteria
            </label>
            <textarea
              value={form.site_criteria || ''}
              onChange={(e) => updateField('site_criteria', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={3}
              placeholder="Enter site criteria..."
              tabIndex={11}
            />
          </div>
        </div>
      </div>

      {/* Create Button - Only for new assignments */}
      {form.id === 'new' && (
        <div className="flex justify-end">
          <button
            onClick={handleCreateNewAssignment}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            tabIndex={12}
          >
            {saving ? 'Creating...' : 'Create Assignment'}
          </button>
        </div>
      )}

      {/* Convert to Deal Button - Only for existing assignments */}
      {form.id && form.id !== 'new' && (
        <div className="flex justify-end mt-4">
          <button
            onClick={() => setShowConvertModal(true)}
            className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Convert to Deal
          </button>
        </div>
      )}

      {/* Convert to Deal Modal */}
      <ConvertToDealModal
        isOpen={showConvertModal}
        onClose={() => setShowConvertModal(false)}
        assignmentId={form.id || ''}
        assignmentName={form.assignment_name || ''}
        assignmentValue={form.assignment_value}
        clientId={form.client_id}
        commission={form.commission}
        referralFee={form.referral_fee}
        referralPayeeId={form.referral_payee_id}
        onSuccess={(dealId) => {
          // Navigate to the newly created deal
          navigate(`/deal/${dealId}`);
        }}
      />

    </div>
  );
}