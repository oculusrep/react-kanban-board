-- =====================================================
-- Document Handoff Tracking
-- =====================================================
-- Track LOI and Lease documents as they pass between
-- "Us" (tenant/broker) and "LL" (landlord) during negotiations.
--
-- Created: March 16, 2026
-- =====================================================

-- =====================================================
-- 1. Create document_handoff table
-- =====================================================

CREATE TABLE IF NOT EXISTS document_handoff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,
  holder TEXT NOT NULL,
  changed_at DATE NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- For tracking edits (if backdated, stores the original toggle date)
  original_changed_at DATE,

  CONSTRAINT valid_document_type CHECK (document_type IN ('LOI', 'Lease')),
  CONSTRAINT valid_holder CHECK (holder IN ('us', 'll'))
);

COMMENT ON TABLE document_handoff IS 'Tracks document handoffs between Us (tenant/broker) and LL (landlord) during LOI and Lease negotiations.';
COMMENT ON COLUMN document_handoff.document_type IS 'Type of document: LOI or Lease';
COMMENT ON COLUMN document_handoff.holder IS 'Current holder: us or ll';
COMMENT ON COLUMN document_handoff.changed_at IS 'Date the document changed hands';
COMMENT ON COLUMN document_handoff.changed_by IS 'User who recorded the handoff';
COMMENT ON COLUMN document_handoff.original_changed_at IS 'Original date if handoff was backdated';

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_document_handoff_deal_id ON document_handoff(deal_id);
CREATE INDEX IF NOT EXISTS idx_document_handoff_deal_date ON document_handoff(deal_id, changed_at DESC);

-- =====================================================
-- 2. Add denormalized current status to deal table
-- =====================================================

ALTER TABLE deal ADD COLUMN IF NOT EXISTS current_handoff_holder TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS current_handoff_date DATE;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS current_handoff_document TEXT;

-- Add constraints
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_current_handoff_holder_check'
  ) THEN
    ALTER TABLE deal ADD CONSTRAINT deal_current_handoff_holder_check
      CHECK (current_handoff_holder IS NULL OR current_handoff_holder IN ('us', 'll'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deal_current_handoff_document_check'
  ) THEN
    ALTER TABLE deal ADD CONSTRAINT deal_current_handoff_document_check
      CHECK (current_handoff_document IS NULL OR current_handoff_document IN ('LOI', 'Lease'));
  END IF;
END $$;

COMMENT ON COLUMN deal.current_handoff_holder IS 'Current document holder: us or ll (denormalized for fast kanban queries)';
COMMENT ON COLUMN deal.current_handoff_date IS 'Date document changed to current holder';
COMMENT ON COLUMN deal.current_handoff_document IS 'Current document type being tracked (LOI or Lease)';

-- =====================================================
-- 3. Create trigger to sync current handoff to deal
-- =====================================================

CREATE OR REPLACE FUNCTION sync_current_handoff()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE deal
  SET
    current_handoff_holder = NEW.holder,
    current_handoff_date = NEW.changed_at,
    current_handoff_document = NEW.document_type
  WHERE id = NEW.deal_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_sync_current_handoff ON document_handoff;

CREATE TRIGGER trigger_sync_current_handoff
  AFTER INSERT ON document_handoff
  FOR EACH ROW
  EXECUTE FUNCTION sync_current_handoff();

COMMENT ON FUNCTION sync_current_handoff IS 'Syncs the latest handoff to deal table for fast kanban queries';

-- =====================================================
-- 4. Create trigger to clear handoff on stage change
-- =====================================================

CREATE OR REPLACE FUNCTION clear_handoff_on_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_old_stage_label TEXT;
  v_new_stage_label TEXT;
  v_tracked_stages TEXT[] := ARRAY['Negotiating LOI', 'At Lease / PSA', 'At Lease/PSA'];
BEGIN
  -- Only process if stage_id changed
  IF OLD.stage_id IS DISTINCT FROM NEW.stage_id THEN
    -- Get stage labels
    SELECT label INTO v_old_stage_label FROM deal_stage WHERE id = OLD.stage_id;
    SELECT label INTO v_new_stage_label FROM deal_stage WHERE id = NEW.stage_id;

    -- If moving between tracked stages (LOI -> Lease or vice versa), clear handoff status
    IF v_old_stage_label = ANY(v_tracked_stages)
       AND v_new_stage_label = ANY(v_tracked_stages)
       AND v_old_stage_label IS DISTINCT FROM v_new_stage_label THEN
      NEW.current_handoff_holder := NULL;
      NEW.current_handoff_date := NULL;
      NEW.current_handoff_document := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_clear_handoff_on_stage_change ON deal;

CREATE TRIGGER trigger_clear_handoff_on_stage_change
  BEFORE UPDATE ON deal
  FOR EACH ROW
  EXECUTE FUNCTION clear_handoff_on_stage_change();

COMMENT ON FUNCTION clear_handoff_on_stage_change IS 'Clears handoff status when deal moves between LOI and Lease stages (intentional reset)';

-- =====================================================
-- 5. Row Level Security
-- =====================================================

ALTER TABLE document_handoff ENABLE ROW LEVEL SECURITY;

-- View policy: Users can view handoffs for deals they can access
CREATE POLICY "Users can view document handoffs"
  ON document_handoff FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deal WHERE deal.id = document_handoff.deal_id
    )
  );

