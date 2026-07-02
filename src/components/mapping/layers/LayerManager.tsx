import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { mapLayerService, MapLayer } from '../../../services/mapLayerService';

// Layer configuration types
export interface LayerConfig {
  id: string;
  name: string;
  type: LayerType;
  icon: string;
  description?: string;
  defaultVisible: boolean;
  count?: number;
  isSystemLayer: boolean;
  permissions?: LayerPermissions; // For future use
  requiresPermission?: string; // Permission key — layer hidden from panel if user lacks it
}

export type LayerType = 'property' | 'site_submit' | 'restaurant' | 'custom' | 'traffic_count' | 'starbucks' | 'municipal_project' | 'cached_demographics' | 'merchants';

export type CachedDemographicsTimeRange = '7d' | '30d' | 'all';
export type CachedDemographicsScope = 'mine' | 'all';
export type CachedDemographicsMode = 'rings' | 'polygon';

// Which piece of data the Municipal Projects pins should render as an on-map
// label. 'total_units' = raw number (e.g. "80"). 'units_label' = the same
// computed string shown in the slideout / KML export (e.g. "+80 RC"). Session
// state only — resets on refresh.
export type MunicipalProjectsLabelMode = 'none' | 'total_units' | 'units_label';

export interface LayerPermissions {
  canView: boolean;
  canEdit: boolean;
  canShare: boolean;
  level: 'private' | 'client-group' | 'public';
}

export interface LayerState {
  [layerId: string]: {
    isVisible: boolean;
    isLoading: boolean;
    count: number;
    hasError: boolean;
    lastUpdated?: Date;
  };
}

export interface LayerManagerContextType {
  // Layer definitions
  layers: LayerConfig[];

  // Layer state
  layerState: LayerState;

  // Actions
  toggleLayer: (layerId: string) => void;
  setLayerCount: (layerId: string, count: number) => void;
  setLayerLoading: (layerId: string, isLoading: boolean) => void;
  setLayerError: (layerId: string, hasError: boolean) => void;
  refreshLayer: (layerId: string) => void;

  // Refresh triggers for layers to detect when to re-fetch
  refreshTrigger: {[layerId: string]: number};

  // Panel state
  isPanelOpen: boolean;
  togglePanel: () => void;

  // Create modes (for future pin dropping)
  createMode: CreateMode | null;
  setCreateMode: (mode: CreateMode | null) => void;

  // Custom map layers
  customLayers: MapLayer[];
  customLayerVisibility: { [layerId: string]: boolean };
  customLayersLoading: boolean;
  toggleCustomLayer: (layerId: string) => void;
  refreshCustomLayers: () => Promise<void>;

  // Municipal Projects layer — per-municipality visibility + per-status filter.
  // Stored as Sets of IDs that are EXCLUDED. An empty set = show everything (default).
  // Using "excluded" keeps the default behavior (show all) without us pre-loading
  // the full list of muni / stage IDs into state on first render.
  municipalProjectsHiddenMunicipalityIds: Set<string>;
  toggleMunicipalProjectsMunicipality: (municipalityId: string) => void;
  // `null` represents projects with no computed status (the "Planning fallback" bucket).
  municipalProjectsHiddenStageIds: Set<string | null>;
  toggleMunicipalProjectsStage: (stageId: string | null) => void;

  // Numeric filter on total_housing_units. null = unbounded on that side.
  // When either bound is set, projects with total_housing_units = NULL are also hidden.
  municipalProjectsMinUnits: number | null;
  municipalProjectsMaxUnits: number | null;
  setMunicipalProjectsMinUnits: (n: number | null) => void;
  setMunicipalProjectsMaxUnits: (n: number | null) => void;

  // Independent pin / polygon visibility (both default true). Turn one off to declutter.
  municipalProjectsShowPins: boolean;
  municipalProjectsShowPolygons: boolean;
  setMunicipalProjectsShowPins: (v: boolean) => void;
  setMunicipalProjectsShowPolygons: (v: boolean) => void;

