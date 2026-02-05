import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePortal } from '../../contexts/PortalContext';
import GoogleMapContainer from '../../components/mapping/GoogleMapContainer';
import SiteSubmitLayer, { SiteSubmitLoadingConfig } from '../../components/mapping/layers/SiteSubmitLayer';
import SiteSubmitLegend from '../../components/mapping/SiteSubmitLegend';
import AddressSearchBox from '../../components/mapping/AddressSearchBox';
import PortalDetailSidebar from '../../components/portal/PortalDetailSidebar';
import { LayerManagerProvider } from '../../components/mapping/layers/LayerManager';
import { STAGE_CATEGORIES } from '../../components/mapping/SiteSubmitPin';
import { geocodingService } from '../../services/geocodingService';
import CustomLayerLayer from '../../components/mapping/layers/CustomLayerLayer';
import { useClientMapLayers, useMapLayers } from '../../hooks/useMapLayers';
import DrawingToolbar from '../../components/mapping/DrawingToolbar';
import SaveShapeModal from '../../components/modals/SaveShapeModal';
import ShareLayerModal from '../../components/modals/ShareLayerModal';
import { mapLayerService, MapLayer, MapLayerShape, UpdateShapeInput } from '../../services/mapLayerService';
import ShapeEditorPanel from '../../components/mapping/ShapeEditorPanel';
import BoundaryBuilderPanel from '../../components/mapping/BoundaryBuilderPanel';
import { boundaryService, FetchedBoundary } from '../../services/boundaryService';
import PlaceInfoLayer from '../../components/mapping/layers/PlaceInfoLayer';

// Portal-visible stages (from spec)
// Note: Stage names must match database format exactly (no spaces around dashes)
const PORTAL_VISIBLE_STAGES = [
  'Submitted-Reviewing',
  'Pass',
  'Use Declined',
  'Use Conflict',
  'Not Available',
  'Lost / Killed',
  'LOI',
  'At Lease/PSA',
  'Under Contract/Contingent',
  'Store Opened',
];

/**
 * PortalMapPage - Map view for the client portal
 *
 * Features:
 * - Site submit pins filtered by client and portal-visible stages
 * - Stage toggle legend
 * - Property search bar
 * - Clustering
 * - Portal detail sidebar
 */
