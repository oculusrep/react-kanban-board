// Live tour day: Eastern Time helpers + re-projection from the latest departure stamp.
import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLiveSchedule, etClockMinutes, etHHMM, etWallTimeToDate, liveAnchorIndex, todayET } from '../../src/lib/tourRouting';

test('todayET uses Eastern, not UTC or the device zone', () => {
  // 11:30 PM EDT on Oct 28 is already Oct 29 in UTC.
  assert.equal(todayET(new Date('2026-10-29T03:30:00Z')), '2026-10-28');
  assert.equal(todayET(new Date('2026-10-29T04:30:00Z')), '2026-10-29');
  // EST (after Nov 1): midnight ET = 05:00Z
  assert.equal(todayET(new Date('2026-11-05T04:59:00Z')), '2026-11-04');
});

test('Eastern wall time ↔ UTC instant, both sides of the DST change', () => {
  assert.equal(etWallTimeToDate('2026-10-28', '09:15').toISOString(), '2026-10-28T13:15:00.000Z'); // EDT
  assert.equal(etWallTimeToDate('2026-11-04', '09:15').toISOString(), '2026-11-04T14:15:00.000Z'); // EST
  const d = new Date('2026-11-04T19:42:00Z'); // 2:42 PM EST
  assert.equal(etHHMM(d), '14:42');
  assert.equal(etClockMinutes(d), 14 * 60 + 42);
});

test('anchor = last stamped stop in route order', () => {
  assert.equal(liveAnchorIndex([null, null, null]), -1);
  assert.equal(liveAnchorIndex(['a', null, 'b', null]), 2);
});

test('re-projects the rest of the day from the anchor departure', () => {
  // Left the anchor at 10:00; 10 min to next (15 min there), 15 min to the last (10 min there).
  const s = computeLiveSchedule({ anchorDepartMin: 600, legSecondsFromAnchor: [600, 900], suffixDurations: [15, 10], hasEnd: false });
  assert.deepEqual(s.stops.map((x) => x.arrivalMin), [610, 640]);
  assert.equal(s.finishMin, 650);
  // With an end address: + 5 min tail.
  const e = computeLiveSchedule({ anchorDepartMin: 600, legSecondsFromAnchor: [600, 900, 300], suffixDurations: [15, 10], hasEnd: true });
  assert.equal(e.finishMin, 655);
  // Anchor is the last stop: finish = departure (+ drive to end if any).
  assert.equal(computeLiveSchedule({ anchorDepartMin: 600, legSecondsFromAnchor: [], suffixDurations: [], hasEnd: false }).finishMin, 600);
  assert.equal(computeLiveSchedule({ anchorDepartMin: 600, legSecondsFromAnchor: [300], suffixDurations: [], hasEnd: true }).finishMin, 605);
});
