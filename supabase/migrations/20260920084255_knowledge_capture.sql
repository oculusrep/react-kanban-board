-- Knowledge Capture: ad hoc facts that arrive by phone call, text or scribbled
-- note, captured once and kept permanently. SEPARATE from quick_note (personal,
-- 7-day, untagged) — nothing here touches that table.
--
-- An entry is company knowledge: every internal user can read it, only its
-- creator can write it. Entries never expire and there is no edit/delete path
-- in this version, so there are deliberately no UPDATE/DELETE policies.
--
-- Docs: docs/KNOWLEDGE_CAPTURE.md

-- pgvector. Installed into `extensions` (the schema Supabase puts extensions in,
-- and already on the default search_path) rather than public. Every reference to
-- the type below is schema-qualified so it resolves regardless of the caller's
-- search_path — PostgREST roles don't necessarily carry `extensions`.
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ---------------------------------------------------------------------------
-- knowledge_entry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knowledge_entry (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The login id (auth.users.id / auth.uid()), like quick_note.user_id — NOT
  -- public.user.id. RLS compares against auth.uid() with no join to auth.users.
  -- RESTRICT, not CASCADE: company knowledge outlives the account that typed it.
  -- Reassign an author's entries before deleting their login.
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  -- Exactly what the user typed or said. Never rewritten, never editable.
  raw_text    text NOT NULL CHECK (length(btrim(raw_text)) > 0),
  -- The AI-tidied single-fact version, user-editable before filing. This is what
  -- retrieval will read.
  clean_text  text NOT NULL CHECK (length(btrim(clean_text)) > 0),
  source      text NOT NULL CHECK (source IN ('typed', 'voice')),
  -- True when the fact belongs to no OVIS object. General knowledge is valid and
  -- still gets tagged; it is not a failure to link.
  is_general  boolean NOT NULL DEFAULT false,
  -- Populated on insert; nothing searches it yet (semantic search is a later spec).
  embedding       extensions.vector(1536),
  -- Which model produced `embedding`, so a future re-embed can find exactly the
  -- rows it needs to redo instead of nuking the column.
  embedding_model text,
  embedding_dims  integer,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- An embedding is meaningless without knowing what produced it: the three
  -- columns are set together or not at all. A null embedding is expected (the
  -- embedding provider was down; the entry is still filed) and gets backfilled.
  CONSTRAINT knowledge_entry_embedding_provenance CHECK (
    (embedding IS NULL AND embedding_model IS NULL AND embedding_dims IS NULL)
    OR (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedding_dims IS NOT NULL)
  )
);

COMMENT ON TABLE public.knowledge_entry IS
  'Permanent ad hoc company knowledge. Readable by every internal user, writable only by its creator.';

CREATE OR REPLACE FUNCTION public.update_knowledge_entry_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS knowledge_entry_set_updated_at ON public.knowledge_entry;
CREATE TRIGGER knowledge_entry_set_updated_at
  BEFORE UPDATE ON public.knowledge_entry
  FOR EACH ROW EXECUTE FUNCTION public.update_knowledge_entry_updated_at();

CREATE INDEX IF NOT EXISTS knowledge_entry_created_idx
  ON public.knowledge_entry (created_at DESC);
CREATE INDEX IF NOT EXISTS knowledge_entry_user_created_idx
  ON public.knowledge_entry (user_id, created_at DESC);
-- Backfill queue: rows whose embedding call failed at filing time.
CREATE INDEX IF NOT EXISTS knowledge_entry_embedding_missing_idx
  ON public.knowledge_entry (created_at) WHERE embedding IS NULL;
-- Re-embed planning: "which entries are on the old model?"
CREATE INDEX IF NOT EXISTS knowledge_entry_embedding_model_idx
  ON public.knowledge_entry (embedding_model);
-- No vector index yet: nothing searches `embedding`, and the right index (and
-- its lists/probes) depends on the row count when search is actually built.

-- ---------------------------------------------------------------------------
-- knowledge_entry_link — an entry may link to MANY objects, across types
-- ---------------------------------------------------------------------------
-- object_id is deliberately NOT a foreign key: one column points at four
-- different tables. Ids are verified against the live tables by the edge
-- function before filing.
CREATE TABLE IF NOT EXISTS public.knowledge_entry_link (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id    uuid NOT NULL REFERENCES public.knowledge_entry(id) ON DELETE CASCADE,
  -- 'account' is the public.client table (OVIS has no `account` table); the
  -- other three match their table names.
  object_type text NOT NULL CHECK (object_type IN ('account', 'deal', 'property', 'contact')),
  object_id   uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, object_type, object_id)
);