export default function PortalMapPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { selectedClientId, accessibleClients, isInternalUser, viewMode } = usePortal();

  // Show broker features only when internal user AND in broker view mode
  const showBrokerFeatures = isInternalUser && viewMode === 'broker';

  const [mapInstance, setMapInstance] = useState<google.maps.Map | null>(null);
  const [isStreetViewActive, setIsStreetViewActive] = useState(false);
  const [selectedSiteSubmitId, setSelectedSiteSubmitId] = useState<string | null>(
    searchParams.get('selected')
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(!!searchParams.get('selected')); // Open if URL has selection

  // Legend state - initialize with portal-visible stages
  const [visibleStages, setVisibleStages] = useState<Set<string>>(() => {
    return new Set(PORTAL_VISIBLE_STAGES);
  });
  const [stageCounts, setStageCounts] = useState<Record<string, number>>({});
  const [isLegendExpanded, setIsLegendExpanded] = useState(true); // Expanded by default for portal users

  // Search state
  const [searchAddress, setSearchAddress] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchMarkers, setSearchMarkers] = useState<google.maps.Marker[]>([]);

  // Track if we've already centered on the selected marker from URL
  const [hasCenteredOnSelected, setHasCenteredOnSelected] = useState(false);

  // Shared map layers for this client (for portal users)
  const { layers: sharedLayers, fetchLayers: fetchClientLayers } = useClientMapLayers(selectedClientId);

  // All layers (for brokers/admins to draw and manage)
  const { layers: allLayers, fetchLayers: fetchAllLayers } = useMapLayers({ autoFetch: isInternalUser });

  // Determine which layers to show based on user type and view mode
  // In client view mode, show only shared layers (what client sees)
  const displayLayers = showBrokerFeatures ? allLayers : sharedLayers;

  // Layer visibility state
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>({});
  const [showLayersPanel, setShowLayersPanel] = useState(false);

  // Drawing state (brokers only)
  const [isDrawMode, setIsDrawMode] = useState(false);
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [pendingShape, setPendingShape] = useState<{
    type: 'polygon' | 'circle' | 'polyline' | 'rectangle';
    geometry: any;
  } | null>(null);
  const [showSaveShapeModal, setShowSaveShapeModal] = useState(false);
  const [customLayerRefreshTrigger, setCustomLayerRefreshTrigger] = useState(0);

  // Share layer modal state (brokers only)
  const [showShareLayerModal, setShowShareLayerModal] = useState(false);
  const [layerToShare, setLayerToShare] = useState<MapLayer | null>(null);

  // Boundary builder panel state (brokers only)
  const [showBoundaryBuilder, setShowBoundaryBuilder] = useState(false);

  // Shape editor state (brokers only)
  const [selectedShape, setSelectedShape] = useState<MapLayerShape | null>(null);
  const [showShapeEditor, setShowShapeEditor] = useState(false);

  // Initialize layer visibility when layers change
  useEffect(() => {
    const newVisibility: Record<string, boolean> = { ...layerVisibility };
    displayLayers.forEach(layer => {
      if (newVisibility[layer.id] === undefined) {
        newVisibility[layer.id] = true; // Default to visible
      }
    });
    setLayerVisibility(newVisibility);
  }, [displayLayers]);

  // Update document title
  useEffect(() => {
    document.title = 'Map | Client Portal';
  }, []);

  // Listen for Street View visibility changes
  useEffect(() => {
    if (!mapInstance) return;

    const streetView = mapInstance.getStreetView();
    const listener = streetView.addListener('visible_changed', () => {
      const isVisible = streetView.getVisible();
      console.log('🚶 Portal Map - Street View visibility changed:', isVisible);
      setIsStreetViewActive(isVisible);
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [mapInstance]);

  // Handle URL param changes for selected site submit
  useEffect(() => {
    const selectedId = searchParams.get('selected');
    if (selectedId && selectedId !== selectedSiteSubmitId) {
      setSelectedSiteSubmitId(selectedId);
      setIsSidebarOpen(true);
      setHasCenteredOnSelected(false); // Reset centering flag for new selection
    }
  }, [searchParams]);

  // Site submit layer configuration
  // For internal users with no selection: show all (they can see everything)
  // For portal users: must have a client selected (auto-selected if only one)
  const siteSubmitConfig: SiteSubmitLoadingConfig = useMemo(() => {
    // Internal users viewing all clients
    if (showBrokerFeatures && !selectedClientId) {
      return {
        mode: 'static-all',
        visibleStages,
        clusterConfig: {
          minimumClusterSize: 5,
          gridSize: 60,
          maxZoom: 15,
        },
        markerStyle: {
          shape: 'teardrop',
          useAdvancedMarkers: true,
        },
      };
    }

    // Client-filtered mode (for portal users or when client selected)
    return {
      mode: 'client-filtered',
      clientId: selectedClientId || (accessibleClients.length === 1 ? accessibleClients[0].id : null),
      visibleStages,
      clusterConfig: {
        minimumClusterSize: 5,
        gridSize: 60,
        maxZoom: 15,
      },
      markerStyle: {
        shape: 'teardrop',
        useAdvancedMarkers: true,
      },
    };
  }, [selectedClientId, visibleStages, isInternalUser, accessibleClients]);

  // Handle site submit click
  const handleSiteSubmitClick = useCallback((siteSubmit: any) => {
    setSelectedSiteSubmitId(siteSubmit.id);
    setIsSidebarOpen(true);

    // Update URL
    setSearchParams({ selected: siteSubmit.id });
  }, [setSearchParams]);

  // Handle selected site submit position - center map on it (from "View on Map" in Pipeline)
  const handleSelectedSiteSubmitPosition = useCallback((lat: number, lng: number) => {
    if (!mapInstance || hasCenteredOnSelected) return;

    console.log('🎯 Centering map on selected property:', { lat, lng });
    mapInstance.setCenter({ lat, lng });
    mapInstance.setZoom(15); // Zoom in to show the property clearly
    setHasCenteredOnSelected(true);
  }, [mapInstance, hasCenteredOnSelected]);

  // Handle sidebar close
  const handleCloseSidebar = () => {
    setIsSidebarOpen(false);
    setSelectedSiteSubmitId(null);
    setSearchParams({});
  };

  // Handle stage counts update from layer
  const handleStageCountsUpdate = useCallback((counts: Record<string, number>) => {
    // Filter to only portal-visible stages
    const filteredCounts: Record<string, number> = {};
    PORTAL_VISIBLE_STAGES.forEach(stage => {
      if (counts[stage] !== undefined) {
        filteredCounts[stage] = counts[stage];
      }
    });
    setStageCounts(filteredCounts);
  }, []);

  // Handle address search - address param is used when suggestion is selected (to avoid state timing issues)
  const handleSearch = async (address?: string) => {
    const addressToSearch = address || searchAddress;
    if (!addressToSearch.trim() || !mapInstance) return;

    console.log('🔍 Searching for address:', addressToSearch);
    setIsSearching(true);
    try {
      const result = await geocodingService.geocodeAddress(addressToSearch);
      console.log('📍 Geocode result:', result);
      if (result && 'latitude' in result) {
        // Clear existing search markers
        searchMarkers.forEach(m => m.setMap(null));

        // Create new marker
        const marker = new google.maps.Marker({
          position: { lat: result.latitude, lng: result.longitude },
          map: mapInstance,
          title: addressToSearch,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 10,
            fillColor: '#3b82f6',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          },
        });

        setSearchMarkers([marker]);
        mapInstance.panTo({ lat: result.latitude, lng: result.longitude });
        mapInstance.setZoom(14);
        console.log('✅ Map centered on:', result.latitude, result.longitude);
      } else {
        console.warn('⚠️ No geocode result for:', addressToSearch);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  };

  // Handle stage toggle
  const handleStageToggle = useCallback((stage: string) => {
    setVisibleStages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(stage)) {
        newSet.delete(stage);
      } else {
        newSet.add(stage);
      }
      return newSet;
    });
  }, []);

  // Handle category toggle
  const handleCategoryToggle = useCallback((categoryStages: string[]) => {
    // Filter to only portal-visible stages in this category
    const visibleCategoryStages = categoryStages.filter(s => PORTAL_VISIBLE_STAGES.includes(s));

    setVisibleStages(prev => {
      const newSet = new Set(prev);
      const allVisible = visibleCategoryStages.every(s => newSet.has(s));

      if (allVisible) {
        visibleCategoryStages.forEach(s => newSet.delete(s));
      } else {
        visibleCategoryStages.forEach(s => newSet.add(s));
      }
      return newSet;
    });
  }, []);

  // Handle show all stages
  const handleShowAll = useCallback(() => {
    setVisibleStages(new Set(PORTAL_VISIBLE_STAGES));
  }, []);

  // Handle hide all stages
  const handleHideAll = useCallback(() => {
    setVisibleStages(new Set());
  }, []);

  // Handle shape click (for editing - brokers only)
  // Only selects the shape; user must click Format button to open editor
  const handleShapeClick = useCallback((shape: MapLayerShape) => {
    if (showBrokerFeatures && editingLayerId) {
      setSelectedShape(shape);
      // Don't auto-open editor - user clicks Format button in toolbar
    }
  }, [showBrokerFeatures, editingLayerId]);

  // Handle Format button click
  const handleFormatClick = useCallback(() => {
    if (selectedShape) {
      setShowShapeEditor(true);
    }
  }, [selectedShape]);

  // Handle updating layer defaults from shape editor
  const handleUpdateLayerDefaults = useCallback(async (defaults: {
    default_color: string;
    default_stroke_color: string;
    default_opacity: number;
    default_stroke_width: number;
  }) => {
    if (!editingLayerId) return;
    try {
      await mapLayerService.updateLayer(editingLayerId, {
        default_color: defaults.default_color,
        default_stroke_color: defaults.default_stroke_color,
        default_opacity: defaults.default_opacity,
        default_stroke_width: defaults.default_stroke_width,
      });
      fetchAllLayers(); // Refresh layers to get updated defaults
    } catch (err) {
      console.error('Failed to update layer defaults:', err);
      throw err;
    }
  }, [editingLayerId, fetchAllLayers]);

  // Handle shape save
  const handleShapeSave = async (shapeId: string, updates: UpdateShapeInput) => {
    try {
      await mapLayerService.updateShape(shapeId, updates);
      setCustomLayerRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to save shape:', err);
      throw err;
    }
  };

  // Handle shape delete
  const handleShapeDelete = async (shapeId: string) => {
    try {
      await mapLayerService.deleteShape(shapeId);
      setCustomLayerRefreshTrigger(prev => prev + 1);
    } catch (err) {
      console.error('Failed to delete shape:', err);
      throw err;
    }
  };

  // Handler for saving boundaries as a collection (individual shapes)
  const handleSaveBoundaryCollection = async (boundaries: FetchedBoundary[], layerName: string) => {
    // Create a new layer
    const layer = await mapLayerService.createLayer({
      name: layerName,
      description: `Collection of ${boundaries.length} boundaries`,
      layer_type: 'custom',
    });

    // Create one shape per boundary
    for (const boundary of boundaries) {
      const geometry = boundaryService.convertToMapLayerGeometry(boundary.geometry);
      await mapLayerService.createShape({
        layer_id: layer.id,
        name: boundary.displayName,
        shape_type: 'polygon',
        geometry,
      });
    }

    // Refresh layers and enable visibility
    await fetchAllLayers();
    setLayerVisibility(prev => ({ ...prev, [layer.id]: true }));
    setCustomLayerRefreshTrigger(prev => prev + 1);
  };

  // Handler for saving boundaries as a merged polygon
  const handleSaveBoundaryMerged = async (boundaries: FetchedBoundary[], layerName: string) => {
    // Merge the boundaries into a single polygon
    const mergedGeometry = boundaryService.mergePolygons(boundaries);

    // Create a new layer
    const layer = await mapLayerService.createLayer({
      name: layerName,
      description: `Merged territory from ${boundaries.length} boundaries`,
      layer_type: 'custom',
    });

    // Create a single merged shape
    await mapLayerService.createShape({
      layer_id: layer.id,
      name: layerName,
      shape_type: 'polygon',
      geometry: mergedGeometry,
      description: `Merged from: ${boundaries.map(b => b.displayName).join(', ')}`,
    });

    // Refresh layers and enable visibility
    await fetchAllLayers();
    setLayerVisibility(prev => ({ ...prev, [layer.id]: true }));
    setCustomLayerRefreshTrigger(prev => prev + 1);
  };

  // Filter stage categories to only show portal-visible stages
  const filteredStageCategories = useMemo(() => {
    const filtered: Record<string, { label: string; stages: string[] }> = {};

    Object.entries(STAGE_CATEGORIES).forEach(([key, category]) => {
      const visibleCategoryStages = category.stages.filter(s => PORTAL_VISIBLE_STAGES.includes(s));
      if (visibleCategoryStages.length > 0) {
        filtered[key] = {
          ...category,
          stages: visibleCategoryStages,
        };
      }
    });

    return filtered;
  }, []);

  return (
    <LayerManagerProvider>
      <div className="h-[calc(100vh-64px)] relative">
        {/* Map Container */}
        <GoogleMapContainer
          height="100%"
          onMapLoad={setMapInstance}
          controlsTopOffset={42}
        />

        {/* Site Submit Layer */}
        {mapInstance && (
          <SiteSubmitLayer
            map={mapInstance}
            isVisible={true}
            loadingConfig={siteSubmitConfig}
            onPinClick={handleSiteSubmitClick}
            onStageCountsUpdate={handleStageCountsUpdate}
            selectedSiteSubmitId={selectedSiteSubmitId}
            onSelectedSiteSubmitPosition={handleSelectedSiteSubmitPosition}
          />
        )}

        {/* Place Info Layer - Shows popup when clicking Google Places POIs */}
        {mapInstance && (
          <PlaceInfoLayer
            map={mapInstance}
            isVisible={!isStreetViewActive}
          />
        )}

        {/* Custom Map Layers */}
        {mapInstance && displayLayers.map(layer => (
          <CustomLayerLayer
            key={layer.id}
            map={mapInstance}
            isVisible={layerVisibility[layer.id] ?? true}
            layerId={layer.id}
            editMode={showBrokerFeatures && editingLayerId === layer.id}
            refreshTrigger={customLayerRefreshTrigger}
            selectedShapeId={selectedShape?.id}
            onShapeClick={showBrokerFeatures && editingLayerId === layer.id ? handleShapeClick : undefined}
            onShapeUpdated={showBrokerFeatures ? async (updatedShape) => {
              // Save geometry changes when shape is edited
              try {
                await mapLayerService.updateShape(updatedShape.id, {
                  geometry: updatedShape.geometry,
                });
                console.log('Shape geometry saved:', updatedShape.name || updatedShape.id);
              } catch (err) {
                console.error('Failed to save shape geometry:', err);
              }
            } : undefined}
          />
        ))}

        {/* Drawing Toolbar (brokers only) - Hidden when Street View is active */}
        {showBrokerFeatures && (isDrawMode || editingLayerId) && !isStreetViewActive && (
          <DrawingToolbar
            map={mapInstance}
            isActive={isDrawMode || !!editingLayerId}
            selectedLayerId={editingLayerId}
            onShapeComplete={(drawnShape) => {
              if (isDrawMode) {
                // Quick draw mode: show save modal
                setPendingShape(drawnShape);
                setShowSaveShapeModal(true);
                setIsDrawMode(false);
              } else if (editingLayerId) {
                // Layer edit mode: save directly to layer
                mapLayerService.createShape({
                  layer_id: editingLayerId,
                  name: `${drawnShape.type} ${new Date().toLocaleTimeString()}`,
                  shape_type: drawnShape.type,
                  geometry: drawnShape.geometry,
                }).then(() => {
                  setCustomLayerRefreshTrigger(prev => prev + 1);
                }).catch(err => {
                  console.error('Failed to save shape:', err);
                });
              }
            }}
            onDone={() => {
              setEditingLayerId(null);
              setIsDrawMode(false);
              setSelectedShape(null);
              // Refresh to show saved geometry changes
              setCustomLayerRefreshTrigger(prev => prev + 1);
            }}
            onCancel={() => {
              setEditingLayerId(null);
              setIsDrawMode(false);
              setSelectedShape(null);
              // Refresh to discard unsaved visual changes
              setCustomLayerRefreshTrigger(prev => prev + 1);
            }}
            onFormatClick={handleFormatClick}
            hasSelectedShape={!!selectedShape}
          />
        )}

        {/* Selected Shape Actions - Show when a shape is selected in edit mode - Hidden when Street View is active */}
        {showBrokerFeatures && editingLayerId && selectedShape && !isStreetViewActive && (
          <div className="absolute bottom-20 left-1/2 transform -translate-x-1/2 z-[10000]">
            <div className="bg-white rounded-lg shadow-xl border-2 border-blue-500 p-3">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <div
                    className="w-4 h-4 rounded"
                    style={{ backgroundColor: selectedShape.color }}
                  />
                  <span className="text-sm font-medium text-gray-900">
                    {selectedShape.name || `${selectedShape.shape_type} shape`}
                  </span>
                </div>
                <div className="h-4 w-px bg-gray-300" />
                <button
                  onClick={() => setSelectedShape(null)}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
                >
                  Deselect
                </button>
                {/* Only show Simplify for polygon shapes */}
                {selectedShape.shape_type === 'polygon' && (
                  <button
                    onClick={async () => {
                      const pointCount = (selectedShape.geometry as any)?.coordinates?.length || 0;
                      if (pointCount < 10) {
                        return;
                      }
                      try {
                        const updated = await mapLayerService.simplifyShape(selectedShape.id);
                        setSelectedShape(updated);
                        setCustomLayerRefreshTrigger(prev => prev + 1);
                      } catch (err: any) {
                        console.error('Failed to simplify shape:', err);
                      }
                    }}
                    className="px-3 py-1.5 text-sm text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded"
                    title={`Reduce polygon points (currently ${(selectedShape.geometry as any)?.coordinates?.length || 0})`}
                  >
                    ✂️ Simplify ({(selectedShape.geometry as any)?.coordinates?.length || 0} pts)
                  </button>
                )}
                <button
                  onClick={async () => {
                    if (!confirm('Delete this shape? This cannot be undone.')) return;
                    try {
                      await mapLayerService.deleteShape(selectedShape.id);
                      setSelectedShape(null);
                      setCustomLayerRefreshTrigger(prev => prev + 1);
                    } catch (err: any) {
                      console.error('Failed to delete shape:', err);
                    }
                  }}
                  className="px-3 py-1.5 text-sm text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search Box - positioned at top of map, above other controls - Hidden when Street View is active */}
        <div className={`absolute top-2 left-2 ${isStreetViewActive ? 'hidden' : ''}`} style={{ width: '400px', zIndex: 10002 }}>
          <AddressSearchBox
            value={searchAddress}
            onChange={setSearchAddress}
            onSearch={handleSearch}
            isSearching={isSearching}
            placeholder="Search Address, City, State, or Property Name"
          />
        </div>

        {/* Draw and Layers Controls - positioned to the right of Map/Satellite and ruler buttons - Hidden when Street View is active */}
        <div className={`absolute top-[52px] left-[240px] z-[1000] flex items-center gap-1 ${isStreetViewActive ? 'hidden' : ''}`}>
          {/* Quick Draw Button (brokers only) - just pencil icon */}
          {showBrokerFeatures && (
            <button
              onClick={() => {
                setIsDrawMode(true);
                setEditingLayerId(null);
              }}
              className={`w-10 h-10 rounded shadow flex items-center justify-center text-lg ${
                isDrawMode
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100'
              }`}
              title="Draw a shape"
              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
            >
              ✏️
            </button>
          )}

          {/* Layers Button */}
          {displayLayers.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowLayersPanel(!showLayersPanel)}
                className={`h-10 px-3 rounded shadow flex items-center space-x-1 text-sm font-medium ${
                  editingLayerId
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
                title="Custom Layers"
                style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }}
              >
                Layers
              </button>

              {showLayersPanel && (
                <div className="absolute left-0 mt-1 w-96 bg-white border border-gray-200 rounded-lg shadow-lg z-[10001]">
                  <div className="p-2 border-b border-gray-100">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">
                        {showBrokerFeatures ? 'Custom Layers' : 'Shared Layers'}
                      </span>
                      {showBrokerFeatures && (
                        <a
                          href="/admin/layers"
                          className="text-xs text-blue-600 hover:underline"
                          onClick={() => setShowLayersPanel(false)}
                        >
                          Manage
                        </a>
                      )}
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {displayLayers.map(layer => (
                      <div
                        key={layer.id}
                        className={`p-2 border-b border-gray-50 hover:bg-gray-50 ${
                          editingLayerId === layer.id ? 'bg-blue-50' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center space-x-2 flex-1 min-w-0">
                            {/* Visibility toggle */}
                            <button
                              onClick={() => setLayerVisibility(prev => ({
                                ...prev,
                                [layer.id]: !prev[layer.id]
                              }))}
                              className={`relative flex-shrink-0 w-9 h-5 rounded-full transition-colors ${
                                layerVisibility[layer.id] !== false ? 'bg-blue-600' : 'bg-gray-300'
                              }`}
                            >
                              <span
                                className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
                                  layerVisibility[layer.id] !== false ? 'translate-x-4' : 'translate-x-0'
                                }`}
                              />
                            </button>
                            <div
                              className="w-3 h-3 rounded-sm flex-shrink-0"
                              style={{ backgroundColor: layer.default_color }}
                            />
                            <span className="text-sm text-gray-900 truncate">{layer.name}</span>
                          </div>
                          {/* Broker-only actions */}
                          {showBrokerFeatures && (
                            <div className="flex items-center">
                              <button
                                onClick={() => {
                                  if (editingLayerId === layer.id) {
                                    setEditingLayerId(null);
                                  } else {
                                    setEditingLayerId(layer.id);
                                    setIsDrawMode(false);
                                    if (!layerVisibility[layer.id]) {
                                      setLayerVisibility(prev => ({ ...prev, [layer.id]: true }));
                                    }
                                  }
                                  setShowLayersPanel(false);
                                }}
                                className={`ml-2 px-2 py-1 text-xs rounded ${
                                  editingLayerId === layer.id
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                }`}
                              >
                                {editingLayerId === layer.id ? 'Stop' : 'Edit'}
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  const newName = prompt('Rename layer:', layer.name);
                                  if (!newName || newName === layer.name) return;
                                  try {
                                    await mapLayerService.updateLayer(layer.id, { name: newName });
                                    setCustomLayerRefreshTrigger(prev => prev + 1);
                                    fetchAllLayers();
                                  } catch (err) {
                                    console.error('Failed to rename layer:', err);
                                  }
                                }}
                                className="ml-1 px-1 py-1 text-xs rounded text-gray-600 hover:bg-gray-100"
                                title="Rename layer"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setLayerToShare(layer);
                                  setShowShareLayerModal(true);
                                  setShowLayersPanel(false);
                                }}
                                className="ml-1 px-1 py-1 text-xs rounded text-blue-600 hover:bg-blue-50"
                                title="Share layer with clients"
                              >
                                📤
                              </button>
                              <button
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  if (!confirm(`Delete layer "${layer.name}"? This will also delete all shapes.`)) return;
                                  try {
                                    await mapLayerService.deleteLayer(layer.id);
                                    if (editingLayerId === layer.id) {
                                      setEditingLayerId(null);
                                    }
                                    setCustomLayerRefreshTrigger(prev => prev + 1);
                                    fetchAllLayers();
                                  } catch (err) {
                                    console.error('Failed to delete layer:', err);
                                  }
                                }}
                                className="ml-1 px-1 py-1 text-xs rounded text-red-600 hover:bg-red-50"
                                title="Delete layer"
                              >
                                🗑️
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Build Territory Button (brokers only) */}
                  {showBrokerFeatures && (
                    <div className="p-2 border-t border-gray-100">
                      <button
                        onClick={() => {
                          setShowBoundaryBuilder(true);
                          setShowLayersPanel(false);
                        }}
                        className="w-full px-3 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-indigo-700 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                        <span>Build Territory</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Stage Legend - Hidden when Street View is active */}
        <div className={`absolute bottom-4 left-4 z-10 ${isStreetViewActive ? 'hidden' : ''}`}>
          <SiteSubmitLegend
            visibleStages={visibleStages}
            totalCounts={stageCounts}
            forceExpanded={isLegendExpanded}
            onToggleExpanded={(expanded) => setIsLegendExpanded(expanded)}
            onStageToggle={handleStageToggle}
            onCategoryToggle={handleCategoryToggle}
            onShowAll={handleShowAll}
            onHideAll={handleHideAll}
          />
        </div>

        {/* Client Filter Indicator (for multi-client users) */}
        {accessibleClients.length > 1 && (
          <div className="absolute top-4 right-4 z-10">
            <div className="bg-white rounded-lg shadow-md px-4 py-2 text-sm">
              <span className="text-gray-500">Viewing: </span>
              <span className="font-medium text-gray-900">
                {selectedClientId
                  ? accessibleClients.find(c => c.id === selectedClientId)?.client_name
                  : 'All Clients'}
              </span>
            </div>
          </div>
        )}

        {/* Portal Detail Sidebar */}
        <PortalDetailSidebar
          siteSubmitId={selectedSiteSubmitId}
          isOpen={isSidebarOpen}
          onClose={handleCloseSidebar}
        />

        {/* Save Shape Modal - After quick draw (brokers only) */}
        {showBrokerFeatures && (
          <SaveShapeModal
            isOpen={showSaveShapeModal}
            drawnShape={pendingShape}
            onClose={() => {
              setShowSaveShapeModal(false);
              setPendingShape(null);
            }}
            onSaved={(layerId) => {
              setShowSaveShapeModal(false);
              setPendingShape(null);
              // Enable the layer visibility and refresh
              if (!layerVisibility[layerId]) {
                setLayerVisibility(prev => ({ ...prev, [layerId]: true }));
              }
              setCustomLayerRefreshTrigger(prev => prev + 1);
              fetchAllLayers();
            }}
            onContinueEditing={() => {
              // Close modal and return to drawing mode
              setShowSaveShapeModal(false);
              setPendingShape(null);
              setIsDrawMode(true);
            }}
          />
        )}

        {/* Share Layer Modal (brokers only) */}
        {showBrokerFeatures && layerToShare && (
          <ShareLayerModal
            isOpen={showShareLayerModal}
            layer={layerToShare}
            onClose={() => {
              setShowShareLayerModal(false);
              setLayerToShare(null);
            }}
            onSuccess={() => {
              setShowShareLayerModal(false);
              setLayerToShare(null);
              fetchAllLayers();
            }}
          />
        )}

        {/* Shape Editor Panel (brokers only - when editing a layer) */}
        {showBrokerFeatures && (
          <ShapeEditorPanel
              isOpen={showShapeEditor}
              shape={selectedShape}
              onClose={() => {
                setShowShapeEditor(false);
                setSelectedShape(null);
              }}
              onSave={handleShapeSave}
              onDelete={handleShapeDelete}
              onUpdateLayerDefaults={editingLayerId ? handleUpdateLayerDefaults : undefined}
            />
        )}

        {/* Boundary Builder Panel (brokers only) */}
        {showBrokerFeatures && (
          <BoundaryBuilderPanel
            isOpen={showBoundaryBuilder}
            onClose={() => setShowBoundaryBuilder(false)}
            map={mapInstance}
            onSaveCollection={handleSaveBoundaryCollection}
            onSaveMerged={handleSaveBoundaryMerged}
          />
        )}
      </div>
    </LayerManagerProvider>
  );
}
