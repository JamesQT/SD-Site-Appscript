/** Reglas y operaciones del ciclo de vida del compromiso. */

/**
 * Consulta un compromiso y sus relaciones después de comprobar el acceso actual.
 * @param {*} commitmentId - ID del compromiso.
 * @returns {Object} Compromiso y relaciones autorizadas.
 */
function getCommitmentDetail(commitmentId) {
  return withReadContext_('getCommitmentDetail', function () {
    const access = authorizedCommitment_(commitmentId);
    const c = access.commitment;
    const activity=activityIndex_()[c.compromiso_id]||{};
    const userById = indexBy_(readTable_(APP.SHEETS.users), 'usuario_id');
    return {
      commitment: decorateCommitment_(c, userById),
      boardTiming:boardTiming_(c,activity),baseline:commitmentBaseline_(c,activity),
      collaborators: readTable_(APP.SHEETS.collaborators).filter(r => isTrue_(r.activo) && r.compromiso_id === commitmentId).map(r => Object.assign({}, r, { nombre: userById[r.usuario_id]?.nombre || r.usuario_id })),
      approvals: readTable_(APP.SHEETS.approvals).filter(r => r.compromiso_id === commitmentId),
      evidence: readTable_(APP.SHEETS.evidence).filter(r => r.compromiso_id === commitmentId)
    };
  });
}

/**
 * Crea un compromiso bajo bloqueo y reutiliza el resultado de un request_id repetido.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function createCommitment(input) {
  return withLock_(function () {
    const actor = requireUser_();
    const p = input || {};
    const title = text_(p.titulo, 'El título es obligatorio.', 160);
    const description = text_(p.descripcion || '', null, APP.MAX_TEXT);
    const type = findById_(APP.SHEETS.types, 'tipo_id', p.tipo_id);
    if (!type || !isTrue_(type.activo)) throw appError_('VALIDATION','Selecciona un tipo de compromiso activo.');
    const ownerId = actor.rol_sistema === 'ADMIN' ? String(p.owner_id || '') : actor.usuario_id;
    const owner = findById_(APP.SHEETS.users, 'usuario_id', ownerId);
    if (!owner || !isTrue_(owner.activo)) throw appError_('VALIDATION','Selecciona un responsable activo.');
    const approver = findById_(APP.SHEETS.users, 'usuario_id', p.aprobador_id);
    if (isTrue_(type.requiere_aprobacion) && (!approver || !isTrue_(approver.activo))) throw appError_('VALIDATION','Selecciona un aprobador activo.');
    if (isTrue_(type.requiere_aprobacion) && approver.usuario_id === ownerId) throw appError_('VALIDATION','El responsable no puede ser su propio aprobador.');
    const level = p.nivel_aprobacion === 'NIVEL_2' ? 'NIVEL_2' : 'NIVEL_1';
    const due = parseDate_(p.fecha_objetivo, 'La fecha objetivo es obligatoria.');
    const projectId = String(p.proyecto_id || '');
    if (projectId) requireActiveReference_('projects', 'proyecto_id', projectId);
    const requestId = text_(p.request_id, 'Falta el identificador de la solicitud.', 100);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw appError_('VALIDATION','El identificador de solicitud no es válido.');
    const id = 'COM-' + requestId.toUpperCase();
    const previous = findById_(APP.SHEETS.commitments, 'compromiso_id', id);
    if (previous) {
      if (previous.creado_por !== actor.usuario_id) throw appError_('VALIDATION','La solicitud pertenece a otro usuario.');
      return mutationResult_(id, actor);
    }
    const now = new Date();
    const row = {
      compromiso_id: id, titulo: title, descripcion: description, tipo_id: type.tipo_id,
      subtipo: text_(p.subtipo || '', null, 120), proyecto_id: projectId,
      recurrencia_id: '', criticidad: APP.CRITICALITY.includes(p.criticidad) ? p.criticidad : 'MEDIA',
      estado: 'PENDIENTE', fecha_creacion: now, fecha_inicio: '', fecha_objetivo: due,
      fecha_cierre: '', porcentaje_avance: 0, owner_id: ownerId, aprobador_actual_id: approver ? approver.usuario_id : '',
      nivel_aprobacion: level, requiere_aprobacion: isTrue_(type.requiere_aprobacion),
      ultima_actualizacion: now, creado_por: actor.usuario_id, created_at: now,
      updated_at: now, updated_by: actor.usuario_id, activo: true
    };
    ensureTrackingSchema_();
    row.fecha_objetivo_original=due;row.fecha_original_fuente='CREACION';
    appendRecord_(APP.SHEETS.commitments, row);
    logEvent_(id, actor.usuario_id, 'CREATE', '', '', 'PENDIENTE', 'Compromiso creado.');
    notifyEvent_(row, 'ASSIGN', description, [ownerId]);
    return mutationResult_(id, actor);
  });
}

/**
 * Obtiene un compromiso activo para una operación; el llamador valida permisos.
 * @param {*} id - Identificador del registro.
 * @returns {Object} Compromiso activo; el llamador verifica autorización.
 */
function editableCommitment_(id) {
  const c=findById_(APP.SHEETS.commitments,'compromiso_id',id);
  if (!c||!isTrue_(c.activo)||['CERRADO','ANULADO'].includes(c.estado)) throw appError_('VALIDATION','El compromiso debe estar activo y abierto.');
  return c;
}

/**
 * Actualiza los metadatos de modificación del compromiso.
 * @param {Object} c - Registro del compromiso.
 * @param {*} userId - ID del usuario que origina el evento.
 */
