/**
 * SiteSubmitCreateForm - Form for creating new site submits
 *
 * Used when creating a new site submit from a property.
 * Requires selecting a client (which auto-generates the site submit name).
 */

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import ClientSelector from '../mapping/ClientSelector';
import AssignmentSelector from '../mapping/AssignmentSelector';
import PropertyUnitSelector from '../PropertyUnitSelector';
import { AssignmentSearchResult } from '../../hooks/useAssignmentSearch';
import { SiteSubmitData } from './SiteSubmitSidebar';
import { prepareInsert } from '../../lib/supabaseHelpers';

interface Client {
  id: string;
  client_name: string | null;
}

interface SiteSubmitCreateFormProps {
  initialData: SiteSubmitData;
  stages: { id: string; name: string }[];
  onSave: (newSiteSubmit: SiteSubmitData) => void;
  onCancel: () => void;
}

export default function SiteSubmitCreateForm({
  initialData,
  stages,
  onSave,
  onCancel,
}: SiteSubmitCreateFormProps) {
  const [saving, setSaving] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSearchResult | null>(null);
  const [selectedPropertyUnitId, setSelectedPropertyUnitId] = useState<string | null>(initialData.property_unit_id || null);
  const [siteSubmitName, setSiteSubmitName] = useState(initialData.site_submit_name || '');
  const [selectedStageId, setSelectedStageId] = useState(initialData.submit_stage_id || '');
  const [dateSubmitted, setDateSubmitted] = useState(initialData.date_submitted || '');
  const [notes, setNotes] = useState(initialData.notes || '');

  // Auto-generate site submit name when client is selected
  useEffect(() => {
    if (selectedClient && initialData.property?.property_name) {
      const generatedName = `${initialData.property.property_name} - ${selectedClient.client_name}`;
      setSiteSubmitName(generatedName);
    }
  }, [selectedClient, initialData.property?.property_name]);

  const handleSave = async () => {
    if (!selectedClient) {
      alert('Please select a client');
      return;
    }

    setSaving(true);
    try {
      const newSiteSubmit = {
        property_id: initialData.property_id,
        client_id: selectedClient.id,
        assignment_id: selectedAssignment?.id || null,
        property_unit_id: selectedPropertyUnitId,
        site_submit_name: siteSubmitName,
        submit_stage_id: selectedStageId || null,
        date_submitted: dateSubmitted || null,
        notes: notes || null,
      };

      const insertData = prepareInsert(newSiteSubmit);
      const { data, error } = await supabase
        .from('site_submit')
        .insert(insertData)
        .select(`
          id,
          site_submit_name,
          submit_stage_id,
          date_submitted,
          notes,
          delivery_timeframe,
          ti,
          year_1_rent,
          competitor_data,
          property_id,
          property_unit_id,
          client_id,
          assignment_id,
          created_at,
          created_by_id,
          updated_at,
          updated_by_id,
          property:property_id (
            id,
            property_name,
            address,
            city,
            state,
            zip,
            available_sqft,
            building_sqft,
            acres,
            asking_lease_price,
            asking_purchase_price,
            rent_psf,
            nnn_psf,
            all_in_rent,
            latitude,
            longitude,
            property_record_type:property_record_type_id (
              id,
              label
            )
          ),
          property_unit:property_unit_id (
            id,
            property_unit_name,
            sqft,
            rent,
            nnn
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          ),
          client:client_id (
            id,
            client_name
          ),
          assignment:assignment_id (
            id,
            assignment_name
          )
        `)
        .single();

      if (error) throw error;

      onSave(data as unknown as SiteSubmitData);
    } catch (err) {
      console.error('Error creating site submit:', err);
      alert('Failed to create site submit. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Create New Site Submit</h3>

      <div className="space-y-4">
        {/* Property Info (read-only) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Property</label>
          <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded text-sm text-gray-700">
            {initialData.property?.property_name || 'Unknown Property'}
          </div>
        </div>

        {/* Client Selector (required) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
          <ClientSelector
            selectedClient={selectedClient ? { id: selectedClient.id, client_name: selectedClient.client_name || '' } : null}
            onClientSelect={(client) => {
              if (client) {
                setSelectedClient({ id: client.id, client_name: client.client_name });
              } else {
                setSelectedClient(null);
              }
            }}
            placeholder="Search for a client..."
          />
        </div>

        {/* Assignment Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Assignment</label>
          <AssignmentSelector
            selectedAssignment={selectedAssignment}
            onAssignmentSelect={setSelectedAssignment}
            clientId={selectedClient?.id}
            placeholder="Search for an assignment..."
          />
        </div>

        {/* Property Unit Selector */}
        <div>
          <PropertyUnitSelector
            value={selectedPropertyUnitId}
            onChange={setSelectedPropertyUnitId}
            propertyId={initialData.property_id}
            label="Property Unit"
          />
        </div>

        {/* Site Submit Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Site Submit Name</label>
          <input
            type="text"
            value={siteSubmitName}
            onChange={(e) => setSiteSubmitName(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Auto-generated from Property - Client"
          />
        </div>

        {/* Stage Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Stage</label>
          <select
            value={selectedStageId}
            onChange={(e) => setSelectedStageId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a stage...</option>
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </div>

        {/* Date Submitted */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date Submitted</label>
          <input
            type="date"
            value={dateSubmitted}
            onChange={(e) => setDateSubmitted(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
            placeholder="Optional notes..."
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !selectedClient}
          className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {saving ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          ) : (
            'Create Site Submit'
          )}
        </button>
      </div>
    </div>
  );
}
