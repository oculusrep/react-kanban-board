# 🚀 Mapping System - Quick Start Guide

**Use this document to quickly get back into development context**

---

## 🎯 Where We Are

**Current Phase**: Phase 1 - Foundation & Geocoding
**Next Task**: 1.1 Google Maps API Setup
**Goal**: Get basic Google Maps rendering with property data

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

### **Start Here: Phase 1.1 Google Maps API Setup**

1. **Environment Check**
   ```bash
   # Verify API keys are in .env
   cat .env | grep GOOGLE
   ```

2. **Install Dependencies** (if not done)
   ```bash
   npm install @googlemaps/js-api-loader @types/google.maps
   ```

3. **Create Basic Map Component**
   ```typescript
   // Create: src/components/mapping/GoogleMapContainer.tsx
   // Goal: Basic map centered on Atlanta, GA with user location fallback
   ```

4. **Test Map Rendering**
   - Add GoogleMapContainer to a test page
   - Verify map loads without errors
   - Test user geolocation permission

### **Quick Database Query to Test With**
```sql
-- Get first 10 properties with coordinates for testing
SELECT id, property_name, address, city, state,
       latitude, longitude, verified_latitude, verified_longitude
FROM property
WHERE (latitude IS NOT NULL OR verified_latitude IS NOT NULL)
LIMIT 10;
```

---

## 📁 File Structure (What to Create)

```
src/components/mapping/
├── GoogleMapContainer.tsx        ← START HERE
├── layers/
│   └── PropertyLayer.tsx        ← Phase 1.4
├── hooks/
│   ├── useGeocodingBatch.ts     ← Phase 1.3
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

**Current Status**: ⬜ Phase 1.1 Not Started

**Today's Goal**: ✅ Get basic Google Maps rendering

**This Week Goal**: Complete Phase 1 (Foundation & Geocoding)

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

## 🎯 Quick Success Checkpoints

**✅ Checkpoint 1.1**: Basic map renders, centered on Atlanta/user location
**⬜ Checkpoint 1.2**: Enhanced geocoding service with Google API + OSM fallback
**⬜ Checkpoint 1.3**: Batch geocoding fills missing property coordinates
**⬜ Checkpoint 1.4**: Property layer with clustering and toggle functionality

---

## 📋 When Resuming Development

1. **Read this Quick Start** to get context
2. **Check Progress Tracker** for detailed status
3. **Review Development Plan** for implementation details
4. **Start with current phase** (Phase 1.1)
5. **Update Progress Tracker** as you complete tasks

---

**Files to Reference**:
- `MAPPING_SYSTEM_DEVELOPMENT_PLAN.md` - Complete technical specs
- `MAPPING_SYSTEM_PROGRESS_TRACKER.md` - Detailed progress tracking
- `MAPPING_SYSTEM_QUICK_START.md` - This file (quick context)

**Ready to code! 🚀 Start with GoogleMapContainer.tsx**