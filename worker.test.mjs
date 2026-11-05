import assert from 'node:assert/strict';
import test from 'node:test';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import worker from './worker/index.js';

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

test('Cloudflare sync denies requests without Access', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/sync/v3'), { DB: database() }, {});
  assert.equal(response.status, 403);
});

test('Cloudflare sync verifies Access JWT behind static assets', async t => {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...await exportJWK(publicKey), kid: 'test-key', alg: 'RS256', use: 'sig' };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ keys: [jwk] }));
  const issuer = 'https://access.example.test';
  const env = { DB: database(), TEAM_DOMAIN: issuer, POLICY_AUD: 'tonificacion-test' };
  const token = await new SignJWT({ email: 'ivan@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setIssuer(issuer).setAudience('tonificacion-test').setIssuedAt().setExpirationTime('5m')
    .sign(privateKey);
  const accepted = await worker.fetch(new Request('https://example.test/api/sync/v3', {
    headers: { 'cf-access-jwt-assertion': token }
  }), env, {});
  assert.equal(accepted.status, 200);
  const rejected = await worker.fetch(new Request('https://example.test/api/sync/v3', {
    headers: { 'cf-access-jwt-assertion': token + 'x' }
  }), env, {});
  assert.equal(rejected.status, 403);
});

test('Cloudflare sync preserves both decorators and deletions', async () => {
  const env = { DB: database() };
  const ctx = { access: { getIdentity: async () => ({ email: 'ivan@example.com' }) } };
  const request = (method, body) => new Request('https://example.test/api/sync/v3', {
    method, ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  });
  assert.deepEqual(await (await worker.fetch(request('GET'), env, ctx)).json(), { syncProtocol: 3 });
  assert.equal((await worker.fetch(request('POST', backup('a', 1)), env, ctx)).status, 200);
  assert.equal((await worker.fetch(request('POST', backup('b', 2)), env, ctx)).status, 200);
  let cloud = await (await worker.fetch(request('GET'), env, ctx)).json();
  assert.equal(cloud.decorators['Decorador 1'].history[0].id, 'a');
  assert.equal(cloud.decorators['Decorador 2'].history[0].id, 'b');

  const deleted = backup('b', 2);
  deleted.deletedRecords.a = new Date(Date.now() + 1000).toISOString();
  assert.equal((await worker.fetch(request('POST', deleted), env, ctx)).status, 200);
  cloud = await (await worker.fetch(request('GET'), env, ctx)).json();
  assert.equal(cloud.decorators['Decorador 1'].history.length, 0);
  assert.equal(cloud.decorators['Decorador 2'].history.length, 1);
  assert.equal(cloud.deletedRecords.a, deleted.deletedRecords.a);
});

test('Cloudflare sync rejects malformed data', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/sync/v3', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"app":"tonificacion-consumos","decorators":{"bad":{}}}'
  }), { DB: database() }, { access: {} });
  assert.equal(response.status, 400);
});

test('Cloudflare sync keeps the newest order header', async () => {
  const env = { DB: database() };
  const ctx = { access: {} };
  const post = body => worker.fetch(new Request('https://example.test/api/sync/v3', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  }), env, ctx);
  const first = backup('a', 1);
  first.exportedAt = '2026-11-05T08:00:00.000Z';
  first.decorators['Decorador 1'].order = 'Viejo';
  const second = backup('a', 1);
  second.exportedAt = '2026-11-05T09:00:00.000Z';
  second.decorators['Decorador 1'].order = 'Nuevo';
  await post(first);
  await post(second);
  const cloud = await (await worker.fetch(new Request('https://example.test/api/sync/v3'), env, ctx)).json();
  assert.equal(cloud.decorators['Decorador 1'].order, 'Nuevo');
  assert.equal(cloud.exportedAt, second.exportedAt);
});

test('Old sync route asks the browser to update without changing data', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/sync'), { DB: database() }, { access: {} });
  assert.equal(response.status, 410);
});
