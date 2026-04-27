import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import {
  PipelineSiteSubmit,
  useClientPipelineData,
} from '../../hooks/useClientPipelineData';
import {
  SIGNED_STAGE_NAMES,
  STAGE_DISPLAY_NAMES,
  STAGE_TAB_ORDER,
} from './pipelineConfig';
import SiteSubmitSidebar from '../shared/SiteSubmitSidebar';
import StatusBadgeDropdown from '../portal/StatusBadgeDropdown';
import RecentChangesTab from '../portal/RecentChangesTab';

export interface ClientPipelineBoardProps {
  /** IDs of clients whose site submits to show. Empty array → empty state. */
  clientIds: string[];
  /** Optional list of stage names to include. Omit to include all stages. */
  visibleStageNames?: string[];
  /** When true, stage dropdown + sidebar allow editing (broker/internal use). */
  isEditable: boolean;
  /** Shows the "Other Stages" dropdown of non-tabbed stages. */
  showOtherStagesDropdown?: boolean;
  /** Shows the "Copy For Review Link" button (portal only). */
  showCopyForReviewButton?: boolean;
  /** Which context the sidebar runs in (affects chat/files behavior). */
  sidebarContext: 'map' | 'portal';
  /** Passed to sidebar for multi-client awareness. */
  accessibleClients?: { id: string; client_name: string }[];
  /** Bumped to force-refresh from external source (e.g., portal trigger). */
  refreshTrigger?: number;
  /** Called after local status change; parent can propagate to other views. */
  onStatusChange?: (siteSubmitId: string, newStageId: string, newStageName: string) => void;
  /** Controlled selected site submit (optional). */
  selectedSiteSubmitId?: string | null;
  /** Called when a site submit row is opened. */
  onSelectSiteSubmit?: (id: string | null) => void;
  /** Initial stage to select on mount. Stage name, 'signed' (group), or null (All Sites). Defaults to 'Submitted-Reviewing'. */
  initialStageName?: string | 'signed' | null;
  /** Called when the Copy For Review button is clicked (implementation is consumer-owned). */
  onCopyForReviewLink?: () => void;
  /** Back-button rendered in the filter bar (e.g., "back to map"). */
  headerActions?: React.ReactNode;
  /** Called when user clicks "View Property" in the sidebar. Forwards to SiteSubmitSidebar. */
  onViewProperty?: (propertyId: string) => void;
  /** Right offset (px) to apply to the site submit sidebar. Used when a secondary slideout is stacked to its right. */
  siteSubmitSidebarRightOffset?: number;
}

