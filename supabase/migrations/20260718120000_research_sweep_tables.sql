-- Automated Deep-Sweep — durable state for firing a 3yr Deep enumeration as N
-- sequential 6-month chunks. See ~/.claude/plans (Deep-Sweep Chunk Loop).
--
-- A "sweep" is the parent; each chunk is one 6-month Deep run fired sequentially
-- by the ovis-sweep-tick engine (chunk N+1 fires only when chunk N is terminal).
-- Each chunk becomes a real research_run, so get_research_coverage stitches the
-- segments and a dead chunk shows as a coverage gap. The agent is NOT touched.

-- ============================================================================
-- research_sweep — one row per "Deep Sweep" button click
-- ============================================================================
CREATE TABLE public.research_sweep (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id            uuid NOT NULL REFERENCES public.site_submit(id) ON DELETE CASCADE,
  triggered_by              uuid REFERENCES public."user"(id),
  radius_miles              int  NOT NULL CHECK (radius_miles BETWEEN 1 AND 50),
  -- Frozen scope snapshot from the confirmation dialog; every chunk fires with
  -- this same muni set (the trigger re-validates against the live radius query).
  boundary_municipality_ids uuid[] NOT NULL,
  research_mode             text NOT NULL DEFAULT 'deep' CHECK (research_mode = 'deep'),
  total_chunks              int  NOT NULL CHECK (total_chunks > 0),
  -- Per-running-chunk timeout; tunable per sweep without a migration.
  chunk_timeout_minutes     int  NOT NULL DEFAULT 25 CHECK (chunk_timeout_minutes > 0),
  state                     text NOT NULL DEFAULT 'running'
                              CHECK (state IN ('running','complete','complete_with_failures','failed','cancelled')),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.research_sweep IS
  'One automated Deep-Sweep. Chunks fire sequentially via ovis-sweep-tick. See plan Deep-Sweep Chunk Loop.';

CREATE INDEX research_sweep_site_idx  ON public.research_sweep (site_submit_id, created_at DESC);
CREATE INDEX research_sweep_state_idx ON public.research_sweep (state) WHERE state = 'running';

CREATE TRIGGER research_sweep_set_updated_at
  BEFORE UPDATE ON public.research_sweep
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- research_sweep_chunk — the fire-queue + timeout ledger + idempotency token
-- ============================================================================
-- window_start/window_end are the SINGLE 6-month slice. The tick expands it to
-- all four trigger bounds (pz_window = permit_window = slice) at fire time, so
-- permit-mapping (a') is true by construction and can't drift to a 2yr default.
CREATE TABLE public.research_sweep_chunk (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sweep_id         uuid NOT NULL REFERENCES public.research_sweep(id) ON DELETE CASCADE,
  chunk_index      int  NOT NULL,                 -- 0 = most recent 6 months
  window_start     date NOT NULL,                 -- inclusive, older bound
  window_end       date NOT NULL,                 -- inclusive, newer bound
  state            text NOT NULL DEFAULT 'pending'
                     CHECK (state IN ('pending','firing','running','done','failed')),
  research_run_id  uuid REFERENCES public.research_run(id) ON DELETE SET NULL,
  fired_at         timestamptz,                   -- when the OpenClaw POST succeeded
  terminal_at      timestamptz,                   -- when the chunk reached done/failed
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sweep_id, chunk_index)
);
COMMENT ON TABLE public.research_sweep_chunk IS
  'Per-chunk state for a research_sweep. state flow: pending -> firing -> running -> done|failed. research_run_id existence is the fire idempotency token.';

CREATE INDEX research_sweep_chunk_sweep_idx ON public.research_sweep_chunk (sweep_id, chunk_index);

CREATE TRIGGER research_sweep_chunk_set_updated_at
  BEFORE UPDATE ON public.research_sweep_chunk
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- research_run — link a run back to its sweep (nullable; single runs stay null).
-- Written POST-HOC by mark_chunk_fired so create_research_run_with_checklist's
-- signature and the user trigger path stay byte-identical.
-- ============================================================================
ALTER TABLE public.research_run
  ADD COLUMN sweep_id          uuid REFERENCES public.research_sweep(id) ON DELETE SET NULL,
  ADD COLUMN sweep_chunk_index int;

CREATE INDEX research_run_sweep_idx ON public.research_run (sweep_id) WHERE sweep_id IS NOT NULL;

COMMENT ON COLUMN public.research_run.sweep_id IS 'Parent sweep if this run is a Deep-Sweep chunk; NULL for standalone runs.';

-- ============================================================================
-- RLS — read for authenticated (internal-only data); writes via SECURITY
-- DEFINER RPCs only, mirroring research_run / municipal_project_staging.
-- ============================================================================
ALTER TABLE public.research_sweep       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_sweep_chunk ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_sweep_read       ON public.research_sweep       FOR SELECT TO authenticated USING (true);
CREATE POLICY research_sweep_chunk_read ON public.research_sweep_chunk FOR SELECT TO authenticated USING (true);
