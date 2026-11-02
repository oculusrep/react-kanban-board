// Tour PDF: static map framing/projection + a builder smoke test (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitFrame, projector, simplifyPx, staticMapUrl } from '../../src/lib/staticMapProjection';
import { buildTourPdf, distanceToPathsMeters, formatDayDate, pdfText, type PdfDay, type PdfStopRow } from '../../src/lib/tourPdf';

const pts = [
  { lat: 33.3459, lng: -84.1091 },
  { lat: 33.2632, lng: -84.2632 },
  { lat: 33.2943, lng: -83.966 },
];

test('fitFrame keeps every point inside the padded frame, at the tightest zoom', () => {
  const f = fitFrame(pts, 640, 340, 36);
  const p = projector(f);
  for (const q of pts.map(p)) {
    assert.ok(q.x >= 36 - 0.5 && q.x <= 640 - 36 + 0.5, `x ${q.x}`);
    assert.ok(q.y >= 36 - 0.5 && q.y <= 340 - 36 + 0.5, `y ${q.y}`);
  }
  // One zoom tighter would not fit.
  const tighter = projector({ ...f, zoom: f.zoom + 1 });
  const xs = pts.map(tighter).map((q) => q.x), ys = pts.map(tighter).map((q) => q.y);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 640 - 72 || Math.max(...ys) - Math.min(...ys) > 340 - 72);
});

test('projector puts the frame center at the image center', () => {
  const f = fitFrame(pts, 640, 340);
  const c = projector(f)(f.center);
  assert.ok(Math.abs(c.x - 320) < 1e-6 && Math.abs(c.y - 170) < 1e-6);
});

test('simplifyPx keeps endpoints and drops sub-pixel jitter', () => {
  const line = Array.from({ length: 100 }, (_, i) => ({ x: i * 0.1, y: 0 }));
  const s = simplifyPx(line, 1);
  assert.deepEqual(s[0], line[0]);
  assert.deepEqual(s[s.length - 1], line[99]);
  assert.ok(s.length < 15);
});

test('staticMapUrl carries only a basemap (no paths/markers)', () => {
  const u = new URL(staticMapUrl(fitFrame(pts, 640, 340), 'KEY'));
  assert.equal(u.searchParams.get('scale'), '2');
  assert.equal(u.searchParams.get('size'), '640x340');
  assert.equal(u.searchParams.get('path'), null);
  assert.equal(u.searchParams.get('markers'), null);
});

test('pdfText maps typography to WinAnsi and drops the rest', () => {
  assert.equal(pdfText('Kroger’s — “Main” · 4545 → ✓'), 'Kroger\'s - "Main" · 4545 -> ');
  assert.equal(formatDayDate('2026-11-04'), 'Wed, Nov 4, 2026');
});

