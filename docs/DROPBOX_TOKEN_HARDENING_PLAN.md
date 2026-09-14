# Dropbox Token Hardening — Plan

**Status: PLAN ONLY. Not started. Do not execute steps out of order — see "Rotation order".**
Written 2026-09-14. Decision recorded: the hybrid design below is approved; timing is deferred.

## The problem

OVIS's browser code reads four Dropbox credentials from `VITE_`-prefixed env vars:

```
VITE_DROPBOX_ACCESS_TOKEN
VITE_DROPBOX_REFRESH_TOKEN
VITE_DROPBOX_APP_KEY
VITE_DROPBOX_APP_SECRET
```

Vite **inlines every `VITE_` variable into the client bundle at build time** — that is how
they work, not a misconfiguration. So the production JavaScript served to every browser that
loads OVIS contains the **app secret and refresh token**. Anyone who opens devtools can mint
their own access tokens indefinitely and gets full read/write on `/Salesforce Documents` —
every property, deal, client and site-submit folder.

The `/Salesforce Documents` path guard (`validatePath` in `src/services/dropboxService.ts`)
runs in the browser, so it constrains OVIS's own code, not an attacker holding the token.

Verified while writing this plan:

- **Git history is clean.** The three commits that mention these variables
  (`c4133d30`, `553a0c8a`, `6a0b685a`) contain placeholders (`your_…`, `[access token]`),
  not real values. The exposure is the built bundle, not the repo.
- **The same Dropbox app backs server-side code.** `supabase/functions/_shared/dropbox.ts`
  reads `DROPBOX_ACCESS_TOKEN` / `DROPBOX_REFRESH_TOKEN` / `DROPBOX_APP_KEY` /
  `DROPBOX_APP_SECRET`, used by `quickbooks-sync-invoice` and
  `quickbooks-update-w9-attachments`. Rotating the app's credentials breaks those unless their
  Supabase secrets change in the same step.

## Why "move writes server-side" is not enough on its own

Every Dropbox call the browser makes needs a credential in the browser — **reads included**:
`listFolderContents`, `getSharedLink`, `longpollForChanges`, `downloadFile`,
`getTemporaryDownloadLink`. As long as the bundle carries the refresh token and app secret,
the hole stays open no matter where OVIS's own writes happen. The fix is: **no long-lived
Dropbox credential in the browser at all.**

## Design — hybrid (approved)

### Internal users (admin, broker_full, broker_lite, va): token vending

A new edge function, e.g. `dropbox-token`:

1. Validates the caller's Supabase JWT (service-client `getUser(token)` — the legacy JWT keys
   are disabled; see memory `project_supabase_key_formats`).
2. Requires `is_internal_user()` to be true. Portal clients get 403.
3. Uses the **server-side** refresh token + app secret to mint a short-lived Dropbox access
   token, and returns `{ access_token, expires_at }`. Dropbox returns `expires_in` with each
   token — confirm the lifetime at build time rather than assuming it.

The browser keeps the Dropbox SDK and almost all of `dropboxService.ts`. What changes: it is
constructed with the vended token, and `refreshAccessToken()` calls `dropbox-token` instead of
Dropbox's OAuth endpoint. **The app secret and refresh token leave the browser entirely.**

Residual exposure: a logged-in internal user can extract a token that works for its remaining
lifetime. That is a large reduction from "anyone, forever" and matches the trust already given
to internal users.

### Portal clients: proxy, never a token

Portal clients must never receive a Dropbox token, short-lived or otherwise. Their Dropbox
access goes through an edge function, e.g. `dropbox-portal`, that:

- lists folder contents for a site submit they are entitled to see, and
- creates shared links,

and **applies `portal_file_visibility` on the server**. Today the browser lists the whole
folder and hides non-visible files client-side (`PortalFilesTab.getVisibleFiles`) — that is
presentation, not a control, since the client already has the full listing.

Portal clients have no write path (upload/create/move/delete are broker-gated in the UI and,
since migration `20260914110248`, denied by RLS on `dropbox_mapping`).

### Why not a full proxy for everyone

More secure, materially more work, and two things fit an edge function badly:

- **Live refresh** (`longpollForChanges`, ~30 s held requests) would pin a worker per open tab.
- **Uploads** would stream browser → function → Dropbox. Supabase Edge Function limits
  (verified 2026-09-14): 256 MB memory, 2 s CPU per request (async I/O excluded), 150 s request
  idle timeout, 400 s wall clock on paid plans. Uploads must stream, never buffer.

