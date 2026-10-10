-- Starbucks Pipeline Report — the report's own editable fields + manual order.
--
-- One row per board card in the four Starbucks stages (Pre-Submittal,
-- Submitted-Reviewing, Negotiating LOI, At Lease/PSA). The card unit matches
-- the deal board (decisions §2.27): keyed by site_submit when the card has one,
-- else by deal (the rare deal with no site_submit). Exactly one key is set.
--
-- These fields are the report's, not the board's: status / package_status /
-- notes are the text sent to Starbucks, and sort_order is "which deal we think
-- is next" (drag-and-drop on the report, export order in Excel). They are kept
-- out of deal_activity_state on purpose — writes there drive the board clock
-- and post history into the chat.
--
-- package_status is free text for now; it becomes a % complete fed by another
-- tool later.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE TABLE public.starbucks_pipeline_report_row (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id  uuid UNIQUE REFERENCES public.site_submit(id) ON DELETE CASCADE,
  deal_id         uuid UNIQUE REFERENCES public.deal(id) ON DELETE CASCADE,
  sort_order      integer,
  status          text,
  package_status  text,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      uuid DEFAULT auth.uid(),
  CONSTRAINT starbucks_pipeline_report_row_one_key
    CHECK (num_nonnulls(site_submit_id, deal_id) = 1)
);

CREATE TRIGGER trg_starbucks_pipeline_report_row_updated_at
  BEFORE UPDATE ON public.starbucks_pipeline_report_row
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: internal users only (same gate as the board, 20261009105306).
ALTER TABLE public.starbucks_pipeline_report_row ENABLE ROW LEVEL SECURITY;

CREATE POLICY starbucks_pipeline_report_row_select_internal ON public.starbucks_pipeline_report_row
  FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));

CREATE POLICY starbucks_pipeline_report_row_insert_internal ON public.starbucks_pipeline_report_row
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_internal_user()));

CREATE POLICY starbucks_pipeline_report_row_update_internal ON public.starbucks_pipeline_report_row
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_internal_user()))
  WITH CHECK ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses. No DELETE —
-- rows go away with their site_submit / deal (cascade).
REVOKE ALL ON public.starbucks_pipeline_report_row FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.starbucks_pipeline_report_row TO authenticated;