  // On-map label rendered next to each Municipal Projects pin. Session-only.
  municipalProjectsLabelMode: MunicipalProjectsLabelMode;
  setMunicipalProjectsLabelMode: (m: MunicipalProjectsLabelMode) => void;

  // Label typography (session-only). fontSize in pixels; fill = text color;
  // line = the halo/stroke color that outlines the text so it stays readable
  // over any basemap.
  municipalProjectsLabelFontSize: number;
  setMunicipalProjectsLabelFontSize: (n: number) => void;
  municipalProjectsLabelFillColor: string;
  setMunicipalProjectsLabelFillColor: (c: string) => void;
  municipalProjectsLabelLineColor: string;
  setMunicipalProjectsLabelLineColor: (c: string) => void;

  // Cached Demographics layer filters. Defaults match the plan in
  // docs/DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md.
  cachedDemographicsTimeRange: CachedDemographicsTimeRange;
  setCachedDemographicsTimeRange: (r: CachedDemographicsTimeRange) => void;
  cachedDemographicsScope: CachedDemographicsScope;
  setCachedDemographicsScope: (s: CachedDemographicsScope) => void;
  cachedDemographicsModes: Set<CachedDemographicsMode>;
  toggleCachedDemographicsMode: (m: CachedDemographicsMode) => void;

  // Merchants layer — selected brand IDs (drawer filter).
  // Empty set = no pins rendered (avoid dumping 21k pins by default).
  merchantSelectedBrandIds: Set<string>;
  setMerchantSelectedBrandIds: (next: Set<string>) => void;
  toggleMerchantBrand: (brandId: string) => void;

  // Merchants — "Show all in viewport" override. When true, MerchantLayer
  // ignores selectedBrandIds and fetches every merchant location in the
  // current viewport. Zoom-gated in the drawer (>=13) so users can't
  // accidentally dump 21k pins on a zoomed-out map.
  merchantShowAllInViewport: boolean;
  setMerchantShowAllInViewport: (v: boolean) => void;
}

export type CreateMode = 'property' | 'site_submit' | 'municipal_project';

// Default system layers
const DEFAULT_LAYERS: LayerConfig[] = [
  {
    id: 'restaurants',
    name: 'Restaurant Sales',
    type: 'restaurant',
    icon: '🍔',
    description: 'Restaurant locations with sales trend data',
    defaultVisible: false,
    isSystemLayer: true,
  },
  {
    id: 'properties',
    name: 'Properties',
    type: 'property',
    icon: '🏢',
    description: 'All properties in the system',
    defaultVisible: false,
    isSystemLayer: true,
  },
  {
    id: 'site_submits',
    name: 'Site Submits',
    type: 'site_submit',
    icon: '📍',
    description: 'Site submission data with stage-based visualization',
    defaultVisible: false,
    isSystemLayer: true,
  },
  {
    id: 'traffic_counts',
    name: 'Traffic Counts',
    type: 'traffic_count',
    icon: '🚗',
    description: 'Road segment AADT data from StreetLight',
    defaultVisible: false,
    isSystemLayer: true,
  },
  {
    id: 'starbucks',
    name: 'Starbucks Stores',
    type: 'starbucks',
    icon: '☕',
    description: 'Confidential Starbucks store data',
    defaultVisible: false,
    isSystemLayer: true,
    requiresPermission: 'can_view_starbucks_layer',
  },
  {
    id: 'starbucks_atlas_logos',
    name: 'SBUX Atlas Logos',
    type: 'starbucks',
    icon: '🟢',
    description: 'Same stores as Starbucks Stores, with a distinct logo per store type (DT / Cafe / DTO)',
    defaultVisible: false,
    isSystemLayer: true,
    requiresPermission: 'can_view_starbucks_layer',
  },
  {
    id: 'starbucks_licensed_stores',
    name: 'Starbucks: Licensed Stores',
    type: 'starbucks',
    icon: '🏷️',
    description: 'Starbucks Licensed Store locations (Cafe / Drive Thru / Kiosk)',
    defaultVisible: false,
    isSystemLayer: true,
    requiresPermission: 'can_view_starbucks_layer',
  },
  {
    id: 'starbucks_target_areas',
    name: 'Starbucks: GA Target Areas',
    type: 'starbucks',
    icon: '🎯',
    description: 'Starbucks GA market target-area polygons (319 features)',
    defaultVisible: false,
    isSystemLayer: true,
    requiresPermission: 'can_view_starbucks_layer',
  },
  {
    id: 'municipal_projects',
    name: 'Municipal Projects',
    type: 'municipal_project',
    icon: '🏗️',
    description: 'Development projects imported from municipality CSVs',
    defaultVisible: false,
    isSystemLayer: true,
  },
  {
    id: 'cached_demographics',
    name: 'Cached Demographics',
    type: 'cached_demographics',
    icon: '📊',
    description: 'Past ESRI enrichment lookups — click a pin to reopen the slideout without a new ESRI call',
    defaultVisible: false,
    isSystemLayer: true,
  },
  {
    id: 'merchants',
    name: 'Merchants',
    type: 'merchants',
    icon: '🏬',
    description: 'Branded retail / restaurant / service locations with brand-logo pins',
    defaultVisible: false,
    isSystemLayer: true,
  },
];

