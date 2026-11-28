// PDF pin declutter: merge near-identical pins, fan out overlaps, keep inside the frame,
// logos yield to markers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { declutterLogos, declutterPins, type DeclutterItem } from '../../src/lib/pinDeclutter';

const frame = { x0: 0, y0: 0, x1: 500, y1: 300 };
const pinAt = (id: string, x: number, y: number, label = id, mergeKey: string | null = 'site:#002147'): DeclutterItem => ({
  id, anchor: { x, y }, r: 8, label, mergeKey,
});
const noOverlap = (ms: { at: { x: number; y: number }; r: number }[]) => {
  for (let i = 0; i < ms.length; i++)
    for (let j = i + 1; j < ms.length; j++)
      assert.ok(Math.hypot(ms[i].at.x - ms[j].at.x, ms[i].at.y - ms[j].at.y) >= ms[i].r + ms[j].r - 1e-6, `markers ${i},${j} overlap`);
};

test('same spot (≤ 2 mm), same day → one merged pin "3·4", numeric order', () => {
  const out = declutterPins([pinAt('4', 100, 100), pinAt('3', 102, 101)], { frame });
  assert.equal(out.length, 1);
  assert.equal(out[0].label, '3·4');
  assert.ok(out[0].merged && !out[0].displaced);
});

test('same spot but different day (merge key) → not merged, fanned instead', () => {
  const out = declutterPins([pinAt('3', 100, 100), pinAt('13', 102, 101, '13', 'site:#4A6B94')], { frame });
  assert.equal(out.length, 2);
  assert.ok(out.every((m) => m.displaced));
  noOverlap(out);
});

test('near but not identical → fanned on a ring around the cluster, nothing overlaps', () => {
  const items = [pinAt('1', 200, 150), pinAt('2', 210, 152), pinAt('3', 205, 160), pinAt('A', 215, 145, 'A', null)];
  const out = declutterPins(items, { frame });
  assert.equal(out.length, 4);
  assert.ok(out.every((m) => m.displaced));
  noOverlap(out);
});

test('far-apart pins are untouched', () => {
  const out = declutterPins([pinAt('1', 50, 50), pinAt('2', 300, 200)], { frame });
  assert.ok(out.every((m) => !m.displaced && m.at.x === m.anchor.x && m.at.y === m.anchor.y));
});

test('a cluster in the corner stays inside the frame', () => {
  const out = declutterPins([pinAt('1', 3, 3), pinAt('2', 8, 5), pinAt('3', 5, 10)], { frame });
  out.forEach((m) => {
    assert.ok(m.at.x - m.r >= 0 && m.at.y - m.r >= 0, JSON.stringify(m.at));
  });
  noOverlap(out);
});

test('fan avoids the route when it can', () => {
  // Route runs horizontally right through the cluster center.
  const route = Array.from({ length: 200 }, (_, i) => ({ x: i * 2.5, y: 150 }));
  const out = declutterPins([pinAt('1', 250, 150), pinAt('2', 258, 150)], { frame, obstacles: route });
  out.forEach((m) => assert.ok(Math.abs(m.at.y - 150) > m.r, `badge on the route at y=${m.at.y}`));
});

test('logos: kept when clear, nudged off a pin, hidden when boxed in', () => {
  const pins = declutterPins([pinAt('1', 100, 100)], { frame });
  const out = declutterLogos(
    [
      { id: 'clear', at: { x: 300, y: 200 }, s: 7 },
      { id: 'onPin', at: { x: 103, y: 100 }, s: 7 },
    ],
    pins,
    frame
  );
  assert.deepEqual(out[0].draw, { x: 300, y: 200 });
  assert.ok(out[1].nudged && out[1].draw);
  const boxed = declutterLogos([{ id: 'x', at: { x: 100, y: 100 }, s: 30 }], pins, { x0: 80, y0: 80, x1: 120, y1: 120 });
  assert.equal(boxed[0].draw, null);
});
