-- =====================================================
-- SYNC LOI DATE BETWEEN DEAL AND SITE_SUBMIT
-- =====================================================
-- This migration creates bidirectional sync between:
--   - site_submit.loi_date (source of truth when entering via Site Submit)
--   - deal.loi_date (displayed on Deal Timeline section)
--
-- When site_submit.loi_date changes, deal.loi_date updates
-- When deal.loi_date changes, all linked site_submits update
-- =====================================================

-- Step 1: Create trigger function to sync site_submit.loi_date -> deal.loi_date
CREATE OR REPLACE FUNCTION sync_loi_date_from_site_submit()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if loi_date actually changed and deal_id is set
  IF (NEW.loi_date IS DISTINCT FROM OLD.loi_date) AND NEW.deal_id IS NOT NULL THEN
    UPDATE deal
    SET loi_date = NEW.loi_date
    WHERE id = NEW.deal_id
      -- Only update if deal's loi_date doesn't match (avoid infinite loops)
      AND (loi_date IS DISTINCT FROM NEW.loi_date);

    RAISE NOTICE 'Synced LOI date % from site_submit % to deal %', NEW.loi_date, NEW.id, NEW.deal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Create trigger function to sync deal.loi_date -> site_submit.loi_date
CREATE OR REPLACE FUNCTION sync_loi_date_from_deal()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if loi_date actually changed
  IF (NEW.loi_date IS DISTINCT FROM OLD.loi_date) THEN
    UPDATE site_submit
    SET loi_date = NEW.loi_date
    WHERE deal_id = NEW.id
      -- Only update if site_submit's loi_date doesn't match (avoid infinite loops)
      AND (loi_date IS DISTINCT FROM NEW.loi_date);

    RAISE NOTICE 'Synced LOI date % from deal % to site_submits', NEW.loi_date, NEW.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create the triggers

-- Drop if exists to allow re-running
DROP TRIGGER IF EXISTS trigger_sync_loi_date_from_site_submit ON site_submit;
DROP TRIGGER IF EXISTS trigger_sync_loi_date_from_deal ON deal;

-- Trigger: site_submit -> deal
CREATE TRIGGER trigger_sync_loi_date_from_site_submit
  AFTER UPDATE ON site_submit
  FOR EACH ROW
  EXECUTE FUNCTION sync_loi_date_from_site_submit();

-- Trigger: deal -> site_submit
CREATE TRIGGER trigger_sync_loi_date_from_deal
  AFTER UPDATE ON deal
  FOR EACH ROW
  EXECUTE FUNCTION sync_loi_date_from_deal();

-- Step 4: Also handle INSERT on site_submit (when a new site_submit is linked to a deal)
CREATE OR REPLACE FUNCTION sync_loi_date_on_site_submit_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- If site_submit has loi_date and deal_id, sync to deal
  IF NEW.loi_date IS NOT NULL AND NEW.deal_id IS NOT NULL THEN
    UPDATE deal
    SET loi_date = NEW.loi_date
    WHERE id = NEW.deal_id
      AND loi_date IS NULL;  -- Only if deal doesn't already have an LOI date

    RAISE NOTICE 'Synced LOI date % from new site_submit % to deal %', NEW.loi_date, NEW.id, NEW.deal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_loi_date_on_site_submit_insert ON site_submit;

CREATE TRIGGER trigger_sync_loi_date_on_site_submit_insert
  AFTER INSERT ON site_submit
  FOR EACH ROW
  EXECUTE FUNCTION sync_loi_date_on_site_submit_insert();

-- Step 5: One-time sync - populate deal.loi_date from site_submit where missing
-- This catches existing records where site_submit has loi_date but deal doesn't
UPDATE deal d
SET loi_date = ss.loi_date
FROM site_submit ss
WHERE ss.deal_id = d.id
  AND ss.loi_date IS NOT NULL
  AND d.loi_date IS NULL;

-- Also trigger payment recalculation for deals that just got loi_date
-- (This ensures payment estimates are updated)
DO $$
DECLARE
  v_deal RECORD;
BEGIN
  FOR v_deal IN
    SELECT d.id
    FROM deal d
    JOIN deal_stage ds ON ds.id = d.stage_id
    WHERE d.loi_date IS NOT NULL
      AND ds.label IN ('Negotiating LOI', 'At Lease / PSA', 'Under Contract / Contingent', 'Booked', 'Executed Payable')
  LOOP
    PERFORM recalculate_payment_dates_for_deal(v_deal.id);
  END LOOP;
END $$;

-- =====================================================
-- COMMENTS
-- =====================================================
COMMENT ON FUNCTION sync_loi_date_from_site_submit IS 'Syncs loi_date from site_submit to deal when site_submit is updated';
COMMENT ON FUNCTION sync_loi_date_from_deal IS 'Syncs loi_date from deal to all linked site_submits when deal is updated';
COMMENT ON FUNCTION sync_loi_date_on_site_submit_insert IS 'Syncs loi_date from site_submit to deal when a new site_submit is created';

-- =====================================================
-- SUMMARY
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'LOI Date Sync Migration Applied';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Bidirectional sync now active between:';
  RAISE NOTICE '  - site_submit.loi_date (LOI Written Date)';
  RAISE NOTICE '  - deal.loi_date (Timeline LOI Date)';
  RAISE NOTICE '';
  RAISE NOTICE 'Triggers created:';
  RAISE NOTICE '  - trigger_sync_loi_date_from_site_submit (AFTER UPDATE)';
  RAISE NOTICE '  - trigger_sync_loi_date_from_deal (AFTER UPDATE)';
  RAISE NOTICE '  - trigger_sync_loi_date_on_site_submit_insert (AFTER INSERT)';
  RAISE NOTICE '';
  RAISE NOTICE 'Existing records synced: deal.loi_date populated from site_submit';
  RAISE NOTICE '==========================================';
END $$;
