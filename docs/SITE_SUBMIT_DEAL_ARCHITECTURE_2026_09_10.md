# Site submit / deal architecture — read-only audit (2026-09-10)

Written to answer: where does the site-submit detail UI live, what is the slide-out
pattern, how do site_submit and deal relate, what chat/LLM/prompt infrastructure
already exists, and how closely could a site-anchored research thread mirror the
market-research feature.

---

## 1. SITE SUBMIT COMPOSITION

There are **two** site-submit detail surfaces. The slideout is the canonical one.

### A. The slideout — `src/components/shared/SiteSubmitSidebar.tsx` (1,804 lines)

Component tree:

```
SiteSubmitSidebar (fixed right panel, 500px, useOverlayStack z-index)
├── header (navy #002147 hero: code, name, StatusBadgeDropdown, action icon buttons)
│     ├── AddToTourButton
│     ├── CopyMapLinkButton
│     ├── "Start Research" clipboard button      ← gated: canStartResearch
│     └── Convert-to-deal / notify / email buttons
├── tab strip  (DATA | CHAT | FILES | [CONTACTS | TASKS])
└── tab body
    ├── activeTab==='data'
    │     ├── DealDataTab        (when siteSubmit.deal_id set — green header)
    │     │   or SiteSubmitDataTab (703 lines — the normal case)
    │     └── "Market research runs" collapsible → PastResearchRunsPanel
    ├── activeTab==='chat'     → PortalChatTab
    ├── activeTab==='files'    → PortalFilesTab
    ├── activeTab==='contacts' → SiteSubmitContactsTab   (map/deal context only)
    └── activeTab==='tasks'    → OpenTasksPanel          (map/deal context only)
    (when _isNew: SiteSubmitCreateForm replaces the whole body)

modals rendered as siblings:
├── EmailComposerModal
├── ConvertSiteSubmitToDealModal
├── DigestComposeModal
├── StartResearchModal
└── ResearchRunApprovalModal   (×2 — run mode and sweep mode)
```

**Tabbed.** The tab list is built inline in the component, not a config file:

```tsx
type TabType = 'data' | 'chat' | 'files' | 'contacts' | 'tasks';

// Build tabs based on context (no EMAIL tab - email is a header button)
const tabs: { id: TabType; label: string; icon: JSX.Element }[] = [
  { id: 'data',  label: 'DATA',  icon: (<svg .../>) },
  { id: 'chat',  label: 'CHAT',  icon: (<svg .../>) },
  { id: 'files', label: 'FILES', icon: (<svg .../>) },
];

// Add contacts/tasks tabs for editable internal contexts (map page, deal page)
if (context === 'map' || context === 'deal') {
  tabs.push({ id: 'contacts', label: 'CONTACTS', icon: (<svg .../>) });
  tabs.push({ id: 'tasks',    label: 'TASKS',    icon: (<svg .../>) });
}
```

State: `const [activeTab, setActiveTab] = useState<TabType>(initialTab || 'data');`
`initialTab` exists so an alert-email deep link can open straight to a tab.

Note the existing warning in memory (`feedback_slideout_tab_overflow`): at 500px the
five-tab strip is already at its limit. A sixth "RESEARCH" tab would overflow —
that's exactly why market research is an expandable section inside the DATA tab
rather than its own tab.

Mounted from four places, all passing `context`:

```
src/pages/MappingPageNew.tsx                     context="map"
src/pages/DealDetailsPage.tsx                    context="deal"
src/pages/portal/PortalMapPage.tsx               context="portal"
src/components/client-pipeline/ClientPipelineBoard.tsx
```

### B. The full page — `src/pages/SiteSubmitDetailsPage.tsx` (1,276 lines)

Route: `<Route path="site-submit/:siteSubmitId" element={<CoachRoute><SiteSubmitDetailsPage /></CoachRoute>} />`

**Single scroll, no tabs.** Sections, in order:

| Section | Fields |
|---|---|
| Header | autosave indicator, QuickAddTaskButton, AddToTourButton, Verify Location, Copy Portal Link, Notify Client, Submit Site, Convert to Deal, Delete |
| Open Tasks | `<OpenTasksPanel objectType="site_submit" objectId={siteSubmitId} />` |
| Basic Information | site_submit_name, client (ClientSelector), assignment (AssignmentSelector), property (PropertySelector), property_unit (PropertyUnitSelector) |
| Submission Details | submit_stage_id, date_submitted, loi_written, loi_date, delivery_timeframe, delivery_date |
| Financial Information | year_1_rent, ti |
| Location Information | verified_latitude, verified_longitude |
| Notes and Comments | notes, customer_comments, competitor_data |
| Footer | RecordMetadata |

It renders differently inside an iframe (`const isInIframe = window.self !== window.top;`)
because the legacy `SiteSubmitSlideOut` embeds this page in an iframe.

**This page has no research UI and no chat.** Both live only in the slideout.

---

## 2. SLIDE-OUT PANEL PATTERN

There are **two** patterns. Each panel is hand-rolled against one of them; there is
no single shared panel abstraction that everything uses.

### Pattern A (canonical, current) — hand-rolled fixed div + `useOverlayStack`

The record is passed in as an **id prop plus an `isOpen` boolean**, and the panel
fetches its own data.

**Trigger** — `src/pages/MappingPageNew.tsx`, pin click handler:

```tsx
        console.log('✅ Fetched fresh site submit data:', freshSiteSubmitData);
        setSelectedSiteSubmitData(freshSiteSubmitData);
      }
    } catch (err) {
      console.error('❌ Exception fetching fresh site submit data:', err);
      setSelectedSiteSubmitData(siteSubmit);   // fall back to cached
    }

    setIsSiteSubmitDetailsOpen(true);
```

**Mount** — same file, near the bottom of the tree:

```tsx
      <SiteSubmitSidebar
        siteSubmitId={selectedSiteSubmitData?.id || null}
        isOpen={isSiteSubmitDetailsOpen}
        onClose={handleSiteSubmitDetailsClose}
        context="map"
        isEditable={true}
        onStatusChange={(siteSubmitId, newStageId, newStageName) => {
          if (selectedSiteSubmitData) {
            handleSiteSubmitDataUpdate({
              ...selectedSiteSubmitData,
              submit_stage_id: newStageId,
              submit_stage: { id: newStageId, name: newStageName },
            });
          }
          refreshLayer('site_submits');
        }}
        onCenterOnPin={handleCenterOnPin}
        onDeleteSiteSubmit={handleDeleteSiteSubmit}
        onViewProperty={(propertyId) => handleViewPropertyDetails({ id: propertyId })}
        onDataUpdate={handleSiteSubmitDataUpdate}
        onSiteSubmitCreated={(newSiteSubmit) => { ... }}
        initialData={selectedSiteSubmitData?._isNew ? { _isNew: true, ... } : undefined}
        rightOffset={0}
        topOffset={showPropertySearch ? 45 : 0}
      />
```

