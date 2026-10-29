# StreetLight shared cache stopped filling (2026-09-28 → 2026-10-28)

## Symptom
Traffic counts one user paid for (e.g. Arty) were not visible to other users. The
requester saw them only for that session; after reload they were gone too.

## Cause
The `streetlight` edge function did every table write (metrics cache, usage log,
segment geometry) with the caller's JWT. Migration `20260928150000_rls_on_unprotected_tables`
enabled RLS on all eight `streetlight_*` tables with **SELECT-only** policies, so every
INSERT/UPSERT from the function was rejected. The errors were only `console.error`-ed and
the API result was still returned to the caller, so nothing looked broken.

Live DB on 2026-10-28: last row in `streetlight_segment_metrics` and `streetlight_usage_log`
was 2026-09-27 14:27 UTC; zero rows since.

Knock-on effects while broken:
- Repeat pulls of the same segment were billed again (the free-retry check reads the empty usage log).
- Per-user and monthly quota checks summed the usage log, so they read $0 and enforced nothing.
- OVIS has no record of StreetLight spend after 9/27 — StreetLight's own usage page is the only record.
- New segment geometry wasn't cached, so map coverage didn't grow.

## Fix (branch `fix/streetlight-cache-writes`)
- The user-JWT client is used only to identify the caller and check `is_internal_user()`
  (non-internal callers get 403 — previously RLS was the only gate).
- All table reads/writes use a service-role client (`SUPABASE_SERVICE_ROLE_KEY`, same as
  `streetlight-backfill`). No write policies were added for `authenticated`: browser
  clients should not be able to write traffic counts or spend records.
- The metrics response now includes `cache_write_errors` when a cache write fails, instead
  of only logging it.

No migration. Takes effect only when the function is deployed:
`supabase functions deploy streetlight` (verify_jwt stays true).

## Verify after deploy
Pull one new segment from the map, then:
```sql
select max(fetched_at) from streetlight_segment_metrics;
select max(requested_at) from streetlight_usage_log;
```
Both should show the new pull, and a second user should see the count on the map.
