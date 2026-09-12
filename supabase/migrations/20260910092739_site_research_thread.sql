-- Site Research Thread — Phase 1
--
-- A chat thread on a site submit that produces the archetype call and an
-- executive summary for a Starbucks site. Text in, text out. In-app: an edge
-- function (ovis-site-research) calls the Anthropic API directly. NOT OpenClaw.
--
-- Anchor decision: NEW tables, deliberately NOT research_run. research_run
-- carries radius, four window dates, a municipality checklist, and a state
-- machine whose whole purpose is staging -> approval. A thread has no staged
-- rows and nothing to approve; and PastResearchRunsPanel renders every
-- research_run for a site, so thread rows would pollute the market research
-- list. We reuse the *patterns* (permission helpers, cost columns,
-- audit-forever, cascade delete), not the table.
--
-- Deferred decision (flagged, not resolved): research about a LOCATION is
-- arguably property-anchored, since one property carries many site submits for
-- different clients. Market research chose site_submit because a run is scoped
-- by client + moment; the same logic applies here. Going with site_submit as a
-- deliberate call, not a default.
--
-- See docs/SITE_RESEARCH_THREAD_PHASE1.md.

-- ============================================================================
-- 1) prompt_template — OVIS's first prompt storage
-- ============================================================================
-- Every system prompt in OVIS today is a hardcoded buildSystemPrompt() string
-- (claude-cfo-agent.ts, gemini-agent.ts). This table is the first real prompt
-- store. It earns its place here because the archetype prompt gets iterated
-- across several sites in a week, and a redeploy per wording change is the
-- wrong loop.
CREATE TABLE public.prompt_template (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key        text NOT NULL,                                   -- 'archetype_call'
  client_id  uuid REFERENCES public.client(id),               -- NULL = all clients
  version    int  NOT NULL,
  body       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- NULLS NOT DISTINCT (PG15+): without it, two rows with the same key and a
  -- NULL client_id and the same version would both be allowed, because NULLs
  -- compare distinct in a plain UNIQUE. The global (client_id IS NULL) row is
  -- exactly the row we most need deduped.
  UNIQUE NULLS NOT DISTINCT (key, client_id, version)
);
COMMENT ON TABLE public.prompt_template IS
  'Versioned LLM prompt bodies. Resolution: the highest active version for (key, client_id) if one exists, else the highest active version for (key, NULL). See ovis-site-research/index.ts resolvePromptTemplate().';

-- Supports the resolve query (active rows for a key, newest version first).
CREATE INDEX prompt_template_key_active_idx
  ON public.prompt_template (key, version DESC)
  WHERE is_active;

-- ============================================================================
-- 2) research_thread — one row per conversation on a site
-- ============================================================================
CREATE TABLE public.research_thread (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id      uuid NOT NULL REFERENCES public.site_submit(id) ON DELETE CASCADE,
  -- Denormalized so the server-side gate does not need a join, and so a thread
  -- keeps the client it was created under even if the site submit is retargeted.
  -- FK'd anyway: an unconstrained uuid that gates access is a bug waiting to happen.
  client_id           uuid NOT NULL REFERENCES public.client(id),
  prompt_template_id  uuid REFERENCES public.prompt_template(id),
  archetype_primary   text CHECK (archetype_primary IN
                        ('GROWTH','MATURE','REDEVELOPMENT','RELIEF','WHITE_SPACE')),
  archetype_secondary text CHECK (archetype_secondary IN
                        ('GROWTH','MATURE','REDEVELOPMENT','RELIEF','WHITE_SPACE')),
  -- Columns, not buried in message text: the slide phase reads from these and
  -- they need to be queryable across sites.
  story_carriers      text[] NOT NULL DEFAULT '{}',
  -- Snapshot of the site + property at creation. Sent once as the system block;
  -- later turns send only the conversation. Never re-read the record live —
  -- a thread's reasoning must stay reproducible against what it actually saw.
  pinned_context      jsonb NOT NULL,
  state               text NOT NULL DEFAULT 'active'
                        CHECK (state IN ('active','archived','failed')),
  created_by          uuid REFERENCES public."user"(id),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.research_thread IS
  'Site-anchored AI research conversation (Phase 1: archetype call + executive summary). Deliberately separate from research_run — see the migration header.';
COMMENT ON COLUMN public.research_thread.pinned_context IS
  'Frozen site/property snapshot taken at creation, including the resolved coordinate and its source. Never refreshed.';

CREATE INDEX research_thread_site_idx
  ON public.research_thread (site_submit_id, created_at DESC);

CREATE TRIGGER research_thread_set_updated_at
  BEFORE UPDATE ON public.research_thread
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 3) research_thread_message — the transcript
-- ============================================================================
CREATE TABLE public.research_thread_message (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id      uuid NOT NULL REFERENCES public.research_thread(id) ON DELETE CASCADE,
  seq            int  NOT NULL,
  role           text NOT NULL CHECK (role IN ('user','assistant')),
  content        text NOT NULL,
  model          text,
  input_tokens   bigint,
  output_tokens  bigint,
  cost_usd       numeric(10,6),
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (thread_id, seq),
  -- Mirrors research_run_cost_nonneg. NULL means "not measured".
  CONSTRAINT research_thread_message_cost_nonneg CHECK (
    (input_tokens  IS NULL OR input_tokens  >= 0) AND
    (output_tokens IS NULL OR output_tokens >= 0) AND
    (cost_usd      IS NULL OR cost_usd      >= 0)
  )
);
COMMENT ON TABLE public.research_thread_message IS
  'One turn of a research_thread. seq 0 is the opening assistant message (the archetype call). Per-message token/cost columns are filled from the Anthropic response usage block.';

