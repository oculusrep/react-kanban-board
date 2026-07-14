-- Bidirectional stage sync between deal.stage_id and site_submit.submit_stage_id.
-- Mirrors the pre-existing loi_date sync pattern (value-comparison guard prevents
-- infinite recursion — once both sides converge on the mapped value, further
-- UPDATE ... WHERE ... IS DISTINCT FROM no-ops).
--
-- Behavior:
--   * When deal.stage_id changes, look up the mapped submit_stage_id and update
--     every site_submit where deal_id = NEW.id (if any).
--   * When site_submit.submit_stage_id changes AND site_submit.deal_id is not
--     null, look up the mapped deal_stage_id and update that deal.
--   * If either side's new stage has no mapping row, no-op.

BEGIN;

-- 1. Mapping table --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.deal_submit_stage_map (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_stage_id   uuid NOT NULL REFERENCES public.deal_stage(id)   ON DELETE CASCADE,
  submit_stage_id uuid NOT NULL REFERENCES public.submit_stage(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (deal_stage_id),
  UNIQUE (submit_stage_id)
);

COMMENT ON TABLE public.deal_submit_stage_map IS
  'Bidirectional stage equivalence between deal_stage and submit_stage. '
  'One row per pair. Consumed by sync_deal_stage_to_site_submit() and '
  'sync_site_submit_stage_to_deal() triggers.';

-- 2. Seed the 9 mappings by looking up IDs from stage labels/names --------

INSERT INTO public.deal_submit_stage_map (deal_stage_id, submit_stage_id)
SELECT ds.id, ss.id
FROM (VALUES
  ('Pre-Submittal',               'Pre-Submittal'),
  ('Submitted-Reviewing',         'Submitted-Reviewing'),
  ('Negotiating LOI',             'LOI'),
  ('At Lease/PSA',                'At Lease/PSA'),
  ('Under Contract / Contingent', 'Under Contract / Contingent'),
  ('Booked',                      'Booked'),
  ('Executed Payable',            'Executed Deal'),
  ('Closed Paid',                 'Store Open'),
  ('Lost',                        'Lost / Killed')
) AS pairs(deal_label, submit_name)
JOIN public.deal_stage   ds ON ds.label = pairs.deal_label
JOIN public.submit_stage ss ON ss.name  = pairs.submit_name
ON CONFLICT (deal_stage_id) DO NOTHING;

-- 3. Trigger function: deal -> site_submit --------------------------------

CREATE OR REPLACE FUNCTION public.sync_deal_stage_to_site_submit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_submit_stage_id uuid;
BEGIN
  IF NEW.stage_id IS NOT DISTINCT FROM OLD.stage_id THEN
    RETURN NEW;
  END IF;

  SELECT submit_stage_id
    INTO v_target_submit_stage_id
  FROM public.deal_submit_stage_map
  WHERE deal_stage_id = NEW.stage_id;

  IF v_target_submit_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.site_submit
     SET submit_stage_id = v_target_submit_stage_id
   WHERE deal_id = NEW.id
     AND submit_stage_id IS DISTINCT FROM v_target_submit_stage_id;

  RETURN NEW;
END;
$$;

-- 4. Trigger function: site_submit -> deal --------------------------------

CREATE OR REPLACE FUNCTION public.sync_site_submit_stage_to_deal()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_target_deal_stage_id uuid;
BEGIN
  IF NEW.submit_stage_id IS NOT DISTINCT FROM OLD.submit_stage_id THEN
    RETURN NEW;
  END IF;

  IF NEW.deal_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT deal_stage_id
    INTO v_target_deal_stage_id
  FROM public.deal_submit_stage_map
  WHERE submit_stage_id = NEW.submit_stage_id;

  IF v_target_deal_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.deal
     SET stage_id = v_target_deal_stage_id
   WHERE id = NEW.deal_id
     AND stage_id IS DISTINCT FROM v_target_deal_stage_id;

  RETURN NEW;
END;
$$;

-- 5. Triggers -------------------------------------------------------------

DROP TRIGGER IF EXISTS trigger_sync_deal_stage_to_site_submit ON public.deal;
CREATE TRIGGER trigger_sync_deal_stage_to_site_submit
  AFTER UPDATE OF stage_id ON public.deal
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_deal_stage_to_site_submit();

DROP TRIGGER IF EXISTS trigger_sync_site_submit_stage_to_deal ON public.site_submit;
CREATE TRIGGER trigger_sync_site_submit_stage_to_deal
  AFTER UPDATE OF submit_stage_id ON public.site_submit
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_site_submit_stage_to_deal();

COMMIT;
