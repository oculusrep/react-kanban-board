# Advanced Map Features Implementation Plan

## Overview
This document outlines the implementation plan for advanced mapping and territory management features, including drawing tools, administrative boundaries, drive-time isochrones, and radius zones. All features will be saved per customer account for persistent territory management.

---

## Phase 1: Drawing Tools & Custom Polygons
**Goal**: Allow users to draw and save custom territories on the map

### Features

#### 1.1 Drawing Controls
- **Polygon Tool**: Click points to create custom shapes
- **Rectangle Tool**: Drag to create rectangular areas
- **Circle Tool**: Click center, drag to set radius
- **Edit Mode**: Move vertices, reshape existing polygons
- **Delete Mode**: Remove shapes from the map

#### 1.2 Polygon Management
- Save polygons to customer account in database
- Name/label each territory
- Color coding for different territories
- Show/hide specific polygons via layer panel
- Calculate area (square miles/kilometers)
- Export polygon coordinates as GeoJSON

#### 1.3 Database Schema
```typescript
interface CustomerPolygon {
  id: string;
  customerId: string;
  name: string;
  type: 'polygon' | 'rectangle' | 'circle';
  coordinates: LatLng[];
  color: string;
  fillOpacity: number;
  strokeWeight: number;
  metadata: {
    area: number; // square miles
    createdAt: Date;
    updatedAt: Date;
    notes?: string;
  };
}
```

#### 1.4 Implementation Tasks
- [ ] Integrate Google Maps Drawing Manager
- [ ] Create polygon save/load API endpoints
- [ ] Build polygon edit/delete UI controls
- [ ] Implement area calculation using Turf.js
- [ ] Create database schema and migrations
- [ ] Add polygon naming and metadata UI
- [ ] Implement color picker for territories

---

## Phase 2: ZIP Code Polygon Layers
**Goal**: Display ZIP code boundaries and allow filtering/selection by ZIP

### Features

#### 2.1 ZIP Code Boundaries
- Load ZIP code polygon data from US Census TIGER/Line files
- Display ZIP boundaries as overlays on map
- Toggle ZIP layer visibility on/off
- Click ZIP to highlight and show information popup
- Search/filter by ZIP code

#### 2.2 ZIP Code Information
- ZIP code number
- City/cities within ZIP
- County name
- Population (optional, from census data)
- Area in square miles

#### 2.3 Customer ZIP Territory Assignment
- Save selected ZIPs to customer account
- Assign ZIPs to sales reps/territories
- Color-code assigned vs unassigned ZIPs
- Bulk select/deselect ZIP codes
- Export list of assigned ZIPs

#### 2.4 Data Sources
- **US Census Bureau TIGER/Line**: Free, public ZIP boundary data
- **Google Maps Geocoding API**: For ZIP code lookup and validation
- **Pre-processed GeoJSON files**: Stored in CDN for fast loading

#### 2.5 Database Schema
```typescript
interface CustomerZipCode {
  id: string;
  customerId: string;
  layerId: string;
  zipCode: string;
  assignedTo?: string; // User/rep ID
  color?: string;
  createdAt: Date;
}
```

#### 2.6 Implementation Tasks
- [ ] Source and download US Census TIGER/Line ZIP data
- [ ] Process and simplify ZIP polygons for web rendering
- [ ] Store GeoJSON files in CDN or database
- [ ] Implement ZIP layer rendering with Google Maps Data Layer
- [ ] Build ZIP selection UI (click, multi-select)
- [ ] Create ZIP territory assignment interface
- [ ] Implement ZIP search and filter functionality

---

## Phase 3: City & County Boundaries
**Goal**: Display administrative boundaries for organizational purposes

### Features

#### 3.1 City Boundaries
- Load city polygon data
- Filter cities by state
- Click to select entire city as territory
- Assign cities to sales territories
- Display city name labels on hover/click

#### 3.2 County Boundaries
- Load county polygon data
- State/county hierarchy navigation
- Click to select entire county
- County-level statistics (optional: population, area)
- Multi-county territory creation

#### 3.3 Territory Assignment
- Assign cities/counties to customer account
- Sales territory management by geographic unit
- Color-coded ownership visualization
- Overlap detection (warn if territories overlap)
- Territory export (list of assigned cities/counties)

#### 3.4 Database Schema
```typescript
interface CustomerCityCounty {
  id: string;
  customerId: string;
  type: 'city' | 'county';
  geoId: string; // FIPS code or unique identifier
  name: string;
  state: string;
  assignedTo?: string;
  color?: string;
  createdAt: Date;
}
```

