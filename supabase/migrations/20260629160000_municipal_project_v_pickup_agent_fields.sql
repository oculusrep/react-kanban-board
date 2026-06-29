-- Recreate municipal_project_v so it picks up the agent-added columns from
-- Phase B (20260606130000): source, builder_developer, permit_url,
-- permit_application_date, source_research_run_id.
--
-- The view uses `SELECT mp.*` but Postgres materializes the column list at
-- view-creation time — columns ALTER'd onto the base table afterward don't
-- appear in the view until it's dropped and recreated. Same select shape as
-- 20260525002652_recreate_municipal_project_v_with_geojson, just refreshed.

DROP VIEW IF EXISTS public.municipal_project_v;

CREATE VIEW public.municipal_project_v
WITH (security_invoker = true) AS
SELECT
  mp.*,
  ST_Y(mp.centroid) AS centroid_lat,
  ST_X(mp.centroid) AS centroid_lng,
  CASE WHEN mp.geometry IS NULL THEN NULL ELSE ST_AsGeoJSON(mp.geometry)::jsonb END AS geometry_geojson,
  m.name  AS municipality_name,
  m.state AS municipality_state,
  m.display_color AS municipality_display_color,
  ps.name AS computed_stage_name,
  COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
  ps_eff.name AS effective_stage_name,
  ps_eff.color AS effective_stage_color
FROM public.municipal_project mp
LEFT JOIN public.municipality m ON m.id = mp.municipality_id
LEFT JOIN public.project_stage ps ON ps.id = mp.status_stage_id
LEFT JOIN public.project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);

GRANT SELECT ON public.municipal_project_v TO authenticated;
