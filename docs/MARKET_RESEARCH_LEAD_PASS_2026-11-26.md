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

## 3. Automation (built 2026-11-26)

Three steps were added to the post-run pipeline. The same code runs from all three entry points:
- `ovis-research-mcp` after the final submit;
- the **Fill missing units & locations** button (`research-fill-units`);
- the recently built pass (`research-recent-built`).

```
dedupe
→ unit count, per lead (research-unit-estimator.ts):
    0a. parcel layer        research-unit-parcels.ts    (new, no LLM)
    0b. cited documents     research-unit-documents.ts  (new, Gemini url_context)
    1.  Gemini web search   (as before)
    2.  acres × density     (as before)
→ locate → dedupe → parcel fetch → distance check
→ lead triage               research-lead-triage.ts     (new, last step)
```

### 0a. Parcel layer

| Layer | Name fields | What confirms the count |
|---|---|---|
| Hall | `SUBD_NAME`, `LEGAL_DESC` | lot numbers (`SUBD_LOT` / "LOT n") |
| Coweta | `SubdivisionName`, `LegalDescription` | lot numbers, `SubdivisionPhase` / `Section`, `YearBuilt` |
| Douglas | `SUBDIVISION` | `yr_built` |
| Henry | `SUBDIVISIO` | none, so it only writes a note |

How a record is matched:
- Name variants come from the project name, with "(formerly …)" aliases. Phase words and words like Subdivision or Homes are dropped.
- Common areas are dropped: open space, amenity areas, detention ponds, and parcels owned by an HOA.
- A phased record ("Phase 2B", "Unit 1", "V and VI", "new section") counts only the parcels tagged with every phase it names.

A count is written only when it can't be an older neighborhood that shares the name:
- **Lot numbers 1..N with no gaps** → N, `reported`.
- **Every lot unbuilt or built in the last 3 years** (layers with year built) → the parcel count. Phased → `reported`, unphased → `estimated`.
- **Anything else** → no count, and the parcel count goes into the record's notes for the reviewer.

Checked live against today's records:

| Record | Result |
|---|---|
| Falcon Landing | 148 |
| Union Heights | 125 |
| Fox Hall Ph 6 | 32 |
| Fox Hall Ph V + VI | 64 |
| Ponderosa | No count (lot-number gaps) |
| Ashley Falls | No count: 148 of 206 built before 2023 |
| Kensington Park 2B | No count: Phase 2 not tagged |
| Charlton Crossing New Section | No count: section not identifiable |

### 0b. Cited-document reader

What it reads:
- **URLs:** every link in `permit_url`, `source` and `notes`. Grounding redirects are resolved and listing sites dropped. At most 8, with PDFs and government pages first.
- **One hop:** each cited HTML page is fetched from the edge function, and its document links (PDFs, showpublisheddocument, attachments, packets, staff reports, plats) are ranked by project words and case numbers. The top 6 are added. At most 20 URLs in all.

The Gemini call:
- Gemini 2.5 Flash with `url_context` + `google_search`. The search lets it find the primary document when none was cited.
- If combining the two tools returns a 400, it retries with `url_context` alone.

Acceptance:
- A count is accepted only with a verbatim quote that contains the number, a non-listing URL that was given, read or searched, and a status.
- The status sets the confidence:

  | Status | `units_confidence` |
  |---|---|
  | approved | `approved` (first writer of this value) |
  | stated | `reported` |
  | proposed / cap | `estimated` (EST. badge; the note says PROPOSED or CAP) |

When it doesn't run:
- Skipped for recently built records, and for records already marked out of radius.
- A run's first 150 s get document reads. Records that reach the step after that skip it in this pass, and Fill missing units picks them up. This keeps the post-run job inside the edge-function wall clock.

Logging: each attempt goes to `research_unit_estimate` as method `document`, with `sources` = {given, read, search, url, page, quote, status}. Parcel attempts are method `parcel`, with `model` = the layer label. Migration `20261126021844` added both methods to the check constraint.

API field names were checked against the `@google/genai` 1.30.0 type definitions, because ai.google.dev wasn't reachable from the build session:
- `Tool.urlContext`
- `candidates[0].urlContextMetadata.urlMetadata[].{retrievedUrl, urlRetrievalStatus}`
- `URL_RETRIEVAL_STATUS_SUCCESS`

