-- Market Research — record WHY a staging row was rejected.
--
-- Rejected rows are soft-deleted (approval_state='rejected', kept forever for
-- audit — see 20260606130000), so the data always survived. What did not
-- survive was the reason. Six months later a rejected row is indistinguishable
-- from a mistake, and the only way to find out why it was killed is to ask
-- whoever clicked the button.
--
-- This matters most for the case that motivated it: killing a whole run's worth
-- of rows because the run died mid-flight. Without a recorded reason that is
-- exactly the silent hole the kill was supposed to prevent — a truncated window
-- with no marker saying it was truncated.
--
-- Design:
--   * reject_research_staging_row(id, reason DEFAULT NULL) — reason OPTIONAL.
--     A reviewer dismissing one bad dedupe row on a triage screen should not
--     have to write prose; forcing it there would just produce "dup" 400 times.
--   * reject_research_staging_rows(ids[], reason)  — reason REQUIRED and
--     non-blank. Killing a batch is a decision about a whole window and is
--     precisely the thing nobody remembers later. The reason is recorded once
--     for the batch rather than retyped per row.
--
-- Also captures who and when, which the previous reject path did not.

-- ---- 1: columns ----------------------------------------------------------
ALTER TABLE public.municipal_project_staging
  ADD COLUMN IF NOT EXISTS reject_reason  text,
  ADD COLUMN IF NOT EXISTS rejected_by_id uuid REFERENCES public."user"(id),
  ADD COLUMN IF NOT EXISTS rejected_at    timestamptz;

COMMENT ON COLUMN public.municipal_project_staging.reject_reason IS
  'Free-text reason this row was rejected. Optional on single-row rejects, REQUIRED on bulk rejects (reject_research_staging_rows). NULL on rows rejected before 2026-09-01, and on single rejects where the reviewer gave no reason.';
COMMENT ON COLUMN public.municipal_project_staging.rejected_by_id IS
  'public."user".id of whoever rejected the row. NULL for rows rejected before 2026-09-01.';
COMMENT ON COLUMN public.municipal_project_staging.rejected_at IS
  'When the row was rejected. NULL for rows rejected before 2026-09-01.';

-- ---- 2: single-row reject — reason optional ------------------------------
-- DROP the 1-arg form rather than leaving it alongside a defaulted 2-arg one:
-- both would be resolvable by the same single-argument call and PostgREST
-- would 300 on the ambiguity. Same pattern as submit_research_report.
DROP FUNCTION IF EXISTS public.reject_research_staging_row(uuid);

