/** Validadores y utilidades de datos compartidos por los servicios. */

/**
 * Construye un índice de registros por el campo indicado.
 * @param {Array<Object>} items - Registros que se indexarán.
 * @param {*} key - Campo utilizado como clave.
 * @returns {Object} Índice de registros por clave.
 */
function indexBy_(items, key) {
  return items.reduce((out, item) => { out[item[key]] = item; return out; }, {});
}

/**
 * Interpreta los indicadores booleanos que pueden provenir de Sheets o formularios.
 * @param {*} value - Valor que se interpreta o valida.
 * @returns {boolean} Interpretación del indicador.
 */
function isTrue_(value) { return value === true || String(value).toUpperCase() === 'TRUE' || value === 1; }

/**
 * Valida longitud y obligatoriedad del texto y rechaza entradas que comienzan con fórmula.
 * @param {*} value - Valor que se interpreta o valida.
 * @param {string|null} requiredMessage - Mensaje de obligatoriedad; null permite texto vacío.
 * @param {number} maxLength - Máximo de caracteres permitido.
 * @returns {string} Texto validado y recortado.
 */
function text_(value, requiredMessage, maxLength) {
  const s = String(value == null ? '' : value).trim();
  if (requiredMessage && !s) throw appError_('VALIDATION',requiredMessage);
  if (s.length > (maxLength || APP.MAX_TEXT)) throw appError_('VALIDATION','El texto supera el máximo permitido.');
  if (s.startsWith('=')) throw appError_('VALIDATION','El texto no puede comenzar con “=”.');
  return s;
}

/**
 * Valida una fecha ISO y crea un Date en la zona horaria operativa.
 * @param {*} value - Valor que se interpreta o valida.
 * @param {*} message - Mensaje que se mostrará al usuario.
 * @returns {Date} Fecha validada.
 */
function parseDate_(value, message) {
  try { return new Date(isoDateInput_(value) + 'T12:00:00-05:00'); }
  catch (error) { throw appError_('VALIDATION',message || error.message); }
}

/**
 * Normaliza un valor de fecha a YYYY-MM-DD o devuelve una cadena vacía.
 * @param {*} value - Valor que se interpreta o valida.
 * @returns {string} Fecha ISO o cadena vacía.
 */
function toIsoDate_(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, APP.TIME_ZONE, 'yyyy-MM-dd');
}

/**
 * Desplaza una fecha ISO el número de días indicado.
 * @param {*} iso - Fecha en formato YYYY-MM-DD.
 * @param {*} days - Número de días a desplazar.
 * @returns {string} Fecha ISO desplazada.
 */
function addDaysIso_(iso, days) { return shiftDays_(iso, days); }

/**
 * Valida que la evidencia tenga un enlace HTTPS dentro del límite permitido.
 * @param {*} value - Valor que se interpreta o valida.
 * @returns {string} Enlace HTTPS validado.
 */
function validateUrl_(value) {
  const url = text_(value, 'Pega el enlace de la evidencia.', 1000);
  if (!/^https:\/\//i.test(url)) throw appError_('VALIDATION','El enlace debe comenzar con https://');
  return url;
}

/**
 * Genera un identificador con prefijo, fecha y UUID para evitar colisiones.
 * @param {string} prefix - Prefijo del identificador, por ejemplo COM o CMT.
 * @returns {string} Identificador único prefijado.
 */
function nextId_(prefix) {
  const stamp = Utilities.formatDate(new Date(), APP.TIME_ZONE, 'yyyyMMdd-HHmmss');
  return prefix + '-' + stamp + '-' + Utilities.getUuid().toUpperCase();
}

/**
 * Deriva un ID estable de un UUID de solicitud para soportar reintentos.
 * @param {string} prefix - Prefijo del identificador, por ejemplo COM o CMT.
 * @param {string} requestId - UUID v4 estable durante los reintentos de la misma solicitud.
 * @returns {string} Identificador estable derivado del UUID.
 */
function requestRecordId_(prefix,requestId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId||''))) throw appError_('VALIDATION','Solicitud no válida. Abre nuevamente el formulario.');
  return prefix+'-'+requestId.toUpperCase();
}

/**
 * Exige que el identificador corresponda a un usuario activo.
 * @param {*} id - Identificador del registro.
 * @returns {Object} Fila del usuario activo.
 */
function requireActiveUserId_(id) { return requireActiveReference_('users','usuario_id',id); }

/**
 * Valida la existencia y actividad de una referencia de catálogo o usuario.
 * @param {string} table - Clave lógica de la tabla dentro de APP.SHEETS.
 * @param {*} key - Campo utilizado como clave.
 * @param {*} id - Identificador del registro.
 * @returns {Object} Fila activa de la referencia.
 */
function requireActiveReference_(table,key,id) {
  const row=findById_(APP.SHEETS[table],key,id);
  if (!row || !isTrue_(row.activo)) throw appError_('VALIDATION','Selecciona un registro activo en '+APP.SHEETS[table]+'.');
  return row;
}

/**
 * Valida estrictamente una fecha YYYY-MM-DD, incluyendo días reales del calendario.
 * @param {*} value - Valor que se interpreta o valida.
 * @returns {string} Fecha ISO estrictamente validada.
 */
function isoDateInput_(value) {
  const s=String(value||'').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw appError_('VALIDATION','Selecciona una fecha válida.');
  const d=new Date(s+'T12:00:00Z');
  if (isNaN(d.getTime())||d.toISOString().slice(0,10)!==s) throw appError_('VALIDATION','La fecha no existe en el calendario.');
  return s;
}

/**
 * Suma días a una fecha ISO usando aritmética UTC para evitar cambios de horario.
 * @param {*} iso - Fecha en formato YYYY-MM-DD.
 * @param {*} days - Número de días a desplazar.
 * @returns {string} Fecha ISO después del desplazamiento.
 */
function shiftDays_(iso,days) {
  const d=new Date(isoDateInput_(iso)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
