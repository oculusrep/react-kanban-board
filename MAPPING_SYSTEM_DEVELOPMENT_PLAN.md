# 🗺️ Integrated Mapping System - Development Plan

## 📋 Project Overview

**Goal**: Build an integrated mapping system that serves as the central hub for property and site submit visualization, eliminating the need to constantly switch between separate screens.

**Dataset**: ~3,500 properties + 2,403 site submits
**APIs**: Google Maps JavaScript API, Places API, Geocoding API, Directions API

---

## 🎯 Requirements Summary (From User Consultation)

### **Map Display & Layers**
- **Map Center**: User location → fallback to Atlanta, GA
- **All Properties Layer**: Green pins, toggle on/off, NOT loaded initially
- **Site Submit Layers**: Client dropdown + stage filter, colored by site_submit_stage, NOT loaded initially
- **Marker Clustering**: Required for 6,000+ potential markers

### **Geocoding Strategy**
- **Display Priority**: Verified coordinates > Regular coordinates (one pin per property)
- **Batch Geocoding**: Only properties with NO coordinates (both lat/lng and verified_lat/lng are null)
- **Pin Verification**: Drag-and-drop interface to set verified coordinates
- **Skip**: Properties that already have any coordinates

### **Access Control**
- **Admin Users**: All layers, full CRUD access
- **Customer Portal**: Only their site submits (where client_id matches their account)

### **Interface Design**
- **Context-sensitive slider**: Appears on property/site submit pages
- **Dedicated mapping page**: Full mapping experience at `/mapping`
- **Pin Interaction**: Slide-out sidebar with simplified read/edit forms (similar to existing property detail screen)

---

## 🏗️ Development Phases

### **Phase 1: Foundation & Geocoding (Days 1-3)**
**Goal**: Get basic Google Maps working with geocoded property data

✅ **1.1 Google Maps API Setup**
- [ ] Configure environment variables with API keys
- [ ] Install @googlemaps/js-api-loader and @types/google.maps
- [ ] Create basic GoogleMapContainer.tsx component
- [ ] Test map rendering centered on Atlanta, GA
- [ ] Add user geolocation with Atlanta fallback

✅ **1.2 Enhanced Geocoding Service**
- [ ] Upgrade existing geocodingService.ts to use Google Geocoding API
- [ ] Keep OpenStreetMap as fallback for rate limiting
- [ ] Add batch geocoding with rate limiting (respect Google quotas)
- [ ] Create database queries to identify properties missing coordinates

✅ **1.3 Batch Geocoding Implementation**
- [ ] Create geocoding management hook useGeocodingBatch.ts
- [ ] Implement batch processing for properties without coordinates
- [ ] Add progress tracking and error handling
- [ ] Update property table with geocoded lat/lng coordinates

✅ **1.4 Property Layer Foundation**
- [ ] Create PropertyLayer.tsx component
- [ ] Implement marker clustering for performance
- [ ] Add toggle functionality (layer not loaded initially)
- [ ] Use verified coordinates prioritization logic

**Checkpoint 1**: ✅ All properties with addresses have coordinates, basic property layer toggles on/off

---

### **Phase 2: Core Layer System (Days 4-6)**
**Goal**: Complete property and site submit layer functionality

✅ **2.1 Site Submit Layer System**
- [ ] Create SiteSubmitLayer.tsx component
- [ ] Implement client dropdown filter
- [ ] Add site submit stage color coding
- [ ] Create stage-based marker styling system

✅ **2.2 Layer Management System**
- [ ] Create LayerManager.tsx component with toggle controls
- [ ] Implement layer state management (useLayerState.ts)
- [ ] Add layer loading indicators
- [ ] Ensure layers don't load initially (performance)

✅ **2.3 Data Integration Hooks**
- [ ] Create useMapData.ts hook for database integration
- [ ] Implement efficient map bounds-based queries
- [ ] Add real-time data updates
- [ ] Optimize for 6,000+ marker performance

✅ **2.4 Access Control Implementation**
- [ ] Add user role detection
- [ ] Filter site submits by client_id for customer portal users
- [ ] Implement admin vs customer layer visibility

**Checkpoint 2**: ✅ Property and site submit layers working with proper access control and performance

---

### **Phase 3: Interactive Interface (Days 7-9)**
**Goal**: Add pin interactions and slide-out editing interface

