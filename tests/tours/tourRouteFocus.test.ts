// Regression test for the tour-map crash (2026-10-28): with a stop focused, dragging its
// inbound leg sent applyFocus → setDirections → directions_changed → "drag" → applyFocus …
// into a stack overflow; clearing focus then crashed inside a React effect (blank page).
// The fake renderer reproduces the two Google behaviours that caused it:
//   - directions_changed fires synchronously inside setDirections()
//   - getDirections() returns a copy, never the object passed in
import test from 'node:test';
import assert from 'node:assert/strict';
import { RouteFocusController, findChangedLeg, type ResultLike, type DragEvent } from '../../src/lib/tourRouteFocus';
import { buildDayRoutePoints } from '../../src/lib/tourRouting';

const LL = (lat: number, lng: number) => ({ lat: () => lat, lng: () => lng });
const leg = (path: [number, number][], vias: [number, number][] = []) => ({
  via_waypoints: vias.map(([a, b]) => LL(a, b)),
  steps: [{ path: path.map(([a, b]) => LL(a, b)) }],
});
const clone = (r: ResultLike): ResultLike => ({ routes: r.routes.map((rt) => ({ legs: rt.legs.map((l) => ({ ...l })) })) });

class FakeRenderer {
  private current: ResultLike | null = null;
  private listeners: (() => void)[] = [];
  setCalls = 0;
  options: any = null;
  addListener(fn: () => void) {
    this.listeners.push(fn);
  }
  getDirections() {
    return this.current ? clone(this.current) : null; // a copy, like Google
  }
  setDirections(r: ResultLike) {
    this.setCalls++;
    if (this.setCalls > 1000) throw new RangeError('Maximum call stack size exceeded (fake)');
    this.current = clone(r);
    this.listeners.forEach((fn) => fn()); // synchronous, like Google
  }
  setOptions(o: any) {
    this.options = o;
  }
  /** What Google does when the user drops a dragged route. */
  userDrop(r: ResultLike) {
    this.current = clone(r);
    this.listeners.forEach((fn) => fn());
  }
}

// Day: start (hotel) → #1 Locust Grove → #2 Griffin. Leg 0 = inbound to #1, leg 1 = outbound.
const points = buildDayRoutePoints(
  { lat: 33.44, lng: -84.14 },
  [
    { id: 's1', lat: 33.34, lng: -84.1, approach: [] },
    { id: 's2', lat: 33.26, lng: -84.26, approach: [] },
  ],
  null
);
const baseline: ResultLike = { routes: [{ legs: [leg([[33.44, -84.14], [33.34, -84.1]]), leg([[33.34, -84.1], [33.26, -84.26]])] }] };
const dragged: ResultLike = {
  routes: [{ legs: [leg([[33.44, -84.14], [33.39, -84.2], [33.34, -84.1]], [[33.39, -84.2]]), baseline.routes[0].legs[1]] }],
};

function setup() {
  const drags: DragEvent[] = [];
  const lines: { color: string; path: any[]; onMap: boolean }[] = [];
  let ctl!: RouteFocusController;
  ctl = new RouteFocusController({
    makeLine: ({ path, color }) => {
      const line = { color, path, onMap: true };
      lines.push(line);
      return { setMap: (m: unknown) => (line.onMap = m != null) };
    },
    rendererStyle: (color, opacity) => ({ color, opacity }),
    onDrag: (e) => {
      drags.push(e);
      ctl.setFocus('s1'); // what the page does: focus the dragged stop
    },
    defer: (fn) => fn(), // run immediately — the worst case for re-entrancy
  });
  const renderer = new FakeRenderer();
  const entry = ctl.add(renderer, points, '#002147', baseline);
  renderer.addListener(() => ctl.handleDirectionsChanged(entry));
  return { ctl, renderer, drags, visible: () => lines.filter((l) => l.onMap) };
}

test('findChangedLeg spots the dragged leg and its new via points', () => {
  const c = findChangedLeg(points, dragged)!;
  assert.equal(c.legIndex, 0);
  assert.equal(c.target.id, 's1');
  assert.deepEqual(c.vias, [{ lat: 33.39, lng: -84.2 }]);
  assert.equal(findChangedLeg(points, baseline), null);
});

test('directions_changed on a focused leg: one drag, no recursion, in/out legs stay drawn', () => {
  const { ctl, renderer, drags, visible } = setup();
  ctl.setFocus('s1');
  assert.equal(drags.length, 0, 'focusing must not look like a drag');
  assert.equal(visible().length, 2, 'inbound + outbound drawn');
  assert.equal(renderer.options.polylineOptions.opacity, 0.25, 'other routes faded');

  assert.doesNotThrow(() => renderer.userDrop(dragged)); // the crash: RangeError here
  assert.equal(drags.length, 1, 'exactly one drag event');
  assert.equal(drags[0].target.id, 's1');
  assert.ok(renderer.setCalls < 10, `bounded setDirections calls (${renderer.setCalls})`);

  const lines = visible();
  assert.deepEqual(lines.map((l) => l.color).sort(), ['#2E7D32', '#E07B00']);
  const inbound = lines.find((l) => l.color === '#2E7D32')!;
  assert.ok(inbound.path.some((p) => p.lat() === 33.39), 'inbound leg follows the dragged path');
});

test('clearing focus after a drag does not bounce focus back or re-fire the drag', () => {
  const { ctl, renderer, drags, visible } = setup();
  ctl.setFocus('s1');
  renderer.userDrop(dragged);
  assert.doesNotThrow(() => ctl.setFocus(null)); // the blank page: Esc
  assert.equal(drags.length, 1);
  assert.equal(ctl.focusedStopId, null);
  assert.equal(visible().length, 0);
  assert.equal(renderer.options.polylineOptions.opacity, 0.85);
  // The unsaved drag is still what's on screen.
  assert.equal(renderer.getDirections()!.routes[0].legs[0].via_waypoints!.length, 1);
});