CREATE OR REPLACE FUNCTION public.reject_research_staging_row(
  p_staging_id uuid,
  p_reason     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did      boolean;
  v_run_id   uuid;
  v_pending  int;
  v_reviewed boolean := false;
  v_user_id  uuid;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  SELECT id INTO v_user_id FROM "user" WHERE auth_user_id = auth.uid();

  UPDATE municipal_project_staging
     SET approval_state = 'rejected',
         reject_reason  = NULLIF(btrim(COALESCE(p_reason, '')), ''),
         rejected_by_id = v_user_id,
         rejected_at    = now()
   WHERE id = p_staging_id AND approval_state = 'pending'
   RETURNING research_run_id INTO v_run_id;
  v_did := FOUND;

  -- Last pending row gone on an awaiting_review run => fully reviewed, nothing
  -- to commit. Move it terminal so it stops showing as awaiting review.
  IF v_did AND v_run_id IS NOT NULL THEN
    SELECT count(*) INTO v_pending
      FROM municipal_project_staging
     WHERE research_run_id = v_run_id AND approval_state = 'pending';
    IF v_pending = 0 THEN
      UPDATE research_run
         SET state = 'archived', completed_at = COALESCE(completed_at, now())
       WHERE id = v_run_id AND state = 'awaiting_review';
      v_reviewed := FOUND;
    END IF;
  END IF;

  RETURN jsonb_build_object('rejected', v_did, 'run_reviewed', v_reviewed);
END;
$$;

REVOKE ALL ON FUNCTION public.reject_research_staging_row(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_research_staging_row(uuid, text) TO authenticated, service_role;

-- ---- 3: bulk reject — reason REQUIRED ------------------------------------
-- Deliberately not a loop over the single-row function: the reason is stated
-- once for the batch, and the run close-out is evaluated once at the end rather
-- than re-checked per row. Spans runs, so killing two overlapping runs in one
-- action (the case this was built for) works and closes both.
CREATE OR REPLACE FUNCTION public.reject_research_staging_rows(
  p_staging_ids uuid[],
  p_reason      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rejected int := 0;
  v_user_id  uuid;
  v_reason   text;
  v_runs     uuid[];
  v_closed   uuid[] := '{}';
  v_run      uuid;
  v_pending  int;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  IF p_staging_ids IS NULL OR array_length(p_staging_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_staging_ids must be a non-empty uuid[]';
  END IF;

  -- The whole point of the bulk path. A batch reject without a reason is the
  -- silent hole this migration exists to close, so refuse it outright rather
  -- than recording an empty string.
  v_reason := NULLIF(btrim(COALESCE(p_reason, '')), '');
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'reject_reason_required: bulk reject must state a reason (single-row reject_research_staging_row allows an optional one)';
  END IF;

  SELECT id INTO v_user_id FROM "user" WHERE auth_user_id = auth.uid();

  WITH upd AS (
    UPDATE municipal_project_staging
       SET approval_state = 'rejected',
           reject_reason  = v_reason,
           rejected_by_id = v_user_id,
           rejected_at    = now()
     WHERE id = ANY(p_staging_ids)
       AND approval_state = 'pending'
    RETURNING research_run_id
  )
  SELECT count(*), array_agg(DISTINCT research_run_id)
    INTO v_rejected, v_runs
    FROM upd;

  -- Close out every touched run that now has nothing pending.
  IF v_runs IS NOT NULL THEN
    FOREACH v_run IN ARRAY v_runs LOOP
      SELECT count(*) INTO v_pending
        FROM municipal_project_staging
       WHERE research_run_id = v_run AND approval_state = 'pending';
      IF v_pending = 0 THEN
        UPDATE research_run
           SET state = 'archived', completed_at = COALESCE(completed_at, now())
         WHERE id = v_run AND state = 'awaiting_review';
        IF FOUND THEN
          v_closed := v_closed || v_run;
        END IF;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'rejected',     v_rejected,
    'reason',       v_reason,
    'runs_touched', COALESCE(v_runs, '{}'),
    'runs_closed',  v_closed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_research_staging_rows(uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_research_staging_rows(uuid[], text) TO authenticated, service_role;

-- ---- 4: unreject clears the reject metadata ------------------------------
-- A row returning to 'pending' is no longer rejected, so carrying a stale
-- reason on it would be actively misleading in the UI and in any audit query.
CREATE OR REPLACE FUNCTION public.unreject_research_staging_row(p_staging_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_did      boolean;
  v_run_id   uuid;
  v_reopened boolean := false;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  UPDATE municipal_project_staging
     SET approval_state = 'pending',
         reject_reason  = NULL,
         rejected_by_id = NULL,
         rejected_at    = NULL
   WHERE id = p_staging_id AND approval_state = 'rejected'
   RETURNING research_run_id INTO v_run_id;
  v_did := FOUND;

  -- The run has a pending row again -> pull it back out of its terminal state so
  -- it re-surfaces in the review queue. completed_at is left as-is (audit trail).
  IF v_did AND v_run_id IS NOT NULL THEN
    UPDATE research_run
       SET state = 'awaiting_review'
     WHERE id = v_run_id AND state IN ('archived', 'approved');
    v_reopened := FOUND;
  END IF;

  RETURN jsonb_build_object('unrejected', v_did, 'run_reopened', v_reopened);
END;
$$;

REVOKE ALL ON FUNCTION public.unreject_research_staging_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unreject_research_staging_row(uuid) TO authenticated, service_role;

-- ---- 5: expose the reason to the sweep approval view ---------------------
DROP FUNCTION IF EXISTS public.get_sweep_staging(uuid);

CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
RETURNS TABLE(
  id uuid, research_run_id uuid, sweep_chunk_index integer,
  boundary_municipality_id uuid, muni_name text, muni_kind text,
  matched_existing_id uuid, approval_state text, project_name text, address text,
  location_description text, parcel_boundary_notes text, total_housing_units integer,
  builder_developer text, permit_url text, permit_application_date date,
  source text, discovery_source text, discovery_source_raw text, notes text,
  reject_reason text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.research_run_id, r.sweep_chunk_index,
    s.boundary_municipality_id, bm.name, bm.kind,
    s.matched_existing_id, s.approval_state,
    s.project_name, s.address, s.location_description, s.parcel_boundary_notes,
    s.total_housing_units, s.builder_developer, s.permit_url,
    s.permit_application_date, s.source, s.discovery_source, s.discovery_source_raw,
    s.notes, s.reject_reason
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated;
