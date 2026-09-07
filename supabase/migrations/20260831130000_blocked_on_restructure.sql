-- ============================================================================
-- Starbucks Deal Board — blocked_on restructure
--
-- See docs/STARBUCKS_DEAL_BOARD_SPEC.md §4.1 and DECISIONS §2.12.
--
-- Pre-Submittal blockers become real board COLUMNS (retiring the two-column
-- hack). The blocker enum collapses to three:
--     ready | awaiting_ll | site_control
--   * pricing + site_plan  → awaiting_ll, detailed by two new booleans
--     (needs_pricing, needs_site_plan) so the tile can read Pricing / Site
--     plan / Both. At least one is required when blocked_on = 'awaiting_ll'.
--   * under_contract        → site_control (rename)
--   * info                  → dropped; such deals fall back to unclassified (NULL)
--
-- Prod currently has 0 non-null blocked_on rows, but the value-migration steps
-- are included so a fresh DB replaying the old flow lands correctly.
-- ============================================================================

-- 1. New detail booleans for the "Awaiting landlord" bucket.
ALTER TABLE deal_activity_state
  ADD COLUMN IF NOT EXISTS needs_pricing   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS needs_site_plan BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN deal_activity_state.needs_pricing IS
  'Detail of blocked_on=awaiting_ll: waiting on landlord pricing. Only meaningful when blocked_on=awaiting_ll.';
COMMENT ON COLUMN deal_activity_state.needs_site_plan IS
  'Detail of blocked_on=awaiting_ll: waiting on landlord site plan. Only meaningful when blocked_on=awaiting_ll.';

-- 2. Drop the old enum CHECK so old values can be rewritten.
ALTER TABLE deal_activity_state DROP CONSTRAINT IF EXISTS deal_activity_state_blocked_on_check;

-- 3. Migrate old values → new (no-op on current prod; all NULL).
UPDATE deal_activity_state SET blocked_on = 'awaiting_ll', needs_pricing = TRUE   WHERE blocked_on = 'pricing';
UPDATE deal_activity_state SET blocked_on = 'awaiting_ll', needs_site_plan = TRUE WHERE blocked_on = 'site_plan';
UPDATE deal_activity_state SET blocked_on = 'site_control'                        WHERE blocked_on = 'under_contract';
UPDATE deal_activity_state SET blocked_on = NULL                                  WHERE blocked_on = 'info';

-- 4. New enum CHECK.
ALTER TABLE deal_activity_state
  ADD CONSTRAINT deal_activity_state_blocked_on_check
  CHECK (blocked_on IS NULL OR blocked_on IN ('ready', 'awaiting_ll', 'site_control'));

-- 5. Invariant: awaiting_ll requires at least one landlord detail checked.
ALTER TABLE deal_activity_state
  ADD CONSTRAINT deal_activity_state_awaiting_ll_needs
  CHECK (blocked_on IS DISTINCT FROM 'awaiting_ll' OR needs_pricing OR needs_site_plan);

-- 6. Leaving Pre-Submittal clears blocked_on AND its landlord details.
CREATE OR REPLACE FUNCTION public.clear_blocked_on_leaving_presubmittal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM deal_stage ds
    WHERE ds.id = NEW.stage_id AND ds.label = 'Pre-Submittal'
  ) THEN
    UPDATE deal_activity_state
      SET blocked_on = NULL, needs_pricing = FALSE, needs_site_plan = FALSE
      WHERE deal_id = NEW.id
        AND (blocked_on IS NOT NULL OR needs_pricing OR needs_site_plan);
  END IF;
  RETURN NEW;
END;
$$;
