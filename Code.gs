/** SD Control · Solution Development
 * MVP connected to the Google Sheet data model.
 * Update user email addresses in USUARIOS before sharing the web app.
 */
const APP = Object.freeze({
  SPREADSHEET_ID: '19l9cD37IBacGwCV33Wz1hpydMFoI8PBhgVGF0UzX2jM',
  TIME_ZONE: 'America/Lima',
  SHEETS: {
    users: 'USUARIOS', commitments: 'COMPROMISOS', collaborators: 'COMPROMISO_USUARIO',
    approvals: 'APROBACIONES', delegations: 'DELEGACIONES', evidence: 'EVIDENCIAS',
    history: 'HISTORIAL', recurrences: 'RECURRENCIAS', types: 'TIPOS_COMPROMISO',
    projects: 'PROYECTOS', catalogs: 'CATALOGOS'
  },
  STATUS: ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO', 'EN_APROBACION', 'CERRADO', 'ANULADO'],
  OPEN_STATUS: ['PENDIENTE', 'EN_CURSO', 'BLOQUEADO'],
  MAX_TEXT: 2000
});

function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('SD Control — Solution Development');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/** Initial payload for the web app. */
function getAppData() {
  return withReadContext_('getAppData', function () {
  const actor = requireUser_();
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
  return snapshot;

  });
}

/** Detail view. Access is checked again on the server. */
function getCommitmentDetail(commitmentId) {
  return withReadContext_('getCommitmentDetail', function () {
    const access = authorizedCommitment_(commitmentId);
    const c = access.commitment;
    const userById = indexBy_(readTable_(APP.SHEETS.users), 'usuario_id');
    return {
      commitment: decorateCommitment_(c, userById),
      collaborators: readTable_(APP.SHEETS.collaborators).filter(r => isTrue_(r.activo) && r.compromiso_id === commitmentId).map(r => Object.assign({}, r, { nombre: userById[r.usuario_id]?.nombre || r.usuario_id })),
      approvals: readTable_(APP.SHEETS.approvals).filter(r => r.compromiso_id === commitmentId),
      evidence: readTable_(APP.SHEETS.evidence).filter(r => r.compromiso_id === commitmentId)
    };
  });
}

/** Activity is independent of the main detail, with fresh authorization and bounded payloads. */
function getCommitmentActivity(commitmentId, beforeRow) {
  return withReadContext_('getCommitmentActivity', function () {
    authorizedCommitment_(commitmentId);
    const cursor = beforeRow == null ? null : Number(beforeRow);
    if (cursor !== null && (!Number.isInteger(cursor) || cursor < 2)) throw new Error('El cursor de historial no es válido.');
    const users = indexBy_(readTable_(APP.SHEETS.users), 'usuario_id');
    const all = readTable_(APP.SHEETS.history).filter(r => r.compromiso_id === commitmentId).reverse();
    const rows = all.filter(r => cursor === null || r._row < cursor);
    const page = rows.slice(0, 40);
    return { history: page.map(r => Object.assign({}, r, { usuario_nombre: users[r.usuario_id]?.nombre || r.usuario_id })), nextCursor: rows.length > page.length ? page[page.length - 1]._row : null, activityVersion: all.length ? all[0].historial_id : '' };
  });
}

function authorizedCommitment_(commitmentId) {
  const actor = requireUser_();
  const c = findById_(APP.SHEETS.commitments, 'compromiso_id', commitmentId);
  if (!c || !isTrue_(c.activo)) throw new Error('No se encontró el compromiso.');
  if (actor.rol_sistema === 'ADMIN' || c.owner_id === actor.usuario_id) return { actor: actor, commitment: c };
  const collaborations = readTable_(APP.SHEETS.collaborators).filter(r => isTrue_(r.activo));
  if (collaborations.some(r => r.compromiso_id === commitmentId && r.usuario_id === actor.usuario_id)) return { actor: actor, commitment: c };
  const approvals = readTable_(APP.SHEETS.approvals).filter(r => r.compromiso_id === commitmentId);
  if (!canViewCommitment_(c, actor, collaborations, approvals, activeDelegations_())) throw new Error('No tienes acceso a este compromiso.');
  return { actor: actor, commitment: c };
}

/** Admin-only read for setup tables. */
function getAdminData() {
  return withReadContext_('getAdminData', function () {
  const actor = requireAdmin_();
  return {
    users: readTable_(APP.SHEETS.users), types: readTable_(APP.SHEETS.types),
    projects: readTable_(APP.SHEETS.projects), delegations: readTable_(APP.SHEETS.delegations),
    catalogs: readTable_(APP.SHEETS.catalogs), recurrences: readTable_(APP.SHEETS.recurrences),
    notifications: getSpreadsheet_().getSheetByName('NOTIFICACIONES') ? readTable_('NOTIFICACIONES').slice(-100).reverse() : [],
    automation: notificationStatus_()
  };

  });
}

/** Create an assigned commitment. */
function createCommitment(input) {
  return withLock_(function () {
    const actor = requireUser_();
    const p = input || {};
    const title = text_(p.titulo, 'El título es obligatorio.', 160);
    const description = text_(p.descripcion || '', null, APP.MAX_TEXT);
    const type = findById_(APP.SHEETS.types, 'tipo_id', p.tipo_id);
    if (!type || !isTrue_(type.activo)) throw new Error('Selecciona un tipo de compromiso activo.');
    const ownerId = actor.rol_sistema === 'ADMIN' ? String(p.owner_id || '') : actor.usuario_id;
    const owner = findById_(APP.SHEETS.users, 'usuario_id', ownerId);
    if (!owner || !isTrue_(owner.activo)) throw new Error('Selecciona un responsable activo.');
    const approver = findById_(APP.SHEETS.users, 'usuario_id', p.aprobador_id);
    if (isTrue_(type.requiere_aprobacion) && (!approver || !isTrue_(approver.activo))) throw new Error('Selecciona un aprobador activo.');
    if (isTrue_(type.requiere_aprobacion) && approver.usuario_id === ownerId) throw new Error('El responsable no puede ser su propio aprobador.');
    const level = p.nivel_aprobacion === 'NIVEL_2' ? 'NIVEL_2' : 'NIVEL_1';
    const due = parseDate_(p.fecha_objetivo, 'La fecha objetivo es obligatoria.');
    const projectId = String(p.proyecto_id || '');
    if (projectId) requireActiveReference_('projects', 'proyecto_id', projectId);
    const requestId = text_(p.request_id, 'Falta el identificador de la solicitud.', 100);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error('El identificador de solicitud no es válido.');
    const id = 'COM-' + requestId.toUpperCase();
    const previous = findById_(APP.SHEETS.commitments, 'compromiso_id', id);
    if (previous) {
      if (previous.creado_por !== actor.usuario_id) throw new Error('La solicitud pertenece a otro usuario.');
      return mutationResult_(id, actor);
    }
    const now = new Date();
    const row = {
      compromiso_id: id, titulo: title, descripcion: description, tipo_id: type.tipo_id,
      subtipo: text_(p.subtipo || '', null, 120), proyecto_id: projectId,
      recurrencia_id: '', criticidad: ['BAJA','MEDIA','ALTA','CRITICA'].includes(p.criticidad) ? p.criticidad : 'MEDIA',
      estado: 'PENDIENTE', fecha_creacion: now, fecha_inicio: '', fecha_objetivo: due,
      fecha_cierre: '', porcentaje_avance: 0, owner_id: ownerId, aprobador_actual_id: approver ? approver.usuario_id : '',
      nivel_aprobacion: level, requiere_aprobacion: isTrue_(type.requiere_aprobacion),
      ultima_actualizacion: now, creado_por: actor.usuario_id, created_at: now,
      updated_at: now, updated_by: actor.usuario_id, activo: true
    };
    appendRecord_(APP.SHEETS.commitments, row);
    logEvent_(id, actor.usuario_id, 'CREATE', '', '', 'PENDIENTE', 'Compromiso creado.');
    notifyEvent_(row, 'ASSIGN', description, [ownerId]);
    return mutationResult_(id, actor);
  });
}

