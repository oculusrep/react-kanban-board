# dev-only — DO NOT SHIP

Files here are for local/dev validation of the LOI tool schema against the
throwaway `loi-tool-dev` Supabase project. **Nothing in this folder is a migration.**
It is deliberately outside `supabase/migrations/` so `supabase db push` never applies it.

- `loi_dev_bootstrap.sql` — dev STUBS for the two helper functions the LOI migration
  depends on (`is_internal_user()`, `update_updated_at_column()`), because the repo's
  migration history is not self-contained (base OVIS schema + `is_internal_user` predate
  tracked migrations). **`is_internal_user()` is stubbed to `true` here — RLS behavior is
  NOT validated by these runs.** Do not copy this stub into prod or into migrations.
- `loi_negative_tests.sql` — the seven decision-encoding negative tests. Each expects a
  REJECTION; the harness reports PASS (correctly rejected) / FAIL (wrongly accepted).
  Runs inside a transaction that is rolled back — leaves no rows behind.

Usage (against the dev project only, never prod):

    psql "$LOI_DEV_URL" -f supabase/dev-only/loi_dev_bootstrap.sql
    psql "$LOI_DEV_URL" -f supabase/migrations/20260825170000_loi_tool_clause_library.sql
    psql "$LOI_DEV_URL" -f supabase/dev-only/loi_negative_tests.sql