**Styling / layout wrapper** — `SiteSubmitSidebar.tsx`, the panel root:

```tsx
  const { zIndex, bringToFront } = useOverlayStack(isOpen);
  ...
  return (
    <div
      onMouseDown={bringToFront}
      className={`fixed bg-white shadow-2xl transform transition-transform duration-300 ease-in-out flex flex-col ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      }`}
      style={{
        zIndex,
        width: '500px',
        maxWidth: '90vw',
        top: `${64 + topOffset}px`,
        height: `calc(100vh - ${64 + topOffset}px)`,
        right: `${rightOffset}px`,
```

It stays mounted and animates via `translate-x-full`; `rightOffset` is how panels
stack side by side.

**The shared piece is the z-index manager, not the chrome** —
`src/hooks/useOverlayStack.ts`:

```ts
const BASE_Z = 10001;
let topZ = BASE_Z;
let openCount = 0;

function nextZ(): number { topZ += 1; return topZ; }

export function useOverlayStack(isOpen: boolean = true) {
  const [zIndex, setZIndex] = useState(BASE_Z);
  const countedRef = useRef(false);

  // Raise to the front — but ONLY if not already on top. ... This keeps a
  // mousedown on the focused overlay side-effect-free (see the note above
  // about swallowed clicks).
  const bringToFront = useCallback(() => {
    setZIndex((z) => (z >= topZ ? z : nextZ()));
  }, []);

  useLayoutEffect(() => {
    const release = () => {
      if (countedRef.current) {
        countedRef.current = false;
        openCount = Math.max(0, openCount - 1);
        if (openCount === 0) topZ = BASE_Z;
      }
    };
    if (isOpen) {
      if (!countedRef.current) { countedRef.current = true; openCount += 1; }
      setZIndex(nextZ());
    } else { release(); }
    return release;
  }, [isOpen]);

  return { zIndex, bringToFront };
}
```

The `bringToFront` no-op-when-already-top rule is load-bearing: a setState on
mousedown replaces inline-defined child components' DOM and the click never
fires. Any new panel must copy that behaviour.

### Pattern B (legacy) — `src/components/SlideOutPanel.tsx` + iframe

A real generic wrapper (`isOpen`, `onClose`, `title`, `width`, `rightOffset`,
`canMinimize`, `headerActions`, backdrop, Escape-to-close). Used by four panels:
`SiteSubmitSlideOut`, `PropertyDetailsSlideOut`, `DealDetailsSlideout`,
`TourDetailSlideout`. Its site-submit consumer renders the detail page in an iframe:

```tsx
      <SlideOutPanel
        isOpen={isOpen}
        onClose={onClose}
        title="Site Submit Details"
        width="800px"
        rightOffset={rightOffset}
        canMinimize={true}
        headerActions={deleteButton}
      >
        <iframe
          src={`/site-submit/${siteSubmitId}?embedded=true`}
          className="w-full h-full border-0"
          style={{ minHeight: 'calc(100vh - 120px)' }}
          title="Site Submit Details"
        />
      </SlideOutPanel>
```

Don't build on Pattern B. Per `feedback_canonical_site_submit_sidebar`, the
canonical surface is `shared/SiteSubmitSidebar.tsx`.

### Verdict

There is no shared panel component in current use — `SlideOutPanel` exists but is
legacy/iframe. Every modern slideout (`PinDetailsSlideout`, `MunicipalProjectSlideout`,
`CompDetailSlideout`, `DemographicsAnalysisSlideout`, `ContactSidebar`, `DealSidebar`, …)
hand-rolls the fixed div and shares only `useOverlayStack`.

---

## 3. SITE SUBMIT vs DEAL

### Schema

The link is a **bidirectional pair of nullable FKs** — there is no join table:

```
site_submit.deal_id       uuid → deal.id           (site_submit_deal_id_fkey)
deal.site_submit_id       uuid → site_submit.id    (deal_site_submit_fk)
```

Declared cardinality is many-to-one in both directions; in practice both sides are
effectively 1:1 and **the two pointers disagree**. Live production counts:

| measure | value |
|---|---|
| site_submit rows | 3,190 |
| site_submit with `deal_id` set | 146 |
| deal rows | 771 |
| deal with `site_submit_id` set | 196 |
| a site_submit referenced by >1 deal | 0 |
| a deal referenced by >1 site_submit | 0 |
| deals pointing at a site_submit that doesn't point back | **93** |
| site_submits pointing at a deal that doesn't point back | **43** |

So neither column is authoritative on its own. `SiteSubmitSidebar` reads
`siteSubmit.deal_id` (it swaps in `DealDataTab` when set); `DealDetailsPage` and the
deal-direct slideout mode read `deal.site_submit_id`. Most legacy/Salesforce-migrated
deals have no site submit at all — which is why the sidebar has a dedicated
deal-direct mode:

```tsx
  // Deal-direct mode: open the sidebar for a deal that has no linked site_submit
  // (most legacy / Salesforce-migrated deals). Mutually exclusive with siteSubmitId.
  dealId?: string | null;
```

### Who owns trade area / location context

**Property.** Not site_submit, not deal. Every `trade_area` column in the database:

```
property.trade_area
comp_property.trade_area
property_with_deal_type.trade_area   (view)
property_with_stage.trade_area       (view)
property_with_type.trade_area        (view)
salesforce_Property__c.Trade_Area__c
salesforce_Property__c.Sub_Trade_Area__c
```

Site_submit carries only its own **verified** coordinate override
(`verified_latitude` / `verified_longitude`); the address, city/state, and all ESRI
demographics (`pop_1_mile`, `hh_income_median_3_mile`, `tapestry_segment_code`, …)
hang off `property`. Coordinate precedence, per `feedback_coordinate_resolution`:
`site_submit.verified → property.verified → site_submit.sf_property → property.lat`.

