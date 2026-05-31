-- Municipal Project Importer — Phase 1 schema
-- See docs/MUNICIPAL_PROJECT_IMPORTER_SPEC.md
-- Pattern for RLS: read = authenticated, write = admin (ovis_role='admin')

CREATE EXTENSION IF NOT EXISTS postgis;

-- 1. Canonical taxonomy of project stages, shared across all municipalities.
CREATE TABLE public.project_stage (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  sort_order  int  NOT NULL DEFAULT 0,
  color       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.project_stage IS
  'Canonical project status taxonomy for municipal_project. Per-municipality source columns map to one of these via municipality_stage_mapping.';

-- 2. One row per city we track municipal projects for.
CREATE TABLE public.municipality (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  state            text NOT NULL,
  display_color    text,
  default_visible  boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, state)
);
COMMENT ON TABLE public.municipality IS
  'One row per municipality (city/town) tracked in the municipal project importer.';

-- 3. Forward-declare municipal_import so municipal_project can FK to it.
CREATE TABLE public.municipal_import (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id  uuid NOT NULL REFERENCES public.municipality(id) ON DELETE CASCADE,
  file_name        text NOT NULL,
  file_sha256      text,
  uploaded_by      uuid REFERENCES public."user"(id),
  uploaded_at      timestamptz NOT NULL DEFAULT now(),
  row_count        int NOT NULL DEFAULT 0,
  inserted_count   int NOT NULL DEFAULT 0,
  updated_count    int NOT NULL DEFAULT 0,
  skipped_count    int NOT NULL DEFAULT 0,
  column_mapping   jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'pending',
  error_log        jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT municipal_import_status_chk CHECK (status IN ('pending','success','partial','failed'))
);
COMMENT ON TABLE public.municipal_import IS
  'Audit log for each CSV upload into the municipal project importer.';

-- 4. Per-municipality column-to-canonical-stage mapping. Saved on first import; reused next time.
CREATE TABLE public.municipality_stage_mapping (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id     uuid NOT NULL REFERENCES public.municipality(id) ON DELETE CASCADE,
  source_column_name  text NOT NULL,
  project_stage_id    uuid NOT NULL REFERENCES public.project_stage(id),
  completion_values   text[] NOT NULL DEFAULT '{}',
  date_column         boolean NOT NULL DEFAULT false,
  priority            int NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (municipality_id, source_column_name)
);
COMMENT ON TABLE public.municipality_stage_mapping IS
  'Per-municipality mapping from source CSV stage column to canonical project_stage. completion_values lists values that mark the stage complete; date_column=true means any parseable date counts; priority is used to pick the "latest" completed stage as a project''s current status.';

-- 5. The project rows themselves.
CREATE TABLE public.municipal_project (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  municipality_id          uuid NOT NULL REFERENCES public.municipality(id) ON DELETE CASCADE,
  address                  text NOT NULL,
  project_name             text NOT NULL DEFAULT '',
  phase_label              text NOT NULL DEFAULT '',
  parcel_numbers           text[] NOT NULL DEFAULT '{}',

  -- unit counts
  single_family_lots       int,
  townhouse_units          int,
  duplex_units             int,
  apt_units                int,
  cottage_units            int,
  total_housing_units      int,

  -- zoning
  zoning                   text,
  zoning_approval_date     date,
  notes                    text,

  -- raw per-muni stage columns (e.g. { "PRELIMINARY PLAT": "Yes", "RECORDED": "2/19/2024" })
  raw_stages               jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- status
  status_stage_id          uuid REFERENCES public.project_stage(id),
  status_override_id       uuid REFERENCES public.project_stage(id),

  -- geocode + polygon
  geocoded_address         text,
  centroid                 geometry(Point, 4326),
  geometry                 geometry(Polygon, 4326),

  -- linkage + provenance
  property_id              uuid REFERENCES public.property(id),
  source_import_id         uuid REFERENCES public.municipal_import(id),
  source_row_number        int,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  UNIQUE (municipality_id, address, project_name, phase_label)
);
COMMENT ON TABLE public.municipal_project IS
  'Imported municipal-development project records. Status is COALESCE(status_override_id, status_stage_id). Centroid is the geocoded point until a polygon is drawn (Phase 3), then derived from polygon. See docs/MUNICIPAL_PROJECT_IMPORTER_SPEC.md.';

-- Indexes
CREATE INDEX municipal_project_municipality_idx  ON public.municipal_project (municipality_id);
CREATE INDEX municipal_project_status_idx        ON public.municipal_project (status_stage_id);
CREATE INDEX municipal_project_centroid_gix      ON public.municipal_project USING GIST (centroid);
CREATE INDEX municipal_project_geometry_gix      ON public.municipal_project USING GIST (geometry);
CREATE INDEX municipality_stage_mapping_muni_idx ON public.municipality_stage_mapping (municipality_id);
CREATE INDEX municipal_import_muni_idx           ON public.municipal_import (municipality_id, uploaded_at DESC);

-- updated_at trigger (reuse existing function)
CREATE TRIGGER municipal_project_set_updated_at
BEFORE UPDATE ON public.municipal_project
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: read = any authenticated user; write = admin only (matches the approach the user signed off on).
ALTER TABLE public.project_stage              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipality               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipality_stage_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_project          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_import           ENABLE ROW LEVEL SECURITY;

-- Read policies (authenticated)
CREATE POLICY project_stage_read              ON public.project_stage              FOR SELECT TO authenticated USING (true);
CREATE POLICY municipality_read               ON public.municipality               FOR SELECT TO authenticated USING (true);
CREATE POLICY municipality_stage_mapping_read ON public.municipality_stage_mapping FOR SELECT TO authenticated USING (true);
CREATE POLICY municipal_project_read          ON public.municipal_project          FOR SELECT TO authenticated USING (true);
CREATE POLICY municipal_import_read           ON public.municipal_import           FOR SELECT TO authenticated USING (true);

-- Write policies (admin only, mirroring app_settings pattern)
CREATE POLICY project_stage_admin_write ON public.project_stage
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'));

CREATE POLICY municipality_admin_write ON public.municipality
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'));

CREATE POLICY municipality_stage_mapping_admin_write ON public.municipality_stage_mapping
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'));

CREATE POLICY municipal_project_admin_write ON public.municipal_project
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'));

CREATE POLICY municipal_import_admin_write ON public.municipal_import
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u WHERE u.id = auth.uid() AND u.ovis_role = 'admin'));

-- Seed canonical stages so the first import has something to map to.
INSERT INTO public.project_stage (name, sort_order, color) VALUES
  ('Planning',            10, '#8FA9C8'),
  ('Approved',            20, '#4A6B94'),
  ('Under Construction',  30, '#A27B5C'),
  ('Built Out',           40, '#002147');

;