test('buildTourPdf: landscape cover + per-day agenda/map, survives failed images', async () => {
  const row = (i: number, kind: PdfStopRow['kind'] = 'site_submit'): PdfStopRow => ({
    siteNo: kind === 'site_submit' ? i + 1 : null,
    kind,
    name: `Stop ${i + 1} · Main St`,
    address: '100 Main St;GA 42, Griffin',
    market: 'Atlanta-Sandy Springs-Roswell, GA',
    city: 'Griffin',
    status: kind === 'site_submit' ? 'New store opportunity' : 'Existing store',
    notes: i === 2 ? 'Meet landlord at the back entrance; bring the site plan.' : null,
    projectedOpening: i === 0 ? 'Q3/Q4 FY28' : null,
    minutes: 15,
    arriveMin: 560 + i * 30,
    departMin: 575 + i * 30,
    driveNextMin: 15,
    arriveNextMin: 590 + i * 30,
    nextIsEnd: false,
    coord: i === 5 ? null : pts[i % 3],
    approach: i === 1 ? [{ lat: 33.3, lng: -84.2 }] : [],
    iconUrl: kind === 'atlas_store' ? '/Images/SBUX-ATLAS-DT.png' : null,
    glyph: kind === 'custom' ? 'L' : null,
  });
  const day = (n: number, rows: PdfStopRow[]): PdfDay => ({
    dayNumber: n,
    date: n === 1 ? '2026-11-04' : null,
    color: '#002147',
    startAddress: 'McDonough, GA',
    startCoord: { lat: 33.4473, lng: -84.1469 },
    startTimeMin: 540,
    driveFromStartMin: 14,
    endAddress: 'Hotel, Augusta GA',
    endCoord: { lat: 33.47, lng: -82.01 },
    endTimeMin: 1020,
    stops: rows,
    paths: [pts],
    totals: { driveMin: 80, stopMin: rows.length * 15, finishMin: 900, overEnd: true },
    note: 'Typical drive times (no traffic forecast).',
  });
  const urls: string[] = [];
  const doc = await buildTourPdf(
    {
      name: 'Jared Tour',
      client: 'Starbucks',
      days: [day(1, Array.from({ length: 24 }, (_, i) => row(i))), day(2, [row(0, 'atlas_store'), row(1, 'custom'), row(2)])],
      generatedLabel: 'Nov 2, 2026 ET',
      contextStores: [{ kind: 'atlas_store', store_number: '1', lat: 33.3, lng: -84.1, iconUrl: '/Images/SBUX-ATLAS-CAFE.png' }],
      atlasMode: 'near',
    },
    { apiKey: 'K', loadImage: async (u) => (urls.push(u), null) }
  );
  const maps = urls.filter((u) => u.includes('/staticmap'));
  assert.equal(maps.length, 3, 'one basemap per map: overview + 2 days');
  assert.ok(!maps[0].includes('saturation'), 'color basemap, not grayscale');
  assert.ok(urls.includes('/Images/SBUX-ATLAS-DT.png') && urls.includes('/Images/SBUX-ATLAS-CAFE.png'), 'Atlas icons requested');
  assert.ok(!urls.some((u) => u.includes('LICENSE')), 'no licensed logos');
  const w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
  assert.ok(w > h, 'landscape');
  // 24 rows on day 1 push its map to its own page: cover + day1 agenda + day1 map + day2.
  assert.ok(doc.getNumberOfPages() >= 4, `pages ${doc.getNumberOfPages()}`);
});

test('Oklahoma embeds for headings when provided (body stays Helvetica)', async () => {
  const { readFileSync } = await import('node:fs');
  const b64 = (f: string) => readFileSync(new URL(`../../src/assets/fonts/${f}`, `file://${process.cwd()}/tests/tours/`)).toString('base64');
  const doc = await buildTourPdf(
    { name: 'Font Tour', client: 'Starbucks', days: [], generatedLabel: 'x', contextStores: [], atlasMode: 'off' },
    { apiKey: 'K', loadImage: async () => null, headingFont: { regular: b64('Oklahoma-Regular.ttf'), bold: b64('Oklahoma-Bold.ttf') } }
  );
  const raw = new TextDecoder('latin1').decode(doc.output('arraybuffer'));
  assert.match(raw, /\/BaseFont \/Oklahoma/);
  assert.match(raw, /\/BaseFont \/Helvetica/);
});

test('distanceToPathsMeters: perpendicular distance to a segment, not just its vertices', () => {
  // E-W segment along lat 33 from -84.2 to -84.0; a point 0.03 deg north of its middle.
  const d = distanceToPathsMeters({ lat: 33.03, lng: -84.1 }, [[{ lat: 33, lng: -84.2 }, { lat: 33, lng: -84.0 }]]);
  assert.ok(Math.abs(d - 3336) < 20, `${d}`); // 0.03 deg lat ≈ 3,336 m (< 3 mi)
  const far = distanceToPathsMeters({ lat: 33.05, lng: -84.1 }, [[{ lat: 33, lng: -84.2 }, { lat: 33, lng: -84.0 }]]);
  assert.ok(far > 4828, `${far}`); // ≈ 5.56 km (> 3 mi)
});
