-- Fix the unique index so the watcher's upsert can actually land.
--
-- The index was on (gmail_id, label, event_type, COALESCE(history_id,'')). An
-- ON CONFLICT clause naming the plain columns does not match an expression
-- index, so every insert raised 42P10 and every event was dropped. The error
-- was captured in a variable and never logged, so the function reported
-- events_recorded: 0 -- indistinguishable from "nothing happened". Three days
-- of the owner's hand-tagging were read from Gmail and discarded.
--
-- history_id is always written by the watcher, so a plain unique index is
-- correct and the COALESCE was never needed.
DROP INDEX IF EXISTS public.gmail_label_event_unique;

CREATE UNIQUE INDEX IF NOT EXISTS gmail_label_event_unique
  ON public.gmail_label_event (gmail_id, label, event_type, history_id);
