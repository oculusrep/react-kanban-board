-- 'untracked': an obligation the owner does not want followed, as distinct from
-- one that got done.
--
-- NOTHING IS WRITTEN TO IT AUTOMATICALLY. It exists so that retiring a row
-- later never has to borrow 'handled', which is the only status that records
-- real completion -- stamping untracked noise as "handled" would corrupt the
-- one signal worth keeping.
ALTER TABLE public.commitment DROP CONSTRAINT IF EXISTS commitment_status_check;
ALTER TABLE public.commitment ADD CONSTRAINT commitment_status_check
  CHECK (status IN ('open','handled','flagged','skipped','rejected','untracked'));

COMMENT ON COLUMN public.commitment.status IS
  'open | handled (done, Gmail archived) | flagged | skipped (deferred) | rejected (owner says not a commitment) | untracked (not followed; never set automatically).';
