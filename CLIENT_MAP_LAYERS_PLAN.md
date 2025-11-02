# Client Map Layers System - Implementation Plan

## Overview

Implement a comprehensive map layer system where **layers are associated with client accounts** rather than just user accounts. This allows sales teams to:
- Draw territories, service areas, and zones for specific clients
- Share layers across team members working with the same client
- Track coverage areas, delivery zones, restricted areas per client
- Visualize client-specific geographic data

## Use Cases

### 1. Territory Management
- **Sales Territories**: Draw polygons showing which sales rep covers which area for a client
- **Service Areas**: Define where a client provides services
- **Coverage Zones**: Mark areas where client has operations

### 2. Delivery & Logistics
- **Delivery Radius**: Circle showing delivery range from client location
- **Restricted Areas**: Mark no-go zones or areas requiring special handling
- **Route Planning**: Draw preferred routes for client deliveries

### 3. Marketing & Analysis
- **Target Areas**: Polygons showing demographics or marketing focus areas
- **Competition Zones**: Mark competitor locations and their coverage
- **Market Penetration**: Visualize client's market presence

### 4. Property & Real Estate
- **Property Boundaries**: Draw exact property lines for client properties
- **Development Zones**: Mark areas under development or consideration
- **Zoning Information**: Overlay zoning districts

## Database Schema

### Table: `client_map_layers`

This is the main table for storing map layers associated with clients.

```sql
CREATE TABLE client_map_layers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Client association
  client_id UUID REFERENCES client(id) ON DELETE CASCADE NOT NULL,

  -- Creator tracking
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Layer metadata
  layer_name VARCHAR(255) NOT NULL,
  layer_description TEXT,
  layer_category VARCHAR(100), -- 'territory', 'service_area', 'delivery', 'property', 'marketing', etc.

  -- Shape type
  shape_type VARCHAR(50) NOT NULL, -- 'polygon', 'circle', 'rectangle', 'polyline', 'marker'

  -- GeoJSON data
  geometry JSONB NOT NULL,

  -- Style properties
  stroke_color VARCHAR(7) DEFAULT '#FF0000',
  stroke_opacity NUMERIC(3,2) DEFAULT 0.8 CHECK (stroke_opacity >= 0 AND stroke_opacity <= 1),
  stroke_weight INTEGER DEFAULT 2 CHECK (stroke_weight >= 1 AND stroke_weight <= 10),
  fill_color VARCHAR(7) DEFAULT '#FF0000',
  fill_opacity NUMERIC(3,2) DEFAULT 0.35 CHECK (fill_opacity >= 0 AND fill_opacity <= 1),

  -- Visibility and display
  is_visible BOOLEAN DEFAULT true,
  z_index INTEGER DEFAULT 1, -- For layering order

  -- Measurements (calculated on save)
  area_sq_meters NUMERIC,     -- For polygons, circles, rectangles
  perimeter_meters NUMERIC,   -- For polygons, rectangles
  radius_meters NUMERIC,      -- For circles
  length_meters NUMERIC,      -- For polylines

  -- Additional metadata
  tags TEXT[], -- For filtering/categorization
  notes TEXT,  -- Additional information about the layer

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Soft delete
  deleted_at TIMESTAMPTZ DEFAULT NULL
);

-- Indexes
CREATE INDEX idx_client_map_layers_client_id ON client_map_layers(client_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_map_layers_shape_type ON client_map_layers(shape_type) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_map_layers_category ON client_map_layers(layer_category) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_map_layers_created_by ON client_map_layers(created_by_user_id);
CREATE INDEX idx_client_map_layers_created_at ON client_map_layers(created_at DESC);
CREATE INDEX idx_client_map_layers_visible ON client_map_layers(is_visible) WHERE deleted_at IS NULL;
CREATE INDEX idx_client_map_layers_geometry ON client_map_layers USING GIST((geometry::geometry)); -- Requires PostGIS

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_client_map_layers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_client_map_layers_updated_at
  BEFORE UPDATE ON client_map_layers
  FOR EACH ROW
  EXECUTE FUNCTION update_client_map_layers_updated_at();

-- Enable Row Level Security
ALTER TABLE client_map_layers ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view layers for clients they have access to
CREATE POLICY "Users can view client layers they have access to"
  ON client_map_layers FOR SELECT
  USING (
    deleted_at IS NULL AND
    EXISTS (
      SELECT 1 FROM client
      WHERE client.id = client_map_layers.client_id
      -- Add your client access logic here, e.g.:
      -- AND (client.assigned_user_id = auth.uid() OR client.team_id IN (SELECT team_id FROM user_teams WHERE user_id = auth.uid()))
    )
  );

-- Users can create layers for clients they have access to
CREATE POLICY "Users can create layers for accessible clients"
  ON client_map_layers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM client
      WHERE client.id = client_map_layers.client_id
      -- Add your client access logic here
    )
  );

-- Users can update layers they created or for clients they manage
CREATE POLICY "Users can update their own layers or managed client layers"
  ON client_map_layers FOR UPDATE
  USING (
    deleted_at IS NULL AND
    (created_by_user_id = auth.uid() OR
     EXISTS (
       SELECT 1 FROM client
       WHERE client.id = client_map_layers.client_id
       -- Add your client access logic here
     ))
  );

-- Users can soft-delete layers they created or for clients they manage
CREATE POLICY "Users can delete their own layers or managed client layers"
  ON client_map_layers FOR UPDATE
  USING (
    created_by_user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM client
      WHERE client.id = client_map_layers.client_id
      -- Add your client access logic here
    )
  )
  WITH CHECK (deleted_at IS NOT NULL); -- Only allow setting deleted_at
```

