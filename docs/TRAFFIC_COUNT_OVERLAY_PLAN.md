# Traffic Count Data Overlay Implementation Plan

## Overview
This document outlines the implementation plan for overlaying traffic count data (AADT - Annual Average Daily Traffic) on road segments, similar to SitesUSA by Regis. This feature helps users understand traffic patterns and volumes for site selection and market analysis.

---

## What is AADT?

**Annual Average Daily Traffic (AADT)** is the total volume of vehicle traffic on a highway or road for a year divided by 365 days. It's the standard measurement used by transportation professionals to:
- Assess road capacity and congestion
- Evaluate commercial site viability
- Understand customer accessibility
- Compare traffic patterns across locations
- Make data-driven real estate decisions

---

## Phase 7: Traffic Count Data Layer

### Goals
1. Display traffic volume data on road segments with color-coded visualization
2. Show AADT values on hover/click for specific road segments
3. Allow filtering by traffic volume thresholds
4. Integrate with existing layer management system
5. Support both free (DOT) and premium (commercial) data sources

---

## Data Source Options

### Option 1: StreetLight Data (Commercial - Recommended for Production)

**Best for: Production use with comprehensive coverage**

**Features:**
- ✅ 25+ million road segments across North America
- ✅ 5+ million miles of roadway coverage
- ✅ REST API for real-time integration
- ✅ Historical data (multi-year trends)
- ✅ Vehicle and pedestrian traffic metrics
- ✅ Delivery via API, CSV, or Shapefiles
- ✅ Regular updates and data quality guarantees
- ✅ Support for custom areas and queries

**Pricing:**
- Contact for custom quote: https://www.streetlightdata.com/contact/
- API Documentation: https://developer.streetlightdata.com/

**Data Format:**
- Road segment with start/end coordinates
- AADT value
- Directional splits
- Truck percentages
- Time-series data

---

### Option 2: State DOT Open Data (Free)

**Best for: Initial development and specific states**

**Popular State DOT Sources:**

