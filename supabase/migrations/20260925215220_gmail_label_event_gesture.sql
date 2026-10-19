-- What the owner's label change MEANT, as distinct from who made it.
--
-- The workflow this serves: the label list is the work queue. The owner opens a
-- label, handles the mail, and removes the label so the list empties. An empty
-- label means that category is done. Reading every removal as a disagreement
-- would fill the correction set with dispositions.
--
--   handled     removal with no OVIS label added in the pairing window.
--               A disposition. Recorded with its timestamp because "this
--               category was cleared on this date" is what the commitment layer
--               will want, but it is NOT training signal.
--   correction  an OVIS label the owner ADDED. Either the category was wrong
--               (paired with a removal) or OVIS had no idea and was told
--               (the message was Unsorted). This is the training signal.
--   superseded  the removal half of a correction pair, kept for history and not
--               counted twice.
--   ovis_write  OVIS's own labelling, attributed and then ignored.
--
-- Classification lags observation by the pairing window, not by the attribution
-- lag: a move is two history records, and the partner event has to have been
-- observed before a removal can be called bare.

ALTER TABLE public.gmail_label_event
  ADD COLUMN IF NOT EXISTS gesture         text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS gesture_note    text,
  ADD COLUMN IF NOT EXISTS gesture_at      timestamptz,
  ADD COLUMN IF NOT EXISTS paired_event_id uuid REFERENCES public.gmail_label_event(id) ON DELETE SET NULL,
  -- Test gestures and other noise: excluded rather than deleted, so the record
  -- of what was discarded survives the discarding.
  ADD COLUMN IF NOT EXISTS excluded        boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS excluded_reason text;

ALTER TABLE public.gmail_label_event
  DROP CONSTRAINT IF EXISTS gmail_label_event_gesture_valid;
ALTER TABLE public.gmail_label_event
  ADD CONSTRAINT gmail_label_event_gesture_valid
  CHECK (gesture IN ('pending', 'handled', 'correction', 'superseded', 'ovis_write'));

-- The training set: what the owner told OVIS, minus anything excluded.
CREATE INDEX IF NOT EXISTS idx_gmail_label_event_corrections
  ON public.gmail_label_event (observed_at DESC)
  WHERE gesture = 'correction' AND excluded = false;

-- The disposition history: what was cleared, and when.
CREATE INDEX IF NOT EXISTS idx_gmail_label_event_handled
  ON public.gmail_label_event (label, observed_at DESC)
  WHERE gesture = 'handled' AND excluded = false;

CREATE INDEX IF NOT EXISTS idx_gmail_label_event_gesture_pending
  ON public.gmail_label_event (observed_at)
  WHERE gesture = 'pending';

COMMENT ON COLUMN public.gmail_label_event.gesture IS
  'What the change meant: handled (disposition), correction (training signal), superseded (removal half of a correction pair), ovis_write (OVIS itself).';
COMMENT ON COLUMN public.gmail_label_event.excluded IS
  'True for rows deliberately kept out of the correction set (test gestures, known noise). Never delete: the record of what was discarded is part of the history.';
