import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePortal } from '../../contexts/PortalContext';
import { supabase } from '../../lib/supabaseClient';
import PortalDataTab from './PortalDataTab';
import PortalChatTab from './PortalChatTab';
import PortalFilesTab from './PortalFilesTab';
import StatusBadgeDropdown from './StatusBadgeDropdown';

interface SiteSubmitData {
  id: string;
  site_submit_name: string | null;
  submit_stage_id: string | null;
  date_submitted: string | null;
  notes: string | null;
  delivery_timeframe: string | null;
  ti: number | null;
  year_1_rent: number | null;
  competitor_data: string | null;
  property_id: string | null;
  property_unit_id: string | null;
  client_id: string | null; // Client that owns this site submit - used for access control
  deal_id: string | null; // Deal associated with this site submit (if at LOI stage or beyond)
  property: {
    id: string;
    property_name: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    available_sqft: number | null;
    building_sqft: number | null;
    acres: number | null;
    asking_lease_price: number | null;
    asking_purchase_price: number | null;
    rent_psf: number | null;
    nnn_psf: number | null;
    all_in_rent: number | null;
    property_record_type: {
      id: string;
      label: string | null;
    } | null;
  } | null;
  property_unit: {
    id: string;
    property_unit_name: string | null;
    sqft: number | null;
    rent: number | null;
    nnn: number | null;
  } | null;
  submit_stage: {
    id: string;
    name: string;
  } | null;
}

type TabType = 'data' | 'chat' | 'files';

interface PortalDetailSidebarProps {
  siteSubmitId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onStatusChange?: (siteSubmitId: string, newStageId: string, newStageName: string) => void;
}

/**
 * PortalDetailSidebar - Slide-out panel for site submit details in the client portal
 *
 * Features:
 * - DATA tab: Property and site submit fields
 * - CHAT tab: Two-tier comment system
 * - FILES tab: Dropbox files from property
 * - View on Map / View in Pipeline toggle
 */
