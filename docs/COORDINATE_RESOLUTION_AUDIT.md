# Coordinate Resolution Audit — OVIS-wide cleanup

**Status:** Planning only. No code changes yet.
**Created:** 2026-06-08, during the market research agent build, after fixing a Villa Rica site_submit that had no lat/lng on its own row (only on `property.verified_latitude`) AND a backwards COALESCE order that picked unverified Salesforce snapshots over verified property coords.
**Owner:** TBD — picked up when prioritized.

---

## The rule (project-wide)

When resolving a property or site_submit's geographic location anywhere in OVIS, this priority applies — **verified beats unverified, regardless of which table the value lives on**:

1. `site_submit.verified_latitude` / `verified_longitude`
2. `property.verified_latitude` / `verified_longitude`
3. `site_submit.sf_property_latitude` / `sf_property_longitude` (Salesforce snapshot, unverified)
4. `property.latitude` / `longitude` (geocoded address, unverified)

**Why it matters:** almost every property is geocoded automatically from its address, so the unverified columns are nearly always populated — meaning a naïve "use the first non-null coord I find" picks the worse coordinate when a verified one exists. The verified columns reflect a human looking at a map and confirming the actual pin location; the geocoded point can land in the wrong parking lot, the wrong building, or the wrong side of an intersection.

Saved in memory as `feedback_coordinate_resolution.md` so it applies to all future work automatically.

---

## What's already correct (2026-06-08)

| File | Status |
|---|---|
| `supabase/functions/ovis-research-trigger/index.ts` | ✅ Verified-first COALESCE applied. |
| `supabase/migrations/20260608150000_radius_intersects_and_coord_priority.sql` (`get_municipalities_in_radius_for_site` RPC) | ✅ Verified-first COALESCE applied. |

---

## What needs auditing

**32 TypeScript / TSX files reference one of the coord columns.** Not every reference is a *resolution* decision — many just store or display whatever was passed in. The audit work is: for each file, identify whether it ever needs to *choose* between multiple coord sources, and if so, fix the order.

### Tier 1 — Map rendering / pin positioning (highest impact)

These directly affect where pins land on the map. If they pick a worse coordinate, users see wrong locations.

- [ ] [src/components/mapping/layers/PropertyLayer.tsx](src/components/mapping/layers/PropertyLayer.tsx)
- [ ] [src/components/mapping/layers/SiteSubmitLayer.tsx](src/components/mapping/layers/SiteSubmitLayer.tsx)
- [ ] [src/components/mapping/layers/RestaurantLayer.tsx](src/components/mapping/layers/RestaurantLayer.tsx)
- [ ] [src/components/mapping/slideouts/PinDetailsSlideout.tsx](src/components/mapping/slideouts/PinDetailsSlideout.tsx)
- [ ] [src/components/property/LocationSection.tsx](src/components/property/LocationSection.tsx)
- [ ] [src/utils/propertyCache.ts](src/utils/propertyCache.ts) — cache keys may be coord-based
- [ ] [src/services/geocodingService.ts](src/services/geocodingService.ts)

### Tier 2 — Search / distance / demographics (medium impact)

These affect search results, demographic enrichment, distance calculations. Wrong coord = wrong demographics, wrong "nearby" results.

- [ ] [src/components/advanced-search/SearchMapView.tsx](src/components/advanced-search/SearchMapView.tsx)
- [ ] [src/hooks/useAdvancedPropertySearch.ts](src/hooks/useAdvancedPropertySearch.ts)
- [ ] [src/components/property/MarketAnalysisSection.tsx](src/components/property/MarketAnalysisSection.tsx)
- [ ] [src/components/shared/DemographicsSection.tsx](src/components/shared/DemographicsSection.tsx)
- [ ] [src/pages/SiteAnalysisPage.tsx](src/pages/SiteAnalysisPage.tsx)
- [ ] [src/pages/PropertyDataQualityReportPage.tsx](src/pages/PropertyDataQualityReportPage.tsx)
- [ ] [src/types/advanced-search.ts](src/types/advanced-search.ts)
- [ ] [src/components/property/MarketAnalysisSection.tsx](src/components/property/MarketAnalysisSection.tsx)

### Tier 3 — Forms, emails, display (lower impact, still worth checking)

Mostly stores/displays whatever's already on the record. Less likely to make a resolution decision, but worth scanning.