Economics are a separate story: per `docs/SITE_SUBMIT_DEAL_DATA_OWNERSHIP.md`, sqft /
acres / lease & purchase price / rent / NNN / TI / delivery timeframe exist as
**independent snapshot columns on all three** of property, site_submit, and deal.
They flow forward at creation and never propagate back.

### Is site_submit the right anchor for a research thread?

**Yes**, and the precedent is unanimous:

- `research_run.site_submit_id uuid NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE`
- `research_sweep.site_submit_id uuid NOT NULL REFERENCES site_submit(id)`
- `site_submit_comment.site_submit_id`, `task.site_submit_id`, `activity.site_submit_id`,
  `tour_stop.site_submit_id`, `note_object_link.site_submit_id`,
  `portal_site_submit_view.site_submit_id`, `site_submit_stage_history.site_submit_id`

Two caveats:

1. A deal can exist with **no** site submit (575 of 771 deals). If research should be
   reachable from those, copy the `site_submit_comment` shape — it is polymorphic with
   three nullable anchors (`site_submit_id`, `deal_id`, `comp_property_id`) and the UI
   picks one:

   ```tsx
   // Chat is normally keyed to a site submit. Deals with NO site submit (e.g. Broker of
   // Record deals) key the same thread off the deal; comp database records key off
   // comp_property. Same table/UI.
   const commentColumn: 'site_submit_id' | 'deal_id' | 'comp_property_id' =
     siteSubmitId ? 'site_submit_id' : dealId ? 'deal_id' : 'comp_property_id';
   ```

2. Research that is really *about the location* (demographics, generators, competitors)
   is arguably property-anchored — the same property can carry many site submits for
   different clients. Market research chose site_submit anyway because a run is scoped
   by client + radius + moment in time, not by the parcel. Worth a deliberate decision
   rather than a default.

---

## 4. EXISTING CHAT / THREAD UI

### Chat UI: yes, three of them

| Component | Backing store | Realtime | Threading |
|---|---|---|---|
| `src/components/portal/PortalChatTab.tsx` (1,095 lines) | `site_submit_comment` (1,718 rows) | **yes** — Supabase postgres_changes | yes, `parent_comment_id` |
| `src/components/cfo/CFOChatPanel.tsx` (352) | none — React state only | n/a | no |
| `src/components/bookkeeper/BookkeeperChatPanel.tsx` (308) | none — React state only | n/a | no |

`PortalChatTab` is the closest existing thing to a persisted thread: internal vs client
visibility, replies, edit/delete, activity-type system messages, Dropbox file
attachments, cross-posting, and a live subscription:

```tsx
    const subscription = supabase
      .channel(`comments-${commentColumn}-${commentTargetId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'site_submit_comment',
          filter: `${commentColumn}=eq.${commentTargetId}`,
        },
        () => { fetchComments(); }
      )
      .subscribe();

    return () => { subscription.unsubscribe(); };
```

`site_submit_comment` columns:

| # | column | type | null | default |
|---|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | site_submit_id | uuid | YES | |
| 3 | author_id | uuid | NO | |
| 4 | content | text | NO | |
| 5 | visibility | varchar | NO | `'client'` |
| 6 | is_edited | boolean | YES | false |
| 7 | created_at | timestamptz | YES | now() |
| 8 | updated_at | timestamptz | YES | now() |
| 9 | updated_by_id | uuid | YES | |
| 10 | parent_comment_id | uuid | YES | |
| 11 | deal_id | uuid | YES | |
| 12 | comp_property_id | uuid | YES | |

There is also an **unused** `thread_message` table — polymorphic
(`property_id` / `site_submit_id` / `deal_id`), `body`, `created_by`,
`visible_to_client`, `last_modified_by/at`. **0 rows, no code references.** Dead
schema; it is not a thing you'd inherit, but the name is available.

### LLM edge functions: yes, five

| Function | Model | Key | Streaming |
|---|---|---|---|
| `cfo-query` → `_shared/claude-cfo-agent.ts` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` | **no** |
| `bookkeeper-query` → `_shared/claude-bookkeeper-agent.ts` | `claude-sonnet-4-20250514` | `ANTHROPIC_API_KEY` | **no** |
| `email-triage` → `_shared/gemini-agent.ts` | `gemini-2.5-flash` | `GEMINI_API_KEY` | no |
| `email-correction` | `gemini-2.5-flash` | `GEMINI_API_KEY` | no |
| `deal-synopsis` → `_shared/gemini.ts` | `gemini-1.5-pro` / `gemini-1.5-flash` | `GEMINI_API_KEY` | no |

The Claude agents run a **tool-use loop**, which is the template a research agent
would extend:

```ts
export async function runCFOAgent(
  supabase: SupabaseClient,
  query: string,
  conversationHistory: ConversationMessage[] = []
): Promise<CFOAgentResult> {
  const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!anthropicKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic({ apiKey: anthropicKey });
  ...
  const systemPrompt = buildSystemPrompt(savedContextText);
  const messages: Anthropic.MessageParam[] = conversationHistory.map((msg) => ({
    role: msg.role, content: msg.content,
  }));
  messages.push({ role: 'user', content: query });

  let maxIterations = 10;
  let iteration = 0;
  while (iteration < maxIterations) {
    iteration++;
    const response = await withRetry(
      () => client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: systemPrompt,
        tools: CFO_TOOL_DEFINITIONS as Anthropic.Tool[],
        messages,
      }),
      { maxRetries: 3, baseDelayMs: 2000, maxDelayMs: 30000 }
    );
    if (response.stop_reason === 'end_turn') { ...return...; }
    if (response.stop_reason === 'tool_use') { ...execute, push tool_result, loop... }
  }
```

Note the model IDs are Sonnet 4 / Gemini 1.5–2.5, i.e. behind current releases.

### Prompt / prompt-template tables: **no**

Every system prompt is a hardcoded string built in TypeScript (`buildSystemPrompt()`).
The only prompt-adjacent persisted things:

- `ai_financial_context` — `context_type`, `entity_type`, `entity_id`, `context_text`,
  `metadata jsonb`. Free-text notes the CFO agent injects into its system prompt. This
  is a **memory** table, not a template table.
- `email_template`, `comment_templates`, `task_block_template` — user-facing text
  templates, unrelated to LLM prompting.

So: an in-app research agent would introduce the first real prompt storage, or
follow the existing convention and hardcode.

---

## 5. MARKET RESEARCH AS A MIRROR CANDIDATE

### 5.1 UI — where it lives and how it's triggered

All of it is in `shared/SiteSubmitSidebar.tsx`, gated three ways:

