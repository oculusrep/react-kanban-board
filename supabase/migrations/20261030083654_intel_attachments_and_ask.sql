-- Intel: file attachments (Dropbox + extracted, embedded text) and Ask mode search.
-- Docs: docs/INTEL_ATTACHMENTS_AND_ASK_PLAN.md
--
--   knowledge_entry_file   one row per attached file (Dropbox PATH only — never a
--                          shared link; files open through a per-click temporary
--                          link from ovis-knowledge-capture, internal users only)
--   knowledge_file_chunk   the file's text in ~1,500-token pieces, each embedded
--   knowledge_entry.tsv    keyword index over the note text
--   intel_search()         Ask's retrieval: meaning + keyword + tag + linked record
--
-- Access: internal users READ (is_internal_user()); only the edge function writes
-- (service_role), after its own is_internal_user() gate and an entry-ownership
-- check. Portal, coach and anon get nothing.

-- ---------------------------------------------------------------------------
-- knowledge_entry_file
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knowledge_entry_file (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        uuid NOT NULL REFERENCES public.knowledge_entry(id) ON DELETE CASCADE,
  -- auth.uid() of the uploader (the entry's owner — enforced by the edge function).
  created_by      uuid NOT NULL,
  dropbox_path    text NOT NULL UNIQUE CHECK (dropbox_path LIKE '/Salesforce Documents/Intel/%'),
  dropbox_folder  text NOT NULL CHECK (dropbox_folder LIKE '/Salesforce Documents/Intel/%'),
  filename        text NOT NULL,
  file_ext        text NOT NULL,
  mime_type       text,
  -- 50 MB cap, same as the panel's.
  size_bytes      bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 52428800),
  status          text NOT NULL DEFAULT 'uploading' CHECK (status IN (
                    'uploading',      -- upload link issued, bytes not confirmed yet
                    'upload_failed',
                    'pending',        -- in Dropbox, waiting for extraction
                    'extracting',
                    'done',           -- all text indexed
                    'truncated',      -- indexed up to a cap; the rest is in Dropbox only
                    'no_text',        -- nothing readable, even after reading scans
                    'unsupported',    -- stored and linked, not indexed (images, .doc)
                    'failed')),
  status_note     text,
  page_count      integer,
  char_count      integer NOT NULL DEFAULT 0,
  -- Extraction progress, so a long file is read across several short requests.
  read_cursor     integer NOT NULL DEFAULT 0,   -- next page (PDF) to read
  scanned_pages   integer[] NOT NULL DEFAULT '{}', -- PDF pages with no text layer
  ocr_cursor      integer NOT NULL DEFAULT 0,   -- index into scanned_pages
  next_ord        integer NOT NULL DEFAULT 0,   -- next chunk ord
  attempts        integer NOT NULL DEFAULT 0,   -- consecutive failed steps
  lock_until      timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS knowledge_entry_file_entry_idx ON public.knowledge_entry_file (entry_id);
CREATE INDEX IF NOT EXISTS knowledge_entry_file_open_idx
  ON public.knowledge_entry_file (created_by, status) WHERE status IN ('pending', 'extracting');

CREATE OR REPLACE FUNCTION public.update_knowledge_entry_file_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS knowledge_entry_file_updated_at ON public.knowledge_entry_file;
CREATE TRIGGER knowledge_entry_file_updated_at
  BEFORE UPDATE ON public.knowledge_entry_file
  FOR EACH ROW EXECUTE FUNCTION public.update_knowledge_entry_file_updated_at();

-- ---------------------------------------------------------------------------
-- knowledge_file_chunk
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.knowledge_file_chunk (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id         uuid NOT NULL REFERENCES public.knowledge_entry_file(id) ON DELETE CASCADE,
  -- Denormalised from the file for search; follows it on delete.
  entry_id        uuid NOT NULL REFERENCES public.knowledge_entry(id) ON DELETE CASCADE,
  ord             integer NOT NULL,
  -- Where in the file: "p. 4–5", "Sheet: Rent roll, rows 1–80". Shown in citations.
  locator         text,
  -- 'text' (text layer / docx / xlsx) or 'scan' (read from page images by Claude).
  method          text NOT NULL DEFAULT 'text' CHECK (method IN ('text', 'scan')),
  content         text NOT NULL CHECK (length(content) > 0),
  tsv             tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
  embedding       extensions.vector(1536),
  embedding_model text,
  embedding_dims  integer,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (file_id, ord),
  CONSTRAINT knowledge_file_chunk_embedding_provenance CHECK (
    (embedding IS NULL AND embedding_model IS NULL AND embedding_dims IS NULL)
    OR (embedding IS NOT NULL AND embedding_model IS NOT NULL AND embedding_dims IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS knowledge_file_chunk_file_idx ON public.knowledge_file_chunk (file_id);
CREATE INDEX IF NOT EXISTS knowledge_file_chunk_entry_idx ON public.knowledge_file_chunk (entry_id);
CREATE INDEX IF NOT EXISTS knowledge_file_chunk_tsv_idx ON public.knowledge_file_chunk USING gin (tsv);
-- No vector index yet: a sequential scan is exact and fast at this size. Add HNSW
-- past ~5,000 chunks.

-- ---------------------------------------------------------------------------
-- Keyword index on notes
-- ---------------------------------------------------------------------------
ALTER TABLE public.knowledge_entry
  ADD COLUMN IF NOT EXISTS tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', clean_text)) STORED;
CREATE INDEX IF NOT EXISTS knowledge_entry_tsv_idx ON public.knowledge_entry USING gin (tsv);

-- ---------------------------------------------------------------------------
-- RLS + grants: internal users read; nobody but service_role writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.knowledge_entry_file ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_file_chunk ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS knowledge_entry_file_select_internal ON public.knowledge_entry_file;
CREATE POLICY knowledge_entry_file_select_internal ON public.knowledge_entry_file
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

DROP POLICY IF EXISTS knowledge_file_chunk_select_internal ON public.knowledge_file_chunk;
CREATE POLICY knowledge_file_chunk_select_internal ON public.knowledge_file_chunk
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.knowledge_entry_file FROM anon, authenticated;
REVOKE ALL ON public.knowledge_file_chunk FROM anon, authenticated;
GRANT SELECT ON public.knowledge_entry_file TO authenticated;
GRANT SELECT ON public.knowledge_file_chunk TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_entry_file TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.knowledge_file_chunk TO service_role;

-- ---------------------------------------------------------------------------
-- Extraction steps (service_role only)
-- ---------------------------------------------------------------------------
-- Claim a file for one extraction step. Returns the row only if nobody else holds
-- it, so two tabs (or a retry) never read the same file at once.
CREATE OR REPLACE FUNCTION public.knowledge_file_claim(p_file_id uuid, p_seconds integer DEFAULT 180)
RETURNS SETOF public.knowledge_entry_file
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.knowledge_entry_file
     SET lock_until = now() + make_interval(secs => p_seconds),
         status = CASE WHEN status = 'pending' THEN 'extracting' ELSE status END
   WHERE id = p_file_id
     AND status IN ('pending', 'extracting')
     AND (lock_until IS NULL OR lock_until < now())
  RETURNING *;
$$;

-- Save one step atomically: its chunks, the new progress, and the lock released.
-- Chunks at ord >= p_first_ord are replaced, so a step that died after writing
-- (or is retried) never leaves duplicates.
CREATE OR REPLACE FUNCTION public.knowledge_file_save_step(
  p_file_id  uuid,
  p_chunks   jsonb,     -- [{ord, locator, method, content, embedding (text), embedding_model, embedding_dims}]
  p_progress jsonb      -- columns to set on the file row
) RETURNS void
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_entry uuid;
  v_first integer;
BEGIN
  SELECT entry_id INTO v_entry FROM public.knowledge_entry_file WHERE id = p_file_id FOR UPDATE;
  IF v_entry IS NULL THEN RAISE EXCEPTION 'file % not found', p_file_id; END IF;

  SELECT min((c->>'ord')::int) INTO v_first FROM jsonb_array_elements(coalesce(p_chunks, '[]'::jsonb)) c;
  IF v_first IS NOT NULL THEN
    DELETE FROM public.knowledge_file_chunk WHERE file_id = p_file_id AND ord >= v_first;
    INSERT INTO public.knowledge_file_chunk
      (file_id, entry_id, ord, locator, method, content, embedding, embedding_model, embedding_dims)
    SELECT p_file_id, v_entry, (c->>'ord')::int, c->>'locator', coalesce(c->>'method', 'text'), c->>'content',
           CASE WHEN c->>'embedding' IS NULL THEN NULL ELSE (c->>'embedding')::extensions.vector END,
           c->>'embedding_model', (c->>'embedding_dims')::int
      FROM jsonb_array_elements(p_chunks) c;
  END IF;

  UPDATE public.knowledge_entry_file f SET
    status        = coalesce(p_progress->>'status', f.status),
    status_note   = CASE WHEN p_progress ? 'status_note' THEN p_progress->>'status_note' ELSE f.status_note END,
    page_count    = coalesce((p_progress->>'page_count')::int, f.page_count),
    char_count    = coalesce((p_progress->>'char_count')::int, f.char_count),
    read_cursor   = coalesce((p_progress->>'read_cursor')::int, f.read_cursor),
    scanned_pages = CASE WHEN p_progress ? 'scanned_pages'
                         THEN ARRAY(SELECT jsonb_array_elements_text(p_progress->'scanned_pages')::int)
                         ELSE f.scanned_pages END,
    ocr_cursor    = coalesce((p_progress->>'ocr_cursor')::int, f.ocr_cursor),
    next_ord      = coalesce((p_progress->>'next_ord')::int, f.next_ord),
    attempts      = 0,
    lock_until    = NULL
  WHERE f.id = p_file_id;
END $$;

-- A step that threw: count it and release the lock. After p_max consecutive
-- failures the file is marked failed (stored in Dropbox, not searchable).
CREATE OR REPLACE FUNCTION public.knowledge_file_fail_step(p_file_id uuid, p_error text, p_max integer DEFAULT 3)
RETURNS text
LANGUAGE sql
SET search_path = public, pg_temp
AS $$
  UPDATE public.knowledge_entry_file
     SET attempts    = attempts + 1,
         lock_until  = NULL,
         status      = CASE WHEN attempts + 1 >= p_max THEN 'failed' ELSE status END,
         status_note = left(p_error, 500)
   WHERE id = p_file_id
  RETURNING status;
$$;

REVOKE ALL ON FUNCTION public.knowledge_file_fail_step(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_file_fail_step(uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.knowledge_file_claim(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.knowledge_file_save_step(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.knowledge_file_claim(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.knowledge_file_save_step(uuid, jsonb, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- intel_search — Ask mode retrieval
-- ---------------------------------------------------------------------------
-- SECURITY INVOKER: every table read goes through the caller's RLS, so a caller
-- who isn't internal gets zero rows (the edge function refuses them earlier too).
-- Four candidate sources, merged by reciprocal rank fusion (k = 60):
--   meaning   cosine similarity of note / chunk embeddings to the question
--   keyword   any of the question's words (OR, not AND — a question carries
--             words its answer doesn't), ranked by ts_rank_cd
--   tag       a note tag that appears as a whole word in the question
--   linked    a note linked to a record named in the question (the record's
--             full name, or its first word if that's 4+ letters: "Chipotle")
-- `similarity` is returned so the caller can apply its relevance floor.
CREATE OR REPLACE FUNCTION public.intel_search(
  p_query     text,
  p_embedding text DEFAULT NULL,
  p_limit     integer DEFAULT 12
) RETURNS TABLE (
  source_kind      text,        -- 'note' | 'file'
  entry_id         uuid,
  file_id          uuid,
  chunk_id         uuid,
  content          text,
  locator          text,
  filename         text,
  entry_created_at timestamptz,
  author_name      text,
  similarity       double precision,
  matched          text[],
  score            double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions, pg_temp
AS $$
WITH q AS (
  SELECT CASE WHEN p_embedding IS NULL THEN NULL ELSE p_embedding::extensions.vector END AS v,
         lower(coalesce(p_query, '')) AS lq,
         nullif(replace(plainto_tsquery('english', coalesce(p_query, ''))::text, ' & ', ' | '), '') AS tq_text
),
tq AS (
  SELECT CASE WHEN q.tq_text IS NULL THEN NULL ELSE q.tq_text::tsquery END AS t FROM q
),
note_vec AS (
  SELECT e.id AS entry_id, 1 - (e.embedding <=> q.v) AS sim,
         row_number() OVER (ORDER BY e.embedding <=> q.v) AS rk
    FROM public.knowledge_entry e, q
   WHERE q.v IS NOT NULL AND e.embedding IS NOT NULL
   ORDER BY e.embedding <=> q.v LIMIT 20
),
note_kw AS (
  SELECT e.id AS entry_id, row_number() OVER (ORDER BY ts_rank_cd(e.tsv, tq.t) DESC) AS rk
    FROM public.knowledge_entry e, tq
   WHERE tq.t IS NOT NULL AND e.tsv @@ tq.t
   ORDER BY ts_rank_cd(e.tsv, tq.t) DESC LIMIT 20
),
note_tag AS (
  SELECT DISTINCT t.entry_id
    FROM public.knowledge_entry_tag t, q
   WHERE length(btrim(t.tag)) >= 3
     AND q.lq ~ ('\m' || regexp_replace(lower(btrim(t.tag)), '([^a-z0-9 ])', '\\\1', 'g') || '\M')
),
linked_names AS (
  SELECT l.entry_id,
         lower(btrim(coalesce(c.client_name, d.deal_name, p.property_name,
                              nullif(btrim(concat_ws(' ', ct.first_name, ct.last_name)), '')))) AS name
    FROM public.knowledge_entry_link l
    LEFT JOIN public.client   c  ON l.object_type = 'account'  AND c.id  = l.object_id
    LEFT JOIN public.deal     d  ON l.object_type = 'deal'     AND d.id  = l.object_id
    LEFT JOIN public.property p  ON l.object_type = 'property' AND p.id  = l.object_id
    LEFT JOIN public.contact  ct ON l.object_type = 'contact'  AND ct.id = l.object_id
),
note_link AS (
  SELECT DISTINCT n.entry_id
    FROM linked_names n, q
   WHERE n.name IS NOT NULL AND length(n.name) >= 3
     AND (position(n.name IN q.lq) > 0
          OR (length(split_part(regexp_replace(n.name, '[^a-z0-9 ]', ' ', 'g'), ' ', 1)) >= 4
              AND q.lq ~ ('\m' || split_part(regexp_replace(n.name, '[^a-z0-9 ]', ' ', 'g'), ' ', 1) || '\M')))
),
chunk_vec AS (
  SELECT k.id AS chunk_id, 1 - (k.embedding <=> q.v) AS sim,
         row_number() OVER (ORDER BY k.embedding <=> q.v) AS rk
    FROM public.knowledge_file_chunk k, q
   WHERE q.v IS NOT NULL AND k.embedding IS NOT NULL
   ORDER BY k.embedding <=> q.v LIMIT 20
),
chunk_kw AS (
  SELECT k.id AS chunk_id, row_number() OVER (ORDER BY ts_rank_cd(k.tsv, tq.t) DESC) AS rk
    FROM public.knowledge_file_chunk k, tq
   WHERE tq.t IS NOT NULL AND k.tsv @@ tq.t
   ORDER BY ts_rank_cd(k.tsv, tq.t) DESC LIMIT 20
),
cands AS (
  SELECT 'note'::text AS kind, entry_id, NULL::uuid AS chunk_id, (1.0 / (60 + rk))::double precision AS s, sim, 'meaning'::text AS why FROM note_vec
  UNION ALL SELECT 'note', entry_id, NULL, (1.0 / (60 + rk))::double precision, NULL, 'keyword' FROM note_kw
  UNION ALL SELECT 'note', entry_id, NULL, (1.0 / 61)::double precision, NULL, 'tag' FROM note_tag
  UNION ALL SELECT 'note', entry_id, NULL, (1.0 / 61)::double precision, NULL, 'linked record' FROM note_link
  UNION ALL SELECT 'file', NULL, chunk_id, (1.0 / (60 + rk))::double precision, sim, 'meaning' FROM chunk_vec
  UNION ALL SELECT 'file', NULL, chunk_id, (1.0 / (60 + rk))::double precision, NULL, 'keyword' FROM chunk_kw
),
agg AS (
  SELECT kind, entry_id, chunk_id, sum(s) AS score, max(sim) AS sim, array_agg(DISTINCT why) AS matched
    FROM cands
   GROUP BY kind, entry_id, chunk_id
)
SELECT a.kind,
       coalesce(a.entry_id, k.entry_id),
       k.file_id,
       a.chunk_id,
       coalesce(k.content, e.clean_text),
       k.locator,
       f.filename,
       e.created_at,
       u.name,
       a.sim,
       a.matched,
       a.score
  FROM agg a
  LEFT JOIN public.knowledge_file_chunk k ON k.id = a.chunk_id
  LEFT JOIN public.knowledge_entry_file f ON f.id = k.file_id
  JOIN public.knowledge_entry e ON e.id = coalesce(a.entry_id, k.entry_id)
  LEFT JOIN public."user" u ON u.auth_user_id = e.user_id
 ORDER BY a.score DESC
 LIMIT greatest(1, least(coalesce(p_limit, 12), 30));
$$;

REVOKE ALL ON FUNCTION public.intel_search(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.intel_search(text, text, integer) TO authenticated, service_role;
