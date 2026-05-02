# OVIS Overlay UX Principle

**Status:** Active design rule
**Owner:** Mike Minihan
**Last updated:** 2026-05-02

---

## The principle

OVIS interactions follow a **two-tier model**:

1. **Pages (destinations)** — heavyweight surfaces you *go to*. Each has a URL, its own state, and its own job. Examples: Master Pipeline, Map, the Tasks/Daily-Planning dashboard, the all-tasks list.
2. **Object interactions (overlays)** — working with a *specific* deal, contact, client, property, site_submit, or assignment. These happen via composable overlays — slideouts, sidebar panels, expandable sections — *wherever* you currently are. You never get pulled away from your current surface to do object work.

> **Goal:** Once you're on a working surface (map, pipeline, dashboard), you can drill into any object as deeply as you need — read, edit, take action, follow related links — without ever losing your spot.

## Why

Mike's primary workflow is increasingly map-first and pipeline-first. Switching from a map view to a deal page (and back) breaks attention and forces you to re-orient — repeatedly, dozens of times a day. The same happens on the master pipeline kanban: clicking a card takes you off the board. The fix is to bring object interactions *to* the user, not pull the user away to the object.

This isn't anti-page. Pages are correct for destinations. It's anti-page-as-the-only-way-to-interact.

## What this looks like

| Surface | What you can do without leaving it |
|---|---|
| **Map (pin detail slideout)** | Open any object linked to that pin — deal, property, site submit, client — fully editable, with all sidebar panels (notes, files, tasks, handoffs, etc.) |
| **Master Pipeline kanban (future)** | Click a card → deal slides out as an overlay over the board. Edit, move stages, work tasks, navigate to client → all in further slideouts/panels. Board stays put behind the overlay. |
| **Tasks dashboard / daily planner (Phase 2)** | Click a task → detail slideout. Click the linked deal → deal opens in a slideout *over* the task slideout. Drill arbitrarily without navigation. |
| **Object detail pages** | Even on a detail page, related-object views (e.g., a contact linked to this deal) open as overlays — not as page navigations. |

## Composable building blocks

Every cross-object interaction surface should be built as a **self-contained, drop-in component** that takes the object id (and type, where polymorphic) as props and renders identically wherever mounted.

Examples to build / continue:
- `<OpenTasksPanel objectType="deal" objectId={id} />` — list + complete + create
- `<NotesPanel objectType objectId>` — already partially exists (per-object Notes sections)
- `<FilesPanel objectType objectId>` — already exists as `FileManagerModule`
- `<RelatedContactsPanel objectId>` (deal/property scoped)
- `<ActivityTimelinePanel objectType objectId>` — when chat-style timeline gets unified

These components must:
- Take object reference as input; never assume a routing context
- Render their own loading / error / empty states
- Trigger overlay open events for nested object navigation rather than `navigate(...)` calls
- Work both inside a sidebar `SidebarModule` *and* standalone in a slideout body

## What this means for new feature work

Every Task System v2 surface from Phase 2 onward inherits this rule:

- The Tasks/Planning dashboard is a page (correctly). But every interaction *within* it — opening a task, clicking through to a linked deal, viewing a contact — happens via overlay.
- The block scheduling UI, Top-3 lane, Watching lane, Inbox, conflict resolver — each is a composable that can also be mounted in a slideout (e.g., a "today's plan" preview that pops over the map).
- The notification panel (Phase 4) is a slideout/dropdown overlay, never a page.

**Anti-patterns to refuse:**
- Page-bound UI that can't be mounted elsewhere (e.g., a tasks list that hard-codes `useParams`)
- Navigation calls (`navigate('/deal/${id}')`) where an overlay would do
- "Click here to view full details" that takes you off the current surface

## Migration path for existing object pages

The current detail pages (Deal, Client, Contact, Property, Site Submit, Assignment) will gradually become *containers* for the same composable panels that live in overlays. The detail page is one mount point; the pin detail slideout is another; the kanban card slideout is a third. Same panels, different shells.

In practice:
1. Build new features as composables from day one (rule for Phase 1+ Task System v2 work).
2. Refactor existing detail-page-only components to composables on a case-by-case basis when adding nearby features.
3. Build the new overlay shells (kanban card slideout, etc.) when the corresponding page-routing pain becomes acute enough to schedule.

## Related docs

- [Task System v2 Spec §11.1](TASK_SYSTEM_V2_SPEC.md) — adaptive dashboard layout, mention of composability
- `CLAUDE.md` — has the short imperative rule that references this doc
