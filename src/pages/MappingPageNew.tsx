import React, { useState, useEffect } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import BatchGeocodingPanel from '../components/mapping/BatchGeocodingPanel';
import PropertyLayer, { PropertyLoadingConfig } from '../components/mapping/layers/PropertyLayer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig } from '../components/mapping/layers/SiteSubmitLayer';
import LayerPanel from '../components/mapping/LayerPanel';
import { LayerManagerProvider, useLayerManager } from '../components/mapping/layers/LayerManager';
import { geocodingService } from '../services/geocodingService';
import SiteSubmitFormModal from '../components/SiteSubmitFormModal';
import { useNavigate, useLocation } from 'react-router-dom';

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
  const [pinDropCoordinates, setPinDropCoordinates] = useState<{lat: number, lng: number} | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

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

  // Get layer state from context
  const { layerState, setLayerCount, setLayerLoading, setLayerError, createMode, refreshLayer } = useLayerManager();

  const handleMapLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    console.log('Map loaded successfully:', map);

    // Add click listener for pin dropping
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
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
          case 'activity':
            console.log('🚧 Activity creation not implemented yet');
            break;
        }
      }
    });
  };

  // Modal handlers for pin dropping
  const openPropertyCreationModal = (lat: number, lng: number) => {
    console.log('🏢 Opening property creation with coordinates:', { lat, lng });
    // Navigate to new property page with coordinates as URL params
    const params = new URLSearchParams({
      lat: lat.toString(),
      lng: lng.toString(),
      source: 'map-pin'
    });
    navigate(`/property/new?${params.toString()}`);
  };

  const openSiteSubmitCreationModal = (lat: number, lng: number) => {
    console.log('📍 Opening site submit creation modal with coordinates:', { lat, lng });
    setPinDropCoordinates({ lat, lng });
    setShowSiteSubmitModal(true);
  };

  // Handle site submit creation success
  const handleSiteSubmitCreated = (siteSubmit: any) => {
    console.log('✅ Site submit created successfully:', siteSubmit);
    // Refresh the site submit layer to show the new item
    refreshLayer('site_submits');
  };

  // Handle modal close
  const handleSiteSubmitModalClose = () => {
    setShowSiteSubmitModal(false);
    setPinDropCoordinates(null);
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

  // Property layer configuration (simplified)
  const propertyLoadingConfig: PropertyLoadingConfig = {
    mode: 'static-all'
  };

  // Site submit layer configuration (simplified)
  const siteSubmitLoadingConfig: SiteSubmitLoadingConfig = {
    mode: 'static-100'
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
                <h2 className="text-lg font-semibold text-gray-900">Interactive Map</h2>
                <div className="text-sm text-gray-500">Modern Layer Management</div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  Use layer panel to control map data
                </div>

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
                    <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
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
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-50">
                <div className="flex items-center space-x-2">
                  <span>🎯</span>
                  <span className="font-medium">
                    {createMode === 'property' ? 'Click map to create Property' :
                     createMode === 'site_submit' ? 'Click map to create Site Submit' :
                     'Click map to create Activity'}
                  </span>
                </div>
              </div>
            )}

            {/* Property Layer - Connected to Layer Manager */}
            <PropertyLayer
              map={mapInstance}
              isVisible={layerState.properties?.isVisible || false}
              loadingConfig={propertyLoadingConfig}
              onPropertiesLoaded={(count) => {
                setLayerCount('properties', count);
                setLayerLoading('properties', false);
                console.log('🏢 Properties loaded, visibility:', layerState.properties?.isVisible);
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
            />

            {/* Modern Layer Panel */}
            <LayerPanel />

            {/* Site Submit Modal */}
            <SiteSubmitFormModal
              isOpen={showSiteSubmitModal}
              onClose={handleSiteSubmitModalClose}
              onSave={handleSiteSubmitCreated}
              // Pre-fill coordinates from pin drop
              initialLatitude={pinDropCoordinates?.lat}
              initialLongitude={pinDropCoordinates?.lng}
            />

            {/* Map Info Overlay */}
            {mapInstance && (
              <div className="absolute bottom-4 right-4 bg-white bg-opacity-90 rounded-lg shadow-sm p-3 text-xs">
                <div className="space-y-1">
                  <div>
                    <span className="text-gray-500">Center:</span>
                    <span className="font-mono text-gray-900 ml-2">
                      {mapInstance.getCenter()?.lat().toFixed(4)}, {mapInstance.getCenter()?.lng().toFixed(4)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Zoom:</span>
                    <span className="font-mono text-gray-900 ml-2">{mapInstance.getZoom()}</span>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    🗺️ Modern Layer Management Active
                  </div>
                </div>
              </div>
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