✅ **3.1 Pin Click System**
- [ ] Add marker click event handlers
- [ ] Create slide-out sidebar component (MapSidebar.tsx)
- [ ] Implement open/close animations
- [ ] Handle property vs site submit click routing

✅ **3.2 Property Pin Interface**
- [ ] Create PropertyMapForm.tsx (simplified property edit form)
- [ ] Add read-only property details view
- [ ] Implement edit mode toggle
- [ ] Add save/cancel functionality with database updates

✅ **3.3 Site Submit Pin Interface**
- [ ] Create SiteSubmitMapForm.tsx (simplified site submit form)
- [ ] Add client association display
- [ ] Implement stage editing
- [ ] Add assignment and property relationship display

✅ **3.4 Pin Verification System**
- [ ] Add drag-and-drop pin repositioning
- [ ] Implement verified coordinate update system
- [ ] Add confirmation dialog for coordinate changes
- [ ] Update verified_latitude/verified_longitude fields

**Checkpoint 3**: ✅ Full pin interaction system with slide-out editing

---

### **Phase 4: Integration & Advanced Features (Days 10-12)**
**Goal**: Integrate with existing CRM pages and add advanced features

✅ **4.1 Context-Sensitive Integration**
- [ ] Add map slider to PropertyDetailsPage.tsx
- [ ] Add map slider to SiteSubmitFormModal.tsx
- [ ] Implement context preservation (property selection → map view)
- [ ] Add "View on Map" buttons to existing pages

✅ **4.2 Dedicated Mapping Page**
- [ ] Create /mapping route and MappingPage.tsx
- [ ] Implement full-screen map interface
- [ ] Add comprehensive layer controls
- [ ] Add search and filter functionality

