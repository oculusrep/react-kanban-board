import React, { useState, useEffect, useMemo } from 'react';
import GoogleMapContainer from '../components/mapping/GoogleMapContainer';
import BatchGeocodingPanel from '../components/mapping/BatchGeocodingPanel';
import BatchReverseGeocodingPanel from '../components/mapping/BatchReverseGeocodingPanel';
import PropertyLayer, { PropertyLoadingConfig } from '../components/mapping/layers/PropertyLayer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig } from '../components/mapping/layers/SiteSubmitLayer';
import { MarkerShape } from '../components/mapping/utils/advancedMarkers';
import RestaurantLayer from '../components/mapping/layers/RestaurantLayer';
import PinDetailsSlideout from '../components/mapping/slideouts/PinDetailsSlideout';
import RestaurantSlideout from '../components/mapping/slideouts/RestaurantSlideout';
import MapContextMenu from '../components/mapping/MapContextMenu';
import PropertyContextMenu from '../components/mapping/PropertyContextMenu';
import SiteSubmitContextMenu from '../components/mapping/SiteSubmitContextMenu';
import RestaurantContextMenu from '../components/mapping/RestaurantContextMenu';
import ClientSelector from '../components/mapping/ClientSelector';
import { ClientSearchResult } from '../hooks/useClientSearch';
import AddressSearchBox from '../components/mapping/AddressSearchBox';
import { LayerManagerProvider, useLayerManager } from '../components/mapping/layers/LayerManager';
import { geocodingService } from '../services/geocodingService';
import SiteSubmitFormModal from '../components/SiteSubmitFormModal';
import InlinePropertyCreationModal from '../components/mapping/InlinePropertyCreationModal';
import SiteSubmitLegend from '../components/mapping/SiteSubmitLegend';
import ContactFormModal from '../components/ContactFormModal';
import { STAGE_CATEGORIES } from '../components/mapping/SiteSubmitPin';
import { useLocation } from 'react-router-dom';
import { supportsRightClick, isTouchDevice } from '../utils/deviceDetection';
import { supabase } from '../lib/supabaseClient';
import ConfirmDialog from '../components/ConfirmDialog';
import Toast from '../components/Toast';
import { useToast } from '../hooks/useToast';
import DeleteConfirmationModal from '../components/DeleteConfirmationModal';
import { useAuth } from '../contexts/AuthContext';
import { usePermissions } from '../hooks/usePermissions';

