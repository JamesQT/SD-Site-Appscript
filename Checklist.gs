/** Checklist almacenado en el compromiso; comparte autorización y versión de la fila. */

/**
 * Interpreta pasos existentes sin ocultar datos dañados en Sheets.
 * @param {Object} c - Compromiso leído desde Sheets.
 * @returns {Array<Object>} Pasos con identificador, título e indicador completado.
 */
function checklistItems_(c) {
  if (!c.checklist_json) return [];
  try {
    const items=JSON.parse(c.checklist_json);
    if(!Array.isArray(items)||items.length>40||items.some(i=>!i||typeof i.id!=='string'||typeof i.title!=='string'||typeof i.done!=='boolean')) throw new Error('Formato');
    return items;
  } catch(error) { throw appError_('CONFIGURATION','El checklist de '+c.compromiso_id+' tiene un formato inválido.'); }
}

/** Añade una columna al final sin modificar columnas, fórmulas ni filas existentes. */
function ensureChecklistColumn_() {
  const name=APP.SHEETS.commitments,headers=tableHeaders_(name);
  if(headers.includes('checklist_json'))return;
  const sheet=getSheet_(name),count=headers.length;
  if(count+1>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),1);
  sheet.getRange(1,count+1).setValue('checklist_json');
  invalidateTable_(name,true);
}

/**
 * Guarda pasos bajo bloqueo, comprobando acceso y versión antes de modificar el esquema.
 * @param {Object} input - compromiso_id, expected_version y lista completa items.
 * @returns {MutationResult} Detalle actualizado con checklist y nueva versión.
 */
function saveCommitmentChecklist(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(!canManageCommitment_(c,actor))throw appError_('FORBIDDEN','No tienes permisos para editar este checklist.');
    if(!APP.OPEN_STATUS.includes(c.estado))throw appError_('VALIDATION','El checklist solo se edita antes del envío a aprobación o cierre.');
    if(!p.expected_version)throw appError_('VALIDATION','Falta la versión del compromiso.');
    assertExpectedVersion_(c,p.expected_version);
    if(!Array.isArray(p.items)||p.items.length>40)throw appError_('VALIDATION','El checklist admite hasta 40 pasos.');
    const seen=new Set();
    const items=p.items.map(i=>{
      if(!i||typeof i.id!=='string'||!/^[0-9a-f-]{36}$/i.test(i.id)||seen.has(i.id)||typeof i.done!=='boolean')throw appError_('VALIDATION','Paso de checklist inválido o duplicado.');
      seen.add(i.id);return {id:i.id,title:text_(i.title,'Cada paso necesita un título.',160),done:i.done};
    });
    checklistItems_(c);
    const value=JSON.stringify(items);
    if(value===JSON.stringify(checklistItems_(c)))return mutationResult_(c.compromiso_id,actor);
    ensureChecklistColumn_();
    patchRecord_(APP.SHEETS.commitments,c._row,{checklist_json:value,updated_at:new Date(),ultima_actualizacion:new Date(),updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,'CHECKLIST','checklist_json',c.checklist_json||'[]',value,'Checklist actualizado: '+items.filter(i=>i.done).length+'/'+items.length+' pasos.');
    return mutationResult_(c.compromiso_id,actor);
  });
}
