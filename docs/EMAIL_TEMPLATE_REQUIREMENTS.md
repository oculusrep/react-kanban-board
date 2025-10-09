# Site Submit Email Template Requirements

## Template Structure and Field Mappings

### Line 1: Contact Names
- **Content:** All Site Selector contact first names for the client, comma-separated
- **Source:** Fetch all contacts where `contact.is_site_selector = true` AND `contact.client_id = site_submit.client_id`
- **Format:** `Brian, Neal, Ryan,`
- **Show/Hide:** Always show

### Line 2: Boilerplate Intro
- **Content:** "Please find below a new site submit for [property_name]. Your feedback on this site is appreciated."
- **Source:** `site_submit.property.property_name`
- **Show/Hide:** Always show

### Line 3: Property Name
- **Label:** **Property Name:** (bold)
- **Source:** `site_submit.property.property_name`
- **Show/Hide:** Always show

### Line 4: Trade Area
- **Label:** Trade Area:
- **Source:** `site_submit.property.trade_area`
- **Show/Hide:** Only show if `trade_area` is not null

### Line 5: Map Link
- **Label:** Map Link:
- **Source:** `site_submit.property.map_link` (auto-generated from coordinates)
- **Logic:** Auto-generate Google Maps URL from verified_latitude/verified_longitude (priority) or latitude/longitude
- **Format:** Clickable hyperlink
- **URL Format:** `https://www.google.com/maps?q={lat},{lng}`
- **Show/Hide:** Always show if map_link exists

### Line 6: Address
- **Label:** Address:
- **Source:** `site_submit.property.address`, `city`, `state`
- **Format:** `{address}, {city}, {state}`
- **Example:** "721 Ronald Reagan Boulevard Cumming, GA"
- **Show/Hide:** Always show

### Line 7: Available Sqft / Acres (Complex Conditional Logic)
**Priority 1:** If `site_submit.property_unit_id` exists AND `property_unit.sqft` is not null
- **Label:** Available Sqft:
- **Source:** `property_unit.sqft`

**Priority 2:** Else if `property.available_sqft` is not null
- **Label:** Available Sqft:
- **Source:** `property.available_sqft`

**Priority 3:** Else if `property.acres` is not null
- **Label:** Acres:
- **Source:** `property.acres`
- **Additional:** If `property.building_sqft` is also not null, add new line below:
  - **Label:** Building Sqft:
  - **Source:** `property.building_sqft`

**Show/Hide:** Hide all lines if all fields are null

### Line 8: Base Rent / Ground Lease / Purchase Price (Complex Conditional Logic)
**Priority 1:** If `site_submit.property_unit_id` exists
- **Label:** Base Rent:
- **Source:** `property_unit.rent`
- **Format:** $xxx.xx

**Priority 2:** Else if `property.rent_psf` is not null
- **Label:** Base Rent:
- **Source:** `property.rent_psf`
- **Format:** $xxx.xx

**Priority 3:** Else if `property.asking_lease_price` is not null
- **Label:** Ground Lease Rent:
- **Source:** `property.asking_lease_price`
- **Format:** $xxx.xx

**Priority 4:** Else if `property.asking_purchase_price` is not null
- **Label:** Purchase Price:
- **Source:** `property.asking_purchase_price`
- **Format:** $xxx.xx

**Show/Hide:** Hide line if all fields are null

### Line 9: NNN
**Priority 1:** If `site_submit.property_unit_id` exists
- **Label:** NNN:
- **Source:** `property_unit.nnn`
- **Format:** $xxx.xx

**Priority 2:** Else if `property.nnn_psf` is not null
- **Label:** NNN:
- **Source:** `property.nnn_psf`
- **Format:** $xxx.xx

**Show/Hide:** Hide line if both fields are null

### Line 10: Blank Line
- **Content:** Spacing between sections

---

## Supporting Files Section

### Line 11: Section Header
- **Content:** **Supporting Files:** (bold)
- **Show/Hide:** Always show

### Line 12: Marketing Materials
- **Content:** Hyperlink with text "Marketing Materials"
- **Source:** `property.marketing_materials`
- **Format:** `[Marketing Materials](marketing_materials_url)`
- **Show/Hide:** Only show if `marketing_materials` is not null

### Line 13: Site Plan
- **Content:** Hyperlink with text "Site Plan"
- **Source:** `property.site_plan`
- **Format:** `[Site Plan](site_plan_url)`
- **Show/Hide:** Only show if `site_plan` is not null

