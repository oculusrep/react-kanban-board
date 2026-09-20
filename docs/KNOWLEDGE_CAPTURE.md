# Knowledge Capture

**Status (2026-09-20):** built on branch `feature/knowledge-capture` (worktree `../react-kanban-board-knowledge-capture`). Migration applied and recorded on the shared production database; edge function `ovis-knowledge-capture` deployed. Typechecks, builds, 20 unit tests pass. **Not yet exercised in a real browser session** — see [Before this ships](#before-this-ships).

An always-available way to capture ad hoc facts that arrive by phone call, text or scribbled note — "the Starbucks work letter says drywall on the Bridge prototype runs $18/sf". You type the note, the AI tidies it into one fact and proposes which OVIS records and topics it belongs to, you confirm or correct in conversation, and it's filed permanently for the whole company.

**This is not Quick Notes.** Quick Notes ([docs/QUICK_NOTE.md](QUICK_NOTE.md)) is a personal 7-day sticky list: no AI, no tags, private to you, gone in a week. Knowledge Capture is shared, permanent, AI-linked company knowledge. Nothing here touches `quick_note`, and the two are deliberately different colours and icons so they can't be confused.

## Behaviour

- **Launcher:** steel-blue button with a lightbulb, bottom right, stacked directly above the Quick Notes button (navy `+`). Every internal page; not the portal, not `?embedded=true`, not coach users.
- **Shortcut:** Alt+K (Option+K on Mac) toggles. Matched on `e.code === 'KeyK'` so Option+K, which types "˚", still works.
- **Panel:** slides in from the right edge, full height, 460px. No backdrop — you keep working behind it. Closes only on an explicit action (X, Alt+K, or Esc while focus is inside).
- **Capture:** type the note, Enter sends (Shift+Enter for a newline). The AI replies with what it found, what it's unsure about, and at most one question.
- **Editing before filing:** `clean_text` is editable inline. Link and tag chips can be removed; "+ link" opens a picker that searches accounts, deals, properties and contacts. `raw_text` is never editable — "Show what I typed" reveals it read-only.
- **Filing:** the "File it" button is the only thing that files. When the AI's `ready_to_file` is true (you said yes in conversation) the button fills in solid navy; it does not file on its own.
- **After filing:** the panel resets for the next note and stays open. The entry appears in "Recently filed" immediately, before the write completes.
- **Entries never expire.** There is no edit or delete UI, and no UPDATE/DELETE policy or privilege to support one.

## Data

Migration `supabase/migrations/20260920084255_knowledge_capture.sql` (applied + recorded 2026-09-20). Installs **pgvector** — this is OVIS's first vector column.

| table | notes |
|---|---|
| `knowledge_entry` | `raw_text` (never rewritten), `clean_text` (AI-tidied, what retrieval will read), `source` (`typed`/`voice`), `is_general`, `embedding vector(1536)`, `embedding_model`, `embedding_dims` |
| `knowledge_entry_link` | one entry → many objects, across types. `object_type` is `account`/`deal`/`property`/`contact`, unique per `(entry, type, id)` |
| `knowledge_entry_tag` | free-form lowercase topic tags, unique per `(entry, tag)` |
| `knowledge_capture_correction` | `proposed` / `accepted` / `proposal_model` — the training signal |

- **`user_id` is the login id** (`auth.users.id` / `auth.uid()`), like `quick_note.user_id` — *not* `public.user.id`. `ON DELETE RESTRICT`, because company knowledge outlives the account that typed it: reassign an author's entries before deleting their login.
- **`object_id` is deliberately not a foreign key** — one column points at four tables. The edge function verifies every id against the live table instead.
- **`account` means `public.client`.** OVIS has no `account` table; the name is Salesforce heritage.
- **Embedding provenance is all-or-nothing.** A CHECK constraint keeps `embedding`, `embedding_model` and `embedding_dims` set together or all null, so you can always tell what produced a vector. A null embedding is expected (provider was down) and `knowledge_entry_embedding_missing_idx` is the backfill queue.
- **No vector index yet** — nothing searches `embedding`, and the right index depends on the row count when search is actually built.

### RLS

Read: any user `is_internal_user()` accepts (admin, broker_full, broker_lite, va). Write: the creator only, on all four tables (child rows check `knowledge_entry.user_id = auth.uid()`).

**This database grants `anon`, `authenticated` and `service_role` ALL privileges on every new `public` table** via `ALTER DEFAULT PRIVILEGES`. So the migration explicitly revokes them and re-grants `SELECT, INSERT` to `authenticated` only, and nothing to `anon`. Without that, "no edit, no delete" would rest solely on nobody ever adding a permissive policy. Verified by impersonation: a second internal user can read but not tag someone else's entry, a coach sees zero rows and cannot file, and `UPDATE`/`DELETE` fail with "permission denied".

### `file_knowledge_entry`

Entry + links + tags + correction in **one transaction**. `SECURITY INVOKER` on purpose — every insert passes through the RLS policies as the calling user, so the function grants no privilege the caller doesn't have; it exists for atomicity, because a filed entry with half its links is worse than a failed file. `p_embedding` arrives as text (`'[0.1,…]'`) and is cast inside, so callers never need the `vector` type on their `search_path`.

## Edge function `ovis-knowledge-capture`

Two actions, both requiring a user JWT from an internal user (`is_internal_user()` — the UI gate is a convenience, this is the control):

- `{ action: 'converse', messages, entry_draft }` → `{ reply, proposal, ready_to_file, model, cost_usd }`. Stateless: the browser sends the whole exchange each turn. Writes nothing.
- `{ action: 'file', entry }` → `{ entry_id, embedded, embedding_error, correction_written }`.

**It runs synchronously, unlike `ovis-site-research`.** That function had to move to a background queue because Opus with web search blew past Supabase's 150s idle timeout. A turn here is Sonnet plus a few name lookups against Postgres, so the browser can wait.

Tools (read-only, service-role, 8 results each): `search_accounts`, `search_deals`, `search_properties`, `search_contacts`. Each returns enough context to disambiguate — parent account, deal stage and property, contact company — because a bare name list makes the model guess between "Starbucks" and "Starbucks - JW (Coastal GA)".

### Swapping models

Both models are config, not code. `_shared/knowledge-capture/config.ts` is the only place a model string appears, and every value has a Supabase-secret override so a model can change without a deploy:

| secret | default | notes |
|---|---|---|
| `KNOWLEDGE_CHAT_MODEL` | `claude-sonnet-5` | update `CHAT_PRICING` in the same file when you change it |
| `KNOWLEDGE_CHAT_MAX_TOKENS` | 4000 | |
| `KNOWLEDGE_CHAT_EFFORT` | `low` | matching a note to a few records is shallow work and the user is waiting |
| `KNOWLEDGE_EMBEDDING_MODEL` | `text-embedding-3-small` | |
| `KNOWLEDGE_EMBEDDING_DIMENSIONS` | 1536 | **the column is `vector(1536)` — a different width needs a migration first** |

**Every embedding goes through one function**, `createEmbedding(text)` in `embedding.ts`, returning `{ vector, model, dimensions }`. Swapping providers means editing that one function plus the two constants. It records the model the *provider* reports, not the one we asked for, since an alias can resolve to a dated snapshot. Needs the `OPENAI_API_KEY` secret.

### Implementation notes (read before editing)

- **Ids are verified twice, and never trusted from the model.** `verifyLinks` looks up every proposed id in the live table and replaces the name with what the database holds. It runs on each turn *and* again at filing time, because by then the proposal has round-tripped through the browser and is user input. Unverified ids are dropped and reported in the reply, not silently discarded.
- **`is_general` is derived, not trusted.** Real links always win over the flag: `is_general = links.length === 0`. That keeps the column's meaning (belongs to no OVIS object) true to the data, in the function and in the panel.
- **The correction baseline is the model's FIRST proposal**, held in a ref for the whole conversation and never overwritten. So a fix you made by *talking* ("no, that's the Hoschton deal") counts as a correction too, not just chip edits — the signal worth training on is the model's unaided first answer versus the truth. `proposal_model` records which model produced it.
- **Reordering chips or a record being renamed in OVIS is not a correction.** `normalizeProposal` compares link identity `(type, id)` sorted, tags sorted, and whitespace-collapsed text.
- **Structured output is the primary path, with a fallback.** The final answer is constrained by `output_config.format` (json_schema). Because the docs don't explicitly cover combining that with client tools, a 400 naming the format retries once without it and stays without it for the rest of the loop; the prompt also states the JSON shape in prose, and `parseModelJson` accepts fenced and prose-wrapped JSON. **This fallback is unit-tested but has never fired against the real API.**
- **The tool loop is its own module, not site-research's.** `_shared/site-research/loop.ts` is mostly web-search budget and code-execution container handling, neither of which exists here, and its tool-failure wording ("report this category as not determinable") is specific to that feature. The shape is the same: check `stop_reason` before reading content, echo a paused turn verbatim, return every `tool_result` in ONE user message, cap iterations (6).
- **A failed embedding never loses the note.** The entry is filed with a null embedding, the panel marks it "no embedding", and the failure is logged. Losing a captured fact because a provider was down is the worse failure.
- **The prompt lives in code, not `prompt_template`.** One prompt, no per-client variants, and a capture conversation lasts under a minute so nothing needs to replay against the version it started with. Move it if that changes.
- **Tests avoid the npm SDK on purpose.** `types.ts` and `messages.ts` exist so the pure modules can be type-checked by a bare `deno test`; `config.ts` (Anthropic SDK) and `tools.ts` (supabase-js) pull in npm type trees that break it. Run: `deno test --allow-net --allow-env supabase/functions/_shared/knowledge-capture/`.
- **Don't run `deno check --node-modules-dir=auto` in this repo** — it replaces `node_modules` with a Deno symlink farm and breaks `tsc` until you `rm -rf node_modules && npm ci`.

## Code

- `src/components/knowledgeCapture/KnowledgeCaptureLauncher.tsx` — FAB, panel, shortcut, proposal editor
- `src/components/knowledgeCapture/useKnowledgeCapture.ts` — conversation state, editing, filing, recent list
- `src/components/knowledgeCapture/ObjectPicker.tsx` — the "+ link" search
- `supabase/functions/ovis-knowledge-capture/index.ts` — auth, gate, the two actions
- `supabase/functions/_shared/knowledge-capture/` — `config`, `embedding`, `loop`, `tools`, `prompt`, `proposal`, `messages`, `types`, `converse`, `file`, tests
- Mounted in `ProtectedLayout` in `src/App.tsx`, next to `QuickNoteLauncher`

**z-index:** launcher 10006, panel 10008 — above the map slideout band (`useOverlayStack` starts at 10001), below the ~10010 modal/toast tier. See [OVERLAY_STACKING.md](OVERLAY_STACKING.md). Note this does *not* reuse `SlideOutPanel`: that component is `z-50` with a page-dimming backdrop, which would put it underneath map slideouts and block the page you're capturing from.

## Before this ships

The whole path — model turn, tool calls, structured output, filing, embedding — has never run end to end, because no Anthropic credential is available outside the Supabase secret and the function requires a real user JWT. The first browser session should check:

1. Alt+K opens the panel; the two FABs don't overlap.
2. A note like the Starbucks example returns a reply with proposed links and tags — this is the first real test of **structured output alongside tool use**. If the logs show "API rejected the structured output format; retrying without it", the fallback worked and the schema combination should be revisited.
3. `OPENAI_API_KEY` is set, and a filed entry has `embedding_dims = 1536` and `embedding_model = 'text-embedding-3-small'`. If entries file with "no embedding", the key is missing or wrong.
4. Correcting the AI (e.g. "no, just the Hoschton deal") then filing writes one `knowledge_capture_correction` row with `proposal_model = 'claude-sonnet-5'`.
5. Cost per turn: watch `cost_usd` in the function logs; Sonnet 5 at `low` effort with a cached system prompt should be well under a cent.

## Explicitly out of scope

- Voice input (`source = 'voice'` exists in the schema but nothing sets it; comes with the phone page)
- Any query/retrieval or chat interface over the knowledge base — separate spec
- Semantic search (the embedding is populated now, searched later)
- Editing or deleting filed entries

## Known gaps

- The launcher isn't draggable, unlike the Quick Notes one. If Quick Notes is dragged elsewhere, this button stays bottom-right.
- Link chips are text, not links to the record.
- Recently filed shows only *your* last five entries, with no way to see the rest — there's no browse UI until the retrieval spec lands.
- The picker and the model both search names with `ilike`, so a note referring to a record by a nickname OVIS doesn't hold won't match.
- Nothing backfills null embeddings yet; the index is there for when something does.
