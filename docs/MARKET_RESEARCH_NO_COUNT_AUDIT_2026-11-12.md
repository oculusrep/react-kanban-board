# No-count records audit — last 10 runs (2026-11-12)

**Question:** for staged records with no unit count, did the cited source link directly to a
staff report, application, plat or permit page that states the count, one fetch away, which the
agent didn't open or didn't read?

**Scope:** the 10 most recent non-cancelled runs: 5 Deep (2026-11-12, Senoia / Coweta) and 5 Quick
(2026-11-10/11). That's 32 staged rows with `units_needs_review` or a null/0 count. Each cited
source was re-found by hand and the documents one hop from it were opened. Counts were never
inferred from acreage or density.

## Result

| Class | Records | Meaning |
|---|---|---|
| Recoverable, one fetch | **12** | Count stated in a doc one hop from the cited source, or on the cited page itself |
| Recoverable, other path | 5 | Count exists, but the record's own sources don't link to it |
| Linked docs, no count | 8 | Docs exist and were opened; no total stated |
| No linked doc | 2 | Source has nothing to follow (141 South news; the only figure is a zoning ceiling) |
| Blocked | 2 | Coweta Accela record details need a session; drbhomes.com serves a JS shell |
| Source not found | 3 | Citation couldn't be re-found (Howard Rd "paywalled snippets", Haralson citizenportal.ai, Senoia minutes after its site move) |

The 32 rows are about 20 distinct projects. The 12 one-fetch rows cover **9 distinct projects**:
Stallings Farm North 12 lots, Stallings Farm South 24, Welch Farms 9, Grove Park 101, Pollard /
Silver Springs 190, Jackson Farm Ph 2 expansion 67, Fox Hall Ph 5 33, Fox Hall Ph 6 32 and Freedom
Land Holdings 291.

### By discovery_source

| found_by | rows | one fetch | other path | linked, no count | no link | blocked | not found |
|---|---|---|---|---|---|---|---|
| builder_site | 14 | 6 | 4 | 3 | 0 | 1 | 0 |
| pz_agenda | 8 | 5 | 0 | 1 | 0 | 0 | 2 |
| news | 6 | 1 | 1 | 1 | 2 | 0 | 1 |
| permit_portal | 4 | 0 | 0 | 3 | 0 | 1 | 0 |

## Why the counts were missed

1. **Builder lot maps not read (6 rows, 4 projects).** Jeff Lindsey Communities pages carry a
   numbered lot map as an image under a "Site Map" tab. The agent cited the page but didn't read the
   map. On Grove Park it opened the map and rejected 1–101 contiguous lots as "no stated total".
   These counts come from contiguous lot labels on a marketing map, not a filed plat. Where the
   numbering has gaps (Fox Hall V/VI, Heritage Pointe) no total was taken.
2. **Staff report on the cited agenda item not opened (3 rows, 2 projects).** Freedom Land Holdings
   (REZ 25-05): the staff report is on the Aug 19 2025 item the agent cited, and the amended report
   of 10/16/2025 caps it at 291 SFD lots. Pollard / Silver Springs: the county annexation report in
   the cited BOC event 758 packet states 190 homes.
3. **Scanned PDF with no text layer (1 row).** Fox Hall Ph 5: the cited final plat states "TOTAL
   LOTS: UNIT 5 - 33 LOTS", but as an image. The agent estimated from acreage instead.
4. **Stated counts withheld over phasing (1 row).** Jackson Farm (Cartersville Z24-07): 67 lots
   approved, and the Z24-02 staff report has the breakdown. The agent had numbers and nulled them.
   Its "112 lots" figure doesn't match the staff report's 103.

Counts were genuinely absent for the permit-portal rows. Coweta Accela shows a record's header and
status anonymously, but not its description or attachments.

## Side findings

- **Duplicates staged across runs:** Stallings Farm North ×3, Stallings Farm South ×3, Welch Farms ×2,
  Grove Park ×3, 141 South ×4, Pollard / Silver Springs ×2, Freedom Land ×2.
- **Bad data:** Grove Park record #7 carries a Welch Farms address (1283 McIntosh Trail Lot 8). One
  Stallings Farm North note says "at least 29 lots"; the map shows lots 25–36. Freedom Land #28
  cites the Dec 4 event, which has no staff report.
- **Coweta CivicClerk has a public API:** `cowetacoga.api.civicclerk.com/v1/Events/{id}` →
  `/v1/Meetings/{agendaId}` → `attachmentsList[].pdfVersionFullPath`. Attachment links are expiring
  SAS URLs. BOC annexation reports state "dwelling units from application".
- **Welch Farms is 9 lots**, below the 25-unit threshold.
