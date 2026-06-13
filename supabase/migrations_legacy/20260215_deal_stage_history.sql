-- Deal Stage History Tracking System
-- Records every stage transition for pipeline velocity analytics
-- Enables: days-in-stage badges, broker/account velocity reports, Monte Carlo predictions

-- ============================================================================
-- 1. CORE TABLE: deal_stage_history
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES deal_stage(id),  -- NULL for initial entry
  to_stage_id UUID NOT NULL REFERENCES deal_stage(id),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Corrected date: uses actual milestone date (loi_signed_date, booked_date, closed_date)
  -- when available, otherwise falls back to changed_at
  corrected_date TIMESTAMPTZ,

  -- Denormalized for efficient queries (captured at time of change)
  -- Note: No FK on deal_owner_id as some owner_ids from Salesforce may not exist in auth.users
  deal_owner_id UUID,
  client_id UUID REFERENCES client(id),

  -- Duration in previous stage (populated when NEXT transition occurs)
  -- Calculated using corrected_date when available for accuracy
  duration_seconds INTEGER,

  -- Source of the corrected_date for transparency
  date_source TEXT CHECK (date_source IN ('system', 'loi_signed_date', 'contract_signed_date', 'booked_date', 'closed_date', 'manual')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment
COMMENT ON TABLE deal_stage_history IS
'Tracks all deal stage transitions for pipeline velocity analytics. Each row represents a stage change.';

COMMENT ON COLUMN deal_stage_history.duration_seconds IS
'Time spent in the FROM stage (seconds). Populated when deal moves to next stage.';

COMMENT ON COLUMN deal_stage_history.corrected_date IS
'The actual date of the stage transition. Uses milestone dates (loi_signed_date, booked_date, closed_date) when available, otherwise uses changed_at.';

COMMENT ON COLUMN deal_stage_history.date_source IS
'Indicates where corrected_date came from: system (automatic), or a specific deal date field.';

-- ============================================================================
-- 2. INDEXES for common query patterns
-- ============================================================================

-- Primary lookups
CREATE INDEX idx_dsh_deal_id ON deal_stage_history(deal_id);
CREATE INDEX idx_dsh_to_stage ON deal_stage_history(to_stage_id);
CREATE INDEX idx_dsh_changed_at ON deal_stage_history(changed_at DESC);

-- Analytics: broker velocity
CREATE INDEX idx_dsh_owner_stage ON deal_stage_history(deal_owner_id, to_stage_id);

-- Analytics: client velocity
CREATE INDEX idx_dsh_client_stage ON deal_stage_history(client_id, to_stage_id);

-- Finding records that need duration backfill
CREATE INDEX idx_dsh_duration_null ON deal_stage_history(deal_id, to_stage_id)
  WHERE duration_seconds IS NULL;

-- ============================================================================
-- 3. TRIGGER: Auto-record stage transitions
-- ============================================================================

CREATE OR REPLACE FUNCTION record_deal_stage_change()
RETURNS TRIGGER AS $$
DECLARE
  v_duration INTEGER;
  v_new_stage_label TEXT;
  v_corrected_date TIMESTAMPTZ;
  v_date_source TEXT;
  v_prev_corrected_date TIMESTAMPTZ;
BEGIN
  -- Only fire when stage_id actually changes
  IF NEW.stage_id IS DISTINCT FROM OLD.stage_id THEN

    -- Get the new stage label to determine which date field to use
    SELECT label INTO v_new_stage_label
    FROM deal_stage
    WHERE id = NEW.stage_id;

    -- Determine the corrected date based on stage and available date fields
    -- Priority: actual milestone date > system timestamp
    --
    -- Stage flow and dates:
    -- Prospect -> Negotiating LOI (deal enters LOI negotiation)
    -- Negotiating LOI -> At Lease/PSA: use loi_signed_date (LOI was signed, now negotiating lease)
    -- At Lease/PSA -> Booked/Under Contract: use contract_signed_date (lease/PSA was signed)
    -- Booked -> Closed: use closed_date
    --
    CASE v_new_stage_label
      WHEN 'Negotiating LOI' THEN
        -- Entering LOI negotiation stage - no specific date field for this
        v_corrected_date := NOW();
        v_date_source := 'system';
      WHEN 'At Lease / PSA' THEN
        -- LOI was signed, moving to lease negotiation
        -- Use loi_signed_date as this marks the END of LOI stage
        IF NEW.loi_signed_date IS NOT NULL THEN
          v_corrected_date := NEW.loi_signed_date::TIMESTAMPTZ;
          v_date_source := 'loi_signed_date';
        ELSE
          v_corrected_date := NOW();
          v_date_source := 'system';
        END IF;
      WHEN 'Booked', 'Under Contract / Contingent' THEN
        -- Lease/PSA was signed, deal is now booked or under contract
        -- Use contract_signed_date as this marks the END of At Lease/PSA stage
        IF NEW.contract_signed_date IS NOT NULL THEN
          v_corrected_date := NEW.contract_signed_date::TIMESTAMPTZ;
          v_date_source := 'contract_signed_date';
        ELSIF NEW.booked_date IS NOT NULL THEN
          -- Fallback to booked_date if contract_signed_date not set
          v_corrected_date := NEW.booked_date::TIMESTAMPTZ;
          v_date_source := 'booked_date';
        ELSE
          v_corrected_date := NOW();
          v_date_source := 'system';
        END IF;
      WHEN 'Closed' THEN
        -- Deal closed
        IF NEW.closed_date IS NOT NULL THEN
          v_corrected_date := NEW.closed_date::TIMESTAMPTZ;
          v_date_source := 'closed_date';
        ELSE
          v_corrected_date := NOW();
          v_date_source := 'system';
        END IF;
      ELSE
        -- All other stages: use system timestamp
        v_corrected_date := NOW();
        v_date_source := 'system';
    END CASE;

    -- Get the corrected_date from previous history record for accurate duration
    SELECT corrected_date INTO v_prev_corrected_date
    FROM deal_stage_history
    WHERE deal_id = NEW.id
      AND to_stage_id = OLD.stage_id
      AND duration_seconds IS NULL
    ORDER BY changed_at DESC
    LIMIT 1;

    -- Calculate duration using corrected dates when available
    IF v_prev_corrected_date IS NOT NULL THEN
      v_duration := EXTRACT(EPOCH FROM (v_corrected_date - v_prev_corrected_date))::INTEGER;
    ELSE
      -- Fallback to last_stage_change_at or created_at
      v_duration := EXTRACT(EPOCH FROM (v_corrected_date - COALESCE(OLD.last_stage_change_at, OLD.created_at)))::INTEGER;
    END IF;

    -- Ensure duration is not negative (can happen if dates are entered out of order)
    IF v_duration < 0 THEN
      v_duration := 0;
    END IF;

    -- Update the previous history record with duration (if exists)
    UPDATE deal_stage_history
    SET duration_seconds = v_duration
    WHERE deal_id = NEW.id
      AND to_stage_id = OLD.stage_id
      AND duration_seconds IS NULL;

    -- Insert new history record
    INSERT INTO deal_stage_history (
      deal_id,
      from_stage_id,
      to_stage_id,
      changed_at,
      corrected_date,
      date_source,
      deal_owner_id,
      client_id
    ) VALUES (
      NEW.id,
      OLD.stage_id,
      NEW.stage_id,
      NOW(),
      v_corrected_date,
      v_date_source,
      NEW.owner_id,
      NEW.client_id
    );

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS trigger_record_stage_change ON deal;
CREATE TRIGGER trigger_record_stage_change
  AFTER UPDATE ON deal
  FOR EACH ROW
  WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION record_deal_stage_change();

COMMENT ON FUNCTION record_deal_stage_change() IS
'Automatically records stage transitions to deal_stage_history table when deal.stage_id changes.';

-- ============================================================================
-- 4. VIEW: Current stage duration (for UI badges)
-- ============================================================================

CREATE OR REPLACE VIEW deal_current_stage_info AS
SELECT
  d.id AS deal_id,
  d.deal_name,
  d.stage_id,
  ds.label AS stage_label,
  d.owner_id AS deal_owner_id,
  d.client_id,
  COALESCE(d.last_stage_change_at, d.created_at) AS entered_current_stage_at,
  EXTRACT(DAY FROM NOW() - COALESCE(d.last_stage_change_at, d.created_at))::INTEGER AS days_in_stage,
  -- Flag deals that are stale (>30 days in LOI or At Lease/PSA)
  CASE
    WHEN ds.label IN ('Negotiating LOI', 'At Lease / PSA')
         AND EXTRACT(DAY FROM NOW() - COALESCE(d.last_stage_change_at, d.created_at)) > 30
    THEN true
    ELSE false
  END AS is_stale
FROM deal d
JOIN deal_stage ds ON ds.id = d.stage_id;

COMMENT ON VIEW deal_current_stage_info IS
'Real-time view of how long each deal has been in its current stage. Use for kanban badges and stale deal alerts.';

-- ============================================================================
-- 5. BACKFILL: Reconstruct history from deal date fields
-- ============================================================================

-- This backfill creates historical records based on:
-- - created_at: when deal was created (entered pipeline)
-- - loi_signed_date: when LOI was signed (enters At Lease/PSA stage)
-- - contract_signed_date: when lease/PSA was signed (exits At Lease/PSA, enters Booked)
-- - booked_date: fallback for when deal was booked
-- - closed_date: when deal closed
--
-- Stage flow:
-- Prospect -> Negotiating LOI (deal creation or start of LOI negotiation)
-- Negotiating LOI -> At Lease/PSA (loi_signed_date: LOI signed, now negotiating lease)
-- At Lease/PSA -> Booked (contract_signed_date: lease/PSA signed)
-- Booked -> Closed (closed_date)

-- First, get the stage IDs we need
DO $$
DECLARE
  v_prospect_id UUID;
  v_loi_id UUID;
  v_lease_id UUID;
  v_booked_id UUID;
  v_closed_id UUID;
  v_lost_id UUID;
  v_under_contract_id UUID;
  v_deal RECORD;
  v_prev_date TIMESTAMPTZ;
  v_prev_stage_id UUID;
  v_duration INTEGER;
BEGIN
  -- Get stage IDs
  SELECT id INTO v_prospect_id FROM deal_stage WHERE label = 'Prospect' LIMIT 1;
  SELECT id INTO v_loi_id FROM deal_stage WHERE label = 'Negotiating LOI' LIMIT 1;
  SELECT id INTO v_lease_id FROM deal_stage WHERE label = 'At Lease / PSA' LIMIT 1;
  SELECT id INTO v_booked_id FROM deal_stage WHERE label = 'Booked' LIMIT 1;
  SELECT id INTO v_closed_id FROM deal_stage WHERE label = 'Closed' LIMIT 1;
  SELECT id INTO v_lost_id FROM deal_stage WHERE label = 'Lost' LIMIT 1;
  SELECT id INTO v_under_contract_id FROM deal_stage WHERE label = 'Under Contract / Contingent' LIMIT 1;

  -- Process each deal
  FOR v_deal IN
    SELECT
      d.id,
      d.deal_name,
      d.stage_id,
      d.owner_id,
      d.client_id,
      d.created_at,
      d.loi_signed_date,
      d.contract_signed_date,
      d.booked_date,
      d.closed_date,
      ds.label AS current_stage
    FROM deal d
    JOIN deal_stage ds ON ds.id = d.stage_id
    WHERE NOT EXISTS (SELECT 1 FROM deal_stage_history dsh WHERE dsh.deal_id = d.id)
  LOOP
    v_prev_date := NULL;
    v_prev_stage_id := NULL;

    -- Skip deals with no created_at (bad data)
    IF v_deal.created_at IS NULL THEN
      CONTINUE;
    END IF;

    -- 1. Always create initial entry (deal creation -> Prospect)
    INSERT INTO deal_stage_history (
      deal_id, from_stage_id, to_stage_id, changed_at, corrected_date, date_source, deal_owner_id, client_id
    ) VALUES (
      v_deal.id, NULL, COALESCE(v_prospect_id, v_deal.stage_id),
      v_deal.created_at, v_deal.created_at, 'system',
      v_deal.owner_id, v_deal.client_id
    );
    v_prev_date := v_deal.created_at;
    v_prev_stage_id := COALESCE(v_prospect_id, v_deal.stage_id);

    -- 2. If deal has loi_signed_date, it means LOI was signed and deal entered At Lease/PSA
    IF v_deal.loi_signed_date IS NOT NULL AND v_lease_id IS NOT NULL
       AND v_deal.current_stage IN ('At Lease / PSA', 'Under Contract / Contingent', 'Booked', 'Closed', 'Lost') THEN

      -- Update duration on previous record (time in Prospect/LOI negotiation)
      v_duration := EXTRACT(EPOCH FROM (v_deal.loi_signed_date::TIMESTAMPTZ - v_prev_date))::INTEGER;
      IF v_duration < 0 THEN v_duration := 0; END IF;

      UPDATE deal_stage_history
      SET duration_seconds = v_duration
      WHERE deal_id = v_deal.id AND to_stage_id = v_prev_stage_id AND duration_seconds IS NULL;

      -- Insert At Lease/PSA entry (LOI signed, now negotiating lease)
      INSERT INTO deal_stage_history (
        deal_id, from_stage_id, to_stage_id, changed_at, corrected_date, date_source, deal_owner_id, client_id
      ) VALUES (
        v_deal.id, v_prev_stage_id, v_lease_id,
        v_deal.loi_signed_date, v_deal.loi_signed_date, 'loi_signed_date',
        v_deal.owner_id, v_deal.client_id
      );
      v_prev_date := v_deal.loi_signed_date::TIMESTAMPTZ;
      v_prev_stage_id := v_lease_id;
    END IF;

    -- 3. If deal has contract_signed_date or booked_date, lease/PSA was signed -> Booked
    IF (v_deal.contract_signed_date IS NOT NULL OR v_deal.booked_date IS NOT NULL)
       AND (v_booked_id IS NOT NULL OR v_under_contract_id IS NOT NULL)
       AND v_deal.current_stage IN ('Under Contract / Contingent', 'Booked', 'Closed') THEN

      DECLARE
        v_transition_date TIMESTAMPTZ;
        v_transition_source TEXT;
        v_target_stage_id UUID;
      BEGIN
        -- Prefer contract_signed_date, fall back to booked_date
        IF v_deal.contract_signed_date IS NOT NULL THEN
          v_transition_date := v_deal.contract_signed_date::TIMESTAMPTZ;
          v_transition_source := 'contract_signed_date';
        ELSE
          v_transition_date := v_deal.booked_date::TIMESTAMPTZ;
          v_transition_source := 'booked_date';
        END IF;

        -- Determine target stage
        IF v_deal.current_stage = 'Under Contract / Contingent' THEN
          v_target_stage_id := v_under_contract_id;
        ELSE
          v_target_stage_id := v_booked_id;
        END IF;

        -- Update duration on previous record (time in At Lease/PSA)
        v_duration := EXTRACT(EPOCH FROM (v_transition_date - v_prev_date))::INTEGER;
        IF v_duration < 0 THEN v_duration := 0; END IF;

        UPDATE deal_stage_history
        SET duration_seconds = v_duration
        WHERE deal_id = v_deal.id AND to_stage_id = v_prev_stage_id AND duration_seconds IS NULL;

        -- Insert Booked/Under Contract entry
        INSERT INTO deal_stage_history (
          deal_id, from_stage_id, to_stage_id, changed_at, corrected_date, date_source, deal_owner_id, client_id
        ) VALUES (
          v_deal.id, v_prev_stage_id, v_target_stage_id,
          v_transition_date, v_transition_date, v_transition_source,
          v_deal.owner_id, v_deal.client_id
        );
        v_prev_date := v_transition_date;
        v_prev_stage_id := v_target_stage_id;
      END;
    END IF;

    -- 4. If deal has closed_date and is Closed, add Closed transition
    IF v_deal.closed_date IS NOT NULL AND v_closed_id IS NOT NULL
       AND v_deal.current_stage = 'Closed' THEN

      -- Update duration on previous record
      v_duration := EXTRACT(EPOCH FROM (v_deal.closed_date::TIMESTAMPTZ - v_prev_date))::INTEGER;
      IF v_duration < 0 THEN v_duration := 0; END IF;

      UPDATE deal_stage_history
      SET duration_seconds = v_duration
      WHERE deal_id = v_deal.id AND to_stage_id = v_prev_stage_id AND duration_seconds IS NULL;

      -- Insert Closed entry
      INSERT INTO deal_stage_history (
        deal_id, from_stage_id, to_stage_id, changed_at, corrected_date, date_source, deal_owner_id, client_id
      ) VALUES (
        v_deal.id, v_prev_stage_id, v_closed_id,
        v_deal.closed_date, v_deal.closed_date, 'closed_date',
        v_deal.owner_id, v_deal.client_id
      );
      v_prev_date := v_deal.closed_date::TIMESTAMPTZ;
      v_prev_stage_id := v_closed_id;
    END IF;

    -- 5. If deal is currently in a stage we haven't recorded yet, add final transition
    IF v_deal.stage_id != v_prev_stage_id THEN
      -- Update duration on previous record (use now as approximate)
      UPDATE deal_stage_history
      SET duration_seconds = EXTRACT(EPOCH FROM (NOW() - v_prev_date))::INTEGER
      WHERE deal_id = v_deal.id AND to_stage_id = v_prev_stage_id AND duration_seconds IS NULL;

      -- Insert current stage entry
      INSERT INTO deal_stage_history (
        deal_id, from_stage_id, to_stage_id, changed_at, corrected_date, date_source, deal_owner_id, client_id
      ) VALUES (
        v_deal.id, v_prev_stage_id, v_deal.stage_id,
        COALESCE(v_deal.closed_date, v_deal.booked_date, v_deal.loi_signed_date, NOW())::TIMESTAMPTZ,
        COALESCE(v_deal.closed_date, v_deal.booked_date, v_deal.loi_signed_date, NOW())::TIMESTAMPTZ,
        'system',
        v_deal.owner_id, v_deal.client_id
      );
    END IF;

  END LOOP;

  RAISE NOTICE 'Backfill complete. Reconstructed history from deal date fields.';
END $$;

-- ============================================================================
-- 6. FUNCTION: Correct a stage transition date
-- ============================================================================

-- Use this to manually fix a stage transition date when you have better data
-- Example: SELECT correct_stage_transition_date('deal-uuid', 'Booked', '2025-10-15');

CREATE OR REPLACE FUNCTION correct_stage_transition_date(
  p_deal_id UUID,
  p_stage_label TEXT,
  p_corrected_date DATE
)
RETURNS void AS $$
DECLARE
  v_stage_id UUID;
  v_history_id UUID;
  v_next_corrected_date TIMESTAMPTZ;
BEGIN
  -- Get the stage ID
  SELECT id INTO v_stage_id FROM deal_stage WHERE label = p_stage_label;
  IF v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Stage not found: %', p_stage_label;
  END IF;

  -- Find the history record for this transition
  SELECT id INTO v_history_id
  FROM deal_stage_history
  WHERE deal_id = p_deal_id AND to_stage_id = v_stage_id
  ORDER BY changed_at DESC
  LIMIT 1;

  IF v_history_id IS NULL THEN
    RAISE EXCEPTION 'No history record found for deal % entering stage %', p_deal_id, p_stage_label;
  END IF;

  -- Update this record's corrected_date
  UPDATE deal_stage_history
  SET corrected_date = p_corrected_date::TIMESTAMPTZ,
      date_source = 'manual'
  WHERE id = v_history_id;

  -- Recalculate duration for the previous record (if any)
  UPDATE deal_stage_history prev
  SET duration_seconds = EXTRACT(EPOCH FROM (p_corrected_date::TIMESTAMPTZ - prev.corrected_date))::INTEGER
  FROM deal_stage_history curr
  WHERE curr.id = v_history_id
    AND prev.deal_id = p_deal_id
    AND prev.to_stage_id = curr.from_stage_id
    AND prev.corrected_date < p_corrected_date::TIMESTAMPTZ;

  -- Recalculate duration for this record if there's a next transition
  SELECT corrected_date INTO v_next_corrected_date
  FROM deal_stage_history
  WHERE deal_id = p_deal_id
    AND from_stage_id = v_stage_id
    AND corrected_date > p_corrected_date::TIMESTAMPTZ
  ORDER BY corrected_date ASC
  LIMIT 1;

  IF v_next_corrected_date IS NOT NULL THEN
    UPDATE deal_stage_history
    SET duration_seconds = EXTRACT(EPOCH FROM (v_next_corrected_date - p_corrected_date::TIMESTAMPTZ))::INTEGER
    WHERE id = v_history_id;
  END IF;

  RAISE NOTICE 'Updated % transition for deal % to %', p_stage_label, p_deal_id, p_corrected_date;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION correct_stage_transition_date IS
'Manually correct the date of a stage transition. Recalculates durations for adjacent transitions.';

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

ALTER TABLE deal_stage_history ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read history
CREATE POLICY "Users can read deal stage history"
  ON deal_stage_history
  FOR SELECT
  TO authenticated
  USING (true);

-- Only allow inserts through the trigger (service role)
CREATE POLICY "Service role can insert history"
  ON deal_stage_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow trigger function to insert
CREATE POLICY "Trigger can insert history"
  ON deal_stage_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow trigger to update duration
CREATE POLICY "Trigger can update duration"
  ON deal_stage_history
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- 8. SUMMARY
-- ============================================================================

DO $$
DECLARE
  v_deals_count INTEGER;
  v_history_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_deals_count FROM deal;
  SELECT COUNT(*) INTO v_history_count FROM deal_stage_history;

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Deal Stage History Setup Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Total deals: %', v_deals_count;
  RAISE NOTICE 'History records created: %', v_history_count;
  RAISE NOTICE '';
  RAISE NOTICE 'What was created:';
  RAISE NOTICE '  - Table: deal_stage_history';
  RAISE NOTICE '  - Trigger: trigger_record_stage_change';
  RAISE NOTICE '  - View: deal_current_stage_info';
  RAISE NOTICE '';
  RAISE NOTICE 'Stage changes will now be automatically tracked!';
  RAISE NOTICE '==========================================';
END $$;
