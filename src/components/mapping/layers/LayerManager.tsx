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
}

export type LayerType = 'property' | 'site_submit' | 'restaurant' | 'custom';

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
}

export type CreateMode = 'property' | 'site_submit';

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
  }
  // Future layers can be added here
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
  ]);

  return (
    <LayerManagerContext.Provider value={value}>
      {children}
    </LayerManagerContext.Provider>
  );
};

export default LayerManagerProvider;