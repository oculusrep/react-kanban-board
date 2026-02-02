import { useState, useEffect, useCallback } from 'react';
import {
  mapLayerService,
  MapLayer,
  MapLayerShape,
  MapLayerClientShare,
  CreateLayerInput,
  UpdateLayerInput,
  CreateShapeInput,
  UpdateShapeInput,
} from '../services/mapLayerService';

interface UseMapLayersOptions {
  includeShapes?: boolean;
  includeShares?: boolean;
  activeOnly?: boolean;
  autoFetch?: boolean;
}

interface Result {
  success: boolean;
  error?: string;
}

export function useMapLayers(options: UseMapLayersOptions = {}) {
  const {
    includeShapes = false,
    includeShares = false,
    activeOnly = true,
    autoFetch = true,
  } = options;

  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch all layers
  const fetchLayers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await mapLayerService.getLayers({
        includeShapes,
        includeShares,
        activeOnly,
      });

      setLayers(data);
    } catch (err) {
      console.error('Error fetching layers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch layers');
    } finally {
      setLoading(false);
    }
  }, [includeShapes, includeShares, activeOnly]);

  // Auto-fetch on mount
  useEffect(() => {
    if (autoFetch) {
      fetchLayers();
    }
  }, [autoFetch, fetchLayers]);

  // Create layer
  const createLayer = useCallback(async (data: CreateLayerInput): Promise<Result & { layer?: MapLayer }> => {
    try {
      const layer = await mapLayerService.createLayer(data);
      await fetchLayers();
      return { success: true, layer };
    } catch (err) {
      console.error('Error creating layer:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create layer',
      };
    }
  }, [fetchLayers]);

  // Update layer
  const updateLayer = useCallback(async (id: string, data: UpdateLayerInput): Promise<Result> => {
    try {
      await mapLayerService.updateLayer(id, data);
      await fetchLayers();
      return { success: true };
    } catch (err) {
      console.error('Error updating layer:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update layer',
      };
    }
  }, [fetchLayers]);

  // Delete layer
  const deleteLayer = useCallback(async (id: string): Promise<Result> => {
    try {
      await mapLayerService.deleteLayer(id);
      await fetchLayers();
      return { success: true };
    } catch (err) {
      console.error('Error deleting layer:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete layer',
      };
    }
  }, [fetchLayers]);

  // Create shape
  const createShape = useCallback(async (data: CreateShapeInput): Promise<Result & { shape?: MapLayerShape }> => {
    try {
      const shape = await mapLayerService.createShape(data);
      if (includeShapes) {
        await fetchLayers();
      }
      return { success: true, shape };
    } catch (err) {
      console.error('Error creating shape:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to create shape',
      };
    }
  }, [fetchLayers, includeShapes]);

  // Update shape
  const updateShape = useCallback(async (id: string, data: UpdateShapeInput): Promise<Result> => {
    try {
      await mapLayerService.updateShape(id, data);
      if (includeShapes) {
        await fetchLayers();
      }
      return { success: true };
    } catch (err) {
      console.error('Error updating shape:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to update shape',
      };
    }
  }, [fetchLayers, includeShapes]);

  // Delete shape
  const deleteShape = useCallback(async (id: string): Promise<Result> => {
    try {
      await mapLayerService.deleteShape(id);
      if (includeShapes) {
        await fetchLayers();
      }
      return { success: true };
    } catch (err) {
      console.error('Error deleting shape:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to delete shape',
      };
    }
  }, [fetchLayers, includeShapes]);

  // Share layer to client
  const shareToClient = useCallback(async (
    layerId: string,
    clientId: string,
    shareType: 'reference' | 'copy' = 'reference'
  ): Promise<Result & { share?: MapLayerClientShare }> => {
    try {
      const share = await mapLayerService.shareLayerToClient(layerId, clientId, shareType);
      if (includeShares) {
        await fetchLayers();
      }
      return { success: true, share };
    } catch (err) {
      console.error('Error sharing layer:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to share layer',
      };
    }
  }, [fetchLayers, includeShares]);

  // Unshare layer from client
  const unshareFromClient = useCallback(async (layerId: string, clientId: string): Promise<Result> => {
    try {
      await mapLayerService.unshareLayerFromClient(layerId, clientId);
      if (includeShares) {
        await fetchLayers();
      }
      return { success: true };
    } catch (err) {
      console.error('Error unsharing layer:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to unshare layer',
      };
    }
  }, [fetchLayers, includeShares]);

  // Import GeoJSON
  const importGeoJSON = useCallback(async (
    layerId: string,
    fileContent: string
  ): Promise<Result & { shapes?: MapLayerShape[] }> => {
    try {
      const shapes = await mapLayerService.importGeoJSON(layerId, fileContent);
      if (includeShapes) {
        await fetchLayers();
      }
      return { success: true, shapes };
    } catch (err) {
      console.error('Error importing GeoJSON:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to import GeoJSON',
      };
    }
  }, [fetchLayers, includeShapes]);

  // Import KML
  const importKML = useCallback(async (
    layerId: string,
    fileContent: string
  ): Promise<Result & { shapes?: MapLayerShape[] }> => {
    try {
      const shapes = await mapLayerService.importKML(layerId, fileContent);
      if (includeShapes) {
        await fetchLayers();
      }
      return { success: true, shapes };
    } catch (err) {
      console.error('Error importing KML:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to import KML',
      };
    }
  }, [fetchLayers, includeShapes]);

  return {
    layers,
    loading,
    error,
    fetchLayers,
    createLayer,
    updateLayer,
    deleteLayer,
    createShape,
    updateShape,
    deleteShape,
    shareToClient,
    unshareFromClient,
    importGeoJSON,
    importKML,
  };
}

// Hook for getting layers for a specific client (portal use)
export function useClientMapLayers(clientId: string | null) {
  const [layers, setLayers] = useState<MapLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLayers = useCallback(async () => {
    if (!clientId) {
      setLayers([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const data = await mapLayerService.getLayersForClient(clientId);
      setLayers(data);
    } catch (err) {
      console.error('Error fetching client layers:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch layers');
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    fetchLayers();
  }, [fetchLayers]);

  return {
    layers,
    loading,
    error,
    fetchLayers,
  };
}

export default useMapLayers;
