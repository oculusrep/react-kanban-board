import React, { useEffect, useState, useRef, useCallback } from 'react';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import {
  createClosedBusinessPermanentIcon,
  createClosedBusinessTemporaryIcon,
  createClosedBusinessSelectedIcon,
} from '../utils/modernMarkers';
import type { PlacesSearchResult } from '../../../services/googlePlacesSearchService';

interface ClosedPlacesLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  results: PlacesSearchResult[];
  onPlaceClick?: (place: PlacesSearchResult) => void;
  onPlaceSelect?: (place: PlacesSearchResult | null) => void;
  selectedPlaceId?: string | null;
  showAddToProperties?: boolean; // false for portal view
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
}

const ClosedPlacesLayer: React.FC<ClosedPlacesLayerProps> = ({
  map,
  isVisible,
  results,
  onPlaceClick,
  onPlaceSelect,
  selectedPlaceId,
  showAddToProperties = true,
  clusterConfig = {
    minimumClusterSize: 3,
    gridSize: 60,
    maxZoom: 15,
  },
}) => {
  const [markers, setMarkers] = useState<google.maps.Marker[]>([]);
  const [clusterer, setClusterer] = useState<MarkerClusterer | null>(null);
  const markersMapRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const resultsRef = useRef<Map<string, PlacesSearchResult>>(new Map());

  // Create cluster renderer with custom styling
  const createClusterRenderer = useCallback(() => {
    return {
      render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
        // Use red for clusters (most closed places are permanently closed)
        const color = '#DC2626';
        const svg = `
          <svg fill="${color}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240">
            <circle cx="120" cy="120" opacity=".6" r="70" />
            <circle cx="120" cy="120" opacity=".3" r="90" />
            <circle cx="120" cy="120" opacity=".2" r="110" />
            <text x="50%" y="50%" style="fill:#fff" text-anchor="middle"
                  font-size="50" dominant-baseline="middle"
                  font-family="roboto,arial,sans-serif">${count}</text>
          </svg>
        `;

        return new google.maps.Marker({
          position,
          icon: {
            url: `data:image/svg+xml;base64,${btoa(svg)}`,
            scaledSize: new google.maps.Size(45, 45),
            anchor: new google.maps.Point(22, 22),
          },
          zIndex: Number(google.maps.Marker.MAX_ZINDEX) + count,
        });
      },
    };
  }, []);

  // Initialize clusterer
  useEffect(() => {
    if (!map) return;

    const algorithmOptions = {
      maxZoom: clusterConfig.maxZoom,
      gridSize: clusterConfig.gridSize,
    };

    const newClusterer = new MarkerClusterer({
      map,
      markers: [],
      renderer: createClusterRenderer(),
      algorithmOptions,
    });

    setClusterer(newClusterer);

    return () => {
      newClusterer.clearMarkers();
      newClusterer.setMap(null);
    };
  }, [map, clusterConfig.maxZoom, clusterConfig.gridSize, createClusterRenderer]);

  // Create/update markers when results change
  useEffect(() => {
    if (!map) return;

    // Clear existing markers
    markers.forEach(marker => {
      marker.setMap(null);
    });
    markersMapRef.current.clear();
    resultsRef.current.clear();

    if (clusterer) {
      clusterer.clearMarkers();
    }

    if (results.length === 0) {
      setMarkers([]);
      return;
    }

    // Create new markers
    const newMarkers: google.maps.Marker[] = [];

    results.forEach(place => {
      const isSelected = place.place_id === selectedPlaceId;
      const isPermanent = place.business_status === 'CLOSED_PERMANENTLY';

      // Choose icon based on status and selection
      let markerIcon: google.maps.Icon;
      if (isSelected) {
        markerIcon = createClosedBusinessSelectedIcon(isPermanent ? 'permanent' : 'temporary', 40);
      } else if (isPermanent) {
        markerIcon = createClosedBusinessPermanentIcon(28);
      } else {
        markerIcon = createClosedBusinessTemporaryIcon(28);
      }

      const marker = new google.maps.Marker({
        position: { lat: place.latitude, lng: place.longitude },
        icon: markerIcon,
        title: place.name,
        zIndex: isSelected ? 1000 : 100,
        optimized: true,
      });

      // Store reference to place data
      resultsRef.current.set(place.place_id, place);
      markersMapRef.current.set(place.place_id, marker);

      // Click handler
      marker.addListener('click', () => {
        const placeData = resultsRef.current.get(place.place_id);
        if (placeData) {
          onPlaceClick?.(placeData);
          onPlaceSelect?.(placeData);
        }
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);
  }, [map, results, selectedPlaceId, onPlaceClick, onPlaceSelect, clusterer]);

  // Update marker visibility and clustering
  useEffect(() => {
    if (!map) return;

    const clusteringDisabled = clusterConfig.minimumClusterSize >= 100;

    if (isVisible) {
      if (clusteringDisabled || !clusterer) {
        // Show all markers directly (no clustering)
        markers.forEach(marker => {
          if (marker.getMap() !== map) {
            marker.setMap(map);
          }
        });
      } else {
        // Show clustered markers
        const selectedMarker = selectedPlaceId
          ? markersMapRef.current.get(selectedPlaceId)
          : null;

        // Clear and re-add markers to clusterer
        clusterer.clearMarkers();

        markers.forEach(marker => {
          // Exclude selected marker from clustering
          if (marker !== selectedMarker) {
            clusterer.addMarker(marker);
          }
        });

        // Always show selected marker separately (not clustered)
        if (selectedMarker) {
          selectedMarker.setMap(map);
        }
      }
    } else {
      // Hide all markers
      if (clusterer) {
        clusterer.clearMarkers();
      }
      markers.forEach(marker => marker.setMap(null));
    }
  }, [isVisible, markers, clusterer, map, selectedPlaceId, clusterConfig.minimumClusterSize]);

  // Update selected marker when selection changes
  useEffect(() => {
    if (!map) return;

    markers.forEach(marker => {
      const title = marker.getTitle();
      const place = Array.from(resultsRef.current.values()).find(p => p.name === title);
      if (!place) return;

      const isSelected = place.place_id === selectedPlaceId;
      const isPermanent = place.business_status === 'CLOSED_PERMANENTLY';

      // Update icon
      let markerIcon: google.maps.Icon;
      if (isSelected) {
        markerIcon = createClosedBusinessSelectedIcon(isPermanent ? 'permanent' : 'temporary', 40);
      } else if (isPermanent) {
        markerIcon = createClosedBusinessPermanentIcon(28);
      } else {
        markerIcon = createClosedBusinessTemporaryIcon(28);
      }

      marker.setIcon(markerIcon);
      marker.setZIndex(isSelected ? 1000 : 100);
    });
  }, [selectedPlaceId, markers, map]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      markers.forEach(marker => {
        marker.setMap(null);
      });
      if (clusterer) {
        clusterer.clearMarkers();
        clusterer.setMap(null);
      }
    };
  }, []);

  return null; // This component renders markers directly on the map
};

export default ClosedPlacesLayer;
