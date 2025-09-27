import React, { useEffect, useState } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import { supabase } from '../../../lib/supabaseClient';
import { useLayerManager } from './LayerManager';
import { ModernMarkerStyles, MarkerColors, createModernPinIcon } from '../utils/modernMarkers';

interface SiteSubmit {
  id: string;
  site_submit_name?: string;
  client_id: string | null;
  property_id: string | null;
  submit_stage_id: string | null;
  sf_property_latitude: number;
  sf_property_longitude: number;
  verified_latitude?: number;
  verified_longitude?: number;
  notes?: string;
  year_1_rent?: number;
  ti?: number;
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
  };
}

export type SiteSubmitLoadingMode = 'static-100' | 'static-500' | 'static-all' | 'client-filtered';

export interface SiteSubmitLoadingConfig {
  mode: SiteSubmitLoadingMode;
  clientId?: string | null; // For client filtering
}

interface SiteSubmitLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  loadingConfig: SiteSubmitLoadingConfig;
  onSiteSubmitsLoaded?: (count: number) => void;
  onPinClick?: (siteSubmit: SiteSubmit) => void;
}

// Stage-based marker colors mapping (modern colors)
const STAGE_MARKER_COLORS: Record<string, string> = {
  'New': MarkerColors.SUBMITTED,        // Purple for new submissions
  'In Progress': MarkerColors.PENDING,  // Amber for in progress
  'Under Review': '#F59E0B',           // Orange for under review
  'Approved': MarkerColors.APPROVED,    // Green for approved
  'Rejected': MarkerColors.REJECTED,    // Red for rejected
  'On Hold': '#8B5CF6',               // Purple for on hold
  'Cancelled': '#6B7280',             // Gray for cancelled
};

const DEFAULT_MARKER_COLOR = MarkerColors.SUBMITTED;