```tsx
const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';

const isStarbucksFamily = (clientId, clientParentId) =>
  clientId === STARBUCKS_CLIENT_ID || clientParentId === STARBUCKS_CLIENT_ID;

// Market-research action gate: Starbucks-family site (self or child)
// + can_run_market_research permission + has lat/lng on property.
const canStartResearch =
  !!siteSubmit
  && isStarbucksFamily(siteSubmit.client_id, siteSubmit.client?.parent_id)
  && hasPermission('can_run_market_research')
  && (siteSubmit.property?.verified_latitude != null
      || siteSubmit.property?.latitude != null);
```

Three surfaces:

1. **Trigger** — a clipboard icon button in the navy header → `StartResearchModal`
   (813 lines). It previews in-radius municipalities, then commits:

   ```tsx
   const { data, error } = await supabase.functions.invoke(
     'ovis-research-trigger',
     { body: { mode: 'preview', site_submit_id: siteSubmitId, radius_miles: radius } },
   );
   ```

   Three tiers, priced in the UI:

   ```tsx
   const TIERS = [
     { key: 'quick',  label: 'Quick',  cost: 'Sniff test · ~$5',
       blurb: 'Sampled scan — is there a growth story here at all? Makes no completeness claim...' },
     { key: 'custom', label: 'Custom', cost: 'Pick mode + window', blurb: '...' },
     { key: 'sweep',  label: 'Deep Sweep', cost: `3yr · ${costRange(SWEEP_CHUNKS)}`,
       blurb: `Full 3-year Deep enumeration as ${SWEEP_CHUNKS} sequential ${CHUNK_MONTHS}-month chunks...` },
   ];
   ```

   Commit body:

   ```tsx
   const body: Record<string, unknown> = {
     mode: 'commit',
     site_submit_id: siteSubmitId,
     radius_miles: radius,
     municipality_ids: [...selected],
     research_mode: plan.mode,
   };
   if (plan.explicit) {
     body.pz_window_start = plan.pz_window_start;
     body.pz_window_end   = plan.pz_window_end;
     body.permit_window_start = plan.permit_window_start;
     body.permit_window_end   = plan.permit_window_end;
   }
   const { data, error } = await supabase.functions.invoke('ovis-research-trigger', { body });
   ```

2. **Status** — a collapsible "Market research runs" section at the bottom of the
   DATA tab → `PastResearchRunsPanel` (269 lines). It renders runs and sweeps as
   badge rows:

   ```tsx
   const STATE_STYLES: Record<ResearchRunRow['state'], { label; bg; fg; border }> = {
     pending:         { label: 'Pending',         bg: '#F8FAFC', fg: '#4A6B94', border: '#8FA9C8' },
     running:         { label: 'Running',         bg: '#E8F1FF', fg: '#002147', border: '#4A6B94' },
     awaiting_review: { label: 'Awaiting review', bg: '#FFF7F0', fg: '#A27B5C', border: '#A27B5C' },
     approved:        { label: 'Approved',        bg: '#002147', fg: '#FFFFFF', border: '#002147' },
     archived:        { label: 'Reviewed',        bg: '#F8FAFC', fg: '#4A6B94', border: '#8FA9C8' },
     failed:          { label: 'Failed',          bg: '#FBEAEA', fg: '#8B0000', border: '#8B0000' },
     cancelled:       { label: 'Cancelled',       bg: '#F8FAFC', fg: '#8FA9C8', border: '#8FA9C8' },
   };
   ```

3. **Review** — clicking a row opens `ResearchRunApprovalModal` (1,618 lines).

**What the user sees while it runs: nothing live.** There is no polling, no realtime
subscription, no progress stream on the research path — `PastResearchRunsPanel` refetches
only when the parent bumps `refreshTrigger`. A run that takes 20–150 minutes shows
"Running" until the user reopens the panel. Toasts carry the only in-the-moment feedback:

```tsx
onStarted={({ selected_count }) => {
  showToast(`Research started on ${selected_count} municipalities — OpenClaw is working on it.`, ...);
}}
onSweepStarted={(_sweepId, chunkCount) => {
  showToast(`Chunked research started — ${chunkCount} chunks will fire sequentially (~${...} hrs)...`, ...);
}}
```

This is the single biggest gap versus a chat thread, and the one place `PortalChatTab`'s
realtime pattern would be a straight upgrade.

### 5.2 State machine

```
research_run_state_check:
  CHECK (state = ANY (ARRAY['pending','running','awaiting_review','approved','archived','failed','cancelled']))
```

| Transition | Written by |
|---|---|
| → `running` (insert) | `create_research_run_with_checklist` RPC, called by `ovis-research-trigger` in commit mode. Rows are created **server-side, before** the agent is contacted, so the agent can never expand scope. |
| `running` → `failed` | `ovis-research-trigger` itself, if the OpenClaw secrets are missing, OpenClaw is unreachable, or it returns non-2xx |
| `running` → `awaiting_review` | `submit_research_report` MCP RPC — the agent's single end-of-run write |
| `awaiting_review` → `approved` | `approve_research_staging_rows` RPC (the approval modal), at the end of the loop |
| `awaiting_review` → `archived` ("Reviewed") | `mark_research_run_reviewed`, or automatically by `reject_research_staging_row(s)` when the last pending row is rejected |
| `archived` → `awaiting_review` | `unreject_research_staging_row` (reversible reject) |
| any live → `cancelled` | `cancel_research_run` / `cancel_sweep` (user-initiated, for hung runs) |
| `running` → `failed` (orphan reap) | `reap_orphaned_research_runs`, from the sweep stall guard cron |

`pending` exists in the CHECK but is effectively unused — the create RPC inserts
directly at `'running'`.

Sweeps have their own parallel machine: `research_sweep.state ∈ running | complete |
complete_with_failures | failed | cancelled`, and `research_sweep_chunk.state`
pending → running → complete/failed, advanced by `advance_sweep` from the
`ovis-sweep-tick` cron.

### 5.3 Storage and the FK chain

```
site_submit
   └─1:N─ research_run (site_submit_id NOT NULL, ON DELETE CASCADE)
            ├─1:N─ research_checklist_item (research_run_id, ON DELETE CASCADE)
            └─1:N─ municipal_project_staging (research_run_id, ON DELETE CASCADE)
                     └─ approved_municipal_project_id → municipal_project
site_submit
   └─1:N─ research_sweep (site_submit_id NOT NULL)
            └─1:N─ research_sweep_chunk (sweep_id) ──→ research_run_id
```