#### 3.5 Implementation Tasks
- [ ] Source city and county boundary data
- [ ] Process and store boundary GeoJSON
- [ ] Implement city/county layer rendering
- [ ] Build state/county/city hierarchy UI
- [ ] Create territory assignment interface
- [ ] Implement overlap detection algorithm
- [ ] Add territory export functionality

---

## Phase 4: Drive Time Isochrones
**Goal**: Show areas reachable within specific drive times from origin points

### Features

#### 4.1 Isochrone Generation
- Click map to set origin point(s)
- Generate drive-time polygons: 5, 10, 15, 30, 60 minutes
- Support multiple origins (show coverage from multiple locations)
- Time-of-day consideration for traffic (morning, evening, weekend)
- Recalculate on demand

#### 4.2 Display Options
- Concentric rings with different colors (gradient)
- Transparency/opacity slider control
- Show/hide specific time ranges
- Toggle all isochrones on/off
- Legend showing time ranges and colors

#### 4.3 API Integration Options
- **Google Maps Distance Matrix API**: For isochrone calculation
- **Alternative: Mapbox Isochrone API**: Dedicated isochrone service
- **Alternative: OpenRouteService API**: Open-source option

#### 4.4 Save to Customer Account
```typescript
interface CustomerIsochrone {
  id: string;
  customerId: string;
  name: string;
  origin: LatLng;
  driveTimes: number[]; // [5, 10, 15, 30, 60] minutes
  generatedAt: Date;
  timeOfDay: 'now' | 'morning' | 'evening' | 'weekend';
  polygons: {
    minutes: number;
    coordinates: LatLng[];
  }[];
}
```

#### 4.5 Implementation Tasks
- [ ] Research and select isochrone API (Google/Mapbox/OpenRouteService)
- [ ] Implement API integration for isochrone generation
- [ ] Build origin point selection UI
- [ ] Create drive-time range selector (5, 10, 15, 30, 60 min)
- [ ] Implement time-of-day traffic consideration
- [ ] Add multi-origin support
- [ ] Create isochrone display controls (opacity, visibility)
- [ ] Implement save/load functionality

---

## Phase 5: Radius/Buffer Zones
**Goal**: Show circular areas around specific points

### Features

#### 5.1 Radius Drawing
- Click point on map, specify radius (miles or kilometers)
- Visual circle overlay with customizable appearance
- Multiple radius circles on same map
- Adjust radius by dragging circle edge
- Center point drag-and-drop repositioning

#### 5.2 Common Use Cases
- Store coverage areas (e.g., 5-mile delivery radius)
- Service radius zones
- Competition proximity analysis
- Delivery/service zone definition
- Marketing campaign geographic boundaries

#### 5.3 Radius Management
- Save radius zones to customer account
- Name each zone (e.g., "Store #1 Delivery Zone")
- Color coding for different zones
- Calculate area and circumference
- Export as GeoJSON or CSV

#### 5.4 Database Schema
```typescript
interface CustomerRadiusZone {
  id: string;
  customerId: string;
  name: string;
  center: LatLng;
  radiusMiles: number;
  color: string;
  fillOpacity: number;
  strokeWeight: number;
  metadata: {
    areaSquareMiles: number;
    circumferenceMiles: number;
    createdAt: Date;
    updatedAt: Date;
  };
}
```

#### 5.5 Implementation Tasks
- [ ] Implement radius drawing tool
- [ ] Create radius input UI (miles/km selector)
- [ ] Add radius adjustment by dragging edge
- [ ] Implement center point repositioning
- [ ] Build radius zone management panel
- [ ] Add save/load functionality
- [ ] Create radius zone export feature

---

## Phase 6: Layer Management System
**Goal**: Organize and control all map layers in one centralized interface

### Features

#### 6.1 Layer Panel UI
- Sidebar or dropdown panel showing all layer types
- Checkbox list for toggling visibility:
  - Custom polygons
  - ZIP codes
  - Cities
  - Counties
  - Drive-time isochrones
  - Radius circles
  - Properties/markers
  - GPS tracking
- Collapsible sections by layer type

#### 6.2 Layer Controls
- **Opacity Slider**: Per-layer transparency control (0-100%)
- **Z-Index Ordering**: Drag-and-drop to reorder which layers appear on top
- **Lock/Unlock Editing**: Prevent accidental changes to specific layers
- **Bulk Actions**: Show all, hide all, delete all for each layer type
- **Layer Info**: Show metadata (count, area covered, etc.)

#### 6.3 Layer Groups
- Create named layer groups (e.g., "Sales Territory A", "Q4 Campaign")
- Show/hide entire groups with one click
- Share layer groups between team members
- Copy/duplicate layer groups
- Export layer groups as GeoJSON package

