# Inline Edit: Site Submit + Deal Name from the Map Sidebar Header

**Date:** 2026-06-13
**Branch:** `feature/sidebar-header-name-editing`
**Commit:** `faca0ece`
**Files touched:** `src/components/shared/SiteSubmitSidebar.tsx` (only)

## Why

Before this change, you could rename a property from the property pin sidebar header but you could not rename the site submit (or the linked deal) from the **site submit** sidebar — the only path was opening the full detail page. This was friction during pipeline review on the map.

## What

Hover-to-reveal pencil edit on the green/navy site-submit sidebar header (`SiteSubmitSidebar`):

- The bold `site_submit_name` line (`h3`) is editable inline. Click pencil → input + Save / Cancel. Enter saves, Escape cancels.
- When the submit is linked to a deal (`siteSubmit.deal_id` is set — this is what turns the header green), a new line is shown below: `Deal: <deal_name>` with its own inline edit.
- In deal-direct mode (sidebar opened with `dealId` and no linked submit — the synthetic-site-submit path used for legacy Salesforce deals), the `h3` edits `deal.deal_name` instead of `site_submit_name`, because that's what the synthetic record's `site_submit_name` is mirroring.

## Dropbox folder sync

Renaming a deal from this sidebar goes through the same `getDropboxPropertySyncService().syncDealName(dealId, oldName, newName)` path that `DealDetailsForm.syncDealNameIfChanged` ([DealDetailsForm.tsx:481-493](../src/components/DealDetailsForm.tsx#L481-L493)) uses on the deal page. So a rename from the green map sidebar produces the same Dropbox `filesMoveV2` against `/Salesforce Documents/Opportunities/<name>` that the deal page does.

Failure handling matches the deal page: the Supabase write stands, and a longer-duration error toast (6s) surfaces the Dropbox sync error. The DB is not rolled back. Legacy deals with no `dropbox_mapping` row hit the existing auto-heal path in `DropboxPropertySyncService.syncEntityName` — they'll try the conventional folder path before failing.

**Site submit name renames do NOT touch Dropbox.** Site submits are not a tracked entity type in `dropbox_mapping` (the `EntityType` union at [dropboxPropertySync.ts:5](../src/services/dropboxPropertySync.ts#L5) is `'property' | 'client' | 'contact' | 'deal'`) and there is no folder-creation path for them. Extending Dropbox sync to site submits is a separate piece of work (schema + folder convention + `useDropboxFiles` plumbing).

## Data shape change

`SiteSubmitData` (exported from `src/components/shared/SiteSubmitSidebar.tsx`) gained one field:

```ts
deal_name: string | null;
```

It is populated in three places:

1. **Standard fetch** (`fetchSiteSubmit`): the existing follow-up query that fetched `deal.id WHERE site_submit_id = X` now selects `id, deal_name`, and both are merged into the in-memory record.
2. **Deal-direct mode** (`fetchByDeal`): the synthetic record is hydrated with `deal_name: dealRow.deal_name ?? null`.
3. **New-submit mode** (`initialData._isNew`): `deal_name: null` (no deal yet).

No other consumers of `SiteSubmitData` (e.g. `SiteSubmitCreateForm`) had to change — they don't construct the type, they only receive it.

## Edit/save state

Three new pieces of local state on `SiteSubmitSidebar`:

- `editingHeaderField: 'site_submit_name' | 'deal_name' | null`
- `headerEditValue: string`
- `savingHeaderField: boolean`

Three small helpers:

- `startHeaderEdit(field)` — seeds the input from the current value and switches the row into edit mode.
- `cancelHeaderEdit()` — clears state.
- `saveHeaderEdit()` — branches on `editingHeaderField`:
  - `site_submit_name`: `supabase.from('site_submit').update({ site_submit_name }).eq('id', siteSubmit.id)`, then local `handleUpdate({ site_submit_name })`.
  - `deal_name`: `supabase.from('deal').update({ deal_name }).eq('id', siteSubmit.deal_id)`, then local `handleUpdate({ deal_name })`, then `syncDealName`.

`handleUpdate` is the pre-existing partial-update helper that mirrors the change into both local state and the `onDataUpdate` callback, so the parent (Map page / layer manager) sees the new name immediately without a round-trip.

## Editability rules

- The pencil only appears for `isEditable` users (`true` in `map` and `deal` contexts; respects the prop in `portal`).
- The `site_submit_name` pencil only appears when there is a real `siteSubmit.id`. In deal-direct mode it requires `siteSubmit.deal_id` (since it's actually editing the deal).
- The `Deal:` row only renders when `siteSubmit.deal_id` is set AND we're not in deal-direct mode (in that mode the `h3` already covers it).

## Out of scope / known gaps

- Property name (the address line in the header) is intentionally not editable here. That belongs to the property pin sidebar.
- Site submit Dropbox folder rename — see "Dropbox folder sync" above; needs its own feature.
- No optimistic UI: the input is disabled during save and there's no rollback if save fails (we just toast).

## Manual test plan

1. Open a site-submit pin that has a linked deal (green header). Hover the bold name → pencil shows → click, change, Save → toast `Site submit name updated`. Reopen the sidebar; new name persists.
2. On the same pin, hover the `Deal: ...` row → pencil shows → change, Save → toast `Deal name updated` if Dropbox sync succeeded; otherwise the 6s error toast describes the Dropbox failure but the DB still updated. Verify Dropbox folder at `/Salesforce Documents/Opportunities/` was actually renamed.
3. Open a site-submit pin without a deal (navy header). The `Deal:` row should not appear; the site_submit_name edit still works.
4. Open the sidebar by `dealId` (deal-direct mode) for a legacy deal. The `h3` edit writes to `deal.deal_name` and triggers Dropbox sync; no second `Deal:` row appears.
5. Portal client view: pencils should not appear at all (`isEditable === false`).
6. Escape / Cancel button restore the original value without writing.
