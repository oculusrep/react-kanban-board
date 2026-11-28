-- deal_court_event — structured ball-in-court flip history.
-- Spec: docs/PACKAGE_TRACKER_SPEC.md §5, §9 Q1. Decision 2026-10-12 (Mike): build it,
-- backfill from document_handoff, unknown gate dates are entered once by hand
-- (deal_package.gate1_manual_at / gate2_manual_at).
--
-- Why: deal_activity_state holds only the CURRENT court. The board_history chat
-- lines (20261009172325) are free text, stamped at save time, skipped when
-- auth.uid() is NULL. Package gates need "first flip to their court after LOI
-- entry" and "first flip back", dated by the court's real start.
--
-- effective_at = deal_activity_state.court_since (20261010185423), the court's
-- start date — NOT ball_in_court_since (touches and parking move that) and NOT
-- now() (the report's Court editor back-dates). court_since is set by the BEFORE
-- trigger trg_set_court_since, so this AFTER trigger sees the final value.
--
-- Rules:
--   insert with a court                  → event
--   court changed (incl. cleared → NULL) → event
--   court unchanged, court_since changed → back-date correction: the latest
--                                          board event for that card and court
--                                          takes the new date (inserted if the
--                                          court predates the log)
--   party-only edits, touches, park      → nothing
--
-- Backfill: document_handoff LOI turns (holder ll → them, us → us), dated noon
-- Eastern on the handoff date. source_ref keeps it idempotent. Future
-- document_handoff entries are NOT mirrored — the board court is the live source.
--
-- court_log_start() returns this migration's apply time: board events are only
-- a complete history for LOI windows that began after it (the progress view
-- uses it to decide "not reached" vs "gate date unknown").
--
-- Pipeline-wide like the touch triggers (any deal_activity_state row logs);
-- a row's existence doesn't mean "on the board" or "has a package".
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE TABLE public.deal_court_event (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid REFERENCES public.deal(id) ON DELETE CASCADE,
  site_submit_id  uuid REFERENCES public.site_submit(id) ON DELETE CASCADE,
  court           text CHECK (court IN ('us', 'them', 'none')),   -- NULL = cleared
  party           text,
  effective_at    timestamptz NOT NULL,
  source          text NOT NULL CHECK (source IN ('board', 'document_handoff')),
  source_ref      uuid UNIQUE,                                    -- document_handoff.id for backfill
  recorded_at     timestamptz NOT NULL DEFAULT now(),
  recorded_by     uuid DEFAULT auth.uid(),
  corrected_at    timestamptz,
  CONSTRAINT deal_court_event_has_key CHECK (num_nonnulls(deal_id, site_submit_id) >= 1)
);

CREATE INDEX deal_court_event_deal_idx ON public.deal_court_event (deal_id, effective_at)        WHERE deal_id IS NOT NULL;
CREATE INDEX deal_court_event_site_idx ON public.deal_court_event (site_submit_id, effective_at) WHERE site_submit_id IS NOT NULL;

COMMENT ON TABLE public.deal_court_event IS
  'Ball-in-court flip history. Written by trigger on deal_activity_state (source=board) and backfilled from document_handoff LOI turns. effective_at = court start (court_since).';

-- ─── Log start ──────────────────────────────────────────────────────────────

DO $do$
BEGIN
  EXECUTE format($f$
    CREATE FUNCTION public.court_log_start()
    RETURNS timestamptz
    LANGUAGE sql IMMUTABLE
    SET search_path = public, pg_temp
    AS $b$ SELECT %L::timestamptz $b$
  $f$, now());
END
$do$;

COMMENT ON FUNCTION public.court_log_start() IS
  'When deal_court_event started recording board court changes (migration 20261012161838 apply time).';

REVOKE ALL ON FUNCTION public.court_log_start() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.court_log_start() TO authenticated;

-- ─── Trigger ────────────────────────────────────────────────────────────────

CREATE FUNCTION public.log_court_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated int;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.ball_in_court IS NOT NULL THEN
      INSERT INTO deal_court_event (deal_id, site_submit_id, court, party, effective_at, source)
      VALUES (NEW.deal_id, NEW.site_submit_id, NEW.ball_in_court, NEW.ball_in_court_party,
              COALESCE(NEW.court_since, now()), 'board');
    END IF;

  ELSIF NEW.ball_in_court IS DISTINCT FROM OLD.ball_in_court THEN
    INSERT INTO deal_court_event (deal_id, site_submit_id, court, party, effective_at, source)
    VALUES (NEW.deal_id, NEW.site_submit_id, NEW.ball_in_court, NEW.ball_in_court_party,
            COALESCE(NEW.court_since, now()), 'board');

  ELSIF NEW.ball_in_court IS NOT NULL
        AND NEW.court_since IS DISTINCT FROM OLD.court_since
        AND NEW.court_since IS NOT NULL THEN
    -- Back-date correction of the current court.
    UPDATE deal_court_event e
       SET effective_at = NEW.court_since,
           corrected_at = now()
     WHERE e.id = (
       SELECT e2.id FROM deal_court_event e2
        WHERE e2.source = 'board'
          AND e2.court = NEW.ball_in_court
          AND ((NEW.deal_id IS NOT NULL AND e2.deal_id = NEW.deal_id)
            OR (NEW.site_submit_id IS NOT NULL AND e2.site_submit_id = NEW.site_submit_id))
        ORDER BY e2.recorded_at DESC
        LIMIT 1);
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      INSERT INTO deal_court_event (deal_id, site_submit_id, court, party, effective_at, source)
      VALUES (NEW.deal_id, NEW.site_submit_id, NEW.ball_in_court, NEW.ball_in_court_party,
              NEW.court_since, 'board');
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

-- Trigger-only: nobody calls it directly.
REVOKE ALL ON FUNCTION public.log_court_event() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_log_court_event_insert
  AFTER INSERT ON public.deal_activity_state
  FOR EACH ROW
  WHEN (NEW.ball_in_court IS NOT NULL)
  EXECUTE FUNCTION public.log_court_event();

CREATE TRIGGER trg_log_court_event_update
  AFTER UPDATE ON public.deal_activity_state
  FOR EACH ROW
  WHEN (OLD.ball_in_court IS DISTINCT FROM NEW.ball_in_court
        OR OLD.court_since IS DISTINCT FROM NEW.court_since)
  EXECUTE FUNCTION public.log_court_event();

-- ─── Backfill from document_handoff (LOI turns only) ────────────────────────

INSERT INTO public.deal_court_event
  (deal_id, site_submit_id, court, party, effective_at, source, source_ref, recorded_by)
SELECT dh.deal_id,
       d.site_submit_id,
       CASE dh.holder WHEN 'll' THEN 'them' ELSE 'us' END,
       CASE dh.holder WHEN 'll' THEN 'Landlord' END,
       (dh.changed_at::timestamp + interval '12 hours') AT TIME ZONE 'America/New_York',
       'document_handoff',
       dh.id,
       dh.changed_by
  FROM public.document_handoff dh
  JOIN public.deal d ON d.id = dh.deal_id
 WHERE dh.document_type = 'LOI'
   AND dh.holder IN ('ll', 'us')
ON CONFLICT (source_ref) DO NOTHING;

-- ─── RLS + grants ───────────────────────────────────────────────────────────

ALTER TABLE public.deal_court_event ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_court_event_select_internal ON public.deal_court_event
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Read-only to the app; only the trigger (definer) and this backfill write.
REVOKE ALL ON public.deal_court_event FROM anon, authenticated;
GRANT SELECT ON public.deal_court_event TO authenticated;