`research_run` (live, 22 columns, 62 rows):

| # | column | type | null | default |
|---|---|---|---|---|
| 1 | id | uuid | NO | gen_random_uuid() |
| 2 | site_submit_id | uuid | NO | |
| 3 | triggered_by | uuid | YES | |
| 4 | triggered_at | timestamptz | NO | now() |
| 5 | radius_miles | integer | NO | 10 |
| 6 | state | text | NO | `'pending'` |
| 7 | needs_review | text | YES | |
| 8 | alt_avenues | text | YES | |
| 9 | openclaw_run_id | text | YES | |
| 10 | completed_at | timestamptz | YES | |
| 11 | created_at | timestamptz | NO | now() |
| 12 | updated_at | timestamptz | NO | now() |
| 13 | pz_window_start | date | YES | |
| 14 | pz_window_end | date | YES | |
| 15 | permit_window_start | date | YES | |
| 16 | permit_window_end | date | YES | |
| 17 | research_mode | text | YES | |
| 18 | sweep_id | uuid | YES | |
| 19 | sweep_chunk_index | integer | YES | |
| 20 | estimated_cost_cents | integer | YES | |
| 21 | input_tokens | bigint | YES | |
| 22 | output_tokens | bigint | YES | |

Constraints:

```
research_run_state_check        CHECK (state IN ('pending','running','awaiting_review','approved','archived','failed','cancelled'))
research_run_research_mode_check CHECK (research_mode IN ('quick','deep'))
research_run_radius_miles_check  CHECK (radius_miles >= 1 AND radius_miles <= 50)
research_run_cost_nonneg         CHECK ((estimated_cost_cents IS NULL OR estimated_cost_cents >= 0) AND ...)
```

Indexes:

```
research_run_pkey        UNIQUE btree (id)
research_run_site_idx    btree (site_submit_id, triggered_at DESC)
research_run_state_idx   btree (state) WHERE state IN ('pending','running','awaiting_review')
research_run_sweep_idx   btree (sweep_id) WHERE sweep_id IS NOT NULL
```

Original DDL (`supabase/migrations/20260606130000_create_research_run_staging.sql`):

```sql
CREATE TABLE public.research_run (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_submit_id  uuid NOT NULL REFERENCES public.site_submit(id) ON DELETE CASCADE,
  triggered_by    uuid REFERENCES public."user"(id),
  triggered_at    timestamptz NOT NULL DEFAULT now(),
  radius_miles    int NOT NULL DEFAULT 10 CHECK (radius_miles BETWEEN 1 AND 50),
  state           text NOT NULL DEFAULT 'pending'
                    CHECK (state IN ('pending','running','awaiting_review','approved','archived','failed')),
  needs_review    text,       -- agent-written free-text; user-editable in approval UI
  alt_avenues     text,       -- §4 "note alternative avenues taken"
  openclaw_run_id text,       -- correlation ID returned by OpenClaw on trigger
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.research_checklist_item (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id           uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  boundary_municipality_id  uuid NOT NULL REFERENCES public.boundary_municipality(id),
  priority                  int  NOT NULL,                  -- 1 = closest to the site
  status                    text NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','in_progress','complete','skipped','blocked')),
  notes                     text,
  updated_at                timestamptz NOT NULL DEFAULT now(),
  created_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (research_run_id, boundary_municipality_id)
);

CREATE TABLE public.municipal_project_staging (
  id                              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  research_run_id                 uuid NOT NULL REFERENCES public.research_run(id) ON DELETE CASCADE,
  boundary_municipality_id        uuid REFERENCES public.boundary_municipality(id),
  municipality_id                 uuid REFERENCES public.municipality(id),
  project_name                    text,
  address                         text,
  phase_label                     text NOT NULL DEFAULT '',
  parcel_numbers                  text[] NOT NULL DEFAULT '{}',
  single_family_lots              int,
  townhouse_units                 int,
  duplex_units                    int,
  apt_units                       int,
  cottage_units                   int,
  total_housing_units             int,
  zoning                          text,
  zoning_approval_date            date,
  notes                           text,
  raw_stages                      jsonb NOT NULL DEFAULT '{}'::jsonb,
  status_stage_id                 uuid REFERENCES public.project_stage(id),
  builder_developer               text,
  permit_url                      text,
  permit_application_date         date,
  source                          text NOT NULL,
  matched_existing_id             uuid REFERENCES public.municipal_project(id),
  approval_state                  text NOT NULL DEFAULT 'pending'
                                    CHECK (approval_state IN ('pending','approved','rejected')),
  approved_at                     timestamptz,
  approved_municipal_project_id   uuid REFERENCES public.municipal_project(id),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now()
);
```

Later migrations add `location_description`, `parcel_boundary_notes`,
`discovery_source`, `discovery_source_raw`, `reject_reason`,
`duplicate_of_staging_id`. Dedupe indexes:

```
municipal_project_staging_pending_name_addr_idx
  btree (municipality_id, lower(btrim(project_name)), lower(btrim(address)))
  WHERE approval_state = 'pending'
municipal_project_staging_pending_permit_url_idx
  btree (lower(btrim(permit_url)))
  WHERE approval_state = 'pending' AND permit_url IS NOT NULL
```

Approved table is `municipal_project` (39 cols) — the only link back to the site is
`source_research_run_id → research_run.site_submit_id`. There is **no** direct
`municipal_project.site_submit_id`.

Production staging fill rates over all 296 rows: project_name / address /
total_housing_units 100%, status 99%, location_description 89%, builder 85%,
parcel_boundary_notes 73%, zoning 68%, permit_url 26%, discovery_source 10%.
152 approved, 99 rejected, 45 pending.

### 5.4 Approval

`ResearchRunApprovalModal` opens in one of two modes — `researchRunId` (one run) or
`sweepId` (all chunk runs unified, cross-chunk dedupe):

```tsx
interface ResearchRunApprovalModalProps {
  // Exactly one of researchRunId | sweepId. sweepId opens the UNIFIED approval:
  // all staged rows across the sweep's chunk runs, grouped by municipality, with
  // cross-chunk dedupe. researchRunId keeps the original single-run behavior.
  researchRunId?: string;
  sweepId?: string;
  siteSubmitLabel: string;
  onClose: () => void;
  onDone: (summary: { approved_new: number; approved_matched: number; created_municipality_count: number }) => void;
  onReviewed?: () => void;
  onRerun?: (summary: { reset_count: number; healed_count: number }) => void;
}
```

