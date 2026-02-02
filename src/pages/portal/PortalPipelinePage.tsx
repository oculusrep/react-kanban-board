import { useEffect, useState, useCallback, useRef } from 'react';
import { usePortal } from '../../contexts/PortalContext';
import { useAuth } from '../../contexts/AuthContext';
import { Navigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import PortalDetailSidebar from '../../components/portal/PortalDetailSidebar';

interface SiteSubmit {
  id: string;
  site_submit_name: string;
  submit_stage_id: string;
  date_submitted: string | null;
  notes: string | null;
  delivery_timeframe: string | null;
  ti: number | null;
  year_1_rent: number | null;
  competitor_data: string | null;
  property_unit_id: string | null;
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

interface SubmitStage {
  id: string;
  name: string;
}

// Stage tab configuration
const HIDDEN_STAGE_NAMES = ['Use Conflict', 'Not Available', 'Use Declined', 'Lost / Killed'];
const SIGNED_STAGE_NAMES = ['Under Contract/Contingent', 'Booked', 'Executed Payable'];
const STAGE_DISPLAY_NAMES: Record<string, string> = {
  'Submitted-Reviewing': 'For Review',
};
// Define tab order: Signed comes after At Lease/PSA, Pass comes after Signed
const STAGE_TAB_ORDER = ['Submitted-Reviewing', 'LOI', 'At Lease/PSA', 'Pass', 'Store Opened'];

// Client-visible stages
const VISIBLE_STAGES = [
  'Submitted-Reviewing',
  'Pass',
  'Use Declined',
  'Use Conflict',
  'Not Available',
  'Lost / Killed',
  'LOI',
  'At Lease/PSA',
  'Under Contract/Contingent',
  'Store Opened'
];

/**
 * PortalPipelinePage - Pipeline table view for the client portal
 */
export default function PortalPipelinePage() {
  const { selectedClient, selectedClientId, accessibleClients, isInternalUser } = usePortal();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  const [stages, setStages] = useState<SubmitStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Read/unread tracking
  const [viewedSiteSubmits, setViewedSiteSubmits] = useState<Set<string>>(new Set());

  // Detail sidebar
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string | null>(
    searchParams.get('selected')
  );
  const [sidebarOpen, setSidebarOpen] = useState(!!searchParams.get('selected'));

  // Filters
  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting
  const [sortColumn, setSortColumn] = useState<string>('property_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Track if we've scrolled to the selected row
  const hasScrolledToSelected = useRef(false);

  // Handle opening a site submit
  const handleOpenSiteSubmit = (id: string) => {
    setSelectedSiteSubmitId(id);
    setSidebarOpen(true);
    setSearchParams({ selected: id });
    // Mark as viewed immediately for instant UI feedback
    markAsViewed(id);
  };

  // Handle closing sidebar
  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    setSelectedSiteSubmitId(null);
    setSearchParams({});
  };

  // Handle stage filter change - also closes sidebar to prevent accidental edits
  const handleStageChange = (stageId: string | null) => {
    setSelectedStageId(stageId);
    // Close sidebar when switching stages
    if (sidebarOpen) {
      setSidebarOpen(false);
      setSelectedSiteSubmitId(null);
      setSearchParams({});
    }
  };

  useEffect(() => {
    document.title = `Pipeline - ${selectedClient?.client_name || 'Portal'} | OVIS`;
  }, [selectedClient]);

  // Fetch stages
  useEffect(() => {
    async function fetchStages() {
      const { data, error } = await supabase
        .from('submit_stage')
        .select('id, name')
        .in('name', VISIBLE_STAGES);

      if (error) {
        console.error('Error fetching stages:', error);
      } else {
        setStages(data || []);
      }
    }

    fetchStages();
  }, []);

  // Auto-select tab based on URL stage param (when navigating from "View in Pipeline")
  useEffect(() => {
    const stageParam = searchParams.get('stage');
    if (stageParam && stages.length > 0) {
      if (stageParam === 'signed') {
        // Signed tab
        setSelectedStageId('signed');
      } else {
        // Find the stage ID for the given stage name
        const stage = stages.find(s => s.name === stageParam);
        if (stage) {
          setSelectedStageId(stage.id);
        }
      }
      // Clear the stage param from URL to avoid re-triggering
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('stage');
      setSearchParams(newParams, { replace: true });
    }
  }, [stages, searchParams]);

  // Fetch site submits
  useEffect(() => {
    async function fetchSiteSubmits() {
      if (!selectedClientId && accessibleClients.length > 1) {
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Get client IDs to filter by
        const clientIds = selectedClientId
          ? [selectedClientId]
          : accessibleClients.map(c => c.id);

        if (clientIds.length === 0) {
          setSiteSubmits([]);
          return;
        }

        // Get stage IDs for visible stages
        const { data: stageData } = await supabase
          .from('submit_stage')
          .select('id')
          .in('name', VISIBLE_STAGES);

        const visibleStageIds = stageData?.map(s => s.id) || [];

        if (visibleStageIds.length === 0) {
          setSiteSubmits([]);
          return;
        }

        // Fetch site submits - always fetch all visible stages, filter client-side
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
            property_unit_id,
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
              all_in_rent
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
          .in('client_id', clientIds)
          .in('submit_stage_id', visibleStageIds);

        if (fetchError) throw fetchError;

        setSiteSubmits((data || []) as unknown as SiteSubmit[]);
      } catch (err) {
        console.error('Error fetching site submits:', err);
        setError('Failed to load site submits');
      } finally {
        setLoading(false);
      }
    }

    fetchSiteSubmits();
  }, [selectedClientId, accessibleClients]);

  // Fetch viewed site submits for read/unread tracking
  useEffect(() => {
    async function fetchViewedSiteSubmits() {
      if (!user?.id) return;

      try {
        const { data, error } = await supabase
          .from('portal_site_submit_view')
          .select('site_submit_id')
          .eq('user_id', user.id);

        if (error) {
          console.error('Error fetching viewed site submits:', error);
          return;
        }

        setViewedSiteSubmits(new Set((data || []).map(v => v.site_submit_id)));
      } catch (err) {
        console.error('Error fetching viewed site submits:', err);
      }
    }

    fetchViewedSiteSubmits();
  }, [user?.id, siteSubmits]); // Refetch when site submits change

  // Mark a site submit as viewed
  const markAsViewed = useCallback((siteSubmitId: string) => {
    setViewedSiteSubmits(prev => new Set([...prev, siteSubmitId]));
  }, []);

  // Scroll to selected row when coming from "View in Pipeline"
  useEffect(() => {
    if (selectedSiteSubmitId && !loading && siteSubmits.length > 0 && !hasScrolledToSelected.current) {
      // Find the row element by data-id
      const rowElement = document.querySelector(`tr[data-id="${selectedSiteSubmitId}"]`);
      if (rowElement) {
        // Scroll the row into view with some padding
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hasScrolledToSelected.current = true;
      }
    }
  }, [selectedSiteSubmitId, loading, siteSubmits]);

  // Reset scroll tracking when selection changes via URL
  useEffect(() => {
    const selectedFromUrl = searchParams.get('selected');
    if (selectedFromUrl && selectedFromUrl !== selectedSiteSubmitId) {
      hasScrolledToSelected.current = false;
    }
  }, [searchParams]);

  // If no client selected and multiple available, redirect to select
  if (!selectedClientId && accessibleClients.length > 1) {
    return <Navigate to="/portal" replace />;
  }

  // Get stage IDs for the "Signed" group
  const signedStageIds = stages
    .filter(s => SIGNED_STAGE_NAMES.includes(s.name))
    .map(s => s.id);

  // Filter by stage and search term
  const filteredSubmits = siteSubmits.filter(ss => {
    // Stage filter
    if (selectedStageId) {
      if (selectedStageId === 'signed') {
        // "Signed" tab - match any of the signed stages
        if (!signedStageIds.includes(ss.submit_stage_id)) return false;
      } else {
        // Normal stage filter
        if (ss.submit_stage_id !== selectedStageId) return false;
      }
    }

    // Search term filter
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      ss.property?.property_name?.toLowerCase().includes(term) ||
      ss.property?.address?.toLowerCase().includes(term) ||
      ss.notes?.toLowerCase().includes(term) ||
      ss.site_submit_name?.toLowerCase().includes(term)
    );
  });

  // Helper functions to get values with unit fallback
  const getSqft = (ss: SiteSubmit) =>
    ss.property_unit?.sqft ?? ss.property?.available_sqft ?? null;
  const getRentPsf = (ss: SiteSubmit) =>
    ss.property_unit?.rent ?? ss.property?.rent_psf ?? null;
  const getNnnPsf = (ss: SiteSubmit) =>
    ss.property_unit?.nnn ?? ss.property?.nnn_psf ?? null;
  const getAllInRent = (ss: SiteSubmit) => {
    // If unit has both rent and nnn, calculate all-in rent from unit
    if (ss.property_unit?.rent != null && ss.property_unit?.nnn != null) {
      return ss.property_unit.rent + ss.property_unit.nnn;
    }
    // Otherwise fall back to property all-in rent
    return ss.property?.all_in_rent ?? null;
  };

  // Sort
  const sortedSubmits = [...filteredSubmits].sort((a, b) => {
    let aVal: any = '';
    let bVal: any = '';

    switch (sortColumn) {
      case 'property_name':
        aVal = a.property?.property_name || '';
        bVal = b.property?.property_name || '';
        break;
      case 'address':
        aVal = a.property?.address || '';
        bVal = b.property?.address || '';
        break;
      case 'available_sqft':
        aVal = getSqft(a) || 0;
        bVal = getSqft(b) || 0;
        break;
      case 'rent_psf':
        aVal = getRentPsf(a) || 0;
        bVal = getRentPsf(b) || 0;
        break;
      case 'nnn_psf':
        aVal = getNnnPsf(a) || 0;
        bVal = getNnnPsf(b) || 0;
        break;
      case 'all_in_rent':
        aVal = getAllInRent(a) || 0;
        bVal = getAllInRent(b) || 0;
        break;
      case 'year_1_rent':
        aVal = a.year_1_rent || 0;
        bVal = b.year_1_rent || 0;
        break;
      case 'ti':
        aVal = a.ti || 0;
        bVal = b.ti || 0;
        break;
      case 'status':
        aVal = a.submit_stage?.name || '';
        bVal = b.submit_stage?.name || '';
        break;
      default:
        aVal = a.property?.property_name || '';
        bVal = b.property?.property_name || '';
    }

    if (typeof aVal === 'string') {
      return sortDirection === 'asc'
        ? aVal.localeCompare(bVal)
        : bVal.localeCompare(aVal);
    }

    return sortDirection === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  };

  const formatNumber = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return value.toLocaleString();
  };

  const SortHeader = ({ column, label }: { column: string; label: string }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100 select-none"
      onClick={() => handleSort(column)}
    >
      <div className="flex items-center space-x-1">
        <span>{label}</span>
        {sortColumn === column && (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={sortDirection === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
            />
          </svg>
        )}
      </div>
    </th>
  );

  return (
    <div
      className="h-[calc(100vh-64px)] flex flex-col transition-[margin] duration-300 ease-in-out"
      style={{ marginRight: sidebarOpen ? '500px' : '0px' }}
    >
      {/* Filters Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          {/* Stage Filter Tabs - Option C: Minimal Chips */}
          <div className="flex items-center space-x-1.5 overflow-x-auto pb-1">
            {/* Individual stage tabs in defined order, with Signed inserted after At Lease/PSA */}
            {STAGE_TAB_ORDER.map(stageName => {
              const stage = stages.find(s => s.name === stageName);
              if (!stage) return null;

              // Render the stage tab
              const count = siteSubmits.filter(ss => ss.submit_stage_id === stage.id).length;
              const displayName = STAGE_DISPLAY_NAMES[stage.name] || stage.name;

              return (
                <div key={stage.id} className="contents">
                  <button
                    onClick={() => handleStageChange(stage.id)}
                    className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border ${
                      selectedStageId === stage.id
                        ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    {displayName}
                    <span className={`ml-1.5 text-xs ${
                      selectedStageId === stage.id ? 'text-blue-500' : 'text-gray-400'
                    }`}>
                      {count}
                    </span>
                  </button>

                  {/* Insert Signed tab after At Lease/PSA */}
                  {stageName === 'At Lease/PSA' && (() => {
                    const signedCount = siteSubmits.filter(ss => signedStageIds.includes(ss.submit_stage_id)).length;
                    return (
                      <button
                        onClick={() => handleStageChange('signed')}
                        className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border ${
                          selectedStageId === 'signed'
                            ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
                        }`}
                      >
                        Signed
                        <span className={`ml-1.5 text-xs ${
                          selectedStageId === 'signed' ? 'text-blue-500' : 'text-gray-400'
                        }`}>
                          {signedCount}
                        </span>
                      </button>
                    );
                  })()}
                </div>
              );
            })}

            {/* All Sites - moved to far right */}
            <button
              onClick={() => handleStageChange(null)}
              className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border ${
                !selectedStageId
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              All Sites
              <span className={`ml-1.5 text-xs ${
                !selectedStageId ? 'text-blue-500' : 'text-gray-400'
              }`}>
                {siteSubmits.length}
              </span>
            </button>
          </div>

          {/* Search - aligned to right */}
          <div className="max-w-xs ml-auto">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search properties..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-red-600">{error}</p>
            </div>
          </div>
        ) : sortedSubmits.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p>No site submits found</p>
            </div>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <SortHeader column="property_name" label="Property Name" />
                <SortHeader column="address" label="Address" />
                <SortHeader column="available_sqft" label="Avail. Sqft" />
                <SortHeader column="rent_psf" label="Rent PSF" />
                <SortHeader column="nnn_psf" label="NNN PSF" />
                <SortHeader column="all_in_rent" label="All-in Rent" />
                <SortHeader column="year_1_rent" label="Year 1 Rent" />
                <SortHeader column="ti" label="TI" />
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Notes</th>
                <SortHeader column="status" label="Status" />
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {sortedSubmits.map((ss) => {
                const isUnread = !viewedSiteSubmits.has(ss.id);
                return (
                <tr
                  key={ss.id}
                  data-id={ss.id}
                  className={`hover:bg-blue-50 cursor-pointer transition-colors ${
                    selectedSiteSubmitId === ss.id
                      ? 'bg-blue-100'
                      : isUnread
                      ? 'bg-amber-50'
                      : ''
                  }`}
                  onClick={() => handleOpenSiteSubmit(ss.id)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center space-x-2">
                      {/* Unread indicator dot */}
                      {isUnread && (
                        <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" title="New" />
                      )}
                      <div className={`text-sm ${isUnread ? 'font-semibold text-gray-900' : 'font-medium text-gray-900'}`}>
                        {ss.property?.property_name || ss.site_submit_name || '-'}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm text-gray-600">
                      {ss.property?.address || '-'}
                      {ss.property?.city && (
                        <span className="text-gray-400">
                          , {ss.property.city}, {ss.property.state}
                        </span>
                      )}
                    </div>
                    {ss.property_unit?.property_unit_name && (
                      <div className="text-xs text-gray-400">
                        {ss.property_unit.property_unit_name}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatNumber(getSqft(ss))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatCurrency(getRentPsf(ss))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatCurrency(getNnnPsf(ss))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatCurrency(getAllInRent(ss))}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatCurrency(ss.year_1_rent)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                    {formatCurrency(ss.ti)}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="text-sm text-gray-600 truncate" title={ss.notes || ''}>
                      {ss.notes || '-'}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-800">
                      {ss.submit_stage?.name || '-'}
                    </span>
                  </td>
                </tr>
              )})}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail Sidebar */}
      <PortalDetailSidebar
        siteSubmitId={selectedSiteSubmitId}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
      />
    </div>
  );
}
