-- commitment — the organising object is an OBLIGATION, not an email (spec §4).
--
-- Step 1 of 3: table + extraction only. No UI, no Gmail writes, no deal-board
-- wiring.
--
-- ⚠️ WHAT "SHADOW" DOES AND DOES NOT MEAN (spec §4 requires this be said out
-- loud in the build): `would_set_ball_in_court` is never acted on, and nothing
-- here writes to deal_activity_state. BUT triage's existing writes continue
-- regardless -- email_object_link, activity rows, and therefore
-- ball_in_court_since are still being written by email-triage today. So the
-- commitment layer is shadow-only; the SYSTEM is not. Any later comparison of
-- would_set_ball_in_court against the board is contaminated by that, and the
-- board is not an independent baseline.
CREATE TABLE IF NOT EXISTS public.commitment (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source-agnostic by design so voice capture drops in later (spec §4).
  source              text NOT NULL DEFAULT 'email' CHECK (source IN ('email','voice','manual')),

  -- The unit of work is the THREAD. Commitment state depends on the latest
  -- messages, including the owner's own replies, so a per-email row would
  -- thrash.
  gmail_thread_id     varchar(255) NOT NULL,
  gmail_connection_id uuid REFERENCES public.gmail_connection(id) ON DELETE SET NULL,

  -- Three ball states (spec §4). 'neither' is CC/FYI and carries no clock.
  ball                text NOT NULL CHECK (ball IN ('them','me','neither')),

  counterparty_name   text,
  counterparty_email  text,

  what                text NOT NULL,
  -- The actual product: one sentence written to be read ALOUD.
  speakable_reason    text NOT NULL,

  promised_date       date,
  deal_id             uuid REFERENCES public.deal(id) ON DELETE SET NULL,

  -- Shadow only. Never read by the board, never written back.
  would_set_ball_in_court text,

  status              text NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','handled','flagged','skipped')),

  -- Spec §4 calls this decline_count; named skip_count here to match the
  -- owner's vocabulary. Same thing: it drives decay, and after the second skip
  -- the item leaves the spoken queue for an aggregate line. It never
  -- disappears.
  skip_count          integer NOT NULL DEFAULT 0,
  -- Written by BOTH decay and snooze (spec §4).
  next_surface_date   date,

  -- Nothing is marked handled in OVIS until Gmail confirms (spec §4).
  -- 'failed' belongs in a visible retry queue, not a silent one.
  sync_state          text NOT NULL DEFAULT 'pending'
                      CHECK (sync_state IN ('pending','synced','failed')),

  model               text,
  confidence          numeric(3,2) CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- IDENTITY FOR RERUNS. The owner proposed unique (gmail_thread_id, what).
-- `what` is model-generated prose: re-extraction rewords it, so that key would
-- duplicate on every run -- the exact failure the constraint is meant to
-- prevent. Identity is therefore (thread, direction): a thread holds at most
-- one "they owe me" and one "I owe them", and a rerun UPDATES that row when the
-- thread moves.
-- TRADE-OFF, stated rather than hidden: two genuinely distinct obligations in
-- the SAME direction on one thread collapse into one row, and the later
-- extraction overwrites `what`.
CREATE UNIQUE INDEX IF NOT EXISTS commitment_thread_ball_key
  ON public.commitment (gmail_thread_id, ball);

CREATE INDEX IF NOT EXISTS idx_commitment_open_ball
  ON public.commitment (ball, next_surface_date) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_commitment_deal ON public.commitment (deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commitment_sync
  ON public.commitment (sync_state) WHERE sync_state <> 'synced';

CREATE OR REPLACE FUNCTION public.commitment_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $t$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$t$;
DROP TRIGGER IF EXISTS commitment_set_updated_at ON public.commitment;
CREATE TRIGGER commitment_set_updated_at BEFORE UPDATE ON public.commitment
  FOR EACH ROW EXECUTE FUNCTION public.commitment_touch_updated_at();

-- Grants: explicit, per CLAUDE.md. anon gets nothing; the default privileges
-- for FUNCTIONS were fixed on 2026-10-03 but TABLES still grant anon by
-- default under the supabase_admin owner, so revoke rather than assume.
REVOKE ALL ON public.commitment FROM anon, authenticated;
GRANT SELECT ON public.commitment TO authenticated;
ALTER TABLE public.commitment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS commitment_select_internal ON public.commitment;
CREATE POLICY commitment_select_internal ON public.commitment
  FOR SELECT TO authenticated USING (public.is_internal_user());

COMMENT ON TABLE public.commitment IS
  'Obligations extracted per Gmail thread. would_set_ball_in_court is shadow only and never acted on; triage''s own activity/ball_in_court_since writes continue independently.';
COMMENT ON COLUMN public.commitment.skip_count IS
  'Spec §4 decline_count. After the second skip the item leaves the spoken queue for an aggregate line; it never disappears.';
