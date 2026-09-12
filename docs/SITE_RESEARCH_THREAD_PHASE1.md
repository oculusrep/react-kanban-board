# Site Research Thread — Phase 1

Status: **built, not yet deployed.** Migration applied to production; edge function
and UI are on `feature/site-research-thread` and need `ANTHROPIC_API_KEY_RESEARCH`
set plus a function deploy before they do anything.

A chat thread on the site submit that produces the archetype call and an executive
summary for a Starbucks site. Text in, text out.

## What was built

| Piece | Path |
|---|---|
| Migration (3 tables + RLS + seed prompt) | `supabase/migrations/20260910092739_site_research_thread.sql` |
| Edge function | `supabase/functions/ovis-site-research/index.ts` |
| Coordinate precedence (browser copy) | `src/utils/resolveSiteCoordinate.ts` |
| Thread UI | `src/components/shared/SiteStoryPanel.tsx` |
| Wiring + gate | `src/components/shared/SiteSubmitSidebar.tsx` |

## Anchor decision: new tables, not `research_run`

`research_run` carries radius, four window dates, a municipality checklist, and a
state machine whose whole purpose is staging → approval. A thread has no staged
rows and nothing to approve. Concretely: `PastResearchRunsPanel` renders every
`research_run` for a site, so thread rows would pollute the market research list.

Anchored to `site_submit` directly, the same way `research_run` is. We reuse the
*patterns* — permission helpers, cost columns, audit-forever, cascade delete — not
the table.

**Deferred decision, flagged not resolved:** research about a LOCATION is arguably
property-anchored, since one property carries many site submits for different
clients. Market research chose `site_submit` because a run is scoped by client +
moment; the same logic applies here. Going with `site_submit` as a deliberate call.

## Schema

Three tables, all with RLS on. `research_thread` and `research_thread_message` are
SELECT-able by `authenticated`; **`prompt_template` has no read policy at all** —
prompt bodies are operational IP and the browser never needs them. Every write goes
through the edge function on the service role.

`prompt_template` is OVIS's first prompt storage — every other system prompt in the
codebase is a hardcoded `buildSystemPrompt()` string. It earns its place because
the archetype prompt gets iterated across several sites in a week, and a redeploy
per wording change is the wrong loop.

Two deviations from the spec as written, both deliberate:

1. **`research_thread.client_id` got a FK** to `client(id)`. An unconstrained uuid
   that gates access is a bug waiting to happen.
2. **`prompt_template`'s unique constraint is `UNIQUE NULLS NOT DISTINCT`.** Plain
   `UNIQUE (key, client_id, version)` would *not* have deduped the global rows,
   because NULLs compare distinct in Postgres — two `('archetype_call', NULL, 1)`
   rows would both have been allowed, and that global row is exactly the one most
   in need of deduping. Requires PG15+; production is on 17.6.

`archetype_primary` / `archetype_secondary` / `story_carriers` are columns, not
buried in message text, because the slide phase reads from them and they need to be
queryable across sites.

## Coordinate resolution

Resolved server-side at thread creation, by the documented precedence:

```
site_submit.verified → property.verified → site_submit.sf_property → property.lat
```

A tier only counts when **both** lat and lng are present, so a half-populated tier
falls through rather than pairing one tier's latitude with the next tier's
longitude. If all four resolve null, `create_thread` returns **422 `no_coordinate`**
and no thread is created.

There is deliberately **no address-string fallback**. Mailing address and governing
jurisdiction diverge — Johnson Ferry/Shallowford is a Marietta mailing address in
unincorporated Cobb, with a Roswell-ZIP Publix across the intersection.

The resolved coordinate **and its source** go into `pinned_context`, and the source
is shown in the thread header, so a reader can always tell how good the point is.

**Known duplication:** the precedence exists twice — `src/utils/resolveSiteCoordinate.ts`
(UI gate) and inside `ovis-site-research/index.ts` (authoritative). Deno edge
functions can't import from `src/`. Both files carry a comment pointing at the other.

## Pinned context

Snapshotted at creation, sent as the system block on every turn, **never re-read
live** — a thread's reasoning has to stay reproducible against what it actually saw.
`trade_area` and all ESRI demographics are joined in from **property**, which is
where they live.

Follow-up turns replay `pinned_context` + the full prior transcript. Since that
prefix is stable for the life of a thread, the last system block carries
`cache_control: {type: 'ephemeral'}`. Short threads may fall under the model's
minimum cacheable prefix, in which case it's a silent no-op.

