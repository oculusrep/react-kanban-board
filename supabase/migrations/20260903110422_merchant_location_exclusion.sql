-- Global exclusion ("delete") of a bad merchant pin.
--
-- Problem: Google Places routinely returns a listing at the wrong storefront —
-- a bike shop sitting on top of a burrito place, an ATM listed as its own
-- store. Any user who spots one needs to be able to remove that pin from the
-- map, and the removal must apply for everyone, not just their session.
--
-- Why a soft delete and not a DELETE: merchant_location is a cache of Google
-- Places. The ingest run (merchantIngestService.upsertMerchantLocation) keys on
-- google_place_id, so a hard-deleted row is re-created on the very next
-- ingestion of that brand. Flagging the row instead makes the removal stick —
-- the ingest keeps refreshing its fields, but the map never renders it again.
-- It also keeps an audit trail of who removed what and why.
--
-- Why an RPC instead of widening RLS: merchant_location's UPDATE policy is
-- admin-only and should stay that way (it guards coordinates, status, brand).
-- Excluding a pin is a data-quality action every authenticated user should be
-- able to take, so it gets a narrow SECURITY DEFINER function that can only
-- touch the three exclusion columns.

ALTER TABLE merchant_location
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_by uuid REFERENCES "user"(id),
  ADD COLUMN IF NOT EXISTS exclusion_reason text;

COMMENT ON COLUMN merchant_location.excluded_at IS
  'When set, this Places listing was flagged as wrong/bogus by a user and is hidden from the map for everyone. Nullable and never defaulted: NULL means "not excluded". Set via merchant_location_exclude(); cleared via merchant_location_restore().';
COMMENT ON COLUMN merchant_location.excluded_by IS
  'The "user".id who excluded this location.';
COMMENT ON COLUMN merchant_location.exclusion_reason IS
  'Optional free-text reason supplied by the user at exclusion time (e.g. "bike shop, not a burrito place").';

-- Small partial index: excluded rows are the rare case, and the admin/audit
-- listing is the only query that filters on IS NOT NULL. The map's
-- "excluded_at IS NULL" filter matches nearly every row, so it stays a scan of
-- the already-narrowed viewport result — no index would help there.
CREATE INDEX IF NOT EXISTS idx_merchant_location_excluded
  ON merchant_location (excluded_at)
  WHERE excluded_at IS NOT NULL;

-- Exclude a pin. Idempotent: excluding an already-excluded location is a no-op
-- (keeps the original who/when/why rather than overwriting the first report).
CREATE OR REPLACE FUNCTION public.merchant_location_exclude(
  p_location_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_user uuid;
BEGIN
  v_user := public.merchants_current_user_id();
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to remove a merchant pin.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM merchant_location WHERE id = p_location_id) THEN
    RAISE EXCEPTION 'Merchant location % not found.', p_location_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE merchant_location
     SET excluded_at = now(),
         excluded_by = v_user,
         exclusion_reason = nullif(btrim(coalesce(p_reason, '')), '')
   WHERE id = p_location_id
     AND excluded_at IS NULL;
END;
$function$;

-- Undo. Admin-only: restoring is the corrective action for a bad removal, and
-- an ordinary user un-hiding a pin someone else deliberately removed is the
-- edit war this feature does not need.
CREATE OR REPLACE FUNCTION public.merchant_location_restore(p_location_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NOT public.merchants_is_admin() THEN
    RAISE EXCEPTION 'Only an admin can restore a removed merchant pin.'
      USING ERRCODE = '42501';
  END IF;

  UPDATE merchant_location
     SET excluded_at = NULL,
         excluded_by = NULL,
         exclusion_reason = NULL
   WHERE id = p_location_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.merchant_location_exclude(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.merchant_location_restore(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merchant_location_exclude(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merchant_location_restore(uuid) TO authenticated;
