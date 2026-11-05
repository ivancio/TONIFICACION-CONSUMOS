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
    const prefix = dec === 'Decorador 1' ? 'dec1_' : 'dec2_';
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
      history: [...rows.values()],
      archive: [...(old.archive || []), ...(next.archive || [])].filter((item, index, all) =>
        !merged.deletedArchives[item.closedAt] &&
        all.findIndex(other => other.closedAt === item.closedAt && other.order === item.order) === index)
    };
  }
  return merged;
}
