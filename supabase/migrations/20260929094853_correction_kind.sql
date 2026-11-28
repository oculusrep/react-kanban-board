-- Split corrections by what OVIS knew at the time.
--
-- Measured 2026-09-29 over the first real batch: 142 corrections landed on mail
-- OVIS had NO label for, and 119 on mail it had labelled. Those are different
-- claims and must not feed a rule at the same weight:
--
--   silent  OVIS had no opinion. The owner supplied one. Weak evidence that any
--           OVIS rule is wrong -- strong evidence about the sender.
--   wrong   OVIS had a verdict and the owner overrode it. Direct evidence
--           against the rule or model output that produced that verdict.
--
-- ADDITIVE ON PURPOSE. gesture stays 'correction' for both, so every number
-- reported before this split remains reproducible and nothing is reclassified
-- out from under the earlier analysis. correction_kind is derivable from
-- email_label at any time, so a backfill loses nothing either.
ALTER TABLE public.gmail_label_event
  ADD COLUMN IF NOT EXISTS correction_kind text
  CHECK (correction_kind IS NULL OR correction_kind IN ('silent', 'wrong'));

COMMENT ON COLUMN public.gmail_label_event.correction_kind IS
  'For gesture = correction only. silent: OVIS had no label on the message. wrong: OVIS had one and was overridden. NULL for every other gesture.';

CREATE INDEX IF NOT EXISTS idx_gmail_label_event_correction_kind
  ON public.gmail_label_event (correction_kind, observed_at DESC)
  WHERE gesture = 'correction' AND excluded = false;

-- Backfill from what email_label recorded. Derived, not destructive.
UPDATE public.gmail_label_event ev
SET correction_kind = CASE
  WHEN EXISTS (SELECT 1 FROM public.email_label el
               WHERE el.gmail_id = ev.gmail_id AND el.applied_at IS NOT NULL)
  THEN 'wrong' ELSE 'silent' END
WHERE ev.gesture = 'correction' AND ev.correction_kind IS NULL;
