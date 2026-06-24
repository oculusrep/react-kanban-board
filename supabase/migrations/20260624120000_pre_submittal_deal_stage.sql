-- Add a "Pre-Submittal" deal_stage so that early-funnel deals (e.g. Starbucks
-- site submits being shopped before an LOI is written) have a real stage on the
-- pipeline rather than getting filed under "Negotiating LOI".
--
-- Sort order 0 places it to the left of "Negotiating LOI" (sort_order 1) on
-- the master pipeline kanban.

INSERT INTO deal_stage (label, sort_order, active)
SELECT 'Pre-Submittal', 0, true
WHERE NOT EXISTS (
  SELECT 1 FROM deal_stage WHERE label = 'Pre-Submittal'
);
