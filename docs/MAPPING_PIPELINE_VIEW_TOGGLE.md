# Mapping → Pipeline View Toggle

Shipped: 2026-04-24 (commit `bafddd8a`)

## Overview

Internal users on the `/mapping` page can now switch between the Google Map view and a client-pipeline table view (the same site-submit-by-stage table used on the client portal) without leaving the page or losing any map state.

A small Kanban-columns icon appears next to the client selector on the map toolbar **whenever a client is selected**. Clicking it swaps the visible view to a pipeline table for that client. A back-to-map icon in the pipeline filter bar returns to the map.

## Why this matters

Brokers regularly bounce between "where are this client's submits on the map?" and "what stage is each submit in?". Before this change those were two different routes (`/mapping` and the deal kanban), and switching meant tearing down the Google Map — losing zoom, pan, layer toggles, drawn shapes, the pin cache, and any open slideouts. Now both views stay alive simultaneously and toggling is instant.

## How state preservation works

The `/mapping` route renders `MappingWorkspace`, a thin wrapper that holds two pieces of state:

```tsx
const [view, setView] = useState<'map' | 'pipeline'>('map');
const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
```

Both children (the map and the pipeline) are rendered into the DOM at the same time. Only their visibility flips:

```tsx
<div style={{ display: view === 'map' ? 'block' : 'none' }}>
  <MappingPageNew ... />
</div>
{selectedClient && (
  <div style={{ display: view === 'pipeline' ? 'block' : 'none' }}>
    <ClientPipelineBoard ... />
  </div>
)}
```

CSS `display: none` keeps each component mounted — React doesn't unmount, so the `GoogleMapContainer` instance, every layer, every cached pin, and every slideout stay exactly as the user left them. This mirrors the pattern already used on the portal side by `PortalContentWrapper`.

The pipeline view mounts lazily (only once a client has been selected) and stays mounted thereafter. If the client is cleared while the pipeline is visible, the workspace auto-flips back to the map.

## Architecture

The portal page and the internal map page now share most of the pipeline UI through three new modules:

| File | Role |
|------|------|
| [src/hooks/useClientPipelineData.ts](../src/hooks/useClientPipelineData.ts) | Fetches `site_submit` rows for one or more clients, manages stage list, sets up realtime Supabase subscriptions on `site_submit`, `property`, and `property_unit`. Channel names are made unique per hook instance via `useId()`. |
| [src/components/client-pipeline/ClientPipelineBoard.tsx](../src/components/client-pipeline/ClientPipelineBoard.tsx) | The reusable stage-tab + sortable table + sidebar UI. Context-agnostic — takes `clientIds`, `isEditable`, `sidebarContext`, `visibleStageNames`, etc. as props. Knows nothing about routing or auth. |
| [src/components/client-pipeline/pipelineConfig.ts](../src/components/client-pipeline/pipelineConfig.ts) | Stage name constants (`STAGE_TAB_ORDER`, `SIGNED_STAGE_NAMES`, `CLIENT_VISIBLE_STAGES`, `STAGE_DISPLAY_NAMES`). |

Two thin wrappers sit on top:

- [src/pages/portal/PortalPipelinePage.tsx](../src/pages/portal/PortalPipelinePage.tsx) — supplies portal-context client IDs, broker-vs-client stage visibility, URL `?selected=` and `?stage=` deep-link sync, and a Copy For Review Link button. Was 1,032 lines; now ~110.
- [src/pages/MappingWorkspace.tsx](../src/pages/MappingWorkspace.tsx) — supplies the internal map's selected client, owns the secondary property slideout opened from "View Property" inside a site submit sidebar.

`ClientPipelineBoard` accepts a `headerActions` slot that the workspace uses to render the back-to-map icon next to the stage tabs.

## Property slideout from pipeline view

Clicking the building icon next to the address inside the site-submit sidebar (in the pipeline view) opens the full `PinDetailsSlideout` for that property. The two slideouts stack: site submit shifts to `rightOffset=500` and the property takes the right edge — the same pattern the map page already uses. The board exposes a `siteSubmitSidebarRightOffset` prop so the parent can drive the shift.

## Routing change

```tsx
// src/App.tsx
<Route path="mapping" element={<CoachRoute><MappingWorkspace /></CoachRoute>} />
```

`MappingPageNew` is no longer routed to directly. It now accepts optional controlled props (`selectedClient`, `onSelectedClientChange`, `onSwitchToPipeline`) so the workspace can lift client state and inject the pipeline-toggle button. Uncontrolled usage (no props) still works the same way it always did.

## Permissions

No per-user permission gate. Anyone who can already access `/mapping` (i.e., any non-coach role) sees the new button. The button only appears when a client is selected.

## Files changed

- New: `src/components/client-pipeline/pipelineConfig.ts`
- New: `src/components/client-pipeline/ClientPipelineBoard.tsx`
- New: `src/hooks/useClientPipelineData.ts`
- New: `src/pages/MappingWorkspace.tsx`
- Modified: `src/pages/MappingPageNew.tsx` (controlled props + Kanban icon button next to ClientSelector)
- Modified: `src/pages/portal/PortalPipelinePage.tsx` (rewritten as thin wrapper around `ClientPipelineBoard`)
- Modified: `src/App.tsx` (`/mapping` → `MappingWorkspace`)
