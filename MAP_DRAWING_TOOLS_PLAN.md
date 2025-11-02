# Map Drawing Tools Implementation Plan

## Completed: Distance Measurement

### Files Created
1. **`src/services/distanceService.ts`** - Core distance calculation service
   - Haversine formula for straight-line distance
   - Google Distance Matrix API integration for driving/walking/cycling/transit distances
   - Distance caching (30min) for performance
   - Multiple travel modes supported

2. **`src/hooks/useDistanceMeasurement.ts`** - React hook for distance measurement
   - State management for measurement points
   - Automatic distance calculations
   - Travel mode switching
   - Total distance aggregation

3. **`src/services/distanceHelpers.ts`** - Helper utilities
   - HTML formatting for info windows
   - Distance info objects for React components
   - Easy integration with existing components

4. **`src/components/mapping/RulerTool.tsx`** - Simple ruler button UI
   - Toggle ruler mode on/off
   - Google Maps-style interface

5. **`src/components/mapping/DistanceMeasurementControls.tsx`** - Full measurement UI
   - Travel mode selector
   - Measurement info panel
   - Undo/Clear buttons
   - Real-time distance display

6. **`DISTANCE_MEASUREMENT_GUIDE.md`** - Complete documentation

### Features Implemented
✅ Click-to-measure distance tool
✅ Straight-line distance ("as the crow flies")
✅ Driving distance and time
✅ Traffic-aware duration estimates
✅ Walking, Bicycling, Transit modes
✅ Multiple points with total distance
✅ Distance caching for performance
✅ Helper functions for info windows

---

## Next: Comprehensive Drawing Tools System

### Overview
Implement a full-featured drawing system similar to Google My Maps that allows users to:
- Draw polygons, circles, rectangles, and polylines
- Save drawn shapes to their account in Supabase
- Load and display saved shapes
- Edit and delete shapes
- Style shapes with custom colors/opacity
- Export shapes as GeoJSON

### Components to Build

#### 1. Drawing Manager Service
**File**: `src/services/drawingService.ts`

Features:
- Initialize Google Maps Drawing Manager
- Support all shape types (polygon, circle, rectangle, polyline, marker)
- Convert shapes to/from GeoJSON for database storage
- Shape validation and cleanup

#### 2. Drawing Tools UI Component
**File**: `src/components/mapping/DrawingTools.tsx`

Features:
- Toolbar with drawing mode buttons:
  - 📏 Ruler (distance measurement) - DONE
  - 📍 Marker
  - 📐 Polygon
  - ⭕ Circle
  - ▭ Rectangle
  - 〰️ Polyline
- Shape style controls (color, opacity, stroke width)
- Save/Cancel buttons when drawing
- Shape library panel (saved shapes list)

#### 3. Shape Manager Component
**File**: `src/components/mapping/ShapeManager.tsx`

Features:
- List of user's saved shapes
- Edit shape (name, style)
- Delete shape
- Toggle visibility
- Export to GeoJSON
- Import from GeoJSON

#### 4. Drawing State Hook
**File**: `src/hooks/useDrawingManager.ts`

Features:
- Manage drawing mode state
- Handle shape completion
- Coordinate with database saves
- Shape selection and editing

#### 5. Database Layer
**File**: `src/services/shapeStorageService.ts`

Features:
- Save shapes to Supabase
- Load user's shapes
- Update shape metadata
- Delete shapes
- Share shapes (public/private)

### Database Schema

#### Table: `map_shapes`

```sql
CREATE TABLE map_shapes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Shape metadata
  name VARCHAR(255) NOT NULL,
  description TEXT,
  shape_type VARCHAR(50) NOT NULL, -- 'polygon', 'circle', 'rectangle', 'polyline', 'marker'

  -- GeoJSON data
  geometry JSONB NOT NULL,

  -- Style properties
  stroke_color VARCHAR(7) DEFAULT '#FF0000',
  stroke_opacity NUMERIC(3,2) DEFAULT 0.8,
  stroke_weight INTEGER DEFAULT 2,
  fill_color VARCHAR(7) DEFAULT '#FF0000',
  fill_opacity NUMERIC(3,2) DEFAULT 0.35,

  -- Metadata
  is_public BOOLEAN DEFAULT false,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Optional calculated fields
  area_sq_meters NUMERIC,  -- For polygons and circles
  perimeter_meters NUMERIC, -- For polygons
  radius_meters NUMERIC,    -- For circles
  length_meters NUMERIC     -- For polylines
);

-- Indexes
CREATE INDEX idx_map_shapes_user_id ON map_shapes(user_id);
CREATE INDEX idx_map_shapes_shape_type ON map_shapes(shape_type);
CREATE INDEX idx_map_shapes_is_public ON map_shapes(is_public);
CREATE INDEX idx_map_shapes_created_at ON map_shapes(created_at DESC);
CREATE INDEX idx_map_shapes_geometry ON map_shapes USING GIST(geometry);

-- Enable Row Level Security
ALTER TABLE map_shapes ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own shapes"
  ON map_shapes FOR SELECT
  USING (auth.uid() = user_id OR is_public = true);

CREATE POLICY "Users can insert their own shapes"
  ON map_shapes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shapes"
  ON map_shapes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shapes"
  ON map_shapes FOR DELETE
  USING (auth.uid() = user_id);
```

#### Table: `shape_folders` (Optional - for organization)

```sql
CREATE TABLE shape_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  parent_folder_id UUID REFERENCES shape_folders(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add folder reference to map_shapes
ALTER TABLE map_shapes ADD COLUMN folder_id UUID REFERENCES shape_folders(id) ON DELETE SET NULL;
```

### Implementation Steps

