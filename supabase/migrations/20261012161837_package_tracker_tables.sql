-- Package Tracker — slide template, per-deal package, per-deal slide rows.
-- Spec: docs/PACKAGE_TRACKER_SPEC.md. Decisions: STARBUCKS_DEAL_BOARD_DECISIONS.md §2.29.
--
-- package_slide_template  the 11 default slides. Owner, handoff and inputs are
--                         settings Mike edits (Phase 2 settings screen), never
--                         hard-coded in components.
-- deal_package            one per deal (a deal must exist). Holds the three
--                         manual inputs (site plan, DOT study, final LOI — the
--                         last is Gate 3) and the once-only manual gate dates
--                         for deals whose court history can't be recovered.
-- deal_package_slide      one row per slide per package. Owner / handoff /
--                         inputs / gate requirements are SNAPSHOTTED from the
--                         template at Start Package, so a settings change never
--                         re-routes a slide already in flight.
--
-- Stored status is what a person set. "Waiting on Mike because an input isn't
-- ready" is derived at read time (v_deal_package_slide, migration ..161840),
-- never stored, so it can't go stale.
--
-- Handoff:
--   none     owner's check-off = done
--   approve  owner completes, Mike approves   (owner check-off → waiting_on_mike)
--   finish   owner sets up, Mike finishes     (owner check-off → waiting_on_mike)
--
-- Gate requirements (done_by_gate / started_by_gate) encode the pacing rules:
--   Gate 1: Drive Time, Placer, Analogous Store, Road Improvements done
--           (Road Improvements slips to Gate 2 while its DOT input isn't in —
--           the view applies "inputs not ready ⇒ Gate 1 requirement moves to
--           Gate 2" generically); Rent Comps at least started.
--   Gate 2: everything done except Deal Terms.
--   Gate 3: 100%.
--
-- None of these tables carries deal_id/site_submit_id into a clock-reset
-- trigger: package writes never move the board clock (§1.4, §2.29).
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ─── Template ───────────────────────────────────────────────────────────────

CREATE TABLE public.package_slide_template (
  key              text PRIMARY KEY,
  label            text NOT NULL,
  position         smallint NOT NULL UNIQUE,
  owner_user_id    uuid NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  handoff          text NOT NULL DEFAULT 'none'
                   CHECK (handoff IN ('none', 'approve', 'finish')),
  inputs           text[] NOT NULL DEFAULT '{}'
                   CHECK (inputs <@ ARRAY['market_research','site_story','site_plan','dot_study','final_loi']),
  allows_na        boolean NOT NULL DEFAULT false,
  after_key        text REFERENCES public.package_slide_template(key) ON DELETE SET NULL,
  done_by_gate     smallint NOT NULL CHECK (done_by_gate BETWEEN 1 AND 3),
  started_by_gate  smallint CHECK (started_by_gate BETWEEN 1 AND 3),
  note             text,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  updated_by       uuid DEFAULT auth.uid(),
  CONSTRAINT package_slide_template_started_before_done
    CHECK (started_by_gate IS NULL OR started_by_gate <= done_by_gate)
);

COMMENT ON TABLE public.package_slide_template IS
  'Package Tracker default slides. Editable settings; snapshotted onto deal_package_slide at Start Package.';
COMMENT ON COLUMN public.package_slide_template.after_key IS
  'Ordering hint: this slide''s owner task is released after the after_key slide''s owner part is done (Noree queue, Phase 3). Does not affect status.';

CREATE TRIGGER trg_package_slide_template_updated_at
  BEFORE UPDATE ON public.package_slide_template
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed. Owners: Mike = fe6e516f-…, Noree = cced4458-… (user.id, verified 2026-10-11).
INSERT INTO public.package_slide_template
  (key, label, position, owner_user_id, handoff, inputs, allows_na, after_key, done_by_gate, started_by_gate, note)
VALUES
  ('drive_time',        'Drive Time',        1,  'cced4458-1ef9-4fac-982e-bb204463b1c5', 'approve', '{}',                             false, NULL,       1, NULL, NULL),
  ('demo_map',          'Demo Map',          2,  'cced4458-1ef9-4fac-982e-bb204463b1c5', 'finish',  '{market_research}',              false, NULL,       2, NULL, NULL),
  ('market_aerial',     'Market Aerial',     3,  'cced4458-1ef9-4fac-982e-bb204463b1c5', 'finish',  '{market_research}',              false, 'demo_map', 2, NULL, NULL),
  ('generators',        'Generators',        4,  'cced4458-1ef9-4fac-982e-bb204463b1c5', 'finish',  '{market_research,site_story}',   false, NULL,       2, NULL, NULL),
  ('site_plan',         'Site Plan',         5,  'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'none',    '{site_plan}',                    false, NULL,       2, NULL, NULL),
  ('site_access',       'Site Access',       6,  'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'none',    '{site_plan}',                    false, NULL,       2, NULL, NULL),
  ('rent_comps',        'Rent Comps',        7,  'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'none',    '{}',                             false, NULL,       2, 1,    'Start early'),
  ('analogous_store',   'Analogous Store',   8,  'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'none',    '{}',                             false, NULL,       1, NULL, NULL),
  ('placer',            'Placer',            9,  'cced4458-1ef9-4fac-982e-bb204463b1c5', 'approve', '{}',                             false, NULL,       1, NULL, 'Done at package start'),
  ('deal_terms',        'Deal Terms',        10, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'none',    '{final_loi}',                    false, NULL,       3, NULL, 'Always last'),
  ('road_improvements', 'Road Improvements', 11, 'fe6e516f-11e1-4a3b-b914-910d59d9e8df', 'none',    '{dot_study}',                    true,  NULL,       1, NULL, 'N/A removes it from the count');

-- ─── Package ────────────────────────────────────────────────────────────────

CREATE TABLE public.deal_package (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                uuid NOT NULL UNIQUE REFERENCES public.deal(id) ON DELETE CASCADE,
  started_at             timestamptz NOT NULL DEFAULT now(),
  started_by             uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  -- Manual inputs (a person marks them in; timestamp = when).
  site_plan_received_at  timestamptz,
  dot_study_received_at  timestamptz,
  final_loi_at           timestamptz,   -- also Gate 3 (decision 2026-10-12)
  -- Once-only gate dates for deals whose court history can't be recovered
  -- (spec §9 Q1). NULL = "hasn't happened yet" once gates_confirmed_at is set.
  gate1_manual_at        date,          -- first LOI draft sent
  gate2_manual_at        date,          -- landlord's first response
  gates_confirmed_at     timestamptz,   -- when Mike filled the form; live court events after this count
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  updated_by             uuid DEFAULT auth.uid(),
  CONSTRAINT deal_package_gate_order
    CHECK (gate2_manual_at IS NULL OR (gate1_manual_at IS NOT NULL AND gate2_manual_at >= gate1_manual_at))
);

CREATE TRIGGER trg_deal_package_updated_at
  BEFORE UPDATE ON public.deal_package
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── Slides ─────────────────────────────────────────────────────────────────

CREATE TABLE public.deal_package_slide (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id         uuid NOT NULL REFERENCES public.deal_package(id) ON DELETE CASCADE,
  template_key       text NOT NULL REFERENCES public.package_slide_template(key) ON DELETE RESTRICT,
  -- Snapshot of the template at Start Package.
  label              text NOT NULL,
  position           smallint NOT NULL,
  owner_user_id      uuid NOT NULL REFERENCES public."user"(id) ON DELETE RESTRICT,
  handoff            text NOT NULL CHECK (handoff IN ('none', 'approve', 'finish')),
  inputs             text[] NOT NULL DEFAULT '{}'
                     CHECK (inputs <@ ARRAY['market_research','site_story','site_plan','dot_study','final_loi']),
  allows_na          boolean NOT NULL DEFAULT false,
  after_key          text,
  done_by_gate       smallint NOT NULL CHECK (done_by_gate BETWEEN 1 AND 3),
  started_by_gate    smallint CHECK (started_by_gate BETWEEN 1 AND 3),
  -- State.
  status             text NOT NULL DEFAULT 'not_started'
                     CHECK (status IN ('not_started', 'in_progress', 'waiting_on_mike', 'done', 'na')),
  status_changed_at  timestamptz NOT NULL DEFAULT now(),
  status_changed_by  uuid DEFAULT auth.uid(),
  owner_done_at      timestamptz,   -- owner's part checked off (handoff approve/finish)
  done_at            timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_package_slide_one_per_key UNIQUE (package_id, template_key),
  CONSTRAINT deal_package_slide_na_allowed  CHECK (status <> 'na' OR allows_na),
  CONSTRAINT deal_package_slide_done_stamp  CHECK ((status = 'done') = (done_at IS NOT NULL))
);

CREATE INDEX deal_package_slide_owner_open_idx
  ON public.deal_package_slide (owner_user_id)
  WHERE status NOT IN ('done', 'na');

CREATE TRIGGER trg_deal_package_slide_updated_at
  BEFORE UPDATE ON public.deal_package_slide
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─── RLS: internal users only (same gate as the board, 20261009105306) ──────

ALTER TABLE public.package_slide_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_package           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deal_package_slide     ENABLE ROW LEVEL SECURITY;

CREATE POLICY package_slide_template_select_internal ON public.package_slide_template
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
-- Settings are Mike's: admin only.
CREATE POLICY package_slide_template_update_admin ON public.package_slide_template
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY deal_package_select_internal ON public.deal_package
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
CREATE POLICY deal_package_insert_internal ON public.deal_package
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_internal_user()));
CREATE POLICY deal_package_update_internal ON public.deal_package
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_internal_user())) WITH CHECK ((SELECT public.is_internal_user()));

CREATE POLICY deal_package_slide_select_internal ON public.deal_package_slide
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
CREATE POLICY deal_package_slide_insert_internal ON public.deal_package_slide
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_internal_user()));
CREATE POLICY deal_package_slide_update_internal ON public.deal_package_slide
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_internal_user())) WITH CHECK ((SELECT public.is_internal_user()));

-- ─── Grants: don't inherit the defaults, state what the app uses ────────────
-- Template: read + settings edits (no insert/delete — adding a slide is a migration).
REVOKE ALL ON public.package_slide_template FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.package_slide_template TO authenticated;
-- Package / slides: no DELETE — rows go with their deal (cascade).
REVOKE ALL ON public.deal_package FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.deal_package TO authenticated;
REVOKE ALL ON public.deal_package_slide FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.deal_package_slide TO authenticated;
