-- Internal token for autonomous invocation of streetlight-backfill.
-- Single-row config table; service-role-only access (no RLS surface).
-- The token is consumed via the streetlight-backfill edge function's request
-- body (`{"internal_token":"<uuid>"}`) to bypass the user-JWT admin auth path,
-- so an operator can drive a long-running backfill from a server context
-- without holding a browser session open.

CREATE TABLE IF NOT EXISTS streetlight_backfill_config (
  id INT PRIMARY KEY DEFAULT 1,
  internal_token UUID NOT NULL DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT singleton CHECK (id = 1)
);

INSERT INTO streetlight_backfill_config (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE streetlight_backfill_config IS
  'Single-row config for streetlight-backfill. internal_token is consumed via request body to bypass user JWT auth when an admin operator triggers the backfill from a non-browser context.';
