import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Loader } from '@googlemaps/js-api-loader';
import { createModernPinIcon, createModernMarkerIcon, MarkerColors, createMutedPlacesStyle, createSatelliteMutedPlacesStyle, createGoogleBlueDotIcon, createAccuracyCircleOptions } from './utils/modernMarkers';
import { useGPSTracking } from '../../hooks/useGPSTracking';
import { GPSControls } from './GPSTrackingButton';
import { RulerTool } from './RulerTool';
import { calculateStraightLineDistance, formatDistance } from '../../services/distanceService';

interface GoogleMapContainerProps {
  height?: string;
  width?: string;
  className?: string;
  onMapLoad?: (map: google.maps.Map) => void;
  onCenterOnLocationReady?: (centerFunction: () => void) => void;
}

const GoogleMapContainer: React.FC<GoogleMapContainerProps> = ({
  height = '400px',
  width = '100%',
  className = '',
  onMapLoad,
  onCenterOnLocationReady
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
  const rulerMarkersRef = useRef<google.maps.Marker[]>([]);
  const rulerLinesRef = useRef<google.maps.Polyline[]>([]);
  const rulerLabelsRef = useRef<google.maps.Marker[]>([]);
  const rulerClickListenerRef = useRef<google.maps.MapsEventListener | null>(null);

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
  const createCustomMapTypeControl = (map: google.maps.Map, onToggleLabels: (newValue: boolean) => void) => {
    let currentLabelsVisible = labelsVisible;
    const controlDiv = document.createElement('div');
    controlDiv.style.margin = '10px';

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

    // Labels checkbox container
    const labelsContainer = document.createElement('div');
    labelsContainer.style.backgroundColor = '#fff';
    labelsContainer.style.borderRadius = '3px';
    labelsContainer.style.boxShadow = '0 2px 6px rgba(0,0,0,.3)';
    labelsContainer.style.padding = '8px 12px';
    labelsContainer.style.display = 'none'; // Initially hidden
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

    // Labels checkbox handler
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

        // Verify DOM element exists before creating map
        if (!mapRef.current) {
          throw new Error('Map container element not found');
        }

        console.log('✅ Creating map instance...');

        // Create map instance with muted places styling
        const map = new google.maps.Map(mapRef.current, {
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
          styles: labelsVisible ? createMutedPlacesStyle() : [...createMutedPlacesStyle(), ...createNoLabelsStyle()] // Only apply to road map initially
        });

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

        // Add custom map type control with labels toggle
        const mapTypeControl = createCustomMapTypeControl(map, setLabelsVisible);
        labelsControlRef.current = mapTypeControl;
        map.controls[google.maps.ControlPosition.TOP_LEFT].push(mapTypeControl.controlDiv);

        // Note: GPS controls are now handled by React component in top-right corner
        // Keeping Google Maps control creation for reference but not adding to map
        console.log('✅ GPS tracking controls handled by React component');

        // Hide labels control when clicking on the map
        map.addListener('click', () => {
          if (mapTypeControl.hideLabelsControl) {
            mapTypeControl.hideLabelsControl();
          }
        });

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
              map.setOptions({ styles: [...createMutedPlacesStyle(), ...createNoLabelsStyle()] });
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
    // Remove all markers
    rulerMarkersRef.current.forEach(marker => marker.setMap(null));
    rulerMarkersRef.current = [];

    // Remove all lines
    rulerLinesRef.current.forEach(line => line.setMap(null));
    rulerLinesRef.current = [];

    // Remove all labels
    rulerLabelsRef.current.forEach(label => label.setMap(null));
    rulerLabelsRef.current = [];
  }, []);

  const toggleRulerTool = useCallback(() => {
    if (rulerActive) {
      // Deactivate ruler
      setRulerActive(false);
      clearRulerTool();

      // Remove click listener
      if (rulerClickListenerRef.current) {
        google.maps.event.removeListener(rulerClickListenerRef.current);
        rulerClickListenerRef.current = null;
      }
    } else {
      // Activate ruler
      setRulerActive(true);
    }
  }, [rulerActive, clearRulerTool]);

  // Ruler tool click handler with mobile/touch support
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !rulerActive) return;

    // Add click listener for ruler (works for both mouse and touch)
    const clickListener = map.addListener('click', (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) return;

      const position = event.latLng;
      const markers = rulerMarkersRef.current;
      const lines = rulerLinesRef.current;
      const labels = rulerLabelsRef.current;

      // Create marker for this point
      const marker = new google.maps.Marker({
        position: position,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 6, // Slightly larger for easier touch interaction
          fillColor: '#fff',
          fillOpacity: 1,
          strokeColor: '#000',
          strokeWeight: 2,
        },
        draggable: false,
        clickable: true,
      });

      markers.push(marker);

      // If this is not the first point, draw a line and label
      if (markers.length > 1) {
        const prevMarker = markers[markers.length - 2];
        const prevPosition = prevMarker.getPosition();

        if (prevPosition) {
          // Calculate distance
          const distance = calculateStraightLineDistance(
            { lat: prevPosition.lat(), lng: prevPosition.lng() },
            { lat: position.lat(), lng: position.lng() }
          );

          // Draw line
          const line = new google.maps.Polyline({
            path: [prevPosition, position],
            strokeColor: '#000',
            strokeOpacity: 0.8,
            strokeWeight: 3,
            geodesic: true,
            map: map,
            clickable: false,
          });

          lines.push(line);

          // Create label for distance (midpoint)
          const midLat = (prevPosition.lat() + position.lat()) / 2;
          const midLng = (prevPosition.lng() + position.lng()) / 2;

          const distanceText = formatDistance(distance);

          // Calculate total distance if more than 2 points
          let totalText = distanceText;
          if (markers.length > 2) {
            let totalMeters = 0;
            for (let i = 1; i < markers.length; i++) {
              const p1 = markers[i - 1].getPosition();
              const p2 = markers[i].getPosition();
              if (p1 && p2) {
                const d = calculateStraightLineDistance(
                  { lat: p1.lat(), lng: p1.lng() },
                  { lat: p2.lat(), lng: p2.lng() }
                );
                totalMeters += d.meters;
              }
            }

            const totalDistance = {
              meters: totalMeters,
              kilometers: totalMeters / 1000,
              miles: totalMeters / 1609.34,
              feet: totalMeters * 3.28084,
            };

            totalText = `${distanceText}\nTotal: ${formatDistance(totalDistance)}`;
          }

          const label = new google.maps.Marker({
            position: { lat: midLat, lng: midLng },
            map: map,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 0,
            },
            label: {
              text: totalText,
              color: '#000',
              fontSize: '13px', // Slightly larger for mobile readability
              fontWeight: 'bold',
              className: 'ruler-distance-label',
            },
            clickable: false,
            zIndex: 1000,
          });

          labels.push(label);
        }
      }

      // Add click listener to remove point (both mouse and touch)
      marker.addListener('click', () => {
        const index = markers.indexOf(marker);
        if (index === -1) return;

        // Remove this marker
        marker.setMap(null);
        markers.splice(index, 1);

        // Remove connected lines and labels
        if (index > 0 && lines[index - 1]) {
          lines[index - 1].setMap(null);
          lines.splice(index - 1, 1);

          if (labels[index - 1]) {
            labels[index - 1].setMap(null);
            labels.splice(index - 1, 1);
          }
        }

        if (index < lines.length && lines[index]) {
          lines[index].setMap(null);
          lines.splice(index, 1);

          if (labels[index]) {
            labels[index].setMap(null);
            labels.splice(index, 1);
          }
        }
      });
    });

    rulerClickListenerRef.current = clickListener;

    return () => {
      if (clickListener) {
        google.maps.event.removeListener(clickListener);
      }
    };
  }, [rulerActive]);

  // Update cursor when ruler mode changes
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.style.cursor = rulerActive ? 'crosshair' : '';
    }
  }, [rulerActive]);

  // Clean up ruler when component unmounts
  useEffect(() => {
    return () => {
      clearRulerTool();
    };
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
        />
      )}

      {/* Ruler Tool */}
      {!isLoading && mapInstanceRef.current && (
        <RulerTool
          isActive={rulerActive}
          onToggle={toggleRulerTool}
        />
      )}
    </div>
  );
};

export default GoogleMapContainer;