# Map Layers Feature - Requirements Document

**Created:** February 1, 2026
**Status:** Phase 1 Planning

---

## Overview

A custom map layer system for OVIS that allows brokers to create polygon-based territory layers that can be shared to client portal accounts.

---

## Phase 1: Custom Polygon Layers (Current Scope)

### Layer Types
- **Custom Layers**: User-created polygon layers for territories

### Ownership & Permissions
- Custom layers created by brokers, but **any broker/admin can edit/delete**
- Any broker can share layers to client accounts
- Sharing is **explicit per-account** (no automatic inheritance to child accounts)

### Sharing Model
- Brokers can share a **live reference** (synced) OR create a **client-specific copy**
- Layers default to **visible** when shared to a client portal

### Polygon Data Model
| Field | Type | Description |
|-------|------|-------------|
| id | uuid | Primary key |
| layer_id | uuid | FK to map_layer |
| name | string | Shape name/label |
| geometry | jsonb | GeoJSON coordinates |
| shape_type | enum | 'polygon', 'circle', 'polyline', 'rectangle' |
| color | string | Fill/stroke color |
| description | text | Optional notes |
| created_at | timestamp | |
| updated_at | timestamp | |

### Shapes Supported
- Polygons (multi-point enclosed areas)
- Circles/radius shapes
- Polylines (lines/routes)
- Rectangles

### Creation Methods
- **Draw on map**: Drawing tools to click points and define shapes
- **Import files**: GeoJSON, KML, shapefile upload

### User Interactions
- **Clients (Portal)**: View only, no click interaction - just visual reference
- **Brokers (OVIS)**: Click to edit shape, color/style, description

### UI Components

#### Layer Management
- **Settings page**: For layer metadata & client sharing management
- **Map drawing tools**: For creating/editing shapes on the map

#### Layer Visibility (Map)
- **Layers button** in toolbar (matching existing pattern from screenshot)
- Opens dropdown with toggles for each layer
- Individual on/off toggle per layer

---

## Phase 2: US State Boundaries (Future)

- Pre-loaded 50 US state boundary polygons
- Available as system layers for all users
- Toggle on/off like custom layers

---

## Phase 3: Additional Boundaries (Future)

- On-demand city/county boundaries
- Search and add from external source
- Cache locally once added

---

## Technical Considerations

### Database Tables Needed
1. `map_layer` - Layer metadata (name, owner, type)
2. `map_layer_shape` - Individual shapes within a layer
3. `map_layer_client_share` - Layer-to-client sharing relationships

### Frontend Components
1. Layer management settings page
2. Map drawing toolbar
3. Layer visibility dropdown (in existing Map Data Layers pattern)
4. Shape editor panel/modal

### Google Maps Integration
- Use Google Maps Drawing Manager for shape creation
- Store coordinates as GeoJSON for portability
- Render using Google Maps Data Layer or Polygon/Circle/Polyline objects

---

## Open Questions (Resolved)

| Question | Answer |
|----------|--------|
| Layer ownership model? | Collaborative - any broker/admin can edit/delete |
| Sharing inheritance? | Explicit per-account, no auto-inheritance |
| Share as reference or copy? | Both options available to broker |
| Polygon data fields? | Name, color/style, description |
| Shape types? | All: polygon, circle, polyline, rectangle |
| Creation methods? | Both: draw on map AND file import |
| Client interaction? | View only, no click action |
| Broker interaction? | Click to edit shape/color/description |
| Management UI location? | Settings page + map drawing |
| Visibility UI? | Layers button dropdown with toggles |
| System layers scope? | Phase 2: US states only |

---

## Implementation Priority

**Phase 1 (Current):**
1. Database schema
2. Layer CRUD operations
3. Drawing tools on map
4. Layer visibility toggles
5. Client sharing
6. Portal layer display

**Phase 2 (Later):**
- US state boundaries

**Phase 3 (Later):**
- City/county on-demand boundaries