### Table: `layer_templates` (Optional)

Pre-defined layer templates that users can quickly apply to any client.

```sql
CREATE TABLE layer_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  template_name VARCHAR(255) NOT NULL,
  template_description TEXT,
  template_category VARCHAR(100),

  -- Default shape configuration
  shape_type VARCHAR(50) NOT NULL,
  default_radius_meters NUMERIC, -- For circle templates

  -- Default styling
  stroke_color VARCHAR(7) DEFAULT '#FF0000',
  stroke_opacity NUMERIC(3,2) DEFAULT 0.8,
  stroke_weight INTEGER DEFAULT 2,
  fill_color VARCHAR(7) DEFAULT '#FF0000',
  fill_opacity NUMERIC(3,2) DEFAULT 0.35,

  -- Availability
  is_public BOOLEAN DEFAULT true,
  created_by_user_id UUID REFERENCES auth.users(id),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Example templates
INSERT INTO layer_templates (template_name, template_description, template_category, shape_type, default_radius_meters, stroke_color, fill_color, fill_opacity) VALUES
  ('5-Mile Delivery Radius', 'Standard 5-mile delivery zone', 'delivery', 'circle', 8046.72, '#4285F4', '#4285F4', 0.2),
  ('10-Mile Service Area', 'Standard 10-mile service coverage', 'service_area', 'circle', 16093.4, '#34A853', '#34A853', 0.2),
  ('Sales Territory', 'Custom sales territory boundary', 'territory', 'polygon', NULL, '#EA4335', '#EA4335', 0.15),
  ('Property Boundary', 'Property or lot boundary', 'property', 'polygon', NULL, '#FBBC04', '#FBBC04', 0.25);
```

### View: `client_layers_with_metadata`

Convenient view that joins layer data with client information.

```sql
CREATE VIEW client_layers_with_metadata AS
SELECT
  cml.id,
  cml.client_id,
  c.name as client_name,
  c.address as client_address,
  cml.layer_name,
  cml.layer_description,
  cml.layer_category,
  cml.shape_type,
  cml.geometry,
  cml.stroke_color,
  cml.stroke_opacity,
  cml.stroke_weight,
  cml.fill_color,
  cml.fill_opacity,
  cml.is_visible,
  cml.z_index,
  cml.area_sq_meters,
  cml.perimeter_meters,
  cml.radius_meters,
  cml.length_meters,
  cml.tags,
  cml.notes,
  cml.created_by_user_id,
  u.email as created_by_email,
  cml.created_at,
  cml.updated_at
FROM client_map_layers cml
JOIN client c ON c.id = cml.client_id
LEFT JOIN auth.users u ON u.id = cml.created_by_user_id
WHERE cml.deleted_at IS NULL;
```