### Line 14: Demographics
- **Content:** Hyperlink with text "Demographics"
- **Source:** `property.demographics`
- **Format:** `[Demographics](demographics_url)`
- **Show/Hide:** Only show if `demographics` is not null

### Line 15: Blank Line
- **Content:** Spacing between sections

---

## Property Location Details Section

### Line 16: Section Header
- **Content:** **Property Location Details** (bold)
- **Show/Hide:** Always show

### Line 17: Traffic Count
- **Label:** Traffic Count:
- **Source:** `property.traffic_count`
- **Show/Hide:** Only show if not null

### Line 18: Traffic Count 2nd
- **Label:** Traffic Count 2nd:
- **Source:** `property.traffic_count_2`
- **Show/Hide:** Only show if not null

### Line 19: Total Traffic Count
- **Label:** Total Traffic Count:
- **Source:** `property.total_traffic`
- **Show/Hide:** Only show if not null

### Line 20: Blank Line
- **Content:** Spacing between sections

---

## Site Demographics Section

### Line 21: Section Header
- **Content:** **Site Demographics:** (bold)
- **Show/Hide:** Only show if ANY of the following demographic fields have values

### Line 22: 1 Mile Population
- **Label:** 1 Mile Population:
- **Source:** `property.1_mile_pop`
- **Show/Hide:** Only show if not null

### Line 23: 3 Mile Population
- **Label:** 3 Mile Population:
- **Source:** `property.3_mile_pop`
- **Show/Hide:** Only show if not null

### Line 24: Median HH Income (3 miles)
- **Label:** Median HH Income (3 miles):
- **Source:** `property.hh_income_median_3_mile`
- **Format:** $xxx,xxx.xx
- **Show/Hide:** Only show if not null

### Line 25: Blank Line
- **Content:** Spacing between sections

---

## Site Notes Section

### Line 26: Section Header
- **Content:** **Site Notes:** (bold)
- **Show/Hide:** Only show if `site_submit.notes` is not null

### Line 27: Site Notes Content
- **Content:** Plain text from notes field (no label)
- **Source:** `site_submit.notes`
- **Show/Hide:** Only show if not null

### Line 28: Blank Line
- **Content:** Spacing between sections

---

## Competitor Sales Section

### Line 29: Section Header
- **Content:** **Competitor Sales** (bold)
- **Show/Hide:** Only show if `site_submit.competitor_data` is not null

### Line 30: Competitor Data
- **Content:** Rich text with line breaks preserved (no label)
- **Source:** `site_submit.competitor_data`
- **Show/Hide:** Only show if not null
- **Note:** If null, also hide the section header

### Line 31: Blank Line
- **Content:** Spacing between sections

---

## Closing Boilerplate

### Line 32: Boilerplate Text
- **Content:** "If this property is a pass, please just respond back to this email with a brief reason as to why it's a pass. If you need more information or want to discuss further, let me know that as well please."
- **Show/Hide:** Always show

### Line 33-34: Blank Lines
- **Content:** 2-3 blank lines for spacing

---

## Email Signature

### Line 35-39: Sender Signature
**Format:**
```
Thanks!

[first_name] [last_name]
[phone_number]
[email]
```

**Source:** Logged-in user from `user` table
- `user.first_name`
- `user.last_name`
- `user.phone_number` (NOTE: This field may not exist in schema - needs verification)
- `user.email`

**Show/Hide:** Always show

---

## Technical Implementation Notes

### Map Link Auto-Generation
- When `property.latitude`, `property.longitude`, `property.verified_latitude`, or `property.verified_longitude` changes
- Auto-generate Google Maps URL: `https://www.google.com/maps?q={lat},{lng}`
- Save to `property.map_link` field
- Priority: Use verified coordinates if available, otherwise use regular coordinates

### Site Selector Contacts
- Query: `SELECT first_name FROM contact WHERE client_id = site_submit.client_id AND is_site_selector = true AND email IS NOT NULL`
- Join first names with ", " (comma-space)

### Property Unit vs Property Fields
- Many fields have conditional logic based on whether `site_submit.property_unit_id` exists
- If property_unit_id exists, prioritize property_unit fields
- Otherwise, fall back to property fields

### Number Formatting
- Currency: `$xxx.xx` or `$xxx,xxx.xx`
- Use `.toLocaleString()` for proper comma placement
- Fixed 2 decimal places for currency

### Rich Text / Line Breaks
- `site_submit.competitor_data` should preserve line breaks from the database
- Convert `\n` to `<br/>` tags in HTML

### User Phone Number
- Schema check needed: `user` table may not have `phone_number` field
- Alternative: Use a default phone or omit if not available
