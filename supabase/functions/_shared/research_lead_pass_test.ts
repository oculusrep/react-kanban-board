import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { candidateNames, decideCount, isPartialRecord, parsePhases, type Parcel } from './research-unit-parcels.ts';
import { caseNumbers, extractUrls, harvestLinks, judge, quoteHasNumber } from './research-unit-documents.ts';
import { sourceHosts, triageReason, type TriageRow } from './research-lead-triage.ts';

Deno.test('parsePhases', () => {
  assertEquals(parsePhases('Phase V and VI'), [5, 6]);
  assertEquals(parsePhases('Phase 2B'), [2]);
  assertEquals(parsePhases('Unit 1 (platted)'), [1]);
  assertEquals(parsePhases('Phase 2 & Phase 3'), [2, 3]);
  assertEquals(parsePhases('Phase I (Estates) + Phase II (Townhomes)'), [1, 2]);
  assertEquals(parsePhases('Section Viewpoint'), []);
  assertEquals(parsePhases('Phase South'), []);
  assertEquals(parsePhases(null), []);
});

Deno.test('isPartialRecord', () => {
  assertEquals(isPartialRecord('Charlton Crossing New Section', null), true);
  assertEquals(isPartialRecord('Kensington Park', 'Phase 2B'), true);
  assertEquals(isPartialRecord('Harley Farms South', 'Phase South'), true);
  assertEquals(isPartialRecord('Falcon Landing', null), false);
});

Deno.test('candidateNames', () => {
  assertEquals(candidateNames('Union Heights (formerly Caracel Farms at Mulberry Creek)'), ['CARACEL FARMS AT MULBERRY CREEK', 'UNION HEIGHTS']);
  assertEquals(candidateNames('Ponderosa Farms Subdivision (Manor & Reserve)'), ['PONDEROSA FARMS']);
  assertEquals(candidateNames('Fox Hall Phase V and VI'), ['FOX HALL']);
  assertEquals(candidateNames('The Park'), []);
  assertEquals(candidateNames('Southgate Estates / Southgate Townhomes'), ['SOUTHGATE ESTATES', 'SOUTHGATE']);
});

const P = (id: number, o: Partial<Parcel> = {}): Parcel =>
  ({ id: String(id), names: ['FALCON LANDING LOT ' + id], lot: id, phase: null, owner: 'D.R. HORTON', propertyClass: 'Residential', acres: 0.1, yearBuilt: null, ...o });
const opts = { layer: 'L', names: ['FALCON LANDING'], phases: [] as number[], partial: false, hasYearBuilt: false, nowYear: 2026 };

Deno.test('decideCount: contiguous lot numbers → reported; common areas dropped', () => {
  const ps = [...Array.from({ length: 30 }, (_, i) => P(i + 1)), P(900, { names: ['FALCON LANDING OPEN SPACE 1'], lot: null })];
  const r = decideCount(ps, opts);
  assertEquals([r.units, r.confidence], [30, 'reported']);
});

Deno.test('decideCount: gaps and no year built → no count', () => {
  const ps = [...Array.from({ length: 26 }, (_, i) => P(i + 1)), ...Array.from({ length: 63 }, (_, i) => P(167 + i))];
  assertEquals(decideCount(ps, opts).units, null);
});

Deno.test('decideCount: year built separates old neighborhoods from new ones', () => {
  const old = Array.from({ length: 40 }, (_, i) => P(i + 1, { lot: null, yearBuilt: i < 30 ? 2016 : null }));
  assertEquals(decideCount(old, { ...opts, hasYearBuilt: true }).units, null);
  const fresh = Array.from({ length: 40 }, (_, i) => P(i + 1, { lot: null, yearBuilt: i < 10 ? 2025 : null }));
  assertEquals([decideCount(fresh, { ...opts, hasYearBuilt: true }).units, decideCount(fresh, { ...opts, hasYearBuilt: true }).confidence], [40, 'estimated']);
});

Deno.test('decideCount: phased record needs every phase tagged', () => {
  const ps = [...Array.from({ length: 32 }, (_, i) => P(i + 1, { phase: 6, yearBuilt: null })), ...Array.from({ length: 100 }, (_, i) => P(200 + i, { yearBuilt: 2010 }))];
  const only6 = decideCount(ps, { ...opts, phases: [6], partial: true, hasYearBuilt: true });
  assertEquals([only6.units, only6.confidence], [32, 'reported']);
  assertEquals(decideCount(ps, { ...opts, phases: [5, 6], partial: true, hasYearBuilt: true }).units, null);
  assertEquals(decideCount(ps, { ...opts, phases: [], partial: true, hasYearBuilt: true }).units, null);
});

Deno.test('extractUrls / caseNumbers', () => {
  assertEquals(extractUrls('see https://a.gov/x.pdf; and (https://b.com/p?id=1).'), ['https://a.gov/x.pdf', 'https://b.com/p?id=1']);
  assertEquals(caseNumbers('RZ-24-12 and AX-RZ-25-05-02, Z24-07, PP23-000004, HSUB24-0002'), ['RZ-24-12', 'AX-RZ-25-05-02', 'Z24-07', 'PP23-000004', 'HSUB24-0002']);
});