The editable subset — the reviewer overrides these per row:

```tsx
type Edits = Partial<Pick<StagingRow,
  'project_name' | 'address' | 'location_description' | 'parcel_boundary_notes'
  | 'total_housing_units' | 'builder_developer'
  | 'permit_url' | 'permit_application_date' | 'source' | 'discovery_source' | 'notes'>>;

const EDITABLE_FIELDS = [
  { key: 'project_name',            label: 'Project name',     type: 'text', full: true },
  { key: 'address',                 label: 'Address (geocoded)', type: 'text', full: true },
  { key: 'location_description',    label: 'Location description (manual-pin hint)', type: 'text', full: true },
  { key: 'parcel_boundary_notes',   label: 'Parcel / boundary notes (polygon hint)', type: 'text', full: true },
  { key: 'total_housing_units',     label: 'Total units',      type: 'number' },
  { key: 'builder_developer',       label: 'Builder',          type: 'text' },
  { key: 'permit_url',              label: 'Permit URL',       type: 'url', full: true },
  { key: 'permit_application_date', label: 'Permit app. date', type: 'date' },
  { key: 'source',                  label: 'Source (full citation)', type: 'text', full: true },
  { key: 'discovery_source',        label: 'Discovery source (which phase found it)', type: 'select', options: DISCOVERY_SOURCE_OPTIONS },
  { key: 'notes',                   label: 'Notes',            type: 'text', full: true },
];
```

Triage machinery (all of it domain-agnostic in shape, domain-specific in tuning):

- `find_nearby_municipal_projects` RPC — proximity match against *committed* rows
- `haversineMeters` + `normalizeProjectName` + `corePhaseless` + `diceCoefficient`
  — in-sweep staging-vs-staging dedupe, because two unapproved siblings from
  adjacent chunk windows can't see each other any other way
- `lowPrecisionGeo` — rows whose address only geocoded to `GEOMETRIC_CENTER` /
  `APPROXIMATE` are excluded from both dedupe checks and flagged instead
- buckets: Duplicates-to-resolve cluster cards / Needs-attention / Clean / Decided,
  with compact expand-to-edit rows

Reject is reversible and reason-carrying:

```tsx
  const handleReject = async (rowId: string) => {
    const reason = window.prompt('Reason for rejecting this row? (optional)') ?? null;
    const { data, error: rpcErr } = await supabase.rpc('reject_research_staging_row', {
      p_staging_id: rowId, p_reason: reason,
    });
    ...
    // If that was the last pending row, the RPC auto-closed the run as reviewed.
    if ((data as { run_reviewed?: boolean } | null)?.run_reviewed) {
      setRun((prev) => (prev ? { ...prev, state: 'archived' } : prev));
      onReviewed?.();
    }
  };
```

Approve geocodes client-side, then fans out one RPC call per source run:

```tsx
      // Geocode each selected row before submitting so the new municipal_project
      // rows land with a centroid + geocoded_address — without those the
      // Municipal Projects map layer can't render a pin.
      const g = await geocodingService.geocodeAddress(finalAddress);
      ...
      // Fan out per research_run — approve_research_staging_rows rejects a batch
      // spanning runs (and flips one run to 'approved').
      for (const rows of byRun.values()) {
        const { data, error: rpcErr } = await supabase.rpc('approve_research_staging_rows', { p_rows: rows });
        ...
      }
```

The RPC, live definition (abridged only where noted):

```sql
CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id uuid; v_approved_new int := 0; v_approved_matched int := 0;
  v_created_municipalities int := 0; v_row jsonb; v_staging record;
  v_muni_id uuid; v_bm record; v_mp_id uuid; v_lat numeric; v_lng numeric;
  v_addr text; v_pname text; v_phase text;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows must be a non-empty jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT * INTO v_staging FROM municipal_project_staging
     WHERE id = (v_row->>'staging_id')::uuid;
    IF NOT FOUND THEN RAISE EXCEPTION 'staging row not found: %', (v_row->>'staging_id'); END IF;
    IF v_staging.approval_state <> 'pending' THEN CONTINUE; END IF;

    IF v_run_id IS NULL THEN v_run_id := v_staging.research_run_id; END IF;
    IF v_run_id <> v_staging.research_run_id THEN
      RAISE EXCEPTION 'all p_rows must belong to the same research_run (mixed: % vs %)',
        v_run_id, v_staging.research_run_id;
    END IF;

    -- hard match: just mark approved, point at the existing project
    IF v_staging.matched_existing_id IS NOT NULL THEN
      UPDATE municipal_project_staging
         SET approval_state = 'approved', approved_at = now(),
             approved_municipal_project_id = v_staging.matched_existing_id
       WHERE id = v_staging.id;
      v_approved_matched := v_approved_matched + 1;
      CONTINUE;
    END IF;

    -- resolve (or auto-create) the OVIS municipality from the boundary muni
    IF v_staging.municipality_id IS NOT NULL THEN
      v_muni_id := v_staging.municipality_id;
    ELSE
      SELECT * INTO v_bm FROM boundary_municipality WHERE id = v_staging.boundary_municipality_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'staging row % has no boundary_municipality lookup', v_staging.id; END IF;
      SELECT id INTO v_muni_id FROM municipality
       WHERE lower(btrim(name)) = lower(btrim(v_bm.name)) AND state = v_bm.state LIMIT 1;
      IF v_muni_id IS NULL THEN
        INSERT INTO municipality (name, state) VALUES (v_bm.name, v_bm.state) RETURNING id INTO v_muni_id;
        v_created_municipalities := v_created_municipalities + 1;
      END IF;
      UPDATE municipal_project_staging SET municipality_id = v_muni_id WHERE id = v_staging.id;
    END IF;

    v_lat := (v_row->>'latitude')::numeric;
    v_lng := (v_row->>'longitude')::numeric;
    v_addr  := COALESCE(v_row->>'address',      v_staging.address);
    v_pname := COALESCE(v_row->>'project_name', v_staging.project_name, '');
    v_phase := COALESCE(v_row->>'phase_label',  v_staging.phase_label,  '');

    INSERT INTO municipal_project (
      municipality_id, address, project_name, phase_label, parcel_numbers,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units, zoning, zoning_approval_date, notes, raw_stages,
      status_stage_id, builder_developer, permit_url, permit_application_date,
      source, discovery_source, discovery_source_raw,
      source_research_run_id, centroid, geocoded_address
    ) VALUES (
      v_muni_id, v_addr, v_pname, v_phase, v_staging.parcel_numbers,
      COALESCE(v_row->>'location_description',  v_staging.location_description),
      COALESCE(v_row->>'parcel_boundary_notes', v_staging.parcel_boundary_notes),
      COALESCE((v_row->>'single_family_lots')::int,  v_staging.single_family_lots),
      -- ... remaining COALESCE(override, staged) pairs ...
      COALESCE(v_row->>'source', v_staging.source),
      -- Key-presence test rather than COALESCE: the reviewer must be able to
      -- clear a WRONG agent value back to "not reported" (NULL).
      CASE WHEN v_row ? 'discovery_source'
           THEN normalize_discovery_source(v_row->>'discovery_source')
           ELSE v_staging.discovery_source END,
      -- Always the staged value, never overridden: this records what the AGENT reported.
      v_staging.discovery_source_raw,
      v_staging.research_run_id,
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326) ELSE NULL END,
      v_row->>'geocoded_address'
    )
    ON CONFLICT (municipality_id, address, project_name, phase_label) DO NOTHING
    RETURNING id INTO v_mp_id;

    IF v_mp_id IS NULL THEN
      -- conflict: it already existed. Look it up and count as matched.
      SELECT id INTO v_mp_id FROM municipal_project
       WHERE municipality_id = v_muni_id AND address = v_addr
         AND project_name = v_pname AND phase_label = v_phase LIMIT 1;
      UPDATE municipal_project_staging
         SET approval_state='approved', approved_at=now(), approved_municipal_project_id=v_mp_id
       WHERE id = v_staging.id;
      v_approved_matched := v_approved_matched + 1;
    ELSE
      UPDATE municipal_project_staging
         SET approval_state='approved', approved_at=now(), approved_municipal_project_id=v_mp_id
       WHERE id = v_staging.id;
      v_approved_new := v_approved_new + 1;
    END IF;
  END LOOP;

  IF v_run_id IS NOT NULL THEN
    UPDATE research_run SET state='approved', completed_at=COALESCE(completed_at, now())
     WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object(
    'approved_new', v_approved_new,
    'approved_matched', v_approved_matched,
    'created_municipality_count', v_created_municipalities,
    'research_run_id', v_run_id
  );
END;
$function$
```

