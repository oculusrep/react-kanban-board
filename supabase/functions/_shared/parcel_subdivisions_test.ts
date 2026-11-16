import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts';
import { classify } from './research-parcel-subdivisions.ts';
import { groupSubdivisions, isResidentialName, isResidentialZoning, titleCase, type ParcelFeature, type SubdivisionLayer } from './subdivision-layers.ts';

const L1 = { label: 'city', county: 'Henry County', priority: 1 } as SubdivisionLayer;
const L2 = { label: 'county', county: 'Henry County', priority: 2 } as SubdivisionLayer;
const f = (no: string, sub: string, zoning: string | null, layer = L1): ParcelFeature =>
  ({ parcelNo: no, subdivision: sub, zoning, city: 'LOCUST GROVE', geometry: {}, layer });

Deno.test('classify: build-out year decides, then majority, then still building', () => {
  const s = ['https://x.gov'];
  const first = { first_homes_year: null };
  assertEquals(classify({ ...first, built_out_year: 2021, majority_year: null, still_building: false, sources: s }), { cls: 'recent', year: 2021 });
  assertEquals(classify({ ...first, built_out_year: 2008, majority_year: null, still_building: false, sources: s }), { cls: 'established', year: 2008 });
  assertEquals(classify({ ...first, built_out_year: null, majority_year: 2022, still_building: true, sources: s }), { cls: 'recent', year: 2022 });
  assertEquals(classify({ ...first, built_out_year: null, majority_year: null, still_building: true, sources: s }), { cls: 'building', year: null });
  assertEquals(classify({ ...first, built_out_year: 2021, majority_year: null, still_building: false, sources: [] }), { cls: 'unknown', year: null });
  assertEquals(classify({ ...first, built_out_year: null, majority_year: null, still_building: null, sources: s }), { cls: 'unknown', year: null });
  assertEquals(classify({ first_homes_year: 2002, built_out_year: null, majority_year: null, still_building: true, sources: s }), { cls: 'unknown', year: null });
  assertEquals(classify({ first_homes_year: 2019, built_out_year: null, majority_year: null, still_building: true, sources: s }), { cls: 'building', year: null });
});

Deno.test('zoning and names', () => {
  for (const z of ['R2', 'R-3', 'RA', 'RM', 'RMH', 'PD', 'City', 'MU', null]) assertEquals(isResidentialZoning(z), true, String(z));
  for (const z of ['C1', 'C-2', 'OI', 'O-I', 'M-1', 'LI']) assertEquals(isResidentialZoning(z), false, z);
  assertEquals(isResidentialName('Grove Professional Center'), false);
  assertEquals(isResidentialName('Hawthorne at Linden Park'), true);
  assertEquals(titleCase('HAWTHORNE AT LINDEN PARK'), 'Hawthorne at Linden Park');
  assertEquals(titleCase('SKYLAND MHP'), 'Skyland MHP');
  assertEquals(titleCase('ELMSTONE COMMONS AT L G STATION'), 'Elmstone Commons at L G Station');
});

Deno.test('group: dedupe across layers, residential only, 25+ parcels', () => {
  const feats: ParcelFeature[] = [];
  for (let i = 0; i < 30; i++) feats.push(f(`A${i}`, 'BIG SUB', 'R2'));
  for (let i = 0; i < 30; i++) feats.push(f(`A${i}`, 'BIG SUB', 'R2', L2)); // same parcels from county layer
  for (let i = 0; i < 26; i++) feats.push(f(`B${i}`, 'MIXED', i < 3 ? 'C1' : 'R3'));
  for (let i = 0; i < 40; i++) feats.push(f(`C${i}`, 'GROVE PROFESSIONAL CENTER', 'R3'));
  for (let i = 0; i < 40; i++) feats.push(f(`D${i}`, 'SKYLAND MHP', 'RMH'));
  const { groups, skipped } = groupSubdivisions(feats, 25);
  assertEquals(groups.map((g) => [g.name, g.parcels.length]), [['Big Sub', 30]]);
  assertEquals(skipped.map((s) => s.reason).sort(), ['mobile home park', 'non-residential name', 'under 25 parcels']);
});
