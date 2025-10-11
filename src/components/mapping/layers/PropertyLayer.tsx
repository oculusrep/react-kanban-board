import React, { useEffect, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { ModernMarkerStyles } from '../utils/modernMarkers';
import { Database } from '../../../database-schema';
import { isTouchDevice, addLongPressListener } from '../../../utils/deviceDetection';

type Property = Database['public']['Tables']['property']['Row'] & {
  property_record_type?: {
    id: string;
    label: string;
  };
};

export type PropertyLoadingMode = 'static-1000' | 'static-2000' | 'static-all' | 'bounds-based';

export interface PropertyLoadingConfig {
  mode: PropertyLoadingMode;
  staticLimit?: number;
}

interface PropertyLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  loadingConfig: PropertyLoadingConfig;
  onPropertiesLoaded?: (count: number) => void;
  onCreateSiteSubmit?: (property: Property) => void;
  recentlyCreatedIds?: Set<string>; // Track recently created properties
  onPinClick?: (property: Property) => void;
  verifyingPropertyId?: string | null; // Property being verified
  onLocationVerified?: (propertyId: string, lat: number, lng: number) => void;
  onPropertyRightClick?: (property: Property, x: number, y: number) => void;
  selectedPropertyId?: string | null; // Currently selected property for editing
  selectedPropertyData?: Property | null; // Full property data when selected from search
}

