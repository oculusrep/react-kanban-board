# Higher education in site research (IPEDS)

## Why a table, not an API call in the run path

A third-party API that fails mid-run **fails silently as zero colleges**, which reads as "there is
no higher education here" rather than as an outage — the same failure mode that had the deep pass
report 860 pipeline units when the real figure was 1,732. A bulk table either has rows or is
provably empty. Same pattern as the PSS private-school load.

`higherEdNear` also rejects a non-array response outright instead of coercing it to `[]`, because
a broken contract must not look like an empty trade area.

## The load

`scripts/load-ipeds.ts` — annual refresh, free, no API key.

```bash
deno run --node-modules-dir=none --allow-env --allow-net --allow-read scripts/load-ipeds.ts --year 2023
```

Three Urban Institute Education Data API endpoints, joined on UNITID:

| | |
|---|---|
| `ipeds/directory/{year}` | name, address, **lat/long**, control, institution level, system |
| `ipeds/enrollment-headcount/{year}/{undergraduate\|graduate}` | headcount at `sex=99&ftpt=99&race=99` (the all-students row) |
| `ipeds/institutional-characteristics/{year}` | `oncampus_housing`, `dormitory_capacity` |

The directory carries coordinates directly, so the EDGE postsecondary layer is not needed.

**2023 load: 6,163 institutions, all geocoded, 5,823 with enrollment.** Chunked upserts with a
retry — the connection dropped once mid-load (`BadRecordMac` at chunk 5000) and the upsert is
idempotent on UNITID, so retrying a chunk is free.

## Deliberately an enrollment number, not a profile

`headcount_total` = undergraduate + graduate headcount, **the same unit as the K-12 enrollment
column**, because the banded school totals add them together. FTE, the full-time/part-time split
and dormitory capacity beyond a residential read are not exported.

`enrollment_year` is **the year the enrollment describes**, carried per row, not the loader run
date — so a stale institution is visible rather than dated to today.

IPEDS codes `-1/-2/-3` for "not applicable" and "not reported"; the loader maps those to NULL, not
to zero.

## One source: query_nearby_schools

Higher ed is a **third group inside `query_nearby_schools`**, beside public and private — not a
separate fetch at export time. That was a deliberate correction: the first cut fetched IPEDS in the
exports phase, which put colleges in schools.csv but not in the banded totals the prose cites, so
**the file contradicted the prose shipped beside it** — 1,469 students at Macon in one and absent
from the other. One tool result now feeds both.

```
--- 5 mi ---
  public  : 9,028 across 11  (2024-2025)
  private : 1,903 across 8   (2023-2024)
  higher  : 1,469 across 3   (2023)
```

Three groups, three vintages, **never summed**. The same rule that already keeps public (includes
pre-K) and private (excludes it) apart: adding an IPEDS headcount for 2023 to an NCES school-year
count is adding unlike things across unlike years. deep_pass v12 and archetype_call v12 state the
rule and require every band that includes higher ed to say so.

A band whose higher-education total is 0 has no institution reporting there — said plainly, not
treated as a gap.

## In schools.csv

One file, existing columns, no new ones. Higher-ed rows sort in by distance beside the K-12 rows.

- `school_level` — College / University (four-year with graduate enrollment) / Technical College
- `public_private` — from IPEDS `control`: 1 public; 2 (not-for-profit) and 3 (for-profit) private
- `enrollment_source` / `address_source` — `IPEDS`
- `band` — 1 / 3 / 5 mi, the same membership the K-12 bands use
- `notes` — two things only: **residential or commuter** (from `oncampus_housing`, with dorm beds
  when on file), and what can honestly be said about main campus versus branch
- No enrollment on file → blank and `flag=CHECK`, never guessed

Macon: Wesleyan College (1,099, residential, 2.7 mi) in the 3 and 5 mi bands; Miller-Motte
College-Macon (337, 4.5 mi) and Webb's Barber School of Arts (33, 4.8 mi) in the 5 mi band. The 1
mi band has none. The v11 deep pass had reported Wesleyan with "no headcount stated by the sources
found" — closed without a search.

**Existing threads do not gain them retroactively.** The rows come from Step 1's persisted
`query_nearby_schools` results, so a thread whose archetype pass ran before this change has no
higher-education group, and its deep pass will say so rather than invent one. A new thread picks
them up on its first pass.

## What this cannot see, and the standing line

**IPEDS is keyed on institutions that report their own UNITID.** A satellite or instructional site
of a larger system that does not report separately is simply absent.

Checked 2026-09-28 against the Urban Institute's full endpoint index: **there is no additional-
instructional-locations dataset**, geocoded or otherwise. The endpoints are directory,
characteristics, enrollment, tuition, aid, completions, outcomes and finance — nothing listing
sites. So the gap cannot be closed by loading more data.

`main campus or branch` therefore cannot be stated as a flag, because IPEDS has none. The honest
substitute is system membership: a row says *"reports its own IPEDS UNITID; part of the X system"*
or *"...; no parent system on file"*.

Every report carries the standing line:

> Higher-ed rows come from institutions that report their own IPEDS UNITID; satellite campuses of
> larger systems may not appear.

The deep pass's two-search satellite allowance is the only thing that closes it, and an unpublished
satellite enrollment stays blank and flagged rather than guessed.
