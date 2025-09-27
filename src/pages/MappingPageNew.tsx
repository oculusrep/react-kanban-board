import React, { useState, useEffect, useMemo } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import BatchGeocodingPanel from '../components/mapping/BatchGeocodingPanel';
import PropertyLayer, { PropertyLoadingConfig } from '../components/mapping/layers/PropertyLayer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig } from '../components/mapping/layers/SiteSubmitLayer';
import LayerNavigationSlideout from '../components/mapping/slideouts/LayerNavigationSlideout';
import PinDetailsSlideout from '../components/mapping/slideouts/PinDetailsSlideout';
import MapContextMenu from '../components/mapping/MapContextMenu';
import { LayerManagerProvider, useLayerManager } from '../components/mapping/layers/LayerManager';
import { geocodingService } from '../services/geocodingService';
import SiteSubmitFormModal from '../components/SiteSubmitFormModal';
import InlinePropertyCreationModal from '../components/mapping/InlinePropertyCreationModal';
import { useNavigate, useLocation } from 'react-router-dom';
import { supportsRightClick } from '../utils/deviceDetection';

// Inner component that uses the LayerManager context
const MappingPageContent: React.FC = () => {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [testAddress, setTestAddress] = useState('1600 Amphitheatre Parkway, Mountain View, CA');
  const [geocodeResult, setGeocodeResult] = useState<string>('');
  const [isGeocodingTest, setIsGeocodingTest] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);

  // Modal states
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [pinDropCoordinates, setPinDropCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Slideout states
  const [isLayerNavOpen, setIsLayerNavOpen] = useState(false);
  const [isPinDetailsOpen, setIsPinDetailsOpen] = useState(false);
  const [selectedPinData, setSelectedPinData] = useState<any>(null);
  const [selectedPinType, setSelectedPinType] = useState<'property' | 'site_submit' | null>(null);
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
  const { layerState, setLayerCount, setLayerLoading, setLayerError, createMode, refreshLayer } = useLayerManager();

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
      // Close context menu on any click
      setContextMenu(prev => ({ ...prev, isVisible: false }));

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

    // Add to recently created set (persists until browser tab closed or manually cleared)
    setRecentlyCreatedPropertyIds(prev => new Set([...prev, property.id]));

    // Refresh the property layer to show the new item
    refreshLayer('properties');
  };

  // Handle site submit creation success
  const handleSiteSubmitCreated = (siteSubmit: any) => {
    console.log('✅ Site submit created successfully:', siteSubmit);
    // Refresh the site submit layer to show the new item
    refreshLayer('site_submits');
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

  // Context menu handlers
  const handleContextMenuCreateProperty = () => {
    if (contextMenu.coordinates) {
      openPropertyCreationModal(contextMenu.coordinates.lat, contextMenu.coordinates.lng);
    }
  };

  const handleContextMenuClose = () => {
    setContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Pin click handlers for slideout
  const handlePinClick = (data: any, type: 'property' | 'site_submit') => {
    setSelectedPinData(data);
    setSelectedPinType(type);
    setIsPinDetailsOpen(true);
  };

  const handlePinDetailsClose = () => {
    setIsPinDetailsOpen(false);
    setSelectedPinData(null);
    setSelectedPinType(null);
  };

  const testGeocoding = async () => {
    if (!testAddress.trim()) return;

    setIsGeocodingTest(true);
    setGeocodeResult('Testing geocoding...');

    try {
      console.log('🧪 Testing enhanced geocoding service...');
      const result = await geocodingService.geocodeAddress(testAddress);

      if ('latitude' in result) {
        setGeocodeResult(`✅ Success (${result.provider}):
        📍 ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}
        📧 ${result.formatted_address}
        🏙️ City: ${result.city || 'N/A'}
        🗺️ State: ${result.state || 'N/A'}
        📮 ZIP: ${result.zip || 'N/A'}`);
      } else {
        setGeocodeResult(`❌ Error: ${result.error} (${result.code})`);
      }
    } catch (error) {
      setGeocodeResult(`❌ Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsGeocodingTest(false);
    }
  };

  // Property layer configuration (memoized to prevent infinite re-renders)
  const propertyLoadingConfig: PropertyLoadingConfig = useMemo(() => ({
    mode: 'static-all'
  }), []);

  // Site submit layer configuration (memoized to prevent infinite re-renders)
  const siteSubmitLoadingConfig: SiteSubmitLoadingConfig = useMemo(() => ({
    mode: 'static-100'
  }), []);

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
                <h2 className="text-lg font-semibold text-gray-900">Interactive Map</h2>
                <div className="text-sm text-gray-500">Modern Layer Management</div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  Use layer panel to control map data
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
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Geocoding Test Panel */}
          <div className="flex-shrink-0 bg-blue-50 border-b border-blue-200 px-4 py-2">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <label className="text-sm font-medium text-blue-900">🧪 Test Geocoding:</label>
                <input
                  type="text"
                  value={testAddress}
                  onChange={(e) => setTestAddress(e.target.value)}
                  placeholder="Enter address to geocode..."
                  className="px-3 py-1 border border-blue-300 rounded text-sm w-80"
                  disabled={isGeocodingTest}
                />
                <button
                  onClick={testGeocoding}
                  disabled={isGeocodingTest || !testAddress.trim()}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeocodingTest ? 'Testing...' : 'Test'}
                </button>
              </div>
              {geocodeResult && (
                <div className="flex-1 text-xs font-mono bg-white rounded px-2 py-1 border max-w-md overflow-hidden">
                  <pre className="whitespace-pre-wrap">{geocodeResult}</pre>
                </div>
              )}
            </div>
          </div>

          {/* Full Screen Map */}
          <div className="flex-1 relative">
            <GoogleMapContainer
              height="100%"
              width="100%"
              onMapLoad={handleMapLoad}
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
              isVisible={layerState.properties?.isVisible || false}
              loadingConfig={propertyLoadingConfig}
              recentlyCreatedIds={recentlyCreatedPropertyIds}
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
            />

            {/* Modern Slideout Navigation */}
            <LayerNavigationSlideout
              isOpen={isLayerNavOpen}
              onToggle={() => setIsLayerNavOpen(!isLayerNavOpen)}
            />

            {/* Pin Details Slideout */}
            <PinDetailsSlideout
              isOpen={isPinDetailsOpen}
              onClose={handlePinDetailsClose}
              data={selectedPinData}
              type={selectedPinType}
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