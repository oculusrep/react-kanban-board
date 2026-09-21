-- Amendments: a record that CHANGES an existing approval rather than describing a
-- new development.
--
-- Deliberately four columns on the record, not a municipal_project_amendment
-- table. The table design models a parent<->amendment relationship, and a scan of
-- the whole corpus found that relationship does not exist in this data: of 19
-- rows matching amend / "additional N units" / "condition N", exactly 2 are
-- genuine unit-changing amendments, and NEITHER has its parent in the database
-- (they amend approvals from ~2018 and ~2021, before any research window we have
-- run). Seven more are "amend conditions of an existing PRD" rows where the
-- record already IS the development at its correct total, and ten are false
-- positives (map amendments, FLUM amendments, prose about existing communities).
--
-- These columns are a strict subset of the table design, so if amendments later
-- start arriving WITH their parents nothing here is wasted.
--
-- Amendments are NOT hidden from the map: both real ones are the only record of
-- their development, so hiding them would erase ~350 units.

-- ---------------------------------------------------------------------------
-- columns
-- ---------------------------------------------------------------------------
-- units_basis is the field that decides sum-vs-replace, and it cannot be
-- recovered reliably from prose — the scan's false-positive rate is the evidence.
-- It says how to read total_housing_units on an amendment row:
--   'delta' = units ADDED to the existing approval  ("35 additional townhomes")
--   'total' = the NEW total, replacing it           ("from 304 to 315")
ALTER TABLE municipal_project
  ADD COLUMN IF NOT EXISTS is_amendment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS units_basis text,
  ADD COLUMN IF NOT EXISTS amends_case_number text,
  ADD COLUMN IF NOT EXISTS prior_total integer;

ALTER TABLE municipal_project_staging
  ADD COLUMN IF NOT EXISTS is_amendment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS units_basis text,
  ADD COLUMN IF NOT EXISTS amends_case_number text,
  ADD COLUMN IF NOT EXISTS prior_total integer;

-- Closed set, and a basis is only meaningful on an amendment. The RPCs normalize
-- rather than rely on the caller, so this constraint cannot bite a writer that
-- supplies units_basis and forgets the flag.
ALTER TABLE municipal_project
  ADD CONSTRAINT municipal_project_units_basis_check
    CHECK (units_basis IS NULL OR units_basis IN ('delta','total')),
  ADD CONSTRAINT municipal_project_units_basis_needs_amendment
    CHECK (units_basis IS NULL OR is_amendment);

ALTER TABLE municipal_project_staging
  ADD CONSTRAINT municipal_project_staging_units_basis_check
    CHECK (units_basis IS NULL OR units_basis IN ('delta','total')),
  ADD CONSTRAINT municipal_project_staging_units_basis_needs_amendment
    CHECK (units_basis IS NULL OR is_amendment);

COMMENT ON COLUMN municipal_project.units_basis IS
  'How to read total_housing_units on an amendment: delta = units added to the '
  'existing approval; total = the new total, replacing it. NULL on a new development.';
COMMENT ON COLUMN municipal_project.prior_total IS
  'The unit count before this amendment, where the source states it. Makes a '
  'total-basis amendment auditable and a delta reversible.';
COMMENT ON COLUMN municipal_project.amends_case_number IS
  'The case/PUD number this amends, as the source writes it (e.g. "2018320"). '
  'Free text: it is a foreign reference, not a key into this database — no '
  'amendment in the corpus has its parent recorded here.';

CREATE INDEX IF NOT EXISTS municipal_project_is_amendment_idx
  ON municipal_project (is_amendment) WHERE is_amendment;

-- ---------------------------------------------------------------------------
-- backfill the two known cases
-- ---------------------------------------------------------------------------
-- Central Forsyth: "Amendment to PUD Condition 36 to allow 35 additional
-- townhomes" — ADDITIONAL, so 35 is a delta. Parent PUD #2018320 is not in the
-- database, so there is nothing to fold into and the 35 stands on its own.
UPDATE municipal_project
   SET is_amendment = true,
       units_basis  = 'delta',
       amends_case_number = '2018320'
 WHERE project_name = 'Central Forsyth Properties PUD Townhomes';

-- 14905 Hopewell: "amendment from 160 TH + 144 condos to 247 TH + 68 SFD" — a
-- NEW TOTAL. 160+144=304 before, 247+68=315 after; 315 is already what is stored,
-- which is correct for a total basis and would have been wrong had it been summed.
UPDATE municipal_project
   SET is_amendment = true,
       units_basis  = 'total',
       amends_case_number = '2024263',
       prior_total  = 304
 WHERE project_name = '14905 Hopewell Group LLC PUD Amendment #2024263 — Canton Highway';

-- ---------------------------------------------------------------------------
-- municipal_project_v
-- ---------------------------------------------------------------------------
-- Rebuilt from the LIVE definition as of 2026-09-21. The column list was expanded
-- from mp.* at creation, so new columns do not appear until the view is recreated.
DROP VIEW IF EXISTS municipal_project_v;
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
    mp.centroid_source,
    mp.unplaced_reason,
    mp.geometry_source,
    mp.geometry_source_parcels,
    mp.geometry_fetched_at,
    mp.geometry_stated_acres,
    mp.geometry_computed_acres,
    mp.geometry_needs_review,
    mp.geometry_reviewed_at,
    mp.is_amendment,
    mp.units_basis,
    mp.amends_case_number,
    mp.prior_total,
    st_y(mp.centroid) AS centroid_lat,
    st_x(mp.centroid) AS centroid_lng,
        CASE
            WHEN mp.geometry IS NULL THEN NULL::jsonb
            ELSE st_asgeojson(mp.geometry)::jsonb
        END AS geometry_geojson,
    mp.centroid IS NULL AS is_unplaced,
        CASE
            WHEN mp.geometry_stated_acres IS NULL OR mp.geometry_stated_acres = 0::numeric OR mp.geometry_computed_acres IS NULL THEN NULL::numeric
            ELSE round((mp.geometry_computed_acres - mp.geometry_stated_acres) / mp.geometry_stated_acres * 100::numeric, 1)
        END AS geometry_area_variance_pct,
    mp.geometry IS NOT NULL AND (mp.geometry_source = ANY (ARRAY['parcel_fetch'::text, 'parcel_fetch_adjusted'::text])) AND mp.geometry_reviewed_at IS NULL AS geometry_unreviewed,
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

-- DROP VIEW discards grants; restore what was on it (Supabase default grant-all).
GRANT ALL ON municipal_project_v TO anon, authenticated, service_role;
