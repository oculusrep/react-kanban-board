-- Add a "Submitted-Reviewing" deal_stage between Pre-Submittal and
-- Negotiating LOI so Starbucks site submits that get created or advanced
-- into Submitted-Reviewing have a real deal-stage equivalent on the
-- master pipeline rather than landing back at Pre-Submittal or jumping
-- to Negotiating LOI.
--
-- Bumps existing stages at sort_order >= 1 up by one to make room at 1,
-- then inserts Submitted-Reviewing there. Idempotent — safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM deal_stage WHERE label = 'Submitted-Reviewing') THEN
    UPDATE deal_stage SET sort_order = sort_order + 1 WHERE sort_order >= 1;
    INSERT INTO deal_stage (label, sort_order, active)
      VALUES ('Submitted-Reviewing', 1, true);
  END IF;
END $$;
