# The four missing archetypes — open decision

**Status: recorded, not built. Revisit when a real site does not fit the five. Not before.**

The original generators prompt carried nine archetypes. OVIS implements five: **GROWTH, MATURE,
REDEVELOPMENT, RELIEF, WHITE_SPACE**. Missing: **EMPLOYMENT NODE, COMMUTER, TRAVEL,
INSTITUTIONAL**. REDEVELOPMENT was in the original four-that-might-be-missing list but did survive.

As far as the repository can show, the reduction was **lost in translation rather than decided**:
archetype_call v1 already had exactly these five, every version since has had the same five, and
nothing in the code, migrations or docs records a decision to drop the other four.

## Adding one is NOT a prompt-only change

```sql
CHECK ((archetype_primary   = ANY (ARRAY['GROWTH','MATURE','REDEVELOPMENT','RELIEF','WHITE_SPACE'])))
CHECK ((archetype_secondary = ANY (ARRAY['GROWTH','MATURE','REDEVELOPMENT','RELIEF','WHITE_SPACE'])))
```

`research_thread` constrains both columns to exactly these five. A sixth value **fails the write and
kills the run** — the archetype is parsed out of the model's JSON and stored, so a prompt that
offers a sixth without a migration produces a run that researches correctly and then dies at
finalize. Any addition is: migration first (both constraints), then the prompt.

This is also why v13's CANNOT BE ASSESSED is prose only and never a JSON value.

## The four

### INSTITUTIONAL — a real gap
**Claims:** demand is anchored by a single large institution — a hospital campus, a university, a
large district campus, a government centre — whose population is captive, scheduled and largely
indifferent to the residential trade area around it.

**Evidence that would prove it:** a sourced institutional headcount or bed count within a short
drive, a daytime population far exceeding residents, a shift pattern or class schedule that creates
a repeating morning peak, and an existing retail mix serving the institution rather than the
neighbourhood.

**Covered today?** No. A site built on a hospital or a university has to be forced into MATURE
("built out and stable") or WHITE_SPACE ("unserved demand"), and neither describes the argument —
both talk about the trade area, and this site's story is about one occupant of it.

Note the data now exists even though the archetype does not: IPEDS gives institutional headcount in
`query_nearby_schools`' third group, and the deep pass records hospitals in beds with a sourced
daypart. So an INSTITUTIONAL call would be evidenced, not speculative.

### TRAVEL — a real gap
**Claims:** demand is pass-through rather than resident — interstate traffic, an interchange, a
hotel cluster, an airport corridor. The customer is not from here and will not come back this week.

**Evidence that would prove it:** high AADT on an interstate or arterial at an interchange, a hotel
cluster with sourced room counts, a daytime population that is neither resident nor employed
locally, and a competitive set of travel-oriented rather than neighbourhood brands.

**Covered today?** No, and the misfit is worse than INSTITUTIONAL's. An interchange site reads as
WHITE_SPACE ("no Starbucks within a meaningful drive") when the real argument is that 30,000
vehicles a day pass it — a claim about flow, not about an unserved catchment. Forced into MATURE it
looks weak, because the resident numbers are beside the point.

Hotel room counts are already collected by the deep pass's `record_generator`; AADT is already in
`query_traffic_counts`. Again: evidenced, not speculative.

### COMMUTER — probably not an archetype
**Claims:** the site captures directional morning flow — people leaving a residential area toward
employment elsewhere.

**Evidence:** directional AM peak volume on the inbound side, a residential catchment with low
local employment, a daytime population below the resident population.

**Covered today?** Substantially, as **evidence rather than as a call**. Category 4 is exactly
"daytime vs. residential population (commuter node or live-work node)", and WHITE_SPACE names "a
commuter or daytime draw" among its evidence. That is roughly the right shape: commuter behaviour
supports an argument, it rarely is the argument.

The binding constraint is not the archetype list anyway — it is the data. `query_traffic_counts`
returns **bidirectional** AADT with no directional split, no peak-hour breakdown and no road names,
which the v11 Macon run had to state as an unanswered objection. A COMMUTER archetype would rest on
a number OVIS cannot currently produce.

### EMPLOYMENT NODE — probably not an archetype
**Claims:** concentrated daytime employment drives demand.

**Evidence:** sourced site-level headcounts within a short drive, daytime population exceeding
residents, an employment mix generating a morning peak.

**Covered today?** Mostly, as evidence. The deep pass already filters employers to those generating
concentrated daytime population, excludes customer-facing retail and QSR, and requires a sourced
headcount. Where the employment base is genuinely the story it tends to be one institution — which
is INSTITUTIONAL above — or a corridor already describable as MATURE.

The Macon v11 run is the useful case: no employer within 5 mi had a sourced site headcount, and the
report said so plainly. An EMPLOYMENT NODE archetype would have had nothing to stand on.

## Recommendation carried forward

INSTITUTIONAL and TRAVEL look like real gaps: a site built on either must currently be forced into
an archetype that does not describe it. COMMUTER and EMPLOYMENT NODE are better as Category 4
evidence than as calls, which is roughly what the tools already do.

Revisit when a site does not fit the five — and when it happens, note *which* site, because one
forced call is an anecdote and three are a decision.
