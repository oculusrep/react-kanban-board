-- OREP-editable fields + OREP-drawn polygons on starbucks_target_area
--
-- Adds three columns:
--   orep_notes            — free-text OREP annotation, separate from the Starbucks-sourced `notes`
--   orep_model_yr1_sales  — OREP override for Model Yr1 Sales. Display uses
--                           COALESCE(orep_model_yr1_sales, model_yr1_sales) so a re-import of the
--                           Starbucks KML never clobbers an OREP edit (override survives).
--   source                — 'starbucks' (imported from the KML) | 'orep' (drawn in OVIS by an OREP user)
--
-- Editing/drawing is gated by the can_edit_starbucks_target_area permission (set in the user
-- permissions matrix). Because portal users have no row in the "user" table, the helper below is
-- inherently internal-only.
--
-- RE-IMPORT SAFETY: the Starbucks KML re-import upserts on target_area_id and must only touch
-- source='starbucks' rows — it must never UPDATE OREP columns and never DELETE source='orep' rows.
-- (OREP rows have a NULL target_area_id, so a target_area_id-keyed upsert can't collide with them.)

-- ============================================================================
-- Columns
-- ============================================================================
ALTER TABLE starbucks_target_area
  ADD COLUMN IF NOT EXISTS orep_notes           TEXT,
  ADD COLUMN IF NOT EXISTS orep_model_yr1_sales NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS source               TEXT NOT NULL DEFAULT 'starbucks';

ALTER TABLE starbucks_target_area
  DROP CONSTRAINT IF EXISTS starbucks_target_area_source_check;
ALTER TABLE starbucks_target_area
  ADD CONSTRAINT starbucks_target_area_source_check CHECK (source IN ('starbucks', 'orep'));

-- OREP-drawn polygons have no Starbucks GUID. UNIQUE still holds (Postgres allows multiple NULLs).
ALTER TABLE starbucks_target_area ALTER COLUMN target_area_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_starbucks_target_area_source ON starbucks_target_area (source);

-- ============================================================================
-- Edit-permission helper — mirrors user_has_starbucks_access() Path 1 (internal user with a
-- merged JSONB permission flag; user override takes precedence over role). Portal users have no
-- "user" row, so they can never satisfy this — editing is internal-only by construction.
-- ============================================================================
CREATE OR REPLACE FUNCTION user_can_edit_starbucks_target_area()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1
    FROM "user" u
    LEFT JOIN role r ON r.name = u.ovis_role
    WHERE u.auth_user_id = auth.uid()
      AND COALESCE(
        (u.permissions ->> 'can_edit_starbucks_target_area')::boolean,
        (r.permissions ->> 'can_edit_starbucks_target_area')::boolean,
        FALSE
      ) = TRUE
  );
$$;

-- ============================================================================
-- RLS write policies. The existing SELECT policy (user_has_starbucks_access) is unchanged.
--   INSERT — only OREP-source rows, only by permitted users
--   UPDATE — only by permitted users (column protection for Starbucks rows is enforced by the trigger below)
--   DELETE — only OREP-source rows, only by permitted users (never delete Starbucks-imported rows from the UI)
-- The service-role ETL bypasses RLS entirely, so re-import is unaffected.
-- ============================================================================
CREATE POLICY "starbucks_target_area_insert"
  ON starbucks_target_area FOR INSERT TO authenticated
  WITH CHECK (user_can_edit_starbucks_target_area() AND source = 'orep');

CREATE POLICY "starbucks_target_area_update"
  ON starbucks_target_area FOR UPDATE TO authenticated
  USING (user_can_edit_starbucks_target_area())
  WITH CHECK (user_can_edit_starbucks_target_area());

CREATE POLICY "starbucks_target_area_delete"
  ON starbucks_target_area FOR DELETE TO authenticated
  USING (user_can_edit_starbucks_target_area() AND source = 'orep');

-- ============================================================================
-- Column guard — on source='starbucks' rows, an authenticated user may only change the OREP-owned
-- columns (orep_notes, orep_model_yr1_sales). Every Starbucks-sourced column is pinned to its old
-- value so a stray/hand-crafted UPDATE can't corrupt imported data. Exempts the service-role ETL
-- (auth.uid() IS NULL) so the KML re-import can still write Starbucks columns.
-- OREP-source rows are fully editable (name, geom, priority, etc. are OREP-owned there).
-- ============================================================================
CREATE OR REPLACE FUNCTION starbucks_target_area_guard_starbucks_cols()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.source = 'starbucks' AND auth.uid() IS NOT NULL THEN
    NEW.target_area_id                := OLD.target_area_id;
    NEW.name                          := OLD.name;
    NEW.store_type                    := OLD.store_type;
    NEW.priority                      := OLD.priority;
    NEW.re_availability               := OLD.re_availability;
    NEW.notes                         := OLD.notes;
    NEW.target_open_date              := OLD.target_open_date;
    NEW.state_province                := OLD.state_province;
    NEW.country                       := OLD.country;
    NEW.cbsa                          := OLD.cbsa;
    NEW.cbsa_name                     := OLD.cbsa_name;
    NEW.market_id                     := OLD.market_id;
    NEW.market_name                   := OLD.market_name;
    NEW.minimarket_id                 := OLD.minimarket_id;
    NEW.minimarket_name               := OLD.minimarket_name;
    NEW.region_id                     := OLD.region_id;
    NEW.planned_ops_area_id           := OLD.planned_ops_area_id;
    NEW.planned_ops_area_name         := OLD.planned_ops_area_name;
    NEW.urbanity_code                 := OLD.urbanity_code;
    NEW.urbanity_description          := OLD.urbanity_description;
    NEW.re_constraint_primary         := OLD.re_constraint_primary;
    NEW.re_constraint_secondary       := OLD.re_constraint_secondary;
    NEW.re_constraint_tertiary        := OLD.re_constraint_tertiary;
    NEW.model_yr1_sales               := OLD.model_yr1_sales;
    NEW.model_tc_per                  := OLD.model_tc_per;
    NEW.model_yr1_tc                  := OLD.model_yr1_tc;
    NEW.model_cann_risk               := OLD.model_cann_risk;
    NEW.model_rent                    := OLD.model_rent;
    NEW.model_other_occ               := OLD.model_other_occ;
    NEW.model_store_cost              := OLD.model_store_cost;
    NEW.model_last_update_date        := OLD.model_last_update_date;
    NEW.recommendation_distance       := OLD.recommendation_distance;
    NEW.recommendation_id             := OLD.recommendation_id;
    NEW.sdm_mdm                       := OLD.sdm_mdm;
    NEW.target_area_created_dt        := OLD.target_area_created_dt;
    NEW.target_area_created_user      := OLD.target_area_created_user;
    NEW.target_area_update_user       := OLD.target_area_update_user;
    NEW.target_area_update_date       := OLD.target_area_update_date;
    NEW.target_area_proximity_alert   := OLD.target_area_proximity_alert;
    NEW.target_area_secondary_concept := OLD.target_area_secondary_concept;
    NEW.target_area_store_format      := OLD.target_area_store_format;
    NEW.geom                          := OLD.geom;
    NEW.source                        := OLD.source;
    NEW.imported_at                   := OLD.imported_at;
    NEW.created_at                    := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_starbucks_target_area_guard_cols
  BEFORE UPDATE ON starbucks_target_area
  FOR EACH ROW EXECUTE FUNCTION starbucks_target_area_guard_starbucks_cols();
