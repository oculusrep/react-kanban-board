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
import { usePropertyGeoenrichment, isEnrichmentStale, haveCoordinatesChanged } from '../../hooks/usePropertyGeoenrichment';

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
  const [showStaleDataPrompt, setShowStaleDataPrompt] = useState(false);
  const [showCoordinateChangePrompt, setShowCoordinateChangePrompt] = useState(false);
  const { enrichProperty, saveEnrichmentToProperty, isEnriching } = usePropertyGeoenrichment();
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentSearchResult | null>(null);
  const [selectedPropertyUnitId, setSelectedPropertyUnitId] = useState<string | null>(initialData.property_unit_id || null);
  const [siteSubmitName, setSiteSubmitName] = useState(initialData.site_submit_name || '');
  const [selectedStageId, setSelectedStageId] = useState(initialData.submit_stage_id || '');
  const [dateSubmitted, setDateSubmitted] = useState(initialData.date_submitted || '');
  const [notes, setNotes] = useState(initialData.notes || '');

  // Reset form when initialData changes (new site submit creation)
  // Using a stable key based on property_id and submit_stage_id to detect when we're creating a fresh form
  useEffect(() => {
    setSelectedClient(null);
    setSelectedAssignment(null);
    setSelectedPropertyUnitId(initialData.property_unit_id || null);
    setSiteSubmitName(initialData.site_submit_name || '');
    setSelectedStageId(initialData.submit_stage_id || '');
    setDateSubmitted(initialData.date_submitted || '');
    setNotes(initialData.notes || '');
  }, [initialData.property_id, initialData.submit_stage_id]);

  // Auto-generate site submit name when client is selected
  useEffect(() => {
    if (selectedClient && initialData.property?.property_name) {
      const generatedName = `${initialData.property.property_name} - ${selectedClient.client_name}`;
      setSiteSubmitName(generatedName);
    }
  }, [selectedClient, initialData.property?.property_name]);

  // Check if property needs demographic enrichment
  const checkAndEnrichProperty = async (propertyId: string, forceRefresh = false) => {
    // Get current property data to check enrichment status
    const { data: propertyData } = await supabase
      .from('property')
      .select('latitude, longitude, esri_enriched_at, esri_enriched_latitude, esri_enriched_longitude')
      .eq('id', propertyId)
      .single();

    if (!propertyData?.latitude || !propertyData?.longitude) {
      console.log('[SiteSubmit] Property has no coordinates, skipping enrichment');
      return;
    }

    const hasEnrichment = !!propertyData.esri_enriched_at;
    const isStale = isEnrichmentStale(propertyData.esri_enriched_at);
    const coordinatesChanged = haveCoordinatesChanged(
      propertyData.latitude,
      propertyData.longitude,
      propertyData.esri_enriched_latitude,
      propertyData.esri_enriched_longitude
    );

    // If coordinates have changed since last enrichment, show prompt
    if (hasEnrichment && coordinatesChanged && !forceRefresh) {
      console.log('[SiteSubmit] Coordinates changed since last enrichment');
      setShowCoordinateChangePrompt(true);
      return;
    }

    // If data is stale, show prompt and let user decide
    if (hasEnrichment && isStale && !forceRefresh) {
      setShowStaleDataPrompt(true);
      return;
    }

    // If no enrichment data exists, or force refresh requested, enrich now
    if (!hasEnrichment || forceRefresh) {
      console.log('[SiteSubmit] Auto-enriching property with demographics');
      const result = await enrichProperty(
        propertyId,
        propertyData.latitude,
        propertyData.longitude,
        forceRefresh
      );

      if (result) {
        await saveEnrichmentToProperty(propertyId, result, propertyData.latitude, propertyData.longitude);
        console.log('[SiteSubmit] Property enriched successfully');
      }
    }
  };

  const handleSave = async (refreshStaleData = false) => {
    if (!selectedClient) {
      alert('Please select a client');
      return;
    }

    // Close prompts if they were showing
    setShowStaleDataPrompt(false);
    setShowCoordinateChangePrompt(false);

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

      // Auto-enrich property demographics (silent fail - doesn't block site submit)
      checkAndEnrichProperty(initialData.property_id, refreshStaleData).catch((err) => {
        console.error('[SiteSubmit] Enrichment failed (non-blocking):', err);
      });

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

      {/* Coordinate Change Prompt */}
      {showCoordinateChangePrompt && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">Property location has changed</p>
              <p className="text-sm text-blue-700 mt-1">The property coordinates have changed since the last demographic enrichment. Would you like to refresh the data for the new location?</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || isEnriching}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {isEnriching ? 'Refreshing...' : 'Yes, Refresh'}
                </button>
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm font-medium text-blue-700 bg-white border border-blue-300 rounded hover:bg-blue-50 disabled:opacity-50"
                >
                  No, Use Existing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Stale Demographics Data Prompt */}
      {showStaleDataPrompt && (
        <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Demographics data is over 1 year old</p>
              <p className="text-sm text-amber-700 mt-1">Would you like to refresh the demographic data for this property?</p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => handleSave(true)}
                  disabled={saving || isEnriching}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded hover:bg-amber-700 disabled:opacity-50"
                >
                  {isEnriching ? 'Refreshing...' : 'Yes, Refresh'}
                </button>
                <button
                  onClick={() => handleSave(false)}
                  disabled={saving}
                  className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-white border border-amber-300 rounded hover:bg-amber-50 disabled:opacity-50"
                >
                  No, Use Existing
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-6 flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => handleSave()}
          disabled={saving || !selectedClient || showStaleDataPrompt || showCoordinateChangePrompt}
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
