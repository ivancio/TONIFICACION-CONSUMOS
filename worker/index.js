import { mergeBackups } from './merge.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const MAX_PAYLOAD_BYTES = 1_800_000;
const keySets = new Map();
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

function validBackup(value) {
  return value && value.app === 'tonificacion-consumos' &&
    value.decorators && typeof value.decorators === 'object' && !Array.isArray(value.decorators) &&
    Object.values(value.decorators).every(dec => dec && typeof dec === 'object' &&
      Array.isArray(dec.history) && Array.isArray(dec.archive));
}

async function readState(db) {
  return db.prepare('SELECT revision, payload FROM sync_state WHERE id = 1').first();
}

async function hasAccess(request, env, ctx) {
  if (ctx.access) return true;
  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token || !env.TEAM_DOMAIN || !env.POLICY_AUD) return false;
  try {
    let keys = keySets.get(env.TEAM_DOMAIN);
    if (!keys) {
      keys = createRemoteJWKSet(new URL(`${env.TEAM_DOMAIN}/cdn-cgi/access/certs`));
      keySets.set(env.TEAM_DOMAIN, keys);
    }
    await jwtVerify(token, keys, { issuer: env.TEAM_DOMAIN, audience: env.POLICY_AUD });
    return true;
  } catch {
    return false;
  }
}

async function saveBackup(db, incoming) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const state = await readState(db);
    const merged = state ? mergeBackups(JSON.parse(state.payload), incoming) : incoming;
    const payload = JSON.stringify(merged);
    if (new TextEncoder().encode(payload).length > MAX_PAYLOAD_BYTES) {
      return json({ error: 'La copia supera el tamaño permitido. Exporta un respaldo antes de continuar.' }, 413);
    }
    const now = new Date().toISOString();
    const result = state
      ? await db.prepare('UPDATE sync_state SET payload = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?')
        .bind(payload, now, state.revision).run()
      : await db.prepare('INSERT OR IGNORE INTO sync_state (id, revision, payload, updated_at) VALUES (1, 1, ?, ?)')
        .bind(payload, now).run();
    if (result.meta.changes === 1) return json({ ok: true, revision: state ? state.revision + 1 : 1 });
  }
  return json({ error: 'Conflicto de sincronización. Reintenta.' }, 409);
}

export default {
  async fetch(request, env, ctx) {
    if (!await hasAccess(request, env, ctx)) return json({ error: 'Acceso privado no autorizado' }, 403);
    const path = new URL(request.url).pathname;
    if (path === '/api/sync') {
      if (request.method === 'GET') {
        const state = await readState(env.DB);
        return json({ ...(state ? JSON.parse(state.payload) : {}), syncProtocol: 3 });
      }
      if (request.method === 'POST') {
        if (Number(request.headers.get('content-length') || 0) > MAX_PAYLOAD_BYTES) {
          return json({ error: 'Copia demasiado grande' }, 413);
        }
        let incoming;
        try { incoming = await request.json(); }
        catch { return json({ error: 'JSON no válido' }, 400); }
        if (!validBackup(incoming)) return json({ error: 'Formato de copia no válido' }, 400);
        return saveBackup(env.DB, incoming);
      }
      return json({ error: 'Método no permitido' }, 405);
    }
    if (path.startsWith('/api/')) return json({ error: 'Ruta no encontrada' }, 404);
    return env.ASSETS.fetch(request);
  }
};
