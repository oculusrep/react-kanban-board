import React, { useState, useEffect, useMemo } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import BatchGeocodingPanel from '../components/mapping/BatchGeocodingPanel';
import PropertyLayer, { PropertyLoadingConfig } from '../components/mapping/layers/PropertyLayer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig } from '../components/mapping/layers/SiteSubmitLayer';
import PinDetailsSlideout from '../components/mapping/slideouts/PinDetailsSlideout';
import MapContextMenu from '../components/mapping/MapContextMenu';
import PropertyContextMenu from '../components/mapping/PropertyContextMenu';
import SiteSubmitContextMenu from '../components/mapping/SiteSubmitContextMenu';
import ClientSelector from '../components/mapping/ClientSelector';
import { ClientSearchResult } from '../hooks/useClientSearch';
import AddressSearchBox from '../components/mapping/AddressSearchBox';
import { LayerManagerProvider, useLayerManager } from '../components/mapping/layers/LayerManager';
import { geocodingService } from '../services/geocodingService';
import SiteSubmitFormModal from '../components/SiteSubmitFormModal';
import InlinePropertyCreationModal from '../components/mapping/InlinePropertyCreationModal';
import SiteSubmitLegend from '../components/mapping/SiteSubmitLegend';
import { STAGE_CATEGORIES } from '../components/mapping/SiteSubmitPin';
import { useNavigate, useLocation } from 'react-router-dom';
import { supportsRightClick } from '../utils/deviceDetection';
import { supabase } from '../lib/supabaseClient';

