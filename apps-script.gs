/**
 * Tonificación Consumos - backend en Google Sheets
 *
 * INSTALACIÓN (una sola vez):
 * 1. Crea un proyecto independiente de Apps Script y pega este archivo.
 * 2. Ejecuta initializeRecords una vez y autoriza el acceso a Sheets.
 * 3. Implementa como aplicación web: ejecutar como yo; acceso para cualquiera.
 * 4. Pega la URL /exec en la app (botón Nube) en cada dispositivo.
 *
 * Si ya tienes una implementación, pega esta versión y usa Implementar > Gestionar
 * implementaciones > Editar > Nueva versión. Conserva la misma URL /exec.
 * "Sincronizacion" guarda el JSON completo en fragmentos. "Registros" muestra
 * las sesiones para consultar. No edites estas hojas: se regeneran al sincronizar.
 */

const SYNC_SHEET = 'Sincronizacion';
const SYNC_CHUNK_SIZE = 30000;

function doGet() {
  const data = readBackup_() || {};
  data.syncProtocol = 2;
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const incoming = JSON.parse(e.postData.contents);
    if (incoming.app !== 'tonificacion-consumos' || !incoming.decorators) {
      return ContentService.createTextOutput('formato no válido');
    }
    const current = readBackup_();
    const merged = current ? mergeBackups_(current, incoming) : incoming;
    writeBackup_(merged);
    writeSheet_(merged);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function mergeBackups_(current, incoming) {
  const merged = {
    app: 'tonificacion-consumos', version: '2.8',
    exportedAt: new Date().toISOString(),
    decorators: {},
    deletedRecords: mergeTombstones_(current.deletedRecords, incoming.deletedRecords),
    deletedArchives: mergeTombstones_(current.deletedArchives, incoming.deletedArchives)
  };
  const decorators = new Set([...Object.keys(current.decorators || {}), ...Object.keys(incoming.decorators || {})]);
  decorators.forEach(dec => {
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
      order: newest.order || '', tech: newest.tech || '', substrate: newest.substrate || '', graphic: newest.graphic || '',
      history: [...rows.values()],
      archive: [...(old.archive || []), ...(next.archive || [])].filter((item, index, all) =>
        !merged.deletedArchives[item.closedAt] &&
        all.findIndex(other => other.closedAt === item.closedAt && other.order === item.order) === index)
    };
  });
  return merged;
}

function mergeTombstones_(old, next) {
  const result = { ...(old || {}) };
  Object.entries(next || {}).forEach(([id, date]) => {
    if (!result[id] || date > result[id]) result[id] = date;
  });
  return result;
}

function readBackup_() {
  const sh = getRecordsSpreadsheet_().getSheetByName(SYNC_SHEET);
  if (!sh || sh.getLastRow() === 0) return null;
  const chunks = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(row => row[0]);
  return JSON.parse(chunks.join(''));
}

function writeBackup_(data) {
  const ss = getRecordsSpreadsheet_();
  const sh = ss.getSheetByName(SYNC_SHEET) || ss.insertSheet(SYNC_SHEET);
  const json = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < json.length; i += SYNC_CHUNK_SIZE) chunks.push([json.slice(i, i + SYNC_CHUNK_SIZE)]);
  sh.clearContents();
  sh.getRange(1, 1, chunks.length, 1).setValues(chunks);
}

function writeSheet_(data) {
  const ss = getRecordsSpreadsheet_();
  const sh = ss.getSheetByName('Registros') || ss.insertSheet('Registros');
  const head = ['Decorador', 'Estado pedido', 'Orden', 'Técnico', 'Sustrato', 'Gráfica', 'Fecha',
                'Desde', 'Hasta', 'Horas', 'Estatus', 'OK', 'No OK', 'Merma %', 'Comentarios'];
  const rows = [];
  const subName = v => v ? v.charAt(0).toUpperCase() + v.slice(1) : '';
  const push = (dec, estado, o, list) => (list || []).forEach(x => {
    const tot = (x.ok || 0) + (x.nok || 0);
    rows.push([dec, estado, o.order, o.tech, o.substrate, o.graphic, x.date, x.timeFrom, x.timeTo,
               Math.round((x.hours || 0) * 100) / 100, x.status, x.ok || 0, x.nok || 0,
               tot ? Math.round(x.nok / tot * 1000) / 10 : 0, x.comment || '']);
  });

  Object.keys(data.decorators).forEach(dec => {
    const d = data.decorators[dec];
    push(dec, 'Abierto', { order: d.order, tech: d.tech, substrate: subName(d.substrate), graphic: d.graphic }, d.history);
    (d.archive || []).forEach(a => push(dec, 'Cerrado', a, a.history));
  });

  sh.clearContents();
  sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
  if (rows.length) sh.getRange(2, 1, rows.length, head.length).setValues(rows);
  sh.setFrozenRows(1);
}

function getRecordsSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('RECORDS_SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const ss = SpreadsheetApp.create('Tonificación Consumos - Registros');
  props.setProperty('RECORDS_SPREADSHEET_ID', ss.getId());
  return ss;
}

function initializeRecords() {
  return getRecordsSpreadsheet_().getId();
}
