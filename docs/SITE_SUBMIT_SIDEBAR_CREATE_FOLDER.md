# Create Folder from Site Submit Sidebar

Shipped: 2026-04-24 (commit `3d7672c7`)

## Overview

The Files tab on the site submit sidebar now lets brokers and admins create new Dropbox folders directly from the Property Files and Deal Files sections. Previously the section header only had upload + refresh icons; folder creation required dropping into the standalone FileManager.

## UI

In each section header (next to the upload icon), a folder-with-plus icon appears for any user with `canUpload` (brokers / admins / internal users — not read-only portal clients).

Clicking it expands an inline blue input row at the top of that section's content area:

- Type a folder name → press Enter to create, Escape to cancel
- Or use the Create / Cancel buttons
- A hint shows where the folder will land (`Will be created in /SubA/SubB`) when the user is currently navigated into a subfolder
- Errors surface inline (e.g. `No folder path available` when the entity has no provisioned Dropbox root)

Only one section can be in "creating" mode at a time. Opening the input on a collapsed section auto-expands it.

## Where it works

- **Deal Files** section — the primary use case. When a site submit has been converted to a deal, brokers can organize the deal's Dropbox folder with subfolders (e.g., `LOIs`, `Comps`, `Plans`) directly from the sidebar.
- **Property Files** section — for symmetry. Note that if the property has no Dropbox root provisioned yet, the create call will surface the inline error instead of creating; this preserves the existing "files come from the parent property folder" behavior for site submits that don't have their own folder.

The `canUpload` gate keeps the button hidden for client-portal users, so they cannot create folders.

## How it works

The `useDropboxFiles` hook already exposed a `createFolder(name)` function that creates a folder at the entity's root Dropbox path. To support creating at the user's current navigation depth (e.g., they've drilled into `/Comps/2025` and want a `Q4` subfolder), the signature was extended:

```ts
// Before
createFolder: (folderName: string) => Promise<void>;

// After
createFolder: (folderName: string, parentSubPath?: string) => Promise<void>;
```

The optional `parentSubPath` is appended to the entity root before creating. The change is source-compatible — existing single-arg callers (`FileManager.tsx`) keep working.

`PortalFilesTab` passes its current navigation path (`propertyCurrentPath` or `dealCurrentPath`) so folders land where the user is, not at the root.

## Implementation notes

- Shared state for the create-folder UI lives at the top of `PortalFilesTab` (only one section can create at a time): `creatingFolderFor`, `newFolderName`, `creatingFolder`, `createFolderError`.
- The handler calls `propertyFiles.createFolder` or `dealFiles.createFolder` based on `entityType`, then clears local state on success or surfaces the error message on failure.
- Existing read/unread, visibility-toggle, and upload behavior is unchanged.

## Files changed

- Modified: [src/hooks/useDropboxFiles.ts](../src/hooks/useDropboxFiles.ts) — extended `createFolder` signature with optional `parentSubPath`.
- Modified: [src/components/portal/PortalFilesTab.tsx](../src/components/portal/PortalFilesTab.tsx) — folder-plus icon in section headers, inline name input, error surface.

## Future work

The standalone `FileManager` component (used in property/deal full-page views) has additional capabilities the sidebar still lacks: drag-to-move between folders, right-click context menu with copy-shared-link, breadcrumb navigation. The sidebar's `PortalFilesTab` could be aligned over time, but creating folders was the highest-value missing piece and is now in place.

Note: site submits themselves are still not a supported `entityType` for `useDropboxFiles` (only `client | property | deal | contact | property_unit`). The site submit sidebar shows files from the associated **property** and/or **deal**, not its own folder. Provisioning per-site-submit folders would be a separate, larger change.