const SiteSubmitLayer: React.FC<SiteSubmitLayerProps> = ({ map, isVisible, loadingConfig, onSiteSubmitsLoaded, onPinClick }) => {
  const [siteSubmits, setSiteSubmits] = useState<SiteSubmit[]>([]);
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Function to get display coordinates (verified takes priority over sf_property coordinates)
  const getDisplayCoordinates = (siteSubmit: SiteSubmit) => {
    if (siteSubmit.verified_latitude && siteSubmit.verified_longitude) {
      return {
        lat: siteSubmit.verified_latitude,
        lng: siteSubmit.verified_longitude,
        verified: true
      };
    }
    if (siteSubmit.sf_property_latitude && siteSubmit.sf_property_longitude) {
      return {
        lat: siteSubmit.sf_property_latitude,
        lng: siteSubmit.sf_property_longitude,
        verified: false
      };
    }
    return null;
  };

  // Get modern marker icon based on submit stage
  const getMarkerIcon = (siteSubmit: SiteSubmit, verified: boolean): google.maps.Icon => {
    const stageName = siteSubmit.submit_stage?.name;
    const color = stageName
      ? STAGE_MARKER_COLORS[stageName] || DEFAULT_MARKER_COLOR
      : DEFAULT_MARKER_COLOR;

    // Use larger size for verified coordinates to show prominence
    const size = verified ? 32 : 28;
    return createModernPinIcon(color, size);
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
        .select('id, site_submit_name, sf_property_latitude, sf_property_longitude', { count: 'exact' })
        .limit(5);

      if (testError) {
        console.error('❌ Basic site_submit query failed:', testError);
        throw new Error(`Basic query failed: ${testError.message}`);
      }

      console.log('✅ Basic site_submit query succeeded:', testData);
      console.log(`📊 Found ${testData?.length || 0} site submit records in basic query (total count: ${count})`);

      // Check for records with coordinates
      const { data: coordData, error: coordError } = await supabase
        .from('site_submit')
        .select('id, site_submit_name, sf_property_latitude, sf_property_longitude, verified_latitude, verified_longitude')
        .or('and(sf_property_latitude.not.is.null,sf_property_longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)')
        .limit(10);

      if (coordError) {
        console.error('❌ Coordinate query failed:', coordError);
        throw new Error(`Coordinate query failed: ${coordError.message}`);
      }

      console.log('✅ Coordinate query succeeded:', coordData);
      console.log(`📍 Found ${coordData?.length || 0} site submits with coordinates`);

      // Use correct foreign key syntax like other components
      let query = supabase
        .from('site_submit')
        .select(`
          id,
          site_submit_name,
          client_id,
          property_id,
          submit_stage_id,
          sf_property_latitude,
          sf_property_longitude,
          verified_latitude,
          verified_longitude,
          notes,
          year_1_rent,
          ti,
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
            address
          )
        `)
        .or('and(sf_property_latitude.not.is.null,sf_property_longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)');

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
                property_id,
                submit_stage_id,
                sf_property_latitude,
                sf_property_longitude,
                verified_latitude,
                verified_longitude,
                notes,
                year_1_rent,
                ti,
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
                  address
                )
              `)
              .or('and(sf_property_latitude.not.is.null,sf_property_longitude.not.is.null),and(verified_latitude.not.is.null,verified_longitude.not.is.null)')
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
          setSiteSubmits(validSiteSubmits);
          onSiteSubmitsLoaded?.(validSiteSubmits.length);

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
      setSiteSubmits(validSiteSubmits);
      onSiteSubmitsLoaded?.(validSiteSubmits.length);

    } catch (err) {
      console.error('❌ Error fetching site submits:', err);
      console.error('❌ Error details:', JSON.stringify(err, null, 2));
      setError(err instanceof Error ? err.message : 'Failed to fetch site submits');
    } finally {
      setIsLoading(false);
    }
  };

  // Create markers for all site submits
  const createMarkers = () => {
    if (!map || !siteSubmits.length) return;

    console.log('🗺️ Creating markers for site submits...');

    // Clear existing markers
    markers.forEach(marker => marker.setMap(null));

    const newMarkers: google.maps.Marker[] = siteSubmits.map(siteSubmit => {
      const coords = getDisplayCoordinates(siteSubmit);
      if (!coords) return null;

      const markerIcon = getMarkerIcon(siteSubmit, coords.verified);

      // Create info window content
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

      const marker = new google.maps.Marker({
        position: { lat: coords.lat, lng: coords.lng },
        map: null, // Don't show initially
        title: siteSubmit.site_submit_name || `Site Submit - ${siteSubmit.client?.client_name}`,
        icon: markerIcon
      });

      marker.addListener('click', () => {
        // Use modern slideout instead of info window
        if (onPinClick) {
          onPinClick(siteSubmit);
          return;
        }

        // Fallback to info window
        infoWindow.open(map, marker);
      });

      return marker;
    }).filter(marker => marker !== null) as google.maps.Marker[];

    console.log(`✅ Created ${newMarkers.length} site submit markers`);
    setMarkers(newMarkers);
  };

  // Set up marker clustering
  const setupClustering = () => {
    if (!map || !markers.length) return;

    // Clear existing clusterer
    if (clusterer) {
      clusterer.clearMarkers();
    }

    console.log('🔗 Setting up site submit marker clustering...');

    const newClusterer = new MarkerClusterer({
      map,
      markers: [],
      gridSize: 60,
      maxZoom: 15,
      averageCenter: true,
      minimumClusterSize: 2
    });

    setClusterer(newClusterer);
    console.log('✅ Site submit clustering initialized');
  };

  // Update marker visibility
  const updateMarkerVisibility = () => {
    if (!clusterer) return;

    if (isVisible) {
      console.log(`👁️ Showing ${markers.length} site submit markers`);
      clusterer.addMarkers(markers);
    } else {
      console.log('🙈 Hiding site submit markers');
      clusterer.clearMarkers();
    }
  };

  // Get refresh trigger from LayerManager
  const { refreshTrigger } = useLayerManager();
  const siteSubmitRefreshTrigger = refreshTrigger.site_submits || 0;

  // Load site submits when component mounts or map/config changes or refresh is triggered
  useEffect(() => {
    if (map) {
      fetchSiteSubmits();
    }
  }, [map, loadingConfig, siteSubmitRefreshTrigger]);

  // Create markers when site submits load
  useEffect(() => {
    if (siteSubmits.length > 0) {
      createMarkers();
    }
  }, [siteSubmits, map]);

  // Set up clustering when markers are ready
  useEffect(() => {
    if (markers.length > 0) {
      setupClustering();
    }
  }, [markers, map]);

  // Update visibility when isVisible prop changes
  useEffect(() => {
    updateMarkerVisibility();
  }, [isVisible, clusterer, markers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (clusterer) {
        clusterer.clearMarkers();
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