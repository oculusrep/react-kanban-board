-- Data cleanup: committed municipal_project rows whose unit count is a
-- placeholder, not a sourced figure. Requires 20261103203347 (units_needs_review).
--
-- Health check 2026-11-03 reviewed every research-sourced live row at 0, NULL or
-- exactly 25 (13 rows) against its own notes. All 13 are placeholders:
--   * 6 at 0  — each note says "lot count not confirmed" (Hall County, Columbia
--               County runs). 0 was the agent's "unknown" marker.
--   * 5 at 25 — each note calls 25 a "placeholder" or "an estimate only"; no
--               source stated it. 25 is the inclusion threshold, so a fabricated
--               25 reads as a real, just-qualifying count.
--   * 2 already NULL (Woodlands Phase 7, Rex Road Townhomes) — flagged by the
--               20261103203347 backfill, nothing to change here.
-- A fabricated count is worse than none: it feeds unit totals
-- (site_pipeline_matrix sums only total > 0) and passes min-unit map filters.
-- So: set to NULL and flag for review. The breakdown column that repeats the
-- placeholder (townhouse_units = 25 on two rows) is cleared too. Rows are
-- named by id and guarded on their current value, so a count someone has since
-- corrected is left alone.

-- Step 1: clear the placeholder. The trigger sets the flag ('No unit count').
UPDATE public.municipal_project
   SET total_housing_units = NULL,
       townhouse_units = CASE WHEN townhouse_units = 25 THEN NULL ELSE townhouse_units END
 WHERE (id, total_housing_units) IN (
   -- 0 = "lot count not confirmed"
   ('07a96c3b-d2b3-456c-92de-d5c987a5e30f'::uuid, 0),  -- Falcon Landing Phase I
   ('50f9f6c0-facf-4867-bec1-c1fbc49441b1'::uuid, 0),  -- Waterside at Lake Lanier
   ('d942af8c-943e-4530-8e6f-33cd1a7d383c'::uuid, 0),  -- Highland Gates
   ('f7e6105c-ff5e-458a-92f5-944b1045e2e0'::uuid, 0),  -- Magnolia Station Phase 4
   ('1a57edf3-6c68-4d53-9de1-d6506d9e9479'::uuid, 0),  -- Haselton Phase 3
   ('011404b0-75fa-40c1-ae11-2db6f27b6acf'::uuid, 0),  -- Clark Farms Phase I
   -- 25 = placeholder / estimate
   ('9970b0e0-4f7e-4047-ae73-5fc0c14ed00d'::uuid, 25), -- Hidden Crossing I
   ('319c0074-9d27-46ed-84dc-6a8b3d9bdc69'::uuid, 25), -- 950 Highway 138 Fee-Simple Townhomes
   ('7fb23d16-1ed5-4a2a-85e1-9678afa1b051'::uuid, 25), -- Tara JTB Mixed-Use Multi-Family
   ('aa8a8ae8-9503-41f6-878d-0f447d39542b'::uuid, 25), -- Lake City Annexation Townhome Community
   ('4eac1374-dbbb-435a-bfe4-a8f43bdc18c4'::uuid, 25)  -- Tillery Park – Baker Place Road PRD Revision
 );

-- Step 2: say why, on the row. (Flag-only UPDATE: the trigger does not fire.)
UPDATE public.municipal_project
   SET units_needs_review = true,
       units_review_reason = 'Placeholder count removed 2026-11-03 — no source stated a unit count'
 WHERE id IN (
   '07a96c3b-d2b3-456c-92de-d5c987a5e30f', '50f9f6c0-facf-4867-bec1-c1fbc49441b1',
   'd942af8c-943e-4530-8e6f-33cd1a7d383c', 'f7e6105c-ff5e-458a-92f5-944b1045e2e0',
   '1a57edf3-6c68-4d53-9de1-d6506d9e9479', '011404b0-75fa-40c1-ae11-2db6f27b6acf',
   '9970b0e0-4f7e-4047-ae73-5fc0c14ed00d', '319c0074-9d27-46ed-84dc-6a8b3d9bdc69',
   '7fb23d16-1ed5-4a2a-85e1-9678afa1b051', 'aa8a8ae8-9503-41f6-878d-0f447d39542b',
   '4eac1374-dbbb-435a-bfe4-a8f43bdc18c4'
 )
   AND total_housing_units IS NULL;
