# Map Marker Styles Reference

## Overview
This document provides a visual reference for all marker types used in the mapping system, helping users quickly identify different location types.

---

## Marker Types & Colors

### 1. **Your Initial Location** (Static)
- **Type:** Large Pin
- **Color:** Purple (#8B5CF6)
- **Size:** 40px
- **Purpose:** Shows where you were when the map first loaded
- **Icon:** Pin with drop shape
- **Use Case:** Starting position from browser geolocation

**Characteristics:**
- Largest pin on the map
- Purple color makes it stand out
- Static - doesn't move
- Shows initial location before GPS tracking

**Info Window Shows:**
- "Your Initial Location"
- "Starting position when map loaded"
- Hint to use GPS button for live tracking
- Coordinates

---

### 2. **Live GPS Tracking** (Dynamic)
- **Type:** Blue Dot
- **Color:** Google Blue (#4285F4)
- **Size:** 24px
- **Purpose:** Shows your real-time location when GPS tracking is active
- **Icon:** Blue dot with white ring (Google Maps style)
- **Use Case:** Active GPS tracking

**Characteristics:**
- Blue dot with white border
- Updates as you move (10m threshold)
- Semi-transparent blue accuracy circle
- Only visible when GPS tracking is ON
- High z-index (appears on top)

**Info Window Shows:**
- "Live GPS Tracking"
- Accuracy (±Xm)
- Speed (if available)
- Heading/direction (if available)

---

### 3. **Verified Properties**
- **Type:** Pin
- **Color:** Green (#10B981)
- **Size:** 30px
- **Purpose:** Properties with verified coordinates
- **Icon:** Pin with drop shape

---

### 4. **Recent Properties**
- **Type:** Pin
- **Color:** Red (#EF4444)
- **Size:** 32px
- **Purpose:** Newly created properties in current session
- **Icon:** Pin with drop shape

---

### 5. **Site Submits**
- **Type:** Pin
- **Color:** Varies by status
  - Purple (#8B5CF6) - Submitted
  - Dark Green (#059669) - Approved
  - Dark Red (#DC2626) - Rejected
  - Amber (#F59E0B) - Pending
- **Size:** 28px
- **Purpose:** Site submission markers
- **Icon:** Pin with drop shape

---

### 6. **Default Location (Atlanta)**
- **Type:** Pin
- **Color:** Gray (#6B7280)
- **Size:** 28px
- **Purpose:** Fallback location if geolocation fails
- **Icon:** Pin with drop shape

---

## Size Comparison (Largest to Smallest)

1. **Your Initial Location** - 40px (Purple Pin) ⭐ LARGEST
2. **Recent Properties** - 32px (Red Pin)
3. **Verified Properties** - 30px (Green Pin)
4. **Default Location** - 28px (Gray Pin)
5. **Site Submits** - 28px (Colored Pins)
6. **Live GPS Tracking** - 24px (Blue Dot) + Accuracy Circle

---

## Visual Distinction Strategy

### By Shape:
- **Pins:** Properties, Site Submits, Initial Location, Default Location
- **Blue Dot:** Live GPS tracking only

### By Size:
- **40px:** Your initial location (purple)
- **32px:** Recent properties (red)
- **30px:** Verified properties (green)
- **28px:** Site submits & default location
- **24px:** Live GPS tracking (blue dot)

### By Color:
- **Purple:** Your initial location (unique!)
- **Blue Dot:** Live GPS tracking (unique!)
- **Red:** Recent properties
- **Green:** Verified properties
- **Gray:** Default location
- **Various:** Site submits by status

---

## Quick Identification Guide

### "Which marker is me?"
- **Purple pin (40px):** Your starting location
- **Blue dot (24px):** Your current location (if GPS tracking is ON)

### "How do I tell them apart?"
1. **Initial Location (Purple Pin):** Large, purple, doesn't move
2. **Live Location (Blue Dot):** Small, blue, moves with you, has accuracy circle
3. **Properties (Green/Red Pins):** Medium size, green or red
4. **Site Submits (Colored Pins):** Small, various colors

---

## Use Cases

### Scenario 1: Just Opened Map
You'll see:
- **Large purple pin** at your location (if geolocation granted)
- OR **Gray pin** in Atlanta (if geolocation denied/failed)
- No blue dot (GPS tracking not started)

### Scenario 2: Started GPS Tracking
You'll see:
- **Large purple pin** at your initial location (stays there)
- **Blue dot** at your current location (follows you)
- Blue accuracy circle around the dot

### Scenario 3: Moved to Different Location
You'll see:
- **Large purple pin** still at your starting point
- **Blue dot** at your current position (if GPS tracking ON)
- Clear visual of how far you've moved

---

## Color Palette Reference

```javascript
USER_LOCATION: '#8B5CF6',    // Purple - Static initial location
GPS_TRACKING: '#4285F4',     // Google Blue - Live GPS tracking
VERIFIED: '#10B981',         // Green - Verified properties
RECENT: '#EF4444',           // Red - Recent properties
GEOCODED: '#3B82F6',         // Blue - Geocoded properties
VERIFYING: '#F97316',        // Orange - Verification in progress
DEFAULT: '#6B7280',          // Gray - Default/fallback
SUBMITTED: '#8B5CF6',        // Purple - Site submits
APPROVED: '#059669',         // Dark Green - Approved submits
REJECTED: '#DC2626',         // Dark Red - Rejected submits
PENDING: '#F59E0B',          // Amber - Pending submits
```

---

## Benefits of This Design

### Clear Visual Hierarchy
1. **Your locations are most prominent:**
   - Largest pin (purple) for initial
   - Brightest dot (blue) for live tracking
2. **Properties are medium prominence:**
   - Green/red pins, medium size
3. **Site submits are smallest:**
   - Various colors, smallest pins

### Easy to Distinguish
- **Shape:** Pins vs. Blue Dot
- **Size:** Immediate size differences
- **Color:** Each has unique purpose

### Intuitive Understanding
- **Purple = Personal** (your starting point)
- **Blue Dot = Live** (you right now)
- **Green/Red = Business** (properties)

---

## Tips for Users

### Finding Your Location
1. Look for the **large purple pin** (initial location)
2. Look for the **blue dot** (current location if tracking)
3. If you don't see the blue dot, tap the **GPS button** in bottom-left

### Tracking Your Movement
1. Enable GPS tracking (button in bottom-left)
2. Purple pin stays at starting point
3. Blue dot follows you in real-time
4. Accuracy circle shows GPS precision

### Understanding Accuracy
- **Larger circle:** Less accurate GPS signal
- **Smaller circle:** More accurate GPS signal
- **Typical accuracy:** 10-50 meters

---

## Technical Details

### Z-Index Layering (Bottom to Top)
1. Accuracy circle (z-index: 1)
2. Site submits (default z-index)
3. Properties (default z-index)
4. Initial location marker (default z-index)
5. Live GPS marker (z-index: 1000) - Always on top!

### Marker Anchoring
- **Pins:** Anchored at bottom point (where pin "touches" ground)
- **Blue Dot:** Anchored at center (center of circle)

---

## Future Enhancements

Potential improvements:
1. **Heading Indicator:** Arrow showing direction of travel
2. **Trail/Path:** Show where you've been
3. **Distance Line:** Connect purple pin to blue dot with distance
4. **Marker Clustering:** Group nearby markers when zoomed out
5. **Custom Icons:** Allow users to choose marker styles

---

**Last Updated:** October 12, 2025
**Version:** 2.0 (Added distinct static user location marker)
