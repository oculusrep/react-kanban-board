import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { usePortal } from '../../contexts/PortalContext';
import { usePortalActivityTracker } from '../../hooks/usePortalActivityTracker';
import ClientPipelineBoard from '../../components/client-pipeline/ClientPipelineBoard';
import { CLIENT_VISIBLE_STAGES } from '../../components/client-pipeline/pipelineConfig';

/**
 * PortalPipelinePage - Pipeline table view for the client portal.
 *
 * Thin wrapper around ClientPipelineBoard: supplies portal-specific client IDs,
 * stage visibility (clients see filtered list, brokers see all), URL param
 * deep-linking, and refresh trigger plumbing.
 */
export default function PortalPipelinePage() {
  const {
    selectedClient,
    selectedClientId,
    accessibleClients,
    isInternalUser,
    viewMode,
    siteSubmitRefreshTrigger,
    triggerSiteSubmitRefresh,
  } = usePortal();
  const [searchParams, setSearchParams] = useSearchParams();
  usePortalActivityTracker();

  const showBrokerFeatures = isInternalUser && viewMode === 'broker';

  const clientIds = useMemo(() => {
    if (selectedClientId) return [selectedClientId];
    return accessibleClients.map((c) => c.id);
  }, [selectedClientId, accessibleClients]);

  const visibleStageNames = showBrokerFeatures ? undefined : CLIENT_VISIBLE_STAGES;

  // URL param sync: selected site submit
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string | null>(
    searchParams.get('selected')
  );
  useEffect(() => {
    const fromUrl = searchParams.get('selected');
    if (fromUrl !== selectedSiteSubmitId) {
      setSelectedSiteSubmitId(fromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleSelectSiteSubmit = useCallback(
    (id: string | null) => {
      setSelectedSiteSubmitId(id);
      if (id) setSearchParams({ selected: id });
      else setSearchParams({});
    },
    [setSearchParams]
  );

  // URL param: initial stage from ?stage=Submitted-Reviewing or ?stage=signed
  // Read once on mount, then clear from URL so it doesn't re-trigger.
  const [initialStageName] = useState<string | null>(() => {
    const stageParam = searchParams.get('stage');
    return stageParam ?? 'Submitted-Reviewing';
  });
  useEffect(() => {
    if (searchParams.get('stage')) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('stage');
      setSearchParams(newParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    document.title = `Pipeline - ${selectedClient?.client_name || 'Portal'} | OVIS`;
  }, [selectedClient]);

  const handleStatusChange = useCallback(() => {
    triggerSiteSubmitRefresh();
  }, [triggerSiteSubmitRefresh]);

  const handleCopyForReviewLink = useCallback(() => {
    const url = `${window.location.origin}/portal/pipeline?stage=Submitted-Reviewing`;
    navigator.clipboard.writeText(url);
  }, []);

  if (!selectedClientId && accessibleClients.length > 1) {
    return <Navigate to="/portal" replace />;
  }

  return (
    <ClientPipelineBoard
      clientIds={clientIds}
      visibleStageNames={visibleStageNames}
      isEditable={showBrokerFeatures}
      showOtherStagesDropdown={showBrokerFeatures}
      showCopyForReviewButton={showBrokerFeatures}
      sidebarContext="portal"
      accessibleClients={accessibleClients}
      refreshTrigger={siteSubmitRefreshTrigger}
      onStatusChange={handleStatusChange}
      selectedSiteSubmitId={selectedSiteSubmitId}
      onSelectSiteSubmit={handleSelectSiteSubmit}
      initialStageName={initialStageName}
      onCopyForReviewLink={handleCopyForReviewLink}
    />
  );
}
