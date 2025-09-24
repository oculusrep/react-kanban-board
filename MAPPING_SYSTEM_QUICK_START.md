# 🚀 Mapping System - Quick Start Guide

**Use this document to quickly get back into development context**

---

## 🎯 Where We Are

**Current Phase**: Phase 1 - Foundation & Geocoding
**Completed**: 1.1 Google Maps Setup ✅, 1.2 Enhanced Geocoding ✅, 1.3 Batch Geocoding ✅, 1.4 Property Layer Foundation ✅
**Next Task**: Phase 2 - Data Layers & Filtering
**Goal**: Complete mapping foundation ready for client portal features

---

## 🔑 Key Information

### **Dataset Size**
- **Properties**: 3,500 records
- **Site Submits**: 2,403 records
- **Total Markers**: ~6,000 (requires clustering)

### **Coordinate Priority Logic**
```typescript
// Display priority: verified_lat/lng > lat/lng (one pin per property)
const getDisplayCoordinates = (property) => {
  if (property.verified_latitude && property.verified_longitude) {
    return { lat: property.verified_latitude, lng: property.verified_longitude, verified: true };
  }
  if (property.latitude && property.longitude) {
    return { lat: property.latitude, lng: property.longitude, verified: false };
  }
  return null; // No coordinates
};
```

### **Layer System Requirements**
- **All Properties**: Green pins, toggle on/off, NOT loaded initially
- **Site Submits**: Client dropdown + stage filter, colored by stage, NOT loaded initially
- **Map Center**: User location → fallback to Atlanta, GA

---

## 🛠️ Next Development Session

### **Start Here: Phase 2 - Data Layers & Filtering**

1. **Verify Current System**
   ```bash
   # Ensure dev server is running
   npm run dev
   # Visit mapping page - fully functional property layer
   ```

2. **Test Property Layer**
   - Visit `http://localhost:5173/mapping`
   - Click "👁️ Properties" button to toggle property layer
   - Should see all ~3,312 properties with clustering
   - Navigate to Nashville, TN - properties should now be visible
   - Test info windows by clicking markers

3. **Ready for Site Submits Layer**
   ```typescript
   // Next: Create SiteSubmitsLayer component
   // Goal: Client-specific site submits with stage filtering
   // Requirement: Color-coded markers by stage
   ```

4. **Site Submits Implementation**
   - Create SiteSubmitsLayer.tsx component
   - Add client dropdown filter in admin menu
   - Implement stage-based marker colors
   - Add stage filter controls

### **Key Environment Variables**
```bash
# Two separate API keys for security
VITE_GOOGLE_MAPS_API_KEY=AIzaSyCkyg8AffmFMfd4rGfFLFe9rKEvn4-Mx1U
VITE_GOOGLE_GEOCODING_API_KEY=AIzaSyCmOVZRorUZzNDDPz52_QKpZ8nYW3XShWs
```

### **Database Query to Find Properties Needing Geocoding**
```sql
-- Properties missing coordinates (both regular AND verified coordinates are null)
SELECT id, property_name, address, city, state, zip
FROM property
WHERE latitude IS NULL
  AND longitude IS NULL
  AND verified_latitude IS NULL
  AND verified_longitude IS NULL
  AND address IS NOT NULL
  AND address != ''
LIMIT 10;
```

---

## 📁 File Structure (Current Status)

```
src/components/mapping/
├── GoogleMapContainer.tsx        ← ✅ Complete
├── BatchGeocodingPanel.tsx       ← ✅ Complete
├── layers/
│   ├── PropertyLayer.tsx        ← ✅ Complete (Phase 1.4)
│   └── SiteSubmitsLayer.tsx     ← Phase 2.1 (NEXT)
├── hooks/
│   ├── useGeocodingBatch.ts     ← ✅ Complete
│   └── useMapData.ts            ← Phase 2.3
└── services/
    └── googleMapsService.ts     ← ✅ Complete
```

---

## 🔧 Common Commands

```bash
# Start development server
npm run dev

# Check database schema
npm run schema

# View current git status (for uncommitted mapping work)
git status

# Test API key (replace with actual key)
curl "https://maps.googleapis.com/maps/api/geocode/json?address=Atlanta,GA&key=YOUR_API_KEY"
```