const PropertyLayer: React.FC<PropertyLayerProps> = ({
  map,
  isVisible,
  loadingConfig,
  onPropertiesLoaded,
  onCreateSiteSubmit,
  recentlyCreatedIds = new Set(),
  onPinClick,
  verifyingPropertyId = null,
  onLocationVerified,
  onPropertyRightClick,
  selectedPropertyId = null,
  selectedPropertyData = null
}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [sessionMarkers, setSessionMarkers] = useState<google.maps.Marker[]>([]); // Always visible session pins
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<google.maps.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to get display coordinates (verified takes priority over regular)
  const getDisplayCoordinates = (property: Property) => {
    if (property.verified_latitude && property.verified_longitude) {
      return {
        lat: property.verified_latitude,
        lng: property.verified_longitude,
        verified: true
      };
    }
    if (property.latitude && property.longitude) {
      return {
        lat: property.latitude,
        lng: property.longitude,
        verified: false
      };
    }
    return null;
  };

  // Fetch properties based on loading configuration
  const fetchProperties = async () => {
    if (!map) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🏢 Fetching properties (mode: ${loadingConfig.mode})...`);

      let query = supabase
        .from('property')
        .select(`
          id,
          property_name,
          address,
          city,
          state,
          zip,
          property_notes,
          latitude,
          longitude,
          verified_latitude,
          verified_longitude,
          rent_psf,
          nnn_psf,
          acres,
          building_sqft,
          available_sqft,
          property_record_type_id,
          asking_purchase_price,
          asking_lease_price,
          lease_expiration_date,
          property_record_type (
            id,
            label
          )
        `)
        .or('and(latitude.not.is.null,longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)');

      // Apply different loading strategies
      switch (loadingConfig.mode) {
        case 'static-1000':
          query = query.limit(1000);
          break;

        case 'static-2000':
          query = query.limit(2000);
          break;

        case 'static-all':
          // Fetch all properties using pagination to bypass 1000-row limit
          console.log('📊 static-all: Using pagination to fetch all properties...');

          const allProperties = [];
          let pageStart = 0;
          const pageSize = 1000;
          let hasMoreData = true;

          while (hasMoreData) {
            console.log(`📄 Fetching page starting at ${pageStart}...`);

            const pageQuery = supabase
              .from('property')
              .select(`
                id,
                property_name,
                address,
                city,
                state,
                zip,
                property_notes,
                latitude,
                longitude,
                verified_latitude,
                verified_longitude,
                rent_psf,
                nnn_psf,
                acres,
                building_sqft,
                available_sqft,
                property_record_type_id,
                asking_purchase_price,
                asking_lease_price,
                lease_expiration_date,
                property_record_type (
                  id,
                  label
                )
              `)
              .or('and(latitude.not.is.null,longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)')
              .range(pageStart, pageStart + pageSize - 1)
              .order('id');

            const { data: pageData, error: pageError } = await pageQuery;

            if (pageError) {
              throw pageError;
            }

            if (pageData && pageData.length > 0) {
              allProperties.push(...pageData);
              console.log(`✅ Fetched ${pageData.length} properties (total so far: ${allProperties.length})`);

              // If we got less than pageSize, we've reached the end
              if (pageData.length < pageSize) {
                hasMoreData = false;
              } else {
                pageStart += pageSize;
              }
            } else {
              hasMoreData = false;
            }
          }

          console.log(`🎉 Pagination complete: ${allProperties.length} total properties fetched`);

          const validProperties = allProperties.filter(property =>
            getDisplayCoordinates(property) !== null
          );

          console.log(`📍 Found ${validProperties.length} properties with coordinates (static-all via pagination)`);
          setProperties(validProperties);
          onPropertiesLoaded?.(validProperties.length);

          setIsLoading(false);
          return; // Exit early since we've handled the request

        case 'bounds-based':
          const bounds = map.getBounds();
          if (bounds) {
            const ne = bounds.getNorthEast();
            const sw = bounds.getSouthWest();

            query = query
              .gte('latitude', sw.lat())
              .lte('latitude', ne.lat())
              .gte('longitude', sw.lng())
              .lte('longitude', ne.lng())
              .limit(500); // Safety limit for very dense areas

            console.log(`🗺️ Loading properties in bounds: ${sw.lat().toFixed(4)},${sw.lng().toFixed(4)} to ${ne.lat().toFixed(4)},${ne.lng().toFixed(4)}`);
          }
          break;
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        throw fetchError;
      }

      const validProperties = (data || []).filter(property =>
        getDisplayCoordinates(property) !== null
      );

      console.log(`📍 Found ${validProperties.length} properties with coordinates (${loadingConfig.mode})`);

      // Debug: Log a few properties to see their coordinate data
      if (validProperties.length > 0) {
        console.log('🔍 Sample properties:', validProperties.slice(0, 3).map(p => ({
          id: p.id,
          name: p.property_name,
          coords: getDisplayCoordinates(p)
        })));
      }
      setProperties(validProperties);
      onPropertiesLoaded?.(validProperties.length);

    } catch (err) {
      console.error('Error fetching properties:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch properties');
    } finally {
      setIsLoading(false);
    }
  };

  // Create session markers for recently created properties (always visible)
  const createSessionMarkers = () => {
    if (!map || recentlyCreatedIds.size === 0) {
      console.log('🚫 Not creating session markers:', { map: !!map, recentlyCreatedIdsSize: recentlyCreatedIds.size });
      return;
    }

    console.log('🆕 Creating session markers for recently created properties...', [...recentlyCreatedIds]);

    // Clear existing session markers
    sessionMarkers.forEach(marker => marker.setMap(null));

    // Find recently created properties from current properties list
    const recentlyCreatedProperties = properties.filter(property =>
      recentlyCreatedIds.has(property.id)
    );

    const newSessionMarkers: google.maps.Marker[] = recentlyCreatedProperties.map(property => {
      const coords = getDisplayCoordinates(property);
      if (!coords) return null;

      const isBeingVerified = verifyingPropertyId === property.id;
      const marker = new google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        map: null, // Don't show initially, let visibility logic handle it
        title: `🆕 ${property.property_name || property.address}`,
        icon: isBeingVerified ? ModernMarkerStyles.property.verifying() : ModernMarkerStyles.property.recent(),
        zIndex: isBeingVerified ? 2000 : 1000, // Higher z-index when verifying
        draggable: isBeingVerified
      });

      // Long-press state for touch devices (defined here so click handler and drag can access it)
      let wasLongPress = false;
      let touchStartTime = 0; // Declare here so drag handlers can access it

      // Add drag listener for verification
      if (isBeingVerified && onLocationVerified) {
        // Reset long-press detection when drag starts
        marker.addListener('dragstart', () => {
          touchStartTime = 0; // Cancel any pending long-press
          wasLongPress = false;
        });

        marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
          if (event.latLng) {
            const newLat = event.latLng.lat();
            const newLng = event.latLng.lng();
            console.log('📍 Property location verified:', { propertyId: property.id, lat: newLat, lng: newLng });
            onLocationVerified(property.id, newLat, newLng);
          }
        });
      }

      // Add info window for session markers
      const infoContent = `
        <div class="p-3 max-w-sm">
          <h3 class="font-semibold text-lg text-gray-900 mb-2">
            🆕 ${property.property_name || 'Property'}
          </h3>
          <div class="space-y-1 text-sm text-gray-600">
            <div><strong>Address:</strong> ${property.address}</div>
            ${property.city ? `<div><strong>City:</strong> ${property.city}</div>` : ''}
            ${property.state ? `<div><strong>State:</strong> ${property.state}</div>` : ''}
            ${property.zip ? `<div><strong>ZIP:</strong> ${property.zip}</div>` : ''}
            <div><strong>Coordinates:</strong> ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</div>
            <div class="text-xs text-red-600 font-medium">
              🆕 Recently Created (Session Pin)
            </div>
            <div class="text-xs text-blue-600 mt-2">
              💡 Stays visible until you close tab or clear manually
            </div>
          </div>
        </div>
      `;

      const infoWindow = new google.maps.InfoWindow({
        content: infoContent
      });

      marker.addListener('click', () => {
        // Don't open slideout if this was a long-press
        if (wasLongPress) {
          console.log('🚫 Skipping click - was long press (session marker)');
          wasLongPress = false;
          return;
        }

        // Use modern slideout for session markers too
        if (onPinClick) {
          onPinClick(property);
          return;
        }

        // Fallback to info window
        infoWindow.open(map, marker);
      });

      // Add right-click listener for session markers
      if (onPropertyRightClick) {
        marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
          if (event.domEvent) {
            // Prevent the map's contextmenu event from firing
            event.domEvent.preventDefault();
            event.domEvent.stopPropagation();
            onPropertyRightClick(property, event.domEvent.clientX, event.domEvent.clientY);
          }
        });

        // Add long-press support for touch devices
        // Note: Standard markers don't have getElement(), so we handle long-press
        // through a custom click event with timing
        if (isTouchDevice()) {
          let touchMoved = false;
          let touchStartPos = { x: 0, y: 0 };

          marker.addListener('mousedown', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent && event.domEvent instanceof TouchEvent) {
              // Cancel long-press if multi-touch (pinch/zoom)
              if (event.domEvent.touches.length > 1) {
                touchStartTime = 0;
                return;
              }

              touchStartTime = Date.now(); // Use outer scope variable
              touchMoved = false;
              wasLongPress = false;
              const touch = event.domEvent.touches[0];
              touchStartPos = { x: touch.clientX, y: touch.clientY };
            }
          });

          marker.addListener('mousemove', (event: google.maps.MapMouseEvent) => {
            if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
              // Cancel long-press if multi-touch detected during move
              if (event.domEvent.touches.length > 1) {
                touchStartTime = 0;
                return;
              }

              const touch = event.domEvent.touches[0];
              const deltaX = Math.abs(touch.clientX - touchStartPos.x);
              const deltaY = Math.abs(touch.clientY - touchStartPos.y);
              if (deltaX > 10 || deltaY > 10) {
                touchMoved = true;
              }
            }
          });

          marker.addListener('mouseup', (event: google.maps.MapMouseEvent) => {
            if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
              const touchDuration = Date.now() - touchStartTime;
              if (touchDuration >= 500 && !touchMoved) {
                console.log('📱 Long press on session property marker:', property.property_name);
                wasLongPress = true;
                const touch = event.domEvent.changedTouches[0];
                onPropertyRightClick(property, touch.clientX, touch.clientY);
                event.domEvent.preventDefault();
                event.domEvent.stopPropagation();
              }
              touchStartTime = 0;
            }
          });
        }
      }

      return marker;
    }).filter(marker => marker !== null) as google.maps.Marker[];

    console.log(`✅ Created ${newSessionMarkers.length} session markers`);
    setSessionMarkers(newSessionMarkers);
  };

  // Create markers for all properties
  const createMarkers = () => {
    if (!map || !properties.length) return;

    console.log('🗺️ Creating markers for properties...', properties.length, 'properties');
    console.log('🔍 Recently created IDs to exclude:', [...recentlyCreatedIds]);
    console.log('🎯 Current selectedPropertyId:', selectedPropertyId);

    // Clear existing markers from map and clusterer
    console.log('🧹 Clearing existing markers:', {
      markersCount: markers.length,
      clustererExists: !!clusterer,
      selectedMarkerId: selectedMarker ? selectedMarker.getTitle() : null
    });

    if (clusterer) {
      clusterer.clearMarkers();
    }
    markers.forEach(marker => marker.setMap(null));

    const filteredProperties = properties.filter(property => !recentlyCreatedIds.has(property.id));
    console.log('📊 Filtered properties count:', filteredProperties.length, 'out of', properties.length);

    let newSelectedMarker: google.maps.Marker | null = null;

    const newMarkers: google.maps.Marker[] = filteredProperties
      .map(property => {
        const coords = getDisplayCoordinates(property);
        if (!coords) return null;

        // This is always false now since we filtered out recently created
        const isRecentlyCreated = false;

      // Create info window content
      const createSiteSubmitButton = onCreateSiteSubmit ? `
        <div class="mt-3 pt-3 border-t border-gray-200">
          <button
            id="create-site-submit-${property.id}"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3 rounded text-sm transition-colors"
          >
            📍 Create Site Submit
          </button>
        </div>
      ` : '';

      const infoContent = `
        <div class="p-3 max-w-sm">
          <h3 class="font-semibold text-lg text-gray-900 mb-2">
            ${property.property_name || 'Property'}
          </h3>
          <div class="space-y-1 text-sm text-gray-600">
            <div><strong>Address:</strong> ${property.address}</div>
            ${property.city ? `<div><strong>City:</strong> ${property.city}</div>` : ''}
            ${property.state ? `<div><strong>State:</strong> ${property.state}</div>` : ''}
            ${property.zip ? `<div><strong>ZIP:</strong> ${property.zip}</div>` : ''}
            <div><strong>Coordinates:</strong> ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</div>
            <div class="text-xs ${isRecentlyCreated ? 'text-red-600' : coords.verified ? 'text-green-600' : 'text-blue-600'}">
              ${isRecentlyCreated ? '🆕 Recently Created' : coords.verified ? '✓ Verified Location' : '📍 Geocoded Location'}
            </div>
          </div>
          ${createSiteSubmitButton}
        </div>
      `;

      const infoWindow = new google.maps.InfoWindow({
        content: infoContent
      });

      // Determine marker icon based on property state and selection
      let markerIcon: google.maps.Icon;
      const isSelected = selectedPropertyId === property.id;
      const isBeingVerified = verifyingPropertyId === property.id;

      // Debug logging for selection
      if (isSelected) {
        console.log('🧡 Property is SELECTED:', property.id, property.property_name || property.address);
      }

      // Debug logging to catch multiple orange pins
      if (selectedPropertyId) {
        console.log('🔍 Selection check:', {
          propertyId: property.id,
          selectedPropertyId,
          isSelected,
          propertyName: property.property_name || property.address
        });
      }

      if (isSelected) {
        markerIcon = ModernMarkerStyles.property.selected(); // Selected - large orange
      } else if (isBeingVerified) {
        markerIcon = ModernMarkerStyles.property.verifying(); // Verifying - orange
      } else if (isRecentlyCreated) {
        markerIcon = ModernMarkerStyles.property.recent(); // Recently created - red
      } else if (coords.verified) {
        markerIcon = ModernMarkerStyles.property.verified(); // Verified - green
      } else {
        markerIcon = ModernMarkerStyles.property.geocoded(); // Geocoded - blue
      }

      const marker = new google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        map: null, // Don't show initially
        title: property.property_name || property.address,
        icon: markerIcon,
        draggable: isBeingVerified,
        zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100) // Highest z-index for selected
      });

      // Long-press state for touch devices (defined here so click handler and drag can access it)
      let wasLongPress = false;
      let touchStartTime = 0; // Declare here so drag handlers can access it

      // Add drag listener for verification
      if (isBeingVerified && onLocationVerified) {
        // Reset long-press detection when drag starts
        marker.addListener('dragstart', () => {
          touchStartTime = 0; // Cancel any pending long-press
          wasLongPress = false;
        });

        marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
          if (event.latLng) {
            const newLat = event.latLng.lat();
            const newLng = event.latLng.lng();
            console.log('📍 Property location verified:', { propertyId: property.id, lat: newLat, lng: newLng });
            onLocationVerified(property.id, newLat, newLng);
          }
        });
      }

      marker.addListener('click', () => {
        // Don't open slideout if this was a long-press
        if (wasLongPress) {
          console.log('🚫 Skipping click - was long press');
          wasLongPress = false;
          return;
        }

        // Use modern slideout instead of info window
        if (onPinClick) {
          onPinClick(property);
          return;
        }

        // Fallback to info window if no modern handler
        infoWindow.open(map, marker);

        // Add event listener for the site submit button after info window opens
        if (onCreateSiteSubmit) {
          // Use setTimeout to ensure the DOM element exists
          setTimeout(() => {
            const button = document.getElementById(`create-site-submit-${property.id}`);
            if (button) {
              button.addEventListener('click', (e) => {
                e.stopPropagation();
                infoWindow.close();
                onCreateSiteSubmit(property);
              });
            }
          }, 100);
        }
      });

      // Add right-click listener for regular markers
      if (onPropertyRightClick) {
        marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
          if (event.domEvent) {
            // Prevent the map's contextmenu event from firing
            event.domEvent.preventDefault();
            event.domEvent.stopPropagation();
            onPropertyRightClick(property, event.domEvent.clientX, event.domEvent.clientY);
          }
        });

        // Add long-press support for touch devices
        // Note: Standard markers don't have getElement(), so we handle long-press
        // through a custom click event with timing
        if (isTouchDevice()) {
          let touchMoved = false;
          let touchStartPos = { x: 0, y: 0 };

          marker.addListener('mousedown', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent && event.domEvent instanceof TouchEvent) {
              // Cancel long-press if multi-touch (pinch/zoom)
              if (event.domEvent.touches.length > 1) {
                touchStartTime = 0;
                return;
              }

              touchStartTime = Date.now(); // Use outer scope variable
              touchMoved = false;
              wasLongPress = false;
              const touch = event.domEvent.touches[0];
              touchStartPos = { x: touch.clientX, y: touch.clientY };
            }
          });

          marker.addListener('mousemove', (event: google.maps.MapMouseEvent) => {
            if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
              // Cancel long-press if multi-touch detected during move
              if (event.domEvent.touches.length > 1) {
                touchStartTime = 0;
                return;
              }

              const touch = event.domEvent.touches[0];
              const deltaX = Math.abs(touch.clientX - touchStartPos.x);
              const deltaY = Math.abs(touch.clientY - touchStartPos.y);
              if (deltaX > 10 || deltaY > 10) {
                touchMoved = true;
              }
            }
          });

          marker.addListener('mouseup', (event: google.maps.MapMouseEvent) => {
            if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
              const touchDuration = Date.now() - touchStartTime;
              if (touchDuration >= 500 && !touchMoved) {
                console.log('📱 Long press on property marker:', property.property_name);
                wasLongPress = true;
                const touch = event.domEvent.changedTouches[0];
                onPropertyRightClick(property, touch.clientX, touch.clientY);
                event.domEvent.preventDefault();
                event.domEvent.stopPropagation();
                // Stop all event propagation including to map
                if (event.stop) {
                  event.stop();
                }
              }
              touchStartTime = 0;
            }
          });
        }
      }

      // Store reference to selected marker
      if (isSelected) {
        newSelectedMarker = marker;
      }

      return marker;
    }).filter(marker => marker !== null) as google.maps.Marker[];

    console.log(`✅ Created ${newMarkers.length} markers`);
    setMarkers(newMarkers);
    setSelectedMarker(newSelectedMarker);
  };

  // Set up marker clustering
  const setupClustering = () => {
    if (!map) return;

    // Only create clusterer if it doesn't exist
    if (!clusterer) {
      console.log('🔗 Setting up marker clustering...');

      const newClusterer = new MarkerClusterer({
        map,
        markers: [],
        gridSize: 60,
        maxZoom: 15,
        averageCenter: true,
        minimumClusterSize: 2
      });

      setClusterer(newClusterer);
      console.log('✅ Clustering initialized');
    }
  };

  // Update marker visibility
  const updateMarkerVisibility = () => {
    if (!clusterer) {
      console.log('⚠️ PropertyLayer: No clusterer available for visibility update');
      return;
    }

    // Always clear first to ensure clean state
    clusterer.clearMarkers();

    if (isVisible) {
      // Separate selected marker from regular markers
      const regularMarkers = markers.filter(marker => marker !== selectedMarker);

      console.log(`👁️ PropertyLayer: Showing ${regularMarkers.length} clustered markers + ${selectedMarker ? 1 : 0} selected marker`);

      // Add regular markers to clusterer
      clusterer.addMarkers(regularMarkers);

      // Show selected marker directly on map (not clustered)
      if (selectedMarker) {
        selectedMarker.setMap(map);
        console.log('🧡 Selected marker shown individually (not clustered)');
      }
    } else {
      console.log('🙈 PropertyLayer: Hiding property markers (except selected)');
      // Hide regular markers but KEEP selected marker visible
      markers.forEach(marker => {
        if (marker !== selectedMarker) {
          marker.setMap(null);
        }
      });

      // Show selected marker even when layer is hidden
      if (selectedMarker) {
        selectedMarker.setMap(map);
        console.log('🧡 Selected marker kept visible even with layer hidden');
      }
    }
  };

  // Get refresh trigger from LayerManager
  const { refreshTrigger } = useLayerManager();
  const propertyRefreshTrigger = refreshTrigger.properties || 0;


  // Load properties when component mounts or map/config changes or refresh is triggered
  useEffect(() => {
    if (map) {
      fetchProperties();
    }
  }, [map, loadingConfig, propertyRefreshTrigger]);

  // For bounds-based loading, reload when map bounds change
  useEffect(() => {
    if (!map || loadingConfig.mode !== 'bounds-based') return;

    const handleBoundsChanged = () => {
      // Debounce the reload to avoid excessive API calls
      setTimeout(() => {
        fetchProperties();
      }, 500);
    };

    const boundsListener = map.addListener('bounds_changed', handleBoundsChanged);

    return () => {
      google.maps.event.removeListener(boundsListener);
    };
  }, [map, loadingConfig.mode]);

  // Create markers when properties load or recently created IDs change
  useEffect(() => {
    if (properties.length > 0) {
      createMarkers();
    }
  }, [properties, map, recentlyCreatedIds, verifyingPropertyId, selectedPropertyId]); // selectedPropertyId dependency ensures markers refresh when selection changes

  // Create session markers when recently created IDs change or properties load
  // Session markers are shown when the main layer is hidden or always (depending on UX choice)
  useEffect(() => {
    console.log('🔄 Session marker effect triggered:', {
      propertiesCount: properties.length,
      recentlyCreatedIdsSize: recentlyCreatedIds.size,
      recentlyCreatedIds: [...recentlyCreatedIds]
    });

    if (properties.length > 0 && recentlyCreatedIds.size > 0) {
      createSessionMarkers();
    } else if (recentlyCreatedIds.size === 0) {
      // Clear session markers when no recently created IDs
      console.log('🧹 Clearing session markers because no recently created IDs');
      sessionMarkers.forEach(marker => marker.setMap(null));
      setSessionMarkers([]);
    }
  }, [properties, recentlyCreatedIds, map, verifyingPropertyId]);

  // Update session marker visibility - session markers are ALWAYS visible when they exist
  useEffect(() => {
    console.log(`🔄 PropertyLayer: Updating session marker visibility`, {
      sessionMarkersCount: sessionMarkers.length,
      hasMap: !!map,
      note: 'Session markers are always visible regardless of layer state'
    });

    sessionMarkers.forEach(marker => {
      marker.setMap(map); // Always show session markers when map exists
    });

    if (sessionMarkers.length > 0) {
      console.log(`🎯 PropertyLayer: Session markers shown (${sessionMarkers.length} markers) - always visible`);
    }
  }, [sessionMarkers, map]); // Removed isVisible dependency - session markers always visible

  // Set up clustering when map is ready (only once)
  useEffect(() => {
    if (map) {
      setupClustering();
    }
  }, [map]);

  // Update visibility when isVisible prop changes
  useEffect(() => {
    console.log(`🔄 PropertyLayer: isVisible changed to ${isVisible}, updating marker visibility`);
    updateMarkerVisibility();
  }, [isVisible, clusterer, markers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterer) {
        clusterer.clearMarkers();
      }
      markers.forEach(marker => marker.setMap(null));
      sessionMarkers.forEach(marker => marker.setMap(null));
    };
  }, []);

  // This component doesn't render anything visible - it just manages map markers
  if (error) {
    console.error('PropertyLayer Error:', error);
  }

  if (isLoading) {
    console.log('🔄 Loading properties...');
  }

  return null;
};

export default PropertyLayer;