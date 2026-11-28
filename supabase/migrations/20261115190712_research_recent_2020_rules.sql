-- Recently built pass, 2020 rules (docs/MARKET_RESEARCH_RECENTLY_BUILT.md).
-- Purpose: capture neighborhoods completed since the 2020 Census as new
-- Recently Completed records. Not to validate existing records.
--
-- A community Gemini returns that is already in OVIS (name/address match) is
-- never staged:
--   * Gemini count higher than OVIS's by more than 5% (or OVIS has none) →
--     a pending "replace" suggestion, applied only by one click.
--   * equal / lower / no Gemini count → logged only ('dropped_*').
-- research_recent_log is that log, and also logs new communities dropped for
-- lack of completion evidence.

CREATE TABLE public.research_recent_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id  uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  name             text NOT NULL,
  outcome          text NOT NULL CHECK (outcome IN
                     ('replace_suggested', 'dropped_equal', 'dropped_lower', 'dropped_no_count',
                      'dropped_no_evidence', 'dropped_old_or_small')),
  known_kind       text CHECK (known_kind IN ('committed', 'staged')),
  known_project_id uuid REFERENCES public.municipal_project(id) ON DELETE CASCADE,
  known_staging_id uuid REFERENCES public.municipal_project_staging(id) ON DELETE CASCADE,
  known_name       text,
  ovis_units       int,
  gemini_units     int,
  gemini_source    text,
  year_completed   int,
  detail           text,
  state            text NOT NULL DEFAULT 'logged' CHECK (state IN ('logged', 'pending', 'replaced', 'dismissed')),
  resolved_at      timestamptz,
  resolved_by_id   uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_recent_log_run_idx ON public.research_recent_log (research_run_id);
CREATE INDEX research_recent_log_pending_idx ON public.research_recent_log (state) WHERE state = 'pending';

ALTER TABLE public.research_recent_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY research_recent_log_read ON public.research_recent_log
  FOR SELECT TO authenticated USING ((SELECT public.user_has_market_research_approve_access()));

-- Grants: don't inherit the defaults, state what the app uses. Writes go
-- through the SECURITY DEFINER RPCs below and the service-role edge function.
REVOKE ALL ON public.research_recent_log FROM anon, authenticated;
GRANT SELECT ON public.research_recent_log TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.research_recent_log TO service_role;

-- Lookup: for each candidate {name, address}, the existing OVIS record it
-- matches (committed first, then another run's pending/approved staged row),
-- within the given municipalities. Same match rules as before.
DROP FUNCTION IF EXISTS public.research_recent_known(uuid, boolean);

CREATE FUNCTION public.research_recent_lookup(p_run_id uuid, p_candidates jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_munis uuid[];
  v_names text[];
  c       jsonb;
  m       record;
  v_nkey  text;
  v_akey  text;
  v_out   jsonb := '[]';
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR session_user = 'postgres'
          OR public.user_has_market_research_approve_access()) THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;
  SELECT recent_muni_ids INTO v_munis FROM research_run WHERE id = p_run_id;
  SELECT array_agg(lower(btrim(name))) INTO v_names FROM boundary_municipality WHERE id = ANY(v_munis);

  FOR c IN SELECT * FROM jsonb_array_elements(coalesce(p_candidates, '[]')) LOOP
    v_nkey := public.research_name_key(c->>'name', '');
    v_akey := public.research_address_key(c->>'address');
    m := NULL;
    SELECT 'committed' AS kind, mp.id, mp.project_name, mp.total_housing_units AS units
      INTO m
      FROM municipal_project mp JOIN municipality mm ON mm.id = mp.municipality_id
     WHERE lower(btrim(mm.name)) = ANY(v_names)
       AND (public.research_name_key(mp.project_name, '') = v_nkey
            OR (v_akey ~ '^[0-9]+[a-z]? \S' AND public.research_address_key(mp.address) = v_akey))
     ORDER BY mp.created_at LIMIT 1;
    IF m.id IS NULL THEN
      SELECT 'staged' AS kind, o.id, o.project_name, o.total_housing_units AS units
        INTO m
        FROM municipal_project_staging o
       WHERE o.research_run_id <> p_run_id AND o.approval_state IN ('pending', 'approved')
         AND o.boundary_municipality_id = ANY(v_munis)
         AND (public.research_name_key(o.project_name, '') = v_nkey
              OR (v_akey ~ '^[0-9]+[a-z]? \S' AND public.research_address_key(o.address) = v_akey))
       ORDER BY o.created_at LIMIT 1;
    END IF;
    v_out := v_out || jsonb_build_object('key', c->>'key',
      'known_kind', m.kind, 'known_id', m.id, 'known_name', m.project_name, 'ovis_units', m.units);
  END LOOP;
  RETURN v_out;
END;
$function$;
REVOKE ALL ON FUNCTION public.research_recent_lookup(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_recent_lookup(uuid, jsonb) TO authenticated, service_role;

-- One-click Replace: OVIS X → Gemini Y on the existing record. Only touches
-- the record's total and its confidence; notes record what changed.
CREATE FUNCTION public.research_recent_apply_replace(p_log_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  l      research_recent_log;
  v_note text;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;
  SELECT * INTO l FROM research_recent_log WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found: %', p_log_id; END IF;
  IF l.state <> 'pending' THEN RAISE EXCEPTION 'suggestion is %, not pending', l.state; END IF;

  v_note := format('[Units %s] OVIS %s → %s (recently built pass, Gemini: %s)',
                   to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD'),
                   coalesce(l.ovis_units::text, 'none'), l.gemini_units, coalesce(l.gemini_source, 'no source'));
  IF l.known_kind = 'committed' THEN
    UPDATE municipal_project SET total_housing_units = l.gemini_units, units_confidence = 'reported',
           notes = concat_ws(E'\n', nullif(notes, ''), v_note), updated_at = now()
     WHERE id = l.known_project_id;
  ELSE
    UPDATE municipal_project_staging SET total_housing_units = l.gemini_units, units_confidence = 'reported',
           notes = concat_ws(E'\n', nullif(notes, ''), v_note), updated_at = now()
     WHERE id = l.known_staging_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'the existing record is gone'; END IF;

  UPDATE research_recent_log SET state = 'replaced', resolved_at = now(), resolved_by_id = auth.uid() WHERE id = p_log_id;
  RETURN jsonb_build_object('id', p_log_id, 'state', 'replaced', 'units', l.gemini_units);
END;
$function$;
REVOKE ALL ON FUNCTION public.research_recent_apply_replace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_recent_apply_replace(uuid) TO authenticated;

CREATE FUNCTION public.research_recent_dismiss(p_log_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;
  UPDATE research_recent_log SET state = 'dismissed', resolved_at = now(), resolved_by_id = auth.uid()
   WHERE id = p_log_id AND state = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'no pending suggestion %', p_log_id; END IF;
  RETURN jsonb_build_object('id', p_log_id, 'state', 'dismissed');
END;
$function$;
REVOKE ALL ON FUNCTION public.research_recent_dismiss(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_recent_dismiss(uuid) TO authenticated;
