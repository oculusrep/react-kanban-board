import React, { useState } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import BatchGeocodingPanel from '../components/mapping/BatchGeocodingPanel';
import PropertyLayer, { PropertyLoadingConfig, PropertyLoadingMode } from '../components/mapping/layers/PropertyLayer';
import { geocodingService } from '../services/geocodingService';

const MappingPage: React.FC = () => {
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

  const handleMapLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    console.log('Map loaded successfully:', map);
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

                {/* Layer Toggle */}
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