/**
 * SiteSubmitSidebar - Shared sidebar for site submit details
 *
 * Used in both the map view and the portal (broker/client views).
 * Based on PortalDetailSidebar with additional features:
 * - Email sending
 * - Contact management (map context only)
 * - Assignment and property unit selectors
 */

import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import SiteSubmitDataTab from './SiteSubmitDataTab';
import SiteSubmitContactsTab from './SiteSubmitContactsTab';
import SiteSubmitCreateForm from './SiteSubmitCreateForm';
import PortalChatTab from '../portal/PortalChatTab';
import PortalFilesTab from '../portal/PortalFilesTab';
import StatusBadgeDropdown from '../portal/StatusBadgeDropdown';
import { useSiteSubmitEmail } from '../../hooks/useSiteSubmitEmail';
import EmailComposerModal from '../EmailComposerModal';

export interface SiteSubmitData {
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
  client_id: string | null;
  assignment_id: string | null;
  deal_id: string | null;
  created_at?: string | null;
  created_by_id?: string | null;
  updated_at?: string | null;
  updated_by_id?: string | null;
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
    latitude: number | null;
    longitude: number | null;
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
  client: {
    id: string;
    client_name: string | null;
  } | null;
  assignment: {
    id: string;
    assignment_name: string | null;
  } | null;
}

type TabType = 'data' | 'chat' | 'files' | 'contacts';

// Initial data for creating new site submits
interface InitialSiteSubmitData {
  _isNew?: boolean;
  property_id?: string;
  property?: any;
  property_unit_id?: string | null;
  submit_stage_id?: string | null;
  submit_stage?: any;
  site_submit_name?: string;
  client_id?: string | null;
  year_1_rent?: number | null;
  ti?: number | null;
  notes?: string;
  date_submitted?: string | null;
}

interface SiteSubmitSidebarProps {
  siteSubmitId: string | null;
  isOpen: boolean;
  onClose: () => void;
  context: 'map' | 'portal';
  isEditable?: boolean; // Override for permission-based access
  onStatusChange?: (siteSubmitId: string, newStageId: string, newStageName: string) => void;
  onCenterOnPin?: (lat: number, lng: number) => void; // Map only
  onDeleteSiteSubmit?: (siteSubmitId: string, siteSubmitName: string) => void; // Map only
  onDataUpdate?: (updatedData: SiteSubmitData) => void; // Callback when data is updated
  onSiteSubmitCreated?: (newSiteSubmit: SiteSubmitData) => void; // Callback when new site submit is created
  rightOffset?: number; // Offset from right edge in pixels (for stacked sidebars)
  // Portal-specific props
  accessibleClients?: { id: string; client_name: string }[];
  siteSubmitRefreshTrigger?: number;
  // For creating new site submits
  initialData?: InitialSiteSubmitData;
}

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

// Pipeline tab stages
const PIPELINE_TAB_STAGES = ['LOI', 'Submitted-Reviewing', 'At Lease/PSA'];
const SIGNED_STAGES = ['Under Contract/Contingent', 'Booked', 'Executed Payable'];

