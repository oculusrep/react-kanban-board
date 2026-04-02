# Restaurant Placer Rank Feature

**Date:** April 1, 2026

## Overview

Added the ability to manually enter and track Placer.ai rankings for restaurant locations directly from the map popup. This lets users record competitive ranking data while browsing restaurant pins on the mapping page.

## What Was Built

### Database: `restaurant_placer_rank` Table

New table to store placer ranking history per restaurant location.

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `store_no` | TEXT | FK to `restaurant_location.store_no` |
| `rank_position` | INTEGER | Numerator (e.g., 45 in "45/300") |
| `rank_total` | INTEGER | Denominator (e.g., 300 in "45/300") |
| `rank_percentage` | DOUBLE PRECISION | Percentage rank (displayed as whole number) |
| `rank_date` | DATE | Date of the ranking |
| `placer_url` | TEXT | Optional URL to the Placer.ai page |
| `entered_by` | UUID | FK to `auth.users` |
| `created_at` | TIMESTAMPTZ | Auto-set on insert |

**RLS Policies:**
- All authenticated users can read and insert ranks
- Users can only update/delete their own entries

**Migration file:** `supabase/migrations/20260401_create_restaurant_placer_rank.sql`

### Restaurant Map Popup Enhancements

**Files changed:**
- `src/components/mapping/popups/RestaurantPopup.tsx`
- `src/components/mapping/layers/RestaurantLayer.tsx`

**Placer Rank Section in Popup:**
- Displays the most recent rank as "position/total" with percentage
- "Add" / "Add New" button opens an inline form with fields for rank #, total, percentage, date
- Optional Placer URL field when adding a rank
- If a URL exists, shows an "Open in Placer" link (opens in new tab) with an edit button
- If no URL, shows "+ Add Placer URL" button with inline edit capability
- Percentage displays as whole number (no decimals)

### Popup Behavior Fixes

Several fixes were made to the restaurant popup overlay system:

1. **AuthProvider crash fix** — The popup renders via `ReactDOM.createRoot` outside the main React component tree, so `useAuth()` would crash. Fixed by passing `user` as a prop from `RestaurantLayer` instead.

2. **Input fields not accepting typing** — Google Maps was intercepting keyboard and mouse events inside the overlay. Fixed by calling `stopPropagation()` on all relevant events (`mousedown`, `mouseup`, `click`, `dblclick`, `keydown`, `keyup`, `keypress`, `input`, `wheel`) on the popup container div.

3. **Popup staying open** — The popup now only closes when the user clicks the X button or clicks a different restaurant marker. It no longer closes on map click or map drag.

4. **Auto-pan on open** — When a popup opens, the map automatically pans to center on the marker with a 150px upward offset so the full popup is visible.

5. **Drag-safe** — Restaurant refetching (viewport-based loading) is skipped while a popup is open, preventing markers from being recreated and destroying the popup overlay.

## How It Works

1. User toggles the restaurant layer on the map
2. Clicks a restaurant marker to open the popup
3. Popup shows restaurant name, address, sales data, and placer rank section
4. User clicks "Add" to open the rank form
5. Enters rank position, total, percentage, date, and optional Placer URL
6. Clicks "Save Rank" to save to `restaurant_placer_rank` table
7. Rank displays in the popup with optional link to open in Placer.ai
8. Users can add new ranks over time (history is preserved, latest shown)

## Branch History

- Feature was initially developed on `feature/restaurant-placer-rank` branch
- Merged to `main` on April 1, 2026
- Bug fixes applied directly to `main` after merge
