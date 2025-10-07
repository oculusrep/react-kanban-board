# Client Page Improvements

## Date: 2025-10-07

## Summary
Multiple improvements made to the Client Details page to fix bugs, improve UX consistency, and streamline the interface.

---

## 1. Fixed Active Client Checkbox Bug

**Issue:** The "Active Client" checkbox was not saving properly. When checked and saved, the client would not appear in the map search.

**Root Cause:** The form was using the field name `active` instead of the correct database field `is_active_client`.

**Files Changed:**
- `src/components/ClientOverviewTab.tsx`

**Changes:**
- Updated FormData interface to use `is_active_client` instead of `active`
- Updated form initialization to use `is_active_client: true` as default
- Updated useEffect to read `client.is_active_client` instead of `client.active`
- Updated checkbox binding to use `formData.is_active_client`
- Updated save function to correctly map to `is_active_client` field

---

## 2. Fixed Client Type Dropdown Save Bug

**Issue:** Changes to the Client Type dropdown were not being saved to the database.

**Root Cause:** The form was loading `client.type` but the database field is `client.sf_client_type`.

**Files Changed:**
- `src/components/ClientOverviewTab.tsx`

**Changes:**
- Updated useEffect to load `client.sf_client_type` into `formData.type`
- Updated save function to map `formData.type` to `sf_client_type` field
- Added console logging for debugging save operations

---

## 3. Fixed Client Search to Show Site Submit Counts

**Issue:** Client search in map view showed "deal counts" instead of "site submit counts", and didn't filter clients by whether they had site submits with coordinates.

**Files Changed:**
- `src/hooks/useClientSearch.ts`
- `src/components/mapping/ClientSelector.tsx`

**Changes:**
- Added `site_submit_count` to `ClientSearchResult` interface
- Added query to count site submits with coordinates for each client
- Updated display to show "X submits" instead of "X deals"
- Added debug logging to help troubleshoot client visibility issues
- Note: Removed initial filter that only showed clients with site submits - all active clients now appear in search

---

## 4. Improved Save Button UX

**Issue:** Save button was always visible even when no changes were made, and used generic blue styling.

**Files Changed:**
- `src/components/ClientOverviewTab.tsx`

**Changes:**
- Added `hasChanges` state to track when form data differs from original
- Added `originalFormData` state to compare against current form data
- Modified `handleInputChange` to detect changes using JSON.stringify comparison
- Updated save button to only show when `hasChanges` is true or creating new client
- Changed save button color from blue to green (`bg-green-600`) to indicate unsaved changes
- Centered save button for better visual emphasis
- Reset `hasChanges` to false after successful save
- Removed "Delete Client" button from bottom of page (kept only at top)

---

## 5. Fixed Client Save to Only Send Valid Database Fields

**Issue:** Form was trying to save fields that don't exist in the database schema, causing save failures.

**Root Cause:** FormData contains many fields (email, industry, annual_revenue, etc.) that exist in the form but not in the client table.

**Files Changed:**
- `src/components/ClientOverviewTab.tsx`

**Changes:**
- Modified save function to explicitly map only valid database fields:
  - `client_name`
  - `phone`
  - `website`
  - `description`
  - `billing_*` fields (street, city, state, zip, country)
  - `shipping_*` fields (street, city, state, zip, country)
  - `is_active_client`
  - `sf_client_type` (mapped from formData.type)
  - `updated_at`
- Added better error logging with JSON stringification
- Added success logging to confirm saves

---

## 6. Removed Unnecessary Top Buttons

**Issue:** "Hide Info" and "Back to Dashboard" buttons cluttered the interface and provided functionality not needed.

**Files Changed:**
- `src/pages/ClientDetailsPage.tsx`

**Changes:**
- Removed "Hide Info" button that toggled sidebar visibility
- Removed "Back to Dashboard" button
- Kept only the red "Delete" button at the top for existing clients

---

## 7. Added Dropbox Files Tab to Property Map Slideout

**Issue:** Users couldn't access property files when viewing properties from the map.

