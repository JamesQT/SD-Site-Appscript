/** Detección de ediciones humanas y cambios estructurales en el Sheet configurado. */

/**
 * Instala dos disparadores idempotentes desde la cuenta del ADMIN que prepara las tablas.
 * Otro ADMIN puede preparar tablas sin duplicar los disparadores del propietario activo.
 * @param {Object} actor - Administrador autenticado.
 * @returns {Object} Identidad de los disparadores y su propietario.
 */
function installChangeTracking_(actor) {
  const properties=PropertiesService.getScriptProperties(),sheetId=spreadsheetId_();
  const previous=JSON.parse(properties.getProperty('SD_CHANGE_TRACKING') || '{}');
  if(previous.sheetId===sheetId && previous.ownerId && previous.ownerId!==actor.usuario_id) {
    const owner=findById_(APP.SHEETS.users,'usuario_id',previous.ownerId);
    if(owner && isTrue_(owner.activo) && owner.rol_sistema==='ADMIN') return previous;
  }
  const owned=ScriptApp.getProjectTriggers(),next={ownerId:actor.usuario_id,sheetId:sheetId};
  [['trackSheetEdit_','editTriggerId','onEdit'],['trackSheetChange_','changeTriggerId','onChange']].forEach(([name,key,method])=>{
    const existing=owned.find(t=>t.getHandlerFunction()===name && t.getUniqueId()===previous[key] && previous.sheetId===sheetId);
    const trigger=existing || ScriptApp.newTrigger(name).forSpreadsheet(sheetId)[method]().create();
    next[key]=trigger.getUniqueId();
    owned.filter(t=>t.getHandlerFunction()===name && t.getUniqueId()!==next[key]).forEach(t=>ScriptApp.deleteTrigger(t));
  });
  properties.setProperty('SD_CHANGE_TRACKING',JSON.stringify(next));
  return next;
}

/**
 * Verifica origen e ID del evento instalado antes de invalidar revisiones.
 * @param {Object} event - Evento real del disparador de Sheets.
 * @param {string} key - editTriggerId o changeTriggerId.
 * @returns {boolean} Verdadero solo para el disparador configurado.
 */
function isTrackedSheetEvent_(event,key) {
  if(!event || !event.source || !event.source.getId) return false;
  const config=JSON.parse(PropertiesService.getScriptProperties().getProperty('SD_CHANGE_TRACKING') || '{}');
  return config.sheetId===spreadsheetId_() && event.source.getId()===config.sheetId && String(event.triggerUid)===String(config[key]);
}

/**
 * Invalida la tabla editada manualmente; las escrituras de scripts tienen su propia invalidación.
 * @param {Object} event - Evento con range, source y triggerUid de Google Sheets.
 */
function trackSheetEdit_(event) {
  if(!isTrackedSheetEvent_(event,'editTriggerId') || !event.range) return;
  const table=event.range.getSheet().getName();
  if(![...Object.values(APP.SHEETS),'NOTIFICACIONES'].includes(table)) return;
  return withLock_(function(){markTableChanged_(table);});
}

/**
 * Invalida índices y catálogos tras cambios estructurales; EDIT lo atiende el disparador de edición.
 * @param {Object} event - Evento de cambio estructural instalado en Sheets.
 */
function trackSheetChange_(event) {
  if(!isTrackedSheetEvent_(event,'changeTriggerId') || event.changeType==='EDIT') return;
  return withLock_(function(){markTableChanged_('*');});
}