/** Update execution fields. Closing or submitting is handled by dedicated actions. */

/** Add an evidence link and create an approval attempt. */

/** Approve or return an assigned/delegated close request. */

function requireUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('Google no devolvió tu correo. Revisa la implementación de la app web y ejecútala con la identidad del usuario que accede.');
  const user = readTable_(APP.SHEETS.users).find(r => String(r.correo_corporativo || '').trim().toLowerCase() === email && isTrue_(r.activo));
  if (!user) throw new Error('Tu correo no está activo en USUARIOS. Actualiza esa pestaña con tu correo corporativo antes de usar la app.');
  return user;
}

function requireAdmin_() {
  const user = requireUser_();
  if (user.rol_sistema !== 'ADMIN') throw new Error('Esta acción requiere perfil ADMIN.');
  return user;
}

function canViewCommitment_(c, actor, collaborations, approvals, delegations) {
  if (actor.rol_sistema === 'ADMIN' || c.owner_id === actor.usuario_id) return true;
  if (collaborations.some(x => x.compromiso_id === c.compromiso_id && x.usuario_id === actor.usuario_id)) return true;
  return approvals.some(a => a.compromiso_id === c.compromiso_id && canApprove_(a, c, actor, delegations));
}

function canManageCommitment_(c, actor) {
  if (actor.rol_sistema === 'ADMIN' || c.owner_id === actor.usuario_id) return true;
  return readTable_(APP.SHEETS.collaborators).some(x => x.compromiso_id === c.compromiso_id && x.usuario_id === actor.usuario_id && x.rol === 'COLABORADOR' && isTrue_(x.activo));
}

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

function activeDelegations_() { return readTable_(APP.SHEETS.delegations).filter(d => isTrue_(d.activo)); }
function activeUsers_() { return readTable_(APP.SHEETS.users).filter(u => isTrue_(u.activo)); }

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

let catalogIndexes_;
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

function readTable_(sheetName) {
  if (readContext_ && Object.prototype.hasOwnProperty.call(readContext_.tables, sheetName)) return readContext_.tables[sheetName];
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (readContext_) readContext_.tableReads++;
  if (!values.length) return [];
  const headers = values[0].map(h => String(h || '').trim());
  if (readContext_) readContext_.headers[sheetName] = headers;
  const records = values.slice(1).map((row, index) => {
    const record = { _row: index + 2 };
    headers.forEach((header, col) => { if (header) record[header] = normalizeValue_(row[col], header); });
    return record;
  }).filter(record => headers.some(h => h && record[h] !== '' && record[h] !== null));
  if (readContext_) readContext_.tables[sheetName] = records;
  return records;
}

function normalizeValue_(value, header) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    const pattern = /(_at|fecha_evento|fecha_subida|fecha_envio|fecha_respuesta)/.test(header) ? "yyyy-MM-dd'T'HH:mm:ss" : 'yyyy-MM-dd';
    return Utilities.formatDate(value, APP.TIME_ZONE, pattern);
  }
  return value;
}

function appendRecord_(sheetName, record) { appendRecords_(sheetName, [record]); }

function findById_(sheetName, idField, id) {
  if (!id) return null;
  return readTable_(sheetName).find(r => String(r[idField]) === String(id)) || null;
}

function setField_(sheetName, rowNumber, field, value) { patchRecord_(sheetName, rowNumber, {[field]:value}); }

function logEvent_(commitmentId, userId, action, field, oldValue, newValue, detail) {
  logEvents_([{id:commitmentId,user:userId,action:action,field:field,old:oldValue,value:newValue,detail:detail}]);
}

function nextId_(prefix) {
  const stamp = Utilities.formatDate(new Date(), APP.TIME_ZONE, 'yyyyMMdd-HHmmss');
  return prefix + '-' + stamp + '-' + Utilities.getUuid().toUpperCase();
}

function getSheet_(name) {
  if (readContext_ && readContext_.sheets[name]) return readContext_.sheets[name];
  const sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) throw new Error('Falta la pestaña ' + name + ' en el Google Sheet.');
  if (readContext_) readContext_.sheets[name] = sheet;
  return sheet;
}

function indexBy_(items, key) {
  return items.reduce((out, item) => { out[item[key]] = item; return out; }, {});
}

function isTrue_(value) { return value === true || String(value).toUpperCase() === 'TRUE' || value === 1; }

function text_(value, requiredMessage, maxLength) {
  const s = String(value == null ? '' : value).trim();
  if (requiredMessage && !s) throw new Error(requiredMessage);
  if (s.length > (maxLength || APP.MAX_TEXT)) throw new Error('El texto supera el máximo permitido.');
  if (s.startsWith('=')) throw new Error('El texto no puede comenzar con “=”.');
  return s;
}

function parseDate_(value, message) {
  try { return new Date(isoDateInput_(value) + 'T12:00:00-05:00'); }
  catch (error) { throw new Error(message || error.message); }
}

function toIsoDate_(value) {
  if (!value) return '';
  const s = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : Utilities.formatDate(d, APP.TIME_ZONE, 'yyyy-MM-dd');
}

function addDaysIso_(iso, days) { return shiftDays_(iso, days); }

function validateUrl_(value) {
  const url = text_(value, 'Pega el enlace de la evidencia.', 1000);
  if (!/^https:\/\//i.test(url)) throw new Error('El enlace debe comenzar con https://');
  return url;
}

function withLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try { return withReadContext_('mutation', function () { const result = callback(); SpreadsheetApp.flush(); return result; }); } finally { lock.releaseLock(); }
}