**Files Changed:**
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx`

**Changes:**
- Added `FolderOpen` icon import from lucide-react
- Added `FileManager` component import
- Added 'files' to `TabType` union type
- Added FILES tab to property tab configuration
- Implemented files tab content with `FileManager` component
- Only shows FILES tab for properties (not site submits)

---

## 8. Fixed Property Field Formats in Map Slideout

**Issue:** Property fields in map slideout didn't match the formatting and UX of the main property details page.

**Files Changed:**
- `src/components/mapping/slideouts/PinDetailsSlideout.tsx`
- `src/components/property/PropertyInputField.tsx`
- `src/components/property/PropertySquareFootageField.tsx`
- `src/components/property/FinancialSection.tsx`

**Changes:**

### Rent PSF and NNN PSF Fields:
- Replaced basic text inputs with `PropertyPSFField` component
- Now displays as `$X.XX / SF` format with 2 decimal places
- Uses compact mode for smaller font size
- Consistent with property details page

### Available Sqft Field:
- Created new `PropertySquareFootageField` component
- Displays as `X,XXX SF` format with comma separators and no decimals
- Added compact prop support for smaller displays
- Replaced basic number input with specialized component
- Applied to both shopping centers and other building types in FinancialSection

### Property Update Save Fix:
- Fixed bug where property updates from map slideout weren't saving
- Changed `id` reference to `localPropertyData.id` in Dropbox sync call (line 382)

---

## Database Schema Notes

### Client Table Fields (relevant to changes):
- `client_name` - string
- `sf_client_type` - string (NOT `type`)
- `is_active_client` - boolean (NOT `active`)
- `phone` - string
- `website` - string
- `description` - string
- `billing_street`, `billing_city`, `billing_state`, `billing_zip`, `billing_country`
- `shipping_street`, `shipping_city`, `shipping_state`, `shipping_zip`, `shipping_country`

### Fields that DO NOT exist in client table:
- `email`
- `industry`
- `annual_revenue`
- `number_of_employees`
- `ownership`
- `ticker_symbol`
- `parent_account`
- `account_source`
- `rating`
- `sic_code`
- `naics_code`
- `clean_status`
- `customer_priority`
- `upsell_opportunity`

Note: These fields exist in the form UI but are not persisted to the database.

---

## Testing Recommendations

1. **Active Client Checkbox:**
   - Create/edit a client
   - Check "Active Client" checkbox
   - Save changes
   - Search for client in map view - should appear in results
   - Verify `is_active_client` = true in database

2. **Client Type Dropdown:**
   - Edit a client
   - Change Client Type dropdown
   - Green "Save Changes" button should appear
   - Click save
   - Refresh page - verify Client Type persisted
   - Check console for "💾 Saving client" and "✅ Client saved successfully" logs

3. **Save Button Behavior:**
   - Open existing client - no save button should show
   - Make any change - green "Save Changes" button appears
   - Click save - button disappears
   - No changes made - button stays hidden

4. **Map Property Slideout:**
   - Click property on map
   - View FILES tab - should show Dropbox file manager
   - Edit Available Sqft - should save properly
   - Edit Rent PSF / NNN PSF - should save and display correctly
   - Click "Update Property" - changes should persist

5. **Client Search:**
   - Search for client name in map view
   - Should show "X submits" count
   - All active clients should appear (even with 0 submits)
   - Check console for debug logs showing is_active_client values

---

## Known Limitations

1. Many fields in the client form UI (email, industry, etc.) are not persisted to the database
2. Client search only shows first 50 active clients in dropdown
3. Client search requires minimum 2 characters to trigger
4. Change detection uses JSON.stringify which may not detect all edge cases

---

## Future Improvements

1. Consider adding missing fields to client database schema
2. Add pagination to client search for large datasets
3. Implement more sophisticated change detection (deep equality check)
4. Add visual indicator for which specific fields have changed
5. Add "Discard Changes" button alongside "Save Changes"
6. Consider adding keyboard shortcut (Ctrl+S) for saving
