import { assert, assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import JSZip from 'npm:jszip@3.10.1';
import { buildEmployerRow, buildGeneratorRow, buildSchoolRow, numberPins } from '../csv.ts';
import {
  buildCallouts, buildGeneratorsSlide, calloutWidth, computeTotals, type ExportRows, layoutCallouts, MAP_RECT, SLIDE_W,
  totalsLines,
} from './generators-slide.ts';

const school = (name: string, enrollment: number | null, d: number, higherEd = false) => {
  const r = buildSchoolRow({ name, public_private: 'public', street: '1 A St', city: 'Covington', state: 'GA', zip: null,
    enrollment, school_level: higherEd ? 'College' : 'Elementary', grade_low: null, grade_high: null, distance_miles: d, school_year: null });
  if (higherEd) r.enrollment_source = 'IPEDS';
  return r;
};
const employer = (name: string, headcount: number | null, d: number, street: string | null = null) =>
  buildEmployerRow({ name, employer_type: 'hospital', street, city: null, state: null, zip: null, headcount, distance_miles: d, source: 'x', source_year: 2025 });
const generator = (name: string, category: string, size: number | null, unit: string | null, d: number, street: string | null = null) =>
  buildGeneratorRow({ name, category, size_value: size, size_unit: unit, street, city: null, state: null, zip: null,
    latitude: 33.6, longitude: -83.8, distance_miles: d, drive_time_band: null, source: 'x' });

const rows = (): ExportRows => ({
  schools: numberPins([school('Far ES', 1250, 3), school('Near ES', 600, 0.5), school('Ghost Academy', null, 1), school('Newton College', 2100, 2, true)]),
  employers: numberPins([employer('Piedmont Newton Hospital', 1400, 1.2, '5126 Hospital Dr NE'), employer('Factory', null, 4)]),
  generators: numberPins([
    generator('Piedmont Newton', 'hospital_medical', 97, 'beds', 1.2, '5126 Hospital Drive NE'),
    generator('First Baptist', 'church', 1200, 'seats', 0.8),
    generator('Hampton Inn', 'hotel', null, null, 2.5),
  ]),
});

Deno.test('callouts: one per row, sorted by pin, commas, units, no pin number in the text; hospital merged into Employers', () => {
  const { callouts, mergedGenerators } = buildCallouts(rows());
  assertEquals(callouts.map((c) => [c.group, c.pin, c.line1, c.line2]), [
    ['school', 1, 'Near ES', '(600 Students)'],
    ['school', 2, 'Ghost Academy', '(Students not on file)'],
    ['school', 3, 'Newton College', '(2,100 Students)'],
    ['school', 4, 'Far ES', '(1,250 Students)'],
    ['employer', 1, 'Piedmont Newton Hospital', '(1,400 Employees)'],
    ['employer', 2, 'Factory', '(Employees not on file)'],
    ['generator', 1, 'First Baptist', '(1,200 Seats)'],
    ['generator', 3, 'Hampton Inn', '(Size not on file)'],
  ]);
  assertEquals(mergedGenerators, ['Piedmont Newton']);
});

Deno.test('a church sharing an employer street is not merged; only hospital_medical can be', () => {
  const r = rows();
  r.generators = numberPins([generator('Grace Church', 'church', 300, 'seats', 1, '5126 Hospital Dr NE')]);
  assertEquals(buildCallouts(r).mergedGenerators, []);
});

Deno.test('totals are summed from the rows; college kept apart; missing counted, never zero', () => {
  const t = computeTotals(rows());
  assertEquals([t.k12Students, t.k12Missing, t.higherEdStudents, t.employees, t.employersMissing], [1850, 1, 2100, 1400, 1]);
  assertEquals(totalsLines(t), [
    'Total students (K-12): 1,850 · 1 not on file',
    'College students (IPEDS, not added): 2,100',
    'Total employees: 1,400 · 1 not on file',
  ]);
});

Deno.test('layout: no cap, nothing overlaps (pointer room included), pin order kept, overflow goes off-slide', () => {
  const many = Array.from({ length: 160 }, (_, i) => ({ group: 'school' as const, pin: i + 1, line1: `School number ${i + 1} with a long name`, line2: '(1,000 Students)' }));
  const placed = layoutCallouts(many, MAP_RECT, SLIDE_W);
  assertEquals(placed.length, 160);
  assertEquals(placed.map((p) => p.callout.pin), many.map((c) => c.pin));
  const pad = 0.1; // tails reach 0.14 out; rows and columns keep that clear, so boxes grown by 0.1 must still not touch
  for (let i = 0; i < placed.length; i++) {
    const a = placed[i];
    if (!a.offSlide) {
      assert(a.x >= MAP_RECT.x && a.x + a.w <= MAP_RECT.x + MAP_RECT.w + 1e-9, `inside the map: ${a.callout.pin}`);
      assert(a.y >= MAP_RECT.y && a.y + a.h <= MAP_RECT.y + MAP_RECT.h + 1e-9, `inside the map: ${a.callout.pin}`);
    } else assert(a.x >= SLIDE_W, 'overflow is staged off the slide');
    for (let j = i + 1; j < placed.length; j++) {
      const b = placed[j];
      const overlap = a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h && b.y < a.y + a.h;
      const sameRowNeighbours = Math.abs(a.y - b.y) < 1e-9;
      assert(!overlap || (sameRowNeighbours && (a.x + a.w <= b.x || b.x + b.w <= a.x)), `overlap: ${a.callout.pin} / ${b.callout.pin}`);
    }
  }
  assert(placed.some((p) => p.offSlide), '160 long callouts cannot all fit inside the map');
});

Deno.test('callout width grows with its text; the font never shrinks', () => {
  const short = calloutWidth({ group: 'school', pin: 1, line1: 'Short', line2: '(9 Students)' });
  const long = calloutWidth({ group: 'school', pin: 1, line1: 'A considerably longer school name here', line2: '(9 Students)' });
  assert(long > short + 1);
});

Deno.test('pptx: picture placeholder first in the tree, Aptos 8pt, fills, 1pt black outline, pointers set', async () => {
  const r = await buildGeneratorsSlide({ siteName: 'SBUX Covington', address: 'John R. Williams Hwy, Covington, GA', rows: rows() });
  assertEquals(r.callouts, 8);
  const zip = await JSZip.loadAsync(r.pptx);
  const slide = await zip.file('ppt/slides/slide1.xml')!.async('string');
  const first = slide.slice(slide.indexOf('</p:grpSpPr>'), slide.indexOf('</p:grpSpPr>') + 300);
  assert(first.includes('<p:ph type="pic" idx="100"/>') && first.includes('name="Sites USA map"'), first);
  assertEquals((slide.match(/prst="wedgeRoundRectCallout"><a:avLst><a:gd name="adj1"/g) ?? []).length, 8);
  assertEquals((slide.match(/<a:srgbClr val="E3A47B"\/>/g) ?? []).length, 2, 'two employer fills');
  assert(slide.includes('sz="800"') && slide.includes('typeface="Aptos"'));
  assert(slide.includes('<a:ln w="12700"><a:solidFill><a:srgbClr val="000000"/>'));
  assert(!/\(\d+\)\s/.test(slide) && !slide.includes('#1 '), 'no pin numbers in callout text');
  const layouts = await Promise.all(Object.keys(zip.files).filter((n) => /slideLayout\d+\.xml$/.test(n)).map((n) => zip.file(n)!.async('string')));
  assert(layouts.some((l) => l.includes('type="pic"') && l.includes('Paste Sites USA map')));
});
