# Restore drag-to-move in the map site-submit Files tab (2026-08-10)

## Symptom

On the map slideouts (deal / property / site submit), the **Files** tab (powered by
Dropbox) used to let you drag a file that's already in a folder onto another folder to
move it. That stopped working — specifically on the **site-submit** slideout opened from
the map.

## Root cause: which component renders the Files tab

The map slideouts don't all use the same Files component. This is the key gotcha:

| Slideout (from map) | Files tab component | File path | Had drag-to-move? |
|---|---|---|---|
| Property / site-submit **pin** (`PinDetailsSlideout`) | `FileManager` | [src/components/FileManager/FileManager.tsx](../src/components/FileManager/FileManager.tsx) | ✅ yes |
| **Site-submit shared sidebar** (`shared/SiteSubmitSidebar`) | `PortalFilesTab` | [src/components/portal/PortalFilesTab.tsx](../src/components/portal/PortalFilesTab.tsx) | ❌ no (upload only) |
| Deal standalone (`DealDetailsSlideout`) | `FileManager` | [src/components/FileManager/FileManager.tsx](../src/components/FileManager/FileManager.tsx) | ✅ yes |
| Property standalone (`PropertyFilesTab` → `FileManager`) | `FileManager` | [src/components/FileManager/FileManager.tsx](../src/components/FileManager/FileManager.tsx) | ✅ yes |

The green-header site-submit slideout in the map renders **`PortalFilesTab`** — the
component originally built for the **client portal**. It renders two sections (Property
Files / Deal Files) with per-file portal-visibility (eye-icon) toggles. It only supported
**native-file upload drops** onto a section; it never had per-item drag-to-move. So moving
an existing Dropbox file between folders was missing *by design* there, even though
`FileManager` (used by the deal/property pin slideouts) still supports it.

`FileManager`'s internal-move path was verified intact: `handleDrop` takes an early branch
only when `e.dataTransfer.files.length > 0` (native upload); internal drags fall through to
`moveItem(draggedItem.path, targetFolder.path)`.

## Fix

Added per-item drag-to-move to `PortalFilesTab`, reusing the existing move plumbing
(`useDropboxFiles().moveItem` → `dropboxService.moveItem` → Dropbox `filesMoveV2`, which
appends the item name to the destination folder path and auto-renames on conflict):

- File & folder rows are `draggable` with a grip handle + `cursor-move`, **gated to
  `canUpload`** (brokers/admins only; portal clients remain view-only).
- Folder rows are drop targets (`onDragOver`/`onDrop`) with a blue ring highlight.
  `canDropInto()` blocks dropping a folder into itself/its own descendants and no-op moves
  (already in that folder).
- The breadcrumb is a drop target too: drop on the home icon → move to the section's
  top-level folder; drop on the current-folder crumb → move up one level.
- Moves are **restricted to within the same section** — Property and Deal live in separate
  Dropbox root folders, so cross-section drags are ignored.
- The section-level upload `handleDragOver` now early-returns unless the drag carries OS
  files (`e.dataTransfer.types.includes('Files')`), so internal moves don't flash the
  "Drop files to upload" overlay. Native-file uploads are otherwise unchanged.
- Move failures show an inline error scoped to the affected section.

## Verification status

- ✅ Typecheck: change adds **zero** new TS errors (4 pre-existing unrelated errors remain:
  unused `visibilityLoading`, a debug `{console.log()}` in JSX, and `fileInputRef` typing).
- ✅ `FileManager` (deal/property) internal-move path statically confirmed intact.
- ⚠️ Not live-tested — HTML5 drag-drop against authenticated Dropbox needs the running app
  in a browser. If deal/property moves also misbehave at runtime, that's a separate
  `FileManager` runtime issue (its code path is intact) worth reproducing live.

## Related

- [OVIS_OVERLAY_UX.md](./OVIS_OVERLAY_UX.md) — overlay-first object interaction principle.
- [SITE_SUBMIT_SIDEBAR_CONSOLIDATION.md](./SITE_SUBMIT_SIDEBAR_CONSOLIDATION.md) — why the
  map site-submit slideout uses the shared/portal component.
- [DROPBOX_FILE_UPLOAD_FIXES_2026_04_17.md](./DROPBOX_FILE_UPLOAD_FIXES_2026_04_17.md) — the
  upload-freeze fixes that added the native-vs-internal drop branching.

## Commit

`dd77d2da` — feat(files): restore drag-to-move between folders in map site-submit slideout