CREATE INDEX IF NOT EXISTS knowledge_entry_link_object_idx
  ON public.knowledge_entry_link (object_type, object_id);
CREATE INDEX IF NOT EXISTS knowledge_entry_link_entry_idx
  ON public.knowledge_entry_link (entry_id);

-- ---------------------------------------------------------------------------
-- knowledge_entry_tag — free-form topic tags ('construction costs', …)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knowledge_entry_tag (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id   uuid NOT NULL REFERENCES public.knowledge_entry(id) ON DELETE CASCADE,
  tag        text NOT NULL CHECK (length(btrim(tag)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, tag)
);

CREATE INDEX IF NOT EXISTS knowledge_entry_tag_tag_idx
  ON public.knowledge_entry_tag (tag);
CREATE INDEX IF NOT EXISTS knowledge_entry_tag_entry_idx
  ON public.knowledge_entry_tag (entry_id);

-- ---------------------------------------------------------------------------
-- knowledge_capture_correction — training signal
-- ---------------------------------------------------------------------------
-- One row per filed entry whose saved state differs from what the model first
-- proposed. proposal_model records which chat model produced `proposed`, so a
-- model swap can be judged (did tagging get better or worse?) instead of guessed.
CREATE TABLE IF NOT EXISTS public.knowledge_capture_correction (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id       uuid NOT NULL REFERENCES public.knowledge_entry(id) ON DELETE CASCADE,
  proposed       jsonb NOT NULL,
  accepted       jsonb NOT NULL,
  proposal_model text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_capture_correction_entry_idx
  ON public.knowledge_capture_correction (entry_id);
CREATE INDEX IF NOT EXISTS knowledge_capture_correction_model_idx
  ON public.knowledge_capture_correction (proposal_model, created_at DESC);

-- ---------------------------------------------------------------------------
-- RLS — read: every internal user. write: the creator only.
-- ---------------------------------------------------------------------------
-- is_internal_user() is the existing SECURITY DEFINER helper (admin, broker_full,
-- broker_lite, va). It keeps coach and portal users out, and it never joins
-- auth.users directly — the authenticated role can't read that table.
ALTER TABLE public.knowledge_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entry_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_entry_tag ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_capture_correction ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_entry_select_internal ON public.knowledge_entry;
CREATE POLICY knowledge_entry_select_internal ON public.knowledge_entry
  FOR SELECT TO authenticated USING (public.is_internal_user());

DROP POLICY IF EXISTS knowledge_entry_insert_own ON public.knowledge_entry;
CREATE POLICY knowledge_entry_insert_own ON public.knowledge_entry
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.is_internal_user());

-- Child rows follow their entry: readable by internal users, writable only while
-- you own the entry they hang off.
DROP POLICY IF EXISTS knowledge_entry_link_select_internal ON public.knowledge_entry_link;
CREATE POLICY knowledge_entry_link_select_internal ON public.knowledge_entry_link
  FOR SELECT TO authenticated USING (public.is_internal_user());

DROP POLICY IF EXISTS knowledge_entry_link_insert_own ON public.knowledge_entry_link;
CREATE POLICY knowledge_entry_link_insert_own ON public.knowledge_entry_link
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.knowledge_entry e
    WHERE e.id = entry_id AND e.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS knowledge_entry_tag_select_internal ON public.knowledge_entry_tag;
CREATE POLICY knowledge_entry_tag_select_internal ON public.knowledge_entry_tag
  FOR SELECT TO authenticated USING (public.is_internal_user());

DROP POLICY IF EXISTS knowledge_entry_tag_insert_own ON public.knowledge_entry_tag;
CREATE POLICY knowledge_entry_tag_insert_own ON public.knowledge_entry_tag
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.knowledge_entry e
    WHERE e.id = entry_id AND e.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS knowledge_capture_correction_select_internal ON public.knowledge_capture_correction;
CREATE POLICY knowledge_capture_correction_select_internal ON public.knowledge_capture_correction
  FOR SELECT TO authenticated USING (public.is_internal_user());

DROP POLICY IF EXISTS knowledge_capture_correction_insert_own ON public.knowledge_capture_correction;
CREATE POLICY knowledge_capture_correction_insert_own ON public.knowledge_capture_correction
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.knowledge_entry e
    WHERE e.id = entry_id AND e.user_id = auth.uid()
  ));

