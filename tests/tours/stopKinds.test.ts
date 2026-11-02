// Stop kinds: names, coordinates, status, and tour-wide site numbering.
import test from 'node:test';
import assert from 'node:assert/strict';
import { siteNumbers, stopInfo } from '../../src/lib/tourRouting';

test('site submit keeps City · Street, its coordinate precedence and "New store opportunity"', () => {
  const i = stopInfo({
    stop_kind: 'site_submit',
    site_submit: {
      site_submit_name: 'Pad Sites - Starbucks',
      verified_latitude: null, verified_longitude: null, sf_property_latitude: 33.1, sf_property_longitude: -84.1,
      property: { address: '4545 US 23;GA 42', city: 'Locust Grove', latitude: 33.0, longitude: -84.0, verified_latitude: null, verified_longitude: null },
    },
  });
  assert.equal(i.name, 'Locust Grove · 4545 US 23');
  assert.deepEqual(i.coord, { lat: 33.1, lng: -84.1 });
  assert.equal(i.status, 'New store opportunity');
  assert.equal(i.city, 'Locust Grove');
});

test('Atlas / licensed / custom defaults, label override, own coordinates', () => {
  const atlas = stopInfo({ stop_kind: 'atlas_store', store_number: '2854', stop_name: 'US Hwy 82 @ I-75', city: 'Tifton', latitude: 31.4, longitude: -83.5 });
  assert.equal(atlas.name, 'Starbucks #2854 · Tifton');
  assert.equal(atlas.address, 'US Hwy 82 @ I-75, Tifton');
  assert.equal(atlas.status, 'Existing store');
  assert.deepEqual(atlas.coord, { lat: 31.4, lng: -83.5 });
  const lic = stopInfo({ stop_kind: 'licensed_store', store_number: '73904', stop_name: 'Kroger Augusta 676', city: 'Augusta', latitude: 33.5, longitude: -82 });
  assert.equal(lic.name, 'Kroger Augusta 676 · Augusta');
  assert.equal(lic.status, 'Licensed store');
  const custom = stopInfo({ stop_kind: 'custom', stop_name: 'Lunch - Tifton', display_label: 'Lunch at Bubba’s', latitude: 31.45, longitude: -83.5 });
  assert.equal(custom.name, 'Lunch at Bubba’s');
  assert.equal(custom.defaultName, 'Lunch - Tifton');
  assert.equal(custom.status, '');
});

test('site numbers: site submits only, continuous across days in route order', () => {
  const n = siteNumbers([
    { id: 'a', stop_kind: 'site_submit' },
    { id: 'lunch', stop_kind: 'custom' },
    { id: 'b', stop_kind: 'site_submit' },
    { id: 'sbux', stop_kind: 'atlas_store' },
    { id: 'c' }, // legacy row without stop_kind = site submit
  ]);
  assert.deepEqual([...n.entries()], [['a', 1], ['b', 2], ['c', 3]]);
});
