import React, { useEffect, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { ModernMarkerStyles } from '../utils/modernMarkers';
import { Database } from '../../../database-schema';
import { isTouchDevice, addLongPressListener } from '../../../utils/deviceDetection';
import {
  MarkerShape,
  loadMarkerLibrary,
  createPropertyMarkerElement,
  createAdvancedMarker,
  isMarkerLibraryLoaded
} from '../utils/advancedMarkers';

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
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
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
  markerStyle?: {
    shape: MarkerShape;
    useAdvancedMarkers: boolean;
  };
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
  selectedPropertyData = null,
  markerStyle = { shape: 'teardrop', useAdvancedMarkers: true }
}) => {
  const [properties, setProperties] = useState<Property[]>([]);
  // Union type for markers - can be legacy Marker or AdvancedMarkerElement
  type AnyMarker = google.maps.Marker | google.maps.marker.AdvancedMarkerElement;
  const [markers, setMarkers] = useState<AnyMarker[]>([]);
  const [sessionMarkers, setSessionMarkers] = useState<AnyMarker[]>([]); // Always visible session pins
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<AnyMarker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markerLibraryLoaded, setMarkerLibraryLoaded] = useState(false);

  // Load marker library for AdvancedMarkerElement
  useEffect(() => {
    if (markerStyle.useAdvancedMarkers && !markerLibraryLoaded) {
      loadMarkerLibrary()
        .then(() => {
          setMarkerLibraryLoaded(true);
          console.log('✅ PropertyLayer: Marker library loaded');
        })
        .catch((err) => {
          console.error('❌ PropertyLayer: Failed to load marker library:', err);
        });
    }
  }, [markerStyle.useAdvancedMarkers, markerLibraryLoaded]);

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
          property_type_id,
          asking_purchase_price,
          asking_lease_price,
          lease_expiration_date,
          created_at,
          created_by_id,
          updated_at,
          updated_by_id,
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
                property_type_id,
                asking_purchase_price,
                asking_lease_price,
                lease_expiration_date,
                created_at,
                created_by_id,
                updated_at,
                updated_by_id,
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

    // For advanced markers, wait for library to load
    if (markerStyle.useAdvancedMarkers && !isMarkerLibraryLoaded()) {
      console.log('⏳ Waiting for marker library to load...');
      return;
    }

    // Clear existing markers from map and clusterer
    if (clusterer) {
      clusterer.clearMarkers();
    }
    markers.forEach(marker => marker.map = null);

    const filteredProperties = properties.filter(property => !recentlyCreatedIds.has(property.id));

    let newSelectedMarker: AnyMarker | null = null;

    const newMarkers: AnyMarker[] = filteredProperties
      .map(property => {
        const coords = getDisplayCoordinates(property);
        if (!coords) return null;

        const isSelected = selectedPropertyId === property.id;
        const isBeingVerified = verifyingPropertyId === property.id;

        // Determine marker type
        let markerType: 'verified' | 'recent' | 'geocoded' | 'default' | 'selected' | 'verifying';
        if (isSelected) {
          markerType = 'selected';
        } else if (isBeingVerified) {
          markerType = 'verifying';
        } else if (coords.verified) {
          markerType = 'verified';
        } else {
          markerType = 'geocoded';
        }

        // Use AdvancedMarkerElement for modern markers
        if (markerStyle.useAdvancedMarkers) {
          const content = createPropertyMarkerElement(
            markerType,
            markerStyle.shape,
            isSelected ? 52 : 44 // Larger size for selected
          );

          const advancedMarker = createAdvancedMarker(
            map,
            { lat: coords.lat, lng: coords.lng },
            content,
            {
              title: property.property_name || property.address,
              zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100),
              gmpDraggable: isBeingVerified
            }
          );

          // Add click handler via content element
          const element = advancedMarker.element;
          if (element) {
            element.addEventListener('click', () => {
              if (onPinClick) {
                onPinClick(property);
              }
            });

            // Add right-click handler
            if (onPropertyRightClick) {
              element.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                onPropertyRightClick(property, e.clientX, e.clientY);
              });

              // Long-press for touch devices
              if (isTouchDevice()) {
                addLongPressListener(element, (x, y) => {
                  onPropertyRightClick(property, x, y);
                });
              }
            }
          }

          // Add drag listener for verification
          if (isBeingVerified && onLocationVerified) {
            advancedMarker.addListener('dragend', () => {
              const pos = advancedMarker.position;
              if (pos) {
                const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
                const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
                console.log('📍 Property location verified:', { propertyId: property.id, lat, lng });
                onLocationVerified(property.id, lat, lng);
              }
            });
          }

          // Store reference to selected marker
          if (isSelected) {
            newSelectedMarker = advancedMarker;
          }

          return advancedMarker;
        }

        // Legacy marker fallback
        let markerIcon: google.maps.Icon;
        if (isSelected) {
          markerIcon = ModernMarkerStyles.property.selected();
        } else if (isBeingVerified) {
          markerIcon = ModernMarkerStyles.property.verifying();
        } else if (coords.verified) {
          markerIcon = ModernMarkerStyles.property.verified();
        } else {
          markerIcon = ModernMarkerStyles.property.geocoded();
        }

        const marker = new google.maps.Marker({
          position: { lat: coords.lat, lng: coords.lng },
          map: null,
          title: property.property_name || property.address,
          icon: markerIcon,
          draggable: isBeingVerified,
          zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100)
        });

        // Add click handler
        marker.addListener('click', () => {
          if (onPinClick) {
            onPinClick(property);
          }
        });

        // Add right-click listener
        if (onPropertyRightClick) {
          marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent) {
              event.domEvent.preventDefault();
              event.domEvent.stopPropagation();
              onPropertyRightClick(property, event.domEvent.clientX, event.domEvent.clientY);
            }
          });
        }

        // Add drag listener for verification
        if (isBeingVerified && onLocationVerified) {
          marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
            if (event.latLng) {
              const newLat = event.latLng.lat();
              const newLng = event.latLng.lng();
              console.log('📍 Property location verified:', { propertyId: property.id, lat: newLat, lng: newLng });
              onLocationVerified(property.id, newLat, newLng);
            }
          });
        }

        // Store reference to selected marker
        if (isSelected) {
          newSelectedMarker = marker;
        }

        return marker;
      }).filter(marker => marker !== null) as AnyMarker[];

    console.log(`🏢 PropertyLayer: Created ${newMarkers.length} markers (${markerStyle.useAdvancedMarkers ? 'Advanced' : 'Legacy'})`);
    setMarkers(newMarkers);
    setSelectedMarker(newSelectedMarker);
  };

  // Set up marker clustering
  const setupClustering = () => {
    if (!map) return;

    // Dispose of existing clusterer if it exists (handles map recreation)
    if (clusterer) {
      console.log('🧹 Disposing of existing clusterer due to map change...');
      clusterer.clearMarkers();
      clusterer.setMap(null);
    }

    // Get cluster config from loadingConfig, with defaults
    const clusterSettings = loadingConfig.clusterConfig || {
      minimumClusterSize: 5,
      gridSize: 60,
      maxZoom: 15
    };

    // If minimumClusterSize is very high (e.g., 999), disable clustering entirely
    // by not creating a clusterer - markers will be added directly to the map
    if (clusterSettings.minimumClusterSize >= 100) {
      console.log(`🚫 PropertyLayer: Clustering disabled`);
      setClusterer(null);
      return;
    }

    const newClusterer = new MarkerClusterer({
      map,
      markers: [],
      gridSize: clusterSettings.gridSize,
      maxZoom: clusterSettings.maxZoom,
      averageCenter: true,
      minimumClusterSize: clusterSettings.minimumClusterSize
    });

    setClusterer(newClusterer);
  };

  // Helper to get/set map for both marker types
  const getMarkerMap = (marker: AnyMarker): google.maps.Map | null => {
    if ('getMap' in marker && typeof marker.getMap === 'function') {
      return marker.getMap() as google.maps.Map | null;
    }
    return marker.map as google.maps.Map | null;
  };

  const setMarkerMap = (marker: AnyMarker, targetMap: google.maps.Map | null) => {
    if ('setMap' in marker && typeof marker.setMap === 'function') {
      marker.setMap(targetMap);
    } else {
      marker.map = targetMap;
    }
  };

  // Update marker visibility - handles both clustered and non-clustered modes
  const updateMarkerVisibility = React.useCallback(() => {
    if (!map || markers.length === 0) return;

    // Handle case when clustering is disabled (clusterer is null)
    // Note: Clustering doesn't work with AdvancedMarkerElement, so use direct map display
    if (!clusterer || markerStyle.useAdvancedMarkers) {
      if (isVisible) {
        // Show all markers directly on the map (no clustering)
        markers.forEach(marker => {
          if (getMarkerMap(marker) !== map) {
            setMarkerMap(marker, map);
          }
        });
      } else {
        // Hide all markers except selected
        markers.forEach(marker => {
          if (marker !== selectedMarker && getMarkerMap(marker) !== null) {
            setMarkerMap(marker, null);
          }
        });

        // Show selected marker even when layer is hidden
        if (selectedMarker && getMarkerMap(selectedMarker) !== map) {
          setMarkerMap(selectedMarker, map);
        }
      }
      return;
    }

    // Clustered mode (legacy markers only)
    clusterer.clearMarkers();

    if (isVisible) {
      // Separate selected marker from regular markers
      const regularMarkers = markers.filter(marker => marker !== selectedMarker) as google.maps.Marker[];

      // Add regular markers to clusterer
      clusterer.addMarkers(regularMarkers);

      // Show selected marker directly on map (not clustered)
      if (selectedMarker) {
        setMarkerMap(selectedMarker, map);
      }
    } else {
      // Hide regular markers but KEEP selected marker visible
      markers.forEach(marker => {
        if (marker !== selectedMarker) {
          setMarkerMap(marker, null);
        }
      });

      // Show selected marker even when layer is hidden
      if (selectedMarker) {
        setMarkerMap(selectedMarker, map);
      }
    }
  }, [map, markers, clusterer, isVisible, selectedMarker, markerStyle.useAdvancedMarkers]);

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
  }, [properties, map, recentlyCreatedIds, verifyingPropertyId, selectedPropertyId, markerStyle.shape, markerStyle.useAdvancedMarkers, markerLibraryLoaded]);

  // Create session markers when recently created IDs change or properties load
  // Session markers are shown when the main layer is hidden or always (depending on UX choice)
  useEffect(() => {
    if (properties.length > 0 && recentlyCreatedIds.size > 0) {
      createSessionMarkers();
    } else if (recentlyCreatedIds.size === 0) {
      // Clear session markers when no recently created IDs
      sessionMarkers.forEach(marker => setMarkerMap(marker, null));
      setSessionMarkers([]);
    }
  }, [properties, recentlyCreatedIds, map, verifyingPropertyId]);

  // Update session marker visibility - session markers are ALWAYS visible when they exist
  useEffect(() => {
    sessionMarkers.forEach(marker => {
      setMarkerMap(marker, map); // Always show session markers when map exists
    });
  }, [sessionMarkers, map]); // Removed isVisible dependency - session markers always visible

  // Extract cluster config values for dependency comparison (avoid object reference issues)
  const clusterMinSize = loadingConfig.clusterConfig?.minimumClusterSize;
  const clusterGridSize = loadingConfig.clusterConfig?.gridSize;
  const clusterMaxZoom = loadingConfig.clusterConfig?.maxZoom;

  // Set up clustering when map is ready, changes (recreated for Map ID swap), or cluster config changes
  useEffect(() => {
    if (map) {
      setupClustering();
      // Also recreate markers when map changes (they're tied to the old map instance)
      if (properties.length > 0) {
        createMarkers();
      }
    }
  }, [map, clusterMinSize, clusterGridSize, clusterMaxZoom]);

  // Update visibility when any relevant state changes
  useEffect(() => {
    updateMarkerVisibility();
  }, [updateMarkerVisibility]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterer) {
        clusterer.clearMarkers();
      }
      markers.forEach(marker => setMarkerMap(marker, null));
      sessionMarkers.forEach(marker => setMarkerMap(marker, null));
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