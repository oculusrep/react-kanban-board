/**
 * Higher-education rows for schools.csv, from the bulk ipeds_institution table.
 *
 * Code-sourced like Atlas coffee: the rows appear whether or not the model asked for them, so a
 * college cannot go missing because a tool was not called. And bulk rather than a per-run API
 * call because a third-party API that fails mid-run fails SILENTLY AS ZERO COLLEGES, which reads
 * as "no higher education here" instead of as an outage.
 *
 * They go in schools.csv beside the K-12 rows — one file, the existing columns, no new ones. The
 * count column is total headcount, the same unit as the K-12 enrollment, because the banded
 * totals add them together.
 *
 * WHAT IS NOT HERE: IPEDS is keyed on institutions reporting their own UNITID. A satellite of a
 * larger system that does not report separately is absent, and no IPEDS or Urban Institute
 * endpoint lists additional instructional locations (checked 2026-09-28 against the full endpoint
 * index). That is what the deep pass's satellite-search allowance is for, and why the schools
 * section carries a standing line saying so.
 */

/** The line the report carries wherever higher education is discussed. */
export const HIGHER_ED_CAVEAT =
  'Higher-ed rows come from institutions that report their own IPEDS UNITID; satellite campuses ' +
  'of larger systems may not appear.';