## API / Service Layer

### File: `src/services/clientLayerService.ts`

```typescript
import { supabase } from '../lib/supabaseClient';

export interface ClientLayer {
  id: string;
  client_id: string;
  layer_name: string;
  layer_description?: string;
  layer_category?: string;
  shape_type: 'polygon' | 'circle' | 'rectangle' | 'polyline' | 'marker';
  geometry: any; // GeoJSON
  stroke_color: string;
  stroke_opacity: number;
  stroke_weight: number;
  fill_color: string;
  fill_opacity: number;
  is_visible: boolean;
  z_index: number;
  area_sq_meters?: number;
  perimeter_meters?: number;
  radius_meters?: number;
  length_meters?: number;
  tags?: string[];
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get all layers for a specific client
 */
export async function getClientLayers(clientId: string): Promise<ClientLayer[]> {
  const { data, error } = await supabase
    .from('client_map_layers')
    .select('*')
    .eq('client_id', clientId)
    .is('deleted_at', null)
    .order('z_index', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Get layers by category for a client
 */
export async function getClientLayersByCategory(
  clientId: string,
  category: string
): Promise<ClientLayer[]> {
  const { data, error } = await supabase
    .from('client_map_layers')
    .select('*')
    .eq('client_id', clientId)
    .eq('layer_category', category)
    .is('deleted_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * Save a new layer for a client
 */
export async function saveClientLayer(
  clientId: string,
  layerData: Omit<ClientLayer, 'id' | 'client_id' | 'created_at' | 'updated_at'>
): Promise<ClientLayer> {
  const { data, error } = await supabase
    .from('client_map_layers')
    .insert({
      client_id: clientId,
      ...layerData,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Update an existing layer
 */
export async function updateClientLayer(
  layerId: string,
  updates: Partial<ClientLayer>
): Promise<ClientLayer> {
  const { data, error } = await supabase
    .from('client_map_layers')
    .update(updates)
    .eq('id', layerId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Soft delete a layer
 */
export async function deleteClientLayer(layerId: string): Promise<void> {
  const { error } = await supabase
    .from('client_map_layers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', layerId);

  if (error) throw error;
}

/**
 * Toggle layer visibility
 */
export async function toggleLayerVisibility(layerId: string, isVisible: boolean): Promise<void> {
  const { error } = await supabase
    .from('client_map_layers')
    .update({ is_visible: isVisible })
    .eq('id', layerId);

  if (error) throw error;
}

/**
 * Get all visible layers for multiple clients (for map view)
 */
export async function getVisibleLayersForClients(clientIds: string[]): Promise<ClientLayer[]> {
  const { data, error } = await supabase
    .from('client_map_layers')
    .select('*')
    .in('client_id', clientIds)
    .eq('is_visible', true)
    .is('deleted_at', null)
    .order('z_index', { ascending: true });

  if (error) throw error;
  return data || [];
}
```

## UI Components

### Component Hierarchy

```
MapWithClientLayers
├── DrawingToolbar
│   ├── RulerTool (✅ DONE)
│   ├── PolygonTool
│   ├── CircleTool
│   ├── RectangleTool
│   ├── PolylineTool
│   └── MarkerTool
├── ClientLayerPanel
│   ├── LayerList
│   │   └── LayerListItem (toggle visibility, edit, delete)
│   ├── LayerFilter (by category, shape type)
│   └── AddLayerButton
└── LayerStyleEditor
    ├── ColorPicker
    ├── OpacitySlider
    └── StrokeWeightSelector
```

### File: `src/components/mapping/ClientLayerPanel.tsx`

