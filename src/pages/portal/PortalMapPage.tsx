import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePortal } from '../../contexts/PortalContext';
import GoogleMapContainer from '../../components/mapping/GoogleMapContainer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig } from '../../components/mapping/layers/SiteSubmitLayer';
import SiteSubmitLegend from '../../components/mapping/SiteSubmitLegend';
import AddressSearchBox from '../../components/mapping/AddressSearchBox';
import PortalDetailSidebar from '../../components/portal/PortalDetailSidebar';
import { LayerManagerProvider } from '../../components/mapping/layers/LayerManager';
import { STAGE_CATEGORIES } from '../../components/mapping/SiteSubmitPin';
import { geocodingService } from '../../services/geocodingService';

// Portal-visible stages (from spec)
// Note: Stage names must match database format exactly (no spaces around dashes)
const PORTAL_VISIBLE_STAGES = [
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
];

/**
 * PortalMapPage - Map view for the client portal
 *
 * Features:
 * - Site submit pins filtered by client and portal-visible stages
 * - Stage toggle legend
 * - Property search bar
 * - Clustering
 * - Portal detail sidebar
 */
export default function PortalMapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedClientId, accessibleClients, isInternalUser } = usePortal();

  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string | null>(
    searchParams.get('selected')
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(!!searchParams.get('selected')); // Open if URL has selection

  // Legend state - initialize with portal-visible stages
  const [visibleStages, setVisibleStages] = useState<Set<string>>(() => {
    return new Set(PORTAL_VISIBLE_STAGES);
  });
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  // Search state
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMarkers, setSearchMarkers] = useState<google.maps.Marker[]>([]);

  // Track if we've already centered on the selected marker from URL
  const [hasCenteredOnSelected, setHasCenteredOnSelected] = useState(false);

  // Update document title
  useEffect(() => {
    document.title = 'Map | Client Portal';
  }, []);

  // Handle URL param changes for selected site submit
  useEffect(() => {
    const selectedId = searchParams.get('selected');
    if (selectedId && selectedId !== selectedSiteSubmitId) {
      setSelectedSiteSubmitId(selectedId);
      setIsSidebarOpen(true);
      setHasCenteredOnSelected(false); // Reset centering flag for new selection
    }
  }, [searchParams]);

  // Site submit layer configuration
  // For internal users with no selection: show all (they can see everything)
  // For portal users: must have a client selected (auto-selected if only one)
  const siteSubmitConfig: SiteSubmitLoadingConfig = useMemo(() => {
    // Internal users viewing all clients
    if (isInternalUser && !selectedClientId) {
      return {
        mode: 'static-all',
        visibleStages,
        clusterConfig: {
          minimumClusterSize: 5,
          gridSize: 60,
          maxZoom: 15,
        },
        markerStyle: {
          shape: 'teardrop',
          useAdvancedMarkers: true,
        },
      };
    }

    // Client-filtered mode (for portal users or when client selected)
    return {
      mode: 'client-filtered',
      clientId: selectedClientId || (accessibleClients.length === 1 ? accessibleClients[0].id : null),
      visibleStages,
      clusterConfig: {
        minimumClusterSize: 5,
        gridSize: 60,
        maxZoom: 15,
      },
      markerStyle: {
        shape: 'teardrop',
        useAdvancedMarkers: true,
      },
    };
  }, [selectedClientId, visibleStages, isInternalUser, accessibleClients]);

  // Handle site submit click
  const handleSiteSubmitClick = useCallback((siteSubmit: any) => {
    setSelectedSiteSubmitId(siteSubmit.id);
    setIsSidebarOpen(true);

    // Update URL
    setSearchParams({ selected: siteSubmit.id });
  }, [setSearchParams]);

  // Handle selected site submit position - center map on it (from "View on Map" in Pipeline)
  const handleSelectedSiteSubmitPosition = useCallback((lat: number, lng: number) => {
    if (!mapInstance || hasCenteredOnSelected) return;

    console.log('🎯 Centering map on selected property:', { lat, lng });
    mapInstance.setCenter({ lat, lng });
    mapInstance.setZoom(15); // Zoom in to show the property clearly
    setHasCenteredOnSelected(true);
  }, [mapInstance, hasCenteredOnSelected]);

  // Handle sidebar close
  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedSiteSubmitId(null);
    setSearchParams({});
  };

  // Handle stage counts update from layer
  const handleStageCountsUpdate = useCallback((counts: Record<string, number>) => {
    // Filter to only portal-visible stages
    const filteredCounts: Record<string, number> = {};
    PORTAL_VISIBLE_STAGES.forEach(stage => {
      if (counts[stage] !== undefined) {
        filteredCounts[stage] = counts[stage];
      }
    });
    setStageCounts(filteredCounts);
  }, []);

  // Handle address search - address param is used when suggestion is selected (to avoid state timing issues)
  const handleSearch = async (address?: string) => {
    const addressToSearch = address || searchAddress;
    if (!addressToSearch.trim() || !mapInstance) return;

    console.log('🔍 Searching for address:', addressToSearch);
    setIsSearching(true);
    try {
      const result = await geocodingService.geocodeAddress(addressToSearch);
      console.log('📍 Geocode result:', result);
      if (result && 'latitude' in result) {
        // Clear existing search markers
        searchMarkers.forEach(m => m.setMap(null));

        // Create new marker
        const marker = new google.maps.Marker({
          position: { lat: result.latitude, lng: result.longitude },
          map: mapInstance,
          title: addressToSearch,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        setSearchMarkers([marker]);
        mapInstance.panTo({ lat: result.latitude, lng: result.longitude });
        mapInstance.setZoom(14);
        console.log('✅ Map centered on:', result.latitude, result.longitude);
      } else {
        console.warn('⚠️ No geocode result for:', addressToSearch);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle stage toggle
  const handleStageToggle = useCallback((stage: string) => {
    setVisibleStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      return newSet;
    });
  }, []);

  // Handle category toggle
  const handleCategoryToggle = useCallback((categoryStages: string[]) => {
    // Filter to only portal-visible stages in this category
    const visibleCategoryStages = categoryStages.filter(s => PORTAL_VISIBLE_STAGES.includes(s));

    setVisibleStages(prev => {
      const newSet = new Set(prev);
      const allVisible = visibleCategoryStages.every(s => newSet.has(s));

      if (allVisible) {
        visibleCategoryStages.forEach(s => newSet.delete(s));
      } else {
        visibleCategoryStages.forEach(s => newSet.add(s));
      }
      return newSet;
    });
  }, []);

  // Handle show all stages
  const handleShowAll = useCallback(() => {
    setVisibleStages(new Set(PORTAL_VISIBLE_STAGES));
  }, []);

  // Handle hide all stages
  const handleHideAll = useCallback(() => {
    setVisibleStages(new Set());
  }, []);

  // Filter stage categories to only show portal-visible stages
  const filteredStageCategories = useMemo(() => {
    const filtered: Record<string, { label: string; stages: string[] }> = {};

    Object.entries(STAGE_CATEGORIES).forEach(([key, category]) => {
      const visibleCategoryStages = category.stages.filter(s => PORTAL_VISIBLE_STAGES.includes(s));
      if (visibleCategoryStages.length > 0) {
        filtered[key] = {
          ...category,
          stages: visibleCategoryStages,
        };
      }
    });

    return filtered;
  }, []);

  return (
    <LayerManagerProvider>
      <div className="h-[calc(100vh-64px)] relative">
        {/* Map Container */}
        <GoogleMapContainer
          height="100%"
          onMapLoad={setMapInstance}
          controlsTopOffset={42}
        />

        {/* Site Submit Layer */}
        {mapInstance && (
          <SiteSubmitLayer
            map={mapInstance}
            isVisible={true}
            loadingConfig={siteSubmitConfig}
            onPinClick={handleSiteSubmitClick}
            onStageCountsUpdate={handleStageCountsUpdate}
            selectedSiteSubmitId={selectedSiteSubmitId}
            onSelectedSiteSubmitPosition={handleSelectedSiteSubmitPosition}
          />
        )}

        {/* Search Box - positioned at top of map, above other controls */}
        <div className="absolute top-2 left-2" style={{ width: '400px', zIndex: 10002 }}>
          <AddressSearchBox
            value={searchAddress}
            onChange={setSearchAddress}
            onSearch={handleSearch}
            isSearching={isSearching}
            placeholder="Search Address, City, State, or Property Name"
          />
        </div>

        {/* Stage Legend */}
        <div className="absolute bottom-4 left-4 z-10">
          <SiteSubmitLegend
            visibleStages={visibleStages}
            totalCounts={stageCounts}
            forceExpanded={isLegendExpanded}
            onToggleExpanded={(expanded) => setIsLegendExpanded(expanded)}
            onStageToggle={handleStageToggle}
            onCategoryToggle={handleCategoryToggle}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
          />
        </div>

        {/* Client Filter Indicator (for multi-client users) */}
        {accessibleClients.length > 1 && (
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-white rounded-lg shadow-md px-4 py-2 text-sm">
              <span className="text-gray-500">Viewing: </span>
              <span className="font-medium text-gray-900">
                {selectedClientId
                  ? accessibleClients.find(c => c.id === selectedClientId)?.client_name
                  : 'All Clients'}
              </span>
            </div>
          </div>
        )}

        {/* Portal Detail Sidebar */}
        <PortalDetailSidebar
          siteSubmitId={selectedSiteSubmitId}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
        />
      </div>
    </LayerManagerProvider>
  );
}