-- Grants. This database has ALTER DEFAULT PRIVILEGES in `public` handing anon,
-- authenticated and service_role ALL privileges on every new table, so a table
-- created here already carries UPDATE/DELETE/TRUNCATE for both API roles. RLS
-- (no UPDATE/DELETE policy above) is what actually blocks them, which makes the
-- "no edit, no delete" rule depend on nobody ever adding a permissive policy.
-- Revoke the privileges too, so the rule holds at two levels:
--   * authenticated keeps SELECT + INSERT only
--   * anon keeps nothing (the portal runs as authenticated; anon never reads this)
-- service_role is left untouched — the edge function files through it.
REVOKE ALL ON public.knowledge_entry FROM anon;
REVOKE ALL ON public.knowledge_entry_link FROM anon;
REVOKE ALL ON public.knowledge_entry_tag FROM anon;
REVOKE ALL ON public.knowledge_capture_correction FROM anon;

REVOKE ALL ON public.knowledge_entry FROM authenticated;
REVOKE ALL ON public.knowledge_entry_link FROM authenticated;
REVOKE ALL ON public.knowledge_entry_tag FROM authenticated;
REVOKE ALL ON public.knowledge_capture_correction FROM authenticated;

GRANT SELECT, INSERT ON public.knowledge_entry TO authenticated;
GRANT SELECT, INSERT ON public.knowledge_entry_link TO authenticated;
GRANT SELECT, INSERT ON public.knowledge_entry_tag TO authenticated;
GRANT SELECT, INSERT ON public.knowledge_capture_correction TO authenticated;

-- ---------------------------------------------------------------------------
-- file_knowledge_entry — entry + links + tags + correction in ONE transaction
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER (the default) on purpose: every insert below passes through
-- the RLS policies above as the calling user, so this function grants no
-- privilege the caller doesn't already have. It exists for atomicity — a filed
-- entry with half its links is worse than a failed file.
--
-- p_embedding arrives as TEXT ('[0.1,-0.2,…]') and is cast here, so callers
-- (PostgREST/supabase-js) never need the vector type in their search_path.
CREATE OR REPLACE FUNCTION public.file_knowledge_entry(
  p_raw_text        text,
  p_clean_text      text,
  p_source          text,
  p_is_general      boolean,
  p_links           jsonb,   -- [{"object_type":"deal","object_id":"uuid"}, …]
  p_tags            text[],
  p_embedding       text     DEFAULT NULL,
  p_embedding_model text     DEFAULT NULL,
  p_embedding_dims  integer  DEFAULT NULL,
  p_proposed        jsonb    DEFAULT NULL,
  p_accepted        jsonb    DEFAULT NULL,
  p_proposal_model  text     DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  INSERT INTO public.knowledge_entry (
    raw_text, clean_text, source, is_general, embedding, embedding_model, embedding_dims
  ) VALUES (
    p_raw_text,
    p_clean_text,
    COALESCE(p_source, 'typed'),
    COALESCE(p_is_general, false),
    CASE WHEN p_embedding IS NULL THEN NULL ELSE p_embedding::extensions.vector END,
    p_embedding_model,
    p_embedding_dims
  )
  RETURNING id INTO v_entry_id;

  -- ON CONFLICT: the UI can't produce duplicates, but a double-submit shouldn't
  -- fail the whole file.
  INSERT INTO public.knowledge_entry_link (entry_id, object_type, object_id)
  SELECT v_entry_id, l->>'object_type', (l->>'object_id')::uuid
  FROM jsonb_array_elements(COALESCE(p_links, '[]'::jsonb)) AS l
  ON CONFLICT (entry_id, object_type, object_id) DO NOTHING;

  INSERT INTO public.knowledge_entry_tag (entry_id, tag)
  SELECT DISTINCT v_entry_id, btrim(t)
  FROM unnest(COALESCE(p_tags, ARRAY[]::text[])) AS t
  WHERE length(btrim(t)) > 0
  ON CONFLICT (entry_id, tag) DO NOTHING;

  -- Only when the caller determined the saved state differs from the proposal.
  IF p_proposed IS NOT NULL AND p_accepted IS NOT NULL THEN
    INSERT INTO public.knowledge_capture_correction (entry_id, proposed, accepted, proposal_model)
    VALUES (v_entry_id, p_proposed, p_accepted, p_proposal_model);
  END IF;

  RETURN v_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.file_knowledge_entry(
  text, text, text, boolean, jsonb, text[], text, text, integer, jsonb, jsonb, text
) TO authenticated;