```typescript
interface ClientLayerPanelProps {
  clientId: string;
  map: google.maps.Map | null;
  onLayerSelect?: (layer: ClientLayer) => void;
}

export function ClientLayerPanel({ clientId, map, onLayerSelect }: ClientLayerPanelProps) {
  const [layers, setLayers] = useState<ClientLayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  useEffect(() => {
    loadLayers();
  }, [clientId, selectedCategory]);

  async function loadLayers() {
    setLoading(true);
    try {
      const data = selectedCategory
        ? await getClientLayersByCategory(clientId, selectedCategory)
        : await getClientLayers(clientId);
      setLayers(data);
    } catch (error) {
      console.error('Error loading layers:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleVisibility(layerId: string, isVisible: boolean) {
    await toggleLayerVisibility(layerId, isVisible);
    await loadLayers();
  }

  async function handleDelete(layerId: string) {
    if (confirm('Delete this layer?')) {
      await deleteClientLayer(layerId);
      await loadLayers();
    }
  }

  return (
    <div className="client-layer-panel">
      <div className="header">
        <h3>Client Layers</h3>
        <LayerCategoryFilter
          selectedCategory={selectedCategory}
          onCategoryChange={setSelectedCategory}
        />
      </div>

      {loading ? (
        <div>Loading layers...</div>
      ) : (
        <div className="layer-list">
          {layers.map(layer => (
            <LayerListItem
              key={layer.id}
              layer={layer}
              onToggleVisibility={handleToggleVisibility}
              onDelete={handleDelete}
              onSelect={() => onLayerSelect?.(layer)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

## Integration Points

### 1. Client Detail Page
- Show map with all layers for this client
- Allow adding/editing layers specific to this client
- Layer list in sidebar

### 2. Map View with Multiple Clients
- Load layers for all visible clients on map
- Color-code by client or category
- Filter layers by category/type
- Toggle visibility per client

### 3. Property Association
- Associate properties with client layers
- Show which properties fall within service areas/territories
- Calculate property distances from layer boundaries

## Example Workflows

### Workflow 1: Define Client Service Area

```typescript
// 1. User selects client from dropdown
const clientId = selectedClient.id;

// 2. User clicks "Draw Service Area" button
drawingManager.setDrawingMode(google.maps.drawing.OverlayType.CIRCLE);

// 3. User draws circle on map
drawingManager.addListener('circlecomplete', async (circle) => {
  const center = circle.getCenter();
  const radius = circle.getRadius();

  // 4. Save to database
  await saveClientLayer(clientId, {
    layer_name: '10-Mile Service Area',
    layer_category: 'service_area',
    shape_type: 'circle',
    geometry: {
      type: 'Point',
      coordinates: [center.lng(), center.lat()],
    },
    radius_meters: radius,
    stroke_color: '#4285F4',
    stroke_opacity: 0.8,
    stroke_weight: 2,
    fill_color: '#4285F4',
    fill_opacity: 0.2,
    is_visible: true,
    z_index: 1,
  });

  // 5. Circle stays on map, associated with client
  circle.setMap(map);
});
```

### Workflow 2: Load Client Layers on Page Load

```typescript
// In ClientDetailPage or MappingPage
useEffect(() => {
  async function loadClientLayers() {
    if (!map || !clientId) return;

    const layers = await getClientLayers(clientId);

    layers.forEach(layerData => {
      if (layerData.shape_type === 'circle') {
        const circle = new google.maps.Circle({
          center: {
            lat: layerData.geometry.coordinates[1],
            lng: layerData.geometry.coordinates[0],
          },
          radius: layerData.radius_meters,
          strokeColor: layerData.stroke_color,
          strokeOpacity: layerData.stroke_opacity,
          strokeWeight: layerData.stroke_weight,
          fillColor: layerData.fill_color,
          fillOpacity: layerData.fill_opacity,
          map: map,
          clickable: true,
        });

        // Add info window
        circle.addListener('click', () => {
          new google.maps.InfoWindow({
            content: `<div><h3>${layerData.layer_name}</h3><p>${layerData.layer_description || ''}</p></div>`,
            position: circle.getCenter(),
          }).open(map);
        });
      }
      // Similar for polygon, rectangle, polyline...
    });
  }

  loadClientLayers();
}, [map, clientId]);
```

## Next Steps

1. **Create database migration** - Add `client_map_layers` table
2. **Implement `clientLayerService.ts`** - Database operations
3. **Create Drawing Manager hook** - `useClientLayerDrawing`
4. **Build UI components** - Toolbar, layer panel, style editor
5. **Integrate with client pages** - Show layers on client detail/map pages
6. **Add layer templates** - Quick-start templates for common use cases

Would you like me to start implementing this system?
