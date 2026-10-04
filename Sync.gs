/** Instantáneas autorizadas, versiones y sincronización incremental. */

// Índices de presentación que se reconstruyen en cada contexto.
let catalogIndexes_;

/**
 * Construye la instantánea inicial filtrada por los permisos del usuario activo.
 * @returns {AppSnapshot} Resultado serializable para google.script.run.
 */
function getAppData() {
  return withReadContext_('getAppData', function () {
  const actor = requireUser_();
  const dataVersion=syncDataVersion_(actor);
  const all = readTable_(APP.SHEETS.commitments).filter(r => isTrue_(r.activo));
  const users = activeUsers_();
  const userById = indexBy_(readTable_(APP.SHEETS.users), 'usuario_id');
  const collaborations = readTable_(APP.SHEETS.collaborators).filter(r => isTrue_(r.activo));
  const allApprovals = readTable_(APP.SHEETS.approvals);
  const approvals = allApprovals.filter(r => r.estado === 'PENDIENTE');
  const delegations = activeDelegations_();
  const visible = all.filter(c => canViewCommitment_(c, actor, collaborations, approvals, delegations));
  const myTasks = visible.filter(c => c.owner_id === actor.usuario_id || collaborations.some(x =>
    x.compromiso_id === c.compromiso_id && x.usuario_id === actor.usuario_id && x.rol === 'COLABORADOR'));
  const myApprovals = approvals.filter(a => {
    const c = all.find(x => x.compromiso_id === a.compromiso_id);
    return c && canApprove_(a, c, actor, delegations);
  });
  const context = detailContext_(readTable_(APP.SHEETS.users), collaborations, allApprovals, delegations);
  const details = visible.map(c => synchronizedDetail_(c, actor, context));
  const snapshot = {
    details: details,
    user: { id: actor.usuario_id, name: actor.nombre, email: actor.correo_corporativo, role: actor.rol_sistema },
    isAdmin: actor.rol_sistema === 'ADMIN',
    commitments: visible.map(c => decorateCommitment_(c, userById)),
    myTasks: myTasks.map(c => decorateCommitment_(c, userById)),
    people: users.map(u => ({ usuario_id: u.usuario_id, nombre: u.nombre, rol_sistema: u.rol_sistema })),
    approvals: myApprovals.map(a => {
      const c = all.find(x => x.compromiso_id === a.compromiso_id);
      return Object.assign({}, a, { compromiso: decorateCommitment_(c, userById) });
    }),
    types: readTable_(APP.SHEETS.types).filter(r => isTrue_(r.activo)),
    projects: readTable_(APP.SHEETS.projects).filter(r => isTrue_(r.activo)),
    users: actor.rol_sistema === 'ADMIN' ? users : [],
    recurrences: actor.rol_sistema === 'ADMIN' ? readTable_(APP.SHEETS.recurrences).filter(r => isTrue_(r.activo)) : [],
    team: actor.rol_sistema === 'ADMIN' ? buildTeamSummary_(all, users, approvals, collaborations) : [],
    counts: buildCounts_(visible, myTasks, myApprovals)
  };
  snapshot.metadataVersion = hashValue_(snapshotMetadata_(snapshot));
  snapshot.dataVersion=dataVersion;
  return snapshot;

  });
}

/**
 * Calcula indicadores de compromisos, vencimientos, tareas y aprobaciones.
 * @param {Array<Object>} visible - Compromisos que el usuario puede consultar.
 * @param {Array<Object>} tasks - Compromisos propios o con colaboración activa.
 * @param {Array<Object>} approvals - Solicitudes de aprobación consideradas por la operación.
 * @returns {Object} Indicadores de apertura, fechas, bloqueo y bandeja.
 */
function buildCounts_(visible, tasks, approvals) {
  const today = Utilities.formatDate(new Date(), APP.TIME_ZONE, 'yyyy-MM-dd');
  const open = visible.filter(c => APP.OPEN_STATUS.includes(c.estado));
  return {
    open: open.length,
    overdue: open.filter(c => toIsoDate_(c.fecha_objetivo) && toIsoDate_(c.fecha_objetivo) < today).length,
    dueSoon: open.filter(c => { const d=toIsoDate_(c.fecha_objetivo); return d && d >= today && d <= addDaysIso_(today, 7); }).length,
    blocked: open.filter(c => c.estado === 'BLOQUEADO').length,
    approvals: approvals.length,
    myTasks: tasks.length
  };
}

/**
 * Agrupa carga de trabajo e indicadores por usuario para la vista de equipo.
 * @param {Array<Object>} commitments - Compromisos utilizados para calcular el resumen.
 * @param {Array<Object>} users - Registros de usuarios usados para referencias y agrupación.
 * @param {Array<Object>} approvals - Solicitudes de aprobación consideradas por la operación.
 * @param {Array<Object>} collaborations - Relaciones de colaboración consideradas para el acceso o resumen.
 * @returns {Array<Object>} Resumen de trabajo por usuario.
 */
