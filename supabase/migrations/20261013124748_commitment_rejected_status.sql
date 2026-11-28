-- The desk panel needs a fourth answer: "not a commitment".
--
-- 'rejected' is NOT 'skipped'. Skipping defers; rejecting says the extractor was
-- wrong, and the row must never come back. Extraction checks for a rejected row
-- on the same conversation+direction before inserting, so a rerun cannot
-- resurrect it.
ALTER TABLE public.commitment DROP CONSTRAINT IF EXISTS commitment_status_check;
ALTER TABLE public.commitment ADD CONSTRAINT commitment_status_check
  CHECK (status IN ('open','handled','flagged','skipped','rejected'));

-- Why a Gmail write failed, so the row can say so in red instead of lying.
ALTER TABLE public.commitment ADD COLUMN IF NOT EXISTS sync_error text;

-- The training signal. A rejection is the only place the owner tells the
-- extractor it was wrong about an obligation, and it is kept separately from
-- the commitment row because the row may later be deleted by the window moving
-- on while the correction stays useful.
CREATE TABLE IF NOT EXISTS public.commitment_correction (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commitment_id       uuid REFERENCES public.commitment(id) ON DELETE SET NULL,
  gmail_connection_id uuid REFERENCES public.gmail_connection(id) ON DELETE SET NULL,
  -- The conversation key, so this survives the commitment row.
  gmail_thread_id     varchar(255) NOT NULL,
  conversation_thread_ids text[],
  correction          text NOT NULL DEFAULT 'not_a_commitment'
                      CHECK (correction IN ('not_a_commitment')),
  ball                text NOT NULL,
  reason_core         text,
  what                text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commitment_correction_thread
  ON public.commitment_correction (gmail_thread_id);

-- Grants: explicit, per CLAUDE.md. Written only by the edge function with the
-- secret key; the panel reads nothing from it today, but internal users may.
REVOKE ALL ON public.commitment_correction FROM anon, authenticated;
GRANT SELECT ON public.commitment_correction TO authenticated;
ALTER TABLE public.commitment_correction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commitment_correction_select_internal ON public.commitment_correction;
CREATE POLICY commitment_correction_select_internal ON public.commitment_correction
  FOR SELECT TO authenticated USING (public.is_internal_user());

COMMENT ON TABLE public.commitment_correction IS
  'Owner saying the extractor was wrong about an obligation. Kept separately from commitment so it survives the row being retired when the window moves on.';