// Inner component that uses the LayerManager context
const MappingPageContent: React.FC = () => {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [searchResult, setSearchResult] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMarkers, setSearchMarkers] = useState<google.maps.Marker[]>([]);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [verifyingPropertyId, setVerifyingPropertyId] = useState<string | null>(null);

  // Modal states
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [pinDropCoordinates, setPinDropCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Slideout states
  const [isPinDetailsOpen, setIsPinDetailsOpen] = useState(false);
  const [selectedPinData, setSelectedPinData] = useState<any>(null);
  const [selectedPinType, setSelectedPinType] = useState<'property' | 'site_submit' | null>(null);

  // Property details slideout (for "View Full Details" from site submit)
  const [isPropertyDetailsOpen, setIsPropertyDetailsOpen] = useState(false);
  const [selectedPropertyData, setSelectedPropertyData] = useState<any>(null);

  // Center on location function
  const [centerOnLocation, setCenterOnLocation] = useState<(() => void) | null>(null);

  // Client selector state
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);

  // Site submit legend state
  const [visibleStages, setVisibleStages] = useState<Set<string>>(() => {
    // Initialize with all stages visible
    const allStages = Object.values(STAGE_CATEGORIES).flatMap(category => category.stages);
    return new Set(allStages);
  });
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  // Clustering configuration
  const [clusterConfig, setClusterConfig] = useState({
    minimumClusterSize: 5,
    gridSize: 60,
    maxZoom: 15
  });
  // Initialize recently created IDs from sessionStorage
  const [recentlyCreatedPropertyIds, setRecentlyCreatedPropertyIds] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('recentlyCreatedPropertyIds');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    coordinates: { lat: number; lng: number } | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    coordinates: null,
  });

  // Property context menu state
  const [propertyContextMenu, setPropertyContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    property: any | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    property: null,
  });

  // Site submit context menu state
  const [siteSubmitContextMenu, setSiteSubmitContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    siteSubmit: any | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    siteSubmit: null,
  });

  // Site submit verification state
  const [verifyingSiteSubmitId, setVerifyingSiteSubmitId] = useState<string | null>(null);

  // Flag to prevent property context menu when site submit was just clicked
  const [suppressPropertyContextMenu, setSuppressPropertyContextMenu] = useState<boolean>(false);

  const navigate = useNavigate();
  const location = useLocation();

  // Persist recently created IDs to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('recentlyCreatedPropertyIds', JSON.stringify([...recentlyCreatedPropertyIds]));
    } catch (error) {
      console.warn('Failed to persist session pins to sessionStorage:', error);
    }
  }, [recentlyCreatedPropertyIds]);

  // Get layer state from context
  const { layerState, setLayerCount, setLayerLoading, setLayerError, createMode, refreshLayer, toggleLayer } = useLayerManager();

  // Check for property creation success and refresh layer
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('propertyCreated') === 'true') {
      console.log('🏢 Property creation detected, refreshing property layer');
      refreshLayer('properties');
      // Clean up the URL parameter
      const newParams = new URLSearchParams(location.search);
      newParams.delete('propertyCreated');
      const newUrl = `${location.pathname}${newParams.toString() ? '?' + newParams.toString() : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [location.search, refreshLayer]);

  const handleMapLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    console.log('Map loaded successfully:', map);

    // Add click listener for pin dropping
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      // Close context menus on any click
      setContextMenu(prev => ({ ...prev, isVisible: false }));
      setPropertyContextMenu(prev => ({ ...prev, isVisible: false }));
      setSiteSubmitContextMenu(prev => ({ ...prev, isVisible: false }));

      if (createMode && event.latLng) {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        console.log(`📍 Pin dropped for ${createMode}:`, { lat, lng });

        // Handle different create modes
        switch (createMode) {
          case 'property':
            openPropertyCreationModal(lat, lng);
            break;
          case 'site_submit':
            openSiteSubmitCreationModal(lat, lng);
            break;
        }
      }
    });

    // Add right-click listener for desktop context menu
    if (supportsRightClick()) {
      const mapDiv = map.getDiv();

      mapDiv.addEventListener('contextmenu', (e: MouseEvent) => {
        e.preventDefault(); // Prevent browser context menu

        // Get coordinates from the click position
        const bounds = mapDiv.getBoundingClientRect();
        const x = e.clientX - bounds.left;
        const y = e.clientY - bounds.top;

        // Convert pixel position to lat/lng
        const projection = map.getProjection();
        if (projection) {
          const ne = map.getBounds()?.getNorthEast();
          const sw = map.getBounds()?.getSouthWest();

          if (ne && sw) {
            const lat = sw.lat() + (ne.lat() - sw.lat()) * (1 - y / bounds.height);
            const lng = sw.lng() + (ne.lng() - sw.lng()) * (x / bounds.width);

            setContextMenu({
              isVisible: true,
              x: e.clientX,
              y: e.clientY,
              coordinates: { lat, lng },
            });
          }
        }
      });
    }
  };

  // Modal handlers for pin dropping
  const openPropertyCreationModal = (lat: number, lng: number) => {
    console.log('🏢 Opening property creation with coordinates:', { lat, lng });
    setPinDropCoordinates({ lat, lng });
    setShowPropertyModal(true);
  };

  const openSiteSubmitCreationModal = (lat: number, lng: number) => {
    console.log('📍 Opening site submit creation modal with coordinates:', { lat, lng });
    setPinDropCoordinates({ lat, lng });
    setShowSiteSubmitModal(true);
  };

  // Handle property creation success
  const handlePropertyCreated = (property: any) => {
    console.log('✅ Property created successfully:', property);

    // Clear any search markers since we're creating a property at this location
    searchMarkers.forEach(marker => marker.setMap(null));
    setSearchMarkers([]);

    // Add to recently created set (persists until browser tab closed or manually cleared)
    setRecentlyCreatedPropertyIds(prev => new Set([...prev, property.id]));

    // Refresh the property layer to show the new item
    refreshLayer('properties');

    console.log('🧹 Cleared search markers, property session pin should be visible');
  };

  // Handle site submit creation success
  const handleSiteSubmitCreated = (siteSubmit: any) => {
    console.log('✅ Site submit created successfully:', siteSubmit);
    // Refresh the site submit layer to show the new item
    refreshLayer('site_submits');
  };

  // Handle site submit location verified (save to database)
  const handleSiteSubmitLocationVerified = async (siteSubmitId: string, lat: number, lng: number) => {
    console.log('📍 Saving verified location for site submit:', siteSubmitId, { lat, lng });

    try {
      // Update verified coordinates in database
      const { error } = await supabase
        .from('site_submit')
        .update({
          verified_latitude: lat,
          verified_longitude: lng
        })
        .eq('id', siteSubmitId);

      if (error) {
        throw error;
      }

      console.log('✅ Site submit verified location saved successfully');

      // Clear verification state
      setVerifyingSiteSubmitId(null);
      // Refresh site submit layer to show updated coordinates
      refreshLayer('site_submits');
      console.log('✅ Site submit location verification completed');
    } catch (error) {
      console.error('❌ Failed to save site submit verified location:', error);
      // Keep verification mode active on error so user can try again
    }
  };

  // Handle modal close
  const handlePropertyModalClose = () => {
    setShowPropertyModal(false);
    setPinDropCoordinates(null);
  };

  // Function to manually clear session pins if needed
  const clearSessionPins = () => {
    console.log('🧹 Clearing session pins...', recentlyCreatedPropertyIds);
    setRecentlyCreatedPropertyIds(new Set());
    try {
      sessionStorage.removeItem('recentlyCreatedPropertyIds');
      console.log('✅ Cleared from sessionStorage');
    } catch (error) {
      console.warn('Failed to clear session pins from sessionStorage:', error);
    }
    console.log('🧹 Session pins cleared manually');
  };

  const handleSiteSubmitModalClose = () => {
    setShowSiteSubmitModal(false);
    setPinDropCoordinates(null);
    setSelectedPropertyId(null);
  };

  // Center map on property pin with appropriate zoom to avoid clusters
  const handleCenterOnPin = (lat: number, lng: number) => {
    if (mapInstance) {
      console.log('🎯 Centering map on coordinates:', { lat, lng });

      // Set zoom level to 15 which shows more context while still avoiding clusters
      const targetZoom = 15;

      mapInstance.setCenter({ lat, lng });
      mapInstance.setZoom(targetZoom);

      console.log('✅ Map centered and zoomed to level', targetZoom);
    } else {
      console.warn('⚠️ Cannot center map: mapInstance not available');
    }
  };

  // Handle property selection from search
  const handlePropertySearch = (property: any) => {
    console.log('🏢 Property selected from search:', property);
    console.log('🏢 Property details:', {
      id: property.id,
      name: property.property_name,
      coordinates: { lat: property.latitude, lng: property.longitude },
      verified: { lat: property.verified_latitude, lng: property.verified_longitude }
    });

    // Center map on the property
    const coords = property.verified_latitude && property.verified_longitude
      ? { lat: property.verified_latitude, lng: property.verified_longitude }
      : { lat: property.latitude, lng: property.longitude };

    console.log('🎯 Centering on coordinates:', coords);
    handleCenterOnPin(coords.lat, coords.lng);

    // Open the property in the sidebar
    console.log('📋 Opening property sidebar...');
    handlePinClick(property, 'property');

    console.log('✅ Property search handling complete');
  };

  // Context menu handlers
  const handleContextMenuCreateProperty = () => {
    if (contextMenu.coordinates) {
      openPropertyCreationModal(contextMenu.coordinates.lat, contextMenu.coordinates.lng);
    }
  };

  const handleContextMenuClose = () => {
    setContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Property context menu handlers
  const handlePropertyRightClick = (property: any, x: number, y: number) => {
    console.log('🎯 Property right-clicked:', property.id, { x, y });

    // Don't show property context menu if site submit context menu was just triggered
    if (suppressPropertyContextMenu) {
      console.log('🚫 Suppressing property context menu - site submit was clicked');
      return;
    }

    setPropertyContextMenu({
      isVisible: true,
      x,
      y,
      property,
    });
  };

  const handlePropertyContextMenuClose = () => {
    setPropertyContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Site submit context menu handlers
  const handleSiteSubmitRightClick = (siteSubmit: any, x: number, y: number) => {
    console.log('🎯 Site submit right-clicked:', siteSubmit.id, { x, y });

    // Close any existing context menus
    setContextMenu(prev => ({ ...prev, isVisible: false }));
    setPropertyContextMenu(prev => ({ ...prev, isVisible: false }));

    // Set flag to suppress property context menu
    setSuppressPropertyContextMenu(true);

    // Clear the suppression flag after a longer delay
    setTimeout(() => {
      setSuppressPropertyContextMenu(false);
    }, 200);

    setSiteSubmitContextMenu({
      isVisible: true,
      x,
      y,
      siteSubmit,
    });
  };

  const handleSiteSubmitContextMenuClose = () => {
    setSiteSubmitContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Pin click handlers for slideout
  const handlePinClick = (data: any, type: 'property' | 'site_submit') => {
    // Always update the selected data when clicking on a pin
    setSelectedPinData(data);
    setSelectedPinType(type);
    setIsPinDetailsOpen(true);
  };

  const handlePinDetailsClose = () => {
    setIsPinDetailsOpen(false);
    setSelectedPinData(null);
    setSelectedPinType(null);
    // Cancel any ongoing verification
    setVerifyingPropertyId(null);
    // Also close property details slideout if it's open
    if (isPropertyDetailsOpen) {
      setIsPropertyDetailsOpen(false);
      setSelectedPropertyData(null);
    }
  };

  // Handle viewing property details from site submit
  const handleViewPropertyDetails = async (property: any) => {
    console.log('🏢 Opening property details slideout:', property);

    // Fetch fresh property data from database to ensure we have latest values
    try {
      const { data: freshPropertyData, error } = await supabase
        .from('property')
        .select('*')
        .eq('id', property.id)
        .single();

      if (error) {
        console.error('❌ Error fetching fresh property data:', error);
        // Fall back to cached data if fetch fails
        setSelectedPropertyData(property);
      } else {
        console.log('✅ Fetched fresh property data:', freshPropertyData);
        setSelectedPropertyData(freshPropertyData);
      }
    } catch (err) {
      console.error('❌ Exception fetching fresh property data:', err);
      // Fall back to cached data if fetch fails
      setSelectedPropertyData(property);
    }

    setIsPropertyDetailsOpen(true);
  };

  // Handle data updates from slideout
  const handlePinDataUpdate = (updatedData: any) => {
    console.log('📝 Pin data updated:', updatedData);
    setSelectedPinData(updatedData);
  };

  const handlePropertyDataUpdate = (updatedData: any) => {
    console.log('📝 Property data updated:', updatedData);
    setSelectedPropertyData(updatedData);
  };

  const handlePropertyDetailsClose = () => {
    setIsPropertyDetailsOpen(false);
    setSelectedPropertyData(null);
  };

  // Handle location verification
  const handleVerifyLocation = (propertyId: string) => {
    console.log('🎯 Starting location verification for property:', propertyId);
    setVerifyingPropertyId(propertyId);
  };

  // Handle site submit location verification
  const handleSiteSubmitVerifyLocation = (siteSubmitId: string) => {
    console.log('🎯 Starting location verification for site submit:', siteSubmitId);
    setVerifyingSiteSubmitId(siteSubmitId);
  };

  // Handle site submit location reset (clear verified coordinates)
  const handleSiteSubmitResetLocation = async (siteSubmitId: string) => {
    console.log('🔄 Resetting site submit location to property location:', siteSubmitId);

    try {
      // Clear verified coordinates in database
      const { error } = await supabase
        .from('site_submit')
        .update({
          verified_latitude: null,
          verified_longitude: null
        })
        .eq('id', siteSubmitId);

      if (error) {
        throw error;
      }

      console.log('✅ Site submit location reset successfully');

      // Refresh site submit layer to show property coordinates
      refreshLayer('site_submits');
    } catch (error) {
      console.error('❌ Failed to reset site submit location:', error);
      alert('Failed to reset location. Please try again.');
    }
  };

  // Handle location verified (save to database)
  const handleLocationVerified = async (propertyId: string, lat: number, lng: number) => {
    console.log('📍 Saving verified location for property:', propertyId, { lat, lng });

    try {
      // Perform reverse geocoding to get address at new location
      console.log('🌍 Getting address for new location...');
      const reverseGeocodeResult = await geocodingService.reverseGeocode(lat, lng);

      let updateData: any = {
        verified_latitude: lat,
        verified_longitude: lng
      };

      // If reverse geocoding succeeded, update address fields too
      if ('latitude' in reverseGeocodeResult) {
        console.log('✅ Reverse geocoding successful:', reverseGeocodeResult.formatted_address);

        // Update address fields with the new location's address
        updateData = {
          ...updateData,
          address: reverseGeocodeResult.street_address || reverseGeocodeResult.formatted_address,
          city: reverseGeocodeResult.city,
          state: reverseGeocodeResult.state,
          zip: reverseGeocodeResult.zip,
        };

        console.log('📮 Updated address data:', updateData);
      } else {
        console.warn('⚠️ Reverse geocoding failed, only updating coordinates:', reverseGeocodeResult.error);
      }

      // Update the property with verified coordinates and potentially new address
      const { error } = await supabase
        .from('property')
        .update(updateData)
        .eq('id', propertyId);

      if (error) {
        throw error;
      }

      console.log('✅ Successfully saved verified location to database');

      // Complete verification
      setVerifyingPropertyId(null);

      // Refresh property layer to show updated coordinates
      refreshLayer('properties');

      console.log('✅ Location verification completed');
    } catch (error) {
      console.error('❌ Failed to save verified location:', error);
      // Keep verification mode active on error so user can try again
    }
  };

  const handleAddressSearch = async () => {
    if (!searchAddress.trim()) return;

    setIsSearching(true);
    setSearchResult('Searching...');

    try {
      console.log('🔍 Searching for address:', searchAddress);
      const result = await geocodingService.geocodeAddress(searchAddress);

      if ('latitude' in result) {
        setSearchResult(`Found: ${result.formatted_address}`);

        // Add a search pin at the geocoded location
        if (mapInstance) {
          console.log('📍 Adding search pin for address...');

          // Clear any existing search markers
          searchMarkers.forEach(marker => marker.setMap(null));

          // Center the map on the geocoded location
          const position = { lat: result.latitude, lng: result.longitude };
          mapInstance.setCenter(position);
          mapInstance.setZoom(16); // Zoom in for street-level view

          // Create a marker to show the location
          const marker = new google.maps.Marker({
            position: position,
            map: mapInstance,
            title: result.formatted_address,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#3B82F6',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            }
          });

          // Add info window with address details
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="font-size: 12px; max-width: 250px;">
                <strong>Search Result</strong><br>
                📍 ${result.formatted_address}<br>
                🏙️ ${result.city || 'N/A'}, ${result.state || 'N/A'} ${result.zip || ''}<br>
                📊 ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}
              </div>
            `
          });

          marker.addListener('click', () => {
            infoWindow.open(mapInstance, marker);
          });

          // Auto-open the info window
          infoWindow.open(mapInstance, marker);

          // Track the search marker
          setSearchMarkers([marker]);

          console.log('✅ Search pin added');
        }
      } else {
        setSearchResult(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setSearchResult(`❌ Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Property layer configuration (memoized to prevent infinite re-renders)
  const propertyLoadingConfig: PropertyLoadingConfig = useMemo(() => ({
    mode: 'static-all'
  }), []);

  // Site submit layer configuration (memoized to prevent infinite re-renders)
  const siteSubmitLoadingConfig: SiteSubmitLoadingConfig = useMemo(() => ({
    mode: selectedClient ? 'client-filtered' : 'static-100',
    clientId: selectedClient?.id || null,
    visibleStages: visibleStages,
    clusterConfig: clusterConfig
  }), [selectedClient, visibleStages, clusterConfig]);

  // Stage toggle handlers
  const handleStageToggle = (stageName: string) => {
    console.log(`🎯 Toggling stage: ${stageName}`);
    setVisibleStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stageName)) {
        console.log(`➖ Hiding stage: ${stageName}`);
        newSet.delete(stageName);
      } else {
        console.log(`➕ Showing stage: ${stageName}`);
        newSet.add(stageName);
      }
      console.log(`👁️ New visible stages:`, Array.from(newSet));
      return newSet;
    });
  };

  const handleCategoryToggle = (categoryKey: string) => {
    const category = STAGE_CATEGORIES[categoryKey as keyof typeof STAGE_CATEGORIES];
    if (!category) return;

    const categoryStages = category.stages;
    const allVisible = categoryStages.every(stage => visibleStages.has(stage));

    setVisibleStages(prev => {
      const newSet = new Set(prev);
      if (allVisible) {
        // Hide all stages in category
        categoryStages.forEach(stage => newSet.delete(stage));
      } else {
        // Show all stages in category
        categoryStages.forEach(stage => newSet.add(stage));
      }
      return newSet;
    });
  };

  const handleShowAll = () => {
    console.log('🎯 Show All clicked');
    const allStages = Object.values(STAGE_CATEGORIES).flatMap(category => category.stages);
    setVisibleStages(new Set(allStages));
    console.log('👁️ All stages now visible:', allStages);
  };

  const handleHideAll = () => {
    console.log('🎯 Hide All clicked');
    setVisibleStages(new Set());
    console.log('👁️ All stages now hidden');
  };

  const handleStageCountsUpdate = (counts: Record<string, number>) => {
    setStageCounts(counts);
  };

  // Custom client selection handler that auto-enables site submits and expands legend
  const handleClientSelection = (client: ClientSearchResult | null) => {
    setSelectedClient(client);

    if (client) {
      // Auto-enable site submits layer if not already visible
      if (!layerState.site_submits?.isVisible) {
        console.log('🎯 Client selected, auto-enabling site submits layer');
        toggleLayer('site_submits');
      }

      // Auto-expand legend to show filtered results
      setIsLegendExpanded(true);
      console.log('📊 Client selected, expanding legend to show results');
    } else {
      // When client is cleared, turn off site submits layer and collapse legend
      if (layerState.site_submits?.isVisible) {
        console.log('🎯 Client cleared, auto-disabling site submits layer');
        toggleLayer('site_submits');
      }
      setIsLegendExpanded(false);
      console.log('📊 Client cleared, collapsing legend');
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-50 overflow-hidden">
      <div className="h-full flex">
        {/* Left Panel - Batch Processing (Conditional) */}
        {showBatchPanel && (
          <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-lg">
            {/* Panel Header */}
            <div className="flex-shrink-0 px-3 py-2 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h1 className="text-sm font-semibold text-gray-900">🗺️ Admin: Batch Geocoding</h1>
                <button
                  onClick={() => setShowBatchPanel(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Close panel"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Batch Processing Panel */}
            <div className="flex-1 overflow-y-auto">
              <BatchGeocodingPanel className="compact" />
            </div>
          </div>
        )}

        {/* Main Panel - Map and Testing */}
        <div className="flex-1 flex flex-col">
          {/* Top Control Bar */}
          <div className="flex-shrink-0 bg-white shadow-sm border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Address Search with Auto-Suggest */}
                <div className="flex items-center space-x-2">
                  <AddressSearchBox
                    value={searchAddress}
                    onChange={setSearchAddress}
                    onSearch={handleAddressSearch}
                    onPropertySelect={handlePropertySearch}
                    disabled={isSearching}
                    placeholder="Search Address, City, State, or Property Name..."
                  />
                  <button
                    onClick={handleAddressSearch}
                    disabled={isSearching || !searchAddress.trim()}
                    className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSearching ? '🔄 Searching...' : '🔍 Search'}
                  </button>
                  <button
                    onClick={() => centerOnLocation?.()}
                    disabled={!centerOnLocation}
                    className="px-3 py-1 bg-white text-gray-700 text-sm rounded hover:bg-gray-50 border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1"
                    title="Center map on your location"
                  >
                    <span>📍</span>
                    <span>My Location</span>
                  </button>
                </div>
                {searchResult && (
                  <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded max-w-md truncate">
                    {searchResult}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {/* Properties Layer Toggle */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">All Properties:</label>
                  <button
                    onClick={() => toggleLayer('properties')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      layerState.properties?.isVisible ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        layerState.properties?.isVisible ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Client Selector */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Client:</label>
                  <div className="w-64">
                    <ClientSelector
                      selectedClient={selectedClient}
                      onClientSelect={handleClientSelection}
                      placeholder="Search active clients..."
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Clear Session Pins Button (when available) */}
                {recentlyCreatedPropertyIds.size > 0 && (
                  <button
                    onClick={clearSessionPins}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm rounded border border-red-300 flex items-center space-x-1"
                    title="Clear your red session pins"
                  >
                    <span>🧹</span>
                    <span>Clear Session Pins ({recentlyCreatedPropertyIds.size})</span>
                  </button>
                )}

                {/* Admin Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowAdminMenu(!showAdminMenu)}
                    className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded border flex items-center space-x-1"
                  >
                    <span>⚙️ Admin</span>
                    <span className={`text-xs transition-transform ${showAdminMenu ? 'rotate-180' : ''}`}>▼</span>
                  </button>

                  {showAdminMenu && (
                    <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-20">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setShowBatchPanel(true);
                            setShowAdminMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <span>🏢</span>
                          <span>Batch Geocoding</span>
                        </button>

                        {recentlyCreatedPropertyIds.size > 0 && (
                          <button
                            onClick={() => {
                              clearSessionPins();
                              setShowAdminMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center space-x-2"
                          >
                            <span>🧹</span>
                            <span>Clear Session Pins ({recentlyCreatedPropertyIds.size})</span>
                          </button>
                        )}

                        {/* Clustering Configuration */}
                        <div className="border-t border-gray-200 mt-1 pt-1">
                          <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Site Submit Clustering
                          </div>

                          <div className="px-4 py-2 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Min pins to cluster:</label>
                              <select
                                value={clusterConfig.minimumClusterSize}
                                onChange={(e) => setClusterConfig(prev => ({
                                  ...prev,
                                  minimumClusterSize: parseInt(e.target.value)
                                }))}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value={2}>2 pins</option>
                                <option value={3}>3 pins</option>
                                <option value={5}>5 pins</option>
                                <option value={8}>8 pins</option>
                                <option value={10}>10 pins</option>
                                <option value={999}>No clustering</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Cluster grid size:</label>
                              <select
                                value={clusterConfig.gridSize}
                                onChange={(e) => setClusterConfig(prev => ({
                                  ...prev,
                                  gridSize: parseInt(e.target.value)
                                }))}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value={40}>Tight (40px)</option>
                                <option value={60}>Normal (60px)</option>
                                <option value={80}>Loose (80px)</option>
                                <option value={100}>Very loose (100px)</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>


          {/* Full Screen Map */}
          <div className="flex-1 relative">
            <GoogleMapContainer
              height="100%"
              width="100%"
              onMapLoad={handleMapLoad}
              onCenterOnLocationReady={(fn) => setCenterOnLocation(() => fn)}
              className={createMode ? 'cursor-crosshair' : ''}
            />

            {/* Create Mode Overlay */}
            {createMode && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-20">
                <div className="flex items-center space-x-2">
                  <span>🎯</span>
                  <span className="font-medium">
                    {createMode === 'property' ? 'Click map to create Property' :
                     createMode === 'site_submit' ? 'Click map to create Site Submit' :
                     'Click map to create item'}
                  </span>
                </div>
              </div>
            )}

            {/* Property Layer - Connected to Layer Manager */}
            <PropertyLayer
              map={mapInstance}
              isVisible={(() => {
                const isVisible = layerState.properties?.isVisible || false;
                console.log('🏢 PropertyLayer isVisible prop:', isVisible, 'layerState.properties:', layerState.properties);
                return isVisible;
              })()}
              loadingConfig={propertyLoadingConfig}
              recentlyCreatedIds={recentlyCreatedPropertyIds}
              verifyingPropertyId={verifyingPropertyId}
              selectedPropertyId={(() => {
                const id = selectedPinType === 'property' && selectedPinData ? selectedPinData.id : null;
                console.log('🎯 PropertyLayer selectedPropertyId calculated:', {
                  selectedPinType,
                  selectedPinDataId: selectedPinData?.id,
                  resultingId: id
                });
                return id;
              })()}
              onLocationVerified={handleLocationVerified}
              onPropertyRightClick={handlePropertyRightClick}
              onPropertiesLoaded={(count) => {
                setLayerCount('properties', count);
                setLayerLoading('properties', false);
                console.log('🏢 Properties loaded, visibility:', layerState.properties?.isVisible);
              }}
              onPinClick={(property) => handlePinClick(property, 'property')}
              onCreateSiteSubmit={(property) => {
                // Set property coordinates and ID, then open site submit modal
                const coords = property.verified_latitude && property.verified_longitude
                  ? { lat: property.verified_latitude, lng: property.verified_longitude }
                  : { lat: property.latitude, lng: property.longitude };
                setPinDropCoordinates(coords);
                setSelectedPropertyId(property.id);
                setShowSiteSubmitModal(true);
              }}
            />

            {/* Site Submit Layer - Connected to Layer Manager */}
            <SiteSubmitLayer
              map={mapInstance}
              isVisible={layerState.site_submits?.isVisible || false}
              loadingConfig={siteSubmitLoadingConfig}
              onSiteSubmitsLoaded={(count) => {
                setLayerCount('site_submits', count);
                setLayerLoading('site_submits', false);
              }}
              onPinClick={(siteSubmit) => handlePinClick(siteSubmit, 'site_submit')}
              onStageCountsUpdate={handleStageCountsUpdate}
              onSiteSubmitRightClick={handleSiteSubmitRightClick}
              verifyingSiteSubmitId={verifyingSiteSubmitId}
              onLocationVerified={handleSiteSubmitLocationVerified}
            />

            {/* Pin Details Slideout */}
            <PinDetailsSlideout
              isOpen={isPinDetailsOpen}
              onClose={handlePinDetailsClose}
              onOpen={() => setIsPinDetailsOpen(true)}
              data={selectedPinData}
              type={selectedPinType}
              onVerifyLocation={handleVerifyLocation}
              isVerifyingLocation={!!verifyingPropertyId}
              onViewPropertyDetails={handleViewPropertyDetails}
              onCenterOnPin={handleCenterOnPin}
              onDataUpdate={handlePinDataUpdate}
              rightOffset={isPropertyDetailsOpen ? 500 : 0} // Shift left when property details is open
            />

            {/* Property Details Slideout (for "View Full Details" from site submit) */}
            <PinDetailsSlideout
              isOpen={isPropertyDetailsOpen}
              onClose={handlePropertyDetailsClose}
              onOpen={() => setIsPropertyDetailsOpen(true)}
              data={selectedPropertyData}
              type="property"
              onVerifyLocation={handleVerifyLocation}
              isVerifyingLocation={!!verifyingPropertyId}
              onCenterOnPin={handleCenterOnPin}
              onDataUpdate={handlePropertyDataUpdate}
              rightOffset={0} // Always positioned at the far right
            />

            {/* Property Creation Modal */}
            {pinDropCoordinates && (
              <InlinePropertyCreationModal
                isOpen={showPropertyModal}
                onClose={handlePropertyModalClose}
                onSave={handlePropertyCreated}
                coordinates={pinDropCoordinates}
              />
            )}

            {/* Site Submit Modal */}
            <SiteSubmitFormModal
              isOpen={showSiteSubmitModal}
              onClose={handleSiteSubmitModalClose}
              onSave={handleSiteSubmitCreated}
              // Pre-fill coordinates and property from property selection
              propertyId={selectedPropertyId || undefined}
              initialLatitude={pinDropCoordinates?.lat}
              initialLongitude={pinDropCoordinates?.lng}
            />

            {/* Context Menu for Desktop Right-Click */}
            <MapContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isVisible={contextMenu.isVisible}
              coordinates={contextMenu.coordinates}
              onCreateProperty={handleContextMenuCreateProperty}
              onClose={handleContextMenuClose}
            />

            {/* Property Context Menu for Right-Click on Properties */}
            <PropertyContextMenu
              x={propertyContextMenu.x}
              y={propertyContextMenu.y}
              isVisible={propertyContextMenu.isVisible}
              property={propertyContextMenu.property}
              onVerifyLocation={handleVerifyLocation}
              onClose={handlePropertyContextMenuClose}
            />

            {/* Site Submit Context Menu for Right-Click on Site Submits */}
            <SiteSubmitContextMenu
              x={siteSubmitContextMenu.x}
              y={siteSubmitContextMenu.y}
              isVisible={siteSubmitContextMenu.isVisible}
              siteSubmit={siteSubmitContextMenu.siteSubmit}
              onVerifyLocation={handleSiteSubmitVerifyLocation}
              onResetLocation={handleSiteSubmitResetLocation}
              onClose={handleSiteSubmitContextMenuClose}
            />

            {/* Site Submit Legend - Show when site submit layer is visible */}
            {layerState.site_submits?.isVisible && (
              <SiteSubmitLegend
                visibleStages={visibleStages}
                onStageToggle={handleStageToggle}
                onCategoryToggle={handleCategoryToggle}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                totalCounts={stageCounts}
                forceExpanded={isLegendExpanded}
                onToggleExpanded={setIsLegendExpanded}
              />
            )}

          </div>
        </div>
      </div>
    </div>
  );
};

// Main component with LayerManager provider
const MappingPageNew: React.FC = () => {
  return (
    <LayerManagerProvider>
      <MappingPageContent />
    </LayerManagerProvider>
  );
};

export default MappingPageNew;