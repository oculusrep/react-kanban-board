-- Starbucks: one account + a Real Estate Manager (REM) tag per site submit / deal.
-- Merges the child account "Starbucks - JW (Coastal GA)" into "Starbucks",
-- tagging everything that moved with Jared Wright as REM.
-- No new relations, so no grants block needed (column grants follow the table).
-- Trigger fn is not an RPC: execute revoked from PUBLIC/anon/authenticated.

BEGIN;

ALTER TABLE public.site_submit
  ADD COLUMN IF NOT EXISTS real_estate_manager_id uuid REFERENCES public.contact(id) ON DELETE SET NULL;
ALTER TABLE public.deal
  ADD COLUMN IF NOT EXISTS real_estate_manager_id uuid REFERENCES public.contact(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS site_submit_real_estate_manager_id_idx ON public.site_submit (real_estate_manager_id);
CREATE INDEX IF NOT EXISTS deal_real_estate_manager_id_idx ON public.deal (real_estate_manager_id);
COMMENT ON COLUMN public.site_submit.real_estate_manager_id IS 'Client-side Real Estate Manager (contact) responsible for this site, e.g. a Starbucks REM. Used for filtering + portal "My sites".';
COMMENT ON COLUMN public.deal.real_estate_manager_id IS 'Client-side Real Estate Manager (contact) for this deal. Copied from the site submit at deal creation.';

-- A new deal inherits its site submit's REM (covers every creation path: modals, MCP).
CREATE OR REPLACE FUNCTION public.deal_inherit_real_estate_manager()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  IF NEW.real_estate_manager_id IS NULL AND NEW.site_submit_id IS NOT NULL THEN
    SELECT real_estate_manager_id INTO NEW.real_estate_manager_id
      FROM site_submit WHERE id = NEW.site_submit_id;
  END IF;
  RETURN NEW;
END;
$fn$;
REVOKE ALL ON FUNCTION public.deal_inherit_real_estate_manager() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_deal_inherit_real_estate_manager ON public.deal;
CREATE TRIGGER trg_deal_inherit_real_estate_manager
  BEFORE INSERT ON public.deal
  FOR EACH ROW EXECUTE FUNCTION public.deal_inherit_real_estate_manager();

DO $$
DECLARE
  sbux  constant uuid := '39933b5b-3e8c-438d-be2f-e48cd9228c00';  -- Starbucks
  jw    constant uuid := 'e58e358e-0d3e-47cb-a806-2464f0b5795c';  -- Starbucks - JW (Coastal GA)
  jared constant uuid := 'aea6975c-3c90-4b05-a3d7-d6b590739657';  -- Jared Wright
BEGIN
  -- Tag first (while the JW client_id still identifies his records), then move.
  UPDATE site_submit SET real_estate_manager_id = jared, client_id = sbux WHERE client_id = jw;
  UPDATE deal        SET real_estate_manager_id = jared, client_id = sbux WHERE client_id = jw;

  UPDATE tour                      SET client_id = sbux WHERE client_id = jw;
  UPDATE task                      SET client_id = sbux WHERE client_id = jw;
  UPDATE contact                   SET client_id = sbux WHERE client_id = jw;
  UPDATE research_thread           SET client_id = sbux WHERE client_id = jw;
  UPDATE site_submit_stage_history SET client_id = sbux WHERE client_id = jw;
  UPDATE site_submit_activity      SET client_id = sbux WHERE client_id = jw;
  UPDATE deal_stage_history        SET client_id = sbux WHERE client_id = jw;
  UPDATE portal_email_send         SET client_id = sbux WHERE client_id = jw;

  -- Unique-keyed link tables: move, dropping rows that already exist on Starbucks.
  DELETE FROM contact_client_relation r WHERE client_id = jw
    AND EXISTS (SELECT 1 FROM contact_client_relation x WHERE x.client_id = sbux AND x.contact_id = r.contact_id);
  UPDATE contact_client_relation SET client_id = sbux WHERE client_id = jw;

  DELETE FROM contact_client_role r WHERE client_id = jw
    AND EXISTS (SELECT 1 FROM contact_client_role x WHERE x.client_id = sbux AND x.contact_id = r.contact_id AND x.role_id = r.role_id);
  UPDATE contact_client_role SET client_id = sbux WHERE client_id = jw;

  DELETE FROM portal_user_client_access r WHERE client_id = jw
    AND EXISTS (SELECT 1 FROM portal_user_client_access x WHERE x.client_id = sbux AND x.contact_id = r.contact_id);
  UPDATE portal_user_client_access SET client_id = sbux WHERE client_id = jw;

  DELETE FROM email_object_link e WHERE object_type = 'client' AND object_id = jw
    AND EXISTS (SELECT 1 FROM email_object_link x WHERE x.email_id = e.email_id AND x.object_type = 'client' AND x.object_id = sbux);
  UPDATE email_object_link SET object_id = sbux WHERE object_type = 'client' AND object_id = jw;

  -- Retire the child account (kept, not deleted: dropbox_mapping + audit history point at it).
  UPDATE client
     SET is_active_client = false,
         starbucks_board_enabled = false,
         starbucks_layer_enabled = false,
         client_name = 'Starbucks - JW (Coastal GA) [merged into Starbucks]'
   WHERE id = jw;
END $$;

COMMIT;
