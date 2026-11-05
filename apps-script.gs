/**
 * Tonificación Consumos — backend en Google Sheets
 *
 * INSTALACIÓN (una sola vez):
 * 1. Crea una Hoja de cálculo de Google nueva (ej. "Tonificación Consumos").
 * 2. Menú Extensiones > Apps Script. Borra lo que haya y pega este archivo entero. Guarda.
 * 3. Botón "Implementar" > "Nueva implementación" > tipo "Aplicación web".
 *      - Ejecutar como: Yo
 *      - Quién tiene acceso: Cualquier usuario
 *    Autoriza los permisos que pida.
 * 4. Copia la URL que termina en /exec y pégala en la app (botón ⚙️ Nube) en cada dispositivo.
 *
 * La hoja "Registros" se rellena sola con todas las sesiones (activas y archivadas)
 * para poder filtrar, hacer tablas dinámicas o gráficas. No la edites a mano:
 * se regenera en cada sincronización.
 */

const BACKUP_FILE = 'tonificacion_consumos_backup.json';

function doGet() {
  const file = getBackupFile_();
  const json = file ? file.getBlob().getDataAsString() : '{}';
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const incoming = JSON.parse(e.postData.contents);
    if (incoming.app !== 'tonificacion-consumos' || !incoming.decorators) {
      return ContentService.createTextOutput('formato no válido');
    }
    // Solo se acepta si es más reciente que lo guardado (evita pisar datos nuevos con viejos)
    const file = getBackupFile_();
    if (file) {
      const current = JSON.parse(file.getBlob().getDataAsString() || '{}');
      if (current.exportedAt && incoming.exportedAt && incoming.exportedAt < current.exportedAt) {
        return ContentService.createTextOutput('ignorado: más antiguo');
      }
      file.setContent(JSON.stringify(incoming));
    } else {
      DriveApp.createFile(BACKUP_FILE, JSON.stringify(incoming), MimeType.PLAIN_TEXT);
    }
    writeSheet_(incoming);
    return ContentService.createTextOutput('ok');
  } finally {
    lock.releaseLock();
  }
}

function getBackupFile_() {
  const files = DriveApp.getFilesByName(BACKUP_FILE);
  return files.hasNext() ? files.next() : null;
}

function writeSheet_(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
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
