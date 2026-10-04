/** Comentarios, paginación de actividad y auditoría de operaciones. */

/**
 * Obtiene una página de actividad, con permisos actuales y cursor de fila.
 * @param {*} commitmentId - ID del compromiso.
 * @param {*} beforeRow - Cursor exclusivo de fila para cargar actividad anterior.
 * @returns {Object} history, nextCursor y activityVersion.
 */
function getCommitmentActivity(commitmentId, beforeRow) {
  return withReadContext_('getCommitmentActivity', function () {
    authorizedCommitment_(commitmentId);
    const cursor = beforeRow == null ? null : Number(beforeRow);
    if (cursor !== null && (!Number.isInteger(cursor) || cursor < 2)) throw appError_('VALIDATION','El cursor de historial no es válido.');
    const users = indexBy_(readTable_(APP.SHEETS.users), 'usuario_id');
    const all = readTable_(APP.SHEETS.history).filter(r => r.compromiso_id === commitmentId).reverse();
    const rows = all.filter(r => cursor === null || r._row < cursor);
    const page = rows.slice(0, APP.ACTIVITY_PAGE_SIZE);
    return { history: page.map(r => Object.assign({}, r, { usuario_nombre: users[r.usuario_id]?.nombre || r.usuario_id })), nextCursor: rows.length > page.length ? page[page.length - 1]._row : null, activityVersion: all.length ? all[0].historial_id : '' };
  });
}

/**
 * Publica un comentario autorizado y evita duplicarlo al repetir request_id.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {MutationResult} Resultado serializable para google.script.run.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 */
function addCommitmentComment(input) {
  return withLock_(function () {
    const actor=requireUser_(),p=input||{},c=findById_(APP.SHEETS.commitments,'compromiso_id',p.compromiso_id);
    if (!c||!isTrue_(c.activo)||!canViewCommitment_(c,actor,readTable_(APP.SHEETS.collaborators).filter(r=>isTrue_(r.activo)),readTable_(APP.SHEETS.approvals),activeDelegations_())) throw appError_('FORBIDDEN','No tienes acceso al compromiso.');
    const comment=text_(p.comentario,'Escribe un comentario.',APP.MAX_TEXT);
    const eventId=requestRecordId_('CMT',p.request_id);
    const previous=findById_(APP.SHEETS.history,'historial_id',eventId);
    if(previous) {
      if(previous.compromiso_id!==c.compromiso_id || previous.usuario_id!==actor.usuario_id) throw appError_('VALIDATION','El identificador de comentario pertenece a otra operación.');
      return mutationResult_(c.compromiso_id,actor,{comment:previous});
    }
    appendRecord_(APP.SHEETS.history,{historial_id:eventId,compromiso_id:c.compromiso_id,usuario_id:actor.usuario_id,fecha_evento:new Date(),accion:'COMMENT',campo:'',valor_anterior:'',valor_nuevo:'',detalle:comment});
    return mutationResult_(c.compromiso_id,actor,{comment:findById_(APP.SHEETS.history,'historial_id',eventId)});
  });
}

/**
 * Registra un evento de auditoría usando el escritor agrupado del historial.
 * @param {*} commitmentId - ID del compromiso.
 * @param {*} userId - ID del usuario que origina el evento.
 * @param {string} action - Operación o evento que se ejecutará o auditará.
 * @param {*} field - Nombre de columna o definición de campo del formulario, según la función.
 * @param {*} oldValue - Valor anterior que se registrará en auditoría.
 * @param {*} newValue - Valor nuevo que se registrará en auditoría.
 * @param {*} detail - Detalle autorizado o texto explicativo, según la función.
 */
function logEvent_(commitmentId, userId, action, field, oldValue, newValue, detail) {
  logEvents_([{id:commitmentId,user:userId,action:action,field:field,old:oldValue,value:newValue,detail:detail}]);
}

/**
 * Persiste un bloque de auditoría con IDs únicos y metadatos de cada evento.
 * @param {Array<Object>} events - Eventos de auditoría con id, user, action, field, old, value y detail.
 */
function logEvents_(events) {
  appendRecords_(APP.SHEETS.history,events.map(e=>({historial_id:nextId_('HIS'),compromiso_id:e.id||'',fecha_evento:new Date(),usuario_id:e.user,accion:e.action,campo:e.field||'',valor_anterior:e.old==null?'':String(e.old),valor_nuevo:e.value==null?'':String(e.value),detalle:e.detail||''})));
}
