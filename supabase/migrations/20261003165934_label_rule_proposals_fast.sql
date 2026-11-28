-- Make the proposals query cheap, and make it impossible for a failure to look
-- like "no proposals".
--
-- SYMPTOM: /admin/label-rules showed "Proposed (0) — nothing has reached the
-- threshold yet" while 21 proposals existed. PostgREST returned
-- "canceling statement due to statement timeout" (authenticated = 8s) and the
-- page rendered the error as a clean empty result. Same failure class as every
-- other entry in the spec's §15: a failed check displayed as a negative one.
--
-- WHY IT WAS SLOW: the function was SECURITY INVOKER, so every scan inside it
-- re-evaluated RLS per row -- and emails' policy itself joins email_visibility
-- and subqueries email_object_link, over 27k rows, for an aggregation that
-- touches most of the table. As `postgres` (no RLS) the same query runs in
-- 202ms; the RLS evaluation is the entire cost and it grows with the mailbox.
--
-- CHOSEN FIX: SECURITY DEFINER with an explicit internal-user guard.
--   * It removes the per-row RLS cost, which is the only thing that was
--     growing, rather than caching around it.
--   * It keeps the result LIVE. The owner approves a rule and expects the list
--     to change on the next load; a materialised view or a precomputed table
--     would be stale by up to its refresh interval, and -- worse on this
--     project -- a refresh that silently stopped would again present as "no
--     proposals". Introducing a second thing that can fail quietly to fix a
--     thing that failed quietly is the wrong trade.
--   * The guard is not optional: a non-internal caller gets an exception, not
--     an empty set, so a permission failure also cannot read as zero.
CREATE OR REPLACE FUNCTION public.email_label_rule_proposals()
RETURNS TABLE (
  scope text, pattern text, proposed_label text,
  corrections_total bigint, wrong_count bigint, silent_count bigint,
  distinct_addresses bigint, unsorted_now bigint, contradicts boolean, rationale text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  -- SECURITY DEFINER bypasses RLS, so the caller is checked explicitly. An
  -- exception here surfaces as an error in the UI, never as an empty list.
  -- Accepts internal users AND the backend roles (service_role, psql ops),
  -- which carry no JWT and so have no auth.uid(). Anyone else gets an
  -- exception, never an empty set.
  IF NOT public.email_label_rule_proposals_guard() THEN
    RAISE EXCEPTION 'email_label_rule_proposals: internal users only';
  END IF;

  RETURN QUERY
  WITH corr AS (
    SELECT lower(e.sender_email) AS sender,
           split_part(lower(e.sender_email), '@', 2) AS dom,
           ev.label, ev.correction_kind
    FROM public.gmail_label_event ev
    JOIN public.emails e ON e.id = ev.email_id
    WHERE ev.gesture = 'correction'
      AND ev.excluded = false
      AND e.sender_email IS NOT NULL
      AND split_part(lower(e.sender_email), '@', 2) <> 'oculusrep.com'
  ),
  -- Unsorted counts computed ONCE as an aggregate, not as a correlated
  -- subquery per candidate.
  unsorted AS (
    SELECT lower(e.sender_email) AS sender,
           split_part(lower(e.sender_email), '@', 2) AS dom,
           count(*) AS n
    FROM public.email_label el
    JOIN public.emails e ON e.gmail_id = el.gmail_id
    WHERE el.label = 'OVIS/Unsorted'
      AND el.applied_at IS NOT NULL
      AND el.removed_at IS NULL
      AND e.sender_email IS NOT NULL
    GROUP BY 1, 2
  ),
  by_addr AS (
    SELECT 'address'::text AS scope, c.sender AS pattern, min(c.label) AS proposed_label,
           count(*) AS corrections_total,
           count(*) FILTER (WHERE c.correction_kind = 'wrong') AS wrong_count,
           count(*) FILTER (WHERE c.correction_kind = 'silent') AS silent_count,
           1::bigint AS distinct_addresses,
           coalesce((SELECT sum(u.n) FROM unsorted u WHERE u.sender = c.sender), 0)::bigint AS unsorted_now
    FROM corr c GROUP BY c.sender
    HAVING count(DISTINCT c.label) = 1 AND count(*) >= 3
  ),
  by_dom AS (
    SELECT 'domain'::text AS scope, c.dom AS pattern, min(c.label) AS proposed_label,
           count(*) AS corrections_total,
           count(*) FILTER (WHERE c.correction_kind = 'wrong') AS wrong_count,
           count(*) FILTER (WHERE c.correction_kind = 'silent') AS silent_count,
           count(DISTINCT c.sender) AS distinct_addresses,
           coalesce((SELECT sum(u.n) FROM unsorted u
                      WHERE u.dom = c.dom OR u.dom LIKE '%.' || c.dom), 0)::bigint AS unsorted_now
    FROM corr c GROUP BY c.dom
    HAVING count(DISTINCT c.label) = 1 AND count(*) >= 5 AND count(DISTINCT c.sender) >= 2
  ),
  cand AS (SELECT * FROM by_addr UNION ALL SELECT * FROM by_dom)
  SELECT k.scope, k.pattern, k.proposed_label,
         k.corrections_total, k.wrong_count, k.silent_count, k.distinct_addresses,
         k.unsorted_now,
         (k.wrong_count > 0) AS contradicts,
         format('You have moved mail from %s to %s %s time%s%s.',
                k.pattern, replace(k.proposed_label, 'OVIS/', ''), k.corrections_total,
                CASE WHEN k.corrections_total = 1 THEN '' ELSE 's' END,
                CASE WHEN k.wrong_count > 0
                     THEN format(' (%s of those overrode an OVIS verdict)', k.wrong_count)
                     ELSE ' (OVIS had no opinion on any of them)' END) AS rationale
  FROM cand k
  WHERE NOT EXISTS (
    SELECT 1 FROM public.email_label_rule r
     WHERE r.scope = k.scope AND lower(r.pattern) = k.pattern
       AND r.status IN ('active', 'rejected')
  )
  AND (k.wrong_count > 0 OR k.silent_count = k.corrections_total)
  ORDER BY k.wrong_count DESC, k.corrections_total DESC;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals() TO authenticated;

-- Supporting indexes for the two scans that remain.
CREATE INDEX IF NOT EXISTS idx_gmail_label_event_correction_email
  ON public.gmail_label_event (email_id)
  WHERE gesture = 'correction' AND excluded = false;

CREATE INDEX IF NOT EXISTS idx_email_label_unsorted_live
  ON public.email_label (gmail_id)
  WHERE label = 'OVIS/Unsorted' AND applied_at IS NOT NULL AND removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_emails_gmail_id_sender
  ON public.emails (gmail_id) INCLUDE (sender_email);
