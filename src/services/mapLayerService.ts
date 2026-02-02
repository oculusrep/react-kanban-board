import { supabase } from '../lib/supabaseClient';

// ============================================================================
// Types
// ============================================================================

export interface MapLayer {
  id: string;
  name: string;
  description: string | null;
  layer_type: 'custom' | 'us_state' | 'county';
  default_color: string;
  default_stroke_color: string;
  default_opacity: number;
  default_stroke_width: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
  updated_by_id: string | null;
  shapes?: MapLayerShape[];
  client_shares?: MapLayerClientShare[];
}

export interface MapLayerShape {
  id: string;
  layer_id: string;
  name: string | null;
  shape_type: 'polygon' | 'circle' | 'polyline' | 'rectangle';
  geometry: GeoJSONGeometry;
  color: string;
  stroke_color: string;
  fill_opacity: number;
  stroke_width: number;
  description: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  created_by_id: string | null;
  updated_by_id: string | null;
}

export interface MapLayerClientShare {
  id: string;
  layer_id: string | null;
  source_layer_id: string | null;
  client_id: string;
  share_type: 'reference' | 'copy';
  is_visible_by_default: boolean;
  shared_at: string;
  shared_by_id: string | null;
  created_at: string;
  updated_at: string;
  client?: {
    id: string;
    client_name: string;
  };
}

// GeoJSON-compatible geometry types
export type GeoJSONGeometry =
  | { type: 'polygon'; coordinates: [number, number][] }
  | { type: 'rectangle'; coordinates: [number, number][] }
  | { type: 'circle'; center: [number, number]; radius: number }
  | { type: 'polyline'; coordinates: [number, number][] };

// Input types for creating/updating
export interface CreateLayerInput {
  name: string;
  description?: string;
  layer_type?: 'custom' | 'us_state' | 'county';
  default_color?: string;
  default_stroke_color?: string;
  default_opacity?: number;
  default_stroke_width?: number;
}

export interface UpdateLayerInput {
  name?: string;
  description?: string;
  default_color?: string;
  default_stroke_color?: string;
  default_opacity?: number;
  default_stroke_width?: number;
  is_active?: boolean;
}

export interface CreateShapeInput {
  layer_id: string;
  name?: string;
  shape_type: 'polygon' | 'circle' | 'polyline' | 'rectangle';
  geometry: GeoJSONGeometry;
  color?: string;
  stroke_color?: string;
  fill_opacity?: number;
  stroke_width?: number;
  description?: string;
  sort_order?: number;
}

export interface UpdateShapeInput {
  name?: string;
  geometry?: GeoJSONGeometry;
  color?: string;
  stroke_color?: string;
  fill_opacity?: number;
  stroke_width?: number;
  description?: string;
  sort_order?: number;
}

// ============================================================================
// Service Class
// ============================================================================

class MapLayerService {
  // --------------------------------------------------------------------------
  // Layer CRUD
  // --------------------------------------------------------------------------

  async createLayer(data: CreateLayerInput): Promise<MapLayer> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    const { data: layer, error } = await supabase
      .from('map_layer')
      .insert({
        name: data.name,
        description: data.description || null,
        layer_type: data.layer_type || 'custom',
        default_color: data.default_color || '#3b82f6',
        default_opacity: data.default_opacity ?? 0.35,
        default_stroke_width: data.default_stroke_width ?? 2,
        created_by_id: userId,
        updated_by_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating layer:', error);
      throw error;
    }

    return layer as MapLayer;
  }

  async updateLayer(id: string, data: UpdateLayerInput): Promise<MapLayer> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    const { data: layer, error } = await supabase
      .from('map_layer')
      .update({
        ...data,
        updated_by_id: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating layer:', error);
      throw error;
    }

    return layer as MapLayer;
  }