---

## 📊 Progress Check

**Current Status**: ✅ Phase 1.4 Complete - Full property layer with clustering and pagination

**Today's Goal**: ✅ Property markers display all ~3,312 properties with clustering

**Next Goal**: Phase 2.1 Site Submits Layer (client-filtered data layer)

---

## 🚨 Important Notes

### **Performance Requirements**
- ✅ Handles 3,312 property markers with clustering
- ✅ Layers toggle on-demand (not loaded initially)
- Uses pagination to bypass 1000-row Supabase limit
- **SCALING ALERT**: At 5,000+ properties, consider bounds-based loading

### **Access Control**
- **Admin**: See all properties and site submits
- **Customer Portal**: Only site submits where client_id matches their account

### **Coordinate Verification System**
- Users can drag pins to set verified_latitude/verified_longitude
- Verified coordinates always take priority over regular coordinates
- Only geocode properties with NO coordinates (skip existing)

---

## 🧪 Current Production Interface

The mapping page at `http://localhost:5173/mapping` features:

### **Main Interface**
- **Clean Map View**: No clutter by default
- **Individual Test Panel** (blue): Test single addresses for geocoding
- **Admin Dropdown**: ⚙️ Admin menu in top navigation

### **Admin Functions** (Hidden by Default)
- **Batch Geocoding Panel**: Access via Admin → Batch Geocoding
- **Compact Design**: Condensed styling for production use
- **Toggle Functionality**: Show/hide as needed
- **Complete System**: All database properties already geocoded

### **Individual Geocoding Test Output**
```
✅ Success (google):
📍 33.918085, -84.465807
📧 [Full formatted address from Google]
🏙️ City: [Parsed city]
🗺️ State: [Parsed state]
📮 ZIP: [Parsed ZIP]
```

## 🎯 Quick Success Checkpoints

**✅ Checkpoint 1.1**: Basic map renders, centered on Atlanta/user location
**✅ Checkpoint 1.2**: Enhanced geocoding service with Google API + OSM fallback
**✅ Checkpoint 1.3**: Batch geocoding fills missing property coordinates
**✅ Checkpoint 1.4**: Property layer with clustering and toggle functionality
**⬜ Checkpoint 2.1**: Site submits layer with client filtering and stage colors

---

## 📋 When Resuming Development

1. **Read this Quick Start** to get context
2. **Check Progress Tracker** for detailed status
3. **Review Development Plan** for implementation details
4. **Start with current phase** (Phase 1.4)
5. **Update Progress Tracker** as you complete tasks

---

**Files to Reference**:
- `MAPPING_SYSTEM_DEVELOPMENT_PLAN.md` - Complete technical specs
- `MAPPING_SYSTEM_PROGRESS_TRACKER.md` - Detailed progress tracking
- `MAPPING_SYSTEM_QUICK_START.md` - This file (quick context)

**Ready for Phase 2.1! 🚀 Create SiteSubmitsLayer.tsx for client-filtered markers**

---

## 🚨 SCALING CONSIDERATIONS (Future Planning)

### **Performance Thresholds**
- **3,312 properties**: ✅ Current system handles well
- **5,000 properties**: Start monitoring performance, consider optimizations
- **7,500 properties**: Implement bounds-based loading as default
- **10,000+ properties**: Requires server-side clustering

### **Technical Issues at Scale**
- **Browser Memory**: 10,000+ markers = 10-20MB memory usage
- **Map Rendering**: Google Maps performance degrades after 5,000-10,000 markers
- **Network Transfer**: Large datasets increase load times significantly
- **Pagination Overhead**: Multiple API calls add latency

### **Recommended Solutions (When Needed)**
1. **Bounds-Based Loading**: Uncomment the bounds-based option in admin menu
2. **Hybrid Approach**: Auto-switch based on dataset size
3. **Virtual Clustering**: Pre-cluster data server-side
4. **Progressive Loading**: Load high-priority areas first
5. **Database Optimization**: Add spatial indexes, consider PostGIS

### **Implementation Timeline**
- Implement bounds-based loading when property count exceeds 5,000
- Add server-side clustering when count exceeds 10,000
- Monitor user feedback on performance at each threshold