| State | Data Portal | Coverage | API Access |
|-------|-------------|----------|------------|
| **Texas** | [TxDOT Open Data](https://gis-txdot.opendata.arcgis.com/) | Excellent | ArcGIS REST API |
| **Maryland** | [MDOT SHA AADT](https://data.imap.maryland.gov/maps/77010abe7558425997b4fcdab02e2b64) | Good | GIS Service |
| **California** | [Caltrans Traffic Volumes](https://dot.ca.gov/programs/traffic-operations/census) | Excellent | Download only |
| **Virginia** | [VDOT Traffic Counts](https://www.vdot.virginia.gov/doing-business/technical-guidance-and-support/traffic-operations/traffic-counts/) | Good | Download only |
| **New York** | [Traffic Data Viewer](https://www.dot.ny.gov/tdv) | Good | Interactive viewer |
| **Arizona** | [AZDOT Traffic Data](https://azdot.gov/planning/data-and-information/traffic-monitoring) | Good | Download only |

**Data.gov Resources:**
- [Federal AADT Datasets](https://catalog.data.gov/dataset?tags=aadt)
- Aggregated data from multiple states
- Shapefiles and CSV formats

**Pros:**
- ✅ Free, public data
- ✅ Official government sources
- ✅ Updated annually
- ✅ No usage limits

**Cons:**
- ⚠️ State-by-state (requires aggregation)
- ⚠️ Inconsistent formats
- ⚠️ Limited API access (mostly downloads)
- ⚠️ Manual processing required
- ⚠️ Update frequency varies

---

### Option 3: Urban SDK (Commercial Alternative)

**Features:**
- Traffic volume data with AADT
- API access
- US coverage

**Pricing:**
- Contact for quote: https://www.urbansdk.com/contact/

---

### Option 4: Replica (Commercial - Urban Planning Focus)

**Features:**
- Synthetic population data
- Traffic patterns
- Origin-destination flows
- Focus on urban planning use cases

**Pricing:**
- Enterprise pricing: https://replicahq.com/

---

## Technical Architecture

### Database Schema

```sql
-- Traffic count segments table
CREATE TABLE traffic_count_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Road identification
  road_name VARCHAR(255) NOT NULL,
  road_number VARCHAR(50),  -- e.g., "I-35", "US-290"
  road_type VARCHAR(50),    -- 'interstate', 'us_route', 'state_route', 'local'

  -- Geographic data
  segment_geom GEOMETRY(LINESTRING, 4326) NOT NULL,  -- PostGIS linestring
  state VARCHAR(2) NOT NULL,
  county VARCHAR(100),
  city VARCHAR(100),

  -- Traffic data
  aadt INTEGER NOT NULL,  -- Annual Average Daily Traffic
  year INTEGER NOT NULL,  -- Data year (e.g., 2024)

  -- Additional metrics (optional)
  k_factor DECIMAL(5,3),  -- Design hour factor
  d_factor DECIMAL(5,3),  -- Directional distribution factor
  t_factor DECIMAL(5,3),  -- Truck percentage
  peak_hour_volume INTEGER,

  -- Metadata
  data_source VARCHAR(50) NOT NULL,  -- 'streetlight', 'txdot', 'manual', etc.
  confidence_level VARCHAR(20),       -- 'high', 'medium', 'low'
  collection_method VARCHAR(50),      -- 'continuous', 'short_term', 'estimated'
  last_updated TIMESTAMP NOT NULL,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Spatial index for fast viewport queries
CREATE INDEX idx_traffic_segments_geom
  ON traffic_count_segments USING GIST (segment_geom);

-- Index for filtering by AADT
CREATE INDEX idx_traffic_segments_aadt
  ON traffic_count_segments (aadt);

-- Index for filtering by state/year
CREATE INDEX idx_traffic_segments_state_year
  ON traffic_count_segments (state, year);

-- Customer-specific traffic layer settings
CREATE TABLE customer_traffic_layer_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID NOT NULL REFERENCES customer(id) ON DELETE CASCADE,

  -- Display settings
  is_visible BOOLEAN DEFAULT FALSE,
  display_mode VARCHAR(50) DEFAULT 'colored_segments',  -- 'colored_segments', 'heatmap', 'labels'
  opacity DECIMAL(3,2) DEFAULT 0.8,
  show_labels BOOLEAN DEFAULT TRUE,
  min_zoom_level INTEGER DEFAULT 12,

  -- Color scheme (JSON)
  color_scheme JSONB DEFAULT '{
    "low": {"threshold": 5000, "color": "#4CAF50"},
    "medium": {"threshold": 20000, "color": "#FFC107"},
    "high": {"threshold": 50000, "color": "#FF9800"},
    "veryHigh": {"threshold": 100000, "color": "#F44336"}
  }'::jsonb,

  -- Filters
  min_aadt INTEGER DEFAULT 0,
  max_aadt INTEGER DEFAULT 999999,
  selected_states TEXT[],  -- Array of state codes
  road_types TEXT[],       -- Filter by road types

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  UNIQUE(customer_id)
);
```

### TypeScript Interfaces

```typescript
interface TrafficCountSegment {
  id: string;
  roadName: string;
  roadNumber?: string;
  roadType: 'interstate' | 'us_route' | 'state_route' | 'local';

  // Geographic data
  segmentCoordinates: google.maps.LatLng[];  // Polyline coordinates
  state: string;
  county?: string;
  city?: string;

  // Traffic metrics
  aadt: number;  // Annual Average Daily Traffic
  year: number;
  kFactor?: number;  // Design hour factor
  dFactor?: number;  // Directional distribution factor
  tFactor?: number;  // Truck percentage
  peakHourVolume?: number;

  // Metadata
  dataSource: 'streetlight' | 'txdot' | 'mdot' | 'manual';
  confidenceLevel?: 'high' | 'medium' | 'low';
  collectionMethod?: 'continuous' | 'short_term' | 'estimated';
  lastUpdated: Date;
}

interface TrafficLayerSettings {
  id: string;
  customerId: string;
  isVisible: boolean;
  displayMode: 'colored_segments' | 'heatmap' | 'labels';
  opacity: number;  // 0.0 to 1.0
  showLabels: boolean;
  minZoomLevel: number;

  colorScheme: {
    low: { threshold: number; color: string };       // < 5,000 AADT - Green
    medium: { threshold: number; color: string };    // 5,000-20,000 - Yellow
    high: { threshold: number; color: string };      // 20,000-50,000 - Orange
    veryHigh: { threshold: number; color: string };  // > 50,000 - Red
  };

  // Filters
  minAadt: number;
  maxAadt: number;
  selectedStates: string[];
  roadTypes: ('interstate' | 'us_route' | 'state_route' | 'local')[];
}

interface TrafficLayerLoadConfig {
  bounds: google.maps.LatLngBounds;  // Current viewport
  zoomLevel: number;
  filters: {
    minAadt: number;
    maxAadt: number;
    states?: string[];
    roadTypes?: string[];
  };
}
```

---

## Visual Display Options

### Option 1: Colored Road Segments (Recommended)

Similar to SitesUSA/Regis visualization - road segments colored by traffic volume.

```typescript
const renderTrafficSegments = (
  segments: TrafficCountSegment[],
  settings: TrafficLayerSettings,
  map: google.maps.Map
) => {
  const polylines: google.maps.Polyline[] = [];

  segments.forEach(segment => {
    const color = getColorByAADT(segment.aadt, settings.colorScheme);

    const polyline = new google.maps.Polyline({
      path: segment.segmentCoordinates,
      strokeColor: color,
      strokeOpacity: settings.opacity,
      strokeWeight: getStrokeWeightByZoom(map.getZoom()!),
      map: map,
      zIndex: 1  // Below markers, above base map
    });

    // Add hover tooltip
    const infoWindow = new google.maps.InfoWindow();
    polyline.addListener('mouseover', (e: google.maps.PolyMouseEvent) => {
      infoWindow.setContent(`
        <div style="padding: 8px;">
          <strong>${segment.roadName || segment.roadNumber}</strong><br>
          <strong>AADT:</strong> ${segment.aadt.toLocaleString()}<br>
          <strong>Year:</strong> ${segment.year}<br>
          ${segment.city ? `<strong>Location:</strong> ${segment.city}, ${segment.state}` : ''}
        </div>
      `);
      infoWindow.setPosition(e.latLng);
      infoWindow.open(map);
    });

    polyline.addListener('mouseout', () => {
      infoWindow.close();
    });

    polylines.push(polyline);
  });

  return polylines;
};

const getColorByAADT = (
  aadt: number,
  colorScheme: TrafficLayerSettings['colorScheme']
): string => {
  if (aadt >= colorScheme.veryHigh.threshold) return colorScheme.veryHigh.color;
  if (aadt >= colorScheme.high.threshold) return colorScheme.high.color;
  if (aadt >= colorScheme.medium.threshold) return colorScheme.medium.color;
  return colorScheme.low.color;
};

const getStrokeWeightByZoom = (zoom: number): number => {
  if (zoom >= 15) return 6;
  if (zoom >= 13) return 4;
  if (zoom >= 11) return 3;
  return 2;
};
```

### Option 2: Heatmap Visualization

```typescript
const renderTrafficHeatmap = (
  segments: TrafficCountSegment[],
  map: google.maps.Map
) => {
  // Convert segments to heatmap data points
  const heatmapData = segments.map(segment => {
    // Use center point of segment
    const centerLat = segment.segmentCoordinates.reduce((sum, p) => sum + p.lat(), 0) / segment.segmentCoordinates.length;
    const centerLng = segment.segmentCoordinates.reduce((sum, p) => sum + p.lng(), 0) / segment.segmentCoordinates.length;

    return {
      location: new google.maps.LatLng(centerLat, centerLng),
      weight: segment.aadt / 1000  // Normalize weight
    };
  });

  const heatmap = new google.maps.visualization.HeatmapLayer({
    data: heatmapData,
    map: map,
    radius: 20,
    opacity: 0.6
  });

  return heatmap;
};
```

### Option 3: Numeric Labels

```typescript
const renderTrafficLabels = (
  segments: TrafficCountSegment[],
  map: google.maps.Map
) => {
  const markers: google.maps.Marker[] = [];

  segments.forEach(segment => {
    // Only show labels at high zoom levels
    if (map.getZoom()! < 14) return;

    // Calculate midpoint of segment
    const midIndex = Math.floor(segment.segmentCoordinates.length / 2);
    const position = segment.segmentCoordinates[midIndex];

    const marker = new google.maps.Marker({
      position: position,
      map: map,
      label: {
        text: (segment.aadt / 1000).toFixed(1) + 'K',
        color: '#000',
        fontSize: '12px',
        fontWeight: 'bold'
      },
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 0,  // Invisible icon, just show label
      }
    });

    markers.push(marker);
  });

  return markers;
};
```

---

## API Endpoints Design

### Get Traffic Segments for Viewport

```typescript
// Get traffic segments within map bounds
GET /api/traffic-counts/segments
Query Parameters:
  - ne_lat: number      // Northeast corner latitude
  - ne_lng: number      // Northeast corner longitude
  - sw_lat: number      // Southwest corner latitude
  - sw_lng: number      // Southwest corner longitude
  - min_aadt?: number   // Minimum traffic volume
  - max_aadt?: number   // Maximum traffic volume
  - states?: string[]   // Filter by state codes
  - road_types?: string[]  // Filter by road types
  - year?: number       // Data year (default: latest)

Response: {
  segments: TrafficCountSegment[];
  bounds: {
    minAadt: number;
    maxAadt: number;
    segmentCount: number;
  };
}
```

### Get Customer Traffic Layer Settings

```typescript
// Get traffic layer settings for customer
GET /api/traffic-counts/settings?customerId={id}

Response: TrafficLayerSettings

// Update traffic layer settings
PUT /api/traffic-counts/settings/:id
Body: Partial<TrafficLayerSettings>

Response: TrafficLayerSettings
```

### Import Traffic Data (Admin)

```typescript
// Import traffic count data from file
POST /api/admin/traffic-counts/import
Body: {
  source: 'streetlight' | 'txdot' | 'mdot' | 'csv' | 'shapefile';
  data: File | string;  // File upload or GeoJSON string
  year: number;
  state?: string;
}

Response: {
  imported: number;
  updated: number;
  errors: string[];
}
```

---

## Implementation Roadmap

### Phase 7A: Foundation & Free Data (Weeks 1-3)

**Week 1: Data Pipeline Setup**
- [ ] Set up PostGIS spatial database extension
- [ ] Create database schema and migrations
- [ ] Download Texas DOT AADT shapefiles (or your state)
- [ ] Convert shapefiles to GeoJSON using `ogr2ogr`
- [ ] Write data import script for initial load

**Week 2: Backend API Development**
- [ ] Create traffic_count_segments table
- [ ] Create customer_traffic_layer_settings table
- [ ] Implement spatial query API endpoint (viewport-based)
- [ ] Create settings CRUD endpoints
- [ ] Add data validation and error handling
- [ ] Optimize queries with spatial indexes

**Week 3: Frontend Layer Component**
- [ ] Create TrafficCountLayer component
- [ ] Implement colored segment rendering
- [ ] Add hover tooltips with traffic info
- [ ] Build legend component (color scale)
- [ ] Add to Layer Management system
- [ ] Implement zoom-based visibility (min zoom 12)

### Phase 7B: Enhanced Visualization (Week 4)

- [ ] Add heatmap display mode option
- [ ] Implement numeric label overlay (high zoom only)
- [ ] Create traffic layer control panel UI
- [ ] Add AADT range slider filter
- [ ] Implement state/road type filters
- [ ] Build custom color scheme editor

### Phase 7C: Premium Data Integration (Weeks 5-6)

**If using StreetLight Data or other commercial API:**

- [ ] Sign up for StreetLight Data trial/account
- [ ] Integrate StreetLight API
- [ ] Implement API response caching (Redis)
- [ ] Add automatic data refresh scheduler
- [ ] Create usage monitoring/tracking
- [ ] Implement rate limiting and cost controls
- [ ] Add data source toggle (Free vs Premium)

### Phase 7D: Advanced Features (Week 7)

- [ ] Click segment for detailed traffic report modal
- [ ] Export traffic data for selected area (CSV/GeoJSON)
- [ ] Historical traffic trend charts (multi-year)
- [ ] Traffic comparison tool (compare 2 locations)
- [ ] Save favorite traffic views
- [ ] Share traffic layer configurations

---

## User Interface Components

### Layer Control Panel

```typescript
interface TrafficLayerControlPanelProps {
  settings: TrafficLayerSettings;
  onSettingsChange: (settings: Partial<TrafficLayerSettings>) => void;
  onClose: () => void;
}

// UI Features:
// - Display mode toggle (Segments / Heatmap / Labels)
// - Opacity slider (0-100%)
// - Show/hide labels checkbox
// - AADT range slider (min-max filter)
// - State multi-select dropdown
// - Road type checkboxes
// - Color scheme presets
// - Custom color picker
```

### Legend Component

```typescript
interface TrafficLegendProps {
  colorScheme: TrafficLayerSettings['colorScheme'];
  totalSegments: number;
  visibleSegments: number;
}

// Display:
// - Color scale with AADT ranges
// - Total segments count
// - Filtered segments count
// - Data year indicator
// - Collapsible panel
```

### Traffic Info Modal

```typescript
interface TrafficInfoModalProps {
  segment: TrafficCountSegment;
  onClose: () => void;
}

// Display detailed information:
// - Road name/number
// - AADT with trend indicator (if historical data available)
// - Peak hour volume
// - Truck percentage
// - Location (city, county, state)
// - Data source and year
// - Collection method
// - Directional split visualization
// - Export segment data button
```

---

## Performance Optimization Strategies

### 1. Viewport-Based Loading
```typescript
// Only load segments visible in current map bounds
const loadTrafficSegments = async (bounds: google.maps.LatLngBounds) => {
  const { data } = await fetch(
    `/api/traffic-counts/segments?` +
    `ne_lat=${bounds.getNorthEast().lat()}&` +
    `ne_lng=${bounds.getNorthEast().lng()}&` +
    `sw_lat=${bounds.getSouthWest().lat()}&` +
    `sw_lng=${bounds.getSouthWest().lng()}`
  );
  return data;
};
```

### 2. Zoom-Level Filtering
```typescript
// Different strategies based on zoom level
const getLoadStrategy = (zoom: number) => {
  if (zoom < 10) return 'none';           // Don't load, too zoomed out
  if (zoom < 12) return 'major_roads';     // Only interstates/US routes
  if (zoom < 14) return 'all_roads';       // All road types
  return 'detailed';                       // Include labels and details
};
```

### 3. Polygon Simplification
```typescript
// Simplify road segment geometries for faster rendering
// Use Douglas-Peucker algorithm via Turf.js
import * as turf from '@turf/turf';

const simplifySegment = (coordinates: LatLng[], tolerance: number = 0.0001) => {
  const line = turf.lineString(coordinates.map(c => [c.lng, c.lat]));
  const simplified = turf.simplify(line, { tolerance, highQuality: false });
  return simplified.geometry.coordinates.map(([lng, lat]) => ({ lat, lng }));
};
```

### 4. Clustering at Low Zoom
```typescript
// At very low zoom levels (< 11), cluster segments by grid
const clusterSegmentsByGrid = (segments: TrafficCountSegment[], gridSize: number) => {
  const grid: Map<string, TrafficCountSegment[]> = new Map();

  segments.forEach(segment => {
    const centerLat = segment.segmentCoordinates[0].lat();
    const centerLng = segment.segmentCoordinates[0].lng();
    const gridKey = `${Math.floor(centerLat / gridSize)}_${Math.floor(centerLng / gridSize)}`;

    if (!grid.has(gridKey)) {
      grid.set(gridKey, []);
    }
    grid.get(gridKey)!.push(segment);
  });

  return Array.from(grid.values()).map(clusteredSegments => ({
    ...clusteredSegments[0],
    aadt: Math.round(clusteredSegments.reduce((sum, s) => sum + s.aadt, 0) / clusteredSegments.length)
  }));
};
```

### 5. Caching Strategy
```typescript
// Cache traffic data in Redis with spatial indexing
// Key format: traffic:segments:{state}:{year}:{gridCell}
// TTL: 24 hours for fresh data, 7 days for static data

interface CacheConfig {
  keyPrefix: 'traffic:segments';
  ttl: number;  // seconds
  enableGzip: boolean;
}

const cacheTrafficData = async (
  key: string,
  data: TrafficCountSegment[],
  ttl: number = 86400
) => {
  await redis.setex(
    key,
    ttl,
    JSON.stringify(data)
  );
};
```

---

## Data Import Process

### Step 1: Download State DOT Data

**Texas DOT Example:**
```bash
# Download Texas DOT traffic count shapefiles
wget https://gis-txdot.opendata.arcgis.com/datasets/txdot-aadt-2023/download

# Extract
unzip txdot-aadt-2023.zip
```

### Step 2: Convert Shapefile to GeoJSON

```bash
# Install GDAL tools
brew install gdal  # macOS
# or
sudo apt-get install gdal-bin  # Linux

# Convert shapefile to GeoJSON
ogr2ogr \
  -f GeoJSON \
  -t_srs EPSG:4326 \
  traffic_counts.geojson \
  TXDOT_AADT_2023.shp

# Simplify geometry (optional, for smaller file size)
mapshaper traffic_counts.geojson \
  -simplify 10% \
  -o traffic_counts_simplified.geojson
```

### Step 3: Import to Database

```typescript
// import-traffic-data.ts
import { supabase } from './lib/supabaseClient';
import * as fs from 'fs';
import * as turf from '@turf/turf';

interface ShapefileProperties {
  ROAD_NAME: string;
  ROUTE_NUM: string;
  AADT_2023: number;
  COUNTY: string;
  // ... other properties
}

const importTrafficData = async (geojsonPath: string, state: string, year: number) => {
  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf-8'));
  const features = geojson.features;

  console.log(`Importing ${features.length} traffic segments...`);

  for (let i = 0; i < features.length; i++) {
    const feature = features[i];
    const props = feature.properties as ShapefileProperties;

    // Convert GeoJSON coordinates to PostGIS format
    const coordinates = feature.geometry.coordinates;
    const wkt = `LINESTRING(${coordinates.map((c: number[]) => `${c[0]} ${c[1]}`).join(',')})`;

    // Determine road type
    const roadType = getRoadType(props.ROUTE_NUM);

    try {
      await supabase.from('traffic_count_segments').insert({
        road_name: props.ROAD_NAME,
        road_number: props.ROUTE_NUM,
        road_type: roadType,
        segment_geom: wkt,
        state: state,
        county: props.COUNTY,
        aadt: props.AADT_2023,
        year: year,
        data_source: `${state.toLowerCase()}dot`,
        confidence_level: 'high',
        collection_method: 'continuous',
        last_updated: new Date()
      });

      if ((i + 1) % 100 === 0) {
        console.log(`Imported ${i + 1}/${features.length} segments...`);
      }
    } catch (error) {
      console.error(`Error importing segment ${i}:`, error);
    }
  }

  console.log('Import complete!');
};

const getRoadType = (routeNum: string): string => {
  if (routeNum?.startsWith('I-')) return 'interstate';
  if (routeNum?.startsWith('US-')) return 'us_route';
  if (routeNum?.match(/^[A-Z]{2}-/)) return 'state_route';
  return 'local';
};

// Run import
importTrafficData('./traffic_counts.geojson', 'TX', 2023);
```

---

## Testing Strategy

### Unit Tests
- [ ] Test color assignment by AADT ranges
- [ ] Test segment filtering logic
- [ ] Test coordinate simplification
- [ ] Test viewport bounds calculation

### Integration Tests
- [ ] Test segment loading from database
- [ ] Test spatial queries with PostGIS
- [ ] Test layer rendering on map
- [ ] Test settings persistence

### Performance Tests
- [ ] Load time for 10,000 segments
- [ ] Render performance at various zoom levels
- [ ] Memory usage monitoring
- [ ] API response time benchmarks

### User Acceptance Tests
- [ ] Verify color coding is intuitive
- [ ] Test hover tooltips accuracy
- [ ] Validate filter functionality
- [ ] Check mobile responsiveness

---

## Cost Estimation

### Free DOT Data Route
- **Data Cost:** $0
- **Processing Time:** 2-4 hours per state (initial setup)
- **Maintenance:** Manual updates annually
- **Coverage:** State-by-state, gaps in rural areas
- **API Costs:** $0 (self-hosted)
- **Storage:** ~$5-10/month (database)

**Total: ~$5-10/month**

### StreetLight Data Route
- **API Access:** Custom pricing (typically $500-2000/month for small business)
- **Data Coverage:** 25+ million segments nationwide
- **API Calls:** Monitor usage, implement caching
- **Storage:** Same ~$5-10/month
- **Processing Time:** Minutes (API returns ready-to-use data)
- **Maintenance:** Automatic updates

**Total: ~$500-2000/month + $10 infrastructure**

### Hybrid Approach (Recommended)
- **Start:** Free DOT data for initial states
- **Expand:** Add StreetLight for national coverage
- **Strategy:** Use free data as fallback, premium as primary
- **Caching:** Reduce API costs by 70-80%

**Total: ~$200-500/month at scale with caching**

---

## Success Metrics

### Performance Targets
- Initial load time: < 2s for viewport
- Segment render: < 500ms for 1000 segments
- Hover response: < 100ms
- Filter apply: < 300ms
- Layer toggle: Instant (< 50ms)

### User Experience Goals
- Intuitive color coding (traffic volume clear at a glance)
- Smooth panning and zooming with layer visible
- Accurate tooltips and segment info
- Mobile-friendly controls
- Fast filter responses

### Data Quality Metrics
- Data freshness: < 1 year old
- Coverage: 90%+ of major roads in target areas
- Accuracy: Official government sources or verified commercial data

---

## Future Enhancements (Phase 8+)

### Advanced Features
- **Directional Traffic Split**: Show NB/SB or EB/WB separately
- **Time-of-Day Patterns**: Morning/evening rush hour variations
- **Seasonal Trends**: Summer vs winter traffic patterns
- **Growth Projections**: Forecast future traffic based on trends
- **Pedestrian Counts**: Add foot traffic data for urban areas
- **Bike Traffic**: Bicycle lane usage data
- **Historical Comparison**: Compare 2020 vs 2024 side-by-side
- **Traffic Impact Analysis**: Calculate how new development affects traffic
- **Custom Traffic Reports**: Generate PDF reports for selected areas

### Integration Features
- **Property Analysis**: Show AADT for nearest road segment on property cards
- **Site Submit Scoring**: Auto-score sites based on traffic exposure
- **Client Reports**: Include traffic data in client presentations
- **Territory Planning**: Optimize territories based on traffic patterns

---

## Related Documentation
- [Advanced Map Features Plan](./ADVANCED_MAP_FEATURES_PLAN.md)
- [Google Maps JavaScript API - Polylines](https://developers.google.com/maps/documentation/javascript/shapes#polylines)
- [PostGIS Spatial Functions](https://postgis.net/docs/reference.html)
- [Turf.js Simplification](https://turfjs.org/docs/#simplify)
- [StreetLight API Documentation](https://developer.streetlightdata.com/)

---

## Contact Information for Data Providers

**StreetLight Data:**
- Website: https://www.streetlightdata.com/
- Contact: https://www.streetlightdata.com/contact/
- Sales: sales@streetlightdata.com
- Documentation: https://developer.streetlightdata.com/

**Urban SDK:**
- Website: https://www.urbansdk.com/
- Contact: https://www.urbansdk.com/contact/
- Data Products: https://www.urbansdk.com/data/traffic-volume-data

**Replica:**
- Website: https://replicahq.com/
- Contact: hello@replicahq.com
- Enterprise sales: https://replicahq.com/contact

---

**Document Version**: 1.0
**Last Updated**: 2025-01-03
**Author**: Development Team
**Status**: Planning Phase
