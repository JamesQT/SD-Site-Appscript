/** Identidad y autorización; nunca confía en los permisos enviados por el navegador. */

/**
 * Resuelve usuario y compromiso, rechazando registros inaccesibles o inactivos.
 * @param {*} commitmentId - ID del compromiso.
 * @returns {Object} Actor, compromiso y relaciones usados para validar el acceso.
 */
function authorizedCommitment_(commitmentId) {
  const actor = requireUser_();
  const c = findById_(APP.SHEETS.commitments, 'compromiso_id', commitmentId);
  if (!c || !isTrue_(c.activo)) throw appError_('VALIDATION','No se encontró el compromiso.');
  if (actor.rol_sistema === 'ADMIN' || c.owner_id === actor.usuario_id) return { actor: actor, commitment: c };
  const collaborations = readTable_(APP.SHEETS.collaborators).filter(r => isTrue_(r.activo));
  if (collaborations.some(r => r.compromiso_id === commitmentId && r.usuario_id === actor.usuario_id)) return { actor: actor, commitment: c };
  const approvals = readTable_(APP.SHEETS.approvals).filter(r => r.compromiso_id === commitmentId);
  if (!canViewCommitment_(c, actor, collaborations, approvals, activeDelegations_())) throw appError_('FORBIDDEN','No tienes acceso a este compromiso.');
  return { actor: actor, commitment: c };
}

/**
 * Identifica al usuario por el correo de Google y exige un registro activo en USUARIOS.
 * @returns {Object} Fila activa del usuario autenticado.
 */
function requireUser_() {
  if(readContext_ && readContext_.viewActor)return readContext_.viewActor;
  return actualUser_();
}

/** Identifica la cuenta real de Google sin aplicar la vista elegida para esta petición. */
function actualUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw appError_('AUTH','Google no devolvió tu correo. Revisa la implementación de la app web y ejecútala con la identidad del usuario que accede.');
  const user = readTable_(APP.SHEETS.users).find(r => String(r.correo_corporativo || '').trim().toLowerCase() === email && isTrue_(r.activo));
  if (!user) throw appError_('AUTH','Tu correo no está activo en USUARIOS. Actualiza esa pestaña con tu correo corporativo antes de usar la app.');
  return user;
}

/**
 * Ejecuta una operación con un perfil reducido, sin cambiar identidad ni rol en Sheets.
 * @param {string} name - Operación pública incluida en la lista permitida.
 * @param {Array<*>} args - Argumentos originales de la operación.
 * @param {string} role - Perfil de vista ADMIN o RESPONSABLE.
 * @returns {*} Respuesta de la operación autorizada para el perfil efectivo.
 */
function runWithProfile(name,args,role) {
  return withReadContext_('profile:'+name,function(){
    const actor=actualUser_();
    if(actor.rol_sistema!=='ADMIN')throw appError_('FORBIDDEN','Solo un administrador puede cambiar su perfil de vista.');
    if(!['ADMIN','RESPONSABLE'].includes(role))throw appError_('VALIDATION','Perfil de vista inválido.');
    const operations={getAppData:getAppData,syncAppData:syncAppData,getCommitmentActivity:getCommitmentActivity,getAdminData:getAdminData,createCommitment:createCommitment,updateCommitment:updateCommitment,submitEvidence:submitEvidence,decideApproval:decideApproval,reassignCommitment:reassignCommitment,cancelCommitment:cancelCommitment,addCommitmentComment:addCommitmentComment,saveAdminRecord:saveAdminRecord,initializeFeatures:initializeFeatures,saveAutomationSettings:saveAutomationSettings,runOperationsNow:runOperationsNow,retryNotification:retryNotification,saveCommitmentChecklist:saveCommitmentChecklist};
    if(!Object.prototype.hasOwnProperty.call(operations,name)||!Array.isArray(args)||args.length>4)throw appError_('VALIDATION','Operación de vista no permitida.');
    const previous=readContext_.viewActor;
    readContext_.viewActor=Object.assign({},actor,{rol_sistema:role});
    try {return operations[name].apply(null,args);}
    finally {readContext_.viewActor=previous;}
  });
}

/**
 * Exige que el usuario activo tenga el rol ADMIN.
 * @returns {Object} Fila activa del administrador autenticado.
 */
function requireAdmin_() {
  const user = requireUser_();
  if (user.rol_sistema !== 'ADMIN') throw appError_('FORBIDDEN','Esta acción requiere perfil ADMIN.');
  return user;
}

