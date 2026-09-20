-- Placement state + polygon provenance for municipal_project.
--
-- Three things at once, because they all touch municipal_project_v and splitting
-- them would mean rebuilding the view three times:
--
--  1. UNPLACED as a first-class state. A vague address (a county/city centroid, or
--     a road centroid) must no longer be written as if it were the project's
--     location. centroid IS NULL is the single source of truth for "unplaced";
--     unplaced_reason says why. An unplaced record is a COMPLETE record in every
--     other respect — it opens the same card and can be placed by hand.
--
--  2. Polygon provenance: hand-drawn vs fetched-from-parcel-fabric vs fetched-then-
--     adjusted, plus which parcels were fetched and when.
--
--  3. geometry widened POLYGON -> MULTIPOLYGON, so a non-contiguous multi-parcel
--     union can be stored. Verified before writing this: the POLYGON typmod
--     rejects a MultiPolygon outright ("Geometry type (MultiPolygon) does not
--     match column type (Polygon)"), and MunicipalProjectLayer's
--     polygonPathsFromGeoJson already renders MultiPolygon, so only the column
--     was in the way.
--
-- No data is destroyed here: every existing centroid and geometry is kept, and
-- existing rows are classified by what they already are.

-- ---------------------------------------------------------------------------
-- 1. geometry POLYGON -> MULTIPOLYGON
-- ---------------------------------------------------------------------------
-- municipal_project_v selects mp.geometry, and Postgres refuses to alter the type
-- of a column a view depends on ("cannot alter type of a column used by a view or
-- rule"). Drop it here and recreate it in step 5 from the live definition.
DROP VIEW IF EXISTS municipal_project_v;

-- ST_Multi is a no-op wrapper on an already-single polygon, so this preserves
-- every existing shape exactly (vertices, holes, winding).
ALTER TABLE municipal_project
  ALTER COLUMN geometry TYPE geometry(MultiPolygon, 4326)
  USING ST_Multi(geometry);

-- ---------------------------------------------------------------------------
-- 2. placement columns
-- ---------------------------------------------------------------------------
ALTER TABLE municipal_project
  -- How the pin was derived. NULL exactly when the record is unplaced.
  --   address_geocode = a precise geocode (ROOFTOP / RANGE_INTERPOLATED)
  --   polygon         = ST_PointOnSurface of the project's polygon
  --   manual_pin      = the reviewer dropped it by hand
  ADD COLUMN IF NOT EXISTS centroid_source text,
  -- Why there is no pin. NULL exactly when the record IS placed.
  --   admin_area_centroid = Google returned APPROXIMATE: a county / city / zip
  --                         centroid. This is the fabricated-coordinate defect.
  --   road_centroid       = Google returned GEOMETRIC_CENTER: a road segment
  --                         centre. Every project on the road collapses to one
  --                         point, which is why the dedupe already skips these.
  --   geocode_failed      = the geocoder returned no result at all
  --   no_address          = nothing to geocode
  ADD COLUMN IF NOT EXISTS unplaced_reason text;

ALTER TABLE municipal_project
  ADD CONSTRAINT municipal_project_centroid_source_check
    CHECK (centroid_source IS NULL
           OR centroid_source IN ('address_geocode','polygon','manual_pin')),
  ADD CONSTRAINT municipal_project_unplaced_reason_check
    CHECK (unplaced_reason IS NULL
           OR unplaced_reason IN ('admin_area_centroid','road_centroid',
                                  'geocode_failed','no_address'));
-- The coherence constraints are added AFTER the backfill (step 4). A CHECK added
-- NOT VALID still fires on every row the backfill touches, and the backfill sets
-- geometry_source before centroid_source — so adding them here fails on the first
-- updated row.

-- ---------------------------------------------------------------------------
-- 3. polygon provenance columns
-- ---------------------------------------------------------------------------
ALTER TABLE municipal_project
  --   hand_drawn            = drawn in the app
  --   parcel_fetch          = pulled from a county parcel fabric, untouched
  --   parcel_fetch_adjusted = pulled, then edited by hand (never re-fetched over)
  ADD COLUMN IF NOT EXISTS geometry_source text,
  -- The parcel ids that ACTUALLY resolved and were unioned. Deliberately not the
  -- same as parcel_numbers: a retired parcel id is in parcel_numbers and not here,
  -- and that difference is the diagnosis when a boundary looks wrong.
  ADD COLUMN IF NOT EXISTS geometry_source_parcels text[],
  -- Which nightly fabric the shape came from. Recorded for diagnosis only — there
  -- is deliberately NO refetch: a re-plat would overwrite a correct boundary.
  ADD COLUMN IF NOT EXISTS geometry_fetched_at timestamptz,
  -- Acreage validation. stated = parsed from parcel_boundary_notes, computed =
  -- ST_Area of the union. A gap beyond the tolerance is the retired-parcel-id
  -- signal (the fabric gave us the wrong or an incomplete set of parcels).
  ADD COLUMN IF NOT EXISTS geometry_stated_acres numeric,
  ADD COLUMN IF NOT EXISTS geometry_computed_acres numeric,
  ADD COLUMN IF NOT EXISTS geometry_needs_review boolean NOT NULL DEFAULT false,
  -- Set the first time a human looks at a fetched boundary. Drives the dashed
  -- stroke: dashed until reviewed, solid after.
  ADD COLUMN IF NOT EXISTS geometry_reviewed_at timestamptz;

ALTER TABLE municipal_project
  ADD CONSTRAINT municipal_project_geometry_source_check
    CHECK (geometry_source IS NULL
           OR geometry_source IN ('hand_drawn','parcel_fetch','parcel_fetch_adjusted'));

COMMENT ON COLUMN municipal_project.unplaced_reason IS
  'Why this record has no pin. NULL when placed. Unplaced records are complete in '
  'every other respect and are placed by drawing a polygon or dropping a pin.';
COMMENT ON COLUMN municipal_project.geometry_source_parcels IS
  'Parcel ids that actually resolved against the county fabric and were unioned. '
  'Differs from parcel_numbers when an id was retired by a re-plat.';
COMMENT ON COLUMN municipal_project.geometry_fetched_at IS
  'Fabric date the shape came from. Diagnostic only — fetch happens once, at '
  'creation. There is no refetch: a re-plat would overwrite a correct boundary.';

-- ---------------------------------------------------------------------------
-- 4. classify what already exists
-- ---------------------------------------------------------------------------
-- Every current polygon was drawn by hand (the only writer until now was
-- MunicipalProjectDrawer).
UPDATE municipal_project
   SET geometry_source = 'hand_drawn'
 WHERE geometry IS NOT NULL AND geometry_source IS NULL;

-- Every current pin came from the commit-time address geocode. Rows whose pin was
-- actually fabricated from a vague address are unplaced by the NEXT migration,
-- which carries the re-geocoded precision for each one.
UPDATE municipal_project
   SET centroid_source = 'address_geocode'
 WHERE centroid IS NOT NULL AND centroid_source IS NULL;

-- Any row that somehow has no centroid predates this and has no recorded reason.
UPDATE municipal_project
   SET unplaced_reason = 'geocode_failed'
 WHERE centroid IS NULL AND unplaced_reason IS NULL;

-- Now that every row is classified, the invariants can go on validated: a row is
-- placed (centroid + source, no reason) or unplaced (neither, with a reason) —
-- never both, never neither; and a shape must say where it came from, with the
-- provenance never outliving the shape.
ALTER TABLE municipal_project
  ADD CONSTRAINT municipal_project_placement_coherent
    CHECK (
      (centroid IS NOT NULL AND centroid_source IS NOT NULL AND unplaced_reason IS NULL)
      OR
      (centroid IS NULL AND centroid_source IS NULL AND unplaced_reason IS NOT NULL)
    ),
  ADD CONSTRAINT municipal_project_geometry_source_coherent
    CHECK ((geometry IS NULL) = (geometry_source IS NULL));

-- Unplaced records are a worklist, and the map layer filters on placement.
CREATE INDEX IF NOT EXISTS municipal_project_unplaced_idx
  ON municipal_project (unplaced_reason) WHERE centroid IS NULL;
CREATE INDEX IF NOT EXISTS municipal_project_geometry_review_idx
  ON municipal_project (geometry_needs_review) WHERE geometry_needs_review;

-- ---------------------------------------------------------------------------
-- 5. rebuild municipal_project_v
-- ---------------------------------------------------------------------------
-- Rebuilt from the LIVE definition (pg_get_viewdef) as of 2026-09-20, not from an
-- older migration file — the column list below was expanded from mp.* at creation
-- time, so new columns do not appear until the view is recreated. Everything the
-- previous definition exposed is preserved verbatim; the new columns and three
-- derived fields are appended. (The DROP happened in step 1 — the column type
-- change could not proceed while the view depended on mp.geometry.)
CREATE VIEW municipal_project_v AS
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
    mp.discovery_source,
    mp.discovery_source_raw,
    -- new: placement + polygon provenance
    mp.centroid_source,
    mp.unplaced_reason,
    mp.geometry_source,
    mp.geometry_source_parcels,
    mp.geometry_fetched_at,
    mp.geometry_stated_acres,
    mp.geometry_computed_acres,
    mp.geometry_needs_review,
    mp.geometry_reviewed_at,
    st_y(mp.centroid) AS centroid_lat,
    st_x(mp.centroid) AS centroid_lng,
        CASE
            WHEN mp.geometry IS NULL THEN NULL::jsonb
            ELSE st_asgeojson(mp.geometry)::jsonb
        END AS geometry_geojson,
    -- derived: the unplaced worklist flag, so callers never re-derive it
    (mp.centroid IS NULL) AS is_unplaced,
    -- derived: signed % difference between the fetched boundary's area and the
    -- acreage the source stated. Positive = we fetched more land than stated.
    CASE
      WHEN mp.geometry_stated_acres IS NULL OR mp.geometry_stated_acres = 0
        OR mp.geometry_computed_acres IS NULL THEN NULL::numeric
      ELSE round(((mp.geometry_computed_acres - mp.geometry_stated_acres)
                  / mp.geometry_stated_acres * 100)::numeric, 1)
    END AS geometry_area_variance_pct,
    -- derived: a fetched boundary is dashed until a human has looked at it
    (mp.geometry IS NOT NULL
     AND mp.geometry_source IN ('parcel_fetch','parcel_fetch_adjusted')
     AND mp.geometry_reviewed_at IS NULL) AS geometry_unreviewed,
    m.name AS municipality_name,
    m.state AS municipality_state,
    m.display_color AS municipality_display_color,
    ps.name AS computed_stage_name,
    COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
    ps_eff.name AS effective_stage_name,
    ps_eff.color AS effective_stage_color,
    ps_eff.line_color AS effective_stage_line_color
   FROM municipal_project mp
     LEFT JOIN municipality m ON m.id = mp.municipality_id
     LEFT JOIN project_stage ps ON ps.id = mp.status_stage_id
     LEFT JOIN project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);

-- DROP VIEW discards the view's grants, so restore exactly what was on it before
-- this migration (checked against information_schema.role_table_grants): the
-- Supabase default grant-all to anon / authenticated / service_role. Granting
-- only SELECT here would silently narrow access.
GRANT ALL ON municipal_project_v TO anon, authenticated, service_role;