export default function PortalDetailSidebar({
  siteSubmitId,
  isOpen,
  onClose,
  onStatusChange,
}: PortalDetailSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userRole } = useAuth();
  const { isInternalUser, viewMode, siteSubmitRefreshTrigger, accessibleClients } = usePortal();

  // Show broker features only when internal user AND in broker view mode
  const showBrokerFeatures = isInternalUser && viewMode === 'broker';

  const [activeTab, setActiveTab] = useState<TabType>('data');
  const [siteSubmit, setSiteSubmit] = useState<SiteSubmitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);

  // Copy portal link to clipboard
  const handleCopyLink = () => {
    if (!siteSubmitId) return;
    const url = `${window.location.origin}/portal/map?selected=${siteSubmitId}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Determine current view from URL
  const isMapView = location.pathname.includes('/portal/map');

  // Client-visible stages (for filtering in client view)
  const CLIENT_VISIBLE_STAGES = [
    'Submitted-Reviewing',
    'Pass',
    'Use Declined',
    'Use Conflict',
    'Not Available',
    'Lost / Killed',
    'LOI',
    'At Lease/PSA',
    'Under Contract/Contingent',
    'Store Opened',
    'Unassigned Territory'
  ];

  // Fetch stages for the dropdown - brokers see all stages, clients see filtered list
  useEffect(() => {
    async function fetchStages() {
      let query = supabase
        .from('submit_stage')
        .select('id, name');

      // Client view: filter to only visible stages
      if (!showBrokerFeatures) {
        query = query.in('name', CLIENT_VISIBLE_STAGES);
      }

      const { data, error } = await query;

      if (!error && data) {
        setStages(data);
      }
    }

    fetchStages();
  }, [showBrokerFeatures]);

  // Fetch site submit data
  useEffect(() => {
    async function fetchSiteSubmit() {
      if (!siteSubmitId) {
        setSiteSubmit(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // First fetch site submit data - include client_id for access control
        const { data, error: fetchError } = await supabase
          .from('site_submit')
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
            )
          `)
          .eq('id', siteSubmitId)
          .single();

        if (fetchError) throw fetchError;

        // Security check: Verify user has access to this client's site submits
        const siteSubmitClientId = (data as any).client_id;
        const accessibleClientIds = accessibleClients.map(c => c.id);
        const hasAccess = siteSubmitClientId && accessibleClientIds.includes(siteSubmitClientId);

        if (!hasAccess) {
          setError('You do not have access to this property');
          setSiteSubmit(null);
          setLoading(false);
          return;
        }

        // Fetch associated deal (if any) - deals are linked via site_submit_id
        const { data: dealData } = await supabase
          .from('deal')
          .select('id')
          .eq('site_submit_id', siteSubmitId)
          .maybeSingle();

        // Combine site submit data with deal_id
        setSiteSubmit({
          ...(data as unknown as SiteSubmitData),
          deal_id: dealData?.id || null,
        });

        // Record the view for read/unread tracking
        await supabase.rpc('record_portal_site_submit_view', {
          p_user_id: (await supabase.auth.getUser()).data.user?.id,
          p_site_submit_id: siteSubmitId,
        });
      } catch (err) {
        console.error('Error fetching site submit:', err);
        setError('Failed to load site submit details');
      } finally {
        setLoading(false);
      }
    }

    // Only fetch if we have the accessible clients loaded (needed for access check)
    if (isOpen && siteSubmitId && accessibleClients.length > 0) {
      fetchSiteSubmit();
    }
  }, [siteSubmitId, isOpen, siteSubmitRefreshTrigger, accessibleClients]);

  // Stages that should open to their specific tab in pipeline
  const PIPELINE_TAB_STAGES = ['LOI', 'Submitted-Reviewing', 'At Lease/PSA'];
  const SIGNED_STAGES = ['Under Contract/Contingent', 'Booked', 'Executed Payable'];

  const handleToggleView = () => {
    if (isMapView) {
      const stageName = siteSubmit?.submit_stage?.name;
      let stageParam = '';

      // Determine which tab to open based on stage
      if (stageName && PIPELINE_TAB_STAGES.includes(stageName)) {
        stageParam = `&stage=${encodeURIComponent(stageName)}`;
      } else if (stageName && SIGNED_STAGES.includes(stageName)) {
        stageParam = '&stage=signed';
      }
      // Otherwise no stage param = All Sites

      navigate(`/portal/pipeline?selected=${siteSubmitId}${stageParam}`);
    } else {
      navigate(`/portal/map?selected=${siteSubmitId}`);
    }
  };

  const tabs: { id: TabType; label: string; icon: JSX.Element }[] = [
    {
      id: 'data',
      label: 'DATA',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
    {
      id: 'chat',
      label: 'CHAT',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
      ),
    },
    {
      id: 'files',
      label: 'FILES',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
  ];

  return (
    <>
      {/* Sidebar Panel - no backdrop, map remains interactive */}
      <div
        className={`fixed right-0 bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: '500px', maxWidth: '90vw', top: '64px', height: 'calc(100vh - 64px)' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-4 py-3 border-b border-gray-200"
          style={{ backgroundColor: '#011742' }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">
                {siteSubmit?.property?.property_name || siteSubmit?.site_submit_name || 'Site Details'}
              </h2>
              {siteSubmit?.property_unit && (
                <p className="text-sm text-blue-200 truncate">
                  {siteSubmit.property_unit.property_unit_name || 'Unit'}
                </p>
              )}
              {siteSubmit?.property?.address && (
                <div className="text-sm text-gray-300">
                  <p className="truncate">{siteSubmit.property.address}</p>
                  {siteSubmit.property.city && (
                    <p className="truncate">
                      {siteSubmit.property.city}, {siteSubmit.property.state}
                      {siteSubmit.property.zip && ` ${siteSubmit.property.zip}`}
                    </p>
                  )}
                </div>
              )}
            </div>
            {/* Close button - chevron pointing right */}
            <button
              onClick={onClose}
              className="ml-2 p-1.5 rounded hover:bg-white/10 transition-colors"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Status Badge, Copy Link, and View Toggle Button */}
          <div className="mt-3 flex items-center justify-between">
            {/* Status Badge - clickable dropdown for brokers */}
            {siteSubmit ? (
              <StatusBadgeDropdown
                currentStageId={siteSubmit.submit_stage_id}
                currentStageName={siteSubmit.submit_stage?.name || null}
                siteSubmitId={siteSubmit.id}
                stages={stages}
                canEdit={showBrokerFeatures}
                onStatusChange={(newStageId, newStageName) => {
                  setSiteSubmit({
                    ...siteSubmit,
                    submit_stage_id: newStageId,
                    submit_stage: { id: newStageId, name: newStageName },
                  });
                  // Notify parent to update pipeline view
                  if (onStatusChange) {
                    onStatusChange(siteSubmit.id, newStageId, newStageName);
                  }
                }}
              />
            ) : (
              <span
                className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}
              >
                Unknown Status
              </span>
            )}
            <div className="flex items-center gap-2">
              {/* Copy Link Button */}
              <button
                onClick={handleCopyLink}
                className="py-1.5 px-3 rounded-lg font-medium text-sm transition-colors flex items-center space-x-1.5 hover:opacity-90"
                style={{ backgroundColor: linkCopied ? '#059669' : '#3b82f6', color: '#ffffff' }}
                title="Copy portal link to clipboard"
              >
                {linkCopied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
              {/* View Toggle Button */}
              <button
                onClick={handleToggleView}
                className="py-1.5 px-3 rounded-lg font-medium text-sm transition-colors flex items-center space-x-2 hover:opacity-90"
                style={{ backgroundColor: '#f97316', color: '#ffffff' }}
              >
            {isMapView ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                </svg>
                <span>View in Pipeline</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                <span>View on Map</span>
              </>
            )}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50">
          <div className="flex">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'text-blue-600 border-b-2 border-blue-600 bg-white'
                    : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="flex-1 min-h-0 flex flex-col">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center p-4">
                <svg className="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-red-600">{error}</p>
              </div>
            </div>
          ) : !siteSubmit ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-gray-500">Select a site submit to view details</p>
            </div>
          ) : (
            <>
              {activeTab === 'data' && (
                <PortalDataTab
                  siteSubmit={siteSubmit}
                  isEditable={showBrokerFeatures}
                  onUpdate={(updated) => setSiteSubmit({ ...siteSubmit, ...updated })}
                />
              )}
              {activeTab === 'chat' && (
                <PortalChatTab
                  siteSubmitId={siteSubmit.id}
                  showInternalComments={showBrokerFeatures}
                  propertyId={siteSubmit.property_id}
                  dealId={siteSubmit.deal_id}
                />
              )}
              {activeTab === 'files' && (
                <PortalFilesTab
                  propertyId={siteSubmit.property_id}
                  dealId={siteSubmit.deal_id}
                  siteSubmitId={siteSubmit.id}
                  canUpload={showBrokerFeatures}
                  isInternalUser={showBrokerFeatures}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