/** Administration and operations. All public mutations authenticate on the server. */
const EXTRA_SCHEMAS = {
  USUARIOS: ['usuario_id','nombre','correo_corporativo','rol_sistema','activo','created_at','updated_at','updated_by'],
  TIPOS_COMPROMISO: ['tipo_id','nombre','descripcion','requiere_aprobacion','activo','created_at','updated_at','updated_by'],
  PROYECTOS: ['proyecto_id','nombre','descripcion','activo','created_at','updated_at','updated_by'],
  DELEGACIONES: ['delegacion_id','delegante_id','delegado_id','nivel_aprobacion','alcance_tipo','tipo_id','proyecto_id','fecha_inicio','fecha_fin','activo','created_at','updated_at','updated_by'],
  RECURRENCIAS: ['recurrencia_id','nombre','descripcion','tipo_id','proyecto_id','owner_id','aprobador_id','nivel_aprobacion','criticidad','frecuencia','fecha_inicio','fecha_fin','dias_plazo','proxima_generacion','activo','created_at','updated_at','updated_by','ultimo_error'],
  NOTIFICACIONES: ['notificacion_id','compromiso_id','usuario_id','evento','asunto','mensaje','estado','intentos','created_at','sent_at','ultimo_error']
};

function initializeFeatures() {
  return withLock_(function () {
    const actor = requireAdmin_();
    ensureExtraSchema_();
    logEvent_('', actor.usuario_id, 'SETUP', '', '', 'v2', 'Funciones de administración habilitadas.');
    return {ok:true};
  });
}

function ensureExtraSchema_() {
  const book = SpreadsheetApp.openById(APP.SPREADSHEET_ID);
  Object.keys(EXTRA_SCHEMAS).forEach(name => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    const count = sheet.getLastColumn();
    const headers = count ? sheet.getRange(1,1,1,count).getValues()[0].map(h=>String(h).trim()) : [];
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw new Error('Hay encabezados duplicados en ' + name + '.');
    const missing = EXTRA_SCHEMAS[name].filter(h=>!headers.includes(h));
    if (missing.length) {
      if (count + missing.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), count + missing.length - sheet.getMaxColumns());
      sheet.getRange(1,count+1,1,missing.length).setValues([missing]);
    }
    invalidateTable_(name, true);
  });
}

function saveAdminRecord(input) {
  return withLock_(function () {
    const actor = requireAdmin_(), p = input || {};
    const defs = {users:['users','usuario_id','USR'], types:['types','tipo_id','TIP'], projects:['projects','proyecto_id','PRO'], delegations:['delegations','delegacion_id','DEL'], recurrences:['recurrences','recurrencia_id','REC']};
    const def = defs[p.section];
    if (!def) throw new Error('Selecciona una sección válida.');
    ensureExtraSchema_();
    const sheet = APP.SHEETS[def[0]], key = def[1];
    const old = p.id ? findById_(sheet,key,p.id) : null;
    if (p.id && !old) throw new Error('El registro ya no existe.');
    const id = old ? old[key] : requestRecordId_(def[2],p.request_id);
    const previous = !old && findById_(sheet,key,id);
    if (previous) return {ok:true,id:id};
    const active = isTrue_(p.activo);
    let record = {[key]:id,activo:active,updated_at:new Date(),updated_by:actor.usuario_id};
    if (!old) record.created_at = new Date();
    if (p.section === 'users') {
      const email = text_(p.correo_corporativo,'El correo es obligatorio.',254).toLowerCase();
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw new Error('El correo no es válido.');
      if (readTable_(sheet).some(u=>u.usuario_id !== id && String(u.correo_corporativo||'').trim().toLowerCase()===email)) throw new Error('El correo ya está registrado, incluso si el usuario está inactivo.');
      if (!['ADMIN','RESPONSABLE'].includes(p.rol_sistema)) throw new Error('El rol no es válido.');
      if (old && old.rol_sistema === 'ADMIN' && isTrue_(old.activo) && (!active || p.rol_sistema !== 'ADMIN') && activeUsers_().filter(u=>u.rol_sistema==='ADMIN' && u.usuario_id!==id).length===0) throw new Error('Debe conservarse al menos un administrador activo.');
      if (old && !active) validateUserDeactivation_(id);
      if (old && (!active || p.rol_sistema !== 'ADMIN') && automationConfig_().ownerId === id && automationConfig_().enabled) throw new Error('Desactiva primero la automatización administrada por este usuario.');
      if (old && automationConfig_().enabled && automationConfig_().ownerId === id && email !== String(old.correo_corporativo||'').trim().toLowerCase()) throw new Error('Desactiva primero la automatización antes de cambiar el correo de su administrador.');
      Object.assign(record,{nombre:text_(p.nombre,'El nombre es obligatorio.',160),correo_corporativo:email,rol_sistema:p.rol_sistema});
    } else if (p.section === 'types' || p.section === 'projects') {
      Object.assign(record,{nombre:text_(p.nombre,'El nombre es obligatorio.',160),descripcion:text_(p.descripcion||'',null,APP.MAX_TEXT)});
      if (p.section==='types') record.requiere_aprobacion=isTrue_(p.requiere_aprobacion);
      if (!active && readTable_(APP.SHEETS.recurrences).some(r=>isTrue_(r.activo) && r[p.section==='types'?'tipo_id':'proyecto_id']===id)) throw new Error('Desactiva o edita primero las recurrencias que usan este registro.');
    } else if (p.section === 'delegations') {
      requireActiveUserId_(p.delegante_id); requireActiveUserId_(p.delegado_id);
      if (p.delegante_id===p.delegado_id) throw new Error('El delegante y el delegado deben ser distintos.');
      if (!['GLOBAL','TIPO','PROYECTO'].includes(p.alcance_tipo)) throw new Error('El alcance no es válido.');
      const start=isoDateInput_(p.fecha_inicio),end=isoDateInput_(p.fecha_fin);
      if (end<start) throw new Error('La fecha final no puede ser anterior a la inicial.');
      if (p.alcance_tipo==='TIPO') requireActiveReference_('types','tipo_id',p.tipo_id);
      if (p.alcance_tipo==='PROYECTO') requireActiveReference_('projects','proyecto_id',p.proyecto_id);
      Object.assign(record,{delegante_id:p.delegante_id,delegado_id:p.delegado_id,nivel_aprobacion:'NIVEL_1',alcance_tipo:p.alcance_tipo,tipo_id:p.alcance_tipo==='TIPO'?p.tipo_id:'',proyecto_id:p.alcance_tipo==='PROYECTO'?p.proyecto_id:'',fecha_inicio:start,fecha_fin:end});
    } else {
      const type = requireActiveReference_('types','tipo_id',p.tipo_id);
      requireActiveUserId_(p.owner_id);
      if (isTrue_(type.requiere_aprobacion)) {
        requireActiveUserId_(p.aprobador_id);
        if (p.owner_id===p.aprobador_id) throw new Error('El responsable no puede aprobar su propio cierre.');
      }
      if (p.proyecto_id) requireActiveReference_('projects','proyecto_id',p.proyecto_id);
      if (!['DIARIA','SEMANAL','MENSUAL','TRIMESTRAL','ANUAL'].includes(p.frecuencia)) throw new Error('Frecuencia no válida.');
      const start=isoDateInput_(p.fecha_inicio),next=isoDateInput_(p.proxima_generacion),end=p.fecha_fin?isoDateInput_(p.fecha_fin):'';
      if (next<start || end && (end<start || next>end)) throw new Error('Revisa el inicio, fin y próxima generación.');
      const days=Number(p.dias_plazo);
      if (!Number.isInteger(days)||days<0||days>3650) throw new Error('El plazo debe ser un entero entre 0 y 3650 días.');
      Object.assign(record,{nombre:text_(p.nombre,'El nombre es obligatorio.',160),descripcion:text_(p.descripcion||'',null,APP.MAX_TEXT),tipo_id:p.tipo_id,proyecto_id:p.proyecto_id||'',owner_id:p.owner_id,aprobador_id:isTrue_(type.requiere_aprobacion)?p.aprobador_id:'',nivel_aprobacion:p.nivel_aprobacion==='NIVEL_2'?'NIVEL_2':'NIVEL_1',criticidad:['BAJA','MEDIA','ALTA','CRITICA'].includes(p.criticidad)?p.criticidad:'MEDIA',frecuencia:p.frecuencia,fecha_inicio:start,fecha_fin:end,dias_plazo:days,proxima_generacion:next,ultimo_error:''});
    }
    if (old) { const patch=Object.assign({},record); delete patch[key]; patchRecord_(sheet,old._row,patch); }
    else appendRecord_(sheet,record);
    logEvent_('',actor.usuario_id,old?'ADMIN_UPDATE':'ADMIN_CREATE',sheet,old?JSON.stringify(old):'',JSON.stringify(record),'Registro '+id);
    return {ok:true,id:id};
  });
}

