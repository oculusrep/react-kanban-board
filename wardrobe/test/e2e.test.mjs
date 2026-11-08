// End-to-end checks against a running Worker (default: `npm run dev` on :8787).
//   WARDROBE_URL=http://localhost:8787 WARDROBE_TOKEN=... npm test
// Creates and then deletes its own test items.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.WARDROBE_URL ?? 'http://localhost:8787';
const TOKEN = process.env.WARDROBE_TOKEN ?? 'local-dev-token-0123456789abcdef';
const MCP = `${BASE}/mcp/${TOKEN}`;
let rpcId = 0;

async function rpc(method, params, url = MCP) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++rpcId, method, params }),
  });
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}
async function call(name, args) {
  const { body } = await rpc('tools/call', { name, arguments: args });
  assert.ok(body.result, JSON.stringify(body));
  return body.result;
}

test('MCP rejects wrong or missing token with 404', async () => {
  assert.equal((await rpc('tools/list', {}, `${BASE}/mcp/not-the-token`)).status, 404);
  assert.equal((await rpc('tools/list', {}, `${BASE}/mcp`)).status, 404);
});

test('MCP initialize handshake + notification', async () => {
  const { body } = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } });
  assert.equal(body.result.protocolVersion, '2025-06-18');
  assert.ok(body.result.capabilities.tools);
  const n = await fetch(MCP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) });
  assert.equal(n.status, 202);
  const g = await fetch(MCP);
  assert.equal(g.status, 405);
});

test('MCP Bearer header also works on /mcp', async () => {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
  });
  assert.equal(res.status, 200);
});

test('tools/list exposes all tools', async () => {
  const { body } = await rpc('tools/list', {});
  const names = body.result.tools.map((t) => t.name).sort();
  assert.deepEqual(names, ['add_item', 'delete_item', 'list_items', 'log_wear', 'search_items', 'suggest_outfit_candidates', 'update_item']);
});

test('add → search → update → log_wear → suggest → delete', async () => {
  const shirt = (await call('add_item', { name: 'ZZTest navy oxford', category: 'shirt', color: 'navy', formality: 'business', season: ['spring', 'fall'], price: '$59.50' })).structuredContent;
  const pants = (await call('add_item', { name: 'ZZTest grey chinos', category: 'pants', color: 'grey', formality: 'business', season: 'all' })).structuredContent;
  const coat = (await call('add_item', { name: 'ZZTest rain shell', category: 'outerwear', formality: 'business', season: 'fall,winter,spring' })).structuredContent;
  try {
    assert.equal(shirt.category, 'top');
    assert.deepEqual(shirt.season, ['spring', 'fall']);
    assert.equal(shirt.price, 59.5);
    assert.equal(pants.category, 'bottom');

    const bad = await call('add_item', { name: 'x', formality: 'pyjama-party' });
    assert.equal(bad.isError, true);

    const found = (await call('search_items', { query: 'zztest navy' })).structuredContent;
    assert.equal(found.total, 1);
    assert.equal(found.items[0].id, shirt.id);
    const bySeason = (await call('search_items', { query: 'zztest', season: 'summer' })).structuredContent;
    assert.deepEqual(bySeason.items.map((i) => i.id), [pants.id]);

    const upd = (await call('update_item', { id: shirt.id, brand: 'Brooks', notes: null })).structuredContent;
    assert.equal(upd.brand, 'Brooks');
    assert.equal((await call('update_item', { id: 'nope', brand: 'x' })).isError, true);

    const worn = (await call('log_wear', { item_ids: [shirt.id, 'missing-id'], date: '2026-01-15' })).structuredContent;
    assert.equal(worn.items[0].times_worn, 1);
    assert.equal(worn.items[0].last_worn, '2026-01-15');
    assert.deepEqual(worn.missing, ['missing-id']);
    await call('log_wear', { item_ids: [shirt.id], date: '2025-12-01' }); // older date must not move last_worn back
    const one = (await call('list_items', { id: shirt.id })).structuredContent.items[0];
    assert.equal(one.times_worn, 2);
    assert.equal(one.last_worn, '2026-01-15');

    const sug = (await call('suggest_outfit_candidates', { formality: 'business', weather: 'rainy', temperature_f: 52 })).structuredContent;
    assert.deepEqual(sug.criteria.seasons, ['spring', 'fall']);
    assert.equal(sug.criteria.needs_outerwear, true);
    const ids = (g) => sug.candidates[g].map((i) => i.id);
    assert.ok(ids('top').includes(shirt.id));
    assert.ok(ids('bottom').includes(pants.id));
    assert.ok(ids('outerwear').includes(coat.id));

    const hot = (await call('suggest_outfit_candidates', { formality: 'business', temperature_f: 90 })).structuredContent;
    assert.equal(hot.candidates.outerwear, undefined);
    assert.ok(!hot.candidates.top.some((i) => i.id === shirt.id)); // spring/fall only
  } finally {
    for (const i of [shirt, pants, coat]) {
      const del = await call('delete_item', { id: i.id });
      assert.equal(del.structuredContent.deleted, true);
    }
  }
});

test('web API: login cookie, upload photo, create, wear, delete', async () => {
  assert.equal((await fetch(`${BASE}/api/items`)).status, 401);
  assert.equal((await fetch(`${BASE}/api/login`, { method: 'POST', body: JSON.stringify({ token: 'wrong' }) })).status, 401);
  const login = await fetch(`${BASE}/api/login`, { method: 'POST', body: JSON.stringify({ token: TOKEN }) });
  assert.equal(login.status, 200);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.ok(!cookie.includes(TOKEN), 'cookie must not contain the raw token');
  const h = { Cookie: cookie };

  // 1x1 JPEG
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAP/9k=', 'base64');
  const up = await (await fetch(`${BASE}/api/photos`, { method: 'POST', headers: { ...h, 'Content-Type': 'image/jpeg' }, body: jpeg })).json();
  assert.match(up.photo_key, /^photos\/.+\.jpg$/);
  assert.equal((await fetch(`${BASE}/${up.photo_key}`)).status, 401, 'photo requires auth');
  const img = await fetch(`${BASE}/${up.photo_key}`, { headers: h });
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');

  assert.equal((await fetch(`${BASE}/api/photos`, { method: 'POST', headers: { ...h, 'Content-Type': 'text/html' }, body: 'x' })).status, 415);

  const created = await (await fetch(`${BASE}/api/items`, {
    method: 'POST', headers: { ...h, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'ZZTest web tee', category: 'top', season: 'all', photo_key: up.photo_key }),
  })).json();
  assert.equal(created.photo_url, `${BASE}/${up.photo_key}`);
  assert.equal((await fetch(`${BASE}/api/photos/${up.photo_key}`, { method: 'DELETE', headers: h })).status, 409, 'in-use photo is protected');

  const worn = await (await fetch(`${BASE}/api/items/${created.id}/wear`, { method: 'POST', headers: h, body: '{}' })).json();
  assert.equal(worn.times_worn, 1);

  const list = await (await fetch(`${BASE}/api/items?query=zztest%20web`, { headers: h })).json();
  assert.equal(list.total, 1);

  const cross = await fetch(`${BASE}/api/items/${created.id}`, { method: 'DELETE', headers: { ...h, Origin: 'https://evil.example' } });
  assert.equal(cross.status, 403);
  assert.equal((await fetch(`${BASE}/api/items/${created.id}`, { method: 'DELETE', headers: h })).status, 200);
  assert.equal((await fetch(`${BASE}/${up.photo_key}`, { headers: h })).status, 404, 'photo removed with item');
});