export default function ClientPipelineBoard({
  clientIds,
  visibleStageNames,
  isEditable,
  showOtherStagesDropdown = false,
  showCopyForReviewButton = false,
  sidebarContext,
  accessibleClients = [],
  refreshTrigger,
  onStatusChange,
  selectedSiteSubmitId: selectedIdProp,
  onSelectSiteSubmit,
  initialStageName = 'Submitted-Reviewing',
  onCopyForReviewLink,
  headerActions,
  onViewProperty,
  siteSubmitSidebarRightOffset = 0,
}: ClientPipelineBoardProps) {
  const { user } = useAuth();
  const { siteSubmits, stages, loading, error, applyStatusChange } = useClientPipelineData({
    clientIds,
    visibleStageNames,
    refreshTrigger,
  });

  const [selectedStageId, setSelectedStageId] = useState<string | null>(null);
  const [initialStageApplied, setInitialStageApplied] = useState(false);

  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(null);
  const selectedSiteSubmitId =
    selectedIdProp !== undefined ? selectedIdProp : internalSelectedId;
  const setSelectedSiteSubmitId = (val: string | null) => {
    if (onSelectSiteSubmit) onSelectSiteSubmit(val);
    else setInternalSelectedId(val);
  };
  const sidebarOpen = !!selectedSiteSubmitId;

  const [searchTerm, setSearchTerm] = useState('');
  const [otherStagesDropdownOpen, setOtherStagesDropdownOpen] = useState(false);
  const [sortColumn, setSortColumn] = useState<string>('property_name');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [forReviewLinkCopied, setForReviewLinkCopied] = useState(false);

  const [viewedSiteSubmits, setViewedSiteSubmits] = useState<Set<string>>(new Set());

  const hasScrolledToSelected = useRef(false);
  const otherStagesDropdownRef = useRef<HTMLDivElement>(null);

  const forReviewStageId = stages.find((s) => s.name === 'Submitted-Reviewing')?.id;
  const isViewingForReview = selectedStageId === forReviewStageId;

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        otherStagesDropdownRef.current &&
        !otherStagesDropdownRef.current.contains(event.target as Node)
      ) {
        setOtherStagesDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Apply the initial stage selection once stages are loaded
  useEffect(() => {
    if (initialStageApplied) return;
    if (stages.length === 0) return;
    if (selectedSiteSubmitId) {
      // A selected site submit will drive stage selection in the effect below.
      setInitialStageApplied(true);
      return;
    }
    if (initialStageName === null) {
      setSelectedStageId(null);
      setInitialStageApplied(true);
      return;
    }
    if (initialStageName === 'signed') {
      setSelectedStageId('signed');
      setInitialStageApplied(true);
      return;
    }
    if (initialStageName === 'recent_changes') {
      setSelectedStageId('recent_changes');
      setInitialStageApplied(true);
      return;
    }
    const stage = stages.find((s) => s.name === initialStageName);
    if (stage) {
      setSelectedStageId(stage.id);
      setInitialStageApplied(true);
    }
  }, [stages, initialStageName, initialStageApplied, selectedSiteSubmitId]);

  // Fetch viewed site submits for read/unread tracking
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    async function fetchViewed() {
      const { data, error: fetchError } = await supabase
        .from('portal_site_submit_view')
        .select('site_submit_id')
        .eq('user_id', user!.id);

      if (cancelled) return;
      if (fetchError) {
        console.error('Error fetching viewed site submits:', fetchError);
        return;
      }
      setViewedSiteSubmits(new Set((data || []).map((v) => v.site_submit_id)));
    }

    fetchViewed();
    return () => {
      cancelled = true;
    };
  }, [user?.id, siteSubmits.length]);

  // When a selected site submit changes stage (from URL deep link or navigation),
  // switch the tab to that stage so it's visible.
  useEffect(() => {
    if (!selectedSiteSubmitId) return;
    if (siteSubmits.length === 0) return;
    const selectedSubmit = siteSubmits.find((ss) => ss.id === selectedSiteSubmitId);
    const stageName = selectedSubmit?.submit_stage?.name;
    if (!stageName) return;

    if (SIGNED_STAGE_NAMES.includes(stageName)) {
      setSelectedStageId('signed');
    } else if (STAGE_TAB_ORDER.includes(stageName)) {
      const stage = stages.find((s) => s.name === stageName);
      if (stage) setSelectedStageId(stage.id);
    } else {
      setSelectedStageId(null);
    }
  }, [selectedSiteSubmitId, siteSubmits, stages]);

  // Scroll to selected row when coming from deep link / cross-view navigation
  useEffect(() => {
    if (!selectedSiteSubmitId) {
      hasScrolledToSelected.current = false;
      return;
    }
    if (loading || siteSubmits.length === 0) return;
    if (hasScrolledToSelected.current) return;

    const row = document.querySelector(`tr[data-id="${selectedSiteSubmitId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      hasScrolledToSelected.current = true;
    }
  }, [selectedSiteSubmitId, loading, siteSubmits]);

  const markAsViewed = (siteSubmitId: string) => {
    setViewedSiteSubmits((prev) => new Set([...prev, siteSubmitId]));
  };

  const handleOpenSiteSubmit = (id: string) => {
    setSelectedSiteSubmitId(id);
    markAsViewed(id);
  };

  const handleCloseSidebar = () => {
    setSelectedSiteSubmitId(null);
  };

  const handleStageChange = (stageId: string | null) => {
    setSelectedStageId(stageId);
    if (sidebarOpen) setSelectedSiteSubmitId(null);
  };

  const handleCopyForReviewLinkClick = () => {
    if (onCopyForReviewLink) onCopyForReviewLink();
    setForReviewLinkCopied(true);
    setTimeout(() => setForReviewLinkCopied(false), 2000);
  };

  const handleLocalStatusChange = (
    siteSubmitId: string,
    newStageId: string,
    newStageName: string
  ) => {
    applyStatusChange(siteSubmitId, newStageId, newStageName);
    onStatusChange?.(siteSubmitId, newStageId, newStageName);
  };

  // Stage grouping helpers
  const signedStageIds = stages
    .filter((s) => SIGNED_STAGE_NAMES.includes(s.name))
    .map((s) => s.id);

  const tabStageNames = [...STAGE_TAB_ORDER, ...SIGNED_STAGE_NAMES];
  const otherStages = stages
    .filter((s) => !tabStageNames.includes(s.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  const isViewingOtherStage =
    selectedStageId && otherStages.some((s) => s.id === selectedStageId);
  const selectedOtherStageName = isViewingOtherStage
    ? otherStages.find((s) => s.id === selectedStageId)?.name
    : null;

  // Filter
  const filteredSubmits = siteSubmits.filter((ss) => {
    if (selectedStageId) {
      if (selectedStageId === 'signed') {
        if (!signedStageIds.includes(ss.submit_stage_id)) return false;
      } else {
        if (ss.submit_stage_id !== selectedStageId) return false;
      }
    }
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      ss.property?.property_name?.toLowerCase().includes(term) ||
      ss.property?.address?.toLowerCase().includes(term) ||
      ss.notes?.toLowerCase().includes(term) ||
      ss.site_submit_name?.toLowerCase().includes(term)
    );
  });

  // Accessors with unit fallback
  const getSqft = (ss: PipelineSiteSubmit) =>
    ss.property_unit?.sqft ?? ss.property?.available_sqft ?? null;
  const getRentPsf = (ss: PipelineSiteSubmit) =>
    ss.property_unit?.rent ?? ss.property?.rent_psf ?? null;
  const getNnnPsf = (ss: PipelineSiteSubmit) =>
    ss.property_unit?.nnn ?? ss.property?.nnn_psf ?? null;
  const getAllInRent = (ss: PipelineSiteSubmit) => {
    if (ss.property_unit?.rent != null && ss.property_unit?.nnn != null) {
      return ss.property_unit.rent + ss.property_unit.nnn;
    }
    if (ss.property?.rent_psf != null && ss.property?.nnn_psf != null) {
      return ss.property.rent_psf + ss.property.nnn_psf;
    }
    return ss.property?.all_in_rent ?? null;
  };

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
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
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
      maximumFractionDigits: 2,
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
      style={{
        marginRight: sidebarOpen ? `${500 + siteSubmitSidebarRightOffset}px` : '0px',
      }}
    >
      {/* Filters Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {headerActions}

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {STAGE_TAB_ORDER.map((stageName) => {
              const stage = stages.find((s) => s.name === stageName);
              if (!stage) return null;
              const count = siteSubmits.filter((ss) => ss.submit_stage_id === stage.id).length;
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
                    <span
                      className={`ml-1.5 text-xs ${
                        selectedStageId === stage.id ? 'text-blue-500' : 'text-gray-400'
                      }`}
                    >
                      {count}
                    </span>
                  </button>

                  {stageName === 'At Lease/PSA' &&
                    (() => {
                      const signedCount = siteSubmits.filter((ss) =>
                        signedStageIds.includes(ss.submit_stage_id)
                      ).length;
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
                          <span
                            className={`ml-1.5 text-xs ${
                              selectedStageId === 'signed' ? 'text-blue-500' : 'text-gray-400'
                            }`}
                          >
                            {signedCount}
                          </span>
                        </button>
                      );
                    })()}
                </div>
              );
            })}

            <button
              onClick={() => handleStageChange(null)}
              className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border ${
                !selectedStageId
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
              }`}
            >
              All Sites
              <span
                className={`ml-1.5 text-xs ${
                  !selectedStageId ? 'text-blue-500' : 'text-gray-400'
                }`}
              >
                {siteSubmits.length}
              </span>
            </button>

            <button
              onClick={() => handleStageChange('recent_changes')}
              className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border ${
                selectedStageId === 'recent_changes'
                  ? 'bg-blue-50 text-blue-700 border-blue-200 shadow-sm'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
              }`}
              title="Activity from the last 7 days"
            >
              Recent Changes
            </button>
          </div>

          {showOtherStagesDropdown && otherStages.length > 0 && (
            <div className="relative" ref={otherStagesDropdownRef}>
              <button
                onClick={() => setOtherStagesDropdownOpen(!otherStagesDropdownOpen)}
                className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                  isViewingOtherStage
                    ? 'bg-purple-50 text-purple-700 border-purple-200 shadow-sm'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:text-gray-900 hover:border-gray-300'
                }`}
              >
                {isViewingOtherStage ? selectedOtherStageName : 'Other Stages'}
                <ChevronDownIcon
                  className={`w-4 h-4 transition-transform ${
                    otherStagesDropdownOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {otherStagesDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[180px] max-h-64 overflow-y-auto">
                  {otherStages.map((stage) => {
                    const count = siteSubmits.filter(
                      (ss) => ss.submit_stage_id === stage.id
                    ).length;
                    return (
                      <button
                        key={stage.id}
                        onClick={() => {
                          handleStageChange(stage.id);
                          setOtherStagesDropdownOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-sm text-left hover:bg-gray-50 flex items-center justify-between ${
                          selectedStageId === stage.id
                            ? 'bg-purple-50 text-purple-700'
                            : 'text-gray-700'
                        }`}
                      >
                        <span>{stage.name}</span>
                        <span className="text-xs text-gray-400">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {showCopyForReviewButton && isViewingForReview && (
            <button
              onClick={handleCopyForReviewLinkClick}
              className={`px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap transition-all border flex items-center gap-1.5 ${
                forReviewLinkCopied
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
              }`}
              title="Copy link to share the For Review tab with clients"
            >
              {forReviewLinkCopied ? (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                    />
                  </svg>
                  Copy For Review Link
                </>
              )}
            </button>
          )}

          <div className="flex-1" />

          <div className="max-w-xs">
            <div className="relative">
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
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
        {selectedStageId === 'recent_changes' ? (
          <RecentChangesTab
            clientIds={clientIds}
            onSelectSiteSubmit={(id) => setSelectedSiteSubmitId(id)}
          />
        ) : loading ? (
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
              <svg
                className="mx-auto h-12 w-12 text-gray-400 mb-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                />
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
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Notes
                </th>
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
                        {isUnread &&
                          (isViewingForReview ? (
                            <span className="flex-shrink-0 px-1.5 py-0.5 text-xs font-semibold text-white bg-blue-500 rounded">
                              New
                            </span>
                          ) : (
                            <span
                              className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500"
                              title="New"
                            />
                          ))}
                        <div
                          className={`text-sm ${
                            isUnread
                              ? 'font-semibold text-gray-900'
                              : 'font-medium text-gray-900'
                          }`}
                        >
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
                      <StatusBadgeDropdown
                        currentStageId={ss.submit_stage_id}
                        currentStageName={ss.submit_stage?.name || null}
                        siteSubmitId={ss.id}
                        stages={stages}
                        canEdit={isEditable}
                        onStatusChange={(newStageId, newStageName) =>
                          handleLocalStatusChange(ss.id, newStageId, newStageName)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <SiteSubmitSidebar
        siteSubmitId={selectedSiteSubmitId}
        isOpen={sidebarOpen}
        onClose={handleCloseSidebar}
        context={sidebarContext}
        isEditable={isEditable}
        onStatusChange={handleLocalStatusChange}
        accessibleClients={accessibleClients}
        siteSubmitRefreshTrigger={refreshTrigger}
        onViewProperty={onViewProperty}
        rightOffset={siteSubmitSidebarRightOffset}
      />
    </div>
  );
}
