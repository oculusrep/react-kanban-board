import React, { useState } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import { geocodingService } from '../services/geocodingService';

const MappingPage: React.FC = () => {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [testAddress, setTestAddress] = useState('1600 Amphitheatre Parkway, Mountain View, CA');
  const [geocodeResult, setGeocodeResult] = useState<string>('');
  const [isGeocodingTest, setIsGeocodingTest] = useState(false);

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
      <div className="h-full flex flex-col">
        {/* Top Control Bar */}
        <div className="flex-shrink-0 bg-white shadow-sm border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-6">
              <h1 className="text-xl font-bold text-gray-900">🗺️ Mapping System</h1>
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div className={`w-2 h-2 rounded-full ${mapInstance ? 'bg-green-500' : 'bg-yellow-500'}`}></div>
                  <span className="text-sm text-gray-700">
                    {mapInstance ? 'Ready' : 'Loading...'}
                  </span>
                </div>
                <div className="text-sm text-gray-500">Phase 1.2: Enhanced Geocoding</div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Google API + OSM Fallback
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
        </div>

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MappingPage;