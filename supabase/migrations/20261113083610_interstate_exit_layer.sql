-- Interstate exit badges map layer (I-85 and I-20 in Georgia to start).
-- Source: OpenStreetMap highway=motorway_junction nodes (ODbL; credit
-- "© OpenStreetMap contributors"). One row per interchange: the per-direction
-- junction nodes sharing a highway + exit number are merged to their midpoint.
-- See docs/INTERSTATE_EXITS_LAYER.md. Public road data: every signed-in user may read.

CREATE TABLE IF NOT EXISTS public.interstate_exit (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  highway       text NOT NULL,            -- 'I-85', 'I-20'
  exit_ref      text NOT NULL,            -- '147', '51A', ...
  latitude      numeric NOT NULL,
  longitude     numeric NOT NULL,
  osm_node_ids  bigint[] NOT NULL DEFAULT '{}',
  source        text NOT NULL DEFAULT 'OpenStreetMap',
  fetched_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS interstate_exit_highway_idx ON public.interstate_exit (highway);

ALTER TABLE public.interstate_exit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS interstate_exit_select ON public.interstate_exit;
CREATE POLICY interstate_exit_select ON public.interstate_exit
  FOR SELECT TO authenticated
  USING (true);

-- Grants: don't inherit the defaults, state what the app uses.
-- Read-only from the browser; rows are loaded by the import script (postgres).
REVOKE ALL ON public.interstate_exit FROM anon, authenticated;
GRANT SELECT ON public.interstate_exit TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.interstate_exit TO service_role;
