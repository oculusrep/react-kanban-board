import { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import PlaceInfoPopup, { PlaceDetails } from '../popups/PlaceInfoPopup';

interface PlaceInfoLayerProps {
  map: google.maps.Map | null;
  isVisible?: boolean;
}

interface OpenPopup {
  placeId: string;
  overlay: google.maps.OverlayView;
}

/**
 * PlaceInfoLayer - Handles POI (Point of Interest) click events on Google Maps
 *
 * When a user clicks on a Google Places POI (business, restaurant, etc.),
 * this layer fetches the place details and displays a popup with:
 * - Business name and type
 * - Open/Closed/Temporarily Closed/Permanently Closed status
 * - Address
 * - Rating
 * - Phone number
 * - Hours of operation
 * - Website link
 */
export default function PlaceInfoLayer({ map, isVisible = true }: PlaceInfoLayerProps) {
  const [openPopup, setOpenPopup] = useState<OpenPopup | null>(null);
  const openPopupRef = useRef<OpenPopup | null>(null);
  const placesServiceRef = useRef<google.maps.places.PlacesService | null>(null);

  // Keep ref in sync with state
  useEffect(() => {
    openPopupRef.current = openPopup;
  }, [openPopup]);

  // Initialize Places Service
  useEffect(() => {
    if (!map) return;

    // Create a hidden div for PlacesService (required by the API)
    const attributionDiv = document.createElement('div');
    attributionDiv.style.display = 'none';
    document.body.appendChild(attributionDiv);

    placesServiceRef.current = new google.maps.places.PlacesService(attributionDiv);

    return () => {
      attributionDiv.remove();
    };
  }, [map]);

  // Create popup overlay
  const createPopupOverlay = useCallback((place: PlaceDetails, position: google.maps.LatLng) => {
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
          <PlaceInfoPopup
            place={place}
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
          this.containerDiv.style.top = (point.y - 10) + 'px';
          this.containerDiv.style.transform = 'translate(-50%, -100%)';
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
  }, []);

  // Fetch place details from Google Places API
  const fetchPlaceDetails = useCallback(async (placeId: string): Promise<PlaceDetails | null> => {
    if (!placesServiceRef.current) return null;

    return new Promise((resolve) => {
      placesServiceRef.current!.getDetails(
        {
          placeId,
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'business_status',
            'opening_hours',
            'rating',
            'user_ratings_total',
            'website',
            'formatted_phone_number',
            'types',
            'geometry'
          ]
        },
        (place, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK && place) {
            // Check if isOpen() is available and returns a defined value
            let isOpenNow: boolean | undefined = undefined;
            if (place.opening_hours && typeof place.opening_hours.isOpen === 'function') {
              try {
                isOpenNow = place.opening_hours.isOpen();
              } catch {
                // isOpen() can throw if data is incomplete
                isOpenNow = undefined;
              }
            }

            console.log('📍 Place details:', {
              name: place.name,
              businessStatus: place.business_status,
              hasOpeningHours: !!place.opening_hours,
              isOpenNow,
            });

            const placeDetails: PlaceDetails = {
              placeId: place.place_id || placeId,
              name: place.name || 'Unknown Place',
              address: place.formatted_address,
              businessStatus: place.business_status as PlaceDetails['businessStatus'],
              openingHours: place.opening_hours ? {
                isOpen: isOpenNow,
                weekdayText: place.opening_hours.weekday_text
              } : undefined,
              rating: place.rating,
              userRatingsTotal: place.user_ratings_total,
              website: place.website,
              phoneNumber: place.formatted_phone_number,
              types: place.types
            };
            resolve(placeDetails);
          } else {
            console.warn('Place details request failed:', status);
            resolve(null);
          }
        }
      );
    });
  }, []);

  // Handle POI click
  const handlePoiClick = useCallback(async (event: google.maps.IconMouseEvent) => {
    if (!event.placeId || !map) return;

    // Prevent default info window
    event.stop?.();

    // Close existing popup
    if (openPopupRef.current) {
      openPopupRef.current.overlay.setMap(null);
      setOpenPopup(null);
    }

    // Fetch place details
    const placeDetails = await fetchPlaceDetails(event.placeId);
    if (!placeDetails) return;

    // Create and show popup
    const position = event.latLng!;
    const overlay = createPopupOverlay(placeDetails, position);

    // Small delay for cleanup
    setTimeout(() => {
      overlay.setMap(map);
      setOpenPopup({ placeId: event.placeId!, overlay });
    }, 10);
  }, [map, fetchPlaceDetails, createPopupOverlay]);

  // Set up click listener for POI icons
  useEffect(() => {
    if (!map || !isVisible) return;

    // Listen for clicks on POI icons
    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      // Check if this is a POI click (has placeId)
      const iconEvent = event as google.maps.IconMouseEvent;
      if (iconEvent.placeId) {
        handlePoiClick(iconEvent);
      } else {
        // Regular map click - close popup
        if (openPopupRef.current) {
          openPopupRef.current.overlay.setMap(null);
          setOpenPopup(null);
        }
      }
    });

    return () => {
      google.maps.event.removeListener(clickListener);
    };
  }, [map, isVisible, handlePoiClick]);

  // Clean up popup when visibility changes or component unmounts
  useEffect(() => {
    if (!isVisible && openPopupRef.current) {
      openPopupRef.current.overlay.setMap(null);
      setOpenPopup(null);
    }
  }, [isVisible]);

  useEffect(() => {
    return () => {
      if (openPopupRef.current) {
        openPopupRef.current.overlay.setMap(null);
      }
    };
  }, []);

  // This component doesn't render anything - it just manages the overlay
  return null;
}
