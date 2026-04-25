import { useCallback, useEffect, useState } from 'react';
import MappingPageNew from './MappingPageNew';
import ClientPipelineBoard from '../components/client-pipeline/ClientPipelineBoard';
import PinDetailsSlideout from '../components/mapping/slideouts/PinDetailsSlideout';
import { ClientSearchResult } from '../hooks/useClientSearch';
import { supabase } from '../lib/supabaseClient';

/**
 * MappingWorkspace - Internal workspace that hosts both the map and the
 * client pipeline view at the same route (/mapping) and toggles between them
 * via CSS display swap so neither is unmounted.
 *
 * Why CSS swap instead of routing: tearing down GoogleMapContainer loses
 * zoom, pan, layer toggles, and pin cache. Keeping both mounted preserves
 * every bit of state on both sides.
 */
export default function MappingWorkspace() {
  const [view, setView] = useState<'map' | 'pipeline'>('map');
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);

  // Currently-open site submit, shared across map and pipeline views so the
  // sidebar, pin highlight, and pipeline row highlight all stay in sync when
  // the user toggles views.
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string | null>(null);

  // Property slideout state (only used from the pipeline view).
  // The map view has its own property slideout inside MappingPageNew.
  const [pipelinePropertyData, setPipelinePropertyData] = useState<any>(null);
  const [pipelinePropertyOpen, setPipelinePropertyOpen] = useState(false);

  // Safety: if the client gets cleared while the pipeline is visible, return to map.
  useEffect(() => {
    if (!selectedClient && view === 'pipeline') setView('map');
  }, [selectedClient, view]);

  // Clear cross-view selection when the client changes — site submits are
  // scoped per client, so the previous selection is no longer in the list.
  useEffect(() => {
    setSelectedSiteSubmitId(null);
  }, [selectedClient?.id]);

  const handleViewPropertyFromPipeline = useCallback(async (propertyId: string) => {
    try {
      const { data, error } = await supabase
        .from('property')
        .select('*')
        .eq('id', propertyId)
        .single();
      if (error) throw error;
      setPipelinePropertyData(data);
      setPipelinePropertyOpen(true);
    } catch (err) {
      console.error('Error loading property for pipeline view:', err);
    }
  }, []);

  const handleClosePipelineProperty = useCallback(() => {
    setPipelinePropertyOpen(false);
    setPipelinePropertyData(null);
  }, []);

  return (
    <>
      <div style={{ display: view === 'map' ? 'block' : 'none' }}>
        <MappingPageNew
          selectedClient={selectedClient}
          onSelectedClientChange={setSelectedClient}
          onSwitchToPipeline={() => setView('pipeline')}
          controlledSelectedSiteSubmitId={selectedSiteSubmitId}
          onSelectedSiteSubmitChange={setSelectedSiteSubmitId}
        />
      </div>

      {selectedClient && (
        <div style={{ display: view === 'pipeline' ? 'block' : 'none' }}>
          <ClientPipelineBoard
            clientIds={[selectedClient.id]}
            isEditable
            showOtherStagesDropdown
            sidebarContext="map"
            accessibleClients={[
              { id: selectedClient.id, client_name: selectedClient.client_name },
            ]}
            headerActions={
              <BackToMapButton
                clientName={selectedClient.client_name}
                onSwitchToMap={() => setView('map')}
              />
            }
            onViewProperty={handleViewPropertyFromPipeline}
            siteSubmitSidebarRightOffset={pipelinePropertyOpen ? 500 : 0}
            selectedSiteSubmitId={selectedSiteSubmitId}
            onSelectSiteSubmit={setSelectedSiteSubmitId}
          />
          <PinDetailsSlideout
            isOpen={pipelinePropertyOpen}
            onClose={handleClosePipelineProperty}
            data={pipelinePropertyData}
            type="property"
          />
        </div>
      )}
    </>
  );
}

function BackToMapButton({
  clientName,
  onSwitchToMap,
}: {
  clientName: string;
  onSwitchToMap: () => void;
}) {
  return (
    <div className="flex items-center gap-2 mr-3 pr-3 border-r border-gray-200">
      <button
        onClick={onSwitchToMap}
        title="Back to map view"
        aria-label="Back to map view"
        className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      </button>
      <span className="text-sm font-semibold whitespace-nowrap" style={{ color: '#002147' }}>
        {clientName}
      </span>
    </div>
  );
}
