import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { ModernMarkerStyles } from '../utils/modernMarkers';
import { Database } from '../../../database-schema';
import { isTouchDevice } from '../../../utils/deviceDetection';
import {
  loadMarkerLibrary,
  createPropertyMarkerElement,
  MarkerShape
} from '../utils/advancedMarkers';

type Property = Database['public']['Tables']['property']['Row'] & {
  property_record_type?: {
    id: string;
    label: string;
  };
};

export type PropertyLoadingMode = 'static-1000' | 'static-2000' | 'static-all' | 'viewport-based';

export interface PropertyLoadingConfig {
  mode: PropertyLoadingMode;
  staticLimit?: number;
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
  markerStyle?: {
    shape: MarkerShape;
    useAdvancedMarkers: boolean;
  };
}

interface PropertyLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  loadingConfig: PropertyLoadingConfig;
  onPropertiesLoaded?: (count: number) => void;
  onCreateSiteSubmit?: (property: Property) => void;
  recentlyCreatedIds?: Set<string>;
  onPinClick?: (property: Property) => void;
  verifyingPropertyId?: string | null;
  onLocationVerified?: (propertyId: string, lat: number, lng: number) => void;
  onPropertyRightClick?: (property: Property, x: number, y: number) => void;
  selectedPropertyId?: string | null;
  selectedPropertyData?: Property | null;
}

