import React, { useState } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';

const MappingPage: React.FC = () => {
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);

  const handleMapLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    console.log('Map loaded successfully:', map);
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
                <div className="text-sm text-gray-500">Phase 1.1: Foundation</div>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              Centers on your location or Atlanta, GA
            </div>
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