# Dropbox proxy — Dropbox credentials out of the browser

**Status (2026-10-16):** rollout steps 1–5 DONE and live (migration applied, proxy deployed
and live-tested as admin + Jared, merged/pushed, live bundle verified secret-free, Vercel
`VITE_DROPBOX_*` deleted). Step 6 (rotation) needs Mike: `node scripts/rotateDropboxCredentials.mjs`.

## The problem

The frontend built its Dropbox client from `VITE_DROPBOX_ACCESS_TOKEN`,
`VITE_DROPBOX_REFRESH_TOKEN`, `VITE_DROPBOX_APP_KEY` and `VITE_DROPBOX_APP_SECRET`.
Vite inlines every `VITE_*` variable into the public JS bundle. Verified 2026-10-16:
the app key, app secret and refresh token are all present in the live bundle at
ovis.oculusrep.com, which loads before login — **anyone on the internet** could pull
them and get full access to the Dropbox account.

The edge functions' `DROPBOX_*` secrets hold the **same** refresh token, app key and
app secret (digests match), so rotation has to update those too.

Related: `set_portal_file_visibility` was `SECURITY DEFINER` with no caller check, so
any logged-in account (portal clients included) could share or hide any file.

## The fix

- `supabase/functions/dropbox-proxy/index.ts` — the only path from the browser to
  Dropbox. Holds the credentials, authorizes every call:
  - **internal users** (`is_internal_user()`): every op under `/Salesforce Documents`.
  - **portal users**: must send `scope: { entityType, entityId }`; the record is
    re-read through a user-scoped client (portal RLS decides), paths must be inside
    that record's `dropbox_mapping` folder, and only portal-visible entries are listed
    or linked (same rule as `PortalFilesTab.isFileVisible`). Upload only into deal
    folders, only with `contact.portal_can_upload_deal_files`; the proxy shares the
    upload (`portal_file_visibility` row) itself.
  - **anyone else** (coach, no record): 403.
- Uploads: the proxy returns a one-time Dropbox temporary upload link; the browser
  POSTs bytes straight to Dropbox (CORS `*`, tested 2026-10-16). The link only returns
  a content hash, so the proxy picks a free `name (n).ext` up front.
- Longpoll stays in the browser: `/2/files/list_folder/longpoll` is a no-auth endpoint.
- `src/services/dropboxService.ts` keeps its public API; every method calls the proxy.
  `useDropboxFiles` passes its record as the scope (through a ref, because several of
  its callbacks have empty deps).
- `VITE_DROPBOX_*` removed from `vite-env.d.ts`, so any new use fails the typecheck.
- Migration `20261016121157_set_portal_file_visibility_internal_only.sql`: the RPC
  raises `not authorized` unless `is_internal_user()`; `changed_by_id` falls back to
  `auth.uid()`; anon/PUBLIC execute revoked. Round-trip tested (portal → refused,
  admin → works and stamps the caller).

Behaviour change: the **coach** role loses Dropbox access (it had it only via the
leaked token).

## Rollout (in order)

1. Apply + record `20261016121157_set_portal_file_visibility_internal_only.sql`
   (safe before the frontend ships: current prod code only calls it for internal users).
2. `supabase functions deploy dropbox-proxy --project-ref <ref>` (gateway verify_jwt on,
   the default — no config.toml block).
3. Live-test the proxy with real JWTs: internal list/upload/move; portal (Jared) list
   shows only shared files, temp link on a hidden file → 403, deal upload works,
   property upload → 403; no JWT → 401.
4. Merge `feature/portal-deal-file-upload` and `fix/dropbox-server-side` to `main`,
   push (deploys). Check the new bundle no longer contains the secret.
5. Delete the four `VITE_DROPBOX_*` variables from the Vercel project `ovis` (and from
   `.env` once nothing local needs them — `npm run dropbox:auth` writes them).
6. **Rotate** — the old values are in every bundle already downloaded and cached.
   `scripts/rotateDropboxCredentials.mjs` does 6.2–6.4 plus the `.env` update in one run
   (it never prints a secret). Manual equivalent:
   1. Dropbox App Console → regenerate the app secret.
   2. Run the OAuth flow (`token_access_type=offline`) for a new refresh token.
   3. `supabase secrets set DROPBOX_APP_SECRET=… DROPBOX_REFRESH_TOKEN=…`
      (re-versions every edge function; that's expected).
   4. Revoke the old grant: `POST /2/auth/token/revoke` with an access token minted from
      the OLD refresh token — this disables that refresh token and all its access tokens.
   5. Re-test file listing in OVIS and one QBO attachment flow (`_shared/dropbox.ts`).