## Gating

Frontend (`SiteSubmitSidebar.tsx`) — same shape as the market research gate, but the
coordinate test uses the **full** precedence rather than property-only, so a site
whose only coordinate is its own verified override still qualifies:

```tsx
const resolvedCoordinate = siteSubmit
  ? resolveSiteCoordinate(siteSubmit, siteSubmit.property)
  : null;
const canStartResearchThread =
  !!siteSubmit
  && isStarbucksFamily(siteSubmit.client_id, siteSubmit.client?.parent_id)
  && hasPermission('can_run_market_research')
  && resolvedCoordinate != null;
```

This required adding `verified_latitude`, `verified_longitude`,
`sf_property_latitude`, `sf_property_longitude` to the sidebar's `site_submit`
select and to `SiteSubmitData` — the interface previously carried property-level
coordinates only.

Server re-checks the client family and the permission on **every** action, including
`send_turn` (the site's client could change after the thread was created). The gate
is in code, never in the prompt body: adding Huey Magoo's later is a
`prompt_template` row plus a client-id constant change.

## Edge function: `ovis-site-research`

Auth copies `ovis-research-trigger` exactly: bearer → `anonClient.auth.getUser` →
`user.auth_user_id` → `user.id` → `rpc('user_has_market_research_run_access')`.
`verify_jwt` stays at its default `true`, so no `config.toml` entry is needed.

Model settings:

```ts
const MODEL = 'claude-opus-5';           // NOT claude-sonnet-4-20250514
const MAX_TOKENS = 16000;                // adaptive thinking counts against this
thinking: { type: 'adaptive' }           // budget_tokens is removed on Opus 5 (400)
output_config: { effort: 'high' }
```

Import is **`npm:@anthropic-ai/sdk@0.124.0`**, not esm.sh. The repo's existing pin
(`https://esm.sh/@anthropic-ai/sdk@0.32.1`) predates every parameter this function
needs, and esm.sh's build service currently returns 500 for the modern versions —
`deno check` can't even resolve their types. The `npm:` specifier typechecks clean.

**Server-side refusal fallback is ON** (`betas: ['server-side-fallback-2026-07-01']`,
`fallbacks: 'default'`). Retail site analysis is about as unlikely to trip a
classifier as text gets, so this is insurance, not necessity — if the beta isn't
enabled for the org and requests start 400ing, flip `ENABLE_REFUSAL_FALLBACK` to
`false`. `stop_reason === 'refusal'` is checked before reading content either way.

### Parsing

The model writes prose and ends with a fenced JSON block. Parsing applies the same
defensive discipline as `submit_research_report`:

- last `​```json` fence wins (an earlier narrated example doesn't hijack the answer)
- `JSON.parse` in try/catch
- `archetype_primary` must be one of the five enum values or the whole parse is
  rejected — a thread with a *wrong* archetype is worse than one with none
- `story_carriers` filtered to non-empty strings ≤200 chars, capped at 10

**A bad parse never loses the text.** On failure the raw message is stored verbatim
and the columns stay NULL; the UI says so explicitly rather than hiding it. On
success the prose is stored with the fence stripped, since the values now live in
queryable columns.

### Cost

Per-message `input_tokens` / `output_tokens` / `cost_usd` from `response.usage`.
Cost accounts for cache tiers, not just the headline rate:

```
input $5.00/M · output $25.00/M · cache read $0.50/M · cache write $6.25/M
```

Verified against the Claude API model table on 2026-09-10.

### Other behaviour worth knowing

- A thread whose **first** model call fails is kept with `state='failed'`. It's an
  audit record, and `pinned_context` shows exactly what the model was given.
- A follow-up turn replays against the template the thread was **created** with, not
  whatever is active now — otherwise activating v2 would silently rewrite the
  reasoning behind every open thread mid-conversation.
- `messages[]` must start with a user turn, but seq 0 is the assistant's archetype
  call, so replay prepends the original framing turn.
- A unique violation on `(thread_id, seq)` returns **409 `concurrent_turn`** rather
  than silently dropping a turn.

## UI

Not a new tab — the strip is full at 500px (`feedback_slideout_tab_overflow`). A
collapsible **"Site story"** section in the DATA tab, directly below "Market
research runs", gated by `canStartResearchThread`.

Thread list shows the archetype call and story carriers as chips; opening a thread
shows the call, the carriers, the transcript, and a composer. Message list is
modelled on `PortalChatTab`.

**No realtime in Phase 1** — turns are synchronous request/response, not long runs.
If a turn ever exceeds the edge function wall clock, that's the signal to switch to
writing messages as they land and subscribing via `postgres_changes`, the way
`PortalChatTab` does.

No new panel chrome: this lives inside `SiteSubmitSidebar`. If a dedicated panel is
ever needed, hand-roll the fixed div and use `useOverlayStack` — including its
no-op-when-already-top `bringToFront` rule, which is load-bearing.

## Before this works

1. **Provision a dedicated Anthropic workspace for OVIS** and set its key as the
   Supabase secret `ANTHROPIC_API_KEY_RESEARCH`. Do *not* reuse `ANTHROPIC_API_KEY`
   — that's shared with `cfo-query` and `bookkeeper-query`, so spend would be
   unattributable. Workspaces carry their own monthly spend limit and threshold
   alerts, and the Console filters usage by workspace, model, and key. Server-side
   secret only — never a `VITE_` var (`geocodingService.ts` exposes a browser key
   today; don't repeat that).
2. `supabase functions deploy ovis-site-research`
3. Merge the branch (deploys the UI via Vercel).
4. **Review the active prompt.** See "The archetype prompt" below.

## The archetype prompt

**Active version: `('archetype_call', NULL, 2)`, activated 2026-09-12.**
Verbatim reference copy: [PROMPT_archetype_call_v2.md](PROMPT_archetype_call_v2.md)
— reference only, not executable, never re-applied on deploy. The live source of
truth is the `prompt_template` row; if the two disagree, the row wins.

v2 replaced v1's prose-only summary with a stated section skeleton, because named
sections turned out to be what makes the requirements enforceable — v1 asked for
prose and silently got inconsistent compliance. It adds: a ground-truth step
(intersection + governing jurisdiction, with any mailing/governing mismatch flagged
explicitly); a shallow scan of all six categories (schools/enrollment; rooftops and
residential pipeline; site-level employment; daytime vs. residential population;
traffic, access and AM flow; competitive ring), where an empty category is stated
plainly as a finding rather than padded; a "Not claiming X and Y, because…"
statement naming at least two declined archetypes; and an "Open questions that would
change the call" section restricted to genuine falsifiers. Hard rules now cover
inline sourcing of every number, straight-line distance to one decimal, never
inventing a street number, labelling inferences `INFERRED`, and breadth-not-depth.
The word cap moved 300 → 600. v1's one-primary/optional-secondary rule, its "a
forced secondary is worse than none" line, and its refusal to estimate a missing
number all carried over unchanged.

Two conventions worth knowing because they cross into code:

- **`story_carriers` are category names, not facts** — 2–3 entries copied verbatim
  from a fixed six-name list, so carriers stay comparable across sites.
  `parseArchetypeBlock` still caps at 10 entries / 200 chars as a safety net; the
  narrower contract is the prompt's, not the parser's.
- **The blank rule is scoped, not contradictory.** In prose, say plainly that
  something could not be determined. In JSON, tables, and any exported field, leave
  it blank — never `N/A`, `TBD`, `unknown`, or `0` standing in for unknown.

**v1 is retained, deactivated (`is_active = false`) — do not delete it.**
`research_thread.prompt_template_id` pins each thread to the template it was created
with, so threads opened before 2026-09-12 keep replaying against v1. Deleting it
would break their replay. Iterating again means inserting version 3 and flipping
`is_active` — a row insert, no migration and no deploy — and updating the reference
file in the same commit.

## Migration note

`20260910092739_site_research_thread` was applied to the shared production database
from this branch on 2026-09-10 (psql + explicit `schema_migrations` INSERT, per
CLAUDE.md). It is additive — three new tables, no changes to existing objects — so
`main` is not broken while the branch is open. Round-trip was verified inside a
transaction and rolled back before the real apply.

## Explicitly out of scope for Phase 1

Staging/approval flow, generators table, geocoding, pin numbers, cluster IDs, pptx
export, cross-site queries, non-Starbucks clients, tool use, streaming,
deal-anchored threads.

## Possible Phase 1.1

Structured outputs (`output_config.format`) would eliminate the parse-failure path
entirely for the seq-0 turn. Not used here because later turns are free-form prose
and forcing JSON on every turn would break the conversation — but the opening turn
could use it while follow-ups stay unstructured.
