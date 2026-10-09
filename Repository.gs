/** Acceso a Sheets, contexto por petición y escrituras agrupadas con bloqueo. */

// Solo existe durante una ejecución; no almacena identidad entre peticiones.
let readContext_ = null;

/**
 * Lee filas de Sheets, normaliza fechas y reutiliza la lectura dentro de la petición.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @returns {Array<Object>} Filas normalizadas con _row.
 */
function readTable_(sheetName) {
  if (readContext_ && Object.prototype.hasOwnProperty.call(readContext_.tables, sheetName)) return readContext_.tables[sheetName];
  const cacheKey=canCacheCatalog_(sheetName) ? performanceCacheKey_('catalog',sheetName) : null;
  const cached=cacheKey ? optionalCacheGet_(cacheKey) : null;
  if(cached) {
    readContext_.headers[sheetName]=cached.headers;
    readContext_.tables[sheetName]=cached.records;
    return cached.records;
  }
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (readContext_) readContext_.tableReads++;
  if (!values.length) return [];
  const headers = values[0].map(h => String(h || '').trim());
  if(new Set(headers.filter(Boolean)).size!==headers.filter(Boolean).length) throw appError_('CONFIGURATION','Hay encabezados duplicados en '+sheetName+'.');
  if (readContext_) readContext_.headers[sheetName] = headers;
  const records = values.slice(1).map((row, index) => {
    const record = { _row: index + 2 };
    headers.forEach((header, col) => { if (header) record[header] = normalizeValue_(row[col], header); });
    return record;
  }).filter(record => headers.some(h => h && record[h] !== '' && record[h] !== null));
  if (readContext_) readContext_.tables[sheetName] = records;
  if(cacheKey) optionalCachePut_(cacheKey,{headers:headers,records:records});
  return records;
}

/**
 * Convierte fechas de Sheets al formato correspondiente a la columna y zona horaria.
 * @param {*} value - Valor que se interpreta o valida.
 * @param {*} header - Nombre de la columna para normalizar fechas.
 * @returns {*} Valor original o fecha normalizada.
 */
function normalizeValue_(value, header) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    const pattern = /(_at|fecha_evento|fecha_subida|fecha_envio|fecha_respuesta)/.test(header) ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd';
    return Utilities.formatDate(value, APP.TIME_ZONE, pattern);
  }
  return value;
}

/**
 * Añade una fila mediante la escritura agrupada del repositorio.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @param {Object} record - Registro con nombres de columnas.
 */
function appendRecord_(sheetName, record) { appendRecords_(sheetName, [record]); }

/**
 * Busca una fila por su identificador; conserva _row para las escrituras posteriores.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @param {string} idField - Columna que contiene el identificador único.
 * @param {*} id - Identificador del registro.
 * @returns {Object|null} Fila encontrada o null.
 */
function findById_(sheetName, idField, id) {
  if (!id) return null;
  return readTable_(sheetName).find(r => String(r[idField]) === String(id)) || null;
}

/**
 * Actualiza una columna usando el repositorio que conserva las fórmulas restantes.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @param {*} rowNumber - Fila física, a partir de 2.
 * @param {*} field - Nombre de columna o definición de campo del formulario, según la función.
 * @param {*} value - Valor que se interpreta o valida.
 */
function setField_(sheetName, rowNumber, field, value) { patchRecord_(sheetName, rowNumber, {[field]:value}); }

/**
 * Obtiene una pestaña requerida y reutiliza su referencia durante la petición.
 * @param {*} name - Nombre de operación, vista o referencia.
 * @returns {Sheet} Pestaña requerida.
 */
function getSheet_(name) {
  if (readContext_ && readContext_.sheets[name]) return readContext_.sheets[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw appError_('VALIDATION','Falta la pestaña ' + name + ' en el Google Sheet.');
  if (readContext_) readContext_.sheets[name] = sheet;
  return sheet;
}

/**
 * Serializa escrituras, crea el contexto de lectura y libera siempre el bloqueo.
 * @param {Function} callback - Trabajo que se ejecuta dentro del contexto protegido.
 * @returns {*} Resultado de callback; no implica una transacción entre hojas.
 */
function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return withReadContext_('mutation', function () {
    try { return callback(); }
    finally { SpreadsheetApp.flush(); }
  }); } finally { lock.releaseLock(); }
}

