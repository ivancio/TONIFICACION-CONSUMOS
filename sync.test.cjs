const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const inline = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(inline, 'No se encontro el script de la app');
new vm.Script(inline);
assert.match(html, /class="card-title">Alejandro<\/div>/);
assert.match(html, /class="card-title">Iván<\/div>/);
assert.match(inline, /const DECORATORS = \{ 'Decorador 1': 'dec1_', 'Decorador 2': 'dec2_' \}/);
assert.match(inline, /const DECORATOR_NAMES = \{ 'Decorador 1': 'Alejandro', 'Decorador 2': 'Iván' \}/);

const context = vm.createContext({ Date });
vm.runInContext(fs.readFileSync('apps-script.gs', 'utf8'), context);
const merge = vm.runInContext('mergeBackups_', context);
const base = { app: 'tonificacion-consumos', exportedAt: '2026-11-05T08:00:00Z', decorators: {
  'Decorador 1': { order: 'A', history: [{ id: 'a', updatedAt: '2026-11-05T08:00:00Z', ok: 2 }], archive: [] },
  'Decorador 2': { order: 'B', history: [], archive: [] }
} };
const other = { app: base.app, exportedAt: '2026-11-05T08:01:00Z', decorators: {
  'Decorador 1': { order: 'A', history: [], archive: [] },
  'Decorador 2': { order: 'B', history: [{ id: 'b', updatedAt: '2026-11-05T08:01:00Z', ok: 5 }], archive: [] }
} };
const joined = merge(base, other);
assert.equal(joined.decorators['Decorador 1'].history[0].id, 'a');
assert.equal(joined.decorators['Decorador 2'].history[0].id, 'b');

const edited = structuredClone(other);
edited.decorators['Decorador 1'].history = [{ id: 'a', updatedAt: '2026-11-05T09:00:00Z', ok: 7 }];
const updated = merge(joined, edited);
assert.equal(updated.decorators['Decorador 1'].history[0].ok, 7);

const removed = structuredClone(other);
removed.deletedRecords = { a: '2026-11-05T10:00:00Z' };
const afterDelete = merge(updated, removed);
assert.equal(afterDelete.decorators['Decorador 1'].history.length, 0);
assert.equal(afterDelete.decorators['Decorador 2'].history.length, 1);
const archived = structuredClone(other);
archived.decorators['Decorador 2'].archive = [{ closedAt: '2026-11-05T11:00:00Z', order: 'B', history: [{ id: 'b', ok: 5 }] }];
archived.deletedRecords = { b: '2026-11-05T11:00:00Z' };
const afterArchive = merge(afterDelete, archived);
assert.equal(afterArchive.decorators['Decorador 2'].history.length, 0);
assert.equal(afterArchive.decorators['Decorador 2'].archive.length, 1);
console.log('Sincronizacion: 2 moviles, edicion, borrado y archivo OK');