function buildTeamSummary_(commitments, users, approvals, collaborations) {
  return users.map(u => {
    const assigned = commitments.filter(c => c.owner_id === u.usuario_id && APP.OPEN_STATUS.includes(c.estado));
    const dueToday = Utilities.formatDate(new Date(), APP.TIME_ZONE, 'yyyy-MM-dd');
    return {
      id: u.usuario_id, name: u.nombre, role: u.rol_sistema,
      open: assigned.length,
      overdue: assigned.filter(c => toIsoDate_(c.fecha_objetivo) && toIsoDate_(c.fecha_objetivo) < dueToday).length,
      approvals: approvals.filter(a => a.aprobador_asignado_id === u.usuario_id).length,
      collaborations: collaborations.filter(x => x.usuario_id === u.usuario_id && isTrue_(x.activo)).length
    };
  });
}

/**
 * Añade nombres de referencias y versión del registro sin modificar la fila original.
 * @param {Object} c - Registro del compromiso.
 * @param {Object} userById - Índice de usuarios por usuario_id.
 * @returns {Object} Copia del compromiso con nombres y _version.
 */
function decorateCommitment_(c, userById) {
  if (!catalogIndexes_) catalogIndexes_ = { types: indexBy_(readTable_(APP.SHEETS.types), 'tipo_id'), projects: indexBy_(readTable_(APP.SHEETS.projects), 'proyecto_id') };
  return Object.assign({}, c, {
    owner_name: userById[c.owner_id]?.nombre || c.owner_id || '',
    approver_name: userById[c.aprobador_actual_id]?.nombre || c.aprobador_actual_id || '',
    type_name: (catalogIndexes_.types[c.tipo_id] || {}).nombre || c.tipo_id,
    _version: recordVersion_(c),
    project_name: c.proyecto_id ? ((catalogIndexes_.projects[c.proyecto_id] || {}).nombre || '') : 'Sin proyecto'
  });
}

/**
 * Ordena los campos y excluye _row para calcular versiones independientes de la posición.
 * @param {Object} row - Fila cuyo contenido se normaliza o verifica.
 * @returns {Object} Contenido ordenado sin _row.
 */
function normalizedRecord_(row) {
  const result={};Object.keys(row).filter(k=>k!=='_row').sort().forEach(k=>result[k]=normalizeValue_(row[k],k));return result;
}

/**
 * Calcula una huella SHA-256 de un valor serializable.
 * @param {*} value - Valor que se interpreta o valida.
 * @returns {string} Huella SHA-256 hexadecimal.
 */
function hashValue_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}

/**
 * Calcula la versión del contenido de una fila normalizada.
 * @param {Object} row - Fila cuyo contenido se normaliza o verifica.
 * @returns {string} Huella del contenido del registro.
 */
function recordVersion_(row) {return hashValue_(normalizedRecord_(row));}

/**
 * Rechaza un guardado si su versión esperada difiere de la fila actual.
 * @param {Object} row - Fila cuyo contenido se normaliza o verifica.
 * @param {*} version - Versión que recibió el cliente.
 */
function assertExpectedVersion_(row,version) {
  if (version && recordVersion_(row)!==version) throw appError_('CONFLICT','El compromiso cambió desde que lo abriste. Conserva tu edición y actualiza el detalle antes de volver a guardar.');
}

/**
 * Agrupa relaciones por compromiso para evitar búsquedas repetidas.
 * @param {*} rows - Colección de registros.
 * @returns {Object} Índice de arrays por compromiso_id.
 */
function groupByCommitment_(rows) {
  return rows.reduce((out,row)=>{(out[row.compromiso_id]||(out[row.compromiso_id]=[])).push(row);return out;},Object.create(null));
}

/**
 * Prepara índices compartidos de usuarios, relaciones, evidencias y última actividad.
 * @param {Array<Object>} users - Registros de usuarios usados para referencias y agrupación.
 * @param {Array<Object>} collaborations - Relaciones de colaboración consideradas para el acceso o resumen.
 * @param {Array<Object>} approvals - Solicitudes de aprobación consideradas por la operación.
 * @param {Array<Object>} delegations - Delegaciones activas; sus fechas y alcance se validan al usarlas.
 * @returns {Object} Índices compartidos de referencias y relaciones.
 */
function detailContext_(users,collaborations,approvals,delegations) {
  return {users:indexBy_(users,'usuario_id'),collaborations:groupByCommitment_(collaborations),approvals:groupByCommitment_(approvals),delegations:delegations,evidence:groupByCommitment_(readTable_(APP.SHEETS.evidence)),activity:activityIndex_()};
}

