import React, { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

interface GoogleMapContainerProps {
  height?: string;
  width?: string;
  className?: string;
  onMapLoad?: (map: google.maps.Map) => void;
}

const GoogleMapContainer: React.FC<GoogleMapContainerProps> = ({
  height = '400px',
  width = '100%',
  className = '',
  onMapLoad
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Atlanta, GA coordinates as fallback
  const ATLANTA_CENTER = { lat: 33.7490, lng: -84.3880 };

  // Get user's current location
  const getUserLocation = async (): Promise<{ lat: number; lng: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.log('📍 Geolocation not supported, using Atlanta fallback');
        resolve(null);
        return;
      }

      console.log('📍 Requesting user location...');

      navigator.geolocation.getCurrentPosition(
        (position) => {
          const location = {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          };
          console.log('✅ User location obtained:', location);
          resolve(location);
        },
        (error) => {
          console.log('❌ Geolocation failed, using Atlanta fallback:', error.message, error.code);
          resolve(null);
        },
        {
          enableHighAccuracy: false, // Use less accurate but faster location
          timeout: 5000, // Reduce timeout to 5 seconds
          maximumAge: 300000 // 5 minutes
        }
      );

      // Add a backup timeout to prevent hanging
      setTimeout(() => {
        console.log('⏰ Geolocation timeout, proceeding with Atlanta fallback');
        resolve(null);
      }, 6000);
    });
  };

  useEffect(() => {
    const initializeMap = async () => {
      if (!mapRef.current) return;

      try {
        console.log('🗺️ Starting map initialization...');
        setIsLoading(true);
        setError(null);

        // Get user location first
        console.log('📍 Getting user location...');
        const location = await getUserLocation();
        setUserLocation(location);
        console.log('📍 Location result:', location);

        // Use user location or fallback to Atlanta
        const mapCenter = location || ATLANTA_CENTER;

        // Debug API key
        const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
        console.log('🔑 API Key configured:', apiKey ? `${apiKey.substring(0, 10)}...` : 'MISSING');

        if (!apiKey) {
          throw new Error('Google Maps API key is not configured. Check VITE_GOOGLE_MAPS_API_KEY in .env');
        }

        // Initialize Google Maps loader
        const loader = new Loader({
          apiKey: apiKey,
          version: 'weekly',
          libraries: ['places', 'geometry']
        });

        // Load Google Maps
        console.log('🔄 Loading Google Maps API...');
        const google = await loader.load();
        console.log('✅ Google Maps API loaded successfully');

        // Create map instance
        const map = new google.maps.Map(mapRef.current, {
          center: mapCenter,
          zoom: location ? 12 : 10, // Zoom closer if we have user location
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          mapTypeControl: true,
          streetViewControl: true,
          fullscreenControl: true,
          zoomControl: true,
          gestureHandling: 'greedy'
        });

        // Add a marker at the center location
        const marker = new google.maps.Marker({
          position: mapCenter,
          map: map,
          title: location ? 'Your Location' : 'Atlanta, GA',
          icon: {
            url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="${location ? '#22c55e' : '#3b82f6'}"/>
              </svg>
            `),
            scaledSize: new google.maps.Size(24, 24),
            anchor: new google.maps.Point(12, 24)
          }
        });

        // Add info window
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="margin: 0 0 4px 0; font-size: 14px; color: #1f2937;">
                ${location ? '📍 Your Current Location' : '🏙️ Atlanta, GA'}
              </h3>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                ${location ? 'Detected via browser geolocation' : 'Default map center'}
              </p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af;">
                Lat: ${mapCenter.lat.toFixed(6)}, Lng: ${mapCenter.lng.toFixed(6)}
              </p>
            </div>
          `
        });

        // Show info window on marker click
        marker.addListener('click', () => {
          infoWindow.open(map, marker);
        });

        // Store map instance
        mapInstanceRef.current = map;

        // Call callback if provided
        if (onMapLoad) {
          onMapLoad(map);
        }

        console.log('✅ Google Maps initialized successfully');
        setIsLoading(false);

      } catch (error) {
        console.error('❌ Error initializing Google Maps:', error);
        setError(error instanceof Error ? error.message : 'Failed to load map');
        setIsLoading(false);
      }
    };

    initializeMap();
  }, [onMapLoad]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        // Google Maps cleanup is handled automatically
        mapInstanceRef.current = null;
      }
    };
  }, []);

  if (error) {
    return (
      <div
        className={`flex items-center justify-center bg-red-50 border border-red-200 rounded-lg ${className}`}
        style={{ height, width }}
      >
        <div className="text-center p-4">
          <div className="text-red-500 mb-2">
            <svg className="w-8 h-8 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-red-800 mb-1">Map Load Error</h3>
          <p className="text-xs text-red-600">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 text-xs text-red-700 hover:text-red-900 underline"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`relative bg-gray-100 rounded-lg overflow-hidden ${className}`}
      style={{ height, width }}
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-gray-100 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <p className="text-sm text-gray-600">Loading map...</p>
            {userLocation && (
              <p className="text-xs text-green-600 mt-1">📍 Location detected</p>
            )}
          </div>
        </div>
      )}

      {/* Map container */}
      <div
        ref={mapRef}
        className="w-full h-full"
        style={{ minHeight: '200px' }}
      />

      {/* Map info overlay */}
      {!isLoading && !error && (
        <div className="absolute top-2 right-2 bg-white bg-opacity-90 rounded-md px-2 py-1 text-xs text-gray-600 shadow">
          {userLocation ? '📍 Your Location' : '🏙️ Atlanta, GA'}
        </div>
      )}
    </div>
  );
};

export default GoogleMapContainer;