function touchCommitment_(c,userId) {
  const now=new Date();
  [['updated_at',now],['ultima_actualizacion',now],['updated_by',userId]].forEach(([key,value])=>setField_(APP.SHEETS.commitments,c._row,key,value));
}

/**
 * Valida permisos, estado y versión; guarda solo los campos editables modificados.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function updateCommitment(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(!canManageCommitment_(c,actor))throw appError_('FORBIDDEN','No tienes permisos para actualizar este compromiso.');
    if(!APP.OPEN_STATUS.includes(c.estado))throw appError_('VALIDATION','Solo se actualizan compromisos abiertos.');
    assertExpectedVersion_(c,p.expected_version);
    const changes=p.changes||{estado:p.estado||c.estado,porcentaje_avance:p.porcentaje_avance==null?c.porcentaje_avance:p.porcentaje_avance,descripcion:p.descripcion==null?c.descripcion:p.descripcion,fecha_objetivo:p.fecha_objetivo||c.fecha_objetivo};
    if(typeof changes!=='object'||Array.isArray(changes))throw appError_('VALIDATION','Cambios inválidos.');
    const fields={},events=[];
    Object.keys(changes).forEach(key=>{
      let value=changes[key];
      if(!APP.EDITABLE_FIELDS.includes(key))throw appError_('VALIDATION','Campo no editable: '+key);
      if(key==='estado'&&!APP.OPEN_STATUS.includes(value))throw appError_('VALIDATION','Estado no válido.');
      if(key==='porcentaje_avance'){value=Number(value);if(!Number.isFinite(value)||value<0||value>99)throw appError_('VALIDATION','El avance debe estar entre 0 y 99.');}
      if(key==='descripcion')value=text_(value||'',null,APP.MAX_TEXT);
      if(key==='fecha_objetivo')value=parseDate_(value,'La fecha objetivo no es válida.');
      if(String(normalizeValue_(value,key))!==String(c[key])){fields[key]=value;events.push({id:c.compromiso_id,user:actor.usuario_id,action:'UPDATE',field:key,old:c[key],value:normalizeValue_(value,key),detail:'Actualización desde SD Control.'});}
    });
    prepareDueChange_(c,fields,events,p);
    if(events.length){Object.assign(fields,{ultima_actualizacion:new Date(),updated_at:new Date(),updated_by:actor.usuario_id});patchRecord_(APP.SHEETS.commitments,c._row,fields);logEvents_(events);}
    return mutationResult_(c.compromiso_id,actor);
  });
}

/**
 * Reasigna responsable y aprobador con motivo y auditoría; exige ADMIN.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function reassignCommitment(input) {
  return withLock_(function(){
    const actor=requireAdmin_(),p=input||{},c=editableCommitment_(p.compromiso_id);assertExpectedVersion_(c,p.expected_version);
    requireActiveUserId_(p.owner_id);const approver=isTrue_(c.requiere_aprobacion)?p.aprobador_id:'';
    if(approver){requireActiveUserId_(approver);if(approver===p.owner_id)throw appError_('VALIDATION','El responsable y el aprobador deben ser distintos.');}
    else if(isTrue_(c.requiere_aprobacion))throw appError_('VALIDATION','Selecciona un aprobador activo.');
    const reason=text_(p.motivo,'Indica el motivo de la reasignación.',APP.MAX_TEXT),pending=readTable_(APP.SHEETS.approvals).filter(a=>a.compromiso_id===c.compromiso_id&&a.estado==='PENDIENTE');
    pending.forEach(a=>patchRecord_(APP.SHEETS.approvals,a._row,{aprobador_asignado_id:approver,delegado_por_id:''}));
    patchRecord_(APP.SHEETS.commitments,c._row,{owner_id:p.owner_id,aprobador_actual_id:approver,updated_at:new Date(),ultima_actualizacion:new Date(),updated_by:actor.usuario_id});
    logEvents_([['owner_id',p.owner_id],['aprobador_actual_id',approver]].filter(([key,value])=>c[key]!==value).map(([key,value])=>({id:c.compromiso_id,user:actor.usuario_id,action:'REASSIGN',field:key,old:c[key],value:value,detail:reason})));
    notifyEvent_(Object.assign({},c,{owner_id:p.owner_id,aprobador_actual_id:approver}),'REASSIGN',reason,pending.length?[p.owner_id,approver]:[p.owner_id]);return mutationResult_(c.compromiso_id,actor);
  });
}

/**
 * Anula el compromiso y sus aprobaciones pendientes, conservando datos y auditoría.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function cancelCommitment(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(actor.rol_sistema!=='ADMIN'&&actor.usuario_id!==c.owner_id)throw appError_('FORBIDDEN','Solo el responsable o administrador puede anular.');
    assertExpectedVersion_(c,p.expected_version);const reason=text_(p.motivo,'Indica el motivo de anulación.',APP.MAX_TEXT);
    readTable_(APP.SHEETS.approvals).filter(a=>a.compromiso_id===c.compromiso_id&&a.estado==='PENDIENTE').forEach(a=>patchRecord_(APP.SHEETS.approvals,a._row,{estado:'ANULADO',fecha_respuesta:new Date(),comentario:reason}));
    patchRecord_(APP.SHEETS.commitments,c._row,{estado:'ANULADO',updated_at:new Date(),ultima_actualizacion:new Date(),updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,'CANCEL','estado',c.estado,'ANULADO',reason);notifyEvent_(c,'CANCEL',reason,[c.owner_id,c.aprobador_actual_id]);return mutationResult_(c.compromiso_id,actor);
  });
}