### 5.5 The trigger / agent boundary

**Outbound** — `supabase/functions/ovis-research-trigger/index.ts` (490 lines).
Auth: a Supabase user JWT, resolved to `user.id` then permission-gated; or a
service-role bearer for the internal sweep path:

```ts
  if ((body as CommitRequest).internal === true) {
    if (!safeEqual(bearer, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)) {
      return jsonResponse({ error: 'unauthorized_internal' }, 401);
    }
    userId = (body as CommitRequest).triggered_by ?? null;
  } else {
    if (!bearer) return jsonResponse({ error: 'missing_jwt' }, 401);
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } });
    const { data: authData, error: authErr } = await anonClient.auth.getUser(bearer);
    if (authErr || !authData?.user) return jsonResponse({ error: 'invalid_jwt' }, 401);

    // auth.uid() maps to user.auth_user_id (NOT user.id — that's the auth identity).
    const { data: userRow } = await service.from('user')
      .select('id').eq('auth_user_id', authData.user.id).maybeSingle();
    if (!userRow) return jsonResponse({ error: 'user_not_found' }, 403);
    userId = userRow.id as string;

    const { data: hasAccess } = await anonClient.rpc('user_has_market_research_run_access');
    if (!hasAccess) return jsonResponse({ error: 'forbidden', detail: 'can_run_market_research permission required' }, 403);
  }
```

The payload to the agent is **one string** — OpenClaw's contract is `{ message }`:

```ts
function buildOpenClawMessage(opts): string {
  const muniLines = opts.municipalities.map((m) =>
    `- boundary_municipality_id=${m.boundary_municipality_id}  kind=${m.kind}  name="${m.name}"  distance_mi=${Number(m.distance_mi).toFixed(2)}`,
  ).join('\n');

  return [
    'You are being triggered by OVIS (a trusted internal system) to run a market-research task. Follow your SOUL.md research protocol.',
    '',
    `research_run_id: ${opts.researchRunId}`,
    `ovis_site_submit_id: ${opts.siteSubmitId}`,
    `site_lat: ${opts.lat}`,
    `site_lng: ${opts.lng}`,
    `radius_miles: ${opts.radiusMiles}`,
    `triggered_by_user_id: ${opts.triggeredByUserId}`,
    `research_mode: ${opts.researchMode}`,
    `pz_window_start: ${opts.window.pz_window_start}`,
    `pz_window_end: ${opts.window.pz_window_end}`,
    `permit_window_start: ${opts.window.permit_window_start}`,
    `permit_window_end: ${opts.window.permit_window_end}`,
    '',
    'Research the following municipalities (do NOT research others — any candidate referencing an off-list boundary_municipality_id will be rejected at submit time):',
    '',
    muniLines,
    '',
    'When finished, call submit_research_report ONCE with all candidates. Use update_checklist_status to report per-muni progress.',
  ].join('\n');
}

  openclawResp = await fetch(openclawUrl, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${openclawToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
```

Failure at any step marks the run `failed` and pings Telegram.

**Inbound** — `supabase/functions/ovis-research-mcp/index.ts`. MCP over HTTP,
JSON-RPC 2.0, a single shared bearer token, service-role writes (bypasses RLS):

```ts
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('OVIS_MCP_BEARER_TOKEN');
  if (!expected) return false; // server misconfigured → deny
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  return !!m && m[1].trim() === expected;
}
```

Four tools: `get_municipalities_in_radius`, `create_research_checklist`,
`update_checklist_status`, `submit_research_report`.

Three defence layers keep an unreliable agent honest, all server-side in
`submit_research_report`:

```sql
  -- Layer-3 guard: every candidate's boundary_municipality_id must be on this
  -- run's checklist. Whole batch rejected if any are off-list.
  ...
  IF v_off_checklist > 0 THEN
    RAISE EXCEPTION 'off_checklist_municipalities: % candidate(s) reference muni(s) not on this run''s checklist; ...';
  END IF;

  -- Idempotency guard (per run). ... If a human has already acted on this run's
  -- staging rows, refuse to re-stage.
  IF v_reviewed > 0 THEN
    RAISE EXCEPTION 'run_already_reviewed: run % has % staging row(s) already approved/rejected; ...';
  END IF;

  -- Replace-on-resubmit: drop this run's prior PENDING rows so a retry can never
  -- double-stage.
  DELETE FROM municipal_project_staging
   WHERE research_run_id = p_run_id AND approval_state = 'pending';
```