Deno.test('harvestLinks ranks the staff report for this case first', () => {
  const html = `<a href="/home/showpublisheddocument/1">Agenda</a>
    <a href="/files/RZ-24-12%20Staff%20Report.pdf">RZ-24-12 Staff Report - Liberty Communities</a>
    <a href="/about">About</a><a href="https://www.zillow.com/x.pdf">z</a>`;
  const out = harvestLinks(html, 'https://henry.gov/meeting/5', ['liberty', 'communities'], ['RZ-24-12']);
  assertEquals(out.map((o) => o.url), ['https://henry.gov/files/RZ-24-12%20Staff%20Report.pdf', 'https://henry.gov/home/showpublisheddocument/1']);
});

Deno.test('quoteHasNumber / judge', () => {
  assertEquals(quoteHasNumber('TOTAL NUMBER OF LOTS … 150 LOTS', 150), true);
  assertEquals(quoteHasNumber('reduce the commercial area to construct (67) Lots', 67), true);
  assertEquals(quoteHasNumber('1,300 units', 1300), true);
  assertEquals(quoteHasNumber('1150 units', 150), false);
  assertEquals(quoteHasNumber('15.0 acres', 150), false);
  const given = ['https://core-docs.s3.us-east-1.amazonaws.com/doc.pdf'];
  assertEquals(judge({ units: 150, status: 'proposed', quote: '150 LOTS', url: given[0] }, given, [], []).units, 150);
  assertEquals(judge({ units: 150, status: 'proposed', quote: 'lots', url: given[0] }, given, [], []).units, null);
  assertEquals(judge({ units: 150, status: 'stated', quote: '150 homes', url: 'https://www.zillow.com/b/x' }, given, [], []).units, null);
  assertEquals(judge({ units: 150, status: 'stated', quote: '150 homes', url: 'https://made-up.example/x' }, given, [], []).units, null);
  assertEquals(judge({ units: 35, status: 'approved', quote: '35 lots', url: 'https://www.henrycounty-ga.com/f.pdf' }, [], [], [{ title: 'henrycounty-ga.com', uri: 'x' }]).units, 35);
  const lib = judge({ units: 353, status: 'approved', quote: 'The proposed development includes a total of 353 residential units', url: 'https://henryga.news/x' }, [], ['https://henryga.news/x'], []);
  assertEquals([lib.units, lib.status], [353, 'proposed']);
});

const T = (o: Partial<TriageRow>): TriageRow => ({
  id: 'x', approval_state: 'pending', total_housing_units: null, units_needs_review: false, lead_reason: null,
  discovery_source: 'pz_agenda', source: 'Henry County BOC minutes', permit_url: null, auto_dedupe_skip: false, fill_restored: null, ...o,
});

Deno.test('isRestorableReason', async () => {
  const { isRestorableReason } = await import('./research-fill.ts');
  assertEquals(isRestorableReason('Lead with no unit count, outside radius (lead cleanup 2026-11-26)'), false);
  assertEquals(isRestorableReason('Auto-triage: lead with no unit count, outside the radius (Outside the 5-mile radius: x)'), false);
  assertEquals(isRestorableReason('Lead with no unit count: Gemini backfill found no source stating a count; only listing-site sources (lead cleanup 2026-11-26)'), false);
  assertEquals(isRestorableReason('Auto-triage: recently built lead with no unit count from the parcel layer, documents or web search'), true);
  assertEquals(isRestorableReason('no units'), false);
  assertEquals(isRestorableReason('no unit count'), true);
  assertEquals(isRestorableReason(null), true);
});

Deno.test('triageReason', () => {
  assertEquals(triageReason(T({}), true), null);
  assertEquals(triageReason(T({ lead_reason: 'Outside the 5-mile radius: x is 7 mi from the site' }), false), null); // not tried yet
  assertEquals(triageReason(T({ lead_reason: 'Outside the 5-mile radius: x is 7 mi from the site' }), true)?.startsWith('Auto-triage: lead with no unit count, outside'), true);
  assertEquals(triageReason(T({ discovery_source: 'gemini_recent' }), true)?.startsWith('Auto-triage: recently built'), true);
  assertEquals(triageReason(T({ source: 'https://www.zillow.com/b/x ; homes.com listing' }), true)?.includes('listing-site'), true);
  assertEquals(triageReason(T({ source: 'DRB Homes community page (drbhomes.com); Zillow' }), true), null);
  assertEquals(triageReason(T({ discovery_source: 'gemini_recent', total_housing_units: 40 }), true), null);
  assertEquals(triageReason(T({ discovery_source: 'gemini_recent', auto_dedupe_skip: true }), true), null);
  assertEquals(sourceHosts('see drbhomes.com and https://www.zillow.com/x'), ['zillow.com', 'drbhomes.com']);
});
