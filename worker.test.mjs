import assert from 'node:assert/strict';
import test from 'node:test';
import worker from './worker/index.js';

const KEY = 'test-private-key';

function database() {
  let state = null;
  return {
    prepare(sql) {
      let args = [];
      return {
        bind(...values) { args = values; return this; },
        async first() {
          assert.match(sql, /^SELECT/);
          return state && { ...state };
        },
        async run() {
          if (sql.startsWith('INSERT')) {
            if (state) return { meta: { changes: 0 } };
            state = { revision: 1, payload: args[0] };
          } else {
            assert.match(sql, /^UPDATE/);
            if (!state || state.revision !== args[2]) return { meta: { changes: 0 } };
            state = { revision: state.revision + 1, payload: args[0] };
          }
          return { meta: { changes: 1 } };
        }
      };
    }
  };
}

const backup = (id, dec) => ({
  app: 'tonificacion-consumos', exportedAt: new Date().toISOString(),
  decorators: {
    'Decorador 1': { order: '', tech: '', substrate: '', graphic: '', history: dec === 1 ? [{ id, updatedAt: new Date().toISOString() }] : [], archive: [] },
    'Decorador 2': { order: '', tech: '', substrate: '', graphic: '', history: dec === 2 ? [{ id, updatedAt: new Date().toISOString() }] : [], archive: [] }
  }, deletedRecords: {}, deletedArchives: {}
});

test('Shared API denies requests without the private link', async () => {
  const env = { DB: database(), SHARE_KEY: KEY };
  const response = await worker.fetch(new Request('https://example.test/api/sync/v3'), env);
  assert.equal(response.status, 403);
  const wrong = await worker.fetch(new Request('https://example.test/api/sync/v3', { headers: { 'x-undora-key': 'wrong' } }), env);
  assert.equal(wrong.status, 403);
  const write = await worker.fetch(new Request('https://example.test/api/sync/v3', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(backup('blocked', 1))
  }), env);
  assert.equal(write.status, 403);
  const cloud = await worker.fetch(new Request('https://example.test/api/sync/v3', { headers: { 'x-undora-key': KEY } }), env);
  assert.deepEqual(await cloud.json(), { syncProtocol: 3 });
});

test('Static app is public but the API still needs the private link', async () => {
  const env = { DB: database(), SHARE_KEY: KEY, ASSETS: { fetch: () => new Response('app') } };
  const page = await worker.fetch(new Request('https://example.test/'), env);
  assert.equal(await page.text(), 'app');
  const accepted = await worker.fetch(new Request('https://example.test/api/access', { headers: { 'x-undora-key': KEY } }), env);
  assert.deepEqual(await accepted.json(), { ok: true });
  const rejected = await worker.fetch(new Request('https://example.test/api/access'), env);
  assert.equal(rejected.status, 403);
});

test('Cloudflare sync preserves both decorators and deletions', async () => {
  const env = { DB: database(), SHARE_KEY: KEY };
  const request = (method, body) => new Request('https://example.test/api/sync/v3', {
    method, headers: { 'x-undora-key': KEY, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  assert.deepEqual(await (await worker.fetch(request('GET'), env)).json(), { syncProtocol: 3 });
  assert.equal((await worker.fetch(request('POST', backup('a', 1)), env)).status, 200);
  assert.equal((await worker.fetch(request('POST', backup('b', 2)), env)).status, 200);
  let cloud = await (await worker.fetch(request('GET'), env)).json();
  assert.equal(cloud.decorators['Decorador 1'].history[0].id, 'a');
  assert.equal(cloud.decorators['Decorador 2'].history[0].id, 'b');

  const deleted = backup('b', 2);
  deleted.deletedRecords.a = new Date(Date.now() + 1000).toISOString();
  assert.equal((await worker.fetch(request('POST', deleted), env)).status, 200);
  cloud = await (await worker.fetch(request('GET'), env)).json();
  assert.equal(cloud.decorators['Decorador 1'].history.length, 0);
  assert.equal(cloud.decorators['Decorador 2'].history.length, 1);
  assert.equal(cloud.deletedRecords.a, deleted.deletedRecords.a);
});

test('Cloudflare sync rejects malformed data', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/sync/v3', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-undora-key': KEY }, body: '{"app":"tonificacion-consumos","decorators":{"bad":{}}}'
  }), { DB: database(), SHARE_KEY: KEY });
  assert.equal(response.status, 400);
});