/**
 * Evalúa acceso por administración, responsabilidad, colaboración o aprobación vigente.
 * @param {Object} c - Registro del compromiso.
 * @param {Object} actor - Usuario autenticado por el servidor.
 * @param {Array<Object>} collaborations - Relaciones de colaboración consideradas para el acceso o resumen.
 * @param {Array<Object>} approvals - Solicitudes de aprobación consideradas por la operación.
 * @param {Array<Object>} delegations - Delegaciones activas; sus fechas y alcance se validan al usarlas.
 * @returns {boolean} El actor puede consultar el compromiso.
 */
function canViewCommitment_(c, actor, collaborations, approvals, delegations) {
  if (actor.rol_sistema === 'ADMIN' || c.owner_id === actor.usuario_id) return true;
  if (collaborations.some(x => x.compromiso_id === c.compromiso_id && x.usuario_id === actor.usuario_id)) return true;
  return approvals.some(a => a.compromiso_id === c.compromiso_id && canApprove_(a, c, actor, delegations));
}

/**
 * Comprueba si el actor puede actualizar el avance del compromiso.
 * @param {Object} c - Registro del compromiso.
 * @param {Object} actor - Usuario autenticado por el servidor.
 * @returns {boolean} El actor puede editar el avance.
 */
function canManageCommitment_(c, actor) {
  if (actor.rol_sistema === 'ADMIN' || c.owner_id === actor.usuario_id) return true;
  return readTable_(APP.SHEETS.collaborators).some(x => x.compromiso_id === c.compromiso_id && x.usuario_id === actor.usuario_id && x.rol === 'COLABORADOR' && isTrue_(x.activo));
}

/**
 * Evalúa aprobación asignada o delegada e impide aprobar el propio compromiso.
 * @param {Object} a - Registro de aprobación.
 * @param {Object} c - Registro del compromiso.
 * @param {Object} actor - Usuario autenticado por el servidor.
 * @param {Array<Object>} delegations - Delegaciones activas; sus fechas y alcance se validan al usarlas.
 * @returns {boolean} El actor puede decidir la aprobación.
 */
function canApprove_(a, c, actor, delegations) {
  if (c.owner_id === actor.usuario_id || c.nivel_aprobacion === 'NIVEL_2' && a.aprobador_asignado_id !== actor.usuario_id) return false;
  if (a.aprobador_asignado_id === actor.usuario_id) {
    if (a.delegado_por_id && a.delegado_por_id !== actor.usuario_id) {
      return c.nivel_aprobacion === 'NIVEL_1' && delegations.some(d => d.delegante_id === a.delegado_por_id && d.delegado_id === actor.usuario_id && delegationCovers_(d, c));
    }
    return true;
  }
  if (c.nivel_aprobacion !== 'NIVEL_1') return false;
  return delegations.some(d => d.delegante_id === a.aprobador_asignado_id && d.delegado_id === actor.usuario_id && delegationCovers_(d, c));
}

/**
 * Comprueba fechas inclusivas, nivel y alcance de una delegación.
 * @param {Object} d - Registro de delegación.
 * @param {Object} c - Registro del compromiso.
 * @returns {boolean} La delegación cubre el compromiso y la fecha actual.
 */
function delegationCovers_(d, c) {
  if (!isTrue_(d.activo) || d.nivel_aprobacion !== 'NIVEL_1') return false;
  const today = Utilities.formatDate(new Date(), APP.TIME_ZONE, 'yyyy-MM-dd');
  const start = toIsoDate_(d.fecha_inicio); const end = toIsoDate_(d.fecha_fin);
  if (start && today < start || end && today > end) return false;
  if (d.alcance_tipo === 'GLOBAL') return true;
  if (d.alcance_tipo === 'TIPO') return d.tipo_id === c.tipo_id;
  if (d.alcance_tipo === 'PROYECTO') return d.proyecto_id && d.proyecto_id === c.proyecto_id;
  return false;
}

/**
 * Consulta las delegaciones marcadas como activas; la vigencia se evalúa por compromiso.
 * @returns {Array<Object>} Delegaciones marcadas como activas.
 */
function activeDelegations_() { return readTable_(APP.SHEETS.delegations).filter(d => isTrue_(d.activo)); }

/**
 * Consulta los usuarios activos sin reutilizar permisos entre ejecuciones.
 * @returns {Array<Object>} Usuarios marcados como activos.
 */
function activeUsers_() { return readTable_(APP.SHEETS.users).filter(u => isTrue_(u.activo)); }
