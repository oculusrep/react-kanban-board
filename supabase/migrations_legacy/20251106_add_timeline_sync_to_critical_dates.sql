-- Migration: Add Timeline Sync to Critical Dates
-- Date: 2025-11-06
-- Purpose: Enable automatic syncing between deal Timeline fields and critical dates

-- =====================================================
-- STEP 1: Add columns to critical_date table
-- =====================================================

ALTER TABLE critical_date
ADD COLUMN IF NOT EXISTS is_timeline_linked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS deal_field_name TEXT;

-- Add comment to explain these fields
COMMENT ON COLUMN critical_date.is_timeline_linked IS 'True if this critical date is auto-synced with a deal Timeline field';
COMMENT ON COLUMN critical_date.deal_field_name IS 'Name of the deal table field this critical date syncs with (e.g., target_close_date, loi_signed_date)';

-- Add index for faster lookups of timeline-linked critical dates
CREATE INDEX IF NOT EXISTS idx_critical_date_timeline_linked
ON critical_date(deal_id, is_timeline_linked, deal_field_name)
WHERE is_timeline_linked = TRUE;

-- =====================================================
-- STEP 2: Function to create default timeline critical dates
-- =====================================================

CREATE OR REPLACE FUNCTION create_timeline_critical_dates(p_deal_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_existing_count INTEGER;
BEGIN
  -- Check if timeline critical dates already exist for this deal
  SELECT COUNT(*) INTO v_existing_count
  FROM critical_date
  WHERE deal_id = p_deal_id
    AND is_timeline_linked = TRUE;

  -- Only create if they don't already exist
  IF v_existing_count = 0 THEN
    -- Insert 5 default timeline critical dates
    INSERT INTO critical_date (
      id,
      deal_id,
      subject,
      critical_date,
      description,
      send_email,
      send_email_days_prior,
      is_default,
      is_timeline_linked,
      deal_field_name,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      p_deal_id,
      timeline_dates.subject,
      CASE timeline_dates.field_name
        WHEN 'target_close_date' THEN d.target_close_date
        WHEN 'loi_signed_date' THEN d.loi_signed_date
        WHEN 'contract_signed_date' THEN d.contract_signed_date
        WHEN 'booked_date' THEN d.booked_date
        WHEN 'closed_date' THEN d.closed_date
      END,
      NULL, -- description
      FALSE, -- send_email
      NULL, -- send_email_days_prior
      TRUE, -- is_default
      TRUE, -- is_timeline_linked
      timeline_dates.field_name,
      NOW(),
      NOW()
    FROM deal d
    CROSS JOIN (
      VALUES
        ('Target Close Date', 'target_close_date', 1),
        ('LOI X Date', 'loi_signed_date', 2),
        ('Effective Date (Contract X)', 'contract_signed_date', 3),
        ('Booked Date', 'booked_date', 4),
        ('Closed Date', 'closed_date', 5)
    ) AS timeline_dates(subject, field_name, sort_order)
    WHERE d.id = p_deal_id;

    RAISE NOTICE 'Created 5 timeline critical dates for deal %', p_deal_id;
  END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION create_timeline_critical_dates IS 'Creates 5 default timeline-linked critical dates for a deal if they don''t already exist';

-- =====================================================
-- STEP 3: Trigger to auto-create timeline critical dates on deal insert
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_create_timeline_critical_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Create timeline critical dates for new deal
  PERFORM create_timeline_critical_dates(NEW.id);
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS after_deal_insert_create_timeline_dates ON deal;

CREATE TRIGGER after_deal_insert_create_timeline_dates
  AFTER INSERT ON deal
  FOR EACH ROW
  EXECUTE FUNCTION trigger_create_timeline_critical_dates();

-- Add comment
COMMENT ON TRIGGER after_deal_insert_create_timeline_dates ON deal IS 'Automatically creates timeline critical dates when a new deal is created';

-- =====================================================
-- STEP 4: Backfill timeline critical dates for existing deals
-- =====================================================

-- Create timeline critical dates for all existing deals that don't have them
DO $$
DECLARE
  deal_record RECORD;
  total_deals INTEGER;
  processed_deals INTEGER := 0;
BEGIN
  -- Count total deals
  SELECT COUNT(*) INTO total_deals FROM deal;
  RAISE NOTICE 'Starting backfill for % existing deals', total_deals;

  -- Loop through all deals
  FOR deal_record IN
    SELECT id FROM deal
  LOOP
    -- Create timeline critical dates for this deal
    PERFORM create_timeline_critical_dates(deal_record.id);
    processed_deals := processed_deals + 1;

    -- Log progress every 100 deals
    IF processed_deals % 100 = 0 THEN
      RAISE NOTICE 'Processed % of % deals', processed_deals, total_deals;
    END IF;
  END LOOP;

  RAISE NOTICE 'Backfill complete: Processed % deals', processed_deals;
END;
$$;

-- =====================================================
-- STEP 5: Function to sync deal field to critical date
-- =====================================================

CREATE OR REPLACE FUNCTION sync_deal_field_to_critical_date(
  p_deal_id UUID,
  p_field_name TEXT,
  p_new_value DATE
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update the corresponding critical date
  UPDATE critical_date
  SET
    critical_date = p_new_value,
    updated_at = NOW()
  WHERE deal_id = p_deal_id
    AND is_timeline_linked = TRUE
    AND deal_field_name = p_field_name;

  -- If no rows were updated, the critical date might not exist (shouldn't happen with backfill)
  IF NOT FOUND THEN
    RAISE NOTICE 'No timeline critical date found for deal % field %', p_deal_id, p_field_name;
  END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION sync_deal_field_to_critical_date IS 'Syncs a deal Timeline field value to its corresponding critical date record';

-- =====================================================
-- STEP 6: Trigger to sync deal Timeline fields to critical dates
-- =====================================================

CREATE OR REPLACE FUNCTION trigger_sync_deal_timeline_to_critical_dates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only sync if Timeline fields changed
  IF NEW.target_close_date IS DISTINCT FROM OLD.target_close_date THEN
    PERFORM sync_deal_field_to_critical_date(NEW.id, 'target_close_date', NEW.target_close_date);
  END IF;

  IF NEW.loi_signed_date IS DISTINCT FROM OLD.loi_signed_date THEN
    PERFORM sync_deal_field_to_critical_date(NEW.id, 'loi_signed_date', NEW.loi_signed_date);
  END IF;

  IF NEW.contract_signed_date IS DISTINCT FROM OLD.contract_signed_date THEN
    PERFORM sync_deal_field_to_critical_date(NEW.id, 'contract_signed_date', NEW.contract_signed_date);
  END IF;

  IF NEW.booked_date IS DISTINCT FROM OLD.booked_date THEN
    PERFORM sync_deal_field_to_critical_date(NEW.id, 'booked_date', NEW.booked_date);
  END IF;

  IF NEW.closed_date IS DISTINCT FROM OLD.closed_date THEN
    PERFORM sync_deal_field_to_critical_date(NEW.id, 'closed_date', NEW.closed_date);
  END IF;

  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS after_deal_update_sync_timeline ON deal;

CREATE TRIGGER after_deal_update_sync_timeline
  AFTER UPDATE ON deal
  FOR EACH ROW
  WHEN (
    NEW.target_close_date IS DISTINCT FROM OLD.target_close_date OR
    NEW.loi_signed_date IS DISTINCT FROM OLD.loi_signed_date OR
    NEW.contract_signed_date IS DISTINCT FROM OLD.contract_signed_date OR
    NEW.booked_date IS DISTINCT FROM OLD.booked_date OR
    NEW.closed_date IS DISTINCT FROM OLD.closed_date
  )
  EXECUTE FUNCTION trigger_sync_deal_timeline_to_critical_dates();

-- Add comment
COMMENT ON TRIGGER after_deal_update_sync_timeline ON deal IS 'Syncs Timeline field changes to corresponding critical dates';

-- =====================================================
-- STEP 7: Summary and verification
-- =====================================================

-- Show summary of timeline critical dates
DO $$
DECLARE
  total_timeline_dates INTEGER;
  deals_with_timeline_dates INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_timeline_dates
  FROM critical_date
  WHERE is_timeline_linked = TRUE;

  SELECT COUNT(DISTINCT deal_id) INTO deals_with_timeline_dates
  FROM critical_date
  WHERE is_timeline_linked = TRUE;

  RAISE NOTICE '======================================';
  RAISE NOTICE 'Timeline Critical Dates Migration Complete';
  RAISE NOTICE '======================================';
  RAISE NOTICE 'Total timeline critical dates created: %', total_timeline_dates;
  RAISE NOTICE 'Deals with timeline dates: %', deals_with_timeline_dates;
  RAISE NOTICE 'Expected: % (5 per deal)', deals_with_timeline_dates * 5;
  RAISE NOTICE '======================================';
END;
$$;
