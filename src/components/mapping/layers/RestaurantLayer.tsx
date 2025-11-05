import React, { useEffect, useState, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { ModernMarkerStyles } from '../utils/modernMarkers';
import RestaurantPopup from '../popups/RestaurantPopup';

// Restaurant location type matching database schema
interface RestaurantLocation {
  store_no: string;
  chain_no: string | null;
  chain: string | null;
  geoaddress: string | null;
  geocity: string | null;
  geostate: string | null;
  geozip: string | null;
  county: string | null;
  latitude: number | null;
  longitude: number | null;
  yr_built: number | null;
  verified_latitude: number | null;
  verified_longitude: number | null;
  verified_source: string | null;
  verified_at: string | null;
}

// Restaurant trend type matching database schema
interface RestaurantTrend {
  trend_id: string;
  store_no: string;
  year: number;
  curr_natl_grade: string | null;
  curr_annual_sls_k: number | null;
}

// Combined type for display
type RestaurantWithTrends = RestaurantLocation & {
  trends?: RestaurantTrend[];
  latest_trend?: RestaurantTrend | null;
};

interface RestaurantLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  onPinClick?: (restaurant: RestaurantWithTrends) => void;
  verifyingStoreNo?: string | null;
  onLocationVerified?: (storeNo: string, lat: number, lng: number) => void;
  onRestaurantRightClick?: (restaurant: RestaurantWithTrends, x: number, y: number) => void;
  selectedStoreNo?: string | null;
  onRestaurantsLoaded?: (count: number) => void;
}