function requestRecordId_(prefix,requestId) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(requestId||''))) throw new Error('Solicitud no válida. Abre nuevamente el formulario.');
  return prefix+'-'+requestId.toUpperCase();
}
function requireActiveUserId_(id) { return requireActiveReference_('users','usuario_id',id); }
function requireActiveReference_(table,key,id) {
  const row=findById_(APP.SHEETS[table],key,id);
  if (!row || !isTrue_(row.activo)) throw new Error('Selecciona un registro activo en '+APP.SHEETS[table]+'.');
  return row;
}
function validateUserDeactivation_(id) {
  const open=readTable_(APP.SHEETS.commitments).filter(c=>isTrue_(c.activo)&&!['CERRADO','ANULADO'].includes(c.estado));
  if (open.some(c=>c.owner_id===id || isTrue_(c.requiere_aprobacion)&&c.aprobador_actual_id===id) || readTable_(APP.SHEETS.approvals).some(a=>a.estado==='PENDIENTE'&&a.aprobador_asignado_id===id)) throw new Error('Reasigna primero los compromisos y aprobaciones pendientes de esta persona.');
  if (readTable_(APP.SHEETS.recurrences).some(r=>isTrue_(r.activo)&&(r.owner_id===id||r.aprobador_id===id||r.aprobador_actual_id===id))) throw new Error('Edita o desactiva primero sus recurrencias.');
  if (activeDelegations_().some(d=>d.delegante_id===id||d.delegado_id===id)) throw new Error('Desactiva primero sus delegaciones.');
}


function editableCommitment_(id) {
  const c=findById_(APP.SHEETS.commitments,'compromiso_id',id);
  if (!c||!isTrue_(c.activo)||['CERRADO','ANULADO'].includes(c.estado)) throw new Error('El compromiso debe estar activo y abierto.');
  return c;
}
function touchCommitment_(c,userId) {
  const now=new Date();
  [['updated_at',now],['ultima_actualizacion',now],['updated_by',userId]].forEach(([key,value])=>setField_(APP.SHEETS.commitments,c._row,key,value));
}
function addCommitmentComment(input) {
  return withLock_(function () {
    const actor=requireUser_(),p=input||{},c=findById_(APP.SHEETS.commitments,'compromiso_id',p.compromiso_id);
    if (!c||!isTrue_(c.activo)||!canViewCommitment_(c,actor,readTable_(APP.SHEETS.collaborators).filter(r=>isTrue_(r.activo)),readTable_(APP.SHEETS.approvals),activeDelegations_())) throw new Error('No tienes acceso al compromiso.');
    const comment=text_(p.comentario,'Escribe un comentario.',APP.MAX_TEXT);
    const eventId=requestRecordId_('CMT',p.request_id);
    const previous=findById_(APP.SHEETS.history,'historial_id',eventId);
    if(previous)return mutationResult_(c.compromiso_id,actor,{comment:previous});
    appendRecord_(APP.SHEETS.history,{historial_id:eventId,compromiso_id:c.compromiso_id,usuario_id:actor.usuario_id,fecha_evento:new Date(),accion:'COMMENT',campo:'',valor_anterior:'',valor_nuevo:'',detalle:comment});
    return mutationResult_(c.compromiso_id,actor,{comment:findById_(APP.SHEETS.history,'historial_id',eventId)});
  });
}

