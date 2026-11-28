-- Parcel-fetch safety net, before Hall goes live:
--
-- 1. extract_stated_acres() reads the phrasings it missed on Hall records:
--      "84.25 approx. acres" · "29.52-acre parcel" · "combined 116.47± acres"
--    plus "±", "acre" singular and thousands separators ("1,277.621 acres").
--    A figure tied to "combined" wins over an earlier per-parcel figure
--    ("20.02 acres … and … (10 acres); approx 30 acres combined" → 30);
--    otherwise the first figure, as before. Ranges still return NULL.
--
-- 2. A fetch for a record whose parcel_boundary_notes cite a PARTIAL parcel
--    ("(pt.)", "pt.", "partial", "portion of", "part of … parcel") is always flagged for
--    review, whatever the acreage says: the county returns the whole parcel,
--    so the boundary is wrong by construction.
--
-- 3. Grants: both polygon-writing SECURITY DEFINER RPCs were executable by anon.
--    The browser calls them signed in; nothing calls them pre-auth.
--
-- Both functions rebuilt from pg_get_functiondef on 2026-11-12, not from older
-- migrations. Signatures unchanged.

CREATE OR REPLACE FUNCTION public.extract_stated_acres(p_text text)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  m text[];
  -- number, optional ±, optional "approx.", optional hyphen, "acre(s)"
  c_fig  constant text :=
    '([0-9][0-9,]*(?:\.[0-9]+)?)\s*(?:\+/-|±)?\s*(?:approx(?:\.|imately)?\s*)?-?\s*acres?\M';
BEGIN
  IF p_text IS NULL THEN RETURN NULL; END IF;
  IF p_text ~* '[0-9]+\s*-\s*[0-9]+\s*(\+/-|±)?\s*acres?\M' THEN
    RETURN NULL;   -- a range, not a figure
  END IF;

  -- "combined 116.47± acres" / "116.47 acres combined" / "~30 acres combined"
  SELECT regexp_match(p_text, '\mcombined\s+' || c_fig, 'i') INTO m;
  IF m IS NULL THEN
    SELECT regexp_match(p_text, c_fig || '\s*combined\M', 'i') INTO m;
  END IF;
  IF m IS NULL THEN
    SELECT regexp_match(p_text, c_fig, 'i') INTO m;
  END IF;
  IF m IS NULL THEN RETURN NULL; END IF;
  RETURN replace(m[1], ',', '')::numeric;
END $function$;

-- Partial-parcel language in a polygon hint. Kept separate so the UI and any
-- later check can ask the same question the RPC does.
CREATE OR REPLACE FUNCTION public.cites_partial_parcel(p_text text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
AS $function$
  -- "(pt.)" · "pt." · "partial" · "portion of" · "part of [a|the] [tax] parcel".
  -- Bare "portion" / "part of" are NOT enough: "includes lake on western
  -- portion", "apartment portion", "Part of broader PRD" don't say the parcel
  -- is split.
  SELECT coalesce(p_text, '') ~* '(\(\s*pt\.?\s*\)|\mpt\M\.?|\mpartial\M|\mportion\s+of\M|\mpart\s+of\s+(?:(?:a|the)\s+)?(?:tax\s+)?parcels?\M)'
$function$;

CREATE OR REPLACE FUNCTION public.set_municipal_project_polygon_from_parcels(p_id uuid, p_parts jsonb, p_parcels text[], p_stated_acres numeric DEFAULT NULL::numeric, p_fetched_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_geoms   geometry[];
  v_union   geometry;
  v_acres   numeric := p_stated_acres;
  v_notes   text;
  v_partial boolean;
  v_result  jsonb;
BEGIN
  IF p_parts IS NULL OR jsonb_typeof(p_parts) <> 'array' OR jsonb_array_length(p_parts) = 0 THEN
    RAISE EXCEPTION 'no parcel geometry supplied';
  END IF;

  SELECT parcel_boundary_notes INTO v_notes FROM municipal_project WHERE id = p_id;
  IF v_acres IS NULL THEN
    v_acres := extract_stated_acres(v_notes);
  END IF;
  v_partial := cites_partial_parcel(v_notes);

  SELECT array_agg(ST_SetSRID(ST_GeomFromGeoJSON(part::text), 4326))
    INTO v_geoms
    FROM jsonb_array_elements(p_parts) part;

  v_union := ST_Union(v_geoms);
  IF v_union IS NULL THEN
    RAISE EXCEPTION 'parcel union produced no geometry';
  END IF;

  v_result := set_municipal_project_polygon(
    p_id           => p_id,
    p_geojson      => ST_AsGeoJSON(ST_Multi(v_union))::jsonb,
    p_source       => 'parcel_fetch',
    p_parcels      => p_parcels,
    p_stated_acres => v_acres,
    p_fetched_at   => COALESCE(p_fetched_at, now())
  );

  -- A partial parcel is wrong by construction: the fabric only knows whole
  -- parcels. Flag it even when the acreage happens to agree.
  IF v_partial THEN
    UPDATE municipal_project SET geometry_needs_review = true WHERE id = p_id;
    v_result := v_result || jsonb_build_object('needs_review', true);
  END IF;
  RETURN v_result || jsonb_build_object('partial_parcel', v_partial);
END $function$;

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON FUNCTION public.set_municipal_project_polygon_from_parcels(uuid, jsonb, text[], numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_municipal_project_polygon_from_parcels(uuid, jsonb, text[], numeric, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.set_municipal_project_polygon(uuid, jsonb, text, text[], numeric, timestamptz, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_municipal_project_polygon(uuid, jsonb, text, text[], numeric, timestamptz, boolean) TO authenticated;
REVOKE ALL ON FUNCTION public.cites_partial_parcel(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cites_partial_parcel(text) TO authenticated;
