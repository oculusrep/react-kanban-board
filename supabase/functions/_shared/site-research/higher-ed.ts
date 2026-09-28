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

import { buildSchoolRow, FLAG_CHECK, type SchoolsRow } from '../csv.ts';

export const HIGHER_ED_RADIUS_MILES = 5;

/** The line the report carries wherever higher education is discussed. */
export const HIGHER_ED_CAVEAT =
  'Higher-ed rows come from institutions that report their own IPEDS UNITID; satellite campuses ' +
  'of larger systems may not appear.';

export interface IpedsRow {
  unitid: number;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  enrollment: number | null;
  enrollment_year: number | null;
  school_level: string | null;
  residential: boolean | null;
  dormitory_capacity: number | null;
  system_name: string | null;
  /** IPEDS: 1 public, 2 private not-for-profit, 3 private for-profit. */
  control: number | null;
  distance_miles: number | null;
}

// deno-lint-ignore no-explicit-any
type Rpc = { rpc: (fn: string, args?: Record<string, unknown>) => any };

export async function higherEdNear(
  rpc: Rpc,
  site: { latitude: number; longitude: number },
  radiusMiles = HIGHER_ED_RADIUS_MILES,
): Promise<IpedsRow[]> {
  const { data, error } = await rpc.rpc('ipeds_near_point', {
    p_latitude: site.latitude, p_longitude: site.longitude, p_radius_miles: radiusMiles,
  });
  if (error) throw new Error(`ipeds_near_point failed: ${error.message}`);
  // Anything but an array is a broken contract, not zero colleges. Say so rather than exporting
  // silence — the whole reason this is a table and not an API call in the run path.
  if (data != null && !Array.isArray(data)) throw new Error('ipeds_near_point returned a non-array');
  return (data ?? []) as IpedsRow[];
}

/** 1 / 3 / 5 mi, the same membership the K-12 bands use. */
export function bandForMiles(d: number | null): string | null {
  if (d === null || !Number.isFinite(d)) return null;
  if (d <= 1) return '1';
  if (d <= 3) return '3';
  if (d <= 5) return '5';
  return null;
}

/**
 * One schools.csv row per institution.
 *
 * notes carry exactly two things, as specced: residential or commuter, and what we can honestly
 * say about main campus versus branch. IPEDS has no main/branch flag — a branch either reports its
 * own UNITID or is invisible — so the honest statement is system membership, not a guess.
 */
export function higherEdRows(rows: IpedsRow[]): SchoolsRow[] {
  return rows.map((r) => {
    const notes: string[] = [];
    if (r.residential === true) {
      notes.push(r.dormitory_capacity ? `residential campus (${r.dormitory_capacity.toLocaleString('en-US')} dorm beds)` : 'residential campus');
    } else if (r.residential === false) {
      notes.push('commuter campus, no on-campus housing');
    } else {
      notes.push('residential or commuter not stated');
    }
    notes.push(r.system_name
      ? `reports its own IPEDS UNITID; part of the ${r.system_name} system`
      : 'reports its own IPEDS UNITID; no parent system on file');

    const row = buildSchoolRow({
      // IPEDS control 1 is public; 2 (not-for-profit) and 3 (for-profit) are both private, which is
      // the distinction the K-12 column already makes.
      name: r.name, public_private: r.control === 1 ? 'public' : 'private', street: r.street, city: r.city, state: r.state, zip: r.zip,
      enrollment: r.enrollment, school_level: r.school_level, grade_low: null, grade_high: null,
      distance_miles: r.distance_miles,
      // The year the ENROLLMENT describes, per row — not when the loader ran.
      school_year: r.enrollment_year === null ? null : String(r.enrollment_year),
      notes: notes.join('; '),
    });
    row.band = bandForMiles(r.distance_miles);
    row.enrollment_source = 'IPEDS';
    row.address_source = 'IPEDS';
    // A college with no enrollment on file is a CHECK, exactly as a K-12 row would be.
    if (r.enrollment === null) row.flag = FLAG_CHECK;
    return row;
  });
}