/** Persisted notification queue; delivery cannot undo a business operation. */
function automationConfig_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('SD_AUTOMATION')||'{"enabled":false,"email":false}');
}
function notificationStatus_() {
  const config=automationConfig_();
  const book=getSpreadsheet_();
  const queue=book.getSheetByName('NOTIFICACIONES')?readTable_('NOTIFICACIONES'):[];
  return {enabled:!!config.enabled,email:!!config.email,ownerId:config.ownerId||'',lastRun:config.lastRun||'',lastError:config.lastError||'',pending:queue.filter(n=>n.estado==='PENDIENTE').length,failed:queue.filter(n=>['ERROR','ENVIANDO'].includes(n.estado)).length};
}
function notifyEvent_(c,event,detail,recipientIds) {
  if (!automationConfig_().email) return;
  try {
    const labels={ASSIGN:'Nuevo compromiso asignado',SUBMIT:'Solicitud de aprobación',APROBAR:'Compromiso aprobado',DEVOLVER:'Compromiso devuelto',REASSIGN:'Compromiso reasignado',CANCEL:'Compromiso anulado',CLOSE:'Compromiso cerrado'};
    [...new Set(recipientIds.filter(Boolean))].forEach(id=>appendRecord_('NOTIFICACIONES',{
      notificacion_id:nextId_('NTF'),compromiso_id:c.compromiso_id,usuario_id:id,evento:event,
      asunto:'SD Control · '+(labels[event]||event),mensaje:(labels[event]||event)+'\n\n'+c.titulo+'\nID: '+c.compromiso_id+'\nFecha objetivo: '+toIsoDate_(c.fecha_objetivo)+'\n\n'+(detail||''),estado:'PENDIENTE',intentos:0,created_at:new Date(),sent_at:'',ultimo_error:''
    }));
  } catch(error) {
    // Surface a queue failure in automation status without falsely reporting the saved operation as failed.
    const config=automationConfig_();config.lastError='No se pudo registrar el aviso: '+error.message;
    PropertiesService.getScriptProperties().setProperty('SD_AUTOMATION',JSON.stringify(config));
  }
}
function saveAutomationSettings(input) {
  return withLock_(function () {
    const actor=requireAdmin_(),p=input||{},config=automationConfig_();
    const enabled=isTrue_(p.enabled),email=isTrue_(p.email);
    if (config.enabled && config.ownerId!==actor.usuario_id) throw new Error('La automatización debe administrarla la persona que la activó.');
    ensureExtraSchema_();
    // Validate OAuth access before changing the existing schedule.
    if (email) MailApp.getRemainingDailyQuota();
    const owned=ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='scheduledTasks_');
    let trigger;
    if (enabled) trigger=ScriptApp.newTrigger('scheduledTasks_').timeBased().everyHours(1).create();
    owned.forEach(t=>ScriptApp.deleteTrigger(t));
    const next={enabled:enabled,email:email,ownerId:actor.usuario_id,triggerId:trigger?trigger.getUniqueId():'',lastRun:config.lastRun||'',lastError:''};
    PropertiesService.getScriptProperties().setProperty('SD_AUTOMATION',JSON.stringify(next));
    logEvent_('',actor.usuario_id,'AUTOMATION','','',JSON.stringify(next),'Configuración de correos y recurrencias.');
    return {ok:true};
  });
}
function runOperationsNow() {
  return withLock_(function () { const actor=requireAdmin_(); ensureExtraSchema_(); return runOperations_(actor.usuario_id); });
}
function scheduledTasks_(event) {
  return withLock_(function () {
    const config=automationConfig_();
    if (!config.enabled||!event||String(event.triggerUid)!==String(config.triggerId)) return;
    const owner=findById_(APP.SHEETS.users,'usuario_id',config.ownerId);
    if (!owner||!isTrue_(owner.activo)||owner.rol_sistema!=='ADMIN') throw new Error('El administrador de la automatización ya no está activo.');
    return runOperations_(owner.usuario_id);
  });
}
function runOperations_(actorId) {
  const config=automationConfig_();
  const result={generated:0,sent:0,errors:[]};
  try { Object.assign(result,generateRecurrences_(actorId)); }
  catch(error) { result.errors.push(error.message); }
  if (config.email) {
    try { result.sent=deliverNotifications_(); } catch(error) { result.errors.push('Correos: '+error.message); }
  }
  const latest=automationConfig_();latest.lastRun=Utilities.formatDate(new Date(),APP.TIME_ZONE,"yyyy-MM-dd'T'HH:mm:ss");latest.lastError=result.errors.join('\n');
  PropertiesService.getScriptProperties().setProperty('SD_AUTOMATION',JSON.stringify(latest));
  return result;
}
function deliverNotifications_() {
  const quota=MailApp.getRemainingDailyQuota();let sent=0;
  const queue=readTable_('NOTIFICACIONES').filter(n=>n.estado==='PENDIENTE').slice(0,Math.min(20,quota));
  queue.forEach(n=>{
    const user=findById_(APP.SHEETS.users,'usuario_id',n.usuario_id);
    if (!user||!isTrue_(user.activo)) {setField_('NOTIFICACIONES',n._row,'estado','OMITIDO');setField_('NOTIFICACIONES',n._row,'ultimo_error','Destinatario inactivo.');return;}
    const c=findById_(APP.SHEETS.commitments,'compromiso_id',n.compromiso_id);
    const obsolete=n.evento==='SUBMIT' && (!c || c.estado!=='EN_APROBACION' || c.aprobador_actual_id!==n.usuario_id) || ['ASSIGN','REASSIGN'].includes(n.evento) && (!c || ['CERRADO','ANULADO'].includes(c.estado) || ![c.owner_id,c.aprobador_actual_id].includes(n.usuario_id));
    if (obsolete) {setField_('NOTIFICACIONES',n._row,'estado','OMITIDO');setField_('NOTIFICACIONES',n._row,'ultimo_error','La asignación o solicitud ya no está vigente.');return;}
    const attempts=(Number(n.intentos)||0)+1;
    setField_('NOTIFICACIONES',n._row,'intentos',attempts);
    // An interrupted delivery remains ENVIANDO for manual inspection; do not automatically duplicate it.
    setField_('NOTIFICACIONES',n._row,'estado','ENVIANDO');SpreadsheetApp.flush();
    try {
      MailApp.sendEmail({to:user.correo_corporativo,subject:n.asunto,body:n.mensaje,name:'SD Control'});
    } catch(error) {
      setField_('NOTIFICACIONES',n._row,'estado',attempts>=3?'ERROR':'PENDIENTE');setField_('NOTIFICACIONES',n._row,'ultimo_error',String(error.message).slice(0,1000));return;
    }
    setField_('NOTIFICACIONES',n._row,'estado','ENVIADO');setField_('NOTIFICACIONES',n._row,'sent_at',new Date());setField_('NOTIFICACIONES',n._row,'ultimo_error','');sent++;
  });
  return sent;
}

function retryNotification(input) {
  return withLock_(function () {
    const actor=requireAdmin_(),p=input||{};
    const n=findById_('NOTIFICACIONES','notificacion_id',p.notificacion_id);
    if (!n||!['ERROR','ENVIANDO'].includes(n.estado)) throw new Error('Solo se reintentan correos con error o entrega pendiente de revisión.');
    const reason=text_(p.motivo,'Indica por qué se reintentará el correo.',APP.MAX_TEXT);
    requireActiveUserId_(n.usuario_id);
    setField_('NOTIFICACIONES',n._row,'estado','PENDIENTE');
    setField_('NOTIFICACIONES',n._row,'intentos',0);
    setField_('NOTIFICACIONES',n._row,'ultimo_error','');
    logEvent_(n.compromiso_id,actor.usuario_id,'MAIL_RETRY','notificacion_id',n.estado,n.notificacion_id,reason);
    return {ok:true};
  });
}