Plus defensive per-field casts so one malformed value can't abort a 60-record batch:

```sql
      CASE WHEN c->>'total_housing_units' ~ '^-?\d+$' THEN (c->>'total_housing_units')::int END AS total_housing_units,
```

and two-probe dup detection (permit_url globally, then normalized name+address
within the municipality).

### 5.6 What's generic vs. hard-coded

**Generic — reusable for any research type as-is or with a rename:**

| Piece | Why it transfers |
|---|---|
| run → staging → approved three-table shape | Nothing about it is residential |
| `research_run` itself | site anchor, state machine, windows, mode, cost/token columns, audit-forever policy |
| `research_run_state_check` state set | pending/running/awaiting_review/approved/archived/failed/cancelled fits any async research |
| Server-side scope freeze before the agent is contacted | The single best idea in the design |
| `submit_research_report` guard trio | off-scope rejection, idempotency, replace-on-resubmit |
| Defensive per-field casts | Any LLM output needs this |
| Reversible reject with reason + auto-close-on-last-reject | Domain-free review semantics |
| Cost/token accounting columns + the "OVIS cannot derive these" note | Same for any agent |
| Sweep chunking state machine (`advance_sweep`, stall guard, `rerun_sweep_gaps`) | Generic long-job orchestration |
| `PastResearchRunsPanel` status badges + toasts | Pure presentation |
| Permission helpers (`user_has_market_research_run_access` / `_approve_access`) | Rename only |
| Triage bucket UX (clusters / needs-attention / clean / decided, expand-to-edit) | Shape is generic |

**Hard-coded to residential developments:**

| Piece | The coupling |
|---|---|
| `municipal_project_staging` columns | `single_family_lots`, `townhouse_units`, `apt_units`, `zoning_approval_date`, `permit_url`, `builder_developer` — a wholly different column set for another research type |
| `research_checklist_item` | Keyed on `boundary_municipality_id`; the whole scope unit is "a municipality". Other research may scope by radius, brand, or nothing |
| `get_municipalities_in_radius` + the GA-only filter (`WHERE bm.state = 'GA'`) | Georgia municipalities, full stop |
| `discovery_source` enum | `pz_agenda`/`permit_portal`/`activity_pdf`/`builder_site`/`econ_dev` are permit-research phases |
| `approve_research_staging_rows` body | Every column name, plus the auto-create-municipality branch and `ON CONFLICT (municipality_id, address, project_name, phase_label)` |
| Dedupe tuning | `corePhaseless` strips "Phase II"/"Section IIIA"; `permit_url` as the strong probe; the 150m radius |
| `pz_window` / `permit_window` | Two windows because agendas and permits are two different record streams |
| The Starbucks gate | Hardcoded client UUID `39933b5b-…` in **both** the frontend and the edge function |
| `PER_CHUNK_COST_USD = 3` / `$3–5` range | Calibrated on dense-GA-county Deep runs |
| The OpenClaw message text | References `SOUL.md`, municipalities, `submit_research_report` |

### 5.7 In-app (edge function calling an LLM) — keep vs. rewrite

**Keep, essentially untouched:**

- The three-table run/staging/approved shape and its FK chain to `site_submit`
- `research_run`'s state machine and every guard RPC around it
- Server-side scope freeze at create time — even more valuable in-app, since the
  edge function is now the thing you're constraining
- The `submit_research_report` guard trio and defensive casts (an in-app LLM emits
  the same malformed JSON an external agent does)
- Reversible reject, reason capture, auto-close, the approve RPC's
  COALESCE(override, staged) discipline and the `?`-key-presence rule for fields the
  reviewer must be able to *clear*
- Cost/token columns — now actually fillable, since you own the API response's
  `usage` block instead of begging the agent to self-report
- `PastResearchRunsPanel` + toasts, `StartResearchModal`'s tier/preview/commit flow
- Permission helper pattern

**Rewrite or drop:**

| Today | In-app |
|---|---|
| `ovis-research-trigger` → OpenClaw HTTP POST | Becomes the agent host itself: a `while (stop_reason === 'tool_use')` loop, copying `_shared/claude-cfo-agent.ts` |
| `ovis-research-mcp` (MCP/JSON-RPC, shared bearer, service-role) | **Delete the transport.** The four tools become in-process functions in the same edge function. Keep the *guard logic* — move it into the tool implementations or keep calling the same SECURITY DEFINER RPCs |
| `OVIS_MCP_BEARER_TOKEN`, `OPENCLAW_TRIGGER_URL`, `OPENCLAW_TRIGGER_TOKEN` | Gone. One `ANTHROPIC_API_KEY`, already configured for the CFO agent |
| `openclaw_run_id` correlation column | Gone (or repurposed as an Anthropic request id) |
| `buildOpenClawMessage()` prose blob | Becomes a real system prompt + typed tool definitions. This is where you'd want the prompt-template table OVIS doesn't yet have |
| Agent self-reports cost via `submit_research_report` params | Read `response.usage` directly; drop the three optional params |
| Fire-and-forget + "check back later" | An edge function has a wall-clock limit. Two options: (a) keep the chunk/sweep engine and run one bounded chunk per invocation — the machinery already exists and is battle-tested; or (b) stream into a message table and let the UI follow via `postgres_changes`, exactly as `PortalChatTab` does |
| No progress visibility | This is the reason to build it as a *thread*: write each turn (assistant text, tool call, tool result) as a row the moment it happens, and the UI is live for free |
| Telegram failure pings | Keep, or fold into the thread |

**The one genuinely new piece** is the message store. Neither `site_submit_comment`
(human comments, no role/tool concept) nor the unused `thread_message` fits an
agent transcript. You'd want something like
`research_thread_message(research_run_id, seq, role, content, tool_name, tool_input,
tool_result, tokens_in, tokens_out, created_at)` — anchored to `research_run` so it
inherits the site FK, the audit-forever policy, and the cascade delete for free.

The honest summary: the **backend design transfers almost completely** — it was
built to distrust the agent, and that logic is exactly as necessary when the agent
runs in-house. What you throw away is the transport layer and the prompt blob, and
what you add is a message table plus a realtime subscription so the run stops being
a black box.
