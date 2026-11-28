// "Open in Google Maps" links: lat,lng encoding, ≤9 waypoints, leg split on long days.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dayPointSequence, googleMapsDayLegs, googleMapsDirectionsUrl } from '../../src/lib/tourGoogleMapsLinks';

const stop = (i: number) => ({ lat: 34 + i / 100, lng: -84 - i / 100 });
const parse = (url: string) => {
  const u = new URL(url);
  const wp = u.searchParams.get('waypoints');
  return {
    host: `${u.origin}${u.pathname}`,
    api: u.searchParams.get('api'),
    origin: u.searchParams.get('origin'),
    destination: u.searchParams.get('destination'),
    waypoints: wp ? wp.split('|') : [],
    mode: u.searchParams.get('travelmode'),
  };
};
const ll = (p: { lat: number; lng: number }) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

test('single link: coordinates, URL-encoded, driving', () => {
  const url = googleMapsDirectionsUrl([stop(1), stop(2), stop(3)]);
  assert.match(url, /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
  assert.ok(url.includes('%2C') && url.includes('%7C') === false); // one waypoint → no pipe
  const p = parse(url);
  assert.equal(p.origin, ll(stop(1)));
  assert.equal(p.destination, ll(stop(3)));
  assert.deepEqual(p.waypoints, [ll(stop(2))]);
  assert.equal(p.mode, 'driving');
  assert.ok(!url.includes(',') && !url.includes('|'), 'raw separators must be encoded');
});

test('two points: no waypoints param', () => {
  assert.ok(!googleMapsDirectionsUrl([stop(1), stop(2)]).includes('waypoints'));
});

test('origin = start location when set, else stop 1; end location is the final destination', () => {
  const stops = [stop(1), { lat: null, lng: null }, stop(2)];
  assert.deepEqual(dayPointSequence(null, stops, null), [stop(1), stop(2)]);
  const start = { lat: 33.6, lng: -84.4 };
  const end = { lat: 33.7, lng: -84.3 };
  const [url] = googleMapsDayLegs(dayPointSequence(start, stops, end));
  const p = parse(url);
  assert.equal(p.origin, ll(start));
  assert.equal(p.destination, ll(end));
  assert.deepEqual(p.waypoints, [ll(stop(1)), ll(stop(2))]);
});

test('11 points fit in one link (origin + 9 waypoints + destination)', () => {
  const legs = googleMapsDayLegs(Array.from({ length: 11 }, (_, i) => stop(i)));
  assert.equal(legs.length, 1);
  assert.equal(parse(legs[0]).waypoints.length, 9);
});

test('12-stop day splits into Leg 1 / Leg 2; leg 1 last stop = leg 2 origin; order kept', () => {
  const pts = Array.from({ length: 12 }, (_, i) => stop(i + 1));
  const legs = googleMapsDayLegs(pts).map(parse);
  assert.equal(legs.length, 2);
  for (const l of legs) assert.ok(l.waypoints.length <= 9);
  assert.equal(legs[0].origin, ll(pts[0]));
  assert.equal(legs[0].destination, ll(pts[10]));
  assert.equal(legs[1].origin, legs[0].destination);
  assert.equal(legs[1].destination, ll(pts[11]));
  assert.deepEqual(legs[1].waypoints, []);
  // Every stop appears, in order, exactly once across the legs (boundary counted once).
  const seq = [legs[0].origin, ...legs[0].waypoints, legs[0].destination, ...legs[1].waypoints, legs[1].destination];
  assert.deepEqual(seq, pts.map(ll));
});

test('very long day: more than two legs, all chained and within the limit', () => {
  const pts = Array.from({ length: 25 }, (_, i) => stop(i));
  const legs = googleMapsDayLegs(pts).map(parse);
  assert.equal(legs.length, 3);
  for (let i = 1; i < legs.length; i++) assert.equal(legs[i].origin, legs[i - 1].destination);
  for (const l of legs) assert.ok(l.waypoints.length <= 9);
  assert.equal(legs[2].destination, ll(pts[24]));
});

test('nothing to drive → no links', () => {
  assert.deepEqual(googleMapsDayLegs([]), []);
  assert.deepEqual(googleMapsDayLegs([stop(1)]), []);
});
