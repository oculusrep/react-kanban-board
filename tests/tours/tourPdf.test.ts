// Tour PDF: static map framing/projection + a builder smoke test (no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fitFrame, projector, simplifyPx, staticMapUrl } from '../../src/lib/staticMapProjection';
import { buildTourPdf, formatDayDate, pdfText, type PdfDay } from '../../src/lib/tourPdf';

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

test('buildTourPdf: cover + one page per day, survives a failed basemap', async () => {
  const day = (n: number, count: number): PdfDay => ({
    dayNumber: n,
    date: n === 1 ? '2026-11-04' : null,
    color: '#002147',
    startAddress: 'McDonough, GA',
    startCoord: { lat: 33.4473, lng: -84.1469 },
    startTimeMin: 540,
    driveFromStartMin: 14,
    endAddress: null,
    endCoord: null,
    endTimeMin: 1020,
    stops: Array.from({ length: count }, (_, i) => ({
      number: i + 1,
      name: `Stop ${i + 1} · Main St`,
      address: '100 Main St, Griffin',
      arriveMin: 560 + i * 30,
      minutes: 15,
      category: 'Scheduled Stop',
      driveNextMin: i < count - 1 ? 15 : null,
      nextIsEnd: false,
      notes: i === 2 ? 'Meet landlord at the back entrance; bring the site plan.' : null,
      coord: i === 5 ? null : pts[i % 3],
      approach: i === 1 ? [{ lat: 33.3, lng: -84.2 }] : [],
    })),
    paths: [pts],
    totals: { driveMin: 80, stopMin: count * 15, finishMin: 900, overEnd: false },
    note: 'Typical drive times (no traffic forecast).',
  });
  const urls: string[] = [];
  const doc = await buildTourPdf(
    { name: 'Jared Tour', client: 'Starbucks', days: [day(1, 30), day(2, 3)], generatedLabel: 'Oct 30, 2026 ET' },
    { apiKey: 'K', loadImage: async (u) => (urls.push(u), null) }
  );
  assert.equal(urls.length, 3, 'one basemap per map: overview + 2 days');
  // 30 stops overflow day 1 onto a continuation page.
  assert.ok(doc.getNumberOfPages() >= 4, `pages ${doc.getNumberOfPages()}`);
  assert.ok(doc.output('arraybuffer').byteLength > 5000);
});