const LayerManagerContext = createContext<LayerManagerContextType | undefined>(undefined);

export const useLayerManager = () => {
  const context = useContext(LayerManagerContext);
  if (!context) {
    throw new Error('useLayerManager must be used within a LayerManagerProvider');
  }
  return context;
};

interface LayerManagerProviderProps {
  children: React.ReactNode;
}

export const LayerManagerProvider: React.FC<LayerManagerProviderProps> = ({ children }) => {
  const [layers] = useState<LayerConfig[]>(DEFAULT_LAYERS);
  const [layerState, setLayerState] = useState<LayerState>({});
  const [isPanelOpen, setIsPanelOpen] = useState(true); // Default open for development
  const [createMode, setCreateMode] = useState<CreateMode | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState<{[layerId: string]: number}>({});

  // Custom map layers state
  const [customLayers, setCustomLayers] = useState<MapLayer[]>([]);
  const [customLayerVisibility, setCustomLayerVisibility] = useState<{ [layerId: string]: boolean }>({});
  const [customLayersLoading, setCustomLayersLoading] = useState(false);

  // Municipal Projects filter state (per-muni, per-status). Excluded-by-default model.
  const [municipalProjectsHiddenMunicipalityIds, setMunicipalProjectsHiddenMunicipalityIds] =
    useState<Set<string>>(new Set());
  const [municipalProjectsHiddenStageIds, setMunicipalProjectsHiddenStageIds] =
    useState<Set<string | null>>(new Set());
  const [municipalProjectsMinUnits, setMunicipalProjectsMinUnits] = useState<number | null>(null);
  const [municipalProjectsMaxUnits, setMunicipalProjectsMaxUnits] = useState<number | null>(null);
  const [municipalProjectsShowPins, setMunicipalProjectsShowPins] = useState<boolean>(true);
  const [municipalProjectsShowPolygons, setMunicipalProjectsShowPolygons] = useState<boolean>(true);
  const [municipalProjectsLabelMode, setMunicipalProjectsLabelMode] =
    useState<MunicipalProjectsLabelMode>('none');
  const [municipalProjectsLabelFontSize, setMunicipalProjectsLabelFontSize] =
    useState<number>(11);
  const [municipalProjectsLabelFillColor, setMunicipalProjectsLabelFillColor] =
    useState<string>('#002147'); // brand midnight
  const [municipalProjectsLabelLineColor, setMunicipalProjectsLabelLineColor] =
    useState<string>('#FFFFFF'); // white halo — high contrast on any basemap

  const [cachedDemographicsTimeRange, setCachedDemographicsTimeRange] =
    useState<CachedDemographicsTimeRange>('30d');
  const [cachedDemographicsScope, setCachedDemographicsScope] =
    useState<CachedDemographicsScope>('mine');
  const [cachedDemographicsModes, setCachedDemographicsModes] = useState<
    Set<CachedDemographicsMode>
  >(new Set(['rings', 'polygon']));

  const toggleCachedDemographicsMode = useCallback(
    (m: CachedDemographicsMode) => {
      setCachedDemographicsModes((prev) => {
        const next = new Set(prev);
        if (next.has(m)) next.delete(m);
        else next.add(m);
        return next;
      });
    },
    [],
  );

  const [merchantSelectedBrandIds, setMerchantSelectedBrandIdsState] = useState<Set<string>>(
    new Set(),
  );
  const setMerchantSelectedBrandIds = useCallback((next: Set<string>) => {
    setMerchantSelectedBrandIdsState(new Set(next));
  }, []);
  const toggleMerchantBrand = useCallback((brandId: string) => {
    setMerchantSelectedBrandIdsState((prev) => {
      const next = new Set(prev);
      if (next.has(brandId)) next.delete(brandId);
      else next.add(brandId);
      return next;
    });
  }, []);

  const [merchantShowAllInViewport, setMerchantShowAllInViewport] = useState(false);

  // Initialize layer state once
  useEffect(() => {
    console.log('🗺️ LayerManager initializing with layers:', DEFAULT_LAYERS.map(l => l.id));
    const initialState: LayerState = {};
    DEFAULT_LAYERS.forEach(layer => {
      initialState[layer.id] = {
        isVisible: layer.defaultVisible,
        isLoading: false,
        count: 0,
        hasError: false,
      };
    });
    console.log('🗺️ LayerManager initial state:', initialState);
    setLayerState(initialState);
  }, []); // Empty dependency array - run only once

  // Fetch custom map layers
  const fetchCustomLayers = useCallback(async () => {
    setCustomLayersLoading(true);
    try {
      const layers = await mapLayerService.getLayers({ includeShapes: true });
      console.log('🗺️ Fetched custom layers:', layers.map(l => ({ name: l.name, shapes: l.shapes?.length })));
      setCustomLayers(layers);
      // Initialize visibility for new layers (default to false)
      setCustomLayerVisibility(prev => {
        const updated = { ...prev };
        layers.forEach(layer => {
          if (updated[layer.id] === undefined) {
            updated[layer.id] = false;
          }
        });
        return updated;
      });
    } catch (err) {
      console.error('Error fetching custom layers:', err);
    } finally {
      setCustomLayersLoading(false);
    }
  }, []);

  // Fetch custom layers on mount
  useEffect(() => {
    fetchCustomLayers();
  }, [fetchCustomLayers]);

  const toggleLayer = useCallback((layerId: string) => {
    setLayerState(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        isVisible: !prev[layerId]?.isVisible,
      }
    }));
  }, []);

  const setLayerCount = useCallback((layerId: string, count: number) => {
    setLayerState(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        count,
        lastUpdated: new Date(),
      }
    }));
  }, []);

  const setLayerLoading = useCallback((layerId: string, isLoading: boolean) => {
    setLayerState(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        isLoading,
      }
    }));
  }, []);

  const setLayerError = useCallback((layerId: string, hasError: boolean) => {
    setLayerState(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        hasError,
      }
    }));
  }, []);

  const refreshLayer = useCallback((layerId: string) => {
    console.log(`🔄 Refreshing layer: ${layerId}`);
    // Set loading state
    setLayerState(prev => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        isLoading: true,
      }
    }));
    // Increment refresh trigger to force re-fetch in layer components
    setRefreshTrigger(prev => ({
      ...prev,
      [layerId]: (prev[layerId] || 0) + 1
    }));
  }, []);

  const togglePanel = useCallback(() => {
    setIsPanelOpen(prev => !prev);
  }, []);

  // Toggle custom layer visibility
  const toggleCustomLayer = useCallback((layerId: string) => {
    setCustomLayerVisibility(prev => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  }, []);

  // Refresh custom layers (returns promise so callers can await)
  const refreshCustomLayers = useCallback(async () => {
    await fetchCustomLayers();
  }, [fetchCustomLayers]);

  const toggleMunicipalProjectsMunicipality = useCallback((municipalityId: string) => {
    setMunicipalProjectsHiddenMunicipalityIds(prev => {
      const next = new Set(prev);
      if (next.has(municipalityId)) next.delete(municipalityId);
      else next.add(municipalityId);
      return next;
    });
  }, []);

  const toggleMunicipalProjectsStage = useCallback((stageId: string | null) => {
    setMunicipalProjectsHiddenStageIds(prev => {
      const next = new Set(prev);
      if (next.has(stageId)) next.delete(stageId);
      else next.add(stageId);
      return next;
    });
  }, []);

  const memoizedRefreshTrigger = useMemo(() => refreshTrigger, [
    JSON.stringify(refreshTrigger)
  ]);

  const value: LayerManagerContextType = useMemo(() => ({
    layers,
    layerState,
    toggleLayer,
    setLayerCount,
    setLayerLoading,
    setLayerError,
    refreshLayer,
    refreshTrigger: memoizedRefreshTrigger,
    isPanelOpen,
    togglePanel,
    createMode,
    setCreateMode,
    customLayers,
    customLayerVisibility,
    customLayersLoading,
    toggleCustomLayer,
    refreshCustomLayers,
    municipalProjectsHiddenMunicipalityIds,
    toggleMunicipalProjectsMunicipality,
    municipalProjectsHiddenStageIds,
    toggleMunicipalProjectsStage,
    municipalProjectsMinUnits,
    municipalProjectsMaxUnits,
    setMunicipalProjectsMinUnits,
    setMunicipalProjectsMaxUnits,
    municipalProjectsShowPins,
    municipalProjectsShowPolygons,
    setMunicipalProjectsShowPins,
    setMunicipalProjectsShowPolygons,
    municipalProjectsLabelMode,
    setMunicipalProjectsLabelMode,
    municipalProjectsLabelFontSize,
    setMunicipalProjectsLabelFontSize,
    municipalProjectsLabelFillColor,
    setMunicipalProjectsLabelFillColor,
    municipalProjectsLabelLineColor,
    setMunicipalProjectsLabelLineColor,
    cachedDemographicsTimeRange,
    setCachedDemographicsTimeRange,
    cachedDemographicsScope,
    setCachedDemographicsScope,
    cachedDemographicsModes,
    toggleCachedDemographicsMode,
    merchantSelectedBrandIds,
    setMerchantSelectedBrandIds,
    toggleMerchantBrand,
    merchantShowAllInViewport,
    setMerchantShowAllInViewport,
  }), [
    layers,
    layerState,
    toggleLayer,
    setLayerCount,
    setLayerLoading,
    setLayerError,
    refreshLayer,
    memoizedRefreshTrigger,
    isPanelOpen,
    togglePanel,
    createMode,
    setCreateMode,
    customLayers,
    customLayerVisibility,
    customLayersLoading,
    toggleCustomLayer,
    refreshCustomLayers,
    municipalProjectsHiddenMunicipalityIds,
    toggleMunicipalProjectsMunicipality,
    municipalProjectsHiddenStageIds,
    toggleMunicipalProjectsStage,
    municipalProjectsMinUnits,
    municipalProjectsMaxUnits,
    municipalProjectsShowPins,
    municipalProjectsShowPolygons,
    municipalProjectsLabelMode,
    municipalProjectsLabelFontSize,
    municipalProjectsLabelFillColor,
    municipalProjectsLabelLineColor,
    cachedDemographicsTimeRange,
    cachedDemographicsScope,
    cachedDemographicsModes,
    toggleCachedDemographicsMode,
    merchantSelectedBrandIds,
    setMerchantSelectedBrandIds,
    toggleMerchantBrand,
    merchantShowAllInViewport,
  ]);

  return (
    <LayerManagerContext.Provider value={value}>
      {children}
    </LayerManagerContext.Provider>
  );
};

export default LayerManagerProvider;