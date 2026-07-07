-- Per-stage polygon LINE color for municipal projects.
--
-- Adds project_stage.line_color and re-creates municipal_project_v so the map
-- layer can read effective_stage_line_color alongside effective_stage_color.
-- NULL line_color means "use the fill color" (existing behavior).

ALTER TABLE public.project_stage
  ADD COLUMN IF NOT EXISTS line_color TEXT;

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
  ps_eff.color AS effective_stage_color,
  ps_eff.line_color AS effective_stage_line_color
FROM public.municipal_project mp
LEFT JOIN public.municipality m ON m.id = mp.municipality_id
LEFT JOIN public.project_stage ps ON ps.id = mp.status_stage_id
LEFT JOIN public.project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);

GRANT SELECT ON public.municipal_project_v TO authenticated;