#### 6.4 Database Schema
```typescript
interface CustomerMapLayer {
  id: string;
  customerId: string;
  type: 'polygon' | 'zipcode' | 'city' | 'county' | 'isochrone' | 'radius';
  name: string;
  visible: boolean;
  opacity: number; // 0-100
  color: string;
  zIndex: number;
  layerGroupId?: string;
  createdAt: Date;
  updatedAt: Date;
}

interface LayerGroup {
  id: string;
  customerId: string;
  name: string;
  description?: string;
  visible: boolean;
  sharedWith?: string[]; // Array of user IDs
  createdAt: Date;
  updatedAt: Date;
}

interface PolygonGeometry {
  id: string;
  layerId: string;
  coordinates: LatLng[][]; // Array of arrays for complex polygons with holes
  properties: Record<string, any>; // Flexible metadata storage
}
```

#### 6.5 Implementation Tasks
- [ ] Design and build layer panel UI component
- [ ] Implement layer visibility toggles
- [ ] Create opacity slider controls
- [ ] Build z-index drag-and-drop ordering
- [ ] Add layer locking functionality
- [ ] Implement layer groups feature
- [ ] Create layer group sharing mechanism
- [ ] Add bulk actions (show/hide/delete all)
- [ ] Build layer export functionality

---

## Implementation Roadmap

### Week 1-2: Drawing Tools & Custom Polygons
- [ ] Implement Google Maps Drawing Manager integration
- [ ] Create polygon save/load functionality
- [ ] Build polygon edit/delete UI
- [ ] Design and create database schema
- [ ] Develop API endpoints for polygon CRUD operations
- [ ] Add area calculation using Turf.js

### Week 3-4: ZIP Code Layer
- [ ] Source and process ZIP code GeoJSON data
- [ ] Implement ZIP layer rendering on map
- [ ] Build ZIP selection and assignment UI
- [ ] Create ZIP territory save/load functionality
- [ ] Add ZIP search and filter features
- [ ] Implement bulk ZIP selection tools

### Week 5: City & County Boundaries
- [ ] Source city and county boundary data
- [ ] Implement boundary layer rendering
- [ ] Build state/county/city hierarchy UI
- [ ] Create territory assignment functionality
- [ ] Add overlap detection warnings
- [ ] Implement territory export feature

### Week 6-7: Drive Time Isochrones
- [ ] Research and select isochrone API provider
- [ ] Implement isochrone generation logic
- [ ] Build origin point selection UI
- [ ] Add time-of-day traffic support
- [ ] Implement multi-origin coverage
- [ ] Create isochrone display controls
- [ ] Add save/load functionality

### Week 8: Radius/Buffer Zones
- [ ] Implement radius drawing tool
- [ ] Create radius adjustment controls (drag edge)
- [ ] Build radius input UI (miles/km)
- [ ] Add center point repositioning
- [ ] Implement save/load for radius zones
- [ ] Create radius zone management panel

### Week 9-10: Layer Management System
- [ ] Design and build layer panel UI
- [ ] Implement layer visibility controls
- [ ] Create opacity sliders per layer
- [ ] Build z-index ordering system
- [ ] Add layer groups functionality
- [ ] Implement layer sharing features
- [ ] Optimize performance for multiple layers
- [ ] Add layer export/import functionality

---

## Technical Considerations

### Performance Optimization
- **Google Maps Data Layer**: Use for efficient polygon rendering with large datasets
- **Lazy Loading**: Only load ZIP/city/county data for visible map viewport
- **Polygon Simplification**: Reduce polygon complexity using Douglas-Peucker algorithm
- **Viewport-Based Rendering**: Only render layers visible in current map bounds
- **Clustering**: Cluster dense polygons at lower zoom levels
- **Web Workers**: Offload heavy geometric calculations to background threads

### Data Storage Strategy
- **Database**: Store complex polygons as GeoJSON in PostgreSQL with PostGIS extension
- **CDN**: Serve static boundary data (ZIP/city/county) from CDN for fast loading
- **Compression**: Use gzip compression for large polygon datasets
- **Caching**: Implement Redis caching for frequently accessed boundaries
- **Indexing**: Create spatial indexes for fast geometric queries

### APIs & Libraries
- **Google Maps JavaScript API**: Primary mapping platform
- **Google Maps Drawing Manager**: For polygon/circle/rectangle drawing
- **Turf.js**: Geometric calculations (area, intersections, buffers)
- **Google Distance Matrix API**: For drive-time isochrone generation
- **Alternative: Mapbox Isochrone API**: Dedicated isochrone service
- **PostGIS**: Spatial database extension for PostgreSQL