  async deleteLayer(id: string): Promise<void> {
    const { error } = await supabase
      .from('map_layer')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting layer:', error);
      throw error;
    }
  }

  async getLayer(id: string, includeShapes: boolean = false): Promise<MapLayer | null> {
    let query = supabase
      .from('map_layer')
      .select(includeShapes ? '*, shapes:map_layer_shape(*)' : '*')
      .eq('id', id)
      .single();

    const { data, error } = await query;

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('Error getting layer:', error);
      throw error;
    }

    return data as MapLayer;
  }

  async getLayers(options: {
    includeShapes?: boolean;
    includeShares?: boolean;
    activeOnly?: boolean;
  } = {}): Promise<MapLayer[]> {
    const { includeShapes = false, includeShares = false, activeOnly = true } = options;

    let selectQuery = '*';
    if (includeShapes) {
      selectQuery += ', shapes:map_layer_shape(*)';
    }
    if (includeShares) {
      // Specify the foreign key to use since there are two (layer_id and source_layer_id)
      selectQuery += ', client_shares:map_layer_client_share!map_layer_client_share_layer_id_fkey(*, client:client(id, client_name))';
    }

    let query = supabase
      .from('map_layer')
      .select(selectQuery)
      .order('name');

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error getting layers:', error.message, error.code, error.details, error.hint);
      throw error;
    }

    return (data || []) as MapLayer[];
  }

  // --------------------------------------------------------------------------
  // Shape CRUD
  // --------------------------------------------------------------------------

  async createShape(data: CreateShapeInput): Promise<MapLayerShape> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    // Get layer defaults if color/opacity not specified
    let color = data.color;
    let strokeColor = data.stroke_color;
    let fillOpacity = data.fill_opacity;
    let strokeWidth = data.stroke_width;

    if (!color || !strokeColor || fillOpacity === undefined || strokeWidth === undefined) {
      const layer = await this.getLayer(data.layer_id);
      if (layer) {
        color = color || layer.default_color;
        strokeColor = strokeColor || layer.default_stroke_color || layer.default_color;
        fillOpacity = fillOpacity ?? layer.default_opacity;
        strokeWidth = strokeWidth ?? layer.default_stroke_width;
      }
    }

    const { data: shape, error } = await supabase
      .from('map_layer_shape')
      .insert({
        layer_id: data.layer_id,
        name: data.name || null,
        shape_type: data.shape_type,
        geometry: data.geometry,
        color: color || '#3b82f6',
        stroke_color: strokeColor || color || '#3b82f6',
        fill_opacity: fillOpacity ?? 0.35,
        stroke_width: strokeWidth ?? 2,
        description: data.description || null,
        sort_order: data.sort_order ?? 0,
        created_by_id: userId,
        updated_by_id: userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating shape:', error);
      throw error;
    }

    return shape as MapLayerShape;
  }

  async updateShape(id: string, data: UpdateShapeInput): Promise<MapLayerShape> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    const { data: shape, error } = await supabase
      .from('map_layer_shape')
      .update({
        ...data,
        updated_by_id: userId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating shape:', error);
      throw error;
    }

    return shape as MapLayerShape;
  }

  async deleteShape(id: string): Promise<void> {
    const { error } = await supabase
      .from('map_layer_shape')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting shape:', error);
      throw error;
    }
  }

  async getShapesForLayer(layerId: string): Promise<MapLayerShape[]> {
    const { data, error } = await supabase
      .from('map_layer_shape')
      .select('*')
      .eq('layer_id', layerId)
      .order('sort_order')
      .order('created_at');

    if (error) {
      console.error('Error getting shapes:', error);
      throw error;
    }

    return (data || []) as MapLayerShape[];
  }

  // --------------------------------------------------------------------------
  // Client Sharing
  // --------------------------------------------------------------------------

  async shareLayerToClient(
    layerId: string,
    clientId: string,
    shareType: 'reference' | 'copy' = 'reference'
  ): Promise<MapLayerClientShare> {
    const { data: session } = await supabase.auth.getSession();
    const userId = session?.session?.user?.id;

    if (shareType === 'copy') {
      // Create a copy of the layer for the client
      const originalLayer = await this.getLayer(layerId, true);
      if (!originalLayer) {
        throw new Error('Layer not found');
      }

      // Create the copied layer
      const copiedLayer = await this.createLayer({
        name: `${originalLayer.name} (Copy for Client)`,
        description: originalLayer.description || undefined,
        layer_type: originalLayer.layer_type,
        default_color: originalLayer.default_color,
        default_opacity: originalLayer.default_opacity,
        default_stroke_width: originalLayer.default_stroke_width,
      });

      // Copy all shapes
      if (originalLayer.shapes && originalLayer.shapes.length > 0) {
        for (const shape of originalLayer.shapes) {
          await this.createShape({
            layer_id: copiedLayer.id,
            name: shape.name || undefined,
            shape_type: shape.shape_type,
            geometry: shape.geometry,
            color: shape.color,
            stroke_color: shape.stroke_color,
            fill_opacity: shape.fill_opacity,
            stroke_width: shape.stroke_width,
            description: shape.description || undefined,
            sort_order: shape.sort_order,
          });
        }
      }

      // Create share record pointing to copied layer
      const { data: share, error } = await supabase
        .from('map_layer_client_share')
        .insert({
          layer_id: copiedLayer.id,
          source_layer_id: layerId,
          client_id: clientId,
          share_type: 'copy',
          is_visible_by_default: true,
          shared_by_id: userId,
        })
        .select('*, client:client(id, client_name)')
        .single();

      if (error) {
        console.error('Error creating share:', error);
        throw error;
      }

      return share as MapLayerClientShare;
    } else {
      // Reference share - just link to original layer
      const { data: share, error } = await supabase
        .from('map_layer_client_share')
        .insert({
          layer_id: layerId,
          client_id: clientId,
          share_type: 'reference',
          is_visible_by_default: true,
          shared_by_id: userId,
        })
        .select('*, client:client(id, client_name)')
        .single();

      if (error) {
        console.error('Error creating share:', error);
        throw error;
      }

      return share as MapLayerClientShare;
    }
  }

  async unshareLayerFromClient(layerId: string, clientId: string): Promise<void> {
    // First check if it's a copy share
    const { data: share } = await supabase
      .from('map_layer_client_share')
      .select('*')
      .eq('layer_id', layerId)
      .eq('client_id', clientId)
      .single();

    if (share && share.share_type === 'copy') {
      // Delete the copied layer (will cascade delete the share)
      await this.deleteLayer(layerId);
    } else {
      // Just delete the share record
      const { error } = await supabase
        .from('map_layer_client_share')
        .delete()
        .eq('layer_id', layerId)
        .eq('client_id', clientId);

      if (error) {
        console.error('Error unsharing layer:', error);
        throw error;
      }
    }
  }

  async getClientShares(layerId: string): Promise<MapLayerClientShare[]> {
    const { data, error } = await supabase
      .from('map_layer_client_share')
      .select('*, client:client(id, client_name)')
      .or(`layer_id.eq.${layerId},source_layer_id.eq.${layerId}`)
      .order('shared_at', { ascending: false });

    if (error) {
      console.error('Error getting client shares:', error);
      throw error;
    }

    return (data || []) as MapLayerClientShare[];
  }

  async getLayersForClient(clientId: string): Promise<MapLayer[]> {
    // Get all shares for this client
    const { data: shares, error: sharesError } = await supabase
      .from('map_layer_client_share')
      .select('layer_id')
      .eq('client_id', clientId);

    if (sharesError) {
      console.error('Error getting client shares:', sharesError);
      throw sharesError;
    }

    if (!shares || shares.length === 0) {
      return [];
    }

    const layerIds = shares.map(s => s.layer_id).filter(Boolean);

    // Get the layers with their shapes
    const { data: layers, error: layersError } = await supabase
      .from('map_layer')
      .select('*, shapes:map_layer_shape(*)')
      .in('id', layerIds)
      .eq('is_active', true)
      .order('name');

    if (layersError) {
      console.error('Error getting layers:', layersError);
      throw layersError;
    }

    return (layers || []) as MapLayer[];
  }

  // --------------------------------------------------------------------------
  // File Import
  // --------------------------------------------------------------------------

  async importGeoJSON(layerId: string, fileContent: string): Promise<MapLayerShape[]> {
    const geojson = JSON.parse(fileContent);
    const shapes: MapLayerShape[] = [];

    const features = geojson.type === 'FeatureCollection'
      ? geojson.features
      : [geojson];

    for (const feature of features) {
      if (!feature.geometry) continue;

      const { type, coordinates } = feature.geometry;
      let shapeType: 'polygon' | 'polyline' | 'rectangle' = 'polygon';
      let geometry: GeoJSONGeometry;

      if (type === 'Polygon') {
        // GeoJSON polygons have coordinates as [[[lng, lat], ...]]
        // We need to convert to [[lat, lng], ...]
        const coords = coordinates[0].map((c: number[]) => [c[1], c[0]] as [number, number]);
        geometry = { type: 'polygon', coordinates: coords };
        shapeType = 'polygon';
      } else if (type === 'LineString') {
        const coords = coordinates.map((c: number[]) => [c[1], c[0]] as [number, number]);
        geometry = { type: 'polyline', coordinates: coords };
        shapeType = 'polyline';
      } else if (type === 'Point') {
        // Convert point to a small circle
        geometry = {
          type: 'circle',
          center: [coordinates[1], coordinates[0]],
          radius: 100 // Default 100m radius
        };
      } else {
        console.warn(`Unsupported geometry type: ${type}`);
        continue;
      }

      const shapeName = feature.properties?.name ||
                        feature.properties?.Name ||
                        feature.properties?.title ||
                        null;

      const shape = await this.createShape({
        layer_id: layerId,
        name: shapeName,
        shape_type: shapeType,
        geometry,
        description: feature.properties?.description || null,
      });

      shapes.push(shape);
    }

    return shapes;
  }

  async importKML(layerId: string, fileContent: string): Promise<MapLayerShape[]> {
    const parser = new DOMParser();
    const doc = parser.parseFromString(fileContent, 'text/xml');
    const shapes: MapLayerShape[] = [];

    // Get all Placemarks
    const placemarks = doc.querySelectorAll('Placemark');

    for (const placemark of Array.from(placemarks)) {
      const name = placemark.querySelector('name')?.textContent || null;
      const description = placemark.querySelector('description')?.textContent || null;

      // Check for Polygon
      const polygonCoords = placemark.querySelector('Polygon coordinates');
      if (polygonCoords) {
        const coords = this.parseKMLCoordinates(polygonCoords.textContent || '');
        if (coords.length > 0) {
          const shape = await this.createShape({
            layer_id: layerId,
            name,
            shape_type: 'polygon',
            geometry: { type: 'polygon', coordinates: coords },
            description,
          });
          shapes.push(shape);
        }
        continue;
      }

      // Check for LineString
      const lineCoords = placemark.querySelector('LineString coordinates');
      if (lineCoords) {
        const coords = this.parseKMLCoordinates(lineCoords.textContent || '');
        if (coords.length > 0) {
          const shape = await this.createShape({
            layer_id: layerId,
            name,
            shape_type: 'polyline',
            geometry: { type: 'polyline', coordinates: coords },
            description,
          });
          shapes.push(shape);
        }
        continue;
      }

      // Check for Point
      const pointCoords = placemark.querySelector('Point coordinates');
      if (pointCoords) {
        const coords = this.parseKMLCoordinates(pointCoords.textContent || '');
        if (coords.length > 0) {
          const shape = await this.createShape({
            layer_id: layerId,
            name,
            shape_type: 'polygon', // Represent point as small circle
            geometry: { type: 'circle', center: coords[0], radius: 100 },
            description,
          });
          shapes.push(shape);
        }
      }
    }

    return shapes;
  }

  private parseKMLCoordinates(coordString: string): [number, number][] {
    return coordString
      .trim()
      .split(/\s+/)
      .map(coord => {
        const [lng, lat] = coord.split(',').map(Number);
        return [lat, lng] as [number, number];
      })
      .filter(coord => !isNaN(coord[0]) && !isNaN(coord[1]));
  }
}

// Export singleton instance
export const mapLayerService = new MapLayerService();
export default mapLayerService;
