-- Auto-archive unpaid payments when deal moves to Lost stage
-- This trigger ensures payment lifecycle management is applied automatically
-- when a deal's stage changes to "Lost"

-- Function to archive unpaid payments when deal moves to Lost
CREATE OR REPLACE FUNCTION auto_archive_lost_deal_payments()
RETURNS TRIGGER AS $$
DECLARE
  v_lost_stage_id UUID;
  v_old_stage_label TEXT;
  v_new_stage_label TEXT;
BEGIN
  -- Get the Lost stage ID
  SELECT id INTO v_lost_stage_id
  FROM deal_stage
  WHERE label = 'Lost';

  -- Only proceed if stage_id changed and new stage is Lost
  IF (NEW.stage_id IS DISTINCT FROM OLD.stage_id) AND (NEW.stage_id = v_lost_stage_id) THEN

    -- Archive all unpaid, active payments for this deal
    UPDATE payment
    SET is_active = false,
        deleted_at = NOW()
    WHERE deal_id = NEW.id
      AND payment_received = false
      AND is_active = true;

    RAISE NOTICE 'Archived unpaid payments for deal % moving to Lost stage', NEW.deal_name;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger on deal table
DROP TRIGGER IF EXISTS trigger_auto_archive_lost_deal_payments ON deal;
CREATE TRIGGER trigger_auto_archive_lost_deal_payments
  AFTER UPDATE ON deal
  FOR EACH ROW
  WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION auto_archive_lost_deal_payments();

-- Add comment
COMMENT ON FUNCTION auto_archive_lost_deal_payments() IS
'Automatically archives (soft deletes) unpaid payments when a deal moves to Lost stage. Paid payments are preserved.';
