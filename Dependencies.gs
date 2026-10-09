/** Dependencias de cierre, con autorización por referencia y detección de ciclos. */

/**
 * Lee IDs de requisitos sin ocultar un JSON dañado.
 * @param {Object} commitment - Fila del compromiso.
 * @returns {Array<string>} IDs únicos de requisitos previos.
 */
function dependencyIds_(commitment) {
  if(!commitment.dependencias_json)return [];
  try {
    const ids=JSON.parse(commitment.dependencias_json);
    if(!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=='string'||!id||id.length>180)||new Set(ids).size!==ids.length)throw new Error('Formato');
    return ids;
  } catch(error){throw appError_('CONFIGURATION','Dependencias dañadas. Solicita revisión del registro.');}
}

/**
 * Proyecta requisitos sin revelar nombres, IDs ni estados de compromisos inaccesibles.
 * @param {Object} commitment - Compromiso autorizado.
 * @param {Object} actor - Actor efectivo de la petición.
 * @param {Object} context - Índices y relaciones del detalle.
 * @returns {Object} Requisitos visibles y número total de pendientes.
 */
function dependencySummary_(commitment,actor,context) {
  const items=dependencyIds_(commitment).map(id=>{
    const target=context.commitments[id],done=!!target&&isTrue_(target.activo)&&target.estado==='CERRADO';
    const visible=actor.rol_sistema==='ADMIN'||!!target&&isTrue_(target.activo)&&canViewCommitment_(target,actor,context.collaborations[id]||[],context.pendingApprovals[id]||[],context.delegations);
    return visible?{id:id,title:target?target.titulo:'Requisito eliminado',state:target?target.estado:'NO_DISPONIBLE',available:!!target&&isTrue_(target.activo),done:done}:{title:'Requisito sin acceso o no disponible',done:done};
  });
  return {items:items,pending:items.filter(item=>!item.done).length,total:items.length};
}

/**
 * Rechaza un cierre si algún requisito no está activo y cerrado.
 * @param {Object} commitment - Compromiso cuya transición de cierre se valida.
 */
function assertDependenciesClosed_(commitment) {
  const ids=dependencyIds_(commitment);if(!ids.length)return;
  const index=indexBy_(readTable_(APP.SHEETS.commitments),'compromiso_id');
  if(ids.some(id=>!index[id]||!isTrue_(index[id].activo)||index[id].estado!=='CERRADO'))throw appError_('VALIDATION','Hay dependencias pendientes. Resuélvelas antes de enviar o aprobar el cierre.');
}

/**
 * Guarda hasta 20 requisitos, con versión, permiso de edición y grafo acíclico.
 * @param {Object} input - compromiso_id, expected_version y dependencies como lista de IDs.
 * @returns {MutationResult} Detalle autorizado actualizado.
 */
function saveCommitmentDependencies(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(!canManageCommitment_(c,actor))throw appError_('FORBIDDEN','No puedes editar las dependencias de este compromiso.');
    if(!APP.OPEN_STATUS.includes(c.estado))throw appError_('VALIDATION','Las dependencias solo se editan antes del envío a aprobación.');
    if(!p.expected_version)throw appError_('VALIDATION','Falta la versión del compromiso.');
    assertExpectedVersion_(c,p.expected_version);
    const ids=p.dependencies;
    if(!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=='string'||!id||id.length>180)||new Set(ids).size!==ids.length)throw appError_('VALIDATION','Selecciona hasta 20 requisitos sin duplicados.');
    const all=readTable_(APP.SHEETS.commitments),index=indexBy_(all,'compromiso_id');
    const collaborations=readTable_(APP.SHEETS.collaborators).filter(r=>isTrue_(r.activo)),approvals=readTable_(APP.SHEETS.approvals).filter(a=>a.estado==='PENDIENTE'),delegations=activeDelegations_();
    ids.forEach(id=>{
      if(id===c.compromiso_id)throw appError_('VALIDATION','Un compromiso no puede depender de sí mismo.');
      const target=index[id];
      if(!target||!isTrue_(target.activo)||!canViewCommitment_(target,actor,collaborations,approvals,delegations))throw appError_('FORBIDDEN','No puedes usar uno de los requisitos seleccionados.');
    });
    // Recorrido iterativo: detecta el ciclo que introduciría cada arista, sin límite de recursión.
    const visited=new Set(),queue=[...ids];
    while(queue.length) {
      const id=queue.pop();if(id===c.compromiso_id)throw appError_('VALIDATION','La dependencia crearía un ciclo.');
      if(visited.has(id))continue;visited.add(id);
      if(index[id])queue.push(...dependencyIds_(index[id]));
    }
    const old=dependencyIds_(c),value=JSON.stringify(ids);
    if(value===JSON.stringify(old))return mutationResult_(c.compromiso_id,actor);
    ensureCommitmentColumns_(['dependencias_json']);
    patchRecord_(APP.SHEETS.commitments,c._row,{dependencias_json:value,ultima_actualizacion:new Date(),updated_at:new Date(),updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,'DEPENDENCIES','dependencias_json',old.length,ids.length,'Requisitos de cierre actualizados.');
    return mutationResult_(c.compromiso_id,actor);
  });
}

/**
 * Amplía columnas al final sin reemplazar las existentes ni sus fórmulas.
 * @param {Array<string>} names - Nombres de columnas internas requeridas.
 */
function ensureCommitmentColumns_(names) {
  const sheet=getSheet_(APP.SHEETS.commitments),headers=tableHeaders_(APP.SHEETS.commitments),missing=names.filter(name=>!headers.includes(name));
  if(!missing.length)return;
  if(headers.length+missing.length>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),headers.length+missing.length-sheet.getMaxColumns());
  sheet.getRange(1,headers.length+1,1,missing.length).setValues([missing]);invalidateTable_(APP.SHEETS.commitments,true);
}
