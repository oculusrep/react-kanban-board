import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { usePortal } from '../../contexts/PortalContext';
import { supabase } from '../../lib/supabaseClient';
import PortalDataTab from './PortalDataTab';
import PortalChatTab from './PortalChatTab';
import PortalFilesTab from './PortalFilesTab';

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
    dropbox_folder_path: string | null;
  } | null;
  submit_stage: {
    id: string;
    stage_name: string;
  } | null;
}

type TabType = 'data' | 'chat' | 'files';

interface PortalDetailSidebarProps {
  siteSubmitId: string | null;
  isOpen: boolean;
  onClose: () => void;
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
}: PortalDetailSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { userRole } = useAuth();
  const { isInternalUser } = usePortal();

  const [activeTab, setActiveTab] = useState<TabType>('data');
  const [siteSubmit, setSiteSubmit] = useState<SiteSubmitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Determine current view from URL
  const isMapView = location.pathname.includes('/portal/map');

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
              dropbox_folder_path
            ),
            submit_stage:submit_stage_id (
              id,
              stage_name
            )
          `)
          .eq('id', siteSubmitId)
          .single();

        if (fetchError) throw fetchError;

        setSiteSubmit(data as unknown as SiteSubmitData);

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

    if (isOpen && siteSubmitId) {
      fetchSiteSubmit();
    }
  }, [siteSubmitId, isOpen]);

  const handleToggleView = () => {
    if (isMapView) {
      navigate(`/portal/pipeline?selected=${siteSubmitId}`);
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
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar Panel */}
      <div
        className={`fixed top-0 right-0 h-full bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        style={{ width: '500px', maxWidth: '90vw' }}
      >
        {/* Header */}
        <div
          className="flex-shrink-0 px-4 py-3 border-b border-gray-200"
          style={{ backgroundColor: '#011742' }}
        >
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-white truncate">
                {siteSubmit?.property?.property_name || siteSubmit?.site_submit_name || 'Site Details'}
              </h2>
              {siteSubmit?.property?.address && (
                <p className="text-sm text-gray-300 truncate">
                  {siteSubmit.property.address}
                  {siteSubmit.property.city && `, ${siteSubmit.property.city}, ${siteSubmit.property.state}`}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="ml-4 p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* View Toggle Button */}
          <button
            onClick={handleToggleView}
            className="mt-3 w-full py-2 px-4 rounded-lg font-medium text-sm transition-colors flex items-center justify-center space-x-2"
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
        <div className="flex-1 overflow-y-auto">
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
                  isEditable={isInternalUser}
                  onUpdate={(updated) => setSiteSubmit({ ...siteSubmit, ...updated })}
                />
              )}
              {activeTab === 'chat' && (
                <PortalChatTab
                  siteSubmitId={siteSubmit.id}
                  showInternalComments={isInternalUser}
                />
              )}
              {activeTab === 'files' && (
                <PortalFilesTab
                  propertyId={siteSubmit.property_id}
                  dropboxPath={siteSubmit.property?.dropbox_folder_path}
                  canUpload={isInternalUser}
                />
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
