export function mergeTombstones(oldValues = {}, nextValues = {}) {
  const result = { ...oldValues };
  for (const [id, date] of Object.entries(nextValues)) {
    if (!result[id] || date > result[id]) result[id] = date;
  }
  return result;
}

export function mergeBackups(current, incoming) {
  const merged = {
    app: 'tonificacion-consumos',
    version: '3.0',
    exportedAt: (incoming.exportedAt || '') > (current.exportedAt || '') ? incoming.exportedAt : current.exportedAt,
    decorators: {},
    deletedRecords: mergeTombstones(current.deletedRecords, incoming.deletedRecords),
    deletedArchives: mergeTombstones(current.deletedArchives, incoming.deletedArchives)
  };
  const decorators = new Set([
    ...Object.keys(current.decorators || {}),
    ...Object.keys(incoming.decorators || {})
  ]);
  for (const dec of decorators) {
    const old = current.decorators?.[dec] || {};
    const next = incoming.decorators?.[dec] || {};
    const rows = new Map();
    const prefix = ({ 'Decorador 1': 'dec1_', 'Decorador 2': 'dec2_', 'Decorador 3': 'dec3_' })[dec] || 'dec2_';
    [...(old.history || []), ...(next.history || [])].forEach((row, index) => {
      const id = row.id || `legacy-${prefix}-${row.date}-${row.timeFrom}-${index}`;
      const item = { ...row, id, updatedAt: row.updatedAt || '1970-01-01T00:00:00.000Z' };
      if (merged.deletedRecords[id] && merged.deletedRecords[id] >= item.updatedAt) return;
      if (!rows.has(id) || rows.get(id).updatedAt < item.updatedAt) rows.set(id, item);
    });
    const newest = (incoming.exportedAt || '') >= (current.exportedAt || '') ? next : old;
    merged.decorators[dec] = {
      order: newest.order || '',
      tech: newest.tech || '',
      substrate: newest.substrate || '',
      material: newest.material || '',
      graphic: newest.graphic || '',
      sap: newest.sap || '',
      history: [...rows.values()],
      archive: [...(old.archive || []), ...(next.archive || [])].filter((item, index, all) =>
        !merged.deletedArchives[item.closedAt] &&
        all.findIndex(other => other.closedAt === item.closedAt && other.order === item.order) === index)
    };
  }
  const planning = mergeCollection(current.planning, incoming.planning, 'rows');
  if (planning) merged.planning = planning;
  const keracost = mergeCollection(current.keracost, incoming.keracost, 'items');
  if (keracost) merged.keracost = keracost;
  const tono = mergeCollection(current.tono, incoming.tono, 'items');
  if (tono) merged.tono = tono;
  return merged;
}

export function mergeCollection(a, b, listKey) {
  const ok = x => x && Array.isArray(x[listKey]);
  if (!ok(a)) return ok(b) ? b : undefined;
  if (!ok(b)) return a;
  const newer = (b.updatedAt || '') > (a.updatedAt || '') ? b : a;
  const older = newer === a ? b : a;
  const deleted = mergeTombstones(a.deleted || {}, b.deleted || {});
  const rows = new Map();
  [...newer[listKey], ...older[listKey]].forEach(row => {
    if (!row || !row.id) return;
    const prev = rows.get(row.id);
    if (!prev || (row.updatedAt || '') > (prev.updatedAt || '')) rows.set(row.id, row);
  });
  const result = { ...older, ...newer, deleted, updatedAt: newer.updatedAt || '' };
  result[listKey] = [...rows.values()].filter(row => !(deleted[row.id] && deleted[row.id] >= (row.updatedAt || '')));
  if (a.weeks || b.weeks) {
    result.weeks = {};
    new Set([...Object.keys(a.weeks || {}), ...Object.keys(b.weeks || {})]).forEach(k => {
      const x = a.weeks?.[k], y = b.weeks?.[k];
      result.weeks[k] = !x ? y : !y ? x : ((y.updatedAt || '') > (x.updatedAt || '') ? y : x);
    });
  }
  return result;
}
