-- Record label REMOVALS as well as applications.
--
-- Nothing in OVIS could unlabel anything, which made every labelling mistake
-- permanent until fixed by hand in Gmail. Removal is now possible, and it is
-- scoped by this table: a label may only be removed from a message if
-- email_label says OVIS applied it there. A label the owner created by hand has
-- no row here and is therefore untouchable by definition, not by convention.
--
-- The row is kept after removal rather than deleted: "OVIS applied this and then
-- took it back" is exactly the history worth having when a labelling rule turns
-- out to be wrong.

ALTER TABLE public.email_label
  ADD COLUMN IF NOT EXISTS removed_at   timestamptz,
  ADD COLUMN IF NOT EXISTS remove_error text;

COMMENT ON COLUMN public.email_label.removed_at IS
  'Set when OVIS removed this label from the message in Gmail. applied_at IS NOT NULL AND removed_at IS NULL means the label is believed to be live.';

-- The live set: applied, not since removed. This is what the reconcile pass
-- diffs against, and what any future archive step must read.
CREATE INDEX IF NOT EXISTS idx_email_label_live
  ON public.email_label (gmail_connection_id, label)
  WHERE applied_at IS NOT NULL AND removed_at IS NULL;
