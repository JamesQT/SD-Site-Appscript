/** Evidencias y decisiones de aprobación con comprobación de versiones. */

/**
 * Registra evidencia y cierra o solicita aprobación según la regla del compromiso.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function submitEvidence(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(actor.rol_sistema!=='ADMIN'&&actor.usuario_id!==c.owner_id)throw appError_('FORBIDDEN','Solo el responsable puede enviar el cierre.');
    if(!APP.OPEN_STATUS.includes(c.estado))throw appError_('VALIDATION','Este compromiso no está disponible para cierre.');
    assertExpectedVersion_(c,p.expected_version);
    assertDependenciesClosed_(c);
    const attachment=p.evidencia_id?findById_(APP.SHEETS.evidence,'evidencia_id',p.evidencia_id):null;
    if(p.evidencia_id&&(!attachment||attachment.compromiso_id!==c.compromiso_id||attachment.tipo_evidencia!=='ARCHIVO'))throw appError_('VALIDATION','Selecciona un archivo adjunto de este compromiso.');
    const url=validateUrl_(attachment?attachment.url_drive:p.url),comment=text_(p.comentario,'Agrega un comentario que explique la evidencia.',APP.MAX_TEXT),name=text_(attachment?attachment.nombre_archivo:p.nombre||'Evidencia',null,180);
    const needsApproval=isTrue_(c.requiere_aprobacion);
    if(needsApproval){requireActiveUserId_(c.aprobador_actual_id);if(c.aprobador_actual_id===c.owner_id)throw appError_('VALIDATION','Configura un aprobador distinto del responsable.');}
    const previous=readTable_(APP.SHEETS.approvals).filter(a=>a.compromiso_id===c.compromiso_id),version=previous.reduce((n,a)=>Math.max(n,Number(a.version)||0),0)+1;
    const approvalId=needsApproval?nextId_('APR'):'',now=new Date(),state=needsApproval?'EN_APROBACION':'CERRADO';
    appendRecord_(APP.SHEETS.evidence,{evidencia_id:nextId_('EVI'),compromiso_id:c.compromiso_id,aprobacion_id:approvalId,usuario_id:actor.usuario_id,fecha_subida:now,tipo_evidencia:attachment?'ARCHIVO':'ENLACE',nombre_archivo:name,drive_file_id:attachment?attachment.drive_file_id:'',url_drive:url,comentario:comment});
    if(needsApproval)appendRecord_(APP.SHEETS.approvals,{aprobacion_id:approvalId,compromiso_id:c.compromiso_id,version:version,aprobador_asignado_id:c.aprobador_actual_id,aprobador_efectivo_id:'',delegado_por_id:'',estado:'PENDIENTE',fecha_envio:now,fecha_respuesta:'',comentario:comment,created_at:now,created_by:actor.usuario_id});
    patchRecord_(APP.SHEETS.commitments,c._row,{estado:state,porcentaje_avance:100,fecha_cierre:needsApproval?'':now,ultima_actualizacion:now,updated_at:now,updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,needsApproval?'SUBMIT':'CLOSE','estado',c.estado,state,comment);
    notifyEvent_(c,needsApproval?'SUBMIT':'CLOSE',comment,needsApproval?[c.aprobador_actual_id]:[c.owner_id]);
    return mutationResult_(c.compromiso_id,actor,{approvalId:approvalId,state:state});
  });
}

/**
 * Valida actor, versiones y solicitud pendiente antes de aprobar o devolver.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function decideApproval(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{};
    if(!['APROBAR','DEVOLVER'].includes(p.decision))throw appError_('VALIDATION','Decisión no válida.');
    const a=findById_(APP.SHEETS.approvals,'aprobacion_id',p.aprobacion_id);
    if(!a||a.estado!=='PENDIENTE')throw appError_('VALIDATION','La aprobación ya fue atendida o no existe.');
    const c=editableCommitment_(a.compromiso_id);
    if(c.estado!=='EN_APROBACION')throw appError_('VALIDATION','El compromiso no está disponible para aprobación.');
    if(!canApprove_(a,c,actor,activeDelegations_()))throw appError_('FORBIDDEN','No tienes una aprobación vigente para esta solicitud.');
    assertExpectedVersion_(c,p.expected_version);
    if(p.decision==='APROBAR')assertDependenciesClosed_(c);
    if(p.approval_version&&recordVersion_(a)!==p.approval_version)throw appError_('CONFLICT','La solicitud de aprobación cambió. Actualiza la revisión.');
    const comment=text_(p.comentario||'',p.decision==='DEVOLVER'?'Escribe el motivo de devolución.':null,APP.MAX_TEXT),now=new Date(),state=p.decision==='APROBAR'?'CERRADO':'EN_CURSO';
    patchRecord_(APP.SHEETS.approvals,a._row,{estado:p.decision==='APROBAR'?'APROBADO':'DEVUELTO',aprobador_efectivo_id:actor.usuario_id,delegado_por_id:a.aprobador_asignado_id!==actor.usuario_id?a.aprobador_asignado_id:(a.delegado_por_id||''),fecha_respuesta:now,comentario:comment});
    patchRecord_(APP.SHEETS.commitments,c._row,{estado:state,porcentaje_avance:p.decision==='APROBAR'?100:99,fecha_cierre:p.decision==='APROBAR'?now:'',ultima_actualizacion:now,updated_at:now,updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,p.decision,'estado',c.estado,state,comment);notifyEvent_(c,p.decision,comment,[c.owner_id]);
    return mutationResult_(c.compromiso_id,actor,{state:state});
  });
}
