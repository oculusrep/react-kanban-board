import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import BatchGeocodingPanel from '../components/mapping/BatchGeocodingPanel';
import PropertyLayer, { PropertyLoadingConfig, PropertyLoadingMode } from '../components/mapping/layers/PropertyLayer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig, SiteSubmitLoadingMode } from '../components/mapping/layers/SiteSubmitLayer';
import { geocodingService } from '../services/geocodingService';
import { supabase } from '../lib/supabaseClient';

const MappingPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [testAddress, setTestAddress] = useState('1600 Amphitheatre Parkway, Mountain View, CA');
  const [geocodeResult, setGeocodeResult] = useState<string>('');
  const [isGeocodingTest, setIsGeocodingTest] = useState(false);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [showProperties, setShowProperties] = useState(false);
  const [propertiesCount, setPropertiesCount] = useState(0);
  const [propertyLoadingConfig, setPropertyLoadingConfig] = useState<PropertyLoadingConfig>({
    mode: 'static-all'
  });

  // Site Submit Layer State
  const [showSiteSubmits, setShowSiteSubmits] = useState(false);
  const [siteSubmitsCount, setSiteSubmitsCount] = useState(0);
  const [siteSubmitLoadingConfig, setSiteSubmitLoadingConfig] = useState<SiteSubmitLoadingConfig>({
    mode: 'static-100'
  });

  // Client Data for Filtering
  const [clients, setClients] = useState<Array<{id: string; client_name: string}>>([]);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  const handleMapLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    console.log('Map loaded successfully:', map);
  };

  // Set page title
  useEffect(() => {
    document.title = "Map | OVIS";
  }, []);

  // Handle property query parameter - center map on specific property
  useEffect(() => {
    const propertyId = searchParams.get('property');

    console.log('🗺️ Property centering effect running:', { propertyId, hasMap: !!mapInstance });

    if (!propertyId || !mapInstance) {
      if (propertyId && !mapInstance) {
        console.log('⏳ Waiting for map to load before centering on property...');
      }
      return;
    }

    const centerOnProperty = async () => {
      try {
        console.log('🗺️ Centering map on property:', propertyId);

        // Fetch property data
        const { data: property, error } = await supabase
          .from('property')
          .select('id, property_name, verified_latitude, verified_longitude, latitude, longitude')
          .eq('id', propertyId)
          .single();

        if (error) {
          console.error('❌ Error fetching property for map centering:', error);
          return;
        }

        if (!property) {
          console.warn('⚠️ Property not found:', propertyId);
          return;
        }

        // Use verified coordinates if available, otherwise use regular coordinates
        const lat = property.verified_latitude ?? property.latitude;
        const lng = property.verified_longitude ?? property.longitude;

        if (!lat || !lng) {
          console.warn('⚠️ Property has no coordinates:', property.property_name);
          return;
        }

        // Center map on property
        console.log(`📍 Centering on ${property.property_name} at ${lat}, ${lng}`);
        mapInstance.setCenter({ lat, lng });
        mapInstance.setZoom(16); // Zoom in to see the property clearly

        // Make sure Properties layer is visible
        setShowProperties(true);
        console.log('✅ Map centered and properties layer enabled');
      } catch (err) {
        console.error('❌ Exception while centering on property:', err);
      }
    };

    centerOnProperty();
  }, [searchParams, mapInstance]); // Re-run when searchParams or mapInstance changes

  // Load clients for filtering
  useEffect(() => {
    const loadClients = async () => {
      try {
        const { data, error } = await supabase
          .from('client')
          .select('id, client_name')
          .order('client_name');

        if (error) throw error;
        setClients(data || []);
      } catch (err) {
        console.error('Error loading clients:', err);
      }
    };

    loadClients();
  }, []);

  // Handle client filter change
  const handleClientFilterChange = (clientId: string | null) => {
    setSelectedClientId(clientId);
    setSiteSubmitLoadingConfig({
      mode: clientId ? 'client-filtered' : 'static-100',
      clientId: clientId
    });
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
                <div className="text-sm text-gray-500">Google API + OSM Fallback</div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-600">
                  Centers on your location or Atlanta, GA
                </div>

                {/* Layer Toggles */}
                <button
                  onClick={() => setShowProperties(!showProperties)}
                  className={`px-3 py-1 text-sm rounded border flex items-center space-x-2 transition-colors ${
                    showProperties
                      ? 'bg-green-100 hover:bg-green-200 text-green-700 border-green-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                  }`}
                >
                  <span>{showProperties ? '👁️' : '🙈'}</span>
                  <span>Properties ({propertiesCount})</span>
                </button>

                <button
                  onClick={() => setShowSiteSubmits(!showSiteSubmits)}
                  className={`px-3 py-1 text-sm rounded border flex items-center space-x-2 transition-colors ${
                    showSiteSubmits
                      ? 'bg-blue-100 hover:bg-blue-200 text-blue-700 border-blue-300'
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border-gray-300'
                  }`}
                >
                  <span>{showSiteSubmits ? '👁️' : '🙈'}</span>
                  <span>Site Submits ({siteSubmitsCount})</span>
                </button>

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

                        <div className="border-t border-gray-200 px-4 py-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Property Loading Mode:
                          </label>
                          <select
                            value={propertyLoadingConfig.mode}
                            onChange={(e) => setPropertyLoadingConfig({ mode: e.target.value as PropertyLoadingMode })}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="static-1000">📊 Static: 1,000 properties</option>
                            <option value="static-2000">📊 Static: 2,000 properties</option>
                            <option value="static-all">📊 Static: All properties</option>
                            {/* <option value="bounds-based">🗺️ Dynamic: Visible area only</option> */}
                          </select>
                          <div className="text-xs text-gray-500 mt-1">
                            🔒 Fixed dataset - {propertyLoadingConfig.mode === 'static-all' ? 'Complete' : 'Limited'} for performance
                          </div>
                        </div>

                        <div className="border-t border-gray-200 px-4 py-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Site Submit Client Filter:
                          </label>
                          <select
                            value={selectedClientId || ''}
                            onChange={(e) => handleClientFilterChange(e.target.value || null)}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                          >
                            <option value="">📊 All Clients (100 limit)</option>
                            {clients.map(client => (
                              <option key={client.id} value={client.id}>
                                🏢 {client.client_name}
                              </option>
                            ))}
                          </select>
                          <div className="text-xs text-gray-500 mt-1">
                            🔍 {selectedClientId ? 'Showing client-specific site submits' : 'Limited to 100 for performance'}
                          </div>
                        </div>

                        <div className="border-t border-gray-200 px-4 py-2">
                          <label className="block text-xs font-medium text-gray-700 mb-1">
                            Site Submit Loading Mode:
                          </label>
                          <select
                            value={siteSubmitLoadingConfig.mode}
                            onChange={(e) => setSiteSubmitLoadingConfig({
                              mode: e.target.value as SiteSubmitLoadingMode,
                              clientId: selectedClientId
                            })}
                            className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                            disabled={selectedClientId !== null} // Disable when client filter is active
                          >
                            <option value="static-100">📊 Static: 100 site submits</option>
                            <option value="static-500">📊 Static: 500 site submits</option>
                            <option value="static-all">📊 Static: All site submits</option>
                          </select>
                          <div className="text-xs text-gray-500 mt-1">
                            {selectedClientId ? '🔍 Client filter overrides mode' : '🎯 Stage-based marker colors'}
                          </div>
                        </div>
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
              className=""
            />

            {/* Property Layer */}
            <PropertyLayer
              map={mapInstance}
              isVisible={showProperties}
              loadingConfig={propertyLoadingConfig}
              onPropertiesLoaded={setPropertiesCount}
            />

            {/* Site Submit Layer */}
            <SiteSubmitLayer
              map={mapInstance}
              isVisible={showSiteSubmits}
              loadingConfig={siteSubmitLoadingConfig}
              onSiteSubmitsLoaded={setSiteSubmitsCount}
            />

            {/* Optional Map Info Overlay (can be toggled) */}
            {mapInstance && (
              <div className="absolute bottom-4 left-4 bg-white bg-opacity-90 rounded-lg shadow-sm p-3 text-xs">
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
                  {propertiesCount > 0 && (
                    <div>
                      <span className="text-gray-500">Properties:</span>
                      <span className="font-mono text-gray-900 ml-2">
                        {propertiesCount} loaded ({propertyLoadingConfig.mode}), {showProperties ? 'visible' : 'hidden'}
                      </span>
                    </div>
                  )}
                  {siteSubmitsCount > 0 && (
                    <div>
                      <span className="text-gray-500">Site Submits:</span>
                      <span className="font-mono text-gray-900 ml-2">
                        {siteSubmitsCount} loaded ({selectedClientId ? 'filtered' : siteSubmitLoadingConfig.mode}), {showSiteSubmits ? 'visible' : 'hidden'}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MappingPage;