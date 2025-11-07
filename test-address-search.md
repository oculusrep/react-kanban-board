# Address Search Box Test Script

**Commit:** `60f2ae7` - Property search with partial matching improvements
**Date:** November 6, 2025

---

## Test Cases

### ✅ Test 1: Partial Property Name Match
**Goal:** Verify that typing part of a property name shows the property in suggestions

**Steps:**
1. Navigate to the mapping page: `/mapping`
2. Click in the search box at the top
3. Type: `Del Taco`
4. Wait for autocomplete suggestions to appear (300ms debounce)

**Expected Result:**
- ✅ Should see "Dark Del Taco - IHOP Now" in the property suggestions (with 🏢 icon)
- ✅ Should show as "Property in your database" tag
- ✅ Console should log: `📋 Property names: ['Dark Del Taco - IHOP Now', ...]`

**Console Output to Check:**
```
🏢 Searching properties for: Del Taco
🔍 Raw query returned X properties
✅ After coordinate filter: X properties
✅ Returning X property matches
📋 Property names: [...]
```

---

### ✅ Test 2: Multiple Word Partial Match
**Goal:** Verify multi-word searches work

**Steps:**
1. Clear the search box
2. Type: `IHOP`
3. Wait for suggestions

**Expected Result:**
- ✅ Should see "Dark Del Taco - IHOP Now" (matches "IHOP" in the name)
- ✅ Should appear in property suggestions

---

### ✅ Test 3: City Name Search
**Goal:** Verify searching by city name works

**Steps:**
1. Clear the search box
2. Type a city name where you have properties (e.g., `Nashville` or `Atlanta`)
3. Wait for suggestions

**Expected Result:**
- ✅ Should see properties from that city
- ✅ Secondary text should show the city name in the address
- ✅ Console should show properties filtered by city

---

### ✅ Test 4: Address Partial Match
**Goal:** Verify searching by street address works

**Steps:**
1. Clear the search box
2. Type part of a known property address (e.g., `Main Street`)
3. Wait for suggestions

**Expected Result:**
- ✅ Should see properties with matching addresses
- ✅ Both property results (🏢) and Google Places results may appear

---

### ✅ Test 5: Case Insensitivity
**Goal:** Verify search is case-insensitive

**Steps:**
1. Clear the search box
2. Type: `del taco` (lowercase)
3. Wait for suggestions

**Expected Result:**
- ✅ Should see same results as "Del Taco"
- ✅ Case should not matter for matching

---

### ✅ Test 6: Property Selection
**Goal:** Verify clicking a property suggestion centers map on it

**Steps:**
1. Type: `Del Taco`
2. Click on "Dark Del Taco - IHOP Now" in the suggestions
3. Watch the map

**Expected Result:**
- ✅ Map should center on the property location
- ✅ Suggestions dropdown should close
- ✅ Search box should show the property name
- ✅ Console should log: `🏢 Calling onPropertySelect with: {...}`

---

### ✅ Test 7: No Results Handling
**Goal:** Verify behavior when no properties match

**Steps:**
1. Clear the search box
2. Type: `XYZABC123` (gibberish that won't match anything)
3. Wait for suggestions

**Expected Result:**
- ✅ Should show "No address suggestions found" message
- ✅ Should say "Press Enter to search anyway"
- ✅ Console should log: `⚠️ No suggestions found`

---

### ✅ Test 8: Coordinate Filtering
**Goal:** Verify only properties with coordinates appear

**Steps:**
1. Check console logs while typing any search
2. Look for the difference between "Raw query returned" and "After coordinate filter"

**Expected Result:**
- ✅ Raw query count may be higher
- ✅ After coordinate filter should only include properties with lat/lng or verified_lat/lng
- ✅ Properties without coordinates should be filtered out

---

## Performance Checks

### ⏱️ Speed Test
**Steps:**
1. Type a query
2. Observe delay before suggestions appear

**Expected:**
- ✅ Should see suggestions within ~500ms (300ms debounce + query time)
- ✅ Loading spinner should briefly appear

---

### 🔍 Logging Test
**Steps:**
1. Open browser console (F12)
2. Type any search query
3. Review console output

**Expected Console Logs:**
```
🔍 Search effect triggered: {value: "...", suppressSearch: false, length: X}
🏢 Searching properties for: ...
🔍 Raw query returned X properties
✅ After coordinate filter: X properties
✅ Returning X property matches
📋 Property names: [...]
```

---

## Known Issues to Watch For

### ⚠️ Issue 1: Empty Results
**If no properties appear when they should:**
- Check console for errors
- Verify property has coordinates in database
- Check that property_name is not null

### ⚠️ Issue 2: Slow Performance
**If autocomplete is sluggish:**
- Check network tab for slow queries
- Verify limit(10) is working
- May need to reduce debounce delay

### ⚠️ Issue 3: Wrong Properties
**If wrong properties match:**
- Check console logs for query details
- Verify .ilike pattern is working
- Check if properties have similar names

---

## Quick SQL Verification

To verify "Dark Del Taco - IHOP Now" exists and has coordinates:

```sql
SELECT
  id,
  property_name,
  latitude,
  longitude,
  verified_latitude,
  verified_longitude,
  city,
  state
FROM property
WHERE property_name ILIKE '%Del Taco%'
LIMIT 5;
```

**Expected:** Should return the property with coordinates

---

## Success Criteria

✅ **PASS if:**
- Typing "Del Taco" shows "Dark Del Taco - IHOP Now"
- Partial matches work anywhere in property name
- City and address searches work
- Properties without coordinates are filtered out
- Selection centers map on property
- Console logs show detailed search info

❌ **FAIL if:**
- No suggestions appear for "Del Taco"
- Only properties starting with search text appear
- Properties without coordinates show up
- Console shows errors
- Map doesn't center on selected property

---

## Rollback Plan

If the search is broken:

```bash
git revert 60f2ae7
git push origin main
```

This will restore the previous search behavior.

---

**Happy Testing! 🧪**