-- Insert policy: Authenticated users can insert handoffs
CREATE POLICY "Users can insert document handoffs"
  ON document_handoff FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Update policy: Authenticated users can update handoffs (for backdating)
CREATE POLICY "Users can update document handoffs"
  ON document_handoff FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Delete policy: Authenticated users can delete handoffs
CREATE POLICY "Users can delete document handoffs"
  ON document_handoff FOR DELETE
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- 6. Helper view for handoff history with days held
-- =====================================================

CREATE OR REPLACE VIEW document_handoff_history AS
SELECT
  dh.id,
  dh.deal_id,
  dh.document_type,
  dh.holder,
  dh.changed_at,
  dh.changed_by,
  dh.created_at,
  -- Calculate days held (until next handoff or until today)
  COALESCE(
    (
      SELECT dh2.changed_at - dh.changed_at
      FROM document_handoff dh2
      WHERE dh2.deal_id = dh.deal_id
        AND dh2.changed_at > dh.changed_at
      ORDER BY dh2.changed_at ASC
      LIMIT 1
    ),
    CURRENT_DATE - dh.changed_at
  ) AS days_held,
  -- Count total turns for this deal/document type
  (
    SELECT COUNT(*)
    FROM document_handoff dh3
    WHERE dh3.deal_id = dh.deal_id
      AND dh3.document_type = dh.document_type
  ) AS total_turns
FROM document_handoff dh
ORDER BY dh.deal_id, dh.changed_at DESC;

COMMENT ON VIEW document_handoff_history IS 'Document handoffs with calculated days_held and total_turns for display';

-- =====================================================
-- 7. Summary
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Document Handoff Tracking Migration Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New table: document_handoff';
  RAISE NOTICE '  - Tracks LOI/Lease handoffs between Us and LL';
  RAISE NOTICE '';
  RAISE NOTICE 'New deal columns:';
  RAISE NOTICE '  - current_handoff_holder (us/ll)';
  RAISE NOTICE '  - current_handoff_date';
  RAISE NOTICE '  - current_handoff_document (LOI/Lease)';
  RAISE NOTICE '';
  RAISE NOTICE 'Triggers:';
  RAISE NOTICE '  - sync_current_handoff: Syncs latest handoff to deal table';
  RAISE NOTICE '  - clear_handoff_on_stage_change: Clears status when moving LOI<->Lease';
  RAISE NOTICE '';
  RAISE NOTICE 'View: document_handoff_history';
  RAISE NOTICE '  - Includes days_held and total_turns calculations';
  RAISE NOTICE '==========================================';
END $$;