/**
 * Mantiene conexión, tablas e índices durante una petición y registra su duración.
 * @param {*} label - Nombre de la operación para los registros.
 * @param {Function} callback - Trabajo que se ejecuta dentro del contexto protegido.
 * @returns {*} Resultado de callback dentro del contexto de petición.
 */
function withReadContext_(label, callback) {
  if (readContext_) return callback();
  const oldCatalogs = catalogIndexes_;
  const context = {label:label,book:null,sheets:Object.create(null),tables:Object.create(null),headers:Object.create(null),tableReads:0,spreadsheetOpens:0};
  const start = Date.now();
  readContext_ = context; catalogIndexes_ = null;
  try { return callback(); }
  finally {
    try { persistRevisions_(context); }
    finally { readContext_ = null; catalogIndexes_ = oldCatalogs; }
    console.info('SD_PERF ' + JSON.stringify({endpoint:label,durationMs:Date.now()-start,tableReads:context.tableReads,spreadsheetOpens:context.spreadsheetOpens}));
  }
}

/**
 * Abre el Sheet configurado una sola vez por contexto de petición.
 * @returns {Spreadsheet} Libro del entorno configurado.
 */
function getSpreadsheet_() {
  if (!readContext_) return SpreadsheetApp.openById(spreadsheetId_());
  if (!readContext_.book) {
    readContext_.book = SpreadsheetApp.openById(spreadsheetId_());
    readContext_.spreadsheetOpens++;
  }
  return readContext_.book;
}

/**
 * Consulta y reutiliza los encabezados de una tabla durante la petición.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @returns {Array<string>} Nombres de columnas en orden físico.
 */
function tableHeaders_(sheetName) {
  if(readContext_&&readContext_.headers[sheetName])return readContext_.headers[sheetName];
  const sheet=getSheet_(sheetName),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(h=>String(h).trim());
  if(readContext_)readContext_.headers[sheetName]=headers;return headers;
}

/**
 * Descarta lecturas e índices después de una escritura para evitar respuestas antiguas.
 * @param {*} name - Nombre de operación, vista o referencia.
 * @param {boolean} headers - También descarta encabezados cuando cambió el esquema.
 */
function invalidateTable_(name,headers) {
  markTableChanged_(name);
  if(!readContext_)return;
  delete readContext_.tables[name];if(headers)delete readContext_.headers[name];
  if([APP.SHEETS.types,APP.SHEETS.projects].includes(name))catalogIndexes_=null;
}

/**
 * Escribe campos de una fila en un bloque preservando fórmulas y columnas adicionales.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @param {*} rowNumber - Fila física, a partir de 2.
 * @param {Object} fields - Campos a escribir o definición de campos del formulario.
 */
function patchRecord_(sheetName,rowNumber,fields) {
  if(!Number.isInteger(rowNumber)||rowNumber<2)throw appError_('VALIDATION','Fila inválida.');
  const sheet=getSheet_(sheetName),headers=tableHeaders_(sheetName),keys=Object.keys(fields);
  keys.forEach(k=>{if(!headers.includes(k))throw appError_('CONFIGURATION','No existe la columna '+k+' en '+sheetName+'.');});
  if(!keys.length)return;
  const range=sheet.getRange(rowNumber,1,1,headers.length),values=range.getValues()[0],formulas=range.getFormulas()[0];
  const row=values.map((v,i)=>formulas[i]||(typeof v==='string'&&v.startsWith('=')?"'"+v:v));
  keys.forEach(k=>row[headers.indexOf(k)]=fields[k]==null?'':fields[k]);
  range.setValues([row]);invalidateTable_(sheetName);
}

/**
 * Añade varias filas en una escritura y amplía la hoja si es necesario.
 * @param {*} sheetName - Nombre exacto de la pestaña.
 * @param {*} records - Registros que se añadirán.
 */
function appendRecords_(sheetName,records) {
  if(!records.length)return;
  const oldActivity=sheetName===APP.SHEETS.history ? optionalCacheGet_(performanceCacheKey_('activity-v3',sheetName)) : null;
  const sheet=getSheet_(sheetName),headers=tableHeaders_(sheetName),start=sheet.getLastRow()+1,last=start+records.length-1;
  if(last>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
  sheet.getRange(start,1,records.length,headers.length).setValues(records.map(record=>headers.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:'')));
  invalidateTable_(sheetName);
  if(sheetName===APP.SHEETS.history) extendActivityIndex_(records,oldActivity);
}
