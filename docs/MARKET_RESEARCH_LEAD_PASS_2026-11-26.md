# Market Research — lead cleanup and document pass (2026-11-26)

**Question:** for pending staged records with no unit count (Leads), can a count still be found,
or are they useless? And how do we make this check part of the post-run pipeline?

Starting point: 37 pending leads across 20 runs. The post-run estimator
([MARKET_RESEARCH_UNIT_ESTIMATES.md](MARKET_RESEARCH_UNIT_ESTIMATES.md)) had already tried 34 of
them: Gemini web search, then acreage × density. Three Hall County final-plat records had never been tried.

## 1. Rejected (16)

All were rejected, not deleted. Each reason ends "(lead cleanup 2026-11-26)" so the rows can be found and restored.

| Reason | Records |
|---|---|
| No count, outside radius (9) | Tributary at New Manchester, Heron Bay-Northridge, Heron Bay-The Summit, Harley Farms South, Southfield Plantation, Twin Rivers, Arrowhead Townhome Development, Newberry Subdivision, Underwood Crossing Ph 2 & 3 |
| No count; Gemini found nothing; listing-site sources only (7) | Bridlewood Townhomes, Joy Park Luxury Apartments, Knob Hill, Liberty Grove, Station 75 Apartments, Ansley Trails, The Ridge at Twin Rivers |

## 2. Document / parcel pass (18 records)

The pass was done by hand in a Claude Code cloud session. **That session's network blocks almost every
county and city host**: wrga.gov, houstoncountyga.gov, newtoncountyga.gov, newtondevelopment.ncboc.com,
cityofcovington.org, locustgrove-ga.gov, henryga.news, agendapub.hallcounty.org, douglasvillega.gov,
Cartersville's usgovcloudapi.net blobs, meetings.municode.com and the Coweta CivicClerk API. What worked
was web-search snippets, one S3-hosted council packet, and the Hall and Douglas ArcGIS parcel layers.
A "none found" below therefore means **"could not read the documents"**. It does not mean the documents have no count.

### Counts written

`reported` means the count is stated in a document, or the lot numbers in the parcel layer run 1..N with no gaps.
`estimated` means a secondary source or a parcel-layer inference (shown with the dashed EST. badge).

| Record | Units | Conf. | Basis |
|---|---|---|---|
| Falcon Landing (Hall) | 148 | reported | Parcel layer `LEGAL_DESC` "FALCON LANDING LOT 1–148", contiguous; 5 open-space parcels excluded |
| Union Heights (Hall) | 125 | reported | Parcel layer `LEGAL_DESC` "UNION HEIGHTS LOT 1–125", contiguous; HOA open space and amenity parcels excluded |
| Ponderosa Farms (Hall) | 89 | reported | Unit 1 only (phase relabelled "Unit 1 (platted)"). Reserve not parcelized. Unverified snippet: rezoning cut to 230 homes |
| Southland Station PDR (Warner Robins) | 150 | reported | **Proposed**: concept plan table, 12/16/24 council packet p.108. Approval conditions not checked |
| Jackson Farm Ph 2 Expansion (Cartersville) | 67 | reported | Z24-07 approved "(67) Lots" (the PC agenda said 65). Z24-02's 103 was superseded; the agent's 112 is unsupported. Matches the Nov 12 audit |
| Fox Hall Ph V and VI (Coweta) | 65 | reported | Ph 5 plat 33 + Ph 6 32, from the [Nov 12 audit](MARKET_RESEARCH_NO_COUNT_AUDIT_2026-11-12.md). The ~134 lot-map figure was wrong |
| NexMetro BTR, Foster Dr (Henry) | 254 | estimated | citizenportal.ai summaries of the ZAB and BOC hearings; consistent with staff's 7.1 units/ac. Not confirmed from the staff report |
| Ashley Falls, Century section (Douglas) | 51 | estimated | 57 parcels owned by Century's entity, minus unaddressed and common-area parcels. Understates build-out (later phase not parcelized) |
| Kensington Park Ph 2B (Douglas) | 52 | estimated | New blank-owner parcels in LL 757/810/811. If LL 811 is another phase, about 35 |