function isoDateInput_(value) {
  const s=String(value||'').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Selecciona una fecha válida.');
  const d=new Date(s+'T12:00:00Z');
  if (isNaN(d.getTime())||d.toISOString().slice(0,10)!==s) throw new Error('La fecha no existe en el calendario.');
  return s;
}
function shiftDays_(iso,days) {
  const d=new Date(isoDateInput_(iso)+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);
}
function nextRecurrenceDate_(iso,frequency,anchor) {
  if (frequency==='DIARIA'||frequency==='SEMANAL') return shiftDays_(iso,frequency==='DIARIA'?1:7);
  const months={MENSUAL:1,TRIMESTRAL:3,ANUAL:12}[frequency];
  if (!months) throw new Error('Frecuencia no válida: '+frequency);
  const d=new Date(isoDateInput_(iso)+'T12:00:00Z');
  const day=Number(isoDateInput_(anchor||iso).slice(8,10));
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
}
function generateRecurrences_(actorId) {
  const today=Utilities.formatDate(new Date(),APP.TIME_ZONE,'yyyy-MM-dd');
  const result={generated:0,errors:[]};let processed=0;
  const known=new Set(readTable_(APP.SHEETS.commitments).map(c=>c.compromiso_id));
  readTable_(APP.SHEETS.recurrences).filter(r=>isTrue_(r.activo)).forEach(r=>{
    try {
      const start=isoDateInput_(toIsoDate_(r.fecha_inicio||r.proxima_generacion));
      if (!r.fecha_inicio) setField_(APP.SHEETS.recurrences,r._row,'fecha_inicio',start);
      let next=isoDateInput_(toIsoDate_(r.proxima_generacion));
      const end=r.fecha_fin?isoDateInput_(toIsoDate_(r.fecha_fin)):'';
      if (next<start) throw new Error('Próxima generación anterior al inicio.');
      const type=requireActiveReference_('types','tipo_id',r.tipo_id);
      requireActiveUserId_(r.owner_id);
      const approver=r.aprobador_id||r.aprobador_actual_id||'';
      if (isTrue_(type.requiere_aprobacion)) { requireActiveUserId_(approver);if(approver===r.owner_id) throw new Error('Responsable y aprobador iguales.'); }
      if(r.proyecto_id) requireActiveReference_('projects','proyecto_id',r.proyecto_id);
      const days=r.dias_plazo===''||r.dias_plazo==null?7:Number(r.dias_plazo);
      if(!Number.isInteger(days)||days<0||days>3650) throw new Error('Plazo no válido.');
      while(next<=today && (!end||next<=end) && processed<50) {
        const following=nextRecurrenceDate_(next,r.frecuencia,start);
        const id='COM-'+r.recurrencia_id+'-'+next;
        if(!known.has(id)) {
          const now=new Date();
          const c={compromiso_id:id,titulo:text_(r.nombre,'Falta el nombre de la recurrencia.',160),descripcion:text_(r.descripcion||'',null,APP.MAX_TEXT),tipo_id:r.tipo_id,subtipo:'',proyecto_id:r.proyecto_id||'',recurrencia_id:r.recurrencia_id,criticidad:r.criticidad||'MEDIA',estado:'PENDIENTE',fecha_creacion:now,fecha_inicio:'',fecha_objetivo:parseDate_(shiftDays_(next,days)),fecha_cierre:'',porcentaje_avance:0,owner_id:r.owner_id,aprobador_actual_id:isTrue_(type.requiere_aprobacion)?approver:'',nivel_aprobacion:r.nivel_aprobacion==='NIVEL_2'?'NIVEL_2':'NIVEL_1',requiere_aprobacion:isTrue_(type.requiere_aprobacion),ultima_actualizacion:now,creado_por:actorId,created_at:now,updated_at:now,updated_by:actorId,activo:true};
          appendRecord_(APP.SHEETS.commitments,c);known.add(id);result.generated++;
          logEvent_(id,actorId,'RECURRENCE','','','PENDIENTE','Generación de '+r.recurrencia_id+' para '+next);
          notifyEvent_(c,'ASSIGN','Compromiso periódico.',[c.owner_id]);
        }
        processed++;next=following;setField_(APP.SHEETS.recurrences,r._row,'proxima_generacion',next);
      }
      if (end&&next>end) setField_(APP.SHEETS.recurrences,r._row,'activo',false);
      setField_(APP.SHEETS.recurrences,r._row,'ultimo_error','');
    } catch(error) {
      const message=r.recurrencia_id+': '+error.message;result.errors.push(message);
      setField_(APP.SHEETS.recurrences,r._row,'ultimo_error',String(error.message).slice(0,1000));
    }
  });
  return result;
}

// No CacheService or persistent user-data cache: permissions are rechecked on every call.
let readContext_ = null;
function withReadContext_(label, callback) {
  if (readContext_) return callback();
  const oldCatalogs = catalogIndexes_;
  const context = {book:null,sheets:Object.create(null),tables:Object.create(null),headers:Object.create(null),tableReads:0,spreadsheetOpens:0};
  const start = Date.now();
  readContext_ = context; catalogIndexes_ = null;
  try { return callback(); }
  finally {
    readContext_ = null; catalogIndexes_ = oldCatalogs;
    console.info('SD_PERF ' + JSON.stringify({endpoint:label,durationMs:Date.now()-start,tableReads:context.tableReads,spreadsheetOpens:context.spreadsheetOpens}));
  }
}
function getSpreadsheet_() {
  if (!readContext_) return SpreadsheetApp.openById(APP.SPREADSHEET_ID);
  if (!readContext_.book) {
    readContext_.book = SpreadsheetApp.openById(APP.SPREADSHEET_ID);
    readContext_.spreadsheetOpens++;
  }
  return readContext_.book;
}

/** Authorized snapshots and delta synchronization; stored only in browser session memory. */
function normalizedRecord_(row) {
  const result={};Object.keys(row).filter(k=>k!=='_row').sort().forEach(k=>result[k]=normalizeValue_(row[k],k));return result;
}
function hashValue_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(value),Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}
function recordVersion_(row) {return hashValue_(normalizedRecord_(row));}
function assertExpectedVersion_(row,version) {
  if (version && recordVersion_(row)!==version) throw new Error('CONFLICT: El compromiso cambió desde que lo abriste. Conserva tu edición y actualiza el detalle antes de volver a guardar.');
}
function groupByCommitment_(rows) {
  return rows.reduce((out,row)=>{(out[row.compromiso_id]||(out[row.compromiso_id]=[])).push(row);return out;},Object.create(null));
}
function detailContext_(users,collaborations,approvals,delegations) {
  return {users:indexBy_(users,'usuario_id'),collaborations:groupByCommitment_(collaborations),approvals:groupByCommitment_(approvals),delegations:delegations,evidence:groupByCommitment_(readTable_(APP.SHEETS.evidence)),activity:readTable_(APP.SHEETS.history).reduce((out,r)=>{if(r.compromiso_id)out[r.compromiso_id]=r.historial_id;return out;},Object.create(null))};
}
function synchronizedDetail_(c,actor,context) {
  const collaborators=context.collaborations[c.compromiso_id]||[];
  const task=c.owner_id===actor.usuario_id||collaborators.some(r=>r.usuario_id===actor.usuario_id&&r.rol==='COLABORADOR');
  const admin=actor.rol_sistema==='ADMIN',open=APP.OPEN_STATUS.includes(c.estado),active=!['CERRADO','ANULADO'].includes(c.estado);
  const result={commitment:decorateCommitment_(c,context.users),collaborators:collaborators.map(r=>Object.assign({},r,{nombre:context.users[r.usuario_id]?.nombre||r.usuario_id})),approvals:(context.approvals[c.compromiso_id]||[]).map(a=>Object.assign({},a,{_version:recordVersion_(a),canDecide:a.estado==='PENDIENTE'&&c.estado==='EN_APROBACION'&&canApprove_(a,c,actor,context.delegations)})),evidence:context.evidence[c.compromiso_id]||[],isTask:task,permissions:{edit:open&&(admin||task),close:open&&(admin||c.owner_id===actor.usuario_id),reassign:active&&admin,cancel:active&&(admin||c.owner_id===actor.usuario_id)},activityVersion:context.activity[c.compromiso_id]||''};
  result._syncVersion=hashValue_(result);return result;
}
function snapshotMetadata_(snapshot) {
  const meta={};Object.keys(snapshot).filter(k=>!['commitments','myTasks','details','metadataVersion'].includes(k)).forEach(k=>meta[k]=snapshot[k]);return meta;
}
function syncAppData(input) {
  return withReadContext_('syncAppData',function(){
    const p=input||{},known=p.versions||{};
    if(typeof known!=='object'||Array.isArray(known)||Object.keys(known).length>20000)throw new Error('Solicitud de sincronización inválida.');
    const snapshot=getAppData(),visible=new Set(snapshot.details.map(d=>d.commitment.compromiso_id));
    return {details:snapshot.details.filter(d=>known[d.commitment.compromiso_id]!==d._syncVersion),removed:Object.keys(known).filter(id=>!visible.has(id)),metadata:p.metadataVersion===snapshot.metadataVersion?null:snapshotMetadata_(snapshot),metadataVersion:snapshot.metadataVersion};
  });
}
function mutationResult_(id,actor,extra) {
  const c=findById_(APP.SHEETS.commitments,'compromiso_id',id);
  const collaborators=readTable_(APP.SHEETS.collaborators).filter(r=>isTrue_(r.activo));
  const approvals=readTable_(APP.SHEETS.approvals),delegations=activeDelegations_();
  const result=Object.assign({ok:true,id:id,user:{id:actor.usuario_id,name:actor.nombre,email:actor.correo_corporativo,role:actor.rol_sistema}},extra||{});
  if(!c||!isTrue_(c.activo)||!canViewCommitment_(c,actor,collaborators,approvals.filter(a=>a.estado==='PENDIENTE'),delegations))return Object.assign(result,{remove:true});
  result.detail=synchronizedDetail_(c,actor,detailContext_(readTable_(APP.SHEETS.users),collaborators,approvals,delegations));return result;
}

