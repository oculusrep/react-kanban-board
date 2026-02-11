import React, { useEffect, useState, useRef } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { createStageMarkerIcon, createVerifiedStageMarkerIcon } from '../utils/stageMarkers';
import { isTouchDevice, addLongPressListener } from '../../../utils/deviceDetection';
import {
  loadMarkerLibrary,
  getMarkerLibrary,
  isMarkerLibraryLoaded,
  createStageMarkerElement,
  createSelectedStageMarkerElement,
  MarkerShape,
  getStageConfig
} from '../utils/advancedMarkers';

interface SiteSubmit {
  id: string;
  site_submit_name?: string;
  client_id: string | null;
  assignment_id?: string | null;
  property_id: string | null;
  submit_stage_id: string | null;
  sf_property_latitude: number;
  sf_property_longitude: number;
  verified_latitude?: number;
  verified_longitude?: number;
  notes?: string;
  year_1_rent?: number;
  ti?: number;
  // New fields for Submit tab - matching database field names
  property_unit?: string;
  sf_property_unit?: string; // Database field name
  date_submitted?: string;
  loi_written?: boolean;
  loi_date?: string;
  delivery_date?: string;
  delivery_timeframe?: string;
  created_at?: string;
  updated_at?: string;
  // Related data (optional for now while debugging)
  client?: {
    id: string;
    client_name: string;
  };
  submit_stage?: {
    id: string;
    name: string;
  };
  property?: {
    id: string;
    property_name?: string;
    address: string;
    city?: string;
    zip?: string;
  };
  property_unit?: {
    property_unit_name: string;
  };
}

export type SiteSubmitLoadingMode = 'static-100' | 'static-500' | 'static-all' | 'client-filtered';

export interface SiteSubmitLoadingConfig {
  mode: SiteSubmitLoadingMode;
  clientId?: string | null; // For client filtering
  visibleStages?: Set<string>; // For stage filtering
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

interface SiteSubmitLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  loadingConfig: SiteSubmitLoadingConfig;
  onSiteSubmitsLoaded?: (count: number) => void;
  onPinClick?: (siteSubmit: SiteSubmit) => void;
  onStageCountsUpdate?: (counts: Record<string, number>) => void;
  onSiteSubmitRightClick?: (siteSubmit: SiteSubmit, x: number, y: number) => void;
  verifyingSiteSubmitId?: string | null; // Site submit being verified
  verifyingSiteSubmit?: SiteSubmit | null; // Full site submit data for the one being verified
  onLocationVerified?: (siteSubmitId: string, lat: number, lng: number) => void;
  selectedSiteSubmitId?: string | null; // Site submit to highlight (from Pipeline "View on Map")
  onSelectedSiteSubmitPosition?: (lat: number, lng: number) => void; // Callback with position of selected site submit
}


