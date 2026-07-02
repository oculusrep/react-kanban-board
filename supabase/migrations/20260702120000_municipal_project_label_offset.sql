-- Per-project label offset so users can drag the on-map units label off the pin
-- to keep it readable when pins cluster. Offsets are pixel deltas from the
-- centroid at any zoom (converted to lat/lng at render time so the label stays
-- pinned to a fixed screen offset regardless of zoom). NULL = no offset saved
-- (label sits at default position under the pin tip).

alter table public.municipal_project
  add column if not exists label_offset_x_px integer,
  add column if not exists label_offset_y_px integer;

comment on column public.municipal_project.label_offset_x_px is
  'Screen-pixel X offset applied to the on-map units label relative to the pin centroid. NULL = default position.';
comment on column public.municipal_project.label_offset_y_px is
  'Screen-pixel Y offset applied to the on-map units label relative to the pin centroid. NULL = default position.';

-- The map layer reads from municipal_project_v (explicit column list), so we
-- need to recreate the view to surface the new fields.
drop view if exists public.municipal_project_v;

create view public.municipal_project_v as
 SELECT mp.id,
    mp.municipality_id,
    mp.address,
    mp.project_name,
    mp.phase_label,
    mp.parcel_numbers,
    mp.single_family_lots,
    mp.townhouse_units,
    mp.duplex_units,
    mp.apt_units,
    mp.cottage_units,
    mp.total_housing_units,
    mp.zoning,
    mp.zoning_approval_date,
    mp.notes,
    mp.raw_stages,
    mp.status_stage_id,
    mp.status_override_id,
    mp.geocoded_address,
    mp.centroid,
    mp.geometry,
    mp.property_id,
    mp.source_import_id,
    mp.source_row_number,
    mp.created_at,
    mp.updated_at,
    mp.source,
    mp.builder_developer,
    mp.permit_url,
    mp.permit_application_date,
    mp.source_research_run_id,
    mp.location_description,
    mp.parcel_boundary_notes,
    mp.created_by_id,
    mp.updated_by_id,
    mp.label_offset_x_px,
    mp.label_offset_y_px,
    st_y(mp.centroid) AS centroid_lat,
    st_x(mp.centroid) AS centroid_lng,
        CASE
            WHEN mp.geometry IS NULL THEN NULL::jsonb
            ELSE st_asgeojson(mp.geometry)::jsonb
        END AS geometry_geojson,
    m.name AS municipality_name,
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
