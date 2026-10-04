/** Revisiones por tabla y cachés reconstruibles. Ninguna caché autoriza usuarios. */

/**
 * Lee las revisiones del proyecto y las reutiliza durante la petición.
 * @returns {Object} Revisión global y revisiones de tablas para claves de caché.
 */
function revisionState_() {
  if (readContext_ && readContext_.revisions) return readContext_.revisions;
  const state=JSON.parse(PropertiesService.getScriptProperties().getProperty('SD_REVISIONS') || '{"global":"0","tables":{}}');
  if (readContext_) readContext_.revisions=state;
  return state;
}

/**
 * Marca una tabla modificada; las mutaciones publican sus revisiones al liberar el bloqueo.
 * @param {string} table - Tabla modificada o * para invalidar todo.
 */
function markTableChanged_(table) {
  const state=revisionState_(),revision=Utilities.getUuid();
  state.global=revision;
  if(table==='*') state.tables={'*':revision};
  else state.tables[table]=revision;
  if(readContext_) readContext_.revisionsDirty=true;
  else PropertiesService.getScriptProperties().setProperty('SD_REVISIONS',JSON.stringify(state));
}

/**
 * Publica revisiones incluso si una escritura posterior falló: Sheets no ofrece rollback.
 * @param {Object} context - Contexto de la operación protegida por el bloqueo.
 */
function persistRevisions_(context) {
  if(context.revisionsDirty) PropertiesService.getScriptProperties().setProperty('SD_REVISIONS',JSON.stringify(context.revisions));
}

/**
 * Genera una clave aislada por Sheet y revisión; * invalida también cambios estructurales.
 * @param {string} kind - Categoría de caché.
 * @param {string} table - Tabla de origen.
 * @returns {string} Clave sin datos personales.
 */
function performanceCacheKey_(kind,table) {
  const state=revisionState_();
  return 'SD3:'+hashValue_([spreadsheetId_(),kind,table,state.tables[table]||'0',state.tables['*']||'0']);
}

/**
 * Consulta una caché opcional; ausencia, caducidad o fallo siempre permite leer Sheets.
 * @param {string} key - Clave calculada por performanceCacheKey_.
 * @returns {*} Valor reconstruible o null.
 */
function optionalCacheGet_(key) {
  try {
    const value=CacheService.getScriptCache().get(key);
    return value ? JSON.parse(value) : null;
  } catch(error) { return null; }
}

/**
 * Guarda un valor pequeño; evita exceder el límite de 100 KB por entrada de Google.
 * @param {string} key - Clave de la entrada.
 * @param {*} value - Valor serializable, sin permisos de usuario.
 */
function optionalCachePut_(key,value) {
  try {
    const json=JSON.stringify(value);
    if(json.length*3>90000) return;
    CacheService.getScriptCache().put(key,json,APP.CATALOG_CACHE_SECONDS);
  } catch(error) { /* La caché es prescindible; Sheets sigue siendo la fuente de verdad. */ }
}

/**
 * Decide si una lectura puede reutilizar catálogos, nunca tablas de autorización.
 * @param {string} table - Nombre de la tabla.
 * @returns {boolean} Verdadero solo para lecturas de catálogos sin refresco forzado.
 */
function canCacheCatalog_(table) {
  return !!readContext_ && !readContext_.bypassCache && !['mutation','getAdminData'].includes(readContext_.label)
    && [APP.SHEETS.types,APP.SHEETS.projects,APP.SHEETS.catalogs].includes(table);
}

/**
 * Obtiene únicamente el último ID de actividad por compromiso, con caché reconstruible.
 * @returns {Object} Índice sin comentarios ni otros contenidos del historial.
 */
function activityIndex_() {
  const key=performanceCacheKey_('activity',APP.SHEETS.history);
  const cached=readContext_ && readContext_.bypassCache ? null : optionalCacheGet_(key);
  if(cached) return cached;
  const index=readTable_(APP.SHEETS.history).reduce((out,row)=>{
    if(row.compromiso_id) out[row.compromiso_id]=row.historial_id;
    return out;
  },Object.create(null));
  optionalCachePut_(key,index);
  return index;
}

/**
 * Extiende un índice existente después de añadir eventos, sin volver a recorrer HISTORIAL.
 * @param {Array<Object>} records - Eventos añadidos en orden de escritura.
 * @param {Object|null} previous - Índice anterior; null implica reconstrucción posterior.
 */
function extendActivityIndex_(records,previous) {
  if(!previous) return;
  records.forEach(row=>{if(row.compromiso_id) previous[row.compromiso_id]=row.historial_id;});
  optionalCachePut_(performanceCacheKey_('activity',APP.SHEETS.history),previous);
}

/**
 * Comprueba identidad y tablas que conceden acceso, incluso en sincronizaciones sin cambios.
 * La ventana temporal obliga a revisar datos externos y fórmulas al menos cada cinco minutos.
 * @param {Object} actor - Usuario autenticado.
 * @returns {string} Huella de cambios y de autorizaciones actuales.
 */
function syncDataVersion_(actor) {
  const window=Math.floor(Date.now()/APP.FULL_CHECK_INTERVAL_MS);
  return window+':'+hashValue_({revision:revisionState_().global,actor:normalizedRecord_(actor),
    access:[APP.SHEETS.users,APP.SHEETS.commitments,APP.SHEETS.collaborators,APP.SHEETS.approvals,APP.SHEETS.delegations]
      .map(table=>readTable_(table).map(normalizedRecord_)),
    day:Utilities.formatDate(new Date(),APP.TIME_ZONE,'yyyy-MM-dd'),
    window:window});
}