- [ ] [src/components/SiteSubmitFormModal.tsx](src/components/SiteSubmitFormModal.tsx)
- [ ] [src/components/PropertyDetailsSlideoutContent.tsx](src/components/PropertyDetailsSlideoutContent.tsx)
- [ ] [src/components/property/PropertySidebar.tsx](src/components/property/PropertySidebar.tsx)
- [ ] [src/components/property/PropertyDetailScreen.tsx](src/components/property/PropertyDetailScreen.tsx)
- [ ] [src/components/property/NewPropertyPage.tsx](src/components/property/NewPropertyPage.tsx)
- [ ] [src/components/mapping/SiteSubmitContextMenu.tsx](src/components/mapping/SiteSubmitContextMenu.tsx)
- [ ] [src/components/mapping/RestaurantContextMenu.tsx](src/components/mapping/RestaurantContextMenu.tsx)
- [ ] [src/components/mapping/InlinePropertyCreationModal.tsx](src/components/mapping/InlinePropertyCreationModal.tsx)
- [ ] [src/components/mapping/AddressSearchBox.tsx](src/components/mapping/AddressSearchBox.tsx)
- [ ] [src/components/mapping/slideouts/RestaurantSlideout.tsx](src/components/mapping/slideouts/RestaurantSlideout.tsx)
- [ ] [src/components/shared/SiteSubmitSidebar.tsx](src/components/shared/SiteSubmitSidebar.tsx) — already touched by Phase D, only uses property coords for gate check
- [ ] [src/utils/siteSubmitEmailTemplate.ts](src/utils/siteSubmitEmailTemplate.ts)
- [ ] [src/hooks/useSiteSubmitEmail.ts](src/hooks/useSiteSubmitEmail.ts)
- [ ] [src/pages/MappingPage.tsx](src/pages/MappingPage.tsx)
- [ ] [src/pages/MappingPageNew.tsx](src/pages/MappingPageNew.tsx)
- [ ] [src/pages/SiteSubmitDetailsPage.tsx](src/pages/SiteSubmitDetailsPage.tsx)
- [ ] [src/pages/SiteSubmitDashboardPage.tsx](src/pages/SiteSubmitDashboardPage.tsx)
- [ ] [src/pages/portal/PortalMapPage.tsx](src/pages/portal/PortalMapPage.tsx)

### Tier S — SQL migrations that hardcode the wrong order

- [ ] [supabase/migrations/20251105_import_salesforce_verified_coords.sql](supabase/migrations/20251105_import_salesforce_verified_coords.sql) — likely sets initial values; the order may not matter here, but worth a look
- [ ] [supabase/migrations/20251105_create_restaurant_tables.sql](supabase/migrations/20251105_create_restaurant_tables.sql)
- [ ] [supabase/migrations/20251105_optimize_restaurant_queries.sql](supabase/migrations/20251105_optimize_restaurant_queries.sql)
- [ ] Any `municipal_project_v` view variant that pulls site coords

---

## Audit recipe (per file)

For each file:

1. `grep -n -E "verified_latitude|sf_property_latitude" <file>` to find the references.
2. Classify each match:
   - **(A) Write/store:** populating a column from an external source. Usually fine — no resolution needed.
   - **(B) Display-only:** rendering a single column as-is. Usually fine.
   - **(C) Resolution:** picking ONE coord from multiple candidates (a COALESCE, a `??` chain, a conditional, a fallback in a hook). **These are the targets.**
3. For each (C), check the order against the rule above. If it's wrong, fix it.
4. If the resolution lives in a hook or util, fix once at the source and remove duplicated chains in callers.

### Shared util to consider

Repeated `?? ?? ?? ??` chains are a smell. Once two or three files are fixed by hand, consider extracting a `resolveSiteCoords(siteSubmit, property)` helper into `src/utils/coordinateResolution.ts` (or similar) so the rule lives in one place. The market research feature could then import the same helper instead of re-encoding the chain in the edge function.

---

## Risk / priority

- **Tier 1** affects what users *see*. Fix first.
- **Tier 2** affects what users *decide on* (demographics, distances). Fix second.
- **Tier 3** is mostly cosmetic. Sweep last, opportunistically.
- **Tier S** is SQL — small surface area, low risk.

**Estimated effort:** 1–2 focused sessions for Tier 1+2 (the high-value half), plus an opportunistic Tier 3 sweep when touching those files for other reasons.

---

## What this audit deliberately does NOT do

- Doesn't change any column names or schemas.
- Doesn't backfill data — the underlying `verified_*` columns retain whatever they have today; this is purely a read-priority change.
- Doesn't add a new "best_latitude" computed column on either table. The COALESCE-at-read-time approach is simpler and lets the verified columns stay as the source of truth.
- Doesn't touch the demographics layer's caching logic — the new ESRI cache might key on coord, but that's already an audit point in Tier 1.

---

## Related

- Memory: [feedback_coordinate_resolution.md](../../.claude/projects/-Users-mike-Documents-GitHub-react-kanban-board/memory/feedback_coordinate_resolution.md)
- The market research agent's working implementation of the rule: [ovis-research-trigger/index.ts](supabase/functions/ovis-research-trigger/index.ts) and [migration 20260608150000](supabase/migrations/20260608150000_radius_intersects_and_coord_priority.sql)
- Prior demographics work where geocoded-vs-verified coords mattered: [DEMOGRAPHICS_ESRI_VS_SITESUSA.md](DEMOGRAPHICS_ESRI_VS_SITESUSA.md)