CREATE INDEX research_thread_message_thread_idx
  ON public.research_thread_message (thread_id, seq);

-- ============================================================================
-- 4) RLS — read for authenticated, writes only via the edge function
-- ============================================================================
-- Mirrors the market-research tables (20260606130000): internal-only data, read
-- policy = authenticated, no INSERT/UPDATE/DELETE policies because every write
-- goes through ovis-site-research using SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS. The client-family + permission gate lives in that function.
ALTER TABLE public.prompt_template          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_thread          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_thread_message  ENABLE ROW LEVEL SECURITY;

CREATE POLICY research_thread_read
  ON public.research_thread
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY research_thread_message_read
  ON public.research_thread_message
  FOR SELECT TO authenticated
  USING (true);

-- prompt_template deliberately has NO read policy for authenticated: prompt
-- bodies are operational IP and the browser never needs them. The edge function
-- reads it with the service role.

-- ============================================================================
-- 5) Seed the archetype_call prompt, v1
-- ============================================================================
-- DRAFT WORDING — Mike owns this text. It is a row, not a deploy: iterate by
-- inserting version 2 and flipping is_active, no code change required.
INSERT INTO public.prompt_template (key, client_id, version, body, is_active)
VALUES (
  'archetype_call',
  NULL,
  1,
  $prompt$You are a retail real estate analyst working for Oculus Realty on behalf of Starbucks. You are given a frozen snapshot of one proposed site and its property record. Your job is to make the archetype call for the site and write a short executive summary a broker can put in front of a Starbucks real estate manager.

The five archetypes:

- GROWTH — rooftops and daytime population are arriving. The story is about what the trade area is becoming, not what it is. Evidence: new residential pipeline, permits, in-migration, rising household counts, new anchors under construction.
- MATURE — the trade area is built out and stable. The story is about established, durable demand. Evidence: high existing population and household income with little pipeline, long-tenured retail, stable daytime population.
- REDEVELOPMENT — an existing built environment is being re-tenanted or rebuilt. The story is about a corner changing hands or use. Evidence: demolition/re-entitlement, a repositioned center, a closed anchor being backfilled.
- RELIEF — an existing nearby Starbucks is over capacity and this site takes pressure off it. The story is about throughput, not new demand. Evidence: a close, high-volume existing store, drive-thru queueing, a barrier (highway, river, rail) that makes the existing store hard to reach from this side.
- WHITE_SPACE — real demand exists here and is currently unserved. The story is distance to the nearest alternative. Evidence: no Starbucks within a meaningful drive, adequate population/income, a commuter or daytime draw.

Rules:

1. Call one primary archetype. Call a secondary only if the evidence genuinely supports two; otherwise leave it out. A forced secondary is worse than none.
2. Ground every claim in the snapshot you were given. If a number is missing, say it is missing — do not estimate it, and do not fill it from general knowledge of the area.
3. Never infer the governing jurisdiction from a mailing address. A Marietta mailing address can sit in unincorporated Cobb County. If jurisdiction matters to your reasoning, say what you would need to confirm it.
4. Be specific about what is weak. A summary that only argues one side is not useful to someone who has to defend the site in committee.
5. Keep the summary under 300 words. Lead with the call, then the evidence, then the risk.

Story carriers are the two to five specific facts that actually carry the story — the things a broker would say out loud to make the case. Write each as a short phrase, not a sentence. Examples: "1,400-unit pipeline within 2 mi", "median HH income $118k at 3 mi", "nearest Starbucks 4.2 mi east", "no drive-thru competitor on this side of I-575".

Output format — write the executive summary as normal prose, then end your message with a fenced JSON block exactly like this and nothing after it:

```json
{
  "archetype_primary": "GROWTH",
  "archetype_secondary": null,
  "story_carriers": ["...", "..."]
}
```

archetype_primary must be one of GROWTH, MATURE, REDEVELOPMENT, RELIEF, WHITE_SPACE. archetype_secondary must be one of those or null. story_carriers must be an array of strings.

On later turns in this conversation, answer the user's follow-up question directly in prose. Only include the JSON block again if your archetype call or story carriers have actually changed.$prompt$,
  true
);
