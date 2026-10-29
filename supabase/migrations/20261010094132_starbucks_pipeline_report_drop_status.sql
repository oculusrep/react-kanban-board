-- Starbucks Pipeline Report: Status is the stage (plus the board's waiting-on /
-- court detail for Pre-Submittal and Negotiating LOI), never free text, so the
-- report's own status column is unused. Dropped while the table is still empty.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

ALTER TABLE public.starbucks_pipeline_report_row DROP COLUMN status;