const SiteSubmitLayer: React.FC<SiteSubmitLayerProps> = ({
  map,
  isVisible,
  loadingConfig,
  onSiteSubmitsLoaded,
  onPinClick,
  onStageCountsUpdate,
  onSiteSubmitRightClick,
  verifyingSiteSubmitId = null,
  verifyingSiteSubmit = null,
  onLocationVerified,
  selectedSiteSubmitId = null,
  onSelectedSiteSubmitPosition
}) => {
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  // Support both legacy Marker and AdvancedMarkerElement
  type MarkerType = google.maps.Marker | google.maps.marker.AdvancedMarkerElement;
  const [markers, setMarkers] = useState<MarkerType[]>([]);
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markerLibraryLoaded, setMarkerLibraryLoaded] = useState(false);

  // Track which selection we've already reported position for (to avoid re-centering on re-render)
  const lastReportedSelectionRef = useRef<string | null>(null);

  // Reset the reported selection ref when selection is cleared (so new selection will trigger centering)
  useEffect(() => {
    if (!selectedSiteSubmitId) {
      lastReportedSelectionRef.current = null;
    }
  }, [selectedSiteSubmitId]);

  // Get marker style settings with defaults
  const markerStyle = loadingConfig.markerStyle || {
    shape: 'teardrop' as MarkerShape,
    useAdvancedMarkers: true // Default to advanced markers
  };

  // Function to get display coordinates (priority: verified site submit coords > property coords)
  const getDisplayCoordinates = (siteSubmit: SiteSubmit) => {
    // First priority: Verified site submit coordinates
    if (siteSubmit.verified_latitude && siteSubmit.verified_longitude) {
      return {
        lat: siteSubmit.verified_latitude,
        lng: siteSubmit.verified_longitude,
        verified: true
      };
    }

    // Second priority: Property coordinates (prefer verified property coords, fallback to regular)
    if (siteSubmit.property) {
      const propertyLat = siteSubmit.property.verified_latitude ?? siteSubmit.property.latitude;
      const propertyLng = siteSubmit.property.verified_longitude ?? siteSubmit.property.longitude;

      if (propertyLat && propertyLng) {
        return {
          lat: propertyLat,
          lng: propertyLng,
          verified: false
        };
      }
    }

    return null;
  };

  // Get marker icon based on submit stage and verification status
  const getMarkerIcon = (siteSubmit: SiteSubmit): google.maps.Icon => {
    const stageName = siteSubmit.submit_stage?.name || 'Monitor';
    const coords = getDisplayCoordinates(siteSubmit);

    // Use verified marker if this site submit has verified coordinates
    if (coords?.verified) {
      return createVerifiedStageMarkerIcon(stageName, 32);
    }

    return createStageMarkerIcon(stageName, 32);
  };

  // Fetch site submits based on loading configuration
  const fetchSiteSubmits = async () => {
    if (!map) return;

    setIsLoading(true);
    setError(null);

    try {
      console.log(`🏢 Fetching site submits (mode: ${loadingConfig.mode})...`);

      // First, let's try a simpler query to debug
      console.log('🔍 Testing basic site_submit table access...');
      const { data: testData, error: testError, count } = await supabase
        .from('site_submit')
        .select('id, site_submit_name, verified_latitude, verified_longitude', { count: 'exact' })
        .limit(5);

      if (testError) {
        console.error('❌ Basic site_submit query failed:', testError);
        throw new Error(`Basic query failed: ${testError.message}`);
      }

      console.log('✅ Basic site_submit query succeeded:', testData);
      console.log(`📊 Found ${testData?.length || 0} site submit records in basic query (total count: ${count})`);

      // Check for records with coordinates (including property coords via join)
      const { data: coordData, error: coordError } = await supabase
        .from('site_submit')
        .select(`
          id,
          site_submit_name,
          verified_latitude,
          verified_longitude,
          property!site_submit_property_id_fkey (
            latitude,
            longitude
          )
        `)
        .limit(10);

      if (coordError) {
        console.error('❌ Coordinate query failed:', coordError);
        throw new Error(`Coordinate query failed: ${coordError.message}`);
      }

      console.log('✅ Coordinate query succeeded:', coordData);
      console.log(`📍 Found ${coordData?.length || 0} site submits (will filter for coordinates in app logic)`);

      // Use correct foreign key syntax like other components
      let query = supabase
        .from('site_submit')
        .select(`
          id,
          site_submit_name,
          client_id,
          assignment_id,
          property_id,
          submit_stage_id,
          verified_latitude,
          verified_longitude,
          notes,
          year_1_rent,
          ti,
          sf_property_unit,
          date_submitted,
          delivery_date,
          loi_written,
          loi_date,
          delivery_timeframe,
          created_at,
          created_by_id,
          updated_at,
          updated_by_id,
          client!site_submit_client_id_fkey (
            id,
            client_name
          ),
          submit_stage!site_submit_submit_stage_id_fkey (
            id,
            name
          ),
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
            verified_longitude,
            property_record_type_id,
            available_sqft,
            rent_psf,
            nnn_psf,
            acres,
            building_sqft,
            asking_purchase_price,
            asking_lease_price,
            lease_expiration_date
          ),
          property_unit!site_submit_property_unit_id_fkey (
            property_unit_name
          )
        `);

      console.log('🔍 Using correct foreign key syntax...');

      // Apply different loading strategies
      switch (loadingConfig.mode) {
        case 'static-100':
          query = query.limit(100);
          break;

        case 'static-500':
          query = query.limit(500);
          break;

        case 'client-filtered':
          if (loadingConfig.clientId) {
            console.log(`🔍 Filtering by client: ${loadingConfig.clientId}`);
            query = query.eq('client_id', loadingConfig.clientId);
          } else {
            // No client selected - return empty results instead of all site submits
            console.log('🚫 No client selected, skipping site submit fetch (will return 0 results)');
            setSiteSubmits([]);
            onSiteSubmitsLoaded?.(0);
            onStageCountsUpdate?.({});
            setIsLoading(false);
            return; // Exit early
          }
          break;

        case 'static-all':
          // Fetch all site submits using pagination to bypass 1000-row limit
          console.log('📊 static-all: Using pagination to fetch all site submits...');

          const allSiteSubmits = [];
          let pageStart = 0;
          const pageSize = 1000;
          let hasMoreData = true;

          while (hasMoreData) {
            console.log(`📄 Fetching page starting at ${pageStart}...`);

            const pageQuery = supabase
              .from('site_submit')
              .select(`
                id,
                site_submit_name,
                client_id,
                assignment_id,
                property_id,
                submit_stage_id,
                verified_latitude,
                verified_longitude,
                notes,
                year_1_rent,
                ti,
                sf_property_unit,
                delivery_date,
                loi_written,
                loi_date,
                delivery_timeframe,
                created_at,
                created_by_id,
                updated_at,
                updated_by_id,
                client!site_submit_client_id_fkey (
                  id,
                  client_name
                ),
                submit_stage!site_submit_submit_stage_id_fkey (
                  id,
                  name
                ),
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
                  verified_longitude,
                  property_record_type_id,
                  available_sqft,
                  rent_psf,
                  nnn_psf,
                  acres,
                  building_sqft,
                  asking_purchase_price,
                  asking_lease_price,
                  lease_expiration_date
                ),
                property_unit!site_submit_property_unit_id_fkey (
                  property_unit_name
                )
              `)
              .range(pageStart, pageStart + pageSize - 1)
              .order('id');

            const { data: pageData, error: pageError } = await pageQuery;

            if (pageError) {
              throw pageError;
            }

            if (pageData && pageData.length > 0) {
              allSiteSubmits.push(...pageData);
              console.log(`✅ Fetched ${pageData.length} site submits (total so far: ${allSiteSubmits.length})`);

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

          console.log(`🎉 Pagination complete: ${allSiteSubmits.length} total site submits fetched`);

          const validSiteSubmits = allSiteSubmits.filter(siteSubmit =>
            getDisplayCoordinates(siteSubmit) !== null
          );

          console.log(`📍 Found ${validSiteSubmits.length} site submits with coordinates (static-all via pagination)`);

          // Debug: Log property unit data to understand the structure
          if (validSiteSubmits.length > 0) {
            console.log('🔍 Sample site submit data for property unit debugging (pagination):', {
              sf_property_unit: validSiteSubmits[0]?.sf_property_unit,
              property_unit: validSiteSubmits[0]?.property_unit,
              fullRecord: validSiteSubmits[0]
            });
          }

          // Calculate stage counts for legend
          const stageCounts: Record<string, number> = {};
          validSiteSubmits.forEach(siteSubmit => {
            const stageName = siteSubmit.submit_stage?.name || 'Monitor';
            stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;
          });

          setSiteSubmits(validSiteSubmits);
          onSiteSubmitsLoaded?.(validSiteSubmits.length);
          onStageCountsUpdate?.(stageCounts);

          setIsLoading(false);
          return; // Exit early since we've handled the request
      }

      const { data, error: fetchError } = await query.order('site_submit_name');

      if (fetchError) {
        throw fetchError;
      }

      const validSiteSubmits = (data || []).filter(siteSubmit =>
        getDisplayCoordinates(siteSubmit) !== null
      );

      console.log(`📍 Found ${validSiteSubmits.length} site submits with coordinates (${loadingConfig.mode})`);

      // Debug: Log property unit data to understand the structure
      if (validSiteSubmits.length > 0) {
        console.log('🔍 Sample site submit data for property unit debugging:', {
          sf_property_unit: validSiteSubmits[0]?.sf_property_unit,
          property_unit: validSiteSubmits[0]?.property_unit,
          fullRecord: validSiteSubmits[0]
        });
      }

      // Calculate stage counts for legend
      const stageCounts: Record<string, number> = {};
      validSiteSubmits.forEach(siteSubmit => {
        const stageName = siteSubmit.submit_stage?.name || 'Monitor';
        stageCounts[stageName] = (stageCounts[stageName] || 0) + 1;
      });

      setSiteSubmits(validSiteSubmits);
      onSiteSubmitsLoaded?.(validSiteSubmits.length);
      onStageCountsUpdate?.(stageCounts);

    } catch (err) {
      console.error('❌ Error fetching site submits:', err);
      console.error('❌ Error details:', JSON.stringify(err, null, 2));
      setError(err instanceof Error ? err.message : 'Failed to fetch site submits');
    } finally {
      setIsLoading(false);
    }
  };

  // Create markers for all site submits
  const createMarkers = async () => {
    if (!map) return;

    // Load marker library if using advanced markers
    if (markerStyle.useAdvancedMarkers && !markerLibraryLoaded) {
      try {
        await loadMarkerLibrary();
        setMarkerLibraryLoaded(true);
      } catch (err) {
        console.error('Failed to load marker library, falling back to legacy markers:', err);
      }
    }

    // Ensure verifying site submit is included even if not in loaded list
    let siteSubmitsToRender = [...siteSubmits];

    if (verifyingSiteSubmit && verifyingSiteSubmitId) {
      // Check if verifying site submit is already in the list
      const alreadyInList = siteSubmits.some(ss => ss.id === verifyingSiteSubmitId);

      if (!alreadyInList) {
        console.log('➕ Adding verifying site submit to render list:', verifyingSiteSubmit.site_submit_name);
        siteSubmitsToRender = [verifyingSiteSubmit, ...siteSubmits];
      } else {
        console.log('✅ Verifying site submit already in loaded list');
      }
    }

    console.log('🗺️ Creating markers for site submits...');
    console.log('📊 Site submits to render:', siteSubmitsToRender.length);
    console.log('📊 Visible stages:', loadingConfig.visibleStages ? Array.from(loadingConfig.visibleStages) : 'all');
    console.log('🎯 Verifying site submit ID:', verifyingSiteSubmitId);
    console.log('🎨 Marker style:', markerStyle.useAdvancedMarkers ? `Advanced (${markerStyle.shape})` : 'Legacy');

    // Clear existing markers (always, even if there are no new markers to create)
    markers.forEach(marker => marker.setMap(null));

    // If no site submits to render, set empty markers array and return
    if (!siteSubmitsToRender.length) {
      console.log('🧹 No site submits to render, clearing all markers');
      setMarkers([]);
      return;
    }

    const useAdvanced = markerStyle.useAdvancedMarkers && markerLibraryLoaded;

    const newMarkers: MarkerType[] = siteSubmitsToRender.map(siteSubmit => {
      const coords = getDisplayCoordinates(siteSubmit);
      if (!coords) return null;

      // Skip if stage is not visible (unless this is the verifying site submit or selected)
      const isBeingVerified = verifyingSiteSubmitId === siteSubmit.id;
      const isSelected = selectedSiteSubmitId === siteSubmit.id;
      const stageName = siteSubmit.submit_stage?.name || 'Monitor';

      // Report selected site submit position for map centering (only once per selection)
      if (isSelected && onSelectedSiteSubmitPosition && lastReportedSelectionRef.current !== siteSubmit.id) {
        lastReportedSelectionRef.current = siteSubmit.id;
        onSelectedSiteSubmitPosition(coords.lat, coords.lng);
      }

      if (!isBeingVerified && !isSelected && loadingConfig.visibleStages && !loadingConfig.visibleStages.has(stageName)) {
        console.log(`🙈 Hiding marker for stage: ${stageName} (not in visible stages:`, Array.from(loadingConfig.visibleStages));
        return null;
      }

      // Create info window content (used for fallback)
      const infoContent = `
        <div class="p-3 max-w-sm">
          <h3 class="font-semibold text-lg text-gray-900 mb-2">
            ${siteSubmit.site_submit_name || 'Site Submit'}
          </h3>
          <div class="space-y-1 text-sm text-gray-600">
            ${siteSubmit.client ? `<div><strong>Client:</strong> ${siteSubmit.client.client_name}</div>` : siteSubmit.client_id ? `<div><strong>Client ID:</strong> ${siteSubmit.client_id}</div>` : ''}
            ${siteSubmit.submit_stage ? `<div><strong>Stage:</strong> ${siteSubmit.submit_stage.name}</div>` : siteSubmit.submit_stage_id ? `<div><strong>Stage ID:</strong> ${siteSubmit.submit_stage_id}</div>` : ''}
            ${siteSubmit.property ? `<div><strong>Property:</strong> ${siteSubmit.property.property_name || 'N/A'}</div>` : siteSubmit.property_id ? `<div><strong>Property ID:</strong> ${siteSubmit.property_id}</div>` : ''}
            <div><strong>Coordinates:</strong> ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}</div>
            ${siteSubmit.year_1_rent ? `<div><strong>Year 1 Rent:</strong> $${siteSubmit.year_1_rent.toLocaleString()}</div>` : ''}
            ${siteSubmit.ti ? `<div><strong>TI:</strong> $${siteSubmit.ti.toLocaleString()}</div>` : ''}
            <div class="text-xs ${coords.verified ? 'text-green-600' : 'text-blue-600'}">
              ${coords.verified ? '✓ Verified Location' : '📍 Property Location'}
            </div>
            ${siteSubmit.notes ? `<div class="mt-2 p-2 bg-gray-50 rounded text-xs"><strong>Notes:</strong> ${siteSubmit.notes}</div>` : ''}
          </div>
        </div>
      `;

      const infoWindow = new google.maps.InfoWindow({
        content: infoContent
      });

      if (isBeingVerified) {
        console.log('🎯 Found verifying site submit!', {
          id: siteSubmit.id,
          name: siteSubmit.site_submit_name,
          coords,
          map: map ? 'available' : 'null'
        });
      }

      // Long-press state for touch devices (defined here so click handler and drag can access it)
      let wasLongPress = false;
      let touchStartTime = 0; // Declare here so drag handlers can access it

      // Create marker based on style
      let marker: MarkerType;

      if (useAdvanced && isMarkerLibraryLoaded()) {
        // Create AdvancedMarkerElement using the cached library (not google.maps.marker directly)
        const markerLib = getMarkerLibrary();
        const { AdvancedMarkerElement } = markerLib;

        // Use larger orange marker for selected site submit (from "View on Map")
        const content = isSelected
          ? createSelectedStageMarkerElement(stageName, markerStyle.shape, coords.verified, 52)
          : createStageMarkerElement(stageName, markerStyle.shape, coords.verified, 38);

        marker = new AdvancedMarkerElement({
          map: isBeingVerified || isSelected ? map : null, // Show selected marker immediately (not just in cluster)
          position: { lat: coords.lat, lng: coords.lng },
          content,
          title: siteSubmit.site_submit_name || `Site Submit - ${siteSubmit.client?.client_name}`,
          zIndex: isBeingVerified ? 2000 : isSelected ? 1500 : 1000, // Selected marker above others
          gmpDraggable: isBeingVerified
        });

        // AdvancedMarkerElement event handling
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
              console.log('📍 Site submit location verified:', { siteSubmitId: siteSubmit.id, lat, lng });
              onLocationVerified(siteSubmit.id, lat!, lng!);
            }
          });
        }

        // Click handler for AdvancedMarkerElement
        marker.addListener('click', () => {
          if (wasLongPress) {
            console.log('🚫 Skipping click - was long press');
            wasLongPress = false;
            return;
          }

          if (onPinClick) {
            onPinClick(siteSubmit);
            return;
          }

          // Fallback to info window
          infoWindow.open(map);
        });

        // Right-click (context menu) for AdvancedMarkerElement
        if (onSiteSubmitRightClick && content) {
          content.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            onSiteSubmitRightClick(siteSubmit, e.clientX, e.clientY);
          });

          // Long-press support for touch devices on AdvancedMarkerElement
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
                  console.log('📱 Long press on site submit marker:', siteSubmit.site_submit_name);
                  wasLongPress = true;
                  onSiteSubmitRightClick(siteSubmit, touchStartPos.x, touchStartPos.y);
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
        // Legacy google.maps.Marker
        const markerIcon = getMarkerIcon(siteSubmit);

        marker = new google.maps.Marker({
          position: { lat: coords.lat, lng: coords.lng },
          map: isBeingVerified ? map : null,
          title: siteSubmit.site_submit_name || `Site Submit - ${siteSubmit.client?.client_name}`,
          icon: markerIcon,
          draggable: isBeingVerified,
          zIndex: isBeingVerified ? 2000 : 1000
        });

        // Handle marker drag to update verified location (only when in verification mode)
        if (isBeingVerified && onLocationVerified) {
          marker.addListener('dragstart', () => {
            touchStartTime = 0;
            wasLongPress = false;
          });

          marker.addListener('dragend', (event: google.maps.MapMouseEvent) => {
            if (event.latLng) {
              const newLat = event.latLng.lat();
              const newLng = event.latLng.lng();
              console.log('📍 Site submit location verified:', { siteSubmitId: siteSubmit.id, lat: newLat, lng: newLng });
              onLocationVerified(siteSubmit.id, newLat, newLng);
            }
          });
        }

        marker.addListener('click', () => {
          if (wasLongPress) {
            console.log('🚫 Skipping click - was long press');
            wasLongPress = false;
            return;
          }

          if (onPinClick) {
            onPinClick(siteSubmit);
            return;
          }

          infoWindow.open(map, marker as google.maps.Marker);
        });

        // Add right-click listener for site submit markers
        if (onSiteSubmitRightClick) {
          marker.addListener('rightclick', (event: google.maps.MapMouseEvent) => {
            if (event.domEvent) {
              event.domEvent.preventDefault();
              event.domEvent.stopPropagation();
              onSiteSubmitRightClick(siteSubmit, event.domEvent.clientX, event.domEvent.clientY);
            }
          });

          // Add long-press support for touch devices
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
                  console.log('📱 Long press on site submit marker:', siteSubmit.site_submit_name);
                  wasLongPress = true;
                  const touch = event.domEvent.changedTouches[0];
                  onSiteSubmitRightClick(siteSubmit, touch.clientX, touch.clientY);
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
    }).filter(marker => marker !== null) as MarkerType[];

    console.log(`✅ Created ${newMarkers.length} site submit markers (total site submits: ${siteSubmits.length})`);
    setMarkers(newMarkers);
  };

  // Set up marker clustering
  const setupClustering = () => {
    if (!map) return;

    // Properly dispose of existing clusterer
    if (clusterer) {
      console.log('🧹 Disposing of existing clusterer...');
      clusterer.clearMarkers();
      clusterer.setMap(null); // Remove clusterer from map
    }

    const clusterConfig = loadingConfig.clusterConfig || {
      minimumClusterSize: 5,
      gridSize: 60,
      maxZoom: 15
    };

    // If minimumClusterSize is very high (e.g., 999), disable clustering entirely
    // by adding markers directly to the map instead of using a clusterer
    if (clusterConfig.minimumClusterSize >= 100) {
      console.log(`🚫 Clustering disabled (minimumClusterSize: ${clusterConfig.minimumClusterSize})`);
      setClusterer(null);
      return;
    }

    console.log(`🔗 Setting up site submit marker clustering with ${markers.length} markers...`);

    const newClusterer = new MarkerClusterer({
      map,
      markers: [],
      gridSize: clusterConfig.gridSize,
      maxZoom: clusterConfig.maxZoom,
      averageCenter: true,
      minimumClusterSize: clusterConfig.minimumClusterSize
    });

    setClusterer(newClusterer);
    console.log('✅ Site submit clustering initialized');
  };

  // Helper function to check if marker is on map
  const isMarkerOnMap = (marker: MarkerType): boolean => {
    if ('getMap' in marker && typeof marker.getMap === 'function') {
      // Legacy Marker
      return marker.getMap() !== null;
    } else {
      // AdvancedMarkerElement - check map property
      return marker.map !== null;
    }
  };

  // Helper function to check if marker is draggable
  const isMarkerDraggable = (marker: MarkerType): boolean => {
    if ('getDraggable' in marker && typeof marker.getDraggable === 'function') {
      return marker.getDraggable() || false;
    } else {
      // AdvancedMarkerElement uses gmpDraggable property
      return (marker as google.maps.marker.AdvancedMarkerElement).gmpDraggable || false;
    }
  };

  // Helper function to get marker z-index
  const getMarkerZIndex = (marker: MarkerType): number => {
    if ('getZIndex' in marker && typeof marker.getZIndex === 'function') {
      return marker.getZIndex() || 0;
    } else {
      return (marker as google.maps.marker.AdvancedMarkerElement).zIndex || 0;
    }
  };

  // Update marker visibility
  const updateMarkerVisibility = () => {
    if (isVisible) {
      // Add clustered markers back
      const markersToCluster: MarkerType[] = [];
      const verifyingMarkers: MarkerType[] = [];

      markers.forEach(marker => {
        if (!isMarkerOnMap(marker)) {
          // Check if this is a verifying marker (draggable + high z-index)
          if (isMarkerDraggable(marker) && getMarkerZIndex(marker) === 2000) {
            verifyingMarkers.push(marker);
          } else {
            markersToCluster.push(marker);
          }
        }
      });

      // If clustering is disabled (clusterer is null), add markers directly to map
      if (!clusterer) {
        console.log(`👁️ Showing ${markersToCluster.length} site submit markers (no clustering) + ${verifyingMarkers.length} verifying markers`);
        markersToCluster.forEach(marker => marker.setMap(map));
      } else {
        console.log(`👁️ Showing ${markersToCluster.length} site submit markers (clustered) + ${verifyingMarkers.length} verifying markers`);
        // MarkerClusterer supports both Marker and AdvancedMarkerElement
        clusterer.addMarkers(markersToCluster as (google.maps.Marker | google.maps.marker.AdvancedMarkerElement)[]);
      }

      // Re-add verifying markers directly to map
      verifyingMarkers.forEach(marker => marker.setMap(map));
    } else {
      console.log('🙈 Hiding site submit markers');
      if (clusterer) {
        clusterer.clearMarkers();
      }
      // Also hide any markers that are directly on the map (verifying marker or non-clustered)
      markers.forEach(marker => {
        if (isMarkerOnMap(marker)) {
          marker.setMap(null);
        }
      });
    }
  };

  // Get refresh trigger from LayerManager
  const { refreshTrigger } = useLayerManager();
  const siteSubmitRefreshTrigger = refreshTrigger.site_submits || 0;

  // Local refresh trigger for real-time updates
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0);

  // Real-time subscription for site_submit updates (status changes)
  useEffect(() => {
    const channel = supabase.channel('site-submit-layer-changes');

    channel
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'site_submit',
        },
        (payload) => {
          console.log('📍 Site submit updated (real-time):', payload.new.id);
          // Trigger local refresh
          setLocalRefreshTrigger(prev => prev + 1);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Load site submits when component mounts or map/config changes or refresh is triggered
  useEffect(() => {
    if (map) {
      fetchSiteSubmits();
    }
  }, [map, loadingConfig, siteSubmitRefreshTrigger, localRefreshTrigger]);

  // Create markers when site submits load or stage visibility changes or marker style changes
  useEffect(() => {
    // Always call createMarkers, even when siteSubmits is empty
    // This ensures markers are cleared when filtering results in 0 site submits
    if (map) {
      createMarkers();
    }
  }, [siteSubmits, map, loadingConfig.visibleStages, verifyingSiteSubmitId, verifyingSiteSubmit, markerStyle.shape, markerStyle.useAdvancedMarkers]);

  // Set up clustering when markers change or cluster config changes (including when empty)
  useEffect(() => {
    if (map) {
      setupClustering();
    }
  }, [markers, map, loadingConfig.clusterConfig]);

  // Update visibility when isVisible prop changes
  useEffect(() => {
    updateMarkerVisibility();
  }, [isVisible, clusterer, markers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterer) {
        console.log('🧹 Cleanup: Disposing of clusterer on unmount');
        clusterer.clearMarkers();
        clusterer.setMap(null);
      }
      markers.forEach(marker => marker.setMap(null));
    };
  }, []);

  // This component doesn't render anything visible - it just manages map markers
  if (error) {
    console.error('SiteSubmitLayer Error:', error);
  }

  if (isLoading) {
    console.log('🔄 Loading site submits...');
  }

  return null;
};

export default SiteSubmitLayer;