// Inner component that uses the LayerManager context
const MappingPageContent: React.FC = () => {
  const { userRole } = useAuth();
  const { hasPermission } = usePermissions();
  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [searchAddress, setSearchAddress] = useState('');
  const [searchResult, setSearchResult] = useState<string>('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMarkers, setSearchMarkers] = useState<google.maps.Marker[]>([]);
  const [showBatchPanel, setShowBatchPanel] = useState(false);
  const [showAdminMenu, setShowAdminMenu] = useState(false);
  const [verifyingPropertyId, setVerifyingPropertyId] = useState<string | null>(null);
  const [verifyingRestaurantStoreNo, setVerifyingRestaurantStoreNo] = useState<string | null>(null);

  // Check if user can verify restaurant locations (permission-based)
  const canVerifyRestaurantLocations = hasPermission('can_verify_restaurant_locations');

  // Modal states
  const [showSiteSubmitModal, setShowSiteSubmitModal] = useState(false);
  const [showPropertyModal, setShowPropertyModal] = useState(false);
  const [pinDropCoordinates, setPinDropCoordinates] = useState<{lat: number, lng: number} | null>(null);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  // Slideout states
  const [isPinDetailsOpen, setIsPinDetailsOpen] = useState(false);
  const [selectedPinData, setSelectedPinData] = useState<any>(null);
  const [selectedPinType, setSelectedPinType] = useState<'property' | 'site_submit' | 'restaurant' | null>(null);
  const [pinDetailsInitialTab, setPinDetailsInitialTab] = useState<'property' | 'submit' | 'location' | 'files' | 'contacts' | 'submits' | undefined>(undefined);

  // Property details slideout (for "View Full Details" from site submit)
  const [isPropertyDetailsOpen, setIsPropertyDetailsOpen] = useState(false);
  const [selectedPropertyData, setSelectedPropertyData] = useState<any>(null);

  // Site submit details slideout (for viewing site submit from property)
  const [isSiteSubmitDetailsOpen, setIsSiteSubmitDetailsOpen] = useState(false);
  const [selectedSiteSubmitData, setSelectedSiteSubmitData] = useState<any>(null);
  const [submitsRefreshTrigger, setSubmitsRefreshTrigger] = useState<number>(0);

  // Contact form slideout (for editing contacts from property slideout)
  const [isContactFormOpen, setIsContactFormOpen] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactPropertyId, setContactPropertyId] = useState<string | null>(null);

  // Delete confirmation modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [siteSubmitToDelete, setSiteSubmitToDelete] = useState<{ id: string; name: string } | null>(null);

  // Center on location function
  const [centerOnLocation, setCenterOnLocation] = useState<(() => void) | null>(null);

  // Client selector state
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);

  // Site submit legend state
  const [visibleStages, setVisibleStages] = useState<Set<string>>(() => {
    // Initialize with all stages visible
    const allStages = Object.values(STAGE_CATEGORIES).flatMap(category => category.stages);
    return new Set(allStages);
  });
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [isLegendExpanded, setIsLegendExpanded] = useState(false);

  // Layer navigation panel state
  const [isLayerPanelOpen, setIsLayerPanelOpen] = useState(true);

  // Clustering configuration
  const [clusterConfig, setClusterConfig] = useState({
    minimumClusterSize: 5,
    gridSize: 60,
    maxZoom: 15
  });

  // Marker style configuration (for AdvancedMarkerElement)
  const [markerStyle, setMarkerStyle] = useState<{
    shape: MarkerShape;
    useAdvancedMarkers: boolean;
  }>({
    shape: 'teardrop',
    useAdvancedMarkers: true
  });
  // Initialize recently created IDs from sessionStorage
  const [recentlyCreatedPropertyIds, setRecentlyCreatedPropertyIds] = useState<Set<string>>(() => {
    try {
      const stored = sessionStorage.getItem('recentlyCreatedPropertyIds');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    coordinates: { lat: number; lng: number } | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    coordinates: null,
  });

  // Property context menu state
  const [propertyContextMenu, setPropertyContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    property: any | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    property: null,
  });

  // Site submit context menu state
  const [siteSubmitContextMenu, setSiteSubmitContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    siteSubmit: any | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    siteSubmit: null,
  });

  // Restaurant context menu state
  const [restaurantContextMenu, setRestaurantContextMenu] = useState<{
    isVisible: boolean;
    x: number;
    y: number;
    restaurant: any | null;
  }>({
    isVisible: false,
    x: 0,
    y: 0,
    restaurant: null,
  });

  // Site submit verification state
  const [verifyingSiteSubmitId, setVerifyingSiteSubmitId] = useState<string | null>(null);
  const [verifyingSiteSubmit, setVerifyingSiteSubmit] = useState<any>(null);

  // Flag to prevent property context menu when site submit was just clicked
  const [suppressPropertyContextMenu, setSuppressPropertyContextMenu] = useState<boolean>(false);

  // Flag to prevent map context menu when a marker was just right-clicked
  const [suppressMapContextMenu, setSuppressMapContextMenu] = useState<boolean>(false);

  // Delete property state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [propertyToDelete, setPropertyToDelete] = useState<string | null>(null);
  const { toast, showToast } = useToast();

  const location = useLocation();

  // Persist recently created IDs to sessionStorage
  useEffect(() => {
    try {
      sessionStorage.setItem('recentlyCreatedPropertyIds', JSON.stringify([...recentlyCreatedPropertyIds]));
    } catch (error) {
      console.warn('Failed to persist session pins to sessionStorage:', error);
    }
  }, [recentlyCreatedPropertyIds]);

  // Get layer state from context
  const { layerState, setLayerCount, setLayerLoading, createMode, refreshLayer, toggleLayer } = useLayerManager();

  // Check for property creation success and refresh layer
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('propertyCreated') === 'true') {
      console.log('🏢 Property creation detected, refreshing property layer');
      refreshLayer('properties');
      // Clean up the URL parameter
      const newParams = new URLSearchParams(location.search);
      newParams.delete('propertyCreated');
      const newUrl = `${location.pathname}${newParams.toString() ? '?' + newParams.toString() : ''}`;
      window.history.replaceState({}, '', newUrl);
    }
  }, [location.search, refreshLayer]);

  // Handle site submit verification from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const siteSubmitId = params.get('site-submit');
    const verifyMode = params.get('verify') === 'true';

    if (siteSubmitId && verifyMode && mapInstance) {
      console.log('📍 Site submit verification requested:', siteSubmitId);

      // Fetch the FULL site submit data (not just coordinates)
      supabase
        .from('site_submit')
        .select(`
          *,
          client!site_submit_client_id_fkey (id, client_name),
          submit_stage!site_submit_submit_stage_id_fkey (id, name),
          property_unit!site_submit_property_unit_id_fkey (id, property_unit_name),
          property!site_submit_property_id_fkey (
            id,
            property_name,
            address,
            city,
            state,
            zip,
            latitude,
            longitude,
            verified_latitude,
            verified_longitude
          )
        `)
        .eq('id', siteSubmitId)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            console.error('Failed to fetch site submit:', error);
            showToast('Site submit not found', { type: 'error' });
            return;
          }

          // Determine coordinates to use (priority: verified site submit coords > property coords)
          let lat = data.verified_latitude;
          let lng = data.verified_longitude;

          // Fallback to property coordinates if site submit doesn't have verified coords
          if (!lat || !lng) {
            lat = data.property?.verified_latitude ?? data.property?.latitude;
            lng = data.property?.verified_longitude ?? data.property?.longitude;
          }

          if (lat && lng) {
            // Zoom to the location
            mapInstance.setCenter({ lat, lng });
            mapInstance.setZoom(18);

            // Enable site submits layer if not already visible (so pin is visible)
            if (!layerState.site_submits?.isVisible) {
              console.log('🎯 Verify mode: auto-enabling site submits layer');
              toggleLayer('site_submits');
            }

            // Set verifying state so the SiteSubmitLayer creates a marker for this site submit
            setVerifyingSiteSubmitId(siteSubmitId);
            setVerifyingSiteSubmit(data); // Pass the full data to the layer

            // Open the pin details slideout for this site submit
            setSelectedPinData(data);
            setSelectedPinType('site_submit');
            setPinDetailsInitialTab('location');
            setIsPinDetailsOpen(true);

            showToast(`Zoomed to ${data.site_submit_name || 'Site Submit'} - Right-click the pin to verify location`, { type: 'success' });
          } else {
            showToast('This site submit has no coordinates. Please add property coordinates first.', { type: 'info' });
          }
        });
    }
  }, [location.search, mapInstance, layerState.site_submits?.isVisible, toggleLayer, setVerifyingSiteSubmitId]);

  // Handle property verification from URL parameter
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const propertyId = params.get('property');
    const verifyMode = params.get('verify') === 'true';

    if (propertyId && verifyMode && mapInstance) {
      console.log('📍 Property verification requested:', propertyId);

      // Fetch the FULL property data
      supabase
        .from('property')
        .select('*')
        .eq('id', propertyId)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            console.error('Failed to fetch property:', error);
            showToast('Property not found', { type: 'error' });
            return;
          }

          // Determine coordinates to use (priority: verified coords > regular coords)
          const lat = data.verified_latitude ?? data.latitude;
          const lng = data.verified_longitude ?? data.longitude;

          if (lat && lng) {
            // Zoom to the location
            mapInstance.setCenter({ lat, lng });
            mapInstance.setZoom(18);

            // Enable properties layer if not already visible (so pin is visible)
            if (!layerState.properties?.isVisible) {
              console.log('🎯 Verify mode: auto-enabling properties layer');
              toggleLayer('properties');
            }

            // Set verifying state so the PropertyLayer makes the marker draggable
            setVerifyingPropertyId(propertyId);

            // Open the pin details slideout for this property
            setSelectedPinData(data);
            setSelectedPinType('property');
            setPinDetailsInitialTab('details');
            setIsPinDetailsOpen(true);

            showToast(`Zoomed to ${data.property_name || data.address || 'Property'} - Drag the pin to verify location`, { type: 'success' });
          } else {
            showToast('This property has no coordinates. Please add coordinates first.', { type: 'info' });
          }
        });
    }
  }, [location.search, mapInstance, layerState.properties?.isVisible, toggleLayer, setVerifyingPropertyId]);

  // Handle property centering from URL parameter (without verify mode)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const propertyId = params.get('property');
    const verifyMode = params.get('verify') === 'true';

    // Only handle if property ID exists, verify mode is NOT active, and map is loaded
    if (propertyId && !verifyMode && mapInstance) {
      console.log('🗺️ Property centering requested (non-verify):', propertyId);

      // Fetch the FULL property data (needed for slideout)
      supabase
        .from('property')
        .select('*')
        .eq('id', propertyId)
        .single()
        .then(({ data, error }) => {
          if (error || !data) {
            console.error('Failed to fetch property for centering:', error);
            return;
          }

          // Determine coordinates to use (priority: verified coords > regular coords)
          const lat = data.verified_latitude ?? data.latitude;
          const lng = data.verified_longitude ?? data.longitude;

          if (lat && lng) {
            console.log(`📍 Centering on ${data.property_name || data.address || 'Property'} at ${lat}, ${lng}`);
            // Center map on property
            mapInstance.setCenter({ lat, lng });
            mapInstance.setZoom(16); // Zoom in to see the property clearly

            // Enable properties layer if not already visible
            if (!layerState.properties?.isVisible) {
              console.log('🎯 Auto-enabling properties layer');
              toggleLayer('properties');
            }

            // Open the pin details slideout for this property
            setSelectedPinData(data);
            setSelectedPinType('property');
            setPinDetailsInitialTab(undefined); // Default tab
            setIsPinDetailsOpen(true);

            // Add to recently created IDs to highlight the pin in orange
            setRecentlyCreatedPropertyIds(prev => new Set([...prev, propertyId]));

            console.log('✅ Map centered on property, slideout opened, and pin highlighted');
          } else {
            console.warn('⚠️ Property has no coordinates:', data.property_name || data.address);
          }
        });
    }
  }, [location.search, mapInstance, layerState.properties?.isVisible, toggleLayer]);

  const handleMapLoad = (map: google.maps.Map) => {
    setMapInstance(map);
    console.log('Map loaded successfully:', map);

    // Add click listener for pin dropping
    map.addListener('click', (event: google.maps.MapMouseEvent) => {
      // Close context menus on any click (they handle their own click events to stay open)
      setContextMenu(prev => ({ ...prev, isVisible: false }));
      setPropertyContextMenu(prev => ({ ...prev, isVisible: false }));
      setSiteSubmitContextMenu(prev => ({ ...prev, isVisible: false }));

      if (createMode && event.latLng) {
        const lat = event.latLng.lat();
        const lng = event.latLng.lng();
        console.log(`📍 Pin dropped for ${createMode}:`, { lat, lng });

        // Handle different create modes
        switch (createMode) {
          case 'property':
            openPropertyCreationModal(lat, lng);
            break;
          case 'site_submit':
            openSiteSubmitCreationModal(lat, lng);
            break;
        }
      }
    });

    // Add right-click listener for desktop context menu
    if (supportsRightClick()) {
      map.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
        // Don't show map context menu if a marker was just right-clicked
        if (suppressMapContextMenu) {
          console.log('🚫 Marker was right-clicked, skipping map context menu');
          return;
        }

        if (event.latLng && event.domEvent && 'clientX' in event.domEvent && 'clientY' in event.domEvent) {
          const lat = event.latLng.lat();
          const lng = event.latLng.lng();

          setContextMenu({
            isVisible: true,
            x: event.domEvent.clientX,
            y: event.domEvent.clientY,
            coordinates: { lat, lng },
          });
        }
      });
    }

    // Add long-press listener for touch devices (iPad, mobile)
    if (isTouchDevice()) {
      let touchStartTime = 0;
      let touchMoved = false;
      let touchStartPos = { x: 0, y: 0 };
      let touchLatLng: google.maps.LatLng | null = null;

      map.addListener('mousedown', (event: google.maps.MapMouseEvent) => {
        if (event.domEvent && event.domEvent instanceof TouchEvent && event.latLng) {
          // Cancel long-press if multi-touch (pinch/zoom)
          if (event.domEvent.touches.length > 1) {
            touchStartTime = 0;
            console.log('🚫 Multi-touch detected, canceling long-press');
            return;
          }

          touchStartTime = Date.now();
          touchMoved = false;
          touchLatLng = event.latLng;
          const touch = event.domEvent.touches[0];
          touchStartPos = { x: touch.clientX, y: touch.clientY };
          console.log('📱 Touch start on map at:', touchLatLng.lat(), touchLatLng.lng());
        }
      });

      map.addListener('mousemove', (event: google.maps.MapMouseEvent) => {
        if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent) {
          // Cancel long-press if multi-touch detected during move
          if (event.domEvent.touches.length > 1) {
            touchStartTime = 0;
            console.log('🚫 Multi-touch during move, canceling long-press');
            return;
          }

          const touch = event.domEvent.touches[0];
          const deltaX = Math.abs(touch.clientX - touchStartPos.x);
          const deltaY = Math.abs(touch.clientY - touchStartPos.y);

          // Use 10px threshold to allow for small finger movements while panning
          if (deltaX > 10 || deltaY > 10) {
            if (!touchMoved) {
              console.log('👆 Movement detected, canceling long-press:', { deltaX, deltaY });
            }
            touchMoved = true;
          }
        }
      });

      map.addListener('mouseup', (event: google.maps.MapMouseEvent) => {
        if (touchStartTime && event.domEvent && event.domEvent instanceof TouchEvent && touchLatLng) {
          const touchDuration = Date.now() - touchStartTime;

          // Log for debugging
          if (touchMoved) {
            console.log('👆 Touch ended with movement - no context menu');
          } else if (touchDuration < 750) {
            console.log('⚡ Touch too short for long-press:', touchDuration, 'ms');
          }

          if (touchDuration >= 750 && !touchMoved && touchLatLng) {
            // Don't show map context menu if a marker was just long-pressed
            if (suppressMapContextMenu) {
              console.log('🚫 Marker was long-pressed, skipping map context menu');
              touchStartTime = 0;
              return;
            }

            console.log('📱 Long press detected on map at:', touchLatLng.lat(), touchLatLng.lng());
            const touch = event.domEvent.changedTouches[0];

            // Capture coordinates in local constant for use in setTimeout closure
            const capturedLat = touchLatLng.lat();
            const capturedLng = touchLatLng.lng();

            setContextMenu({
              isVisible: true,
              x: touch.clientX,
              y: touch.clientY,
              coordinates: { lat: capturedLat, lng: capturedLng },
            });

            // Re-open after delay to ensure it stays visible
            setTimeout(() => {
              setContextMenu(prev => ({
                ...prev,
                isVisible: true,
                x: touch.clientX,
                y: touch.clientY,
                coordinates: { lat: capturedLat, lng: capturedLng },
              }));
            }, 100);

            event.domEvent.preventDefault();
            event.domEvent.stopPropagation();
          }
          touchStartTime = 0;
        }
      });
    }
  };

  // Modal handlers for pin dropping
  const openPropertyCreationModal = (lat: number, lng: number) => {
    console.log('🏢 Opening property creation with coordinates:', { lat, lng });
    setPinDropCoordinates({ lat, lng });
    setShowPropertyModal(true);
  };

  const openSiteSubmitCreationModal = (lat: number, lng: number) => {
    console.log('📍 Opening site submit creation modal with coordinates:', { lat, lng });
    setPinDropCoordinates({ lat, lng });
    setShowSiteSubmitModal(true);
  };

  // Handle property creation success
  const handlePropertyCreated = (property: any) => {
    console.log('✅ Property created successfully:', property);

    // Clear any search markers since we're creating a property at this location
    searchMarkers.forEach(marker => marker.setMap(null));
    setSearchMarkers([]);

    // Add to recently created set (persists until browser tab closed or manually cleared)
    setRecentlyCreatedPropertyIds(prev => new Set([...prev, property.id]));

    // Refresh the property layer to show the new item
    refreshLayer('properties');

    console.log('🧹 Cleared search markers, property session pin should be visible');

    // Open the PinDetailsSlideout to allow editing all fields
    setSelectedPinData(property);
    setSelectedPinType('property');
    setIsPinDetailsOpen(true);
    setPinDetailsInitialTab('property'); // Start on Property tab
    console.log('📂 Opened PinDetailsSlideout for newly created property');
  };

  // Handle site submit creation success
  const handleSiteSubmitCreated = (siteSubmit: any) => {
    console.log('✅ Site submit created successfully:', siteSubmit);
    // Refresh the site submit layer to show the new item
    refreshLayer('site_submits');
  };

  // Handle site submit location verified (save to database)
  const handleSiteSubmitLocationVerified = async (siteSubmitId: string, lat: number, lng: number) => {
    console.log('📍 Saving verified location for site submit:', siteSubmitId, { lat, lng });

    try {
      // Update verified coordinates in database
      const { error } = await supabase
        .from('site_submit')
        .update({
          verified_latitude: lat,
          verified_longitude: lng
        })
        .eq('id', siteSubmitId);

      if (error) {
        throw error;
      }

      console.log('✅ Site submit verified location saved successfully');

      // Update local state with new coordinates (keeps marker visible at new position)
      if (verifyingSiteSubmit) {
        const updatedSiteSubmit = {
          ...verifyingSiteSubmit,
          verified_latitude: lat,
          verified_longitude: lng
        };
        setVerifyingSiteSubmit(updatedSiteSubmit);
        // Also update the slideout data so it shows the new coordinates
        setSelectedPinData(updatedSiteSubmit);
      }

      // Refresh site submit layer to update other markers (but keep verifying marker visible)
      refreshLayer('site_submits');
      console.log('✅ Site submit location verification completed');
    } catch (error) {
      console.error('❌ Failed to save site submit verified location:', error);
      // Keep verification mode active on error so user can try again
    }
  };

  // Handle modal close
  const handlePropertyModalClose = () => {
    setShowPropertyModal(false);
    setPinDropCoordinates(null);
  };

  // Function to manually clear session pins if needed
  const clearSessionPins = () => {
    console.log('🧹 Clearing session pins...', recentlyCreatedPropertyIds);
    setRecentlyCreatedPropertyIds(new Set());
    try {
      sessionStorage.removeItem('recentlyCreatedPropertyIds');
      console.log('✅ Cleared from sessionStorage');
    } catch (error) {
      console.warn('Failed to clear session pins from sessionStorage:', error);
    }
    console.log('🧹 Session pins cleared manually');
  };

  const handleSiteSubmitModalClose = () => {
    setShowSiteSubmitModal(false);
    setPinDropCoordinates(null);
    setSelectedPropertyId(null);
  };

  // Handle creating site submit from property
  const handleCreateSiteSubmitForProperty = async (propertyId: string) => {
    console.log('📋 Creating new site submit for property:', propertyId);

    // Fetch property to get full property data including property_record_type
    try {
      const { data: property, error } = await supabase
        .from('property')
        .select(`
          *,
          property_record_type (*)
        `)
        .eq('id', propertyId)
        .single();

      if (error) throw error;

      // Fetch the "Pursuing Ownership" stage
      const { data: stage, error: stageError } = await supabase
        .from('submit_stage')
        .select('*')
        .eq('name', 'Pursuing Ownership')
        .single();

      if (stageError) {
        console.error('Error fetching default stage:', stageError);
      }

      // Create a blank site submit with property data and default stage
      const newSiteSubmit: any = {
        property_id: propertyId,
        property: property,
        property_unit_id: null,
        submit_stage_id: stage?.id || null,
        submit_stage: stage || null,
        site_submit_name: '',
        client_id: null,
        year_1_rent: null,
        ti: null,
        notes: '',
        date_submitted: null,
        // This is a "create mode" indicator
        _isNew: true
      };

      console.log('🆕 Creating new site submit with data:', newSiteSubmit);
      console.log('🏢 property_unit_id explicitly set to:', newSiteSubmit.property_unit_id);

      // Open site submit details slideout with the blank submit
      setSelectedSiteSubmitData(newSiteSubmit);
      setIsSiteSubmitDetailsOpen(true);
    } catch (err) {
      console.error('Error preparing site submit creation:', err);
    }
  };

  // Handle creating site submit from property context menu (right-click)
  const handleCreateSiteSubmitFromContextMenu = async (propertyId: string) => {
    console.log('📋 Creating new site submit from context menu for property:', propertyId);

    // First, open the property slideout
    try {
      const { data: property, error } = await supabase
        .from('property')
        .select(`
          *,
          property_record_type (*)
        `)
        .eq('id', propertyId)
        .single();

      if (error) throw error;

      // Set initial tab first (before opening slideout)
      setPinDetailsInitialTab('submits');

      // Then open property slideout
      setSelectedPinData(property);
      setSelectedPinType('property');
      setIsPinDetailsOpen(true);

      // Small delay to ensure slideout is open before triggering create
      setTimeout(() => {
        handleCreateSiteSubmitForProperty(propertyId);
      }, 150);
    } catch (err) {
      console.error('Error opening property for site submit creation:', err);
    }
  };

  // Center map on property pin without changing zoom level
  const handleCenterOnPin = (lat: number, lng: number) => {
    if (mapInstance) {
      console.log('🎯 Centering map on coordinates:', { lat, lng });

      // Only center the map, don't change zoom level
      mapInstance.setCenter({ lat, lng });

      console.log('✅ Map centered without zoom change');
    } else {
      console.warn('⚠️ Cannot center map: mapInstance not available');
    }
  };

  // Handle property selection from search
  const handlePropertySearch = (property: any) => {
    console.log('🏢 Property selected from search:', property);
    console.log('🏢 Property details:', {
      id: property.id,
      name: property.property_name,
      coordinates: { lat: property.latitude, lng: property.longitude },
      verified: { lat: property.verified_latitude, lng: property.verified_longitude }
    });

    // Center map on the property
    const coords = property.verified_latitude && property.verified_longitude
      ? { lat: property.verified_latitude, lng: property.verified_longitude }
      : { lat: property.latitude, lng: property.longitude };

    console.log('🎯 Centering on coordinates:', coords);
    handleCenterOnPin(coords.lat, coords.lng);

    // Open the property in the sidebar
    console.log('📋 Opening property sidebar...');
    handlePinClick(property, 'property');

    console.log('✅ Property search handling complete');
  };

  // Context menu handlers
  const handleContextMenuCreateProperty = () => {
    if (contextMenu.coordinates) {
      openPropertyCreationModal(contextMenu.coordinates.lat, contextMenu.coordinates.lng);
    }
  };

  const handleContextMenuClose = () => {
    setContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Property context menu handlers
  const handlePropertyRightClick = (property: any, x: number, y: number) => {
    console.log('🎯 Property right-clicked:', property.id, { x, y });

    // Don't show property context menu if site submit context menu was just triggered
    if (suppressPropertyContextMenu) {
      console.log('🚫 Suppressing property context menu - site submit was clicked');
      return;
    }

    // Close the map context menu if it's open
    setContextMenu(prev => ({ ...prev, isVisible: false }));

    // Set flag to suppress map context menu
    setSuppressMapContextMenu(true);
    setTimeout(() => setSuppressMapContextMenu(false), 200);

    // Open context menu first, THEN set the flag (so it opens before map click closes it)
    setPropertyContextMenu({
      isVisible: true,
      x,
      y,
      property,
    });

    // Use a longer delay and re-open if needed
    setTimeout(() => {
      setPropertyContextMenu(prev => ({
        ...prev,
        isVisible: true,
        x,
        y,
        property,
      }));
    }, 100);
  };

  const handlePropertyContextMenuClose = () => {
    setPropertyContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Site submit context menu handlers
  const handleSiteSubmitRightClick = (siteSubmit: any, x: number, y: number) => {
    console.log('🎯 Site submit right-clicked:', siteSubmit.id, { x, y });

    // Close any existing context menus
    setContextMenu(prev => ({ ...prev, isVisible: false }));
    setPropertyContextMenu(prev => ({ ...prev, isVisible: false }));

    // Set flag to suppress property context menu
    setSuppressPropertyContextMenu(true);
    setTimeout(() => setSuppressPropertyContextMenu(false), 200);

    // Set flag to suppress map context menu
    setSuppressMapContextMenu(true);
    setTimeout(() => setSuppressMapContextMenu(false), 100);

    // Open context menu first
    setSiteSubmitContextMenu({
      isVisible: true,
      x,
      y,
      siteSubmit,
    });

    // Re-open after a delay to ensure it stays visible
    setTimeout(() => {
      setSiteSubmitContextMenu(prev => ({
        ...prev,
        isVisible: true,
        x,
        y,
        siteSubmit,
      }));
    }, 100);
  };

  const handleSiteSubmitContextMenuClose = () => {
    setSiteSubmitContextMenu(prev => ({ ...prev, isVisible: false }));
  };

  // Pin click handlers for slideout
  const handlePinClick = (data: any, type: 'property' | 'site_submit') => {
    console.log('📍 Pin clicked:', { type, hasData: !!data });

    // Debug: Check if property relationship exists for site submits
    if (type === 'site_submit') {
      console.log('🔍 Site submit pin clicked, property data check:', {
        hasProperty: !!data?.property,
        propertyId: data?.property?.id,
        propertyName: data?.property?.property_name,
        directPropertyId: data?.property_id
      });
    }

    // Always update the selected data when clicking on a pin
    setSelectedPinData(data);
    setSelectedPinType(type);
    setIsPinDetailsOpen(true);
  };

  const handlePinDetailsClose = () => {
    setIsPinDetailsOpen(false);
    setSelectedPinData(null);
    setSelectedPinType(null);
    setPinDetailsInitialTab(undefined);
    // Cancel any ongoing verification
    setVerifyingPropertyId(null);
    // Also close property details slideout if it's open
    if (isPropertyDetailsOpen) {
      setIsPropertyDetailsOpen(false);
      setSelectedPropertyData(null);
    }
    // Also close site submit details slideout if it's open
    if (isSiteSubmitDetailsOpen) {
      setIsSiteSubmitDetailsOpen(false);
      setSelectedSiteSubmitData(null);
    }
  };

  // Handle viewing property details from site submit
  const handleViewPropertyDetails = async (property: any) => {
    console.log('🏢 Opening property details slideout:', property);

    // Validate property has an ID
    if (!property || !property.id) {
      console.error('❌ Cannot open property details: invalid property data', property);
      return;
    }

    // Fetch fresh property data from database to ensure we have latest values
    try {
      const { data: freshPropertyData, error } = await supabase
        .from('property')
        .select('*')
        .eq('id', property.id)
        .single();

      if (error) {
        console.error('❌ Error fetching fresh property data:', error);
        // Fall back to cached data if fetch fails
        setSelectedPropertyData(property);
        setIsPropertyDetailsOpen(true);
      } else {
        console.log('✅ Fetched fresh property data:', freshPropertyData);
        setSelectedPropertyData(freshPropertyData);
        // Only open sidebar after data is set
        setIsPropertyDetailsOpen(true);
      }
    } catch (err) {
      console.error('❌ Exception fetching fresh property data:', err);
      // Fall back to cached data if fetch fails
      setSelectedPropertyData(property);
      setIsPropertyDetailsOpen(true);
    }
  };

  // Handle data updates from slideout
  const handlePinDataUpdate = (updatedData: any) => {
    console.log('📝 Pin data updated:', updatedData);
    setSelectedPinData(updatedData);
    // If this is a site submit update, trigger refresh of submits list
    if (selectedPinType === 'site_submit' || updatedData.property_id) {
      setSubmitsRefreshTrigger(prev => prev + 1);
      console.log('🔄 Triggering submits list refresh after site submit update');
    }
  };

  const handlePropertyDataUpdate = (updatedData: any) => {
    console.log('📝 Property data updated:', updatedData);
    setSelectedPropertyData(updatedData);
  };

  const handlePropertyDetailsClose = () => {
    setIsPropertyDetailsOpen(false);
    setSelectedPropertyData(null);
  };

  // Handle viewing site submit details from property
  const handleViewSiteSubmitDetails = async (siteSubmit: any) => {
    console.log('📋 Opening site submit details slideout:', siteSubmit);

    // Fetch fresh site submit data from database to ensure we have latest values
    try {
      const { data: freshSiteSubmitData, error } = await supabase
        .from('site_submit')
        .select(`
          *,
          client!site_submit_client_id_fkey (id, client_name),
          submit_stage!site_submit_submit_stage_id_fkey (id, name),
          property_unit!site_submit_property_unit_id_fkey (property_unit_name),
          property!site_submit_property_id_fkey (*, property_record_type (*))
        `)
        .eq('id', siteSubmit.id)
        .single();

      if (error) {
        console.error('❌ Error fetching fresh site submit data:', error);
        console.error('❌ Error message:', error.message);
        // Fall back to cached data if fetch fails
        setSelectedSiteSubmitData(siteSubmit);
      } else {
        console.log('✅ Fetched fresh site submit data:', freshSiteSubmitData);
        console.log('   - Property:', freshSiteSubmitData?.property?.property_name);
        console.log('   - Client:', freshSiteSubmitData?.client?.client_name);
        console.log('   - Stage:', freshSiteSubmitData?.submit_stage?.name);
        setSelectedSiteSubmitData(freshSiteSubmitData);
      }
    } catch (err) {
      console.error('❌ Exception fetching fresh site submit data:', err);
      // Fall back to cached data if fetch fails
      setSelectedSiteSubmitData(siteSubmit);
    }

    setIsSiteSubmitDetailsOpen(true);
  };

  const handleSiteSubmitDataUpdate = (updatedData: any) => {
    console.log('📝 Site submit data updated:', updatedData);
    setSelectedSiteSubmitData(updatedData);
    // Trigger refresh of submits list in property slideout
    setSubmitsRefreshTrigger(prev => prev + 1);
    console.log('🔄 Triggering submits list refresh from parent, new trigger:', submitsRefreshTrigger + 1);
  };

  const handleSiteSubmitDetailsClose = () => {
    setIsSiteSubmitDetailsOpen(false);
    setSelectedSiteSubmitData(null);
  };

  // Handle contact form editing
  const handleEditContact = (contactId: string | null, propertyId: string) => {
    console.log('📝 Opening contact form:', { contactId, propertyId });
    setEditingContactId(contactId);
    setContactPropertyId(propertyId);
    setIsContactFormOpen(true);
  };

  const handleContactFormClose = () => {
    setIsContactFormOpen(false);
    setEditingContactId(null);
    setContactPropertyId(null);
  };

  // Handle location verification
  const handleVerifyLocation = (propertyId: string) => {
    console.log('🎯 Starting location verification for property:', propertyId);
    setVerifyingPropertyId(propertyId);
  };

  // Handle site submit location verification
  const handleSiteSubmitVerifyLocation = (siteSubmitId: string) => {
    console.log('🎯 Starting location verification for site submit:', siteSubmitId);

    // Get the site submit data from the context menu
    const siteSubmit = siteSubmitContextMenu.siteSubmit;

    if (siteSubmit) {
      // Set both the ID and the full data so the marker is visible
      setVerifyingSiteSubmitId(siteSubmitId);
      setVerifyingSiteSubmit(siteSubmit);

      // Open the slideout if not already open
      if (!isPinDetailsOpen) {
        setSelectedPinData(siteSubmit);
        setSelectedPinType('site_submit');
        setPinDetailsInitialTab('location');
        setIsPinDetailsOpen(true);
      }

      showToast('Verification mode active - drag the pin to adjust location', { type: 'success' });
      console.log('✅ Verification mode enabled - marker is now draggable');
    } else {
      console.error('❌ Cannot enable verification mode - site submit data not available');
      showToast('Unable to enable verification mode', { type: 'error' });
    }
  };

  // Handle site submit location reset (clear verified coordinates)
  const handleSiteSubmitResetLocation = async (siteSubmitId: string) => {
    console.log('🔄 Resetting site submit location to property location:', siteSubmitId);

    try {
      // Clear verified coordinates in database
      const { error } = await supabase
        .from('site_submit')
        .update({
          verified_latitude: null,
          verified_longitude: null
        })
        .eq('id', siteSubmitId);

      if (error) {
        throw error;
      }

      console.log('✅ Site submit location reset successfully');

      // Refresh site submit layer to show property coordinates
      refreshLayer('site_submits');
    } catch (error) {
      console.error('❌ Failed to reset site submit location:', error);
      alert('Failed to reset location. Please try again.');
    }
  };

  // Handle site submit deletion
  const handleDeleteSiteSubmit = async (siteSubmitId: string, siteSubmitName: string) => {
    console.log('🗑️ Delete site submit requested:', siteSubmitId, siteSubmitName);
    setSiteSubmitToDelete({ id: siteSubmitId, name: siteSubmitName });
    setDeleteModalOpen(true);
  };

  const confirmDeleteSiteSubmit = async () => {
    if (!siteSubmitToDelete) return;

    try {
      const siteSubmitId = siteSubmitToDelete.id;
      console.log('🗑️ Deleting site submit:', siteSubmitId);

      const { error } = await supabase
        .from('site_submit')
        .delete()
        .eq('id', siteSubmitId);

      if (error) throw error;

      console.log('✅ Site submit deleted successfully from database');

      // Show success toast
      showToast('Site submit deleted successfully!', { type: 'success' });

      // Refresh site submit layer to remove the deleted marker
      refreshLayer('site_submits');

      // Refresh the submits list if viewing from property
      setSubmitsRefreshTrigger(prev => prev + 1);

      // Close the slideout if the deleted site submit is currently selected
      // Check both the main pin details slideout and the site submit details slideout
      setTimeout(() => {
        // Close main pin details slideout if showing this site submit
        if (selectedPinType === 'site_submit' && selectedPinData?.id === siteSubmitId) {
          setSelectedPinData(null);
          setSelectedPinType(null);
          setIsPinDetailsOpen(false);
        }

        // Close site submit details slideout if showing this site submit
        if (selectedSiteSubmitData?.id === siteSubmitId) {
          setSelectedSiteSubmitData(null);
          setIsSiteSubmitDetailsOpen(false);
        }
      }, 100);

      console.log('✅ Site submit deletion complete');

      // Close the modal
      setDeleteModalOpen(false);
      setSiteSubmitToDelete(null);
    } catch (error: any) {
      console.error('❌ Error deleting site submit:', error);
      showToast(`Error deleting site submit: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
    }
  };

  // Handle property deletion
  const handleDeleteProperty = async (propertyId: string) => {
    console.log('🗑️ Delete property requested:', propertyId);

    try {
      // Check for related deals
      const { data: relatedDeals, error: dealsError } = await supabase
        .from('deal')
        .select('id, deal_name')
        .eq('property_id', propertyId);

      if (dealsError) throw dealsError;

      // Check for related site submits
      const { data: relatedSiteSubmits, error: siteSubmitsError } = await supabase
        .from('site_submit')
        .select('id, loi_date, year_1_rent')
        .eq('property_id', propertyId);

      if (siteSubmitsError) throw siteSubmitsError;

      // Show warnings if there are related records
      if (relatedDeals && relatedDeals.length > 0) {
        const dealNames = relatedDeals.map(d => d.deal_name || 'Unnamed Deal').join(', ');
        const confirmed = window.confirm(
          `Warning: This property is attached to ${relatedDeals.length} deal(s):\n\n${dealNames}\n\nDeleting this property will remove the property reference from these deals. Do you want to continue?`
        );
        if (!confirmed) return;
      }

      if (relatedSiteSubmits && relatedSiteSubmits.length > 0) {
        const siteSubmitInfo = relatedSiteSubmits
          .map((s, idx) => `${idx + 1}. Site Submit (${s.loi_date || 'No LOI date'})`)
          .join('\n');
        const confirmed = window.confirm(
          `Warning: This property is attached to ${relatedSiteSubmits.length} site submit(s):\n\n${siteSubmitInfo}\n\nDeleting this property will remove the property reference from these site submits. Do you want to continue?`
        );
        if (!confirmed) return;
      }

      // If no related records or user confirmed, show final delete confirmation
      setPropertyToDelete(propertyId);
      setShowDeleteConfirm(true);
    } catch (error) {
      console.error('Error checking related records:', error);
      showToast(`Error checking related records: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
    }
  };

  const confirmDeleteProperty = async () => {
    if (!propertyToDelete) return;

    setShowDeleteConfirm(false);

    try {
      console.log('🗑️ Deleting property:', propertyToDelete);

      const { error } = await supabase
        .from('property')
        .delete()
        .eq('id', propertyToDelete);

      if (error) throw error;

      showToast('Property deleted successfully!', { type: 'success' });

      // Close the slideout if the deleted property is currently selected
      if (selectedPinData?.id === propertyToDelete) {
        setIsPinDetailsOpen(false);
        setSelectedPinData(null);
        setSelectedPinType(null);
      }

      // Close property details slideout if open for deleted property
      if (selectedPropertyData?.id === propertyToDelete) {
        setIsPropertyDetailsOpen(false);
        setSelectedPropertyData(null);
      }

      // Refresh the property layer to remove the deleted property from map
      refreshLayer('properties');

      console.log('✅ Property deleted successfully');
    } catch (error: any) {
      console.error('❌ Error deleting property:', error);

      // Check if it's a foreign key constraint error (409 conflict)
      if (error?.code === '23503' || error?.message?.includes('foreign key') || error?.status === 409) {
        showToast(
          'Cannot delete property: It has related records (site submits, contacts, or units). Please delete those first or contact support.',
          { type: 'error' }
        );
      } else {
        showToast(`Error deleting property: ${error instanceof Error ? error.message : 'Unknown error'}`, { type: 'error' });
      }
    } finally {
      setPropertyToDelete(null);
    }
  };

  // Handle location verified (save to database)
  const handleLocationVerified = async (propertyId: string, lat: number, lng: number) => {
    console.log('📍 Saving verified location for property:', propertyId, { lat, lng });

    try {
      // Perform reverse geocoding to get address at new location
      console.log('🌍 Getting address for new location...');
      const reverseGeocodeResult = await geocodingService.reverseGeocode(lat, lng);

      let updateData: any = {
        verified_latitude: lat,
        verified_longitude: lng
      };

      // If reverse geocoding succeeded, update address fields too
      if ('latitude' in reverseGeocodeResult) {
        console.log('✅ Reverse geocoding successful:', reverseGeocodeResult.formatted_address);

        // Update address fields with the new location's address
        updateData = {
          ...updateData,
          address: reverseGeocodeResult.street_address || reverseGeocodeResult.formatted_address,
          city: reverseGeocodeResult.city,
          state: reverseGeocodeResult.state,
          zip: reverseGeocodeResult.zip,
        };

        console.log('📮 Updated address data:', updateData);
      } else {
        console.warn('⚠️ Reverse geocoding failed, only updating coordinates:', reverseGeocodeResult.error);
      }

      // Update the property with verified coordinates and potentially new address
      const { error } = await supabase
        .from('property')
        .update(updateData)
        .eq('id', propertyId);

      if (error) {
        throw error;
      }

      console.log('✅ Successfully saved verified location to database');

      // Complete verification
      setVerifyingPropertyId(null);

      // Refresh property layer to show updated coordinates
      refreshLayer('properties');

      console.log('✅ Location verification completed');
    } catch (error) {
      console.error('❌ Failed to save verified location:', error);
      // Keep verification mode active on error so user can try again
    }
  };

  // Handle restaurant location verified (save to database)
  const handleRestaurantLocationVerified = async (storeNo: string, lat: number, lng: number) => {
    console.log('📍 Saving verified location for restaurant:', storeNo, { lat, lng });

    try {
      // Update the restaurant with verified coordinates
      const { error } = await supabase
        .from('restaurant_location')
        .update({
          verified_latitude: lat,
          verified_longitude: lng,
          verified_source: 'manual',
          verified_at: new Date().toISOString()
        })
        .eq('store_no', storeNo);

      if (error) {
        throw error;
      }

      console.log('✅ Successfully saved verified location to database');

      // Complete verification
      setVerifyingRestaurantStoreNo(null);

      // Refresh restaurant layer to show updated coordinates
      refreshLayer('restaurants');

      console.log('✅ Restaurant location verification completed');
    } catch (error) {
      console.error('❌ Failed to save verified restaurant location:', error);
      // Keep verification mode active on error so user can try again
    }
  };

  // Handle restaurant right-click
  const handleRestaurantRightClick = (restaurant: any, x: number, y: number) => {
    console.log('🍔 Restaurant right-clicked:', restaurant.store_no, { x, y });
    setRestaurantContextMenu({
      isVisible: true,
      x,
      y,
      restaurant
    });
  };

  // Handle restaurant verify location
  const handleRestaurantVerifyLocation = (storeNo: string) => {
    console.log('🎯 Starting location verification for restaurant:', storeNo);
    setVerifyingRestaurantStoreNo(storeNo);
  };

  // Handle restaurant context menu close
  const handleRestaurantContextMenuClose = () => {
    setRestaurantContextMenu({
      isVisible: false,
      x: 0,
      y: 0,
      restaurant: null
    });
  };

  const handleAddressSearch = async () => {
    if (!searchAddress.trim()) return;

    setIsSearching(true);
    setSearchResult('Searching...');

    try {
      console.log('🔍 Searching for address:', searchAddress);
      const result = await geocodingService.geocodeAddress(searchAddress);

      if ('latitude' in result) {
        setSearchResult(`Found: ${result.formatted_address}`);

        // Add a search pin at the geocoded location
        if (mapInstance) {
          console.log('📍 Adding search pin for address...');

          // Clear any existing search markers
          searchMarkers.forEach(marker => marker.setMap(null));

          // Center the map on the geocoded location
          const position = { lat: result.latitude, lng: result.longitude };
          mapInstance.setCenter(position);
          mapInstance.setZoom(16); // Zoom in for street-level view

          // Create a marker to show the location
          const marker = new google.maps.Marker({
            position: position,
            map: mapInstance,
            title: result.formatted_address,
            icon: {
              path: google.maps.SymbolPath.CIRCLE,
              scale: 8,
              fillColor: '#3B82F6',
              fillOpacity: 1,
              strokeColor: '#FFFFFF',
              strokeWeight: 2
            }
          });

          // Add info window with address details
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="font-size: 12px; max-width: 250px;">
                <strong>Search Result</strong><br>
                📍 ${result.formatted_address}<br>
                🏙️ ${result.city || 'N/A'}, ${result.state || 'N/A'} ${result.zip || ''}<br>
                📊 ${result.latitude.toFixed(6)}, ${result.longitude.toFixed(6)}
              </div>
            `
          });

          marker.addListener('click', () => {
            infoWindow.open(mapInstance, marker);
          });

          // Auto-open the info window
          infoWindow.open(mapInstance, marker);

          // Track the search marker
          setSearchMarkers([marker]);

          console.log('✅ Search pin added');
        }
      } else {
        setSearchResult(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setSearchResult(`❌ Exception: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSearching(false);
    }
  };

  // Property layer configuration (memoized to prevent infinite re-renders)
  // Using viewport-based mode for better performance with large datasets
  const propertyLoadingConfig: PropertyLoadingConfig = useMemo(() => ({
    mode: 'viewport-based',
    clusterConfig: clusterConfig,
    markerStyle: markerStyle
  }), [clusterConfig, markerStyle]);

  // Site submit layer configuration (memoized to prevent infinite re-renders)
  // When a client is selected, use client-filtered mode
  // When no client is selected, use client-filtered with null ID (returns 0 results)
  // This prevents showing random site submits when clearing the client filter
  const siteSubmitLoadingConfig: SiteSubmitLoadingConfig = useMemo(() => ({
    mode: 'client-filtered',
    clientId: selectedClient?.id || null,
    visibleStages: visibleStages,
    clusterConfig: clusterConfig,
    markerStyle: markerStyle
  }), [selectedClient, visibleStages, clusterConfig, markerStyle]);

  // Stage toggle handlers
  const handleStageToggle = (stageName: string) => {
    console.log(`🎯 Toggling stage: ${stageName}`);
    setVisibleStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stageName)) {
        console.log(`➖ Hiding stage: ${stageName}`);
        newSet.delete(stageName);
      } else {
        console.log(`➕ Showing stage: ${stageName}`);
        newSet.add(stageName);
      }
      console.log(`👁️ New visible stages:`, Array.from(newSet));
      return newSet;
    });
  };

  const handleCategoryToggle = (categoryKey: string) => {
    const category = STAGE_CATEGORIES[categoryKey as keyof typeof STAGE_CATEGORIES];
    if (!category) return;

    const categoryStages = category.stages;
    const allVisible = categoryStages.every(stage => visibleStages.has(stage));

    setVisibleStages(prev => {
      const newSet = new Set(prev);
      if (allVisible) {
        // Hide all stages in category
        categoryStages.forEach(stage => newSet.delete(stage));
      } else {
        // Show all stages in category
        categoryStages.forEach(stage => newSet.add(stage));
      }
      return newSet;
    });
  };

  const handleShowAll = () => {
    console.log('🎯 Show All clicked');
    const allStages = Object.values(STAGE_CATEGORIES).flatMap(category => category.stages);
    setVisibleStages(new Set(allStages));
    console.log('👁️ All stages now visible:', allStages);
  };

  const handleHideAll = () => {
    console.log('🎯 Hide All clicked');
    setVisibleStages(new Set());
    console.log('👁️ All stages now hidden');
  };

  const handleStageCountsUpdate = (counts: Record<string, number>) => {
    setStageCounts(counts);
  };

  // Custom client selection handler that auto-enables site submits and expands legend
  const handleClientSelection = (client: ClientSearchResult | null) => {
    console.log('🔄 Client selection changed:', client ? client.client_name : 'null');
    setSelectedClient(client);

    if (client) {
      // Auto-enable site submits layer if not already visible
      if (!layerState.site_submits?.isVisible) {
        console.log('🎯 Client selected, auto-enabling site submits layer');
        toggleLayer('site_submits');
      }

      // Auto-expand legend to show filtered results
      setIsLegendExpanded(true);
      console.log('📊 Client selected, expanding legend to show results');
    } else {
      // When client is cleared, keep layer visible but it will show 0 results
      // The SiteSubmitLayer will handle showing no markers when clientId is null
      console.log('🎯 Client cleared, layer will show 0 site submits');
      setIsLegendExpanded(false);
      console.log('📊 Client cleared, collapsing legend');
    }
  };

  return (
    <div className="h-screen w-screen bg-gray-50 overflow-hidden">
      <div className="h-full flex">
        {/* Left Panel - Batch Processing (Conditional) */}
        {showBatchPanel && (
          <div className="w-80 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col shadow-lg">
            {/* Panel Header */}
            <div className="flex-shrink-0 px-3 py-2 bg-white border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h1 className="text-sm font-semibold text-gray-900">🗺️ Admin: Batch Geocoding</h1>
                <button
                  onClick={() => setShowBatchPanel(false)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                  title="Close panel"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Batch Processing Panel */}
            <div className="flex-1 overflow-y-auto space-y-4">
              <BatchGeocodingPanel className="compact" />
              <BatchReverseGeocodingPanel className="compact" />
            </div>
          </div>
        )}

        {/* Main Panel - Map and Testing */}
        <div className="flex-1 flex flex-col">
          {/* Top Control Bar */}
          <div className="flex-shrink-0 bg-white shadow-sm border-b border-gray-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                {/* Address Search with Auto-Suggest */}
                <div className="flex items-center space-x-2">
                  <AddressSearchBox
                    value={searchAddress}
                    onChange={setSearchAddress}
                    onSearch={handleAddressSearch}
                    onPropertySelect={handlePropertySearch}
                    disabled={isSearching}
                    placeholder="Search Address, City, State, or Property Name..."
                  />
                </div>
                {searchResult && (
                  <div className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded max-w-md truncate">
                    {searchResult}
                  </div>
                )}
              </div>

              <div className="flex items-center space-x-4">
                {/* Restaurant Sales Layer Toggle */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Restaurant Sales:</label>
                  <button
                    onClick={() => toggleLayer('restaurants')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      layerState.restaurants?.isVisible ? 'bg-red-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        layerState.restaurants?.isVisible ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Properties Layer Toggle */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">All Properties:</label>
                  <button
                    onClick={() => toggleLayer('properties')}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      layerState.properties?.isVisible ? 'bg-blue-600' : 'bg-gray-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        layerState.properties?.isVisible ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Client Selector */}
                <div className="flex items-center space-x-2">
                  <label className="text-sm font-medium text-gray-700">Client:</label>
                  <div className="w-64">
                    <ClientSelector
                      selectedClient={selectedClient}
                      onClientSelect={handleClientSelection}
                      placeholder="Search active clients..."
                      className="text-sm"
                    />
                  </div>
                </div>

                {/* Clear Session Pins Button (when available) */}
                {recentlyCreatedPropertyIds.size > 0 && (
                  <button
                    onClick={clearSessionPins}
                    className="px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 text-sm rounded border border-red-300 flex items-center space-x-1"
                    title="Clear your red session pins"
                  >
                    <span>🧹</span>
                    <span>Clear Session Pins ({recentlyCreatedPropertyIds.size})</span>
                  </button>
                )}

                {/* Admin Menu */}
                <div className="relative">
                  <button
                    onClick={() => setShowAdminMenu(!showAdminMenu)}
                    className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded border flex items-center"
                    title="Admin Menu"
                  >
                    <span className="text-lg">⚙️</span>
                  </button>

                  {showAdminMenu && (
                    <div className="absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-[10001]">
                      <div className="py-1">
                        <button
                          onClick={() => {
                            setShowBatchPanel(true);
                            setShowAdminMenu(false);
                          }}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center space-x-2"
                        >
                          <span>🏢</span>
                          <span>Batch Geocoding</span>
                        </button>

                        {recentlyCreatedPropertyIds.size > 0 && (
                          <button
                            onClick={() => {
                              clearSessionPins();
                              setShowAdminMenu(false);
                            }}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-700 flex items-center space-x-2"
                          >
                            <span>🧹</span>
                            <span>Clear Session Pins ({recentlyCreatedPropertyIds.size})</span>
                          </button>
                        )}

                        {/* Clustering Configuration */}
                        <div className="border-t border-gray-200 mt-1 pt-1">
                          <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Site Submit Clustering
                          </div>

                          <div className="px-4 py-2 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Min pins to cluster:</label>
                              <select
                                value={clusterConfig.minimumClusterSize}
                                onChange={(e) => setClusterConfig(prev => ({
                                  ...prev,
                                  minimumClusterSize: parseInt(e.target.value)
                                }))}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value={2}>2 pins</option>
                                <option value={3}>3 pins</option>
                                <option value={5}>5 pins</option>
                                <option value={8}>8 pins</option>
                                <option value={10}>10 pins</option>
                                <option value={999}>No clustering</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Cluster grid size:</label>
                              <select
                                value={clusterConfig.gridSize}
                                onChange={(e) => setClusterConfig(prev => ({
                                  ...prev,
                                  gridSize: parseInt(e.target.value)
                                }))}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value={40}>Tight (40px)</option>
                                <option value={60}>Normal (60px)</option>
                                <option value={80}>Loose (80px)</option>
                                <option value={100}>Very loose (100px)</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        {/* Marker Style Configuration */}
                        <div className="border-t border-gray-200 mt-1 pt-1">
                          <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Marker Style (Experimental)
                          </div>

                          <div className="px-4 py-2 space-y-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Marker shape:</label>
                              <select
                                value={markerStyle.shape}
                                onChange={(e) => setMarkerStyle(prev => ({
                                  ...prev,
                                  shape: e.target.value as MarkerShape
                                }))}
                                className="w-full text-xs border border-gray-300 rounded px-2 py-1"
                              >
                                <option value="teardrop">Teardrop (Classic)</option>
                                <option value="circle">Circle with tail</option>
                              </select>
                            </div>

                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                id="useAdvancedMarkers"
                                checked={markerStyle.useAdvancedMarkers}
                                onChange={(e) => setMarkerStyle(prev => ({
                                  ...prev,
                                  useAdvancedMarkers: e.target.checked
                                }))}
                                className="mr-2"
                              />
                              <label htmlFor="useAdvancedMarkers" className="text-xs text-gray-600">
                                Use new marker style
                              </label>
                            </div>
                            <p className="text-[10px] text-gray-400">
                              New markers have better contrast and hover effects
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>


          {/* Full Screen Map */}
          <div className="flex-1 relative">
            <GoogleMapContainer
              height="100%"
              width="100%"
              onMapLoad={handleMapLoad}
              onCenterOnLocationReady={(fn) => setCenterOnLocation(() => fn)}
              className={createMode ? 'cursor-crosshair' : ''}
            />

            {/* Create Mode Overlay */}
            {createMode && (
              <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg z-[10001]">
                <div className="flex items-center space-x-2">
                  <span>🎯</span>
                  <span className="font-medium">
                    {createMode === 'property' ? 'Click map to create Property' :
                     createMode === 'site_submit' ? 'Click map to create Site Submit' :
                     'Click map to create item'}
                  </span>
                </div>
              </div>
            )}

            {/* Property Layer - Connected to Layer Manager */}
            <PropertyLayer
              map={mapInstance}
              isVisible={layerState.properties?.isVisible || false}
              loadingConfig={propertyLoadingConfig}
              recentlyCreatedIds={recentlyCreatedPropertyIds}
              verifyingPropertyId={verifyingPropertyId}
              selectedPropertyId={selectedPinType === 'property' && selectedPinData ? selectedPinData.id : null}
              onLocationVerified={handleLocationVerified}
              onPropertyRightClick={handlePropertyRightClick}
              onPropertiesLoaded={(count) => {
                setLayerCount('properties', count);
                setLayerLoading('properties', false);
              }}
              onPinClick={(property) => handlePinClick(property, 'property')}
              onCreateSiteSubmit={(property) => {
                // Set property coordinates and ID, then open site submit modal
                const coords = property.verified_latitude && property.verified_longitude
                  ? { lat: property.verified_latitude, lng: property.verified_longitude }
                  : { lat: property.latitude, lng: property.longitude };
                setPinDropCoordinates(coords);
                setSelectedPropertyId(property.id);
                setShowSiteSubmitModal(true);
              }}
            />

            {/* Site Submit Layer - Connected to Layer Manager */}
            <SiteSubmitLayer
              map={mapInstance}
              isVisible={layerState.site_submits?.isVisible || false}
              loadingConfig={siteSubmitLoadingConfig}
              onSiteSubmitsLoaded={(count) => {
                setLayerCount('site_submits', count);
                setLayerLoading('site_submits', false);
              }}
              onPinClick={(siteSubmit) => handlePinClick(siteSubmit, 'site_submit')}
              onStageCountsUpdate={handleStageCountsUpdate}
              onSiteSubmitRightClick={handleSiteSubmitRightClick}
              verifyingSiteSubmitId={verifyingSiteSubmitId}
              verifyingSiteSubmit={verifyingSiteSubmit}
              onLocationVerified={handleSiteSubmitLocationVerified}
            />

            {/* Restaurant Layer - Connected to Layer Manager */}
            <RestaurantLayer
              map={mapInstance}
              isVisible={layerState.restaurants?.isVisible || false}
              selectedStoreNo={selectedPinType === 'restaurant' && selectedPinData ? selectedPinData.store_no : null}
              verifyingStoreNo={verifyingRestaurantStoreNo}
              onLocationVerified={canVerifyRestaurantLocations ? handleRestaurantLocationVerified : undefined}
              onRestaurantRightClick={canVerifyRestaurantLocations ? handleRestaurantRightClick : undefined}
              clusterConfig={clusterConfig}
              onRestaurantsLoaded={(count) => {
                setLayerCount('restaurants', count);
                setLayerLoading('restaurants', false);
              }}
              onPinClick={(restaurant) => {
                console.log('🍔 Opening sidebar for restaurant:', restaurant);
                setSelectedPinType('restaurant');
                setSelectedPinData(restaurant);
                setIsPinDetailsOpen(true);
              }}
            />

            {/* Pin Details Slideout - for properties and site submits */}
            {selectedPinType !== 'restaurant' && (
              <PinDetailsSlideout
                isOpen={isPinDetailsOpen}
                onClose={handlePinDetailsClose}
                onOpen={() => setIsPinDetailsOpen(true)}
                data={selectedPinData}
                type={selectedPinType}
                onVerifyLocation={handleVerifyLocation}
                isVerifyingLocation={!!verifyingPropertyId}
                onViewPropertyDetails={handleViewPropertyDetails}
                onCenterOnPin={handleCenterOnPin}
                onDataUpdate={handlePinDataUpdate}
                rightOffset={isPropertyDetailsOpen ? 500 : isSiteSubmitDetailsOpen ? 500 : isContactFormOpen ? 450 : 0} // Shift left when property/site submit details or contact form is open
                onEditContact={handleEditContact}
                onDeleteProperty={handleDeleteProperty}
                onDeleteSiteSubmit={handleDeleteSiteSubmit}
                onViewSiteSubmitDetails={handleViewSiteSubmitDetails}
                onCreateSiteSubmit={handleCreateSiteSubmitForProperty}
                submitsRefreshTrigger={submitsRefreshTrigger}
                initialTab={pinDetailsInitialTab}
              />
            )}

            {/* Restaurant Slideout - lightweight component for restaurant details */}
            {selectedPinType === 'restaurant' && isPinDetailsOpen && selectedPinData && (
              <RestaurantSlideout
                restaurant={selectedPinData as any}
                onClose={handlePinDetailsClose}
              />
            )}

            {/* Property Details Slideout (for "View Full Details" from site submit) */}
            <PinDetailsSlideout
              isOpen={isPropertyDetailsOpen}
              onClose={handlePropertyDetailsClose}
              onOpen={() => setIsPropertyDetailsOpen(true)}
              data={selectedPropertyData}
              type="property"
              onVerifyLocation={handleVerifyLocation}
              isVerifyingLocation={!!verifyingPropertyId}
              onCenterOnPin={handleCenterOnPin}
              onDataUpdate={handlePropertyDataUpdate}
              rightOffset={isContactFormOpen ? 450 : 0} // Shift left when contact form is open (450px = contact form width)
              onEditContact={handleEditContact}
              onDeleteProperty={handleDeleteProperty}
              onViewSiteSubmitDetails={handleViewSiteSubmitDetails}
              onCreateSiteSubmit={handleCreateSiteSubmitForProperty}
              submitsRefreshTrigger={submitsRefreshTrigger}
            />

            {/* Site Submit Details Slideout (for viewing site submit from property) */}
            <PinDetailsSlideout
              isOpen={isSiteSubmitDetailsOpen}
              onClose={handleSiteSubmitDetailsClose}
              onOpen={() => setIsSiteSubmitDetailsOpen(true)}
              data={selectedSiteSubmitData}
              type="site_submit"
              onViewPropertyDetails={handleViewPropertyDetails}
              onCenterOnPin={handleCenterOnPin}
              onDataUpdate={handleSiteSubmitDataUpdate}
              onDeleteSiteSubmit={handleDeleteSiteSubmit}
              rightOffset={0} // Always at the far right edge
            />

            {/* Contact Form Slideout (for editing contacts from property slideout) */}
            <ContactFormModal
              isOpen={isContactFormOpen}
              onClose={handleContactFormClose}
              propertyId={contactPropertyId || undefined}
              contactId={editingContactId || undefined}
              rightOffset={0} // Always at the far right edge
              showBackdrop={false} // No backdrop so property slideout remains visible
              onSave={() => {
                handleContactFormClose();
              }}
              onUpdate={() => {
                handleContactFormClose();
              }}
            />

            {/* Property Creation Modal */}
            {pinDropCoordinates && (
              <InlinePropertyCreationModal
                isOpen={showPropertyModal}
                onClose={handlePropertyModalClose}
                onSave={handlePropertyCreated}
                coordinates={pinDropCoordinates}
              />
            )}

            {/* Site Submit Modal */}
            <SiteSubmitFormModal
              isOpen={showSiteSubmitModal}
              onClose={handleSiteSubmitModalClose}
              onSave={handleSiteSubmitCreated}
              // Pre-fill coordinates and property from property selection
              propertyId={selectedPropertyId || undefined}
              initialLatitude={pinDropCoordinates?.lat}
              initialLongitude={pinDropCoordinates?.lng}
            />

            {/* Context Menu for Desktop Right-Click */}
            <MapContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              isVisible={contextMenu.isVisible}
              coordinates={contextMenu.coordinates}
              onCreateProperty={handleContextMenuCreateProperty}
              onClose={handleContextMenuClose}
            />

            {/* Property Context Menu for Right-Click on Properties */}
            <PropertyContextMenu
              x={propertyContextMenu.x}
              y={propertyContextMenu.y}
              isVisible={propertyContextMenu.isVisible}
              property={propertyContextMenu.property}
              onVerifyLocation={handleVerifyLocation}
              onDeleteProperty={handleDeleteProperty}
              onCreateSiteSubmit={handleCreateSiteSubmitFromContextMenu}
              onClose={handlePropertyContextMenuClose}
            />

            {/* Site Submit Context Menu for Right-Click on Site Submits */}
            <SiteSubmitContextMenu
              x={siteSubmitContextMenu.x}
              y={siteSubmitContextMenu.y}
              isVisible={siteSubmitContextMenu.isVisible}
              siteSubmit={siteSubmitContextMenu.siteSubmit}
              onVerifyLocation={handleSiteSubmitVerifyLocation}
              onResetLocation={handleSiteSubmitResetLocation}
              onDelete={handleDeleteSiteSubmit}
              onClose={handleSiteSubmitContextMenuClose}
            />

            {/* Restaurant Context Menu for Right-Click on Restaurants */}
            <RestaurantContextMenu
              x={restaurantContextMenu.x}
              y={restaurantContextMenu.y}
              isVisible={restaurantContextMenu.isVisible}
              restaurant={restaurantContextMenu.restaurant}
              onVerifyLocation={handleRestaurantVerifyLocation}
              onClose={handleRestaurantContextMenuClose}
            />

            {/* Site Submit Legend - Show when site submit layer is visible */}
            {layerState.site_submits?.isVisible && (
              <SiteSubmitLegend
                visibleStages={visibleStages}
                onStageToggle={handleStageToggle}
                onCategoryToggle={handleCategoryToggle}
                onShowAll={handleShowAll}
                onHideAll={handleHideAll}
                totalCounts={stageCounts}
                forceExpanded={isLegendExpanded}
                onToggleExpanded={setIsLegendExpanded}
              />
            )}

          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <Toast
        message={toast.message}
        type={toast.type}
        visible={toast.visible}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title="Delete Property"
        message="Are you sure you want to permanently delete this property? This will also delete all associated property contacts, property units, activities, and notes. This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        onConfirm={confirmDeleteProperty}
        onCancel={() => {
          setShowDeleteConfirm(false);
          setPropertyToDelete(null);
        }}
      />

      {/* Delete Site Submit Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={deleteModalOpen}
        onClose={() => {
          setDeleteModalOpen(false);
          setSiteSubmitToDelete(null);
        }}
        onConfirm={confirmDeleteSiteSubmit}
        title="Delete Site Submit"
        itemName={siteSubmitToDelete?.name || 'this site submit'}
        message="This action cannot be undone."
      />
    </div>
  );
};

// Main component with LayerManager provider
const MappingPageNew: React.FC = () => {
  return (
    <LayerManagerProvider>
      <MappingPageContent />
    </LayerManagerProvider>
  );
};

export default MappingPageNew;