const RestaurantLayer: React.FC<RestaurantLayerProps> = ({
  map,
  isVisible,
  onPinClick,
  verifyingStoreNo = null,
  onLocationVerified,
  onRestaurantRightClick,
  selectedStoreNo = null,
  onRestaurantsLoaded
}) => {
  const [restaurants, setRestaurants] = useState<RestaurantWithTrends[]>([]);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [selectedMarker, setSelectedMarker] = useState<google.maps.Marker | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openPopup, setOpenPopup] = useState<{
    restaurant: RestaurantWithTrends;
    overlay: google.maps.OverlayView;
  } | null>(null);

  // Use ref to track current popup for access in marker click handlers
  const openPopupRef = useRef<{
    restaurant: RestaurantWithTrends;
    overlay: google.maps.OverlayView;
  } | null>(null);

  // Track if we're currently fetching to prevent duplicate requests
  const isFetchingRef = useRef(false);
  const lastFetchBoundsRef = useRef<string | null>(null);

  // Sync ref with state
  useEffect(() => {
    openPopupRef.current = openPopup;
  }, [openPopup]);

  // Custom Popup Overlay Class
  const createPopupOverlay = useCallback((restaurant: RestaurantWithTrends, position: google.maps.LatLng) => {
    class PopupOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement | null = null;
      private root: any = null;

      constructor(position: google.maps.LatLng) {
        super();
        this.position = position;
      }

      onAdd() {
        this.containerDiv = document.createElement('div');
        this.containerDiv.style.position = 'absolute';
        this.containerDiv.style.zIndex = '1000';

        // Create React root and render popup
        this.root = ReactDOM.createRoot(this.containerDiv);
        this.root.render(
          <RestaurantPopup
            restaurant={restaurant}
            onViewDetails={() => {
              if (onPinClick) {
                onPinClick(restaurant);
              }
              // Don't close popup when viewing details - keep it open for context
            }}
            onClose={() => {
              this.onRemove();
            }}
          />
        );

        const panes = this.getPanes();
        panes?.floatPane.appendChild(this.containerDiv);
      }

      draw() {
        if (!this.containerDiv) return;

        const overlayProjection = this.getProjection();
        const point = overlayProjection.fromLatLngToDivPixel(this.position);

        if (point) {
          this.containerDiv.style.left = point.x + 'px';
          this.containerDiv.style.top = (point.y - 10) + 'px'; // Offset above marker
          this.containerDiv.style.transform = 'translate(-50%, -100%)'; // Center horizontally, position above
        }
      }

      onRemove() {
        if (this.containerDiv) {
          if (this.root) {
            this.root.unmount();
          }
          this.containerDiv.parentElement?.removeChild(this.containerDiv);
          this.containerDiv = null;
        }
        setOpenPopup(null);
      }
    }

    return new PopupOverlay(position);
  }, [onPinClick]);

  // Close open popup when clicking elsewhere (but not if restaurant is selected in sidebar)
  useEffect(() => {
    if (!map || !openPopup) return;

    const closePopup = (event: google.maps.MapMouseEvent) => {
      console.log('🍔 Map clicked, checking if we should close popup');
      // Don't close popup if this restaurant is currently selected in sidebar
      if (openPopup && openPopup.restaurant.store_no !== selectedStoreNo) {
        console.log('🍔 Closing popup due to map click');
        openPopup.overlay.setMap(null);
        setOpenPopup(null);
      } else {
        console.log('🍔 Keeping popup open - restaurant is selected');
      }
    };

    const listener = map.addListener('click', closePopup);

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, openPopup, selectedStoreNo]);

  // Function to get display coordinates (verified takes priority over regular)
  const getDisplayCoordinates = (restaurant: RestaurantLocation) => {
    if (restaurant.verified_latitude && restaurant.verified_longitude) {
      return {
        lat: restaurant.verified_latitude,
        lng: restaurant.verified_longitude,
        verified: true
      };
    }
    if (restaurant.latitude && restaurant.longitude) {
      return {
        lat: restaurant.latitude,
        lng: restaurant.longitude,
        verified: false
      };
    }
    return null;
  };

  // Fetch restaurants within viewport bounds
  const fetchRestaurants = useCallback(async () => {
    if (!map) return;

    // Prevent duplicate simultaneous fetches
    if (isFetchingRef.current) {
      console.log('🍔 Already fetching, skipping...');
      return;
    }

    // Get current map bounds
    const bounds = map.getBounds();
    if (!bounds) {
      console.log('🍔 No bounds available yet');
      return;
    }

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();

    // Create a bounds key to check if we've already fetched this area
    const boundsKey = `${sw.lat().toFixed(4)},${sw.lng().toFixed(4)},${ne.lat().toFixed(4)},${ne.lng().toFixed(4)}`;

    // Skip if we just fetched this exact area
    if (lastFetchBoundsRef.current === boundsKey) {
      console.log('🍔 Already have data for this viewport, skipping fetch');
      return;
    }

    isFetchingRef.current = true;
    lastFetchBoundsRef.current = boundsKey;
    setIsLoading(true);
    setError(null);

    try {
      console.log('🍔 Fetching restaurants in viewport:', {
        north: ne.lat(),
        south: sw.lat(),
        east: ne.lng(),
        west: sw.lng()
      });

      // Fetch restaurant locations within bounds
      // Note: We need to check both regular and verified coordinates
      const { data: locations, error: locError } = await supabase
        .from('restaurant_location')
        .select('*')
        .or(`and(latitude.gte.${sw.lat()},latitude.lte.${ne.lat()},longitude.gte.${sw.lng()},longitude.lte.${ne.lng()},latitude.not.is.null,longitude.not.is.null),and(verified_latitude.gte.${sw.lat()},verified_latitude.lte.${ne.lat()},verified_longitude.gte.${sw.lng()},verified_longitude.lte.${ne.lng()},verified_latitude.not.is.null,verified_longitude.not.is.null)`);

      if (locError) throw locError;

      if (!locations || locations.length === 0) {
        console.log('📭 No restaurant locations found in viewport');
        setRestaurants([]);
        if (onRestaurantsLoaded) {
          onRestaurantsLoaded(0);
        }
        return;
      }

      console.log(`✅ Loaded ${locations.length} restaurant locations in viewport`);

      // Strategy: Load only latest trends first for fast initial render
      // Full trend history will be loaded on-demand when user clicks a restaurant
      const storeNos = locations.map(loc => loc.store_no);

      // Use the materialized view for latest trends (much faster)
      const { data: latestTrends, error: latestError } = await supabase
        .from('restaurant_latest_trends')
        .select('*')
        .in('store_no', storeNos);

      if (latestError) {
        console.warn('⚠️ Could not load from materialized view, falling back to regular query:', latestError);
        // Fallback to regular query if materialized view doesn't exist yet
        const { data: trends, error: trendsError } = await supabase
          .from('restaurant_trend')
          .select('trend_id, store_no, year, curr_natl_grade, curr_mkt_grade, curr_annual_sls_k')
          .in('store_no', storeNos)
          .order('year', { ascending: false });

        if (trendsError) throw trendsError;

        // Group by store_no and take only the latest
        const latestByStore = new Map();
        trends?.forEach(trend => {
          if (!latestByStore.has(trend.store_no)) {
            latestByStore.set(trend.store_no, trend);
          }
        });

        // Combine locations with their latest trend only
        const restaurantsWithTrends: RestaurantWithTrends[] = locations.map(loc => {
          const latestTrend = latestByStore.get(loc.store_no) || null;
          return {
            ...loc,
            trends: latestTrend ? [latestTrend] : [], // Only include latest for now
            latest_trend: latestTrend
          };
        });

        setRestaurants(restaurantsWithTrends);
      } else {
        console.log(`✅ Loaded ${latestTrends?.length || 0} latest trends from materialized view`);

        // Combine locations with their latest trend only
        const restaurantsWithTrends: RestaurantWithTrends[] = locations.map(loc => {
          const latestTrend = latestTrends?.find(t => t.store_no === loc.store_no) || null;
          return {
            ...loc,
            trends: latestTrend ? [latestTrend] : [], // Only include latest for fast loading
            latest_trend: latestTrend
          };
        });

        setRestaurants(restaurantsWithTrends);
      }

      // Notify parent of loaded count (restaurants state is already set above)
      if (onRestaurantsLoaded) {
        onRestaurantsLoaded(locations.length);
      }

    } catch (err: any) {
      console.error('❌ Error fetching restaurants:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, [map, onRestaurantsLoaded]);

  // Fetch restaurants when layer becomes visible (initial load)
  useEffect(() => {
    console.log('🍔 RestaurantLayer visibility changed:', isVisible, 'map:', !!map);
    if (map && isVisible) {
      console.log('🍔 Layer now visible, fetching restaurants in viewport...');
      fetchRestaurants();
    } else if (!isVisible && restaurants.length > 0) {
      // Clear restaurants when layer is toggled off
      console.log('🍔 Layer hidden, clearing restaurants');
      setRestaurants([]);
    }
  }, [map, isVisible]);

  // Create markers for all restaurants
  const createMarkers = useCallback(() => {
    if (!map || !restaurants.length) return;

    console.log('🗺️ Creating markers for restaurants...', restaurants.length, 'locations');

    // Clear existing markers
    if (clusterer) {
      clusterer.clearMarkers();
    }
    markers.forEach(marker => marker.setMap(null));

    let newSelectedMarker: google.maps.Marker | null = null;

    const newMarkers: google.maps.Marker[] = restaurants
      .map(restaurant => {
        const coords = getDisplayCoordinates(restaurant);
        if (!coords) return null;

        const isSelected = selectedStoreNo === restaurant.store_no;
        const isBeingVerified = verifyingStoreNo === restaurant.store_no;
        // Check if restaurant has any trends with actual sales values (not null)
        const hasSalesData = restaurant.trends && restaurant.trends.length > 0 &&
          restaurant.trends.some(trend => trend.curr_annual_sls_k !== null && trend.curr_annual_sls_k !== undefined);

        // Determine marker icon
        let markerIcon: google.maps.Icon;
        if (isSelected) {
          markerIcon = ModernMarkerStyles.restaurant.selected();
        } else if (isBeingVerified) {
          markerIcon = ModernMarkerStyles.restaurant.verifying();
        } else if (!hasSalesData) {
          markerIcon = ModernMarkerStyles.restaurant.noData(); // Dark gray for no sales data
        } else {
          // Keep verified and unverified pins the same color (red)
          markerIcon = ModernMarkerStyles.restaurant.default();
        }

        const marker = new google.maps.Marker({
          position: { lat: coords.lat, lng: coords.lng },
          map: null,
          title: restaurant.chain || `Store ${restaurant.store_no}`,
          icon: markerIcon,
          draggable: isBeingVerified,
          zIndex: isSelected ? 3000 : (isBeingVerified ? 2000 : 100)
        });

        // Track long-press for touch devices
        let wasLongPress = false;
        let touchStartTime = 0;

        // Add drag listener for verification
        if (isBeingVerified && onLocationVerified) {
          marker.addListener('dragstart', () => {
            touchStartTime = 0;
            wasLongPress = false;
          });

          marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
            if (event.latLng) {
              const newLat = event.latLng.lat();
              const newLng = event.latLng.lng();
              onLocationVerified(restaurant.store_no, newLat, newLng);
            }
          });
        }

        // Click handler - opens custom popup
        marker.addListener('click', (event: google.maps.MapMouseEvent) => {
          console.log('🍔 Restaurant marker clicked:', restaurant.chain, restaurant.store_no);
          if (wasLongPress) {
            console.log('🍔 Long press detected, skipping click');
            wasLongPress = false;
            return;
          }

          // Stop event propagation to prevent map click
          if (event.domEvent) {
            event.domEvent.stopPropagation();
            if (event.domEvent.preventDefault) {
              event.domEvent.preventDefault();
            }
          }

          // Close existing popup if any (use ref to get latest value)
          if (openPopupRef.current) {
            console.log('🍔 Closing previous popup');
            openPopupRef.current.overlay.setMap(null);
          }

          // Small delay to ensure previous popup is fully removed before creating new one
          setTimeout(() => {
            console.log('🍔 Creating popup overlay for:', restaurant.chain);
            const position = new google.maps.LatLng(coords.lat, coords.lng);
            const overlay = createPopupOverlay(restaurant, position);
            overlay.setMap(map);
            setOpenPopup({ restaurant, overlay });
            console.log('🍔 Custom popup opened for:', restaurant.chain);
          }, 10);
        });

        // Right-click handler
        if (onRestaurantRightClick) {
          marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent) {
              onRestaurantRightClick(
                restaurant,
                event.domEvent.clientX,
                event.domEvent.clientY
              );
            }
          });

          // Long-press for touch devices
          marker.addListener('mousedown', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent && event.domEvent instanceof TouchEvent) {
              touchStartTime = Date.now();
              wasLongPress = false;
            }
          });

          marker.addListener('mouseup', (event: google.maps.MapMouseEvent) => {
            if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
              const touchDuration = Date.now() - touchStartTime;
              if (touchDuration >= 500) {
                wasLongPress = true;
                const touch = event.domEvent.changedTouches[0];
                onRestaurantRightClick(restaurant, touch.clientX, touch.clientY);
                event.domEvent.preventDefault();
                event.domEvent.stopPropagation();
              }
              touchStartTime = 0;
            }
          });
        }

        // Track selected marker
        if (isSelected) {
          newSelectedMarker = marker;
        }

        return marker;
      })
      .filter(marker => marker !== null) as google.maps.Marker[];

    console.log(`✅ Created ${newMarkers.length} restaurant markers`);
    setMarkers(newMarkers);
    setSelectedMarker(newSelectedMarker);

    // Create or update clusterer with red styling
    if (newMarkers.length > 0) {
      if (clusterer) {
        clusterer.clearMarkers();
        if (isVisible) {
          clusterer.addMarkers(newMarkers.filter(m => m !== newSelectedMarker));
        }
      } else {
        // Custom renderer for red cluster circles
        const renderer = {
          render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
            const color = '#DC2626'; // Red color for restaurant clusters
            const svg = `
              <svg fill="${color}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
                <circle cx="120" cy="120" opacity=".6" r="70" />
                <circle cx="120" cy="120" opacity=".3" r="90" />
                <circle cx="120" cy="120" opacity=".2" r="110" />
                <text x="50%" y="50%" style="fill:#fff" text-anchor="middle" font-size="50" dominant-baseline="middle" font-family="roboto,arial,sans-serif">${count}</text>
              </svg>
            `;

            return new google.maps.Marker({
              position,
              icon: {
                url: `data:image/svg+xml;base64,${btoa(svg)}`,
                scaledSize: new google.maps.Size(45, 45),
              },
              label: {
                text: String(count),
                color: 'rgba(255,255,255,0.9)',
                fontSize: '12px',
              },
              zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
            });
          },
        };

        const newClusterer = new MarkerClusterer({
          map,
          markers: [], // Start with empty markers, let visibility effect handle it
          renderer,
        });
        setClusterer(newClusterer);
      }
    }
  }, [map, restaurants, selectedStoreNo, verifyingStoreNo, onPinClick, onLocationVerified, onRestaurantRightClick, clusterer, markers, createPopupOverlay, openPopup]);

  // Update markers when restaurants or selection changes
  useEffect(() => {
    createMarkers();
  }, [restaurants, selectedStoreNo, verifyingStoreNo]);

  // Refetch restaurants when map bounds change (viewport-based loading)
  useEffect(() => {
    if (!map || !isVisible) return;

    const boundsChangedListener = map.addListener('idle', () => {
      console.log('🍔 Map idle - refetching restaurants in new viewport');
      fetchRestaurants();
    });

    return () => {
      google.maps.event.removeListener(boundsChangedListener);
    };
  }, [map, isVisible, fetchRestaurants]);

  // Update marker visibility
  useEffect(() => {
    if (!clusterer) return;

    if (isVisible) {
      // Show clustered markers
      markers.forEach(marker => {
        if (marker !== selectedMarker) {
          clusterer.addMarker(marker);
        }
      });

      // Always show selected marker separately
      if (selectedMarker) {
        selectedMarker.setMap(map);
      }
    } else {
      // Hide all markers
      clusterer.clearMarkers();
      markers.forEach(marker => marker.setMap(null));
    }
  }, [isVisible, markers, selectedMarker, clusterer, map]);

  // Track previous selectedStoreNo for reference
  const prevSelectedStoreNoRef = useRef<string | null>(null);
  useEffect(() => {
    // Update the ref (but don't close popup when sidebar closes - keep it open for reference)
    prevSelectedStoreNoRef.current = selectedStoreNo;
  }, [selectedStoreNo]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterer) {
        clusterer.clearMarkers();
      }
      markers.forEach(marker => marker.setMap(null));
    };
  }, []);

  return null;
};

export default RestaurantLayer;
export type { RestaurantLocation, RestaurantTrend, RestaurantWithTrends };
