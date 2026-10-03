-- Add 'noise' to the gesture vocabulary.
--
-- The first real batch of events showed three kinds of change that are neither
-- a correction nor a disposition of an OVIS category:
--   * OVIS-Linked  -- email-triage's own legacy label. OVIS's write, not the
--                     owner's, but it predates the OVIS/ namespace so the
--                     prefix test attributed it to the owner.
--   * INBOX added  -- mail arriving, not a decision.
--   * ! [MIKE], _OM, YELLOW_STAR -- the owner's own filing system, which says
--                     nothing about whether OVIS's category was right.
-- INBOX *removed* is different and stays a disposition: it is the archive
-- gesture, i.e. "I am done with this".
ALTER TABLE public.gmail_label_event
  DROP CONSTRAINT IF EXISTS gmail_label_event_gesture_valid;
ALTER TABLE public.gmail_label_event
  ADD CONSTRAINT gmail_label_event_gesture_valid
  CHECK (gesture IN ('pending', 'handled', 'correction', 'superseded', 'ovis_write', 'noise'));
