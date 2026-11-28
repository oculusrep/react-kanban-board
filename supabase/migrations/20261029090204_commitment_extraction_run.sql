-- Extraction runs, so "only what is new" has something to measure "new" against.
--
-- An incremental run needs the completion time of the last run that FINISHED.
-- A run that died halfway must not advance the watermark, or the conversations
-- it never reached are silently skipped forever -- the same watermark bug that
-- cost this project three days of label history in September.
CREATE TABLE IF NOT EXISTS public.commitment_extraction_run (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_connection_id uuid NOT NULL REFERENCES public.gmail_connection(id) ON DELETE CASCADE,
  mode                text NOT NULL CHECK (mode IN ('incremental','full')),
  -- The cutoff this run actually used, recorded rather than recomputed, so a
  -- later question about what it covered has an answer.
  since_ts            timestamptz,
  started_at          timestamptz NOT NULL DEFAULT now(),
  -- NULL until the run genuinely finished. Only a non-null value is a watermark.
  completed_at        timestamptz,
  conversations_in_scope integer,
  attempted           integer NOT NULL DEFAULT 0,
  model_calls         integer NOT NULL DEFAULT 0,
  inserted            integer NOT NULL DEFAULT 0,
  updated             integer NOT NULL DEFAULT 0,
  deleted             integer NOT NULL DEFAULT 0,
  usd                 numeric(10,4) NOT NULL DEFAULT 0,
  error               text
);

CREATE INDEX IF NOT EXISTS idx_cer_conn_completed
  ON public.commitment_extraction_run (gmail_connection_id, completed_at DESC NULLS LAST);
-- Daily spend is summed over this, so it is read by started_at.
CREATE INDEX IF NOT EXISTS idx_cer_started ON public.commitment_extraction_run (started_at DESC);

-- Grants: explicit, per CLAUDE.md. The panel reads it for "last refreshed";
-- only the edge function writes, with the secret key.
REVOKE ALL ON public.commitment_extraction_run FROM anon, authenticated;
GRANT SELECT ON public.commitment_extraction_run TO authenticated;
ALTER TABLE public.commitment_extraction_run ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cer_select_internal ON public.commitment_extraction_run;
CREATE POLICY cer_select_internal ON public.commitment_extraction_run
  FOR SELECT TO authenticated USING (public.is_internal_user());

COMMENT ON TABLE public.commitment_extraction_run IS
  'One row per extraction run. completed_at is the incremental watermark and stays NULL unless the run finished; a half-finished run must never advance it.';
