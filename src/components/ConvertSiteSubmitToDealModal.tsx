import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { prepareInsert, prepareUpdate } from '../lib/supabaseHelpers';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format as formatDateFn } from 'date-fns';
import CustomSelect from './shared/CustomSelect';
import AssignmentCurrencyField from './AssignmentCurrencyField';
import AssignmentPercentField from './AssignmentPercentField';
import ReferralPayeeAutocomplete from './ReferralPayeeAutocomplete';

interface AssignmentOption {
  id: string;
  assignment_name: string | null;
  assignment_value: number | null;
  commission: number | null;
  referral_fee: number | null;
  referral_payee_id: string | null;
  transaction_type_id: string | null;
  deal_team_id: string | null;
}

interface ConvertSiteSubmitToDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  siteSubmitId: string;
  siteSubmitCode: string;
  siteSubmitName: string | null;
  clientId: string | null;
  clientName: string | null;
  propertyId: string | null;
  propertyName: string | null;
  propertyUnitId: string | null;
  onSuccess: (dealId: string) => void;
}

export default function ConvertSiteSubmitToDealModal({
  isOpen,
  onClose,
  siteSubmitId,
  siteSubmitCode,
  siteSubmitName,
  clientId,
  clientName,
  propertyId,
  propertyName,
  propertyUnitId,
  onSuccess,
}: ConvertSiteSubmitToDealModalProps) {
  // Form state
  const [dealName, setDealName] = useState('');
  const [targetCloseDate, setTargetCloseDate] = useState<Date | null>(null);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string>('');
  const [dealValue, setDealValue] = useState<number | null>(null);
  const [commission, setCommission] = useState<number | null>(null);
  const [referralFee, setReferralFee] = useState<number | null>(null);
  const [referralPayeeId, setReferralPayeeId] = useState<string | null>(null);
  const [transactionTypeId, setTransactionTypeId] = useState<string | null>(null);
  const [dealTeamId, setDealTeamId] = useState<string | null>(null);

  // Lookup options
  const [assignments, setAssignments] = useState<AssignmentOption[]>([]);
  const [transactionTypeOptions, setTransactionTypeOptions] = useState<{ id: string; label: string }[]>([]);
  const [dealTeamOptions, setDealTeamOptions] = useState<{ id: string; label: string }[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [fetchingAssignments, setFetchingAssignments] = useState(true);

  // Initialize default deal name
  useEffect(() => {
    if (isOpen) {
      const defaultName = `${clientName || 'Client'} - ${propertyName || 'Property'}`;
      setDealName(defaultName);
      checkForDuplicateDeal(defaultName);
    }
  }, [isOpen, clientName, propertyName]);

  // Fetch assignments and lookup options
  useEffect(() => {
    if (isOpen && clientId) {
      fetchAssignments();
      fetchLookupOptions();
    }
  }, [isOpen, clientId]);

  const fetchAssignments = async () => {
    if (!clientId) {
      setError('No client associated with this site submit');
      setFetchingAssignments(false);
      return;
    }

    setFetchingAssignments(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('assignment')
        .select('id, assignment_name, assignment_value, commission, referral_fee, referral_payee_id, transaction_type_id, deal_team_id')
        .eq('client_id', clientId)
        .order('assignment_name', { ascending: true });

      if (fetchError) throw fetchError;

      setAssignments(data || []);
    } catch (err) {
      console.error('Error fetching assignments:', err);
      setError('Failed to load assignments');
    } finally {
      setFetchingAssignments(false);
    }
  };

  const fetchLookupOptions = async () => {
    try {
      // Fetch transaction types
      const { data: transactionTypes } = await supabase
        .from('transaction_type')
        .select('id, label')
        .eq('active', true)
        .order('sort_order');

      if (transactionTypes) setTransactionTypeOptions(transactionTypes);

      // Fetch deal teams
      const { data: dealTeams } = await supabase
        .from('deal_team')
        .select('id, label')
        .order('label');

      if (dealTeams) setDealTeamOptions(dealTeams);
    } catch (err) {
      console.error('Error fetching lookup options:', err);
    }
  };

  const checkForDuplicateDeal = async (name: string) => {
    if (!name.trim()) {
      setDuplicateWarning(null);
      return;
    }

    try {
      const { data, error: checkError } = await supabase
        .from('deal')
        .select('id, deal_name')
        .ilike('deal_name', name.trim())
        .limit(1);

      if (checkError) throw checkError;

      if (data && data.length > 0) {
        setDuplicateWarning(`Warning: A deal with the name "${data[0].deal_name}" already exists.`);
      } else {
        setDuplicateWarning(null);
      }
    } catch (err) {
      console.error('Error checking for duplicate deal:', err);
    }
  };

  const handleDealNameChange = (name: string) => {
    setDealName(name);
    // Debounce the duplicate check
    const timeoutId = setTimeout(() => checkForDuplicateDeal(name), 500);
    return () => clearTimeout(timeoutId);
  };

  const handleAssignmentChange = (assignmentId: string) => {
    setSelectedAssignmentId(assignmentId);

    if (!assignmentId) {
      // Clear fields if no assignment selected
      return;
    }

    // Find the selected assignment and populate fields
    const assignment = assignments.find(a => a.id === assignmentId);
    if (assignment) {
      setDealValue(assignment.assignment_value);
      setCommission(assignment.commission);
      setReferralFee(assignment.referral_fee);
      setReferralPayeeId(assignment.referral_payee_id);
      setTransactionTypeId(assignment.transaction_type_id);
      setDealTeamId(assignment.deal_team_id);
    }
  };

  const validateForm = (): boolean => {
    if (!dealName.trim()) {
      setError('Please enter a deal name');
      return false;
    }

    if (dealValue === null || dealValue === undefined) {
      setError('Deal Value is required');
      return false;
    }

    if (commission === null || commission === undefined) {
      setError('Commission is required');
      return false;
    }

    if (!transactionTypeId) {
      setError('Transaction Type is required');
      return false;
    }

    return true;
  };

  // Check if site submit already has a deal
  const checkSiteSubmitHasDeal = async (): Promise<boolean> => {
    const { data, error } = await supabase
      .from('deal')
      .select('id, deal_name')
      .eq('site_submit_id', siteSubmitId)
      .maybeSingle();

    if (error) {
      console.error('Error checking for existing deal:', error);
      return false;
    }

    return data !== null;
  };

  const handleConvert = async () => {
    if (!validateForm()) return;

    setLoading(true);
    setError(null);

    try {
      // Check if site submit already has a deal
      const hasDeal = await checkSiteSubmitHasDeal();
      if (hasDeal) {
        setError('This site submit already has a deal associated with it. Please delete the existing deal first or choose a different site submit.');
        setLoading(false);
        return;
      }
      // Step 1: Look up the "Negotiating LOI" stage_id
      const { data: stageData, error: stageError } = await supabase
        .from('deal_stage')
        .select('id')
        .eq('label', 'Negotiating LOI')
        .single();

      if (stageError || !stageData) {
        throw new Error('Could not find "Negotiating LOI" stage');
      }

      const loiStageId = stageData.id;

      // Step 2: Determine number_of_payments based on transaction type
      let numberOfPayments = 1; // Default

      if (transactionTypeId) {
        const { data: transactionType } = await supabase
          .from('transaction_type')
          .select('label')
          .eq('id', transactionTypeId)
          .single();

        if (transactionType) {
          const label = transactionType.label?.toLowerCase() || '';
          // Lease transactions default to 2 payments
          if (label.includes('lease')) {
            numberOfPayments = 2;
          }
          // Sale of Land or Sale of Building default to 1 payment
          else if (label.includes('sale of land') || label.includes('sale of building')) {
            numberOfPayments = 1;
          }
        }
      }

      // Step 3: Get current user for metadata
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = user?.id || null;
      const now = new Date().toISOString();

      // Step 4: Create the new deal
      const dealPayload = {
        deal_name: dealName.trim(),
        deal_value: dealValue,
        client_id: clientId,
        commission_percent: commission,
        referral_fee_percent: referralFee,
        referral_payee_client_id: referralPayeeId,
        transaction_type_id: transactionTypeId,
        deal_team_id: dealTeamId,
        stage_id: loiStageId,
        property_id: propertyId,
        property_unit_id: propertyUnitId,
        site_submit_id: siteSubmitId,
        assignment_id: selectedAssignmentId || null,
        target_close_date: targetCloseDate ? formatDateFn(targetCloseDate, 'yyyy-MM-dd') : null,
        probability: 50, // Default for "Negotiating LOI"
        number_of_payments: numberOfPayments,
        // Set default commission split percentages
        house_percent: 40,
        origination_percent: 50,
        site_percent: 25,
        deal_percent: 25,
        // Metadata fields
        created_at: now,
        created_by_id: currentUserId,
        updated_at: now,
        updated_by_id: currentUserId,
      };

      const { data: newDeal, error: dealError } = await supabase
        .from('deal')
        .insert(prepareInsert([dealPayload]))
        .select()
        .single();

      if (dealError) {
        console.error('Deal creation error:', dealError);
        console.error('Deal payload:', dealPayload);
        throw dealError;
      }
      if (!newDeal) throw new Error('Failed to create deal');

      // Step 5: Copy property contacts to deal_contact
      if (propertyId) {
        const { data: propertyContacts } = await supabase
          .from('property_contact')
          .select('contact_id')
          .eq('property_id', propertyId);

        if (propertyContacts && propertyContacts.length > 0) {
          const dealContactPayloads = propertyContacts
            .filter(pc => pc.contact_id)
            .map((pc, index) => ({
              deal_id: newDeal.id,
              contact_id: pc.contact_id,
              primary_contact: index === 0,
              role_id: null,
            }));

          if (dealContactPayloads.length > 0) {
            const { error: dealContactError } = await supabase
              .from('deal_contact')
              .insert(prepareInsert(dealContactPayloads));

            if (dealContactError) {
              console.warn('Could not copy property contacts to deal:', dealContactError);
            }
          }
        }
      }

      // Step 6: Update the assignment (if selected) to link to deal and set priority to "Converted"
      if (selectedAssignmentId) {
        const { data: priorityData } = await supabase
          .from('assignment_priority')
          .select('id')
          .eq('label', 'Converted')
          .single();

        const assignmentUpdate: any = {
          deal_id: newDeal.id
        };

        if (priorityData) {
          assignmentUpdate.priority_id = priorityData.id;
        }

        const { error: assignmentError } = await supabase
          .from('assignment')
          .update(prepareUpdate(assignmentUpdate))
          .eq('id', selectedAssignmentId);

        if (assignmentError) {
          console.warn('Could not update assignment:', assignmentError);
        }
      }

      // Step 7: Look up the "LOI" submit stage_id and update the site submit
      const { data: submitStageData } = await supabase
        .from('submit_stage')
        .select('id')
        .eq('name', 'LOI')
        .single();

      const siteSubmitUpdate: any = {
        deal_id: newDeal.id
      };

      if (submitStageData) {
        siteSubmitUpdate.submit_stage_id = submitStageData.id;
      }

      const { error: siteSubmitError } = await supabase
        .from('site_submit')
        .update(prepareUpdate(siteSubmitUpdate))
        .eq('id', siteSubmitId);

      if (siteSubmitError) {
        console.error('Error updating site submit:', siteSubmitError);
        throw siteSubmitError;
      }

      // Success!
      onSuccess(newDeal.id);
      handleClose();
    } catch (err) {
      console.error('Error converting to deal:', err);
      setError(err instanceof Error ? err.message : 'Failed to convert to deal');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      // Reset form
      setDealName(`${clientName || 'Client'} - ${propertyName || 'Property'}`);
      setTargetCloseDate(null);
      setSelectedAssignmentId('');
      setDealValue(null);
      setCommission(null);
      setReferralFee(null);
      setReferralPayeeId(null);
      setTransactionTypeId(null);
      setDealTeamId(null);
      setError(null);
      setDuplicateWarning(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  const isFormValid = dealName.trim() && dealValue !== null && commission !== null && transactionTypeId;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-semibold">Convert Site Submit to Deal</h2>
          <p className="text-sm text-blue-100 mt-1">
            Create a new deal from site submit {siteSubmitCode}
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-sm text-red-800">{error}</p>
              </div>
            </div>
          )}

          {duplicateWarning && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-sm text-yellow-800">{duplicateWarning}</p>
              </div>
            </div>
          )}

          {/* Deal Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deal Name *
            </label>
            <input
              type="text"
              value={dealName}
              onChange={(e) => handleDealNameChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter deal name"
              disabled={loading}
            />
          </div>

          {/* Target Close Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Target Close Date
            </label>
            <DatePicker
              selected={targetCloseDate}
              onChange={(date) => setTargetCloseDate(date)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholderText="Select target close date"
              dateFormat="MM/dd/yyyy"
              isClearable
              disabled={loading}
            />
          </div>

          {/* Site Submit (Read-only) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site Submit
            </label>
            <input
              type="text"
              value={`${siteSubmitCode} - ${siteSubmitName || 'Unnamed'}${propertyName ? ` (${propertyName})` : ''}`}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-50 text-gray-600"
              disabled
              readOnly
            />
            <p className="text-xs text-gray-500 mt-1">
              This site submit will be linked to the deal and its stage will change to LOI
            </p>
          </div>

          {/* Assignment Selection (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Assignment (Optional)
            </label>
            {fetchingAssignments ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                Loading assignments...
              </div>
            ) : assignments.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center border border-gray-200 rounded-md bg-gray-50">
                No assignments found for this client
              </div>
            ) : (
              <select
                value={selectedAssignmentId}
                onChange={(e) => handleAssignmentChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="">-- Select Assignment (Optional) --</option>
                {assignments.map((assignment) => (
                  <option key={assignment.id} value={assignment.id}>
                    {assignment.assignment_name || 'Unnamed Assignment'}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-500 mt-1">
              Selecting an assignment will pre-fill financial details and link the assignment to this deal
            </p>
          </div>

          {/* Deal Value */}
          <AssignmentCurrencyField
            label="Deal Value *"
            value={dealValue}
            onChange={setDealValue}
            placeholder="0.00"
            maxValue={1000000000}
          />

          {/* Commission */}
          <AssignmentPercentField
            label="Commission % *"
            value={commission}
            onChange={setCommission}
            placeholder="0.00"
            maxValue={100}
          />

          {/* Referral Fee */}
          <AssignmentPercentField
            label="Referral Fee %"
            value={referralFee}
            onChange={setReferralFee}
            placeholder="0.00"
            maxValue={100}
          />

          {/* Referral Payee */}
          <ReferralPayeeAutocomplete
            value={referralPayeeId}
            onChange={setReferralPayeeId}
            label="Referral Payee"
          />

          {/* Transaction Type */}
          <CustomSelect
            label="Transaction Type *"
            value={transactionTypeId}
            onChange={setTransactionTypeId}
            options={transactionTypeOptions}
            placeholder="-- Select Transaction Type --"
          />

          {/* Deal Team */}
          <CustomSelect
            label="Deal Team"
            value={dealTeamId}
            onChange={setDealTeamId}
            options={dealTeamOptions}
            placeholder="-- Select Deal Team --"
          />

          {/* Summary Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">What will happen:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>New deal will be created with stage "Negotiating LOI"</li>
              <li>Number of payments will be set based on transaction type (2 for leases, 1 for purchases)</li>
              <li>Property and property unit from site submit will be linked to the deal</li>
              {propertyId && <li>Property contacts will be copied to the deal (editable in Contacts tab)</li>}
              {selectedAssignmentId && <li>Assignment will be linked to the new deal and priority changed to "Converted"</li>}
              <li>Site submit will be linked to the deal and stage changed to "LOI"</li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-4 rounded-b-lg flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={loading}
            className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConvert}
            disabled={loading || !isFormValid}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Converting...' : 'Create Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
