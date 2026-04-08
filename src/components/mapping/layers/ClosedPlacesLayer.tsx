import React, { useEffect, useState, useRef, useCallback } from 'react';
import ReactDOM from 'react-dom/client';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import {
  createClosedBusinessPermanentIcon,
  createClosedBusinessTemporaryIcon,
  createClosedBusinessSelectedIcon,
  createOpenBusinessIcon,
  createOpenBusinessSelectedIcon,
} from '../utils/modernMarkers';
import ClosedPlacePopup from '../popups/ClosedPlacePopup';
import type { PlacesSearchResult } from '../../../services/googlePlacesSearchService';

interface ClosedPlacesLayerProps {
  map: google.maps.Map | null;
  isVisible: boolean;
  results: PlacesSearchResult[];
  onPlaceClick?: (place: PlacesSearchResult) => void;
  onPlaceSelect?: (place: PlacesSearchResult | null) => void;
  onAddToProperties?: (place: PlacesSearchResult) => void;
  selectedPlaceId?: string | null;
  showAddToProperties?: boolean; // false for portal view
  clusterConfig?: {
    minimumClusterSize: number;
    gridSize: number;
    maxZoom: number;
  };
}

interface OpenPopup {
  placeId: string;
  overlay: google.maps.OverlayView;
}

const ClosedPlacesLayer: React.FC<ClosedPlacesLayerProps> = ({
  map,
  isVisible,
  results,
  onPlaceClick,
  onPlaceSelect,
  onAddToProperties,
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
  const [openPopup, setOpenPopup] = useState<OpenPopup | null>(null);
  const openPopupRef = useRef<OpenPopup | null>(null);
  const markersMapRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const resultsRef = useRef<Map<string, PlacesSearchResult>>(new Map());

  // Store callbacks in refs to avoid re-creating markers on every parent render
  const onPlaceClickRef = useRef(onPlaceClick);
  const onPlaceSelectRef = useRef(onPlaceSelect);
  const onAddToPropertiesRef = useRef(onAddToProperties);
  useEffect(() => { onPlaceClickRef.current = onPlaceClick; }, [onPlaceClick]);
  useEffect(() => { onPlaceSelectRef.current = onPlaceSelect; }, [onPlaceSelect]);
  useEffect(() => { onAddToPropertiesRef.current = onAddToProperties; }, [onAddToProperties]);

  // Keep ref in sync with state
  useEffect(() => {
    openPopupRef.current = openPopup;
  }, [openPopup]);

  // Create popup overlay
  const createPopupOverlay = useCallback((place: PlacesSearchResult, position: google.maps.LatLng) => {
    const onClosePopup = () => {
      if (openPopupRef.current) {
        openPopupRef.current.overlay.setMap(null);
        setOpenPopup(null);
      }
      onPlaceSelectRef.current?.(null);
    };

    class PopupOverlay extends google.maps.OverlayView {
      private position: google.maps.LatLng;
      private containerDiv: HTMLDivElement | null = null;
      private root: ReturnType<typeof ReactDOM.createRoot> | null = null;

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
          <ClosedPlacePopup
            place={place}
            onClose={onClosePopup}
            onAddToProperties={onAddToPropertiesRef.current}
            showAddButton={showAddToProperties}
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
      }
    }

    return new PopupOverlay(position);
  }, [showAddToProperties]);

  // Compute cluster color from results, memoized to avoid unnecessary clusterer re-init
  const clusterColor = React.useMemo(() => {
    const hasOperational = results.some(r => r.business_status === 'OPERATIONAL');
    const hasClosed = results.some(r => r.business_status !== 'OPERATIONAL');
    return hasOperational && !hasClosed ? '#16A34A' : hasClosed && !hasOperational ? '#DC2626' : '#6B7280';
  }, [results]);
  const clusterColorRef = useRef(clusterColor);
  useEffect(() => { clusterColorRef.current = clusterColor; }, [clusterColor]);

  // Create cluster renderer with custom styling - stable reference
  const createClusterRenderer = useCallback(() => {
    return {
      render: ({ count, position }: { count: number; position: google.maps.LatLng }) => {
        const color = clusterColorRef.current;
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

    // Close any open popup
    if (openPopupRef.current) {
      openPopupRef.current.overlay.setMap(null);
      setOpenPopup(null);
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
      const isOperational = place.business_status === 'OPERATIONAL';

      // Choose icon based on status and selection
      let markerIcon: google.maps.Icon;
      if (isSelected) {
        if (isOperational) {
          markerIcon = createOpenBusinessSelectedIcon(40);
        } else {
          markerIcon = createClosedBusinessSelectedIcon(isPermanent ? 'permanent' : 'temporary', 40);
        }
      } else if (isOperational) {
        markerIcon = createOpenBusinessIcon(28);
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

      // Click handler - show popup on the map
      marker.addListener('click', () => {
        const placeData = resultsRef.current.get(place.place_id);
        if (placeData && map) {
          // Close existing popup first
          if (openPopupRef.current) {
            openPopupRef.current.overlay.setMap(null);
            setOpenPopup(null);
          }

          // Create and show popup
          const position = new google.maps.LatLng(placeData.latitude, placeData.longitude);
          const overlay = createPopupOverlay(placeData, position);

          // Small delay for cleanup
          setTimeout(() => {
            overlay.setMap(map);
            setOpenPopup({ placeId: placeData.place_id, overlay });
          }, 10);

          onPlaceClickRef.current?.(placeData);
          onPlaceSelectRef.current?.(placeData);
        }
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);
  }, [map, results, clusterer, createPopupOverlay]);

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
      // Hide all markers and close popup
      if (clusterer) {
        clusterer.clearMarkers();
      }
      markers.forEach(marker => marker.setMap(null));
      if (openPopupRef.current) {
        openPopupRef.current.overlay.setMap(null);
        setOpenPopup(null);
      }
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
      const isOperational = place.business_status === 'OPERATIONAL';

      // Update icon
      let markerIcon: google.maps.Icon;
      if (isSelected) {
        if (isOperational) {
          markerIcon = createOpenBusinessSelectedIcon(40);
        } else {
          markerIcon = createClosedBusinessSelectedIcon(isPermanent ? 'permanent' : 'temporary', 40);
        }
      } else if (isOperational) {
        markerIcon = createOpenBusinessIcon(28);
      } else if (isPermanent) {
        markerIcon = createClosedBusinessPermanentIcon(28);
      } else {
        markerIcon = createClosedBusinessTemporaryIcon(28);
      }

      marker.setIcon(markerIcon);
      marker.setZIndex(isSelected ? 1000 : 100);
    });
  }, [selectedPlaceId, markers, map]);

  // Close popup when clicking elsewhere on the map
  useEffect(() => {
    if (!map) return;

    const clickListener = map.addListener('click', () => {
      if (openPopupRef.current) {
        openPopupRef.current.overlay.setMap(null);
        setOpenPopup(null);
        onPlaceSelectRef.current?.(null);
      }
    });

    return () => {
      google.maps.event.removeListener(clickListener);
    };
  }, [map]);

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
      if (openPopupRef.current) {
        openPopupRef.current.overlay.setMap(null);
      }
    };
  }, []);

  return null; // This component renders markers directly on the map
};

export default ClosedPlacesLayer;