#### Phase 1: Basic Drawing (Ruler is DONE ✅)
1. ✅ Implement ruler/distance measurement tool
2. ⏳ Initialize Google Drawing Manager with 'drawing' library
3. ⏳ Create DrawingTools UI component
4. ⏳ Implement polygon drawing
5. ⏳ Implement circle drawing
6. ⏳ Implement rectangle drawing
7. ⏳ Implement polyline drawing

#### Phase 2: Database Integration
1. ⏳ Create database schema
2. ⏳ Implement shapeStorageService
3. ⏳ Add save functionality
4. ⏳ Add load functionality
5. ⏳ Add update/delete functionality

#### Phase 3: Shape Management
1. ⏳ Create ShapeManager component
2. ⏳ Shape list display
3. ⏳ Shape editing UI
4. ⏳ Shape visibility toggle
5. ⏳ Shape deletion with confirmation

#### Phase 4: Advanced Features
1. ⏳ GeoJSON export/import
2. ⏳ Shape styling customization
3. ⏳ Shape measurements (area, perimeter)
4. ⏳ Shape labeling
5. ⏳ Public shape sharing
6. ⏳ Folder organization

### Code Examples

#### Using Drawing Manager

```typescript
import { useDrawingManager } from '../hooks/useDrawingManager';

function MapComponent() {
  const {
    drawingMode,
    setDrawingMode,
    shapes,
    saveShape,
    deleteShape,
    loadUserShapes,
  } = useDrawingManager();

  // Load shapes on mount
  useEffect(() => {
    loadUserShapes();
  }, []);

  // Handle shape completion
  const handleShapeComplete = async (shape: google.maps.Polygon | google.maps.Circle) => {
    const name = prompt('Enter shape name:');
    if (name) {
      await saveShape({
        name,
        shape,
        type: shape instanceof google.maps.Polygon ? 'polygon' : 'circle',
      });
    }
  };

  return (
    <>
      <DrawingTools
        mode={drawingMode}
        onModeChange={setDrawingMode}
        onShapeComplete={handleShapeComplete}
      />
      <ShapeManager
        shapes={shapes}
        onDelete={deleteShape}
      />
    </>
  );
}
```

#### Saving a Polygon

```typescript
import { savePolygon } from '../services/shapeStorageService';

async function saveMyPolygon(polygon: google.maps.Polygon) {
  const path = polygon.getPath().getArray();
  const coordinates = path.map(p => ({ lat: p.lat(), lng: p.lng() }));

  await savePolygon({
    name: 'My Service Area',
    description: 'Primary coverage zone',
    coordinates,
    strokeColor: '#FF0000',
    strokeOpacity: 0.8,
    strokeWeight: 2,
    fillColor: '#FF0000',
    fillOpacity: 0.35,
  });
}
```

#### Loading Shapes

```typescript
import { loadUserShapes } from '../services/shapeStorageService';

async function loadAndDisplayShapes(map: google.maps.Map) {
  const shapes = await loadUserShapes();

  shapes.forEach(shapeData => {
    if (shapeData.shape_type === 'polygon') {
      const polygon = new google.maps.Polygon({
        paths: shapeData.geometry.coordinates[0].map(c => ({ lat: c[1], lng: c[0] })),
        strokeColor: shapeData.stroke_color,
        strokeOpacity: shapeData.stroke_opacity,
        strokeWeight: shapeData.stroke_weight,
        fillColor: shapeData.fill_color,
        fillOpacity: shapeData.fill_opacity,
        map: map,
      });
    } else if (shapeData.shape_type === 'circle') {
      const circle = new google.maps.Circle({
        center: { lat: shapeData.geometry.coordinates[1], lng: shapeData.geometry.coordinates[0] },
        radius: shapeData.radius_meters,
        strokeColor: shapeData.stroke_color,
        strokeOpacity: shapeData.stroke_opacity,
        strokeWeight: shapeData.stroke_weight,
        fillColor: shapeData.fill_color,
        fillOpacity: shapeData.fill_opacity,
        map: map,
      });
    }
  });
}
```

### UI Mockup

```
┌─────────────────────────────────────────────────────────┐
│  Map                                                     │
│  ┌──────────────────────────────────┐ ┌──────────────┐ │
│  │                                  │ │ Drawing Tools│ │
│  │                                  │ ├──────────────┤ │
│  │         [Map Area]               │ │ 📏 Ruler     │ │
│  │                                  │ │ 📍 Marker    │ │
│  │         [Shapes]                 │ │ 📐 Polygon   │ │
│  │                                  │ │ ⭕ Circle    │ │
│  │                                  │ │ ▭ Rectangle  │ │
│  │                                  │ │ 〰️ Line      │ │
│  └──────────────────────────────────┘ └──────────────┘ │
│                                                          │
│  ┌────────────────────────────────────────────────────┐ │
│  │ My Shapes                                          │ │
│  ├────────────────────────────────────────────────────┤ │
│  │ 📐 Service Area #1         [Edit] [Delete] [👁]   │ │
│  │ ⭕ 5 Mile Radius           [Edit] [Delete] [👁]   │ │
│  │ 📐 Coverage Zone B         [Edit] [Delete] [👁]   │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Benefits

1. **Territory Management** - Define service areas, coverage zones
2. **Planning** - Mark restricted areas, plan routes
3. **Analysis** - Calculate areas, measure distances
4. **Collaboration** - Share shapes with team members
5. **Data Integration** - Export/import GeoJSON for other tools
6. **Persistence** - All shapes saved to user account

### Next Steps

1. Should I implement the full drawing tools system?
2. Do you want to start with just polygons and circles?
3. Any specific use cases you have in mind for the shapes?

Let me know how you'd like to proceed!
