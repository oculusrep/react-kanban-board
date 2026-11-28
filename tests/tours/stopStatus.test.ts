// Tour stop Status: stage mapping, kind defaults, override wins, clearing returns to auto.
import test from 'node:test';
import assert from 'node:assert/strict';
import { stopInfo } from '../../src/lib/tourRouting';
import { STAGE_STATUS, autoStopStatus, effectiveStopStatus } from '../../src/lib/tourStopStatus';

// submit_stage.name values in prod as of 2026-11-02.
const LIVE_STAGES = [
  'At Lease/PSA', 'Booked', 'Closed - Under Construction', 'Executed Deal', 'LOI', 'Lost / Killed',
  'Mike to Review', 'Monitor', 'Not Available', 'Pass', 'Pre-Submittal', 'Protected', 'Pursuing Ownership',
  'Ready to Submit', 'Store Open', 'Submitted-Reviewing', 'Tour', 'Unassigned Territory',
  'Under Contract / Contingent', 'Use Conflict', 'Use Declined',
];

test('every live stage has a mapping', () => {
  for (const s of LIVE_STAGES) assert.ok(STAGE_STATUS[s], `unmapped stage: ${s}`);
});

test('stage → client-friendly status', () => {
  assert.equal(autoStopStatus('site_submit', 'Pre-Submittal'), 'New store opportunity');
  assert.equal(autoStopStatus('site_submit', 'Submitted-Reviewing'), 'Under review');
  assert.equal(autoStopStatus('site_submit', 'LOI'), 'At LOI');
  assert.equal(autoStopStatus('site_submit', 'At Lease/PSA'), 'At lease/PSA');
  assert.equal(autoStopStatus('site_submit', 'Store Open'), 'Existing store');
});

test('no stage or an unknown stage falls back to New store opportunity', () => {
  assert.equal(autoStopStatus('site_submit', null), 'New store opportunity');
  assert.equal(autoStopStatus('site_submit', 'Some New Stage'), 'New store opportunity');
});

test('store / custom stops ignore stage and keep their defaults', () => {
  assert.equal(autoStopStatus('atlas_store', 'LOI'), 'Existing store');
  assert.equal(autoStopStatus('licensed_store', null), 'Licensed store');
  assert.equal(autoStopStatus('custom', null), '');
});

test('override always wins; blank override means automatic', () => {
  assert.equal(effectiveStopStatus('site_submit', 'LOI', 'Committee approved'), 'Committee approved');
  assert.equal(effectiveStopStatus('custom', null, 'Fly-by'), 'Fly-by');
  assert.equal(effectiveStopStatus('site_submit', 'LOI', '   '), 'At LOI');
  assert.equal(effectiveStopStatus('site_submit', 'LOI', null), 'At LOI');
});

test('stopInfo reports effective, automatic and override status', () => {
  const base = { stop_kind: 'site_submit' as const, site_submit: { site_submit_name: 'X', submit_stage: { name: 'LOI' } } };
  const auto = stopInfo(base);
  assert.deepEqual([auto.status, auto.autoStatus, auto.statusOverride], ['At LOI', 'At LOI', null]);
  const over = stopInfo({ ...base, status_override: ' Fly-by ' });
  assert.deepEqual([over.status, over.autoStatus, over.statusOverride], ['Fly-by', 'At LOI', 'Fly-by']);
  const atlas = stopInfo({ stop_kind: 'atlas_store', store_number: '1', status_override: 'Committee approved' });
  assert.deepEqual([atlas.status, atlas.autoStatus], ['Committee approved', 'Existing store']);
});