/** One row write per logical edit; untouched formulas and extra columns survive. */
function tableHeaders_(sheetName) {
  if(readContext_&&readContext_.headers[sheetName])return readContext_.headers[sheetName];
  const sheet=getSheet_(sheetName),headers=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0].map(h=>String(h).trim());
  if(readContext_)readContext_.headers[sheetName]=headers;return headers;
}
function invalidateTable_(name,headers) {
  if(!readContext_)return;
  delete readContext_.tables[name];if(headers)delete readContext_.headers[name];
  if([APP.SHEETS.types,APP.SHEETS.projects].includes(name))catalogIndexes_=null;
}
function patchRecord_(sheetName,rowNumber,fields) {
  if(!Number.isInteger(rowNumber)||rowNumber<2)throw new Error('Fila inválida.');
  const sheet=getSheet_(sheetName),headers=tableHeaders_(sheetName),keys=Object.keys(fields);
  keys.forEach(k=>{if(!headers.includes(k))throw new Error('No existe la columna '+k+' en '+sheetName+'.');});
  if(!keys.length)return;
  const range=sheet.getRange(rowNumber,1,1,headers.length),values=range.getValues()[0],formulas=range.getFormulas()[0];
  const row=values.map((v,i)=>formulas[i]||(typeof v==='string'&&v.startsWith('=')?"'"+v:v));
  keys.forEach(k=>row[headers.indexOf(k)]=fields[k]==null?'':fields[k]);
  range.setValues([row]);invalidateTable_(sheetName);
}
function appendRecords_(sheetName,records) {
  if(!records.length)return;
  const sheet=getSheet_(sheetName),headers=tableHeaders_(sheetName),start=sheet.getLastRow()+1,last=start+records.length-1;
  if(last>sheet.getMaxRows())sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
  sheet.getRange(start,1,records.length,headers.length).setValues(records.map(record=>headers.map(h=>Object.prototype.hasOwnProperty.call(record,h)?record[h]:'')));
  invalidateTable_(sheetName);
}
function logEvents_(events) {
  appendRecords_(APP.SHEETS.history,events.map(e=>({historial_id:nextId_('HIS'),compromiso_id:e.id||'',fecha_evento:new Date(),usuario_id:e.user,accion:e.action,campo:e.field||'',valor_anterior:e.old==null?'':String(e.old),valor_nuevo:e.value==null?'':String(e.value),detalle:e.detail||''})));
}

