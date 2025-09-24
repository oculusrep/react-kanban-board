# 🚀 Mapping System - Quick Start Guide

**Use this document to quickly get back into development context**

---

## 🎯 Where We Are

**Current Phase**: Phase 1 - Foundation & Geocoding
**Completed**: 1.1 Google Maps Setup ✅, 1.2 Enhanced Geocoding ✅, 1.3 Batch Geocoding ✅
**Next Task**: 1.4 Property Layer Foundation
**Goal**: Create property layer with clustering for map visualization

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

### **Start Here: Phase 1.4 Property Layer Foundation**

1. **Verify Current System**
   ```bash
   # Ensure dev server is running
   npm run dev
   # Visit mapping page - should show clean interface
   ```

2. **Test Admin Functions**
   - Visit `http://localhost:5173/mapping`
   - Click "⚙️ Admin" dropdown in top navigation
   - Click "🏢 Batch Geocoding" to open panel
   - All properties should already be geocoded (0 need processing)
   - Test panel close functionality

3. **Ready for Property Layer**
   ```typescript
   // Next: Create PropertyLayer component
   // Goal: Display geocoded properties as markers on map
   // Requirement: Handle 6,000+ markers with clustering
   ```

4. **Map Marker Implementation**
   - Create PropertyLayer.tsx component
   - Integrate with Google Maps clustering
   - Add toggle controls for layer visibility
   - Connect to database with geocoded coordinates

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

## 📁 File Structure (What to Create)

```
src/components/mapping/
├── GoogleMapContainer.tsx        ← ✅ Complete
├── BatchGeocodingPanel.tsx       ← ✅ Complete
├── layers/
│   └── PropertyLayer.tsx        ← Phase 1.4 (NEXT)
├── hooks/
│   ├── useGeocodingBatch.ts     ← ✅ Complete
│   └── useMapData.ts            ← Phase 2.3
└── services/
    └── googleMapsService.ts     ← Phase 1.2
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

**Current Status**: ✅ Phase 1.3 Complete - Production-ready batch geocoding system

**Today's Goal**: ✅ Full batch geocoding system with admin UX completed

**Next Goal**: Phase 1.4 Property Layer Foundation (display markers on map)

---

## 🚨 Important Notes

### **Performance Requirements**
- Must handle 6,000+ markers with clustering
- Layers should NOT load initially (toggle on-demand)
- Use map bounds-based queries for efficiency

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
**⬜ Checkpoint 1.4**: Property layer with clustering and toggle functionality

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

**Ready for Phase 1.4! 🚀 Create PropertyLayer.tsx for map markers**