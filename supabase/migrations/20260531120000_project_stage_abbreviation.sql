-- Add a short-code "abbreviation" to project_stage so the Municipal Projects
-- layer can display a compact "Units Label" (e.g. "+50 UR") on the slideout
-- and in KML exports. Mapping is editable per-stage in the layer panel admin
-- UI, so future stages don't require a code change.

ALTER TABLE project_stage
  ADD COLUMN IF NOT EXISTS abbreviation TEXT;

COMMENT ON COLUMN project_stage.abbreviation IS
  'Short code shown in the Municipal Projects Units Label (e.g. UR, RC). Edited per-stage in the layer panel admin UI.';

-- Seed the four known stages. Match by name; safe to re-run.
UPDATE project_stage SET abbreviation = 'UR'       WHERE name = 'Planning'           AND abbreviation IS NULL;
UPDATE project_stage SET abbreviation = 'Approved' WHERE name = 'Approved'           AND abbreviation IS NULL;
UPDATE project_stage SET abbreviation = 'UC'       WHERE name = 'Under Construction' AND abbreviation IS NULL;
UPDATE project_stage SET abbreviation = 'RC'       WHERE name = 'Built Out'          AND abbreviation IS NULL;
