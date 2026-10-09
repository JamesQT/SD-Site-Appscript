/** Revisiones por tabla y cachés reconstruibles. Ninguna caché autoriza usuarios. */

/** Devuelve el día de negocio en Lima, calculado una sola vez durante cada petición. */
function businessToday_() {
  if(readContext_&&readContext_.today)return readContext_.today;
  const today=Utilities.formatDate(new Date(),APP.TIME_ZONE,'yyyy-MM-dd');
  if(readContext_)readContext_.today=today;
  return today;
}

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
    const cache=CacheService.getScriptCache(),value=cache.get(key);
    if(!value)return null;
    const decoded=JSON.parse(value);
    if(decoded.sdCacheFormat!==2||!Array.isArray(decoded.parts))return decoded;
    if(!decoded.parts.length||decoded.parts.length>30||decoded.parts.some(part=>typeof part!=='string'||!part.startsWith(key+':')))return null;
    const parts=cache.getAll(decoded.parts);
    if(decoded.parts.some(part=>typeof parts[part]!=='string'))return null;
    return JSON.parse(decoded.parts.map(part=>parts[part]).join(''));
  } catch(error) { return null; }
}

/**
 * Guarda resúmenes grandes por bloques, publicando el manifiesto solo al final.
 * @param {string} key - Clave de la entrada.
 * @param {*} value - Valor serializable, sin permisos de usuario.
 */
function optionalCachePut_(key,value) {
  try {
    const json=JSON.stringify(value),cache=CacheService.getScriptCache();
    if(json.length<=30000){cache.put(key,json,APP.CATALOG_CACHE_SECONDS);return;}
    if(json.length>870000)return;
    const generation=Utilities.getUuid(),parts={},keys=[];
    for(let offset=0;offset<json.length;) {
      let end=Math.min(offset+30000,json.length);
      const last=json.charCodeAt(end-1);if(end<json.length&&last>=0xd800&&last<=0xdbff)end--;
      const part=key+':'+generation+':'+keys.length;keys.push(part);parts[part]=json.slice(offset,end);offset=end;
    }
    cache.putAll(parts,APP.CATALOG_CACHE_SECONDS);
    cache.put(key,JSON.stringify({sdCacheFormat:2,parts:keys}),APP.CATALOG_CACHE_SECONDS);
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
 * Resume última actividad, cambios de estado y postergaciones en una única lectura cacheada.
 * @returns {Object} Índice sin comentarios ni otros contenidos del historial.
 */
function activityIndex_() {
  const key=performanceCacheKey_('activity-v3',APP.SHEETS.history);
  const cached=readContext_ && readContext_.bypassCache ? null : optionalCacheGet_(key);
  if(cached) return cached;
  const index=readTable_(APP.SHEETS.history).reduce((out,row)=>{
    accumulateActivity_(out,row);
    return out;
  },Object.create(null));
  optionalCachePut_(key,index);
  return index;
}

/**
 * Acumula un evento en orden de escritura; solo un aumento real de fecha marca postergación.
 * @param {Object} index - Resumen mutable por compromiso.
 * @param {Object} row - Evento normalizado o recién escrito en HISTORIAL.
 */
function accumulateActivity_(index,row) {
  if(!row.compromiso_id) return;
  const entry=index[row.compromiso_id]||(index[row.compromiso_id]={id:'',stateChangedAt:'',state:'',postponed:false,firstDue:'',postponementCount:0});
  entry.id=row.historial_id;
  if(row.campo==='estado' && row.valor_anterior && row.valor_nuevo && row.valor_anterior!==row.valor_nuevo) {
    entry.stateChangedAt=normalizeValue_(row.fecha_evento,'fecha_evento');
    entry.state=row.valor_nuevo;
  }
  if(row.campo==='fecha_objetivo') {
    const before=toIsoDate_(row.valor_anterior),after=toIsoDate_(row.valor_nuevo);
    if(!entry.firstDue)entry.firstDue=before||after;
    if(before && after && after>before){entry.postponed=true;entry.postponementCount++;}
  }
}

/**
 * Extiende un índice existente después de añadir eventos, sin volver a recorrer HISTORIAL.
 * @param {Array<Object>} records - Eventos añadidos en orden de escritura.
 * @param {Object|null} previous - Índice anterior; null implica reconstrucción posterior.
 */
function extendActivityIndex_(records,previous) {
  if(!previous) return;
  records.forEach(row=>accumulateActivity_(previous,row));
  optionalCachePut_(performanceCacheKey_('activity-v3',APP.SHEETS.history),previous);
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
    day:businessToday_(),
    window:window});
}
