# Demographics on Deal Sidebar

Shipped: 2026-04-24 (commits `a461c14c`, `ccf641c5`)

## Overview

The site submit sidebar's Data tab swaps to a "deal" variant once the underlying site submit has been converted to a deal (header turns green, deal-specific fields render). Previously the Demographics block — including the per-client custom enrichment ("Enrich with Client Demographics", e.g. Starbucks-specific radii / drive times) — only existed in the pre-deal `SiteSubmitDataTab` and disappeared the moment the submit became a deal.

The Demographics block now renders in **both** tab variants. No data migration was needed; client demographics were always being stored on the `site_submit.client_demographics` JSONB column — the deal tab just wasn't reading them.

## What you see

In the deal-variant Data tab, between the Deal Details group and the Original Property Values group:

- **Tapestry Segment** (when available)
- Population, Households, Daytime Pop, Median HH Income, Avg HH Income, Median Age — at the configured radius
- Population at the configured drive time
- Last enrichment date with stale indicator
- **Re-enrich** (property-level ESRI refresh) — if editable and the property has coordinates
- **Enrich with Client Demographics** / **Re-enrich Client Demographics** — when a client is assigned. This pulls per-client custom radii / drive times / sidebar radius from the `client` table and stores the result in `site_submit.client_demographics`.
- **View All →** opens the full `DemographicsModal` (fixed-radii table + dynamic client-radii table).
- Inline error surface if enrichment fails.

## Why it was missing before

`SiteSubmitSidebar` switches its Data tab between two components based on whether `siteSubmit.deal_id` is present:

```tsx
// Pre-deal
<SiteSubmitDataTab ... />

// Post-conversion
<DealDataTab ... />
```

`SiteSubmitDataTab` had ~240 lines of inline demographics rendering + handlers. `DealDataTab` had none — it focused on deal-specific fields (LOI Written Date, negotiated sizes/pricing) and a collapsible "Original Property Values" group, but never imported the demographics machinery.

Because the data lives on the `site_submit` row (not the `deal` row), the user's Starbucks-specific demographic pulls were technically still there in the database — they just weren't displayed.

## How it was fixed

The demographics block (heading, summary rows, all enrich/re-enrich buttons, error surface, and the modal) was extracted into a new shared component:

- [src/components/shared/DemographicsSection.tsx](../src/components/shared/DemographicsSection.tsx)

It owns:

- Modal-visibility state (`showDemographicsModal`)
- The `usePropertyGeoenrichment` hook calls
- Both enrichment flows (`handleEnrichDemographics` for property-level, `handleClientEnrichDemographics` for client-specific)
- Derived flags (`hasCoordinates`, `hasEnrichmentData`, `dataIsStale`, `hasClientDemographics`)

Both tabs now render the same component:

```tsx
<DemographicsSection
  siteSubmit={siteSubmit}
  isEditable={isEditable}
  onUpdate={onUpdate}
/>
```

`SiteSubmitDataTab` shrank by ~150 lines (removed inline block + unused imports + unused handlers). `DealDataTab` gained a single insertion between Deal Details and Original Property Values.

## "View All" with client-only demographics (fix `ccf641c5`)

After the initial release, the View All link was still gated only on property-level enrichment (`hasEnrichmentData`). If a site submit had been client-enriched but the property itself had never been ESRI-enriched, the modal could not be opened from the sidebar.

The gate was widened to:

```tsx
{(hasEnrichmentData || hasClientDemographics) && <button>View All →</button>}
```

The `DemographicsModal` already handled both data sources independently — the fix was a one-line condition change.

## Files changed

- New: [src/components/shared/DemographicsSection.tsx](../src/components/shared/DemographicsSection.tsx) — shared demographics block + modal trigger.
- Modified: [src/components/shared/SiteSubmitDataTab.tsx](../src/components/shared/SiteSubmitDataTab.tsx) — replaced inline block with `<DemographicsSection />`; dropped now-unused imports, state, and handlers.
- Modified: [src/components/shared/DealDataTab.tsx](../src/components/shared/DealDataTab.tsx) — render `<DemographicsSection />` between deal details and original property values.

## Data model reminder

| Source | Storage | Scope |
|--------|---------|-------|
| Property-level ESRI demographics | Columns on `property` (e.g., `pop_1_mile`, `hh_income_median_3_mile`, `tapestry_segment_code`, `esri_enriched_at`) | Shared across all clients viewing the property |
| Client-specific demographics | `site_submit.client_demographics` JSONB | Per `site_submit` row (so per `client × property` pair). Custom radii and drive times come from `client.demographics_radii`, `client.demographics_drive_times`, `client.demographics_sidebar_radius`. |

The deal sidebar reads from both, with client demographics taking precedence for any field they cover.