**The reader hasn't made a live Gemini call yet.** The first real run is the check.

### Lead triage (last step)

A pending lead with no count, after at least one count step has tried it, is **rejected** when:
- its `lead_reason` is a distance one ("Outside the …"), or
- it is `gemini_recent`, or
- every source domain it names is a listing site.

How the rejection is recorded:
- `reject_reason` starts with "Auto-triage:" and `auto_resolved_at` is set.
- Undo (`unreject_research_staging_row`) sets `auto_dedupe_skip`, and triage never touches a row with that flag again.
- Fill missing units with "include rejected" restores these rows and re-rejects any that still have no count.

Leads from P&Z agendas, permit portals, news or activity PDFs that are inside the radius stay leads.

### Still not covered

- Hall Accela attachments need a login. The parcel step covers Hall instead.
- The Coweta CivicClerk API (Events → Meetings → `attachmentsList[].pdfVersionFullPath`) has no adapter. Its attachment links are expiring SAS URLs.
- JS-rendered builder sites (DRB, Zonda).
- Newton has no parcel subdivision names (all blank). Houston and Cobb have barely any.

## 4. First live test (2026-11-28, Fill missing units on the Pad Sites / Publix sweep + one other)

- **Document reader works.** Liberty Communities Hwy 81 W: 353 units (202 SF + 151 TH) quoted from the Henry BOC
  May 28 2025 minutes, p.11. It was found by search, since the record cited no URLs.
- **Large packet not read.** Peeksville Rd: url_context reached the Locust Grove page but couldn't parse the
  17.5 MB packet PDF. Packets this size need our own fetch plus the Gemini File API (not built).
- **Fixed: Fill restored out-of-radius rejections.** "Include rejected" brought back Arrowhead, Newberry and Branch
  Springs and bought them counts (149, 349, 1,632). Arrowhead and Newberry were re-rejected. `isRestorableReason`
  now skips out-of-radius and listing-only rejections. Branch Springs (different sweep, its original reason was lost
  when it got a count) is pending at 1,632, an acres × density estimate. Review it.
- **Fixed: "approved" on a request.** The model labelled the Liberty quote "approved" because the case was approved,
  but the quote is the application ("The proposed development includes…"). A quote that describes the request is now
  stored as proposed (`estimated`). Liberty was corrected by hand.
- **Fixed: redirect links.** The source URL was a grounding redirect, which expires. It is now resolved before saving.
  Liberty's note still holds the redirect, because that host is blocked from the build session.
- The locate step later placed Liberty 10.9 mi from the site, so it sits in "Needs a decision" despite the count.

## 5. Big PDFs through the Gemini Files API (2026-11-28)

`url_context` can't parse large agenda packets: Locust Grove's 17.5 MB one came back empty. The document reader now
downloads PDFs itself and attaches them through the Files API:

- **Pass 1:** cited and one-hop URLs that serve a PDF (by content type or a `%PDF` header) are uploaded and attached.
  At most 3, each up to 50 MB (Gemini's PDF limit), with 75 s of downloads per record. The rest go to `url_context` as before.
- **Pass 2, only when pass 1 found no count:** PDFs among the URLs Gemini tried, or found by search, are downloaded and
  read as files in a second call with no tools.
- Files are deleted after the call (they expire in 48 h anyway). The note lists the PDFs read and their sizes.
- Cost: about 258 tokens per page, so a 300-page packet is about 2.3¢.

The REST shape came from the `@google/genai` 1.30.0 source, because ai.google.dev wasn't reachable from the session:
- Start: `POST /upload/v1beta/files`, resumable.
- Upload: the bytes go to `x-goog-upload-url` with `upload, finalize`.
- Poll: `GET /v1beta/{name}` until `ACTIVE`.
- Attach: `file_data {mime_type, file_uri}`.

The download was tested here on a 28 MB council packet. The upload and read can only be tested from the deployed function.

Peeksville's notes now carry the four Locust Grove document links the 2026-11-26 search found, so pass 1 has the packet.