test('Cloudflare sync keeps the newest order header', async () => {
  const env = { DB: database(), SHARE_KEY: KEY };
  const post = body => worker.fetch(new Request('https://example.test/api/sync/v3', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-undora-key': KEY }, body: JSON.stringify(body)
  }), env);
  const first = backup('a', 1);
  first.exportedAt = '2026-11-05T08:00:00.000Z';
  first.decorators['Decorador 1'].order = 'Viejo';
  first.decorators['Decorador 1'].material = 'criscal';
  const second = backup('a', 1);
  second.exportedAt = '2026-11-05T09:00:00.000Z';
  second.decorators['Decorador 1'].order = 'Nuevo';
  second.decorators['Decorador 1'].material = 'pigmentado';
  await post(first);
  await post(second);
  const cloud = await (await worker.fetch(new Request('https://example.test/api/sync/v3', { headers: { 'x-undora-key': KEY } }), env)).json();
  assert.equal(cloud.decorators['Decorador 1'].order, 'Nuevo');
  assert.equal(cloud.decorators['Decorador 1'].material, 'pigmentado');
  assert.equal(cloud.exportedAt, second.exportedAt);
});

test('Old backups without material remain valid', async () => {
  const env = { DB: database(), SHARE_KEY: KEY };
  const post = body => worker.fetch(new Request('https://example.test/api/sync/v3', {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-undora-key': KEY }, body: JSON.stringify(body)
  }), env);
  assert.equal((await post(backup('old', 1))).status, 200);
  const cloud = await (await worker.fetch(new Request('https://example.test/api/sync/v3', { headers: { 'x-undora-key': KEY } }), env)).json();
  assert.equal(cloud.decorators['Decorador 1'].material, undefined);
});

test('Old sync route asks the browser to update without changing data', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/sync', { headers: { 'x-undora-key': KEY } }), { DB: database(), SHARE_KEY: KEY });
  assert.equal(response.status, 410);
});

import { mergeBackups as mergePlanning } from './worker/merge.js';
import assertPlan from 'node:assert/strict';
import testPlan from 'node:test';
testPlan('planning keeps the newest version', () => {
  const base = { decorators: {} };
  const a = { ...base, planning: { updatedAt: '2026-11-18T08:00:00Z', rows: [{ id: 'a' }] } };
  const b = { ...base, planning: { updatedAt: '2026-11-18T09:00:00Z', rows: [{ id: 'b' }] } };
  assertPlan.equal(mergePlanning(a, b).planning.rows[0].id, 'b');
  assertPlan.equal(mergePlanning(b, a).planning.rows[0].id, 'b');
  assertPlan.equal(mergePlanning(base, a).planning.rows[0].id, 'a');
});

testPlan('keracost keeps the newest version', () => {
  const a = { decorators: {}, keracost: { updatedAt: '2026-11-20T08:00:00Z', items: [{ id: 'a' }] } };
  const b = { decorators: {}, keracost: { updatedAt: '2026-11-20T09:00:00Z', items: [{ id: 'b' }] } };
  assertPlan.equal(mergePlanning(a, b).keracost.items[0].id, 'b');
  assertPlan.equal(mergePlanning(b, { decorators: {} }).keracost.items[0].id, 'b');
});

import { mergeCollection } from './worker/merge.js';
testPlan('planning merges row by row without losing edits', () => {
  const base = { updatedAt: '1', rows: [{ id: 'a', qty: { d: 1 }, updatedAt: '1' }, { id: 'b', qty: {}, updatedAt: '1' }] };
  const alice = { updatedAt: '3', rows: [{ id: 'a', qty: { d: 5 }, updatedAt: '3' }, { id: 'b', qty: {}, updatedAt: '1' }] };
  const bob = { updatedAt: '4', rows: [{ id: 'a', qty: { d: 1 }, updatedAt: '1' }, { id: 'b', qty: { d: 9 }, updatedAt: '4' }, { id: 'c', updatedAt: '4' }] };
  const m = mergeCollection(alice, bob, 'rows');
  assertPlan.equal(m.rows.find(r => r.id === 'a').qty.d, 5);
  assertPlan.equal(m.rows.find(r => r.id === 'b').qty.d, 9);
  assertPlan.ok(m.rows.find(r => r.id === 'c'));
  const del = mergeCollection({ updatedAt: '5', rows: [{ id: 'b', updatedAt: '1' }], deleted: { a: '5' } }, base, 'rows');
  assertPlan.equal(del.rows.find(r => r.id === 'a'), undefined);
  assertPlan.equal(mergeCollection(undefined, base, 'rows'), base);
});
