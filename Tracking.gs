/** Línea base inmutable de entrega y validación auditada de postergaciones. */

/** Añade columnas de línea base al final, preservando columnas y fórmulas existentes. */
function ensureTrackingSchema_() {
  const sheet=getSheet_(APP.SHEETS.commitments),headers=tableHeaders_(APP.SHEETS.commitments);
  const missing=['fecha_objetivo_original','fecha_original_fuente'].filter(name=>!headers.includes(name));
  if(!missing.length)return;
  const count=headers.length;
  if(count+missing.length>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),count+missing.length-sheet.getMaxColumns());
  sheet.getRange(1,count+1,1,missing.length).setValues([missing]);
  invalidateTable_(APP.SHEETS.commitments,true);
}

/**
 * Recupera la línea base registrada, la primera fecha auditada o una referencia explícita.
 * @param {Object} commitment - Fila del compromiso.
 * @param {Object} activity - Resumen del historial en orden de escritura.
 * @returns {Object} Fecha original, procedencia, días netos de retraso y número de postergaciones.
 */
function commitmentBaseline_(commitment,activity) {
  const original=toIsoDate_(commitment.fecha_objetivo_original)||activity.firstDue||toIsoDate_(commitment.fecha_objetivo);
  const source=commitment.fecha_original_fuente||(activity.firstDue?'HISTORIAL':'REFERENCIA_ACTUAL');
  const difference=(Date.parse(toIsoDate_(commitment.fecha_objetivo)+'T00:00:00Z')-Date.parse(original+'T00:00:00Z'))/86400000;
  return {originalDate:original,source:source,delayDays:Number.isFinite(difference)?Math.max(0,Math.round(difference)):null,postponementCount:activity.postponementCount||0};
}

/**
 * Exige motivo para una fecha posterior antes de cualquier escritura del compromiso.
 * @param {Object} commitment - Fila actual, ya autorizada y validada por versión.
 * @param {Object} fields - Campos validados que se modificarán.
 * @param {Array<Object>} events - Eventos pendientes de auditoría.
 * @param {Object} input - Entrada con motivo_postergacion opcional.
 */
function prepareDueChange_(commitment,fields,events,input) {
  if(!Object.prototype.hasOwnProperty.call(fields,'fecha_objetivo'))return;
  const event=events.find(e=>e.field==='fecha_objetivo');
  if(toIsoDate_(commitment.fecha_objetivo)&&toIsoDate_(fields.fecha_objetivo)>toIsoDate_(commitment.fecha_objetivo)) {
    event.detail=text_(input.motivo_postergacion,'Indica el motivo de la postergación.',APP.MAX_TEXT);
  }
  if(!commitment.fecha_objetivo_original) {
    const baseline=commitmentBaseline_(commitment,activityIndex_()[commitment.compromiso_id]||{});
    ensureTrackingSchema_();
    fields.fecha_objetivo_original=baseline.originalDate||toIsoDate_(fields.fecha_objetivo);
    fields.fecha_original_fuente=baseline.source;
  }
}