// Type union to support both Marker and AdvancedMarkerElement
type MarkerType = google.maps.Marker | google.maps.marker.AdvancedMarkerElement;

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
  const [markers, setMarkers] = useState<MarkerType[]>([]);
  const [sessionMarkers, setSessionMarkers] = useState<MarkerType[]>([]);
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<MarkerType | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markerLibraryLoaded, setMarkerLibraryLoaded] = useState(false);

  // Viewport-based loading refs
  const lastFetchBoundsRef = useRef<string | null>(null);
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleMarkersRef = useRef<Map<string, MarkerType>>(new Map());

  // Get marker style settings with defaults
  const markerStyle = loadingConfig.markerStyle || {
    shape: 'teardrop' as MarkerShape,
    useAdvancedMarkers: true
  };

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

  // Helper function to check if marker is on map
  const isMarkerOnMap = (marker: MarkerType): boolean => {
    if ('getMap' in marker && typeof marker.getMap === 'function') {
      return marker.getMap() !== null;
    } else {
      return marker.map !== null;
    }
  };

  // Helper function to set marker map
  const setMarkerMap = (marker: MarkerType, targetMap: google.maps.Map | null) => {
    marker.setMap(targetMap);
  };

  // Determine marker type based on property state
  const getPropertyMarkerType = (
    property: Property,
    coords: { lat: number; lng: number; verified: boolean }
  ): 'verified' | 'recent' | 'geocoded' | 'default' | 'selected' | 'verifying' => {
    const isSelected = selectedPropertyId === property.id;
    const isBeingVerified = verifyingPropertyId === property.id;
    const isRecentlyCreated = recentlyCreatedIds.has(property.id);

    if (isSelected) return 'selected';
    if (isBeingVerified) return 'verifying';
    if (isRecentlyCreated) return 'recent';
    if (coords.verified) return 'verified';
    return 'geocoded';
  };

  // Fetch properties based on viewport bounds (virtualized loading)
  const fetchPropertiesInViewport = useCallback(async (forceRefresh: boolean = false) => {
    if (!map) return;

    const bounds = map.getBounds();
    if (!bounds) return;

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // Create bounds key for caching
    const boundsKey = `${sw.lat().toFixed(4)},${sw.lng().toFixed(4)},${ne.lat().toFixed(4)},${ne.lng().toFixed(4)}`;

    // Skip if we've already fetched this area (unless forced)
    if (!forceRefresh && lastFetchBoundsRef.current === boundsKey) {
      return;
    }

    // Expand bounds slightly to reduce fetches during small pans
    const latPadding = (ne.lat() - sw.lat()) * 0.2;
    const lngPadding = (ne.lng() - sw.lng()) * 0.2;

    const expandedBounds = {
      north: ne.lat() + latPadding,
      south: sw.lat() - latPadding,
      east: ne.lng() + lngPadding,
      west: sw.lng() - lngPadding
    };

    setIsLoading(true);

    try {
      // Query with bounds filter using OR for both verified and regular coordinates
      const { data, error: fetchError } = await supabase
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
        .or(`and(latitude.gte.${expandedBounds.south},latitude.lte.${expandedBounds.north},longitude.gte.${expandedBounds.west},longitude.lte.${expandedBounds.east}),and(verified_latitude.gte.${expandedBounds.south},verified_latitude.lte.${expandedBounds.north},verified_longitude.gte.${expandedBounds.west},verified_longitude.lte.${expandedBounds.east})`)
        .limit(2000);

      if (fetchError) throw fetchError;

      const validProperties = (data || []).filter(property =>
        getDisplayCoordinates(property) !== null
      );

      console.log(`📍 Viewport fetch: ${validProperties.length} properties in bounds`);

      lastFetchBoundsRef.current = boundsKey;
      setProperties(validProperties);
      onPropertiesLoaded?.(validProperties.length);

    } catch (err) {
      console.error('Error fetching properties in viewport:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch properties');
    } finally {
      setIsLoading(false);
    }
  }, [map, onPropertiesLoaded]);

  // Fetch all properties (static loading modes)
  const fetchAllProperties = async () => {
    if (!map) return;

    setIsLoading(true);
    setError(null);

    try {
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

      switch (loadingConfig.mode) {
        case 'static-1000':
          query = query.limit(1000);
          break;
        case 'static-2000':
          query = query.limit(2000);
          break;
        case 'static-all':
          // Pagination for all properties
          const allProperties: Property[] = [];
          let pageStart = 0;
          const pageSize = 1000;
          let hasMoreData = true;

          while (hasMoreData) {
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

            if (pageError) throw pageError;

            if (pageData && pageData.length > 0) {
              allProperties.push(...pageData);
              hasMoreData = pageData.length >= pageSize;
              pageStart += pageSize;
            } else {
              hasMoreData = false;
            }
          }

          const validAllProperties = allProperties.filter(property =>
            getDisplayCoordinates(property) !== null
          );

          console.log(`📍 Static-all: ${validAllProperties.length} properties loaded`);
          setProperties(validAllProperties);
          onPropertiesLoaded?.(validAllProperties.length);
          setIsLoading(false);
          return;
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const validProperties = (data || []).filter(property =>
        getDisplayCoordinates(property) !== null
      );

      console.log(`📍 Static fetch: ${validProperties.length} properties (${loadingConfig.mode})`);
      setProperties(validProperties);
      onPropertiesLoaded?.(validProperties.length);

    } catch (err) {
      console.error('Error fetching properties:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch properties');
    } finally {
      setIsLoading(false);
    }
  };

  // Create a single marker for a property
  const createPropertyMarker = (
    property: Property,
    useAdvanced: boolean
  ): MarkerType | null => {
    if (!map) return null;

    const coords = getDisplayCoordinates(property);
    if (!coords) return null;

    const markerType = getPropertyMarkerType(property, coords);
    const isSelected = selectedPropertyId === property.id;
    const isBeingVerified = verifyingPropertyId === property.id;

    let wasLongPress = false;
    let touchStartTime = 0;

    let marker: MarkerType;

    if (useAdvanced && markerLibraryLoaded) {
      // Create AdvancedMarkerElement
      const { AdvancedMarkerElement } = google.maps.marker;
      const content = createPropertyMarkerElement(
        markerType,
        markerStyle.shape,
        isSelected ? 52 : 44
      );

      marker = new AdvancedMarkerElement({
        map: null,
        position: { lat: coords.lat, lng: coords.lng },
        content,
        title: property.property_name || property.address,
        zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100),
        gmpDraggable: isBeingVerified
      });

      // Drag handling for verification
      if (isBeingVerified && onLocationVerified) {
        marker.addListener('dragstart', () => {
          touchStartTime = 0;
          wasLongPress = false;
        });

        marker.addListener('dragend', () => {
          const pos = marker.position;
          if (pos) {
            const lat = typeof pos.lat === 'function' ? pos.lat() : pos.lat;
            const lng = typeof pos.lng === 'function' ? pos.lng() : pos.lng;
            onLocationVerified(property.id, lat!, lng!);
          }
        });
      }

      // Click handler
      marker.addListener('click', () => {
        if (wasLongPress) {
          wasLongPress = false;
          return;
        }
        if (onPinClick) {
          onPinClick(property);
        }
      });

      // Right-click and long-press on content element
      if (onPropertyRightClick && content) {
        content.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          onPropertyRightClick(property, e.clientX, e.clientY);
        });

        if (isTouchDevice()) {
          let touchMoved = false;
          let touchStartPos = { x: 0, y: 0 };
          let longPressTimer: ReturnType<typeof setTimeout> | null = null;

          content.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) {
              touchStartTime = 0;
              if (longPressTimer) clearTimeout(longPressTimer);
              return;
            }

            touchStartTime = Date.now();
            touchMoved = false;
            wasLongPress = false;
            const touch = e.touches[0];
            touchStartPos = { x: touch.clientX, y: touch.clientY };

            longPressTimer = setTimeout(() => {
              if (!touchMoved) {
                wasLongPress = true;
                onPropertyRightClick(property, touchStartPos.x, touchStartPos.y);
              }
            }, 500);
          }, { passive: true });

          content.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
              touchStartTime = 0;
              if (longPressTimer) clearTimeout(longPressTimer);
              return;
            }

            const touch = e.touches[0];
            const deltaX = Math.abs(touch.clientX - touchStartPos.x);
            const deltaY = Math.abs(touch.clientY - touchStartPos.y);
            if (deltaX > 10 || deltaY > 10) {
              touchMoved = true;
              if (longPressTimer) clearTimeout(longPressTimer);
            }
          }, { passive: true });

          content.addEventListener('touchend', () => {
            if (longPressTimer) clearTimeout(longPressTimer);
          }, { passive: true });
        }
      }

    } else {
      // Legacy google.maps.Marker fallback
      let markerIcon: google.maps.Icon;

      if (isSelected) {
        markerIcon = ModernMarkerStyles.property.selected();
      } else if (isBeingVerified) {
        markerIcon = ModernMarkerStyles.property.verifying();
      } else if (recentlyCreatedIds.has(property.id)) {
        markerIcon = ModernMarkerStyles.property.recent();
      } else if (coords.verified) {
        markerIcon = ModernMarkerStyles.property.verified();
      } else {
        markerIcon = ModernMarkerStyles.property.geocoded();
      }

      marker = new google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        map: null,
        title: property.property_name || property.address,
        icon: markerIcon,
        draggable: isBeingVerified,
        zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100)
      });

      if (isBeingVerified && onLocationVerified) {
        marker.addListener('dragstart', () => {
          touchStartTime = 0;
          wasLongPress = false;
        });

        marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
          if (event.latLng) {
            onLocationVerified(property.id, event.latLng.lat(), event.latLng.lng());
          }
        });
      }

      marker.addListener('click', () => {
        if (wasLongPress) {
          wasLongPress = false;
          return;
        }
        if (onPinClick) {
          onPinClick(property);
        }
      });

      if (onPropertyRightClick) {
        marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
          if (event.domEvent) {
            event.domEvent.preventDefault();
            event.domEvent.stopPropagation();
            onPropertyRightClick(property, event.domEvent.clientX, event.domEvent.clientY);
          }
        });

        if (isTouchDevice()) {
          let touchMoved = false;
          let touchStartPos = { x: 0, y: 0 };

          marker.addListener('mousedown', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent && event.domEvent instanceof TouchEvent) {
              if (event.domEvent.touches.length > 1) {
                touchStartTime = 0;
                return;
              }
              touchStartTime = Date.now();
              touchMoved = false;
              wasLongPress = false;
              const touch = event.domEvent.touches[0];
              touchStartPos = { x: touch.clientX, y: touch.clientY };
            }
          });

          marker.addListener('mousemove', (event: google.maps.MapMouseEvent) => {
            if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
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
    }

    return marker;
  };

  // Create markers for visible properties (virtualized)
  const createMarkers = async () => {
    if (!map) return;

    // Load marker library if using advanced markers
    if (markerStyle.useAdvancedMarkers && !markerLibraryLoaded) {
      try {
        await loadMarkerLibrary();
        setMarkerLibraryLoaded(true);
      } catch (err) {
        console.error('Failed to load marker library, using legacy markers:', err);
      }
    }

    // Clear existing markers
    markers.forEach(marker => setMarkerMap(marker, null));
    visibleMarkersRef.current.clear();

    const useAdvanced = markerStyle.useAdvancedMarkers && markerLibraryLoaded;

    // Filter out recently created properties (they get session markers)
    const filteredProperties = properties.filter(
      property => !recentlyCreatedIds.has(property.id)
    );

    let newSelectedMarker: MarkerType | null = null;
    const newMarkers: MarkerType[] = [];

    for (const property of filteredProperties) {
      const marker = createPropertyMarker(property, useAdvanced);
      if (marker) {
        newMarkers.push(marker);
        visibleMarkersRef.current.set(property.id, marker);

        if (selectedPropertyId === property.id) {
          newSelectedMarker = marker;
        }
      }
    }

    console.log(`✅ Created ${newMarkers.length} property markers (${useAdvanced ? 'Advanced' : 'Legacy'})`);
    setMarkers(newMarkers);
    setSelectedMarker(newSelectedMarker);
  };

  // Create session markers for recently created properties
  const createSessionMarkers = async () => {
    if (!map || recentlyCreatedIds.size === 0) {
      sessionMarkers.forEach(marker => setMarkerMap(marker, null));
      setSessionMarkers([]);
      return;
    }

    // Load marker library if needed
    if (markerStyle.useAdvancedMarkers && !markerLibraryLoaded) {
      try {
        await loadMarkerLibrary();
        setMarkerLibraryLoaded(true);
      } catch (err) {
        console.error('Failed to load marker library:', err);
      }
    }

    sessionMarkers.forEach(marker => setMarkerMap(marker, null));

    const useAdvanced = markerStyle.useAdvancedMarkers && markerLibraryLoaded;
    const recentProperties = properties.filter(p => recentlyCreatedIds.has(p.id));

    const newSessionMarkers: MarkerType[] = [];

    for (const property of recentProperties) {
      const marker = createPropertyMarker(property, useAdvanced);
      if (marker) {
        newSessionMarkers.push(marker);
      }
    }

    console.log(`✅ Created ${newSessionMarkers.length} session markers`);
    setSessionMarkers(newSessionMarkers);
  };

  // Set up clustering
  const setupClustering = () => {
    if (!map) return;

    if (clusterer) {
      clusterer.clearMarkers();
      clusterer.setMap(null);
    }

    const clusterSettings = loadingConfig.clusterConfig || {
      minimumClusterSize: 5,
      gridSize: 60,
      maxZoom: 15
    };

    // Disable clustering if minimumClusterSize is very high
    if (clusterSettings.minimumClusterSize >= 100) {
      console.log('🚫 PropertyLayer: Clustering disabled');
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

  // Update marker visibility
  const updateMarkerVisibility = useCallback(() => {
    if (!map || markers.length === 0) return;

    if (!clusterer) {
      // No clustering - show markers directly
      if (isVisible) {
        markers.forEach(marker => {
          if (!isMarkerOnMap(marker)) {
            setMarkerMap(marker, map);
          }
        });
      } else {
        markers.forEach(marker => {
          if (marker !== selectedMarker && isMarkerOnMap(marker)) {
            setMarkerMap(marker, null);
          }
        });
        // Keep selected marker visible
        if (selectedMarker && !isMarkerOnMap(selectedMarker)) {
          setMarkerMap(selectedMarker, map);
        }
      }
      return;
    }

    // Clustered mode
    clusterer.clearMarkers();

    if (isVisible) {
      const regularMarkers = markers.filter(marker => marker !== selectedMarker);
      clusterer.addMarkers(regularMarkers as (google.maps.Marker | google.maps.marker.AdvancedMarkerElement)[]);

      // Show selected marker directly (not clustered)
      if (selectedMarker && !isMarkerOnMap(selectedMarker)) {
        setMarkerMap(selectedMarker, map);
      }
    } else {
      markers.forEach(marker => {
        if (marker !== selectedMarker && isMarkerOnMap(marker)) {
          setMarkerMap(marker, null);
        }
      });
      if (selectedMarker && !isMarkerOnMap(selectedMarker)) {
        setMarkerMap(selectedMarker, map);
      }
    }
  }, [map, markers, clusterer, isVisible, selectedMarker]);

  // Update session marker visibility
  useEffect(() => {
    sessionMarkers.forEach(marker => {
      setMarkerMap(marker, map);
    });
  }, [sessionMarkers, map]);

  // Get refresh trigger from LayerManager
  const { refreshTrigger } = useLayerManager();
  const propertyRefreshTrigger = refreshTrigger.properties || 0;

  // Load properties based on mode
  useEffect(() => {
    if (!map) return;

    if (loadingConfig.mode === 'viewport-based') {
      fetchPropertiesInViewport(true);
    } else {
      fetchAllProperties();
    }
  }, [map, loadingConfig.mode, propertyRefreshTrigger]);

  // Set up viewport-based loading listener
  useEffect(() => {
    if (!map || loadingConfig.mode !== 'viewport-based') return;

    const handleIdle = () => {
      // Debounce viewport fetches
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
      }
      fetchDebounceRef.current = setTimeout(() => {
        fetchPropertiesInViewport();
      }, 300);
    };

    const idleListener = map.addListener('idle', handleIdle);

    return () => {
      google.maps.event.removeListener(idleListener);
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
      }
    };
  }, [map, loadingConfig.mode, fetchPropertiesInViewport]);

  // Create markers when properties or dependencies change
  useEffect(() => {
    if (properties.length > 0 || markers.length > 0) {
      createMarkers();
    }
  }, [properties, map, recentlyCreatedIds, verifyingPropertyId, selectedPropertyId, markerStyle.shape, markerStyle.useAdvancedMarkers, markerLibraryLoaded]);

  // Create session markers
  useEffect(() => {
    if (properties.length > 0 && recentlyCreatedIds.size > 0) {
      createSessionMarkers();
    } else if (recentlyCreatedIds.size === 0) {
      sessionMarkers.forEach(marker => setMarkerMap(marker, null));
      setSessionMarkers([]);
    }
  }, [properties, recentlyCreatedIds, map, verifyingPropertyId, markerLibraryLoaded]);

  // Extract cluster config values for dependency comparison
  const clusterMinSize = loadingConfig.clusterConfig?.minimumClusterSize;
  const clusterGridSize = loadingConfig.clusterConfig?.gridSize;
  const clusterMaxZoom = loadingConfig.clusterConfig?.maxZoom;

  // Set up clustering when map changes or cluster config changes
  useEffect(() => {
    if (map) {
      setupClustering();
      if (properties.length > 0) {
        createMarkers();
      }
    }
  }, [map, clusterMinSize, clusterGridSize, clusterMaxZoom]);

  // Update visibility
  useEffect(() => {
    updateMarkerVisibility();
  }, [updateMarkerVisibility]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterer) {
        clusterer.clearMarkers();
        clusterer.setMap(null);
      }
      markers.forEach(marker => setMarkerMap(marker, null));
      sessionMarkers.forEach(marker => setMarkerMap(marker, null));
      if (fetchDebounceRef.current) {
        clearTimeout(fetchDebounceRef.current);
      }
    };
  }, []);

  if (error) {
    console.error('PropertyLayer Error:', error);
  }

  return null;
};

export default PropertyLayer;