Revisit if internal-user token exposure becomes unacceptable.

## Rotation order — do not reorder

Rotating before the code change breaks production (the live bundle still uses the old
credentials). Changing code without revoking leaves old credentials valid (see "Why revoke").

1. **Build and deploy the server side first.** Deploy `dropbox-token` and `dropbox-portal`.
   Verify both from a logged-in internal session and a portal session.
2. **Switch the browser code and deploy it.** Remove every `import.meta.env.VITE_DROPBOX_*`
   read. Then **verify the built bundle is clean**:
   `npm run build && grep -rl "dropboxapi.com/oauth2/token" dist/` must find nothing that
   performs a refresh, and no `VITE_DROPBOX_*` value may appear in `dist/`. Deploy.
3. **Rotate the Dropbox app credentials** in the Dropbox App Console:
   - regenerate the **app secret** (invalidates the old one);
   - **revoke** outstanding access/refresh tokens (`/2/auth/token/revoke` with each, or
     disconnect the app from the account);
   - re-run the OAuth code flow with `token_access_type=offline` to obtain a **new refresh
     token**.
4. **Update Supabase secrets at the same moment** — `DROPBOX_REFRESH_TOKEN`,
   `DROPBOX_APP_SECRET` (and `DROPBOX_ACCESS_TOKEN` if still read). This is what keeps
   `quickbooks-sync-invoice` and `quickbooks-update-w9-attachments` working. Test one QBO
   invoice attachment immediately after.
5. **Delete `VITE_DROPBOX_*`** from Vercel project env (Production, Preview, Development) and
   from local `.env` / `.env.example`.

### Why revoke — removing the code is not sufficient

Old bundles containing the old credentials keep existing after the code changes:

- **PWA caches.** OVIS uses `vite-plugin-pwa` with precaching; users' service workers can keep
  serving an old bundle (this is what made a deployed scroll fix look unfixed on 2026-09-12).
- **Vercel preview deployments** retain their bundles at their own URLs.
- Anyone who already copied the values.

Only regenerating the secret and revoking the tokens neutralizes those copies.

## What breaks in the browser service when this lands

| Area | Callers | Change |
|---|---|---|
| `new DropboxService(...)` throws without `accessToken` | FileManager, SiteSubmitFormModal, useDropboxFiles, useSiteSubmitEmail, dropboxPropertySync, dropboxSyncDetection | construct from the vended token (internal) or not at all (portal) |
| `executeWithTokenRefresh` / `refreshAccessToken` | every SDK call | refresh = call `dropbox-token`; no app secret in the browser |
| `uploadFile` | useDropboxFiles | unchanged for internal users (vended token) |
| `createFolder`, `createFolderForEntity` | PortalFilesTab, useDropboxFiles | unchanged for internal users |
| `deleteFileOrFolder`, `renameItem`, `moveItem` | useDropboxFiles, PortalFilesTab | unchanged for internal users |
| `renameFolder` | dropboxPropertySync (sidebar / PinDetailsSlideout rename sync) | unchanged for internal users |
| `listFolderContents`, `getSharedLink` | PortalFilesTab, PortalChatTab, useSiteSubmitEmail, SiteSubmitFormModal | internal: unchanged; **portal: route through `dropbox-portal`** |
| `downloadFile`, `getTemporaryDownloadLink` | PortalFilesTab, useDropboxFiles | portal: via `dropbox-portal` |
| `longpollForChanges` / `getLatestCursor` | useDropboxFiles (live refresh) | internal: unchanged; portal: disable live refresh or poll the proxy |
| `validatePath` | all | keep in the browser for OVIS's own code; **duplicate in both edge functions** — that copy is the real control |

The practical split is by `isInternalUser`, which `PortalFilesTab` and the portal sidebars
already receive.

## Already done (related)

- **`dropbox_mapping` RLS** — migration `20260914110248_dropbox_mapping_rls_fix`: dropped the
  permissive `USING true` insert/update/delete policies that let any authenticated user rewrite
  folder mappings, and repaired `is_internal_user()`'s stale role list. Verified by impersonated
  writes per persona.

## Open questions for build time

- Token lifetime returned by Dropbox, and whether to cache the vended token per tab or per user.
- Whether `dropbox-portal` should sign short-lived download URLs or stream bytes.
- Whether any internal role (e.g. `coach`) needs read-only vended tokens.