### Still leads (12)

| Record | Status |
|---|---|
| Charlton Crossing New Section | **No new section exists** in the parcel layer: 21 scattered Benchmark infill lots. Candidate for rejection |
| Liberty Communities Hwy 81 W (RZ-24-12) | Unverified snippet: 353 units (151 TH + 202 SF), but it conflicts on zoning. Needs the staff report |
| Neely Farm Ph 1A | Unverified snippet: "two final plats for 102 lots" (not a Phase 1A count) |
| Peeksville Rd annexation (Locust Grove) | Minutes and packet URLs located but blocked |
| Covington Apts (PP22-000003), Hwy 212 (PP23-000004), Savoy Park Ph 2 | Newton hosts blocked |
| Morgan Ranch, O'Brien Farms Ph 2 | Warner Robins and Houston hosts blocked |
| Oxford College residence hall, Pine Leaf, Southgate | Not housing development / untraceable (not in this pass) |

### Data-quality flags (not fixed, per scope)

- Hall `SUBD_NAME` is blank on all three new Hall subdivisions; the name is only in `LEGAL_DESC`.
  This also means the [parcel subdivisions pass](MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md) misses new Hall subdivisions.
- New Douglas Kensington parcels have no owner, address or acreage.
- Ashley Falls 11.47 ac tract (01950250041) has no subdivision tag.

## 3. Making this automatic — proposal (not built yet)

**Key point:** the edge functions run on Supabase's network, which is not restricted like a cloud
Claude session. The documents this pass could not open are reachable from `ovis-research-mcp` and
`research-fill-units`. Done in the pipeline, this step is more reliable than doing it by hand.

Proposed post-run order, which also becomes the order of the "Fill missing units" button:

1. dedupe (as today)
2. **Parcel-layer count (new, no LLM).** For a lead in a county with a parcel adapter, search the
   subdivision name in the subdivision field **and** the legal-description field. Hall's new plats
   are only in `LEGAL_DESC`. Parse lot numbers and drop open space, HOA and amenity parcels.
   - Contiguous 1..N → `reported`.
   - Otherwise, the parcel count → `estimated` with the range in notes.
   - Reuses `subdivision-layers.ts` / `parcel-adapters.ts`. Douglas needs adding (field `SUBDIVISION`).
3. **Cited-document reader (new).**
   - Gather URLs from `permit_url`, `source`, `notes` and the Gemini grounding sources.
   - Fetch each PDF or page in the edge function.
   - Pass PDFs to Gemini natively: inline under 20 MB, the File API for big packets like Peeksville's 17.5 MB one. Native PDF input reads scanned plats and lot-map images, which covers the "scanned plat" and "lot map not read" misses from the Nov 12 audit.
   - Require a verbatim quote and a page number, and accept only if the quote contains the number.
   - Label proposed / cap / approved. `reported` when approved or stated, `estimated` when only proposed.
   - Cost: about 258 tokens per page, so a 100-page packet is about 1¢.
4. Gemini web search (as today)
5. acreage × density (as today)
6. **Auto-triage (new).** Any record still without a count is rejected with a dated reason when:
   - it has a distance `lead_reason` (out of radius), or
   - it is `gemini_recent`, or all its sources are listing domains (`source-rules.ts`).

   It is rejected, never deleted, so Undo works. Everything else stays a lead.
7. dedupe again (as today)

Known gaps the pipeline still won't cover:
- Hall Accela record attachments need a login, but step 2 covers Hall.
- Coweta CivicClerk needs its own small adapter: Events → Meetings → `attachmentsList[].pdfVersionFullPath`.
- JS-rendered builder sites (DRB, Zonda).
