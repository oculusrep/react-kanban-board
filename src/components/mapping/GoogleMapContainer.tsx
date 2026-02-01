import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { createModernPinIcon, createModernMarkerIcon, MarkerColors, createMutedPlacesStyle, createSatelliteMutedPlacesStyle, createGoogleBlueDotIcon, createAccuracyCircleOptions } from './utils/modernMarkers';
import { useGPSTracking } from '../../hooks/useGPSTracking';
import { GPSControls } from './GPSTrackingButton';
import { calculateStraightLineDistance, calculateDrivingDistance, formatDistance, getDepartureTime, getTimeLabel, type DrivingDistanceResult, type StraightLineDistance } from '../../services/distanceService';
import { DistanceInfoBox } from './DistanceInfoBox';

interface GoogleMapContainerProps {
  height?: string;
  width?: string;
  className?: string;
  onMapLoad?: (map: google.maps.Map) => void;
  onCenterOnLocationReady?: (centerFunction: () => void) => void;
  controlsTopOffset?: number; // Offset in pixels to push map controls down (e.g., when search box is overlaid)
}

const GoogleMapContainer: React.FC<GoogleMapContainerProps> = ({
  height = '400px',
  width = '100%',
  className = '',
  onMapLoad,
  onCenterOnLocationReady,
  controlsTopOffset = 0
}) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [labelsVisible, setLabelsVisible] = useState(true);
  const labelsControlRef = useRef<{
    updateButtonStates: () => void;
    showLabelsControl: () => void;
    hideLabelsControl: () => void;
    updateLabelsState: (visible: boolean) => void;
  } | null>(null);

  // GPS tracking state
  const gpsMarkerRef = useRef<google.maps.Marker | null>(null);
  const accuracyCircleRef = useRef<google.maps.Circle | null>(null);
  const gpsControlRef = useRef<HTMLDivElement | null>(null);
  const [autoCenterEnabled, setAutoCenterEnabled] = useState(true); // Auto-center by default

  // Ruler tool state
  const [rulerActive, setRulerActive] = useState(false);
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState<'now' | 'morning' | 'evening' | 'weekend'>('now');
  const rulerMarkersRef = useRef<google.maps.Marker[]>([]);
  const rulerLinesRef = useRef<google.maps.Polyline[]>([]);
  const rulerLabelsRef = useRef<google.maps.Marker[]>([]); // Distance labels
  const rulerDrivingDataRef = useRef<Map<google.maps.Polyline, DrivingDistanceResult | null>>(new Map());
  const rulerClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const rulerMoveListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const rulerPreviewLineRef = useRef<google.maps.Polyline | null>(null);
  const rulerPreviewLabelRef = useRef<google.maps.OverlayView | null>(null);
  const rulerInfoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  // Custom info box state (replaces InfoWindow)
  const [customInfoBox, setCustomInfoBox] = useState<{
    visible: boolean;
    position: { x: number; y: number };
    straightDistance: StraightLineDistance;
    drivingDistance: DrivingDistanceResult | null;
    latLng: { lat: number; lng: number }; // Store lat/lng for repositioning
  } | null>(null);

  // Ref to track info box for use in event handlers (avoids stale closure)
  const customInfoBoxRef = useRef(customInfoBox);
  useEffect(() => {
    customInfoBoxRef.current = customInfoBox;
  }, [customInfoBox]);

  // Initialize GPS tracking hook with battery-optimized settings
  const {
    position: gpsPosition,
    error: gpsError,
    isTracking,
    startTracking,
    stopTracking,
    toggleTracking
  } = useGPSTracking({
    enableHighAccuracy: false, // Low accuracy for battery savings
    maximumAge: 30000, // Cache for 30 seconds
    timeout: 10000, // 10 second timeout
    distanceFilter: 10 // Update every 10 meters
  });

  // Use ref to store the latest toggle function so button click handler always has access
  const toggleTrackingRef = useRef(toggleTracking);
  useEffect(() => {
    toggleTrackingRef.current = toggleTracking;
  }, [toggleTracking]);

  // Atlanta, GA coordinates as fallback
  const ATLANTA_CENTER = { lat: 33.7490, lng: -84.3880 };

  // Create styles to hide only Google Places (POI), keep road labels
  const createNoPlacesStyle = () => [
    {
      featureType: "poi",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.business",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.attraction",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.government",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.medical",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.park",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.place_of_worship",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.school",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "poi.sports_complex",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    },
    {
      featureType: "transit.station",
      elementType: "labels",
      stylers: [{ visibility: "off" }]
    }
  ];

  // Create GPS tracking toggle control with container for both buttons
  const createGPSTrackingControls = (map: google.maps.Map) => {
    const mainContainer = document.createElement('div');
    mainContainer.style.margin = '10px';
    mainContainer.style.display = 'flex';
    mainContainer.style.flexDirection = 'column';
    mainContainer.style.gap = '8px';
    mainContainer.style.zIndex = '9999'; // Very high z-index to ensure visibility
    mainContainer.setAttribute('data-gps-controls', 'true'); // For debugging

    // GPS Tracking button
    const gpsButtonContainer = document.createElement('div');
    gpsButtonContainer.style.backgroundColor = '#fff';
    gpsButtonContainer.style.borderRadius = '3px';
    gpsButtonContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';

    const gpsButton = document.createElement('button');
    gpsButton.style.backgroundColor = 'transparent';
    gpsButton.style.border = 'none';
    gpsButton.style.cursor = 'pointer';
    gpsButton.style.padding = '10px';
    gpsButton.style.width = '48px';
    gpsButton.style.height = '48px';
    gpsButton.style.display = 'flex';
    gpsButton.style.alignItems = 'center';
    gpsButton.style.justifyContent = 'center';
    gpsButton.style.transition = 'all 0.2s';
    gpsButton.style.touchAction = 'manipulation';
    gpsButton.style.WebkitTapHighlightColor = 'transparent';
    gpsButton.setAttribute('data-gps-control', 'true');
    gpsButton.title = 'Start GPS tracking';

    // GPS icon SVG
    const gpsIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    gpsIcon.setAttribute('width', '24');
    gpsIcon.setAttribute('height', '24');
    gpsIcon.setAttribute('viewBox', '0 0 24 24');
    gpsIcon.setAttribute('fill', 'none');

    const gpsCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    gpsCircle.setAttribute('cx', '12');
    gpsCircle.setAttribute('cy', '12');
    gpsCircle.setAttribute('r', '8');
    gpsCircle.setAttribute('stroke', '#666');
    gpsCircle.setAttribute('stroke-width', '2');
    gpsCircle.setAttribute('fill', 'none');

    const gpsInnerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    gpsInnerCircle.setAttribute('cx', '12');
    gpsInnerCircle.setAttribute('cy', '12');
    gpsInnerCircle.setAttribute('r', '4');
    gpsInnerCircle.setAttribute('fill', '#666');

    gpsIcon.appendChild(gpsCircle);
    gpsIcon.appendChild(gpsInnerCircle);
    gpsButton.appendChild(gpsIcon);

    // Auto-center button (shown when tracking is active)
    const centerButtonContainer = document.createElement('div');
    centerButtonContainer.style.backgroundColor = '#fff';
    centerButtonContainer.style.borderRadius = '3px';
    centerButtonContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
    centerButtonContainer.style.display = 'none'; // Hidden initially

    const centerButton = document.createElement('button');
    centerButton.style.backgroundColor = 'transparent';
    centerButton.style.border = 'none';
    centerButton.style.cursor = 'pointer';
    centerButton.style.padding = '10px';
    centerButton.style.width = '48px';
    centerButton.style.height = '48px';
    centerButton.style.display = 'flex';
    centerButton.style.alignItems = 'center';
    centerButton.style.justifyContent = 'center';
    centerButton.style.transition = 'all 0.2s';
    centerButton.style.touchAction = 'manipulation';
    centerButton.style.WebkitTapHighlightColor = 'transparent';
    centerButton.setAttribute('data-center-control', 'true');
    centerButton.title = 'Auto-center: ON';

    // Center icon SVG (crosshair)
    const centerIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    centerIcon.setAttribute('width', '24');
    centerIcon.setAttribute('height', '24');
    centerIcon.setAttribute('viewBox', '0 0 24 24');
    centerIcon.setAttribute('fill', 'none');

    const centerCircleOuter = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerCircleOuter.setAttribute('cx', '12');
    centerCircleOuter.setAttribute('cy', '12');
    centerCircleOuter.setAttribute('r', '9');
    centerCircleOuter.setAttribute('stroke', '#4285F4');
    centerCircleOuter.setAttribute('stroke-width', '2');
    centerCircleOuter.setAttribute('fill', 'none');

    const centerDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    centerDot.setAttribute('cx', '12');
    centerDot.setAttribute('cy', '12');
    centerDot.setAttribute('r', '3');
    centerDot.setAttribute('fill', '#4285F4');

    centerIcon.appendChild(centerCircleOuter);
    centerIcon.appendChild(centerDot);
    centerButton.appendChild(centerIcon);

    // Hover effects
    const addHoverEffect = (btn: HTMLButtonElement) => {
      btn.addEventListener('mouseenter', () => {
        btn.style.backgroundColor = '#f8f9fa';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.backgroundColor = 'transparent';
      });
    };

    addHoverEffect(gpsButton);
    addHoverEffect(centerButton);

    // Click handlers using refs
    gpsButton.addEventListener('click', () => {
      console.log('📍 GPS button clicked');
      toggleTrackingRef.current();
    });

    centerButton.addEventListener('click', () => {
      console.log('🎯 Center button clicked');
      setAutoCenterEnabled(prev => !prev);
    });

    gpsButtonContainer.appendChild(gpsButton);
    centerButtonContainer.appendChild(centerButton);
    mainContainer.appendChild(gpsButtonContainer);
    mainContainer.appendChild(centerButtonContainer);

    console.log('🎮 GPS controls created');

    return {
      mainContainer,
      gpsButton,
      gpsCircle,
      gpsInnerCircle,
      centerButton,
      centerButtonContainer,
      centerCircleOuter
    };
  };

  // Create custom map type control with labels checkbox
  const createCustomMapTypeControl = (
    map: google.maps.Map,
    onToggleLabels: (newValue: boolean) => void,
    onMapRecreated?: (newMap: google.maps.Map) => void,
    topOffset: number = 0
  ) => {
    let currentLabelsVisible = labelsVisible;

    // Get Map IDs from environment for POI toggle (cloud-based styling)
    const mapIdWithPoi = import.meta.env.VITE_GOOGLE_MAP_ID;
    const mapIdNoPoi = import.meta.env.VITE_GOOGLE_MAP_ID_NO_POI;
    const controlDiv = document.createElement('div');
    controlDiv.style.margin = `${10 + topOffset}px 10px 10px 10px`;

    // Main container
    const mainContainer = document.createElement('div');
    mainContainer.style.display = 'flex';
    mainContainer.style.flexDirection = 'column';
    mainContainer.style.gap = '4px';

    // Button container for Map/Satellite
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.backgroundColor = '#fff';
    buttonContainer.style.borderRadius = '3px';
    buttonContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
    buttonContainer.style.overflow = 'hidden';

    // Create buttons
    const createButton = (text: string, isActive: boolean = false) => {
      const button = document.createElement('button');
      button.style.backgroundColor = isActive ? '#1a73e8' : '#fff';
      button.style.color = isActive ? '#fff' : 'rgb(25,25,25)';
      button.style.border = 'none';
      button.style.cursor = 'pointer';
      button.style.fontFamily = 'Roboto,Arial,sans-serif';
      button.style.fontSize = '16px';
      button.style.lineHeight = '38px';
      button.style.padding = '0 12px';
      button.style.textAlign = 'center';
      button.style.height = '40px';
      button.style.transition = 'all 0.2s';
      button.textContent = text;
      return button;
    };

    const mapButton = createButton('Map', map.getMapTypeId() === google.maps.MapTypeId.ROADMAP);
    const satelliteButton = createButton('Satellite', map.getMapTypeId() === google.maps.MapTypeId.SATELLITE);

    // Labels checkbox container - controls Google Places/business labels visibility
    const labelsContainer = document.createElement('div');
    labelsContainer.style.backgroundColor = '#fff';
    labelsContainer.style.borderRadius = '3px';
    labelsContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
    labelsContainer.style.padding = '8px 12px';
    labelsContainer.style.display = 'flex'; // Always visible so users can toggle business labels
    labelsContainer.style.alignItems = 'center';
    labelsContainer.style.gap = '6px';
    labelsContainer.style.cursor = 'pointer';
    labelsContainer.style.fontSize = '14px';
    labelsContainer.style.fontFamily = 'Roboto,Arial,sans-serif';

    const labelsCheckbox = document.createElement('input');
    labelsCheckbox.type = 'checkbox';
    labelsCheckbox.checked = currentLabelsVisible;
    labelsCheckbox.style.cursor = 'pointer';

    const labelsLabel = document.createElement('span');
    labelsLabel.textContent = 'Labels';
    labelsLabel.style.cursor = 'pointer';
    labelsLabel.style.userSelect = 'none';

    labelsContainer.appendChild(labelsCheckbox);
    labelsContainer.appendChild(labelsLabel);

    // Add hover effects
    const addHoverEffects = (button: HTMLButtonElement) => {
      button.addEventListener('mouseenter', () => {
        if (button.style.backgroundColor !== 'rgb(26, 115, 232)') {
          button.style.backgroundColor = '#f8f9fa';
        }
      });
      button.addEventListener('mouseleave', () => {
        if (button.style.backgroundColor !== 'rgb(26, 115, 232)') {
          button.style.backgroundColor = '#fff';
        }
      });
    };

    addHoverEffects(mapButton);
    addHoverEffects(satelliteButton);

    // Update button states
    const updateButtonStates = () => {
      const currentMapType = map.getMapTypeId();

      // Update map/satellite buttons
      mapButton.style.backgroundColor = currentMapType === google.maps.MapTypeId.ROADMAP ? '#1a73e8' : '#fff';
      mapButton.style.color = currentMapType === google.maps.MapTypeId.ROADMAP ? '#fff' : 'rgb(25,25,25)';

      const isSatelliteMode = currentMapType === google.maps.MapTypeId.SATELLITE || currentMapType === google.maps.MapTypeId.HYBRID;
      satelliteButton.style.backgroundColor = isSatelliteMode ? '#1a73e8' : '#fff';
      satelliteButton.style.color = isSatelliteMode ? '#fff' : 'rgb(25,25,25)';

      // Update labels checkbox
      labelsCheckbox.checked = currentLabelsVisible;

      // Labels container visibility is managed by show/hide functions
    };

    // Store functions to show/hide labels control
    let showLabelsControlFunc: () => void;
    let hideLabelsControlFunc: () => void;

    // Button click handlers
    mapButton.addEventListener('click', () => {
      map.setMapTypeId(google.maps.MapTypeId.ROADMAP);

      // Show labels control when clicking map/satellite
      if (showLabelsControlFunc) showLabelsControlFunc();

      // Apply appropriate styles for road map
      if (currentLabelsVisible) {
        map.setOptions({ styles: createMutedPlacesStyle() });
      } else {
        map.setOptions({ styles: [...createMutedPlacesStyle(), ...createNoPlacesStyle()] });
      }

      updateButtonStates();
    });

    satelliteButton.addEventListener('click', () => {
      // Always use HYBRID for satellite (shows roads and labels)
      map.setMapTypeId(google.maps.MapTypeId.HYBRID);

      // Apply styles based on current labels setting
      if (currentLabelsVisible) {
        map.setOptions({ styles: createSatelliteMutedPlacesStyle() }); // Show labels with satellite-optimized muted places
      } else {
        map.setOptions({ styles: createNoPlacesStyle() }); // Hide places, keep road labels
      }

      // Show labels control when clicking map/satellite
      if (showLabelsControlFunc) showLabelsControlFunc();

      updateButtonStates();
    });

    // Labels checkbox handler - recreates map with different Map ID for cloud-based POI toggle
    const handleLabelsToggle = (fromCheckbox = false) => {
      let newLabelsVisible;

      if (fromCheckbox) {
        // If triggered by checkbox change, use checkbox state
        newLabelsVisible = labelsCheckbox.checked;
      } else {
        // If triggered by container click, toggle checkbox first
        labelsCheckbox.checked = !labelsCheckbox.checked;
        newLabelsVisible = labelsCheckbox.checked;
      }

      // Update map styles based on labels visibility and map type
      const currentMapType = map.getMapTypeId();

      console.log('Labels toggle:', newLabelsVisible, 'Map type:', currentMapType);

      // Use Map ID swapping for cloud-based styling (required for AdvancedMarkerElement)
      // Note: Map ID cannot be changed dynamically - must recreate map
      if (mapIdWithPoi && mapIdNoPoi) {
        const newMapId = newLabelsVisible ? mapIdWithPoi : mapIdNoPoi;
        console.log('🗺️ Recreating map with new Map ID for POI toggle:', newMapId);

        // Save current map state
        const currentCenter = map.getCenter();
        const currentZoom = map.getZoom();
        const mapContainer = map.getDiv();

        // Create new map with different Map ID
        const newMap = new google.maps.Map(mapContainer, {
          center: currentCenter,
          zoom: currentZoom,
          mapTypeId: currentMapType,
          mapId: newMapId,
          mapTypeControl: false,
          streetViewControl: true,
          streetViewControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP,
          },
          fullscreenControl: false,
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP,
          },
          rotateControl: true,
          rotateControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP,
          },
          gestureHandling: 'greedy',
        });

        // Update local variable
        currentLabelsVisible = newLabelsVisible;

        // Call the callback to update React state and trigger layer recreation
        onToggleLabels(newLabelsVisible);

        // Notify parent that map instance has changed
        // This triggers onMapLoad which will cause layers to recreate their markers
        if (onMapRecreated) {
          onMapRecreated(newMap);
        }
      } else {
        // Fallback to JSON styles if Map IDs not configured (legacy mode)
        console.log('⚠️ Map IDs not configured, using JSON styles fallback');
        if (newLabelsVisible) {
          // Show labels (including places)
          if (currentMapType === google.maps.MapTypeId.ROADMAP) {
            // For road map, use muted places style (shows all labels)
            map.setOptions({ styles: createMutedPlacesStyle() });
          } else {
            // For satellite views, use HYBRID with satellite-optimized muted places style
            map.setMapTypeId(google.maps.MapTypeId.HYBRID);
            map.setOptions({ styles: createSatelliteMutedPlacesStyle() });
          }
        } else {
          // Hide only Google Places, keep road labels
          if (currentMapType === google.maps.MapTypeId.ROADMAP) {
            // For road map, combine muted places with no places style
            map.setOptions({ styles: [...createMutedPlacesStyle(), ...createNoPlacesStyle()] });
          } else {
            // For satellite views, use HYBRID but hide places
            map.setMapTypeId(google.maps.MapTypeId.HYBRID);
            map.setOptions({ styles: createNoPlacesStyle() });
          }
        }

        // Update the local variable
        currentLabelsVisible = newLabelsVisible;

        // Call the callback to update React state
        onToggleLabels(newLabelsVisible);
      }
    };

    labelsContainer.addEventListener('click', (e) => {
      if (e.target !== labelsCheckbox) {
        handleLabelsToggle(false);
      }
    });
    labelsCheckbox.addEventListener('change', () => handleLabelsToggle(true));

    // Listen for map type changes
    map.addListener('maptypeid_changed', updateButtonStates);

    buttonContainer.appendChild(mapButton);
    buttonContainer.appendChild(satelliteButton);

    mainContainer.appendChild(buttonContainer);
    mainContainer.appendChild(labelsContainer);
    controlDiv.appendChild(mainContainer);

    // Assign the functions
    showLabelsControlFunc = () => { labelsContainer.style.display = 'flex'; };
    hideLabelsControlFunc = () => { labelsContainer.style.display = 'none'; };

    return {
      controlDiv,
      updateButtonStates: () => {
        updateButtonStates();
      },
      showLabelsControl: showLabelsControlFunc,
      hideLabelsControl: hideLabelsControlFunc,
      updateLabelsState: (visible: boolean) => {
        currentLabelsVisible = visible;
        labelsCheckbox.checked = visible;
      }
    };
  };

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
    let isMounted = true;

    const initializeMap = async () => {
      if (!mapRef.current || !isMounted) {
        return;
      }

      try {
        console.log('🗺️ Starting map initialization...');
        setIsLoading(true);
        setError(null);

        // Get user location first (only if mounted)
        console.log('📍 Getting user location...');
        const location = await getUserLocation();

        if (!isMounted) return; // Check if component is still mounted

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

        // Initialize Google Maps loader with consistent libraries
        const loader = new Loader({
          apiKey: apiKey,
          version: 'weekly',
          libraries: ['places', 'geometry']
        });

        // Load Google Maps
        console.log('🔄 Loading Google Maps API...');
        const google = await loader.load();

        if (!isMounted) return; // Check if component is still mounted

        console.log('✅ Google Maps API loaded successfully');

        // Pre-load marker library immediately after Google Maps loads
        // This ensures the library is ready before any markers are created
        // and prevents race conditions with other libraries
        try {
          await google.maps.importLibrary('marker');
          console.log('✅ Google Maps marker library pre-loaded');
        } catch (markerErr) {
          console.warn('⚠️ Failed to pre-load marker library:', markerErr);
        }

        // Verify DOM element exists before creating map
        if (!mapRef.current) {
          throw new Error('Map container element not found');
        }

        console.log('✅ Creating map instance...');

        // Get Map ID from environment (required for AdvancedMarkerElement)
        const mapId = import.meta.env.VITE_GOOGLE_MAP_ID;
        if (mapId) {
          console.log('🗺️ Using Map ID for AdvancedMarkerElement support');
        } else {
          console.warn('⚠️ VITE_GOOGLE_MAP_ID not set - AdvancedMarkerElement will not work. Falling back to legacy markers.');
        }

        // Create map instance
        // Note: When mapId is set (for AdvancedMarkerElement), styles must NOT be used
        // Cloud-based styling via mapId and JSON styles are mutually exclusive
        const mapOptions: google.maps.MapOptions = {
          center: mapCenter,
          zoom: location ? 12 : 10,
          mapTypeId: google.maps.MapTypeId.ROADMAP,
          mapTypeControl: false, // Disable default map type control
          streetViewControl: true,
          streetViewControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP,
          },
          fullscreenControl: false, // Disabled - GPS controls use this space
          zoomControl: true,
          zoomControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP,
          },
          rotateControl: true,
          rotateControlOptions: {
            position: google.maps.ControlPosition.LEFT_TOP,
          },
          gestureHandling: 'greedy',
        };

        // Only use mapId OR styles, not both (Google Maps API requirement)
        if (mapId) {
          mapOptions.mapId = mapId; // Required for AdvancedMarkerElement, uses cloud-based styling
        } else {
          // Fallback to JSON styles when no mapId (legacy mode without AdvancedMarkerElement)
          mapOptions.styles = labelsVisible ? createMutedPlacesStyle() : [...createMutedPlacesStyle(), ...createNoPlacesStyle()];
        }

        const map = new google.maps.Map(mapRef.current, mapOptions);

        // Add a marker at the center location
        // Use large purple pin for static user location - distinct from:
        // - Green pins (verified properties)
        // - Red pins (recent properties)
        // - Blue dot (live GPS tracking)
        const marker = new (google.maps as any).Marker({
          position: mapCenter,
          map: map,
          title: location ? 'Your Initial Location' : 'Atlanta, GA',
          icon: location
            ? createModernPinIcon(MarkerColors.USER_LOCATION, 40)  // Large purple pin for user location
            : createModernPinIcon(MarkerColors.DEFAULT, 28)        // Gray pin for default Atlanta
        });

        // Add info window
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="margin: 0 0 4px 0; font-size: 14px; color: #1f2937;">
                ${location ? '📍 Your Initial Location' : '🏙️ Atlanta, GA'}
              </h3>
              <p style="margin: 0; font-size: 12px; color: #6b7280;">
                ${location ? 'Starting position when map loaded' : 'Default map center'}
              </p>
              ${location ? '<p style="margin: 4px 0 0 0; font-size: 11px; color: #8B5CF6; font-weight: 500;">💡 Use GPS button to track live location</p>' : ''}
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

        if (!isMounted) return; // Final check before setting state

        // Store map instance
        mapInstanceRef.current = map;

        // Callback for when map is recreated (due to Map ID swap for labels toggle)
        const handleMapRecreated = (newMap: google.maps.Map) => {
          console.log('🔄 Map recreated with new Map ID, updating references...');
          mapInstanceRef.current = newMap;

          // Re-add the map type control to the new map
          const newMapTypeControl = createCustomMapTypeControl(newMap, setLabelsVisible, handleMapRecreated, controlsTopOffset);
          labelsControlRef.current = newMapTypeControl;
          newMap.controls[google.maps.ControlPosition.TOP_LEFT].push(newMapTypeControl.controlDiv);

          // Notify parent component so layers can update
          if (onMapLoad) {
            onMapLoad(newMap);
          }
        };

        // Add custom map type control with labels toggle
        const mapTypeControl = createCustomMapTypeControl(map, setLabelsVisible, handleMapRecreated, controlsTopOffset);
        labelsControlRef.current = mapTypeControl;
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(mapTypeControl.controlDiv);

        // If there's a top offset (e.g., for search box), add a spacer for native controls at LEFT_TOP
        if (controlsTopOffset > 0) {
          const nativeControlSpacer = document.createElement('div');
          nativeControlSpacer.style.height = `${controlsTopOffset}px`;
          nativeControlSpacer.style.width = '1px';
          map.controls[google.maps.ControlPosition.LEFT_TOP].insertAt(0, nativeControlSpacer);
        }

        // Note: GPS controls are now handled by React component in top-right corner
        // Keeping Google Maps control creation for reference but not adding to map
        console.log('✅ GPS tracking controls handled by React component');

        // Labels toggle is always visible - no hide on map click

        // Handle map type changes to apply correct styles
        map.addListener('maptypeid_changed', () => {
          const currentMapType = map.getMapTypeId();
          console.log('Map type changed to:', currentMapType);

          if (currentMapType === google.maps.MapTypeId.SATELLITE || currentMapType === google.maps.MapTypeId.HYBRID) {
            // For satellite/hybrid, no custom styles needed (Google handles everything)
            map.setOptions({ styles: [] });
          } else {
            // For road map, use muted places styles
            if (labelsVisible) {
              map.setOptions({ styles: createMutedPlacesStyle() });
            } else {
              map.setOptions({ styles: [...createMutedPlacesStyle(), ...createNoPlacesStyle()] });
            }
          }
        });

        // Create center on location function
        const centerOnLocation = () => {
          if (userLocation && mapInstanceRef.current) {
            mapInstanceRef.current.panTo(userLocation);
            mapInstanceRef.current.setZoom(15);
          } else {
            // Request location if we don't have it
            getUserLocation().then((location) => {
              if (location && mapInstanceRef.current) {
                setUserLocation(location);
                mapInstanceRef.current.panTo(location);
                mapInstanceRef.current.setZoom(15);
              }
            });
          }
        };

        // Call callbacks if provided
        if (onMapLoad) {
          onMapLoad(map);
        }
        if (onCenterOnLocationReady) {
          onCenterOnLocationReady(centerOnLocation);
        }

        console.log('✅ Google Maps initialized successfully');
        setIsLoading(false);

      } catch (error) {
        if (!isMounted) return;
        console.error('❌ Error initializing Google Maps:', error);
        setError(error instanceof Error ? error.message : 'Failed to load map');
        setIsLoading(false);
      }
    };

    // Initialize map immediately if ref is available
    if (mapRef.current) {
      initializeMap();
    }

    return () => {
      isMounted = false;
    };
  }, []);

  // Update button states when labels visibility changes
  useEffect(() => {
    if (labelsControlRef.current) {
      labelsControlRef.current.updateLabelsState(labelsVisible);
      labelsControlRef.current.updateButtonStates();
    }
  }, [labelsVisible]);

  // GPS controls are now handled by React component - no need to update Google Maps controls

  // Update GPS marker and accuracy circle when position changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !gpsPosition) return;

    console.log('📍 Updating GPS marker:', gpsPosition);

    const position = { lat: gpsPosition.lat, lng: gpsPosition.lng };

    // Create or update GPS marker
    if (!gpsMarkerRef.current) {
      // Create new marker with Google blue dot style
      gpsMarkerRef.current = new google.maps.Marker({
        position,
        map,
        icon: createGoogleBlueDotIcon(24),
        title: 'Your Location (Live GPS)',
        zIndex: 1000, // High z-index to appear on top
        optimized: false // Better for animation/updates
      });

      // Add info window for GPS marker
      const infoWindow = new google.maps.InfoWindow({
        content: `
          <div style="padding: 8px;">
            <h3 style="margin: 0 0 4px 0; font-size: 14px; color: #1f2937;">
              📡 Live GPS Tracking
            </h3>
            <p style="margin: 0; font-size: 12px; color: #6b7280;">
              Accuracy: ±${gpsPosition.accuracy.toFixed(0)}m
            </p>
            ${gpsPosition.speed ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af;">Speed: ${(gpsPosition.speed * 3.6).toFixed(1)} km/h</p>` : ''}
            ${gpsPosition.heading ? `<p style="margin: 4px 0 0 0; font-size: 11px; color: #9ca3af;">Heading: ${gpsPosition.heading.toFixed(0)}°</p>` : ''}
          </div>
        `
      });

      gpsMarkerRef.current.addListener('click', () => {
        infoWindow.open(map, gpsMarkerRef.current);
      });

      console.log('✅ GPS marker created');
    } else {
      // Update existing marker position
      gpsMarkerRef.current.setPosition(position);
    }

    // Create or update accuracy circle
    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new google.maps.Circle(
        createAccuracyCircleOptions(position, gpsPosition.accuracy)
      );
      accuracyCircleRef.current.setMap(map);
      console.log('✅ Accuracy circle created');
    } else {
      accuracyCircleRef.current.setCenter(position);
      accuracyCircleRef.current.setRadius(gpsPosition.accuracy);
    }

    // Auto-center map on GPS location if enabled
    if (autoCenterEnabled && isTracking) {
      console.log('🎯 Auto-centering map on GPS location');
      map.panTo(position);
      // Optionally adjust zoom if accuracy is poor
      if (gpsPosition.accuracy > 100 && map.getZoom() && map.getZoom()! > 15) {
        map.setZoom(15);
      }
    }
  }, [gpsPosition, autoCenterEnabled, isTracking]);

  // Clean up GPS marker when tracking stops
  useEffect(() => {
    if (!isTracking && gpsMarkerRef.current) {
      console.log('🧹 Removing GPS marker and accuracy circle');
      gpsMarkerRef.current.setMap(null);
      gpsMarkerRef.current = null;

      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setMap(null);
        accuracyCircleRef.current = null;
      }
    }
  }, [isTracking]);

  // Log GPS errors
  useEffect(() => {
    if (gpsError) {
      console.error('🚨 GPS Error:', gpsError.message);
      // Could show a toast notification here
    }
  }, [gpsError]);

  // Ruler tool functionality
  const clearRulerTool = useCallback(() => {
    rulerMarkersRef.current.forEach(marker => marker.setMap(null));
    rulerMarkersRef.current = [];
    rulerLinesRef.current.forEach(line => line.setMap(null));
    rulerLinesRef.current = [];
    rulerLabelsRef.current.forEach(label => label.setMap(null));
    rulerLabelsRef.current = [];
    rulerDrivingDataRef.current.clear();

    // Clear preview elements
    if (rulerPreviewLineRef.current) {
      rulerPreviewLineRef.current.setMap(null);
      rulerPreviewLineRef.current = null;
    }
    if (rulerPreviewLabelRef.current) {
      rulerPreviewLabelRef.current.setMap(null);
      rulerPreviewLabelRef.current = null;
    }

    // Close custom info box
    setCustomInfoBox(null);
  }, []);

  const toggleRulerTool = useCallback(() => {
    if (rulerActive) {
      setRulerActive(false);
      clearRulerTool();
      if (rulerClickListenerRef.current) {
        google.maps.event.removeListener(rulerClickListenerRef.current);
        rulerClickListenerRef.current = null;
      }
      if (rulerMoveListenerRef.current) {
        google.maps.event.removeListener(rulerMoveListenerRef.current);
        rulerMoveListenerRef.current = null;
      }
    } else {
      setRulerActive(true);
    }
  }, [rulerActive, clearRulerTool]);

  // Helper function to convert lat/lng to pixel coordinates
  const latLngToPixel = useCallback((latLng: { lat: number; lng: number }): { x: number; y: number } => {
    const map = mapInstanceRef.current;
    const mapDiv = mapRef.current;
    if (!map || !mapDiv) {
      return { x: 0, y: 0 };
    }

    const projection = map.getProjection();
    const bounds = map.getBounds();

    if (!projection || !bounds) {
      return { x: 0, y: 0 };
    }

    const scale = Math.pow(2, map.getZoom() || 0);
    const worldCoordinate = projection.fromLatLngToPoint(new google.maps.LatLng(latLng.lat, latLng.lng));
    const pixelCoordinate = new google.maps.Point(
      worldCoordinate!.x * scale,
      worldCoordinate!.y * scale
    );

    const topRight = projection.fromLatLngToPoint(bounds.getNorthEast());
    const bottomLeft = projection.fromLatLngToPoint(bounds.getSouthWest());
    const pixelOrigin = new google.maps.Point(
      bottomLeft!.x * scale,
      topRight!.y * scale
    );

    return {
      x: pixelCoordinate.x - pixelOrigin.x,
      y: pixelCoordinate.y - pixelOrigin.y
    };
  }, []);

  // Helper function to show custom info box
  const showCustomInfoBox = useCallback((
    latLng: { lat: number; lng: number },
    straightDistance: StraightLineDistance,
    drivingDistance: DrivingDistanceResult | null
  ) => {
    const pixelPosition = latLngToPixel(latLng);
    setCustomInfoBox({
      visible: true,
      position: pixelPosition,
      straightDistance,
      drivingDistance,
      latLng
    });
  }, [latLngToPixel]);

  // Update info box position when map moves or zooms
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !customInfoBox?.visible) return;

    const updatePosition = () => {
      if (customInfoBox?.latLng) {
        const newPixelPosition = latLngToPixel(customInfoBox.latLng);
        setCustomInfoBox(prev => prev ? { ...prev, position: newPixelPosition } : null);
      }
    };

    const boundsListener = map.addListener('bounds_changed', updatePosition);
    const zoomListener = map.addListener('zoom_changed', updatePosition);

    return () => {
      google.maps.event.removeListener(boundsListener);
      google.maps.event.removeListener(zoomListener);
    };
  }, [customInfoBox?.visible, customInfoBox?.latLng, latLngToPixel]);

  // Helper function to generate info window content
  const generateInfoWindowContent = useCallback((straightDist: any, driving: DrivingDistanceResult | null, segmentNum: number, timeOfDay?: 'now' | 'morning' | 'evening' | 'weekend') => {
    const timeLabel = getTimeLabel(timeOfDay || 'now');

    let content = `
      <div style="padding: 0; font-family: Roboto, Arial, sans-serif; min-width: 220px; margin-top: -8px;">
        <h3 style="margin: 0 0 6px 0; padding: 0 10px; font-size: 13px; font-weight: 600; color: #202124; line-height: 1;">Distance Details</h3>
        <div style="border-top: 1px solid #e0e0e0; padding: 6px 10px 10px 10px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #5f6368; font-size: 12px;">As crow flies:</span>
            <strong style="color: #202124; font-size: 12px;">${formatDistance(straightDist)}</strong>
          </div>
    `;

    if (driving) {
      content += `
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #5f6368; font-size: 12px;">Driving distance:</span>
            <strong style="color: #1a73e8; font-size: 12px;">${driving.distance.text}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 6px;">
            <span style="color: #5f6368; font-size: 12px;">Travel time (${timeLabel}):</span>
            <strong style="color: ${driving.durationInTraffic && driving.durationInTraffic.value > driving.duration.value ? '#ea4335' : '#202124'}; font-size: 12px;">${driving.durationInTraffic ? driving.durationInTraffic.text : driving.duration.text}</strong>
          </div>
          <div style="border-top: 1px solid #e0e0e0; padding-top: 6px; margin-top: 2px;">
            <div style="font-size: 10px; color: #5f6368; margin-bottom: 4px;">Check traffic at:</div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3px;">
              <button onclick="window.updateRulerTime('now')" style="padding: 3px 6px; font-size: 10px; border: 1px solid #dadce0; border-radius: 3px; background: ${timeLabel === 'Now' ? '#e8f0fe' : '#fff'}; cursor: pointer; color: #202124;">Now</button>
              <button onclick="window.updateRulerTime('morning')" style="padding: 3px 6px; font-size: 10px; border: 1px solid #dadce0; border-radius: 3px; background: ${timeLabel === 'Morning' ? '#e8f0fe' : '#fff'}; cursor: pointer; color: #202124;">Morning (8 AM)</button>
              <button onclick="window.updateRulerTime('evening')" style="padding: 3px 6px; font-size: 10px; border: 1px solid #dadce0; border-radius: 3px; background: ${timeLabel === 'Evening' ? '#e8f0fe' : '#fff'}; cursor: pointer; color: #202124;">Evening (5 PM)</button>
              <button onclick="window.updateRulerTime('weekend')" style="padding: 3px 6px; font-size: 10px; border: 1px solid #dadce0; border-radius: 3px; background: ${timeLabel === 'Weekend' ? '#e8f0fe' : '#fff'}; cursor: pointer; color: #202124;">Weekend</button>
            </div>
          </div>
      `;
    } else {
      content += `
          <div style="color: #5f6368; font-size: 12px; font-style: italic;">Loading driving data...</div>
      `;
    }

    content += `
        </div>
      </div>
    `;

    return content;
  }, []);

  // Handle time-of-day changes for custom info box
  const handleTimeChange = useCallback((timeOfDay: 'now' | 'morning' | 'evening' | 'weekend') => {
    console.log('⏰ Updating ruler time to:', timeOfDay);
    setSelectedTimeOfDay(timeOfDay);

    // Recalculate driving distance with new time
    const markers = rulerMarkersRef.current;
    const lines = rulerLinesRef.current;
    const drivingData = rulerDrivingDataRef.current;

    if (markers.length === 2 && lines.length > 0) {
      const pos0 = markers[0].getPosition();
      const pos1 = markers[1].getPosition();

      if (pos0 && pos1) {
        const from = { lat: pos0.lat(), lng: pos0.lng() };
        const to = { lat: pos1.lat(), lng: pos1.lng() };
        const departureTime = getDepartureTime(timeOfDay);

        console.log('🚗 Recalculating driving distance for time:', timeOfDay, 'at:', departureTime);

        // Recalculate with new departure time
        calculateDrivingDistance(from, to, departureTime)
          .then(result => {
            console.log('✅ Updated driving distance result:', result);
            drivingData.set(lines[0], result);

            // Update custom info box if it's open
            if (customInfoBox?.visible) {
              const straightDist = calculateStraightLineDistance(from, to);
              setCustomInfoBox(prev => prev ? {
                ...prev,
                straightDistance: straightDist,
                drivingDistance: result
              } : null);
            }
          })
          .catch(err => {
            console.error('❌ Error fetching driving distance:', err);
            drivingData.set(lines[0], null);

            // Update custom info box to show error state
            if (customInfoBox?.visible) {
              const straightDist = calculateStraightLineDistance(from, to);
              setCustomInfoBox(prev => prev ? {
                ...prev,
                straightDistance: straightDist,
                drivingDistance: null
              } : null);
            }
          });
      }
    }
  }, [customInfoBox?.visible]);

  // Ruler tool click handler
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !rulerActive) return;

    // Add escape key listener to finish measurement
    const handleEscapeKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && rulerActive) {
        // Clear preview but keep existing measurements
        if (rulerPreviewLineRef.current) {
          rulerPreviewLineRef.current.setMap(null);
          rulerPreviewLineRef.current = null;
        }
        if (rulerPreviewLabelRef.current) {
          rulerPreviewLabelRef.current.setMap(null);
          rulerPreviewLabelRef.current = null;
        }
      }
    };
    document.addEventListener('keydown', handleEscapeKey);

    // Add mouse move listener for live preview
    const moveListener = map.addListener('mousemove', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;

      const markers = rulerMarkersRef.current;

      // Only show preview if we have exactly one marker (waiting for second point)
      if (markers.length !== 1) return;

      const lastMarker = markers[0];
      const prevPosition = lastMarker.getPosition();
      if (!prevPosition) return;

      const currentPosition = event.latLng;

      // Calculate distance for preview
      const from = { lat: prevPosition.lat(), lng: prevPosition.lng() };
      const to = { lat: currentPosition.lat(), lng: currentPosition.lng() };
      const straightDist = calculateStraightLineDistance(from, to);
      const distanceText = formatDistance(straightDist);

      // Update or create preview line
      if (!rulerPreviewLineRef.current) {
        rulerPreviewLineRef.current = new google.maps.Polyline({
          path: [prevPosition, currentPosition],
          strokeColor: '#4285F4',
          strokeOpacity: 0.5, // More transparent for preview
          strokeWeight: 3,
          geodesic: true,
          map,
          clickable: false,
          zIndex: 998, // Below permanent lines
        });
      } else {
        rulerPreviewLineRef.current.setPath([prevPosition, currentPosition]);
      }

      // Update or create preview label
      if (!rulerPreviewLabelRef.current) {
        const labelDiv = document.createElement('div');
        labelDiv.style.background = 'rgba(66, 133, 244, 0.9)'; // Blue background for preview
        labelDiv.style.color = '#fff';
        labelDiv.style.padding = '4px 8px';
        labelDiv.style.borderRadius = '4px';
        labelDiv.style.fontSize = '12px';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.fontFamily = 'Roboto, Arial, sans-serif';
        labelDiv.style.whiteSpace = 'nowrap';
        labelDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        labelDiv.textContent = distanceText;

        // Store the current cursor position that will be updated
        let currentPreviewPosition = currentPosition;

        const labelOverlay = new google.maps.OverlayView();
        labelOverlay.onAdd = function() {
          const panes = this.getPanes();
          if (panes) {
            panes.overlayLayer.appendChild(labelDiv);
          }
        };
        labelOverlay.draw = function() {
          const projection = this.getProjection();
          if (projection && currentPreviewPosition) {
            const point = projection.fromLatLngToDivPixel(currentPreviewPosition);
            if (point) {
              labelDiv.style.position = 'absolute';
              labelDiv.style.left = point.x + 'px';
              labelDiv.style.top = (point.y + 15) + 'px';
              labelDiv.style.transform = 'translateX(-50%)';
            }
          }
        };
        labelOverlay.onRemove = function() {
          if (labelDiv.parentNode) {
            labelDiv.parentNode.removeChild(labelDiv);
          }
        };

        // Store position updater function
        (labelOverlay as any).updatePosition = (newPos: google.maps.LatLng) => {
          currentPreviewPosition = newPos;
        };

        labelOverlay.setMap(map);
        rulerPreviewLabelRef.current = labelOverlay;

        // Store reference to div for updates
        (labelOverlay as any)._labelDiv = labelDiv;
      } else {
        // Update existing preview label with new position and text
        const labelDiv = (rulerPreviewLabelRef.current as any)._labelDiv;
        if (labelDiv) {
          labelDiv.textContent = distanceText;
          // Update position to follow cursor
          if ((rulerPreviewLabelRef.current as any).updatePosition) {
            (rulerPreviewLabelRef.current as any).updatePosition(currentPosition);
          }
          rulerPreviewLabelRef.current.draw();
        }
      }
    });

    rulerMoveListenerRef.current = moveListener;

    const clickListener = map.addListener('click', async (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;

      const position = event.latLng;
      const markers = rulerMarkersRef.current;
      const lines = rulerLinesRef.current;
      const drivingData = rulerDrivingDataRef.current;

      // Clear preview elements when clicking to set a point
      if (rulerPreviewLineRef.current) {
        rulerPreviewLineRef.current.setMap(null);
        rulerPreviewLineRef.current = null;
      }
      if (rulerPreviewLabelRef.current) {
        rulerPreviewLabelRef.current.setMap(null);
        rulerPreviewLabelRef.current = null;
      }

      // If we already have 2 markers, clear everything and start fresh
      if (markers.length >= 2) {
        clearRulerTool();
      }

      const marker = new google.maps.Marker({
        position,
        map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6,
          fillColor: '#fff',
          fillOpacity: 1,
          strokeColor: '#000',
          strokeWeight: 2,
        },
        clickable: true,
        draggable: true, // Make markers draggable
        title: 'Drag to move, click to remove',
      });

      markers.push(marker);

      // Add drag listener to update line and label when ANY marker is dragged
      // The label should follow the cursor (the marker being dragged)
      marker.addListener('drag', () => {
        if (markers.length === 2) {
          const pos0 = markers[0].getPosition();
          const pos1 = markers[1].getPosition();

          if (pos0 && pos1) {
            // Update the line in real-time
            if (lines.length > 0) {
              lines[0].setPath([pos0, pos1]);
            }

            // Calculate and update distance in real-time
            const from = { lat: pos0.lat(), lng: pos0.lng() };
            const to = { lat: pos1.lat(), lng: pos1.lng() };
            const straightDist = calculateStraightLineDistance(from, to);
            const distanceText = formatDistance(straightDist);

            // Update label text and position to follow the marker being dragged
            if (rulerLabelsRef.current.length > 0) {
              const labelOverlay = rulerLabelsRef.current[0];
              const labelDiv = (labelOverlay as any)._labelDiv;
              if (labelDiv) {
                labelDiv.textContent = distanceText;

                // Position label at the cursor (the marker being dragged)
                const draggedMarkerPos = marker.getPosition();
                if (draggedMarkerPos && (labelOverlay as any).updatePosition) {
                  (labelOverlay as any).updatePosition(draggedMarkerPos);
                  labelOverlay.draw();
                }
              }
            }

            // Update custom info box in real-time if it's open (straight-line distance only)
            if (customInfoBoxRef.current?.visible) {
              const midLat = (from.lat + to.lat) / 2;
              const midLng = (from.lng + to.lng) / 2;
              const newLatLng = { lat: midLat, lng: midLng };
              const newPixelPosition = latLngToPixel(newLatLng);

              // Update with new straight-line distance, keep existing driving data
              setCustomInfoBox(prev => prev ? {
                ...prev,
                position: newPixelPosition,
                straightDistance: straightDist,
                latLng: newLatLng
              } : null);
            }
          }
        }
      });

      // When drag ends, move label back to endpoint and recalculate driving distance
      marker.addListener('dragend', () => {
        if (markers.length === 2) {
          const pos0 = markers[0].getPosition();
          const pos1 = markers[1].getPosition();

          if (pos0 && pos1 && lines.length > 0) {
            const from = { lat: pos0.lat(), lng: pos0.lng() };
            const to = { lat: pos1.lat(), lng: pos1.lng() };

            // Move label back to endpoint (second marker) after drag ends
            if (rulerLabelsRef.current.length > 0) {
              const labelOverlay = rulerLabelsRef.current[0];
              if ((labelOverlay as any).updatePosition) {
                (labelOverlay as any).updatePosition(pos1);
                labelOverlay.draw();
              }
            }

            // Recalculate driving distance with current time selection
            console.log('🚗 Recalculating driving distance after drag');
            const departureTime = getDepartureTime(selectedTimeOfDay);
            calculateDrivingDistance(from, to, departureTime)
              .then(result => {
                console.log('✅ Driving distance result (after drag):', result);
                drivingData.set(lines[0], result);

                // Update custom info box if it's open
                if (customInfoBoxRef.current?.visible) {
                  const straightDist = calculateStraightLineDistance(from, to);
                  const midLat = (from.lat + to.lat) / 2;
                  const midLng = (from.lng + to.lng) / 2;
                  const newLatLng = { lat: midLat, lng: midLng };
                  const newPixelPosition = latLngToPixel(newLatLng);

                  setCustomInfoBox({
                    visible: true,
                    position: newPixelPosition,
                    straightDistance: straightDist,
                    drivingDistance: result,
                    latLng: newLatLng
                  });
                }
              })
              .catch(err => {
                console.error('❌ Error fetching driving distance:', err);
                drivingData.set(lines[0], null);

                // Update custom info box to show error state
                if (customInfoBoxRef.current?.visible) {
                  const straightDist = calculateStraightLineDistance(from, to);
                  const midLat = (from.lat + to.lat) / 2;
                  const midLng = (from.lng + to.lng) / 2;
                  const newLatLng = { lat: midLat, lng: midLng };
                  const newPixelPosition = latLngToPixel(newLatLng);

                  setCustomInfoBox({
                    visible: true,
                    position: newPixelPosition,
                    straightDistance: straightDist,
                    drivingDistance: null,
                    latLng: newLatLng
                  });
                }
              });
          }
        }
      });

      if (markers.length === 2) {
        const prevPosition = markers[markers.length - 2].getPosition();
        if (prevPosition) {
          const from = { lat: prevPosition.lat(), lng: prevPosition.lng() };
          const to = { lat: position.lat(), lng: position.lng() };
          const straightDist = calculateStraightLineDistance(from, to);

          // Create clickable line
          const line = new google.maps.Polyline({
            path: [prevPosition, position],
            strokeColor: '#4285F4',
            strokeOpacity: 0.8,
            strokeWeight: 4,
            geodesic: true,
            map,
            clickable: true, // Make line clickable
          });
          lines.push(line);

          // Create distance label at endpoint (destination)
          const distanceText = formatDistance(straightDist);

          // Create a custom marker with background box like Google Maps
          const labelDiv = document.createElement('div');
          labelDiv.style.background = 'rgba(50, 50, 50, 0.9)';
          labelDiv.style.color = '#fff';
          labelDiv.style.padding = '4px 8px';
          labelDiv.style.borderRadius = '4px';
          labelDiv.style.fontSize = '12px';
          labelDiv.style.fontWeight = 'bold';
          labelDiv.style.fontFamily = 'Roboto, Arial, sans-serif';
          labelDiv.style.whiteSpace = 'nowrap';
          labelDiv.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
          labelDiv.textContent = distanceText;

          const labelOverlay = new google.maps.OverlayView();

          // Store the current position reference that will be updated
          let currentLabelPosition = position;

          labelOverlay.onAdd = function() {
            const panes = this.getPanes();
            if (panes) {
              panes.overlayLayer.appendChild(labelDiv);
            }
          };
          labelOverlay.draw = function() {
            const projection = this.getProjection();
            if (projection && currentLabelPosition) {
              const point = projection.fromLatLngToDivPixel(currentLabelPosition);
              if (point) {
                labelDiv.style.position = 'absolute';
                labelDiv.style.left = point.x + 'px';
                labelDiv.style.top = (point.y + 15) + 'px'; // Offset below the point so line doesn't cover it
                labelDiv.style.transform = 'translateX(-50%)'; // Center horizontally
              }
            }
          };
          labelOverlay.onRemove = function() {
            if (labelDiv.parentNode) {
              labelDiv.parentNode.removeChild(labelDiv);
            }
          };

          // Store position updater function
          (labelOverlay as any).updatePosition = (newPos: google.maps.LatLng) => {
            currentLabelPosition = newPos;
          };

          labelOverlay.setMap(map);

          // Store the overlay and div reference for cleanup
          (labelOverlay as any)._labelDiv = labelDiv;
          rulerLabelsRef.current.push(labelOverlay as any);

          // Store null initially, will be updated when driving data loads
          drivingData.set(line, null);

          // Fetch driving distance asynchronously with current time selection
          console.log('🚗 Fetching driving distance from', from, 'to', to);
          const departureTime = getDepartureTime(selectedTimeOfDay);
          calculateDrivingDistance(from, to, departureTime)
            .then(result => {
              console.log('✅ Driving distance result:', result);
              drivingData.set(line, result);
            })
            .catch(err => {
              console.error('❌ Error fetching driving distance:', err);
              // Store error state so UI knows it failed
              drivingData.set(line, null);
            });

          // Add click listener to line to show custom info box
          line.addListener('click', (lineEvent: google.maps.PolyIconEvent) => {
            // Calculate midpoint for info box position
            const midLat = (prevPosition.lat() + position.lat()) / 2;
            const midLng = (prevPosition.lng() + position.lng()) / 2;

            const driving = drivingData.get(line);

            // Show custom info box
            showCustomInfoBox(
              { lat: midLat, lng: midLng },
              straightDist,
              driving
            );
          });
        }
      }

      // Add click listener to marker to remove it
      marker.addListener('click', () => {
        const index = markers.indexOf(marker);
        if (index === -1) return;

        marker.setMap(null);
        markers.splice(index, 1);

        const labels = rulerLabelsRef.current;

        // Remove connected lines and labels
        if (index > 0 && lines[index - 1]) {
          const line = lines[index - 1];
          drivingData.delete(line);
          line.setMap(null);
          lines.splice(index - 1, 1);

          // Remove associated label
          if (labels[index - 1]) {
            labels[index - 1].setMap(null);
            labels.splice(index - 1, 1);
          }
        }
        if (index < lines.length && lines[index]) {
          const line = lines[index];
          drivingData.delete(line);
          line.setMap(null);
          lines.splice(index, 1);

          // Remove associated label
          if (labels[index]) {
            labels[index].setMap(null);
            labels.splice(index, 1);
          }
        }
      });
    });

    rulerClickListenerRef.current = clickListener;
    return () => {
      document.removeEventListener('keydown', handleEscapeKey);
      google.maps.event.removeListener(clickListener);
      if (rulerMoveListenerRef.current) {
        google.maps.event.removeListener(rulerMoveListenerRef.current);
      }
    };
  }, [rulerActive, selectedTimeOfDay, clearRulerTool, showCustomInfoBox, latLngToPixel]);

  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.style.cursor = rulerActive ? 'crosshair' : '';
    }
  }, [rulerActive]);

  useEffect(() => {
    return () => clearRulerTool();
  }, [clearRulerTool]);

  // Handle onMapLoad callback changes without re-initializing the map
  useEffect(() => {
    if (mapInstanceRef.current && onMapLoad) {
      onMapLoad(mapInstanceRef.current);
    }
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

      {/* React-based GPS controls - Fallback if map controls don't work */}
      {!isLoading && mapInstanceRef.current && (
        <GPSControls
          isTracking={isTracking}
          autoCenterEnabled={autoCenterEnabled}
          onToggleTracking={toggleTracking}
          onToggleAutoCenter={() => setAutoCenterEnabled(prev => !prev)}
          rulerActive={rulerActive}
          onToggleRuler={toggleRulerTool}
          topOffset={controlsTopOffset}
        />
      )}

      {/* Custom distance info box */}
      {customInfoBox?.visible && (
        <DistanceInfoBox
          position={customInfoBox.position}
          straightDistance={customInfoBox.straightDistance}
          drivingDistance={customInfoBox.drivingDistance}
          selectedTime={selectedTimeOfDay}
          onTimeChange={handleTimeChange}
          onClose={() => setCustomInfoBox(null)}
        />
      )}
    </div>
  );
};

export default GoogleMapContainer;