function updateCommitment(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(!canManageCommitment_(c,actor))throw new Error('No tienes permisos para actualizar este compromiso.');
    if(!APP.OPEN_STATUS.includes(c.estado))throw new Error('Solo se actualizan compromisos abiertos.');
    assertExpectedVersion_(c,p.expected_version);
    const changes=p.changes||{estado:p.estado||c.estado,porcentaje_avance:p.porcentaje_avance==null?c.porcentaje_avance:p.porcentaje_avance,descripcion:p.descripcion==null?c.descripcion:p.descripcion,fecha_objetivo:p.fecha_objetivo||c.fecha_objetivo};
    if(typeof changes!=='object'||Array.isArray(changes))throw new Error('Cambios inválidos.');
    const fields={},events=[];
    Object.keys(changes).forEach(key=>{
      let value=changes[key];
      if(!['estado','porcentaje_avance','descripcion','fecha_objetivo'].includes(key))throw new Error('Campo no editable: '+key);
      if(key==='estado'&&!APP.OPEN_STATUS.includes(value))throw new Error('Estado no válido.');
      if(key==='porcentaje_avance'){value=Number(value);if(!Number.isFinite(value)||value<0||value>99)throw new Error('El avance debe estar entre 0 y 99.');}
      if(key==='descripcion')value=text_(value||'',null,APP.MAX_TEXT);
      if(key==='fecha_objetivo')value=parseDate_(value,'La fecha objetivo no es válida.');
      if(String(normalizeValue_(value,key))!==String(c[key])){fields[key]=value;events.push({id:c.compromiso_id,user:actor.usuario_id,action:'UPDATE',field:key,old:c[key],value:normalizeValue_(value,key),detail:'Actualización desde SD Control.'});}
    });
    if(events.length){Object.assign(fields,{ultima_actualizacion:new Date(),updated_at:new Date(),updated_by:actor.usuario_id});patchRecord_(APP.SHEETS.commitments,c._row,fields);logEvents_(events);}
    return mutationResult_(c.compromiso_id,actor);
  });
}
function submitEvidence(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(actor.rol_sistema!=='ADMIN'&&actor.usuario_id!==c.owner_id)throw new Error('Solo el responsable puede enviar el cierre.');
    if(!APP.OPEN_STATUS.includes(c.estado))throw new Error('Este compromiso no está disponible para cierre.');
    assertExpectedVersion_(c,p.expected_version);
    const url=validateUrl_(p.url),comment=text_(p.comentario,'Agrega un comentario que explique la evidencia.',APP.MAX_TEXT),name=text_(p.nombre||'Evidencia',null,180);
    const needsApproval=isTrue_(c.requiere_aprobacion);
    if(needsApproval){requireActiveUserId_(c.aprobador_actual_id);if(c.aprobador_actual_id===c.owner_id)throw new Error('Configura un aprobador distinto del responsable.');}
    const previous=readTable_(APP.SHEETS.approvals).filter(a=>a.compromiso_id===c.compromiso_id),version=previous.reduce((n,a)=>Math.max(n,Number(a.version)||0),0)+1;
    const approvalId=needsApproval?nextId_('APR'):'',now=new Date(),state=needsApproval?'EN_APROBACION':'CERRADO';
    appendRecord_(APP.SHEETS.evidence,{evidencia_id:nextId_('EVI'),compromiso_id:c.compromiso_id,aprobacion_id:approvalId,usuario_id:actor.usuario_id,fecha_subida:now,tipo_evidencia:'ENLACE',nombre_archivo:name,drive_file_id:'',url_drive:url,comentario:comment});
    if(needsApproval)appendRecord_(APP.SHEETS.approvals,{aprobacion_id:approvalId,compromiso_id:c.compromiso_id,version:version,aprobador_asignado_id:c.aprobador_actual_id,aprobador_efectivo_id:'',delegado_por_id:'',estado:'PENDIENTE',fecha_envio:now,fecha_respuesta:'',comentario:comment,created_at:now,created_by:actor.usuario_id});
    patchRecord_(APP.SHEETS.commitments,c._row,{estado:state,porcentaje_avance:100,fecha_cierre:needsApproval?'':now,ultima_actualizacion:now,updated_at:now,updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,needsApproval?'SUBMIT':'CLOSE','estado',c.estado,state,comment);
    notifyEvent_(c,needsApproval?'SUBMIT':'CLOSE',comment,needsApproval?[c.aprobador_actual_id]:[c.owner_id]);
    return mutationResult_(c.compromiso_id,actor,{approvalId:approvalId,state:state});
  });
}
function decideApproval(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{};
    if(!['APROBAR','DEVOLVER'].includes(p.decision))throw new Error('Decisión no válida.');
    const a=findById_(APP.SHEETS.approvals,'aprobacion_id',p.aprobacion_id);
    if(!a||a.estado!=='PENDIENTE')throw new Error('La aprobación ya fue atendida o no existe.');
    const c=editableCommitment_(a.compromiso_id);
    if(c.estado!=='EN_APROBACION')throw new Error('El compromiso no está disponible para aprobación.');
    if(!canApprove_(a,c,actor,activeDelegations_()))throw new Error('No tienes una aprobación vigente para esta solicitud.');
    assertExpectedVersion_(c,p.expected_version);
    if(p.approval_version&&recordVersion_(a)!==p.approval_version)throw new Error('CONFLICT: La solicitud de aprobación cambió. Actualiza la revisión.');
    const comment=text_(p.comentario||'',p.decision==='DEVOLVER'?'Escribe el motivo de devolución.':null,APP.MAX_TEXT),now=new Date(),state=p.decision==='APROBAR'?'CERRADO':'EN_CURSO';
    patchRecord_(APP.SHEETS.approvals,a._row,{estado:p.decision==='APROBAR'?'APROBADO':'DEVUELTO',aprobador_efectivo_id:actor.usuario_id,delegado_por_id:a.aprobador_asignado_id!==actor.usuario_id?a.aprobador_asignado_id:(a.delegado_por_id||''),fecha_respuesta:now,comentario:comment});
    patchRecord_(APP.SHEETS.commitments,c._row,{estado:state,porcentaje_avance:p.decision==='APROBAR'?100:99,fecha_cierre:p.decision==='APROBAR'?now:'',ultima_actualizacion:now,updated_at:now,updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,p.decision,'estado',c.estado,state,comment);notifyEvent_(c,p.decision,comment,[c.owner_id]);
    return mutationResult_(c.compromiso_id,actor,{state:state});
  });
}
function reassignCommitment(input) {
  return withLock_(function(){
    const actor=requireAdmin_(),p=input||{},c=editableCommitment_(p.compromiso_id);assertExpectedVersion_(c,p.expected_version);
    requireActiveUserId_(p.owner_id);const approver=isTrue_(c.requiere_aprobacion)?p.aprobador_id:'';
    if(approver){requireActiveUserId_(approver);if(approver===p.owner_id)throw new Error('El responsable y el aprobador deben ser distintos.');}
    else if(isTrue_(c.requiere_aprobacion))throw new Error('Selecciona un aprobador activo.');
    const reason=text_(p.motivo,'Indica el motivo de la reasignación.',APP.MAX_TEXT),pending=readTable_(APP.SHEETS.approvals).filter(a=>a.compromiso_id===c.compromiso_id&&a.estado==='PENDIENTE');
    pending.forEach(a=>patchRecord_(APP.SHEETS.approvals,a._row,{aprobador_asignado_id:approver,delegado_por_id:''}));
    patchRecord_(APP.SHEETS.commitments,c._row,{owner_id:p.owner_id,aprobador_actual_id:approver,updated_at:new Date(),ultima_actualizacion:new Date(),updated_by:actor.usuario_id});
    logEvents_([['owner_id',p.owner_id],['aprobador_actual_id',approver]].filter(([key,value])=>c[key]!==value).map(([key,value])=>({id:c.compromiso_id,user:actor.usuario_id,action:'REASSIGN',field:key,old:c[key],value:value,detail:reason})));
    notifyEvent_(Object.assign({},c,{owner_id:p.owner_id,aprobador_actual_id:approver}),'REASSIGN',reason,pending.length?[p.owner_id,approver]:[p.owner_id]);return mutationResult_(c.compromiso_id,actor);
  });
}
function cancelCommitment(input) {
  return withLock_(function(){
    const actor=requireUser_(),p=input||{},c=editableCommitment_(p.compromiso_id);
    if(actor.rol_sistema!=='ADMIN'&&actor.usuario_id!==c.owner_id)throw new Error('Solo el responsable o administrador puede anular.');
    assertExpectedVersion_(c,p.expected_version);const reason=text_(p.motivo,'Indica el motivo de anulación.',APP.MAX_TEXT);
    readTable_(APP.SHEETS.approvals).filter(a=>a.compromiso_id===c.compromiso_id&&a.estado==='PENDIENTE').forEach(a=>patchRecord_(APP.SHEETS.approvals,a._row,{estado:'ANULADO',fecha_respuesta:new Date(),comentario:reason}));
    patchRecord_(APP.SHEETS.commitments,c._row,{estado:'ANULADO',updated_at:new Date(),ultima_actualizacion:new Date(),updated_by:actor.usuario_id});
    logEvent_(c.compromiso_id,actor.usuario_id,'CANCEL','estado',c.estado,'ANULADO',reason);notifyEvent_(c,'CANCEL',reason,[c.owner_id,c.aprobador_actual_id]);return mutationResult_(c.compromiso_id,actor);
  });
}
