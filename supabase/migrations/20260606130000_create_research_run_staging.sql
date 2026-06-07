-- Market Research Agent — Phase B
-- Schema for research runs, per-municipality checklist, staging records,
-- and the agent-added columns on municipal_project.
--
-- See:
--   docs/market-research-agent-spec.md §3 (workflow) §6 (staging) §7 (record schema)
--   docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase B
--
-- v1 design highlights:
--   - One research_run row per "Start Research" click (audit trail, never overwrite).
--   - municipal_project_staging mirrors municipal_project + agent fields + approval workflow.
--   - Server-side dup detection at submit time populates matched_existing_id.
--   - All writes by the MCP edge function use SUPABASE_SERVICE_ROLE_KEY → bypasses RLS.
--   - Read policy = authenticated (internal-only data; not customer-facing).

-- ============================================================================
-- 1) research_run — one row per "Start Research" click
-- ============================================================================
CREATE TABLE public.research_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id  uuid NOT NULL REFERENCES public.site_submit(id) ON DELETE CASCADE,
  triggered_by    uuid REFERENCES public."user"(id),
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  radius_miles    int NOT NULL DEFAULT 10
                    CHECK (radius_miles BETWEEN 1 AND 50),
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','running','awaiting_review','approved','archived','failed')),
  needs_review    text,                                  -- agent-written free-text; user-editable in approval UI
  alt_avenues     text,                                  -- §4 "note alternative avenues taken"
  openclaw_run_id text,                                  -- correlation ID returned by OpenClaw on trigger
  completed_at    timestamptz,                           -- when state moved to awaiting_review/failed
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.research_run IS
  'One row per "Start Research" click on a Starbucks site_submit. Kept forever for audit. See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md.';

CREATE INDEX research_run_site_idx       ON public.research_run (site_submit_id, triggered_at DESC);
CREATE INDEX research_run_state_idx      ON public.research_run (state) WHERE state IN ('pending','running','awaiting_review');

CREATE TRIGGER research_run_set_updated_at
  BEFORE UPDATE ON public.research_run
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 2) research_checklist_item — per-municipality status on each run
-- ============================================================================
CREATE TABLE public.research_checklist_item (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id           uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  boundary_municipality_id  uuid NOT NULL REFERENCES public.boundary_municipality(id),
  priority                  int  NOT NULL,                  -- 1 = closest to the site
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','in_progress','complete','skipped','blocked')),
  notes                     text,                            -- agent's per-muni notes (alt avenue used, dead-end reason, etc.)
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (research_run_id, boundary_municipality_id)
);
COMMENT ON TABLE public.research_checklist_item IS
  'Per-municipality checklist for a single research_run. Priority is distance-ordered (1 = closest). status reflects the agent''s progress on that municipality.';

CREATE INDEX research_checklist_item_run_priority_idx
  ON public.research_checklist_item (research_run_id, priority);

CREATE TRIGGER research_checklist_item_set_updated_at
  BEFORE UPDATE ON public.research_checklist_item
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) municipal_project_staging — agent-discovered records pending review
-- ============================================================================
CREATE TABLE public.municipal_project_staging (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id                 uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  boundary_municipality_id        uuid REFERENCES public.boundary_municipality(id),    -- which muni produced this row
  municipality_id                 uuid REFERENCES public.municipality(id),             -- OVIS muni; nullable until matched/promoted

  -- mirror of municipal_project (see MUNICIPAL_PROJECT_IMPORTER_SPEC.md)
  project_name                    text,
  address                         text,
  phase_label                     text NOT NULL DEFAULT '',
  parcel_numbers                  text[] NOT NULL DEFAULT '{}',

  -- unit counts
  single_family_lots              int,
  townhouse_units                 int,
  duplex_units                    int,
  apt_units                       int,
  cottage_units                   int,
  total_housing_units             int,

  -- zoning
  zoning                          text,
  zoning_approval_date            date,
  notes                           text,
  raw_stages                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_stage_id                 uuid REFERENCES public.project_stage(id),

  -- §7 agent-added fields
  builder_developer               text,
  permit_url                      text,
  permit_application_date         date,
  source                          text NOT NULL,                                       -- §7 required; free-text provenance

  -- approval workflow
  matched_existing_id             uuid REFERENCES public.municipal_project(id),        -- server-side dup detection at submit time
  approval_state                  text NOT NULL DEFAULT 'pending'
                                    CHECK (approval_state IN ('pending','approved','rejected')),
  approved_at                     timestamptz,
  approved_municipal_project_id   uuid REFERENCES public.municipal_project(id),        -- set on promote

  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.municipal_project_staging IS
  'Agent-discovered development records pending review. Promoted into municipal_project on Approve & Commit. Rejected rows are kept forever (approval_state=rejected) for audit. See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase B & E.';

CREATE INDEX municipal_project_staging_run_idx       ON public.municipal_project_staging (research_run_id);
CREATE INDEX municipal_project_staging_state_idx     ON public.municipal_project_staging (approval_state);
CREATE INDEX municipal_project_staging_matched_idx   ON public.municipal_project_staging (matched_existing_id);

CREATE TRIGGER municipal_project_staging_set_updated_at
  BEFORE UPDATE ON public.municipal_project_staging
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 4) ALTERs on municipal_project — agent-added columns + provenance back-link
-- ============================================================================
-- All nullable so legacy (importer-sourced) rows are unaffected.
ALTER TABLE public.municipal_project
  ADD COLUMN source                    text,
  ADD COLUMN builder_developer         text,
  ADD COLUMN permit_url                text,
  ADD COLUMN permit_application_date   date,
  ADD COLUMN source_research_run_id    uuid REFERENCES public.research_run(id);

COMMENT ON COLUMN public.municipal_project.source IS
  'Where this record originated, free-text. Importer rows: e.g. "Winder CSV April 2026". Agent-promoted rows: e.g. "Citizens Portal permit #12345" or "econ dev email attachment".';
COMMENT ON COLUMN public.municipal_project.source_research_run_id IS
  'Set on rows promoted from municipal_project_staging via Approve & Commit. NULL for importer-sourced rows.';

CREATE INDEX municipal_project_source_run_idx ON public.municipal_project (source_research_run_id) WHERE source_research_run_id IS NOT NULL;

-- ============================================================================
-- 5) RLS — read = authenticated; writes go through MCP edge function (service_role).
-- ============================================================================
ALTER TABLE public.research_run               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_checklist_item    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipal_project_staging  ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_run_read
  ON public.research_run
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY research_checklist_item_read
  ON public.research_checklist_item
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY municipal_project_staging_read
  ON public.municipal_project_staging
  FOR SELECT TO authenticated
  USING (true);

-- No INSERT/UPDATE/DELETE policies for authenticated users:
--   - The MCP edge function uses SUPABASE_SERVICE_ROLE_KEY (bypasses RLS automatically).
--   - The Approve & Commit action (Phase E) will go through a SECURITY DEFINER RPC
--     that performs the promote → municipal_project + staging.approval_state update
--     atomically, also bypassing RLS.