export default function SiteSubmitSidebar({
  siteSubmitId,
  isOpen,
  onClose,
  context,
  isEditable: isEditableProp,
  onStatusChange,
  onCenterOnPin,
  onDeleteSiteSubmit,
  onDataUpdate,
  onSiteSubmitCreated,
  rightOffset = 0,
  accessibleClients = [],
  siteSubmitRefreshTrigger,
  initialData,
}: SiteSubmitSidebarProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine if editable - map context is always editable, portal depends on prop
  const isEditable = context === 'map' ? true : (isEditableProp ?? false);

  const [activeTab, setActiveTab] = useState<TabType>('data');
  const [siteSubmit, setSiteSubmit] = useState<SiteSubmitData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stages, setStages] = useState<{ id: string; name: string }[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [preparingEmail, setPreparingEmail] = useState(false);

  // Check if this is a new site submit creation
  const isNewSiteSubmit = initialData?._isNew === true && !siteSubmitId;

  // Toast helper for email
  const showToast = (message: string, options?: { type?: 'success' | 'error' | 'info'; duration?: number }) => {
    setToast({ message, type: options?.type || 'info' });
    setTimeout(() => setToast(null), options?.duration || 3000);
  };

  // Email functionality
  const {
    showEmailComposer,
    setShowEmailComposer,
    sendingEmail,
    emailDefaultData,
    prepareEmail,
    sendEmail,
  } = useSiteSubmitEmail({ showToast });

  // Handle email button click
  const handlePrepareEmail = async () => {
    if (!siteSubmitId) return;
    setPreparingEmail(true);
    try {
      await prepareEmail(siteSubmitId);
    } finally {
      setPreparingEmail(false);
    }
  };

  // Copy portal link to clipboard
  const handleCopyLink = () => {
    if (!siteSubmitId) return;
    const url = `${window.location.origin}/portal/map?selected=${siteSubmitId}`;
    navigator.clipboard.writeText(url);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // Determine current view from URL (for portal context)
  const isMapView = location.pathname.includes('/map');

  // Fetch stages for the dropdown
  useEffect(() => {
    async function fetchStages() {
      let query = supabase
        .from('submit_stage')
        .select('id, name');

      // Client view in portal: filter to only visible stages
      if (context === 'portal' && !isEditable) {
        query = query.in('name', CLIENT_VISIBLE_STAGES);
      }

      const { data, error } = await query;

      if (!error && data) {
        setStages(data);
      }
    }

    fetchStages();
  }, [context, isEditable]);

  // Stable reference for accessibleClients IDs (to avoid infinite re-fetching)
  const accessibleClientIds = accessibleClients.map(c => c.id).join(',');

  // Fetch site submit data
  useEffect(() => {
    // Track if the effect is still active (to prevent state updates after unmount)
    let isMounted = true;

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
          .eq('id', siteSubmitId)
          .single();

        if (!isMounted) return;
        if (fetchError) throw fetchError;

        // For portal context, verify access if accessibleClients is provided
        if (context === 'portal' && accessibleClients.length > 0) {
          const siteSubmitClientId = (data as any).client_id;
          const clientIds = accessibleClients.map(c => c.id);
          const hasAccess = siteSubmitClientId && clientIds.includes(siteSubmitClientId);

          if (!hasAccess) {
            setError('You do not have access to this property');
            setSiteSubmit(null);
            setLoading(false);
            return;
          }
        }

        // Fetch associated deal (if any)
        const { data: dealData } = await supabase
          .from('deal')
          .select('id')
          .eq('site_submit_id', siteSubmitId)
          .maybeSingle();

        if (!isMounted) return;

        // Combine site submit data with deal_id
        const siteSubmitData = {
          ...(data as unknown as SiteSubmitData),
          deal_id: dealData?.id || null,
        };

        setSiteSubmit(siteSubmitData);

        // For portal context, record the view
        if (context === 'portal') {
          const user = await supabase.auth.getUser();
          if (user.data.user) {
            await supabase.rpc('record_portal_site_submit_view', {
              p_user_id: user.data.user.id,
              p_site_submit_id: siteSubmitId,
            });
          }
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Error fetching site submit:', err);
        setError('Failed to load site submit details');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    if (isOpen && siteSubmitId) {
      // For portal, wait for accessibleClients to be loaded
      if (context === 'portal' && accessibleClientIds === '') {
        return;
      }
      fetchSiteSubmit();
    } else if (isOpen && initialData?._isNew && !siteSubmitId) {
      // Creating a new site submit - use initialData
      const newSiteSubmitData: SiteSubmitData = {
        id: '', // Empty for new
        site_submit_name: initialData.site_submit_name || null,
        submit_stage_id: initialData.submit_stage_id || null,
        date_submitted: initialData.date_submitted || null,
        notes: initialData.notes || null,
        delivery_timeframe: null,
        ti: initialData.ti || null,
        year_1_rent: initialData.year_1_rent || null,
        competitor_data: null,
        property_id: initialData.property_id || null,
        property_unit_id: initialData.property_unit_id || null,
        client_id: initialData.client_id || null,
        assignment_id: null,
        deal_id: null,
        property: initialData.property || null,
        property_unit: null,
        submit_stage: initialData.submit_stage || null,
        client: null,
        assignment: null,
      };
      setSiteSubmit(newSiteSubmitData);
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [siteSubmitId, isOpen, siteSubmitRefreshTrigger, context, accessibleClientIds, initialData]);

  // Handle view toggle (portal context)
  const handleToggleView = () => {
    if (context !== 'portal') return;

    if (isMapView) {
      const stageName = siteSubmit?.submit_stage?.name;
      let stageParam = '';

      if (stageName && PIPELINE_TAB_STAGES.includes(stageName)) {
        stageParam = `&stage=${encodeURIComponent(stageName)}`;
      } else if (stageName && SIGNED_STAGES.includes(stageName)) {
        stageParam = '&stage=signed';
      }

      navigate(`/portal/pipeline?selected=${siteSubmitId}${stageParam}`);
    } else {
      navigate(`/portal/map?selected=${siteSubmitId}`);
    }
  };

  // Handle center on pin (map context)
  const handleCenterOnPin = () => {
    if (context !== 'map' || !onCenterOnPin || !siteSubmit?.property) return;
    const lat = siteSubmit.property.latitude;
    const lng = siteSubmit.property.longitude;
    if (lat && lng) {
      onCenterOnPin(lat, lng);
    }
  };

  // Handle delete (map context)
  const handleDelete = () => {
    if (context !== 'map' || !onDeleteSiteSubmit || !siteSubmit) return;
    onDeleteSiteSubmit(siteSubmit.id, siteSubmit.site_submit_name || 'Unnamed');
  };

  // Handle data updates
  const handleUpdate = (updated: Partial<SiteSubmitData>) => {
    if (!siteSubmit) return;
    const updatedSiteSubmit = { ...siteSubmit, ...updated };
    setSiteSubmit(updatedSiteSubmit);
    if (onDataUpdate) {
      onDataUpdate(updatedSiteSubmit);
    }
  };

  // Build tabs based on context (no EMAIL tab - email is a header button)
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

  // Add contacts tab for map context only
  if (context === 'map') {
    tabs.push({
      id: 'contacts',
      label: 'CONTACTS',
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    });
  }

  return (
    <div
      className={`fixed bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{
        width: '500px',
        maxWidth: '90vw',
        top: '64px',
        height: 'calc(100vh - 64px)',
        right: `${rightOffset}px`,
      }}
    >
      {/* Toast notification */}
      {toast && (
        <div
          className={`absolute top-2 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-sm shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : toast.type === 'error'
              ? 'bg-red-500 text-white'
              : 'bg-blue-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div
        className="flex-shrink-0 px-4 py-3 border-b border-gray-200"
        style={{ backgroundColor: '#011742' }}
      >
        {/* Top row with title and action icons */}
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">
              {siteSubmit?.property?.property_name || siteSubmit?.site_submit_name || 'Site Details'}
            </h2>
          </div>

          {/* Action icon buttons - matching old PinDetailsSlideout design */}
          <div className="flex items-center gap-1 ml-2">
            {/* Email button (green) */}
            {isEditable && siteSubmit && (
              <button
                onClick={handlePrepareEmail}
                disabled={preparingEmail || !siteSubmit.client_id}
                className={`p-2 rounded-lg transition-colors ${
                  preparingEmail || !siteSubmit.client_id
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
                title={!siteSubmit.client_id ? 'A client must be assigned to send emails' : 'Send site submit email'}
              >
                {preparingEmail ? (
                  <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
              </button>
            )}

            {/* Delete button (red) - map context only */}
            {context === 'map' && isEditable && siteSubmit && (
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg bg-red-500 hover:bg-red-600 transition-colors"
                title="Delete site submit"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            )}

            {/* View toggle button (arrow) - portal context */}
            {context === 'portal' && (
              <button
                onClick={handleToggleView}
                className="p-2 rounded-lg bg-gray-600 hover:bg-gray-500 transition-colors"
                title={isMapView ? 'View in Pipeline' : 'View on Map'}
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </button>
            )}

            {/* Center on pin button (icon only) - map context */}
            {context === 'map' && siteSubmit?.property?.latitude && siteSubmit?.property?.longitude && (
              <button
                onClick={handleCenterOnPin}
                className="p-2 rounded-lg bg-blue-500 hover:bg-blue-600 transition-colors"
                title="Center map on this location"
              >
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            )}

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              aria-label="Close sidebar"
            >
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Address and unit info */}
        <div className="mt-2">
          <h3 className="text-white font-medium truncate">
            {siteSubmit?.site_submit_name || `${siteSubmit?.property?.property_name || ''} - ${siteSubmit?.client?.client_name || ''}`}
          </h3>
          {siteSubmit?.property?.address && (
            <p className="text-sm text-gray-300 truncate">
              {siteSubmit.property.address}
              {siteSubmit.property.city && `, ${siteSubmit.property.city}`}
              {siteSubmit.property.state && `, ${siteSubmit.property.state}`}
            </p>
          )}
          {siteSubmit?.property_unit && (
            <p className="text-sm text-blue-300 truncate">
              Unit: {siteSubmit.property_unit.property_unit_name}
            </p>
          )}
        </div>

        {/* Status Badge and portal buttons */}
        <div className="mt-3 flex items-center justify-between">
          {/* Status Badge - clickable dropdown when editable */}
          {siteSubmit ? (
            <StatusBadgeDropdown
              currentStageId={siteSubmit.submit_stage_id}
              currentStageName={siteSubmit.submit_stage?.name || null}
              siteSubmitId={siteSubmit.id}
              stages={stages}
              canEdit={isEditable}
              onStatusChange={(newStageId, newStageName) => {
                handleUpdate({
                  submit_stage_id: newStageId,
                  submit_stage: { id: newStageId, name: newStageName },
                });
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
              Loading...
            </span>
          )}

          {/* Portal context: Copy Link and View Toggle text buttons */}
          <div className="flex items-center gap-2">
            {context === 'portal' && isEditable && (
              <button
                onClick={handleCopyLink}
                className="py-1 px-2 rounded text-xs font-medium transition-colors flex items-center gap-1 hover:opacity-90"
                style={{ backgroundColor: linkCopied ? '#059669' : '#3b82f6', color: '#ffffff' }}
                title="Copy portal link to clipboard"
              >
                {linkCopied ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                    </svg>
                    <span>Copy Link</span>
                  </>
                )}
              </button>
            )}

            {context === 'portal' && (
              <button
                onClick={handleToggleView}
                className="py-1 px-2 rounded text-xs font-medium transition-colors flex items-center gap-1 hover:opacity-90"
                style={{ backgroundColor: '#f97316', color: '#ffffff' }}
              >
                {isMapView ? (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                    </svg>
                    <span>Pipeline</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                    </svg>
                    <span>Map</span>
                  </>
                )}
              </button>
            )}
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
        ) : isNewSiteSubmit ? (
          <SiteSubmitCreateForm
            initialData={siteSubmit}
            stages={stages}
            onSave={async (newSiteSubmit) => {
              if (onSiteSubmitCreated) {
                onSiteSubmitCreated(newSiteSubmit);
              }
              // Refresh and show the newly created record
              setSiteSubmit(newSiteSubmit);
            }}
            onCancel={onClose}
          />
        ) : (
          <>
            {activeTab === 'data' && (
              <SiteSubmitDataTab
                siteSubmit={siteSubmit}
                isEditable={isEditable}
                onUpdate={handleUpdate}
              />
            )}
            {activeTab === 'chat' && (
              <PortalChatTab
                siteSubmitId={siteSubmit.id}
                showInternalComments={isEditable}
                propertyId={siteSubmit.property_id}
                dealId={siteSubmit.deal_id}
              />
            )}
            {activeTab === 'files' && (
              <PortalFilesTab
                propertyId={siteSubmit.property_id}
                dealId={siteSubmit.deal_id}
                siteSubmitId={siteSubmit.id}
                canUpload={isEditable}
                isInternalUser={isEditable}
              />
            )}
            {activeTab === 'contacts' && context === 'map' && (
              <SiteSubmitContactsTab
                propertyId={siteSubmit.property_id}
                isEditable={isEditable}
              />
            )}
          </>
        )}
      </div>

      {/* Email Composer Modal */}
      <EmailComposerModal
        isOpen={showEmailComposer}
        onClose={() => setShowEmailComposer(false)}
        onSend={(emailData) => siteSubmit && sendEmail(siteSubmit.id, emailData)}
        defaultSubject={emailDefaultData.subject}
        defaultBody={emailDefaultData.body}
        defaultRecipients={emailDefaultData.recipients}
        templateData={emailDefaultData.templateData}
        availableFiles={emailDefaultData.availableFiles}
        sending={sendingEmail}
        title={`Email: ${siteSubmit?.property?.property_name || 'Site Submit'}`}
      />
    </div>
  );
}