/**
 * Construye el detalle autorizado con permisos actuales y una huella de sincronización.
 * @param {Object} c - Registro del compromiso.
 * @param {Object} actor - Usuario autenticado por el servidor.
 * @param {Object} context - Índices compartidos de relaciones para construir detalles.
 * @returns {CommitmentDetail} Detalle y permisos del actor actual.
 */
function synchronizedDetail_(c,actor,context) {
  const collaborators=context.collaborations[c.compromiso_id]||[];
  const task=c.owner_id===actor.usuario_id||collaborators.some(r=>r.usuario_id===actor.usuario_id&&r.rol==='COLABORADOR');
  const admin=actor.rol_sistema==='ADMIN',open=APP.OPEN_STATUS.includes(c.estado),active=!['CERRADO','ANULADO'].includes(c.estado);
  const result={commitment:decorateCommitment_(c,context.users),collaborators:collaborators.map(r=>Object.assign({},r,{nombre:context.users[r.usuario_id]?.nombre||r.usuario_id})),approvals:(context.approvals[c.compromiso_id]||[]).map(a=>Object.assign({},a,{_version:recordVersion_(a),canDecide:a.estado==='PENDIENTE'&&c.estado==='EN_APROBACION'&&canApprove_(a,c,actor,context.delegations)})),evidence:context.evidence[c.compromiso_id]||[],isTask:task,permissions:{edit:open&&(admin||task),close:open&&(admin||c.owner_id===actor.usuario_id),reassign:active&&admin,cancel:active&&(admin||c.owner_id===actor.usuario_id)},activityVersion:context.activity[c.compromiso_id]||''};
  result._syncVersion=hashValue_(result);return result;
}

/**
 * Extrae metadatos de la instantánea excluyendo las colecciones de detalles.
 * @param {AppSnapshot} snapshot - Instantánea autorizada de la aplicación.
 * @returns {Object} Metadatos sin las colecciones de detalles ni versiones.
 */
function snapshotMetadata_(snapshot) {
  const meta={};Object.keys(snapshot).filter(k=>!['commitments','myTasks','details','metadataVersion','dataVersion'].includes(k)).forEach(k=>meta[k]=snapshot[k]);return meta;
}

/**
 * Devuelve cambios autorizados y IDs cuyo acceso se perdió desde la última instantánea.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @returns {SyncDelta} Resultado serializable para google.script.run.
 */
function syncAppData(input) {
  return withReadContext_('syncAppData',function(){
    const p=input||{},known=p.versions||{};
    if(!known||typeof known!=='object'||Array.isArray(known)||Object.keys(known).length>20000)throw appError_('VALIDATION','Solicitud de sincronización inválida.');
    const actor=requireUser_(),dataVersion=syncDataVersion_(actor);
    if(!p.force && p.dataVersion===dataVersion && typeof p.metadataVersion==='string') {
      return {details:[],removed:[],metadata:null,metadataVersion:p.metadataVersion,dataVersion:dataVersion};
    }
    // Un refresco completo revalida también catálogos e índice de actividad externos.
    readContext_.bypassCache=!!p.force || String(p.dataVersion||'').split(':')[0]!==dataVersion.split(':')[0];
    const snapshot=getAppData(),visible=new Set(snapshot.details.map(d=>d.commitment.compromiso_id));
    return {details:snapshot.details.filter(d=>known[d.commitment.compromiso_id]!==d._syncVersion),removed:Object.keys(known).filter(id=>!visible.has(id)),metadata:p.metadataVersion===snapshot.metadataVersion?null:snapshotMetadata_(snapshot),metadataVersion:snapshot.metadataVersion,dataVersion:snapshot.dataVersion};
  });
}

/**
 * Devuelve el detalle afectado o remove si el actor perdió acceso después de la operación.
 * @param {*} id - Identificador del registro.
 * @param {Object} actor - Usuario autenticado por el servidor.
 * @param {Object} extra - Datos adicionales del payload o de la respuesta.
 * @returns {MutationResult} Detalle visible o instrucción remove.
 */
function mutationResult_(id,actor,extra) {
  const c=findById_(APP.SHEETS.commitments,'compromiso_id',id);
  const collaborators=readTable_(APP.SHEETS.collaborators).filter(r=>isTrue_(r.activo));
  const approvals=readTable_(APP.SHEETS.approvals),delegations=activeDelegations_();
  const result=Object.assign({ok:true,id:id,user:{id:actor.usuario_id,name:actor.nombre,email:actor.correo_corporativo,role:actor.rol_sistema}},extra||{});
  if(!c||!isTrue_(c.activo)||!canViewCommitment_(c,actor,collaborators,approvals.filter(a=>a.estado==='PENDIENTE'),delegations))return Object.assign(result,{remove:true});
  result.detail=synchronizedDetail_(c,actor,detailContext_(readTable_(APP.SHEETS.users),collaborators,approvals,delegations));return result;
}