### User Experience Enhancements
- **Undo/Redo**: Implement command pattern for drawing operations
- **Keyboard Shortcuts**: Delete, Esc, Ctrl+Z for faster workflows
- **Touch-Friendly**: Large touch targets for mobile devices (min 44x44px)
- **Loading Indicators**: Show progress for API calls and data loading
- **Error Handling**: Graceful error messages for failed API requests
- **Tooltips**: Helpful hints for all drawing and editing tools
- **Onboarding**: Tutorial/walkthrough for first-time users

### Data Sources

#### ZIP Code Boundaries
- **US Census Bureau TIGER/Line Shapfiles**: https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html
- **Free, public domain data**
- **Updated annually**
- **Convert Shapefile → GeoJSON** using tools like `ogr2ogr`

#### City Boundaries
- **US Census Bureau Place Boundaries**: TIGER/Line Files
- **OpenStreetMap**: Community-maintained city boundaries
- **Natural Earth Data**: Simplified boundaries for faster rendering

#### County Boundaries
- **US Census Bureau County Boundaries**: TIGER/Line Files
- **FIPS Codes**: Standard county identification codes

#### Isochrone APIs
| Provider | Free Tier | Pricing | Documentation |
|----------|-----------|---------|---------------|
| Google Maps Distance Matrix | Limited | Pay per request | [docs](https://developers.google.com/maps/documentation/distance-matrix) |
| Mapbox Isochrone API | 100k requests/month | $0.60/1000 requests | [docs](https://docs.mapbox.com/api/navigation/isochrone/) |
| OpenRouteService | 2000 requests/day | Open source (self-host) | [docs](https://openrouteservice.org/dev/#/api-docs/v2/isochrones) |

---

## API Endpoints Design

### Polygon Management
```typescript
// Create polygon
POST /api/map-layers/polygons
Body: { name, type, coordinates, color, customerId }

// Get customer polygons
GET /api/map-layers/polygons?customerId={id}

// Update polygon
PUT /api/map-layers/polygons/:id
Body: { name?, coordinates?, color? }

// Delete polygon
DELETE /api/map-layers/polygons/:id
```

### ZIP Territory Management
```typescript
// Assign ZIPs to customer
POST /api/map-layers/zipcodes
Body: { zipCodes: string[], customerId, assignedTo?, color? }

// Get assigned ZIPs
GET /api/map-layers/zipcodes?customerId={id}

// Bulk update ZIP assignments
PUT /api/map-layers/zipcodes/bulk
Body: { zipCodes: string[], assignedTo, color }

// Remove ZIP assignments
DELETE /api/map-layers/zipcodes
Body: { zipCodes: string[] }
```

### Isochrone Management
```typescript
// Generate isochrone
POST /api/map-layers/isochrones
Body: { origin, driveTimes, timeOfDay, customerId }

// Get saved isochrones
GET /api/map-layers/isochrones?customerId={id}

// Delete isochrone
DELETE /api/map-layers/isochrones/:id
```

### Layer Groups
```typescript
// Create layer group
POST /api/map-layers/groups
Body: { name, description, customerId, layerIds }

// Get layer groups
GET /api/map-layers/groups?customerId={id}

// Update layer group
PUT /api/map-layers/groups/:id
Body: { name?, description?, layerIds?, visible? }

// Share layer group
POST /api/map-layers/groups/:id/share
Body: { userIds: string[] }
```

---

## Success Metrics

### Performance Targets
- Map layer render time: < 500ms for 1000 polygons
- ZIP code layer load time: < 2s for state-level data
- Isochrone generation: < 5s per origin point
- Layer visibility toggle: Instant (< 100ms)

### User Experience Goals
- Intuitive drawing tools (minimal training required)
- Mobile-responsive design (touch-friendly)
- Minimal API usage (optimize costs)
- Data persistence (no data loss on refresh)
- Cross-browser compatibility (Chrome, Safari, Firefox, Edge)

---

## Future Enhancements (Post-Launch)

### Phase 7+: Advanced Features
- **Heat Maps**: Density visualization for properties/leads
- **Route Optimization**: Multi-stop route planning
- **Territory Balancing**: Auto-balance territories by workload/value
- **Real-Time Collaboration**: Multiple users editing territories simultaneously
- **Mobile App**: Native iOS/Android apps with offline map support
- **Advanced Analytics**: Territory performance metrics and reporting
- **Integration**: Sync with CRM systems (Salesforce, HubSpot)
- **Custom Basemaps**: Branded map styles matching company colors

---

## Related Documentation
- [Google Maps JavaScript API Documentation](https://developers.google.com/maps/documentation/javascript)
- [Turf.js Documentation](https://turfjs.org/docs/)
- [US Census TIGER/Line Data](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html)
- [PostGIS Spatial Database](https://postgis.net/documentation/)

---

**Document Version**: 1.0
**Last Updated**: 2025-11-02
**Author**: Development Team
**Status**: Planning Phase
