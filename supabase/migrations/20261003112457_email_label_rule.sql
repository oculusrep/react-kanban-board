-- Sender rules the owner approved, applied by the labeler.
--
-- WHY: Google Alerts has been hand-labelled Reading 22 times and still arrives
-- Unsorted, because corrections accumulated and nothing applied them. 25 of the
-- 141 Unsorted messages come from senders already past the agreed threshold.
--
-- Separate from agent_rules on purpose. agent_rules steers the MODEL (exclusion
-- and domain_mapping, read by getRelevantCorrections and the rule override) and
-- its 'exclusion' type demotes mail. These rules only ever set a Gmail label:
-- they never demote, never delete, and never touch is_relevant. Mixing the two
-- vocabularies in one table is how the 'delete' string survived for months
-- after the behaviour became a demote.
CREATE TABLE IF NOT EXISTS public.email_label_rule (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 'address' matches the sender exactly; 'domain' matches the domain or any
  -- subdomain of it, anchored -- never a substring (the collision class that
  -- demoted 184 real deal emails in September).
  scope         text NOT NULL CHECK (scope IN ('address', 'domain')),
  pattern       text NOT NULL,
  label         text NOT NULL,

  -- active: applied by the labeler. rejected: never propose again.
  -- disabled: was active, owner turned it off; stops applying immediately and
  -- the reconcile pass lifts the labels it had applied to inbox mail.
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'rejected', 'disabled')),

  -- The evidence at approval time, frozen. A rule must stay explainable even
  -- after the corrections behind it are archived or re-labelled.
  corrections_total integer NOT NULL DEFAULT 0,
  wrong_count       integer NOT NULL DEFAULT 0,
  silent_count      integer NOT NULL DEFAULT 0,
  rationale         text,

  created_by_user_id uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz,
  decided_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_label_rule_unique_pattern
  ON public.email_label_rule (scope, lower(pattern));

CREATE INDEX IF NOT EXISTS idx_email_label_rule_active
  ON public.email_label_rule (scope, lower(pattern)) WHERE status = 'active';

REVOKE ALL ON public.email_label_rule FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.email_label_rule TO authenticated;
ALTER TABLE public.email_label_rule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_label_rule_select ON public.email_label_rule;
CREATE POLICY email_label_rule_select ON public.email_label_rule
  FOR SELECT TO authenticated USING (public.is_internal_user());
DROP POLICY IF EXISTS email_label_rule_insert ON public.email_label_rule;
CREATE POLICY email_label_rule_insert ON public.email_label_rule
  FOR INSERT TO authenticated WITH CHECK (public.is_internal_user());
DROP POLICY IF EXISTS email_label_rule_update ON public.email_label_rule;
CREATE POLICY email_label_rule_update ON public.email_label_rule
  FOR UPDATE TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

-- ---------------------------------------------------------------------------
-- Proposals. One row per sender or domain that has met the threshold and has
-- no decision yet.
--
-- Thresholds (measured 2026-09-26): 3+ agreeing corrections on one address, or
-- 5+ across 2+ addresses for a domain. Unanimity is required because the 10+
-- bucket was only 51% unanimous -- busy domains mix newsletters with real mail.
--
-- WEIGHTING: 'wrong' corrections (OVIS had a verdict and was overridden) are
-- direct evidence against that verdict; 'silent' ones (OVIS had no opinion)
-- are evidence about the sender only. So a proposal that CONTRADICTS what OVIS
-- currently decides for that sender requires at least one 'wrong' correction
-- behind it; a proposal that merely fills a silence does not.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_label_rule_proposals()
RETURNS TABLE (
  scope text, pattern text, proposed_label text,
  corrections_total bigint, wrong_count bigint, silent_count bigint,
  distinct_addresses bigint, unsorted_now bigint, contradicts boolean, rationale text
)
LANGUAGE sql STABLE SECURITY INVOKER AS $fn$
  WITH corr AS (
    SELECT lower(e.sender_email) AS sender,
           split_part(lower(e.sender_email), '@', 2) AS dom,
           ev.label, ev.correction_kind
    FROM public.gmail_label_event ev
    JOIN public.emails e ON e.id = ev.email_id
    WHERE ev.gesture = 'correction'
      AND ev.excluded = false
      AND e.sender_email IS NOT NULL
      -- never propose on our own senders: that mail is genuinely mixed
      -- (mike@ contradicted itself 8 times and was right to)
      AND split_part(lower(e.sender_email), '@', 2) <> 'oculusrep.com'
  ),
  by_addr AS (
    SELECT 'address'::text AS scope, sender AS pattern, min(label) AS proposed_label,
           count(*) AS corrections_total,
           count(*) FILTER (WHERE correction_kind = 'wrong') AS wrong_count,
           count(*) FILTER (WHERE correction_kind = 'silent') AS silent_count,
           1::bigint AS distinct_addresses
    FROM corr GROUP BY sender
    HAVING count(DISTINCT label) = 1 AND count(*) >= 3
  ),
  by_dom AS (
    SELECT 'domain'::text AS scope, dom AS pattern, min(label) AS proposed_label,
           count(*) AS corrections_total,
           count(*) FILTER (WHERE correction_kind = 'wrong') AS wrong_count,
           count(*) FILTER (WHERE correction_kind = 'silent') AS silent_count,
           count(DISTINCT sender) AS distinct_addresses
    FROM corr GROUP BY dom
    HAVING count(DISTINCT label) = 1 AND count(*) >= 5 AND count(DISTINCT sender) >= 2
  ),
  cand AS (SELECT * FROM by_addr UNION ALL SELECT * FROM by_dom)
  SELECT c.scope, c.pattern, c.proposed_label,
         c.corrections_total, c.wrong_count, c.silent_count, c.distinct_addresses,
         -- how many messages this rule would fix right now
         (SELECT count(*) FROM public.email_label el
            JOIN public.emails e2 ON e2.gmail_id = el.gmail_id
           WHERE el.label = 'OVIS/Unsorted' AND el.applied_at IS NOT NULL AND el.removed_at IS NULL
             AND CASE c.scope
                   WHEN 'address' THEN lower(e2.sender_email) = c.pattern
                   ELSE split_part(lower(e2.sender_email), '@', 2) = c.pattern
                      OR split_part(lower(e2.sender_email), '@', 2) LIKE '%.' || c.pattern
                 END) AS unsorted_now,
         (c.wrong_count > 0) AS contradicts,
         format('You have moved mail from %s to %s %s time%s%s.',
                c.pattern, replace(c.proposed_label, 'OVIS/', ''), c.corrections_total,
                CASE WHEN c.corrections_total = 1 THEN '' ELSE 's' END,
                CASE WHEN c.wrong_count > 0
                     THEN format(' (%s of those overrode an OVIS verdict)', c.wrong_count)
                     ELSE ' (OVIS had no opinion on any of them)' END) AS rationale
  FROM cand c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.email_label_rule r
     WHERE r.scope = c.scope AND lower(r.pattern) = c.pattern
       AND r.status IN ('active', 'rejected')
  )
  -- a proposal that contradicts an OVIS verdict needs 'wrong' evidence behind it
  AND (c.wrong_count > 0 OR c.silent_count = c.corrections_total)
  ORDER BY c.wrong_count DESC, c.corrections_total DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals() TO authenticated;
