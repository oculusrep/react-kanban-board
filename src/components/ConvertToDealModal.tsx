import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { parseISO, format as formatDateFn } from 'date-fns';

interface SiteSubmitOption {
  id: string;
  code: string;
  site_submit_name: string | null;
  property_id: string | null;
  property_unit_id: string | null;
  property_name?: string | null;
  status: string | null;
}

interface ConvertToDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignmentId: string;
  assignmentName: string;
  assignmentValue: number | null;
  clientId: string | null;
  commission: number | null;
  referralFee: number | null;
  referralPayeeId: string | null;
  onSuccess: (dealId: string) => void;
}

export default function ConvertToDealModal({
  isOpen,
  onClose,
  assignmentId,
  assignmentName,
  assignmentValue,
  clientId,
  commission,
  referralFee,
  referralPayeeId,
  onSuccess,
}: ConvertToDealModalProps) {
  const [dealName, setDealName] = useState(assignmentName || '');
  const [targetCloseDate, setTargetCloseDate] = useState<Date | null>(null);
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string>('');
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmitOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchingSubmits, setFetchingSubmits] = useState(true);

  // Fetch site submits associated with this assignment
  useEffect(() => {
    if (isOpen && assignmentId) {
      fetchSiteSubmits();
    }
  }, [isOpen, assignmentId]);

  const fetchSiteSubmits = async () => {
    if (!clientId) {
      setError('No client associated with this assignment');
      setFetchingSubmits(false);
      return;
    }

    setFetchingSubmits(true);
    setError(null);

    try {
      console.log('Fetching site submits for clientId:', clientId, 'assignmentId:', assignmentId);

      // Query for site submits that match the assignment_id OR client_id
      let query = supabase
        .from('site_submit')
        .select(`
          id,
          code,
          site_submit_name,
          property_id,
          property_unit_id,
          submit_stage_id,
          property:property_id (
            property_name
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            name
          )
        `);

      // Filter to only show site submits directly associated with this assignment
      query = query.eq('assignment_id', assignmentId);

      const { data, error: fetchError } = await query.order('code', { ascending: false });

      if (fetchError) {
        console.error('Supabase error:', fetchError);
        throw fetchError;
      }

      console.log('Raw site submits data:', data);

      const formattedData = (data || []).map((ss: any) => ({
        id: ss.id,
        code: ss.code,
        site_submit_name: ss.site_submit_name,
        property_id: ss.property_id,
        property_unit_id: ss.property_unit_id,
        property_name: ss.property?.property_name || null,
        status: ss.submit_stage?.name || null,
      }));

      console.log('Formatted site submits:', formattedData);
      setSiteSubmits(formattedData);
    } catch (err) {
      console.error('Error fetching site submits:', err);
      setError('Failed to load site submits');
    } finally {
      setFetchingSubmits(false);
    }
  };

  const handleConvert = async () => {
    if (!selectedSiteSubmitId) {
      setError('Please select a site submit');
      return;
    }

    if (!dealName.trim()) {
      setError('Please enter a deal name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
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

      // Step 2: Fetch the assignment to get transaction_type_id and owner_id
      const { data: assignmentData, error: assignmentFetchError } = await supabase
        .from('assignment')
        .select('transaction_type_id, owner_id')
        .eq('id', assignmentId)
        .single();

      if (assignmentFetchError) {
        console.warn('Could not fetch assignment details:', assignmentFetchError);
      }

      // Step 3: Get the selected site submit's property_id and property_unit_id
      const selectedSiteSubmit = siteSubmits.find(ss => ss.id === selectedSiteSubmitId);
      const propertyId = selectedSiteSubmit?.property_id || null;
      const propertyUnitId = selectedSiteSubmit?.property_unit_id || null;

      // Step 4: Create the new deal
      const dealPayload = {
        deal_name: dealName.trim(),
        deal_value: assignmentValue,
        client_id: clientId,
        commission_percent: commission,
        referral_fee_percent: referralFee,
        referral_payee_client_id: referralPayeeId,
        stage_id: loiStageId,
        property_id: propertyId,
        property_unit_id: propertyUnitId,
        site_submit_id: selectedSiteSubmitId,
        assignment_id: assignmentId,
        transaction_type_id: assignmentData?.transaction_type_id || null,
        owner_id: assignmentData?.owner_id || null,
        target_close_date: targetCloseDate ? formatDateFn(targetCloseDate, 'yyyy-MM-dd') : null,
        probability: 50, // Default for "Negotiating LOI"
        // Set default commission split percentages
        house_percent: 40,
        origination_percent: 50,
        site_percent: 25,
        deal_percent: 25,
        number_of_payments: 1,
        // Don't set created_at/updated_at - let database defaults handle it
      };

      const { data: newDeal, error: dealError } = await supabase
        .from('deal')
        .insert([dealPayload])
        .select()
        .single();

      if (dealError) throw dealError;
      if (!newDeal) throw new Error('Failed to create deal');

      // Step 5: Copy property contacts to deal_contact
      if (propertyId) {
        const { data: propertyContacts, error: propertyContactsError } = await supabase
          .from('property_contact')
          .select('contact_id')
          .eq('property_id', propertyId);

        if (propertyContactsError) {
          console.warn('Could not fetch property contacts:', propertyContactsError);
        } else if (propertyContacts && propertyContacts.length > 0) {
          // Create deal_contact entries for each property contact
          const dealContactPayloads = propertyContacts
            .filter(pc => pc.contact_id) // Only include contacts with valid contact_id
            .map((pc, index) => ({
              deal_id: newDeal.id,
              contact_id: pc.contact_id,
              primary_contact: index === 0, // Make the first contact primary
              role_id: null, // No role specified initially
            }));

          if (dealContactPayloads.length > 0) {
            const { error: dealContactError } = await supabase
              .from('deal_contact')
              .insert(dealContactPayloads);

            if (dealContactError) {
              console.warn('Could not copy property contacts to deal:', dealContactError);
            } else {
              console.log(`Successfully copied ${dealContactPayloads.length} property contacts to deal`);
            }
          }
        }
      }

      // Step 6: Look up the "Converted" priority_id
      const { data: priorityData, error: priorityError } = await supabase
        .from('assignment_priority')
        .select('id')
        .eq('label', 'Converted')
        .single();

      if (priorityError) {
        console.warn('Could not find "Converted" priority, assignment priority will not be updated');
      }

      // Step 7: Update the assignment to link to the new deal and update priority
      const assignmentUpdate: any = {
        deal_id: newDeal.id
      };

      // Only update priority if we found the Converted priority
      if (priorityData) {
        assignmentUpdate.priority_id = priorityData.id;
      }

      const { error: assignmentError } = await supabase
        .from('assignment')
        .update(assignmentUpdate)
        .eq('id', assignmentId);

      if (assignmentError) throw assignmentError;

      // Step 8: Look up the "LOI" submit stage_id and update the site submit
      const { data: submitStageData, error: submitStageError } = await supabase
        .from('submit_stage')
        .select('id')
        .eq('name', 'LOI')
        .single();

      if (submitStageError) {
        console.warn('Could not find "LOI" submit stage, skipping site submit stage update');
      }

      // Step 9: Update the site submit to link to the deal and change stage
      const siteSubmitUpdate: any = {
        deal_id: newDeal.id
      };

      // Only update stage if we found the LOI stage
      if (submitStageData) {
        siteSubmitUpdate.submit_stage_id = submitStageData.id;
      }

      const { error: siteSubmitError } = await supabase
        .from('site_submit')
        .update(siteSubmitUpdate)
        .eq('id', selectedSiteSubmitId);

      if (siteSubmitError) {
        console.error('Error updating site submit:', siteSubmitError);
        throw siteSubmitError;
      }

      // Success!
      onSuccess(newDeal.id);
      onClose();
    } catch (err) {
      console.error('Error converting to deal:', err);
      setError(err instanceof Error ? err.message : 'Failed to convert to deal');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setDealName(assignmentName || '');
      setTargetCloseDate(null);
      setSelectedSiteSubmitId('');
      setError(null);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-blue-600 text-white px-6 py-4 rounded-t-lg">
          <h2 className="text-xl font-semibold">Convert Assignment to Deal</h2>
          <p className="text-sm text-blue-100 mt-1">
            Create a new deal from this assignment
          </p>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
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

          {/* Deal Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Deal Name *
            </label>
            <input
              type="text"
              value={dealName}
              onChange={(e) => setDealName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Enter deal name"
              disabled={loading}
            />
            <p className="text-xs text-gray-500 mt-1">
              Defaults to assignment name, but you can edit it
            </p>
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

          {/* Site Submit Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Site Submit *
            </label>
            {fetchingSubmits ? (
              <div className="text-sm text-gray-500 py-4 text-center">
                Loading site submits...
              </div>
            ) : siteSubmits.length === 0 ? (
              <div className="text-sm text-gray-500 py-4 text-center border border-gray-200 rounded-md bg-gray-50">
                No site submits found for this assignment
              </div>
            ) : (
              <select
                value={selectedSiteSubmitId}
                onChange={(e) => setSelectedSiteSubmitId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="">Select a site submit...</option>
                {siteSubmits.map((ss) => (
                  <option key={ss.id} value={ss.id}>
                    {ss.code} - {ss.site_submit_name || 'Unnamed'}
                    {ss.property_name && ` (${ss.property_name})`}
                    {ss.status && ` - ${ss.status}`}
                  </option>
                ))}
              </select>
            )}
            <p className="text-xs text-gray-500 mt-1">
              The selected site submit will be associated with the new deal and its stage will change to LOI
            </p>
          </div>

          {/* Summary Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">What will happen:</h3>
            <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
              <li>New deal will be created with stage "Negotiating LOI"</li>
              <li>Deal value, commission, referral fee, transaction type, and owner will be copied from assignment</li>
              <li>Property and property unit from site submit will be linked to the deal</li>
              <li>Property contacts will be copied to the deal (editable in Contacts tab)</li>
              <li>Assignment will be linked to the new deal and priority changed to "Converted"</li>
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
            disabled={loading || !selectedSiteSubmitId || !dealName.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Converting...' : 'Create Deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