✅ **4.3 Advanced Map Features**
- [ ] Add property search from map interface
- [ ] Implement map bounds saving (remember user's view)
- [ ] Add distance measurement tools
- [ ] Implement basic routing between properties (Directions API)

✅ **4.4 Performance Optimization**
- [ ] Implement map bounds-based marker loading
- [ ] Add marker clustering configuration
- [ ] Optimize re-renders and state updates
- [ ] Add loading states for all async operations

**Checkpoint 4**: ✅ Complete integrated mapping system with CRM integration

---

## 📁 File Structure Plan

```
src/components/mapping/
├── MapSystem.tsx                 (Main container with context-sensitive slider)
├── MappingPage.tsx              (Dedicated full-screen mapping page)
├── GoogleMapContainer.tsx        (Google Maps wrapper component)
├── LayerManager.tsx             (Layer toggle controls)
├── MapSidebar.tsx               (Slide-out sidebar for pin editing)
├── layers/
│   ├── PropertyLayer.tsx        (Property markers with clustering)
│   ├── SiteSubmitLayer.tsx      (Site submit markers with client filtering)
│   └── LayerTypes.ts            (TypeScript interfaces)
├── forms/
│   ├── PropertyMapForm.tsx      (Simplified property edit form)
│   ├── SiteSubmitMapForm.tsx    (Simplified site submit edit form)
│   └── PinVerificationModal.tsx (Drag-and-drop coordinate verification)
├── hooks/
│   ├── useMapData.ts            (Database integration)
│   ├── useLayerState.ts         (Layer visibility management)
│   ├── useGeocodingBatch.ts     (Batch geocoding operations)
│   └── useMapIntegration.ts     (CRM page integration)
├── services/
│   ├── googleMapsService.ts     (Google Maps API wrapper)
│   ├── geocodingService.ts      (Enhanced with Google + OSM fallback)
│   └── markerClusterService.ts  (Clustering configuration)
└── utils/
    ├── mapHelpers.ts            (Utility functions)
    ├── markerStyles.ts          (Marker colors and icons)
    └── coordinateUtils.ts       (Coordinate validation and conversion)
```

---

## 🔑 Environment Configuration

```env
# Google Maps & Places API Configuration (Required)
VITE_GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here
VITE_GOOGLE_PLACES_API_KEY=your_google_places_api_key_here

# Existing Supabase Configuration
VITE_SUPABASE_URL=https://rqbvcvwbziilnycqtmnc.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_key_here
```

---

## 🗃️ Database Queries Reference

### **Properties Missing Coordinates**
```sql
SELECT id, property_name, address, city, state, zip
FROM property
WHERE (latitude IS NULL OR longitude IS NULL)
  AND (verified_latitude IS NULL OR verified_longitude IS NULL)
  AND address IS NOT NULL
  AND address != '';
```

### **Properties for Map Display**
```sql
SELECT p.*, pt.label as property_type_name, ps.label as property_stage_name
FROM property p
LEFT JOIN property_type pt ON p.property_type_id = pt.id
LEFT JOIN property_stage ps ON p.property_stage_id = ps.id
WHERE (
  (p.verified_latitude IS NOT NULL AND p.verified_longitude IS NOT NULL)
  OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)
);
```

### **Site Submits with Property Locations**
```sql
SELECT ss.*, p.verified_latitude, p.verified_longitude, p.latitude, p.longitude,
       p.property_name, p.address, c.client_name, sss.label as stage_name
FROM site_submit ss
JOIN property p ON ss.property_id = p.id
LEFT JOIN client c ON ss.client_id = c.id
LEFT JOIN site_submit_status sss ON ss.site_submit_status_id = sss.id
WHERE (
  (p.verified_latitude IS NOT NULL AND p.verified_longitude IS NOT NULL)
  OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)
);
```

### **Customer Portal Site Submits** (Replace $1 with user's client_id)
```sql
SELECT ss.*, p.verified_latitude, p.verified_longitude, p.latitude, p.longitude,
       p.property_name, p.address, sss.label as stage_name
FROM site_submit ss
JOIN property p ON ss.property_id = p.id
LEFT JOIN site_submit_status sss ON ss.site_submit_status_id = sss.id
WHERE ss.client_id = $1
  AND (
    (p.verified_latitude IS NOT NULL AND p.verified_longitude IS NOT NULL)
    OR (p.latitude IS NOT NULL AND p.longitude IS NOT NULL)
  );
```

---

## 🚀 Getting Started Checklist

### **Before Development:**
- [ ] Google Cloud Project configured with required APIs
- [ ] API keys added to .env file
- [ ] Dependencies installed (@googlemaps/js-api-loader, @types/google.maps)

### **Day 1 Priority:**
- [ ] Basic Google Maps component renders
- [ ] Map centers on Atlanta, GA or user location
- [ ] Can toggle "All Properties" layer on/off
- [ ] Basic property markers display (even without clustering)

### **Testing Strategy:**
- [ ] Start with small dataset (first 10 properties) for initial testing
- [ ] Gradually increase to full dataset with clustering
- [ ] Test on different screen sizes (desktop, tablet, mobile)
- [ ] Verify performance with 3,500+ properties

---

## 🎯 Success Metrics

### **Phase 1 Success:**
- All properties with addresses have lat/lng coordinates
- Basic map renders with property layer toggle
- Geocoding service processes missing coordinates successfully

### **Phase 2 Success:**
- Site submit layers work with client filtering
- Layer system performs well with 6,000+ markers
- Access control properly filters data by user role

### **Phase 3 Success:**
- Pin clicks open slide-out sidebar with property/site submit details
- Verified coordinate drag-and-drop system works
- Edit forms save changes to database

### **Phase 4 Success:**
- Context-sensitive map integration on existing CRM pages
- Dedicated mapping page provides full functionality
- System integrates seamlessly with existing workflow

---

## 📝 Development Notes

### **Important Patterns to Follow:**
1. **Database-first development**: All components use proper TypeScript interfaces from database schema
2. **Custom hooks for business logic**: Keep components focused on UI, logic in hooks
3. **Error handling**: Graceful degradation when APIs fail or are rate limited
4. **Performance first**: Always consider the 6,000+ marker impact
5. **Existing UI patterns**: Match slide-out sidebars and forms to current design system

### **Rate Limiting Considerations:**
- Google Geocoding API: 50 requests per second, 40,000 per day (by default)
- Batch process in chunks of 10-20 addresses with delays
- Implement retry logic for failed geocoding requests
- Store successful geocoding results immediately

### **Performance Optimization:**
- Use marker clustering (minimum cluster size: 10)
- Implement map bounds-based loading
- Lazy load layers (don't initialize until toggled)
- Debounce map interaction events
- Use React.memo for marker components

---

**Ready to begin Phase 1! 🚀**