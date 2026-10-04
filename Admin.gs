/** Administración de referencias y actualización segura del esquema. */

/**
 * Consulta las tablas administrativas; exige un ADMIN activo.
 * @returns {Object} Tablas y estado de automatización visibles para ADMIN.
 */
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

/**
 * Añade encabezados y tablas faltantes sin borrar datos; exige ADMIN y bloqueo.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 * @returns {Object} Indicador ok después de preparar tablas y disparadores.
 */
function initializeFeatures() {
  return withLock_(function () {
    const actor = requireAdmin_();
    ensureExtraSchema_();
    logEvent_('', actor.usuario_id, 'SETUP', '', '', 'v2', 'Funciones de administración habilitadas.');
    installChangeTracking_(actor);
    return {ok:true};
  });
}

/**
 * Completa el esquema al final de las columnas y rechaza encabezados duplicados.
 */
function ensureExtraSchema_() {
  const book = SpreadsheetApp.openById(spreadsheetId_());
  Object.keys(EXTRA_SCHEMAS).forEach(name => {
    const sheet = book.getSheetByName(name) || book.insertSheet(name);
    const count = sheet.getLastColumn();
    const headers = count ? sheet.getRange(1,1,1,count).getValues()[0].map(h=>String(h).trim()) : [];
    if (new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length) throw appError_('CONFIGURATION','Hay encabezados duplicados en ' + name + '.');
    const missing = EXTRA_SCHEMAS[name].filter(h=>!headers.includes(h));
    if (missing.length) {
      if (count + missing.length > sheet.getMaxColumns()) sheet.insertColumnsAfter(sheet.getMaxColumns(), count + missing.length - sheet.getMaxColumns());
      sheet.getRange(1,count+1,1,missing.length).setValues([missing]);
    }
    invalidateTable_(name, true);
  });
}

/**
 * Valida y guarda usuarios, catálogos, delegaciones o recurrencias bajo bloqueo.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 * @returns {Object} Indicador ok e id del registro guardado.
 */
function saveAdminRecord(input) {
  return withLock_(function () {
    const actor = requireAdmin_(), p = input || {};
    const defs = {users:['users','usuario_id','USR'], types:['types','tipo_id','TIP'], projects:['projects','proyecto_id','PRO'], delegations:['delegations','delegacion_id','DEL'], recurrences:['recurrences','recurrencia_id','REC']};
    const def = defs[p.section];
    if (!def) throw appError_('VALIDATION','Selecciona una sección válida.');
    ensureExtraSchema_();
    const sheet = APP.SHEETS[def[0]], key = def[1];
    const old = p.id ? findById_(sheet,key,p.id) : null;
    if (p.id && !old) throw appError_('VALIDATION','El registro ya no existe.');
    const id = old ? old[key] : requestRecordId_(def[2],p.request_id);
    const previous = !old && findById_(sheet,key,id);
    if (previous) return {ok:true,id:id};
    const active = isTrue_(p.activo);
    let record = {[key]:id,activo:active,updated_at:new Date(),updated_by:actor.usuario_id};
    if (!old) record.created_at = new Date();
    if (p.section === 'users') {
      const email = text_(p.correo_corporativo,'El correo es obligatorio.',254).toLowerCase();
      if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(email)) throw appError_('VALIDATION','El correo no es válido.');
      if (readTable_(sheet).some(u=>u.usuario_id !== id && String(u.correo_corporativo||'').trim().toLowerCase()===email)) throw appError_('VALIDATION','El correo ya está registrado, incluso si el usuario está inactivo.');
      if (!APP.ROLES.includes(p.rol_sistema)) throw appError_('VALIDATION','El rol no es válido.');
      if (old && old.rol_sistema === 'ADMIN' && isTrue_(old.activo) && (!active || p.rol_sistema !== 'ADMIN') && activeUsers_().filter(u=>u.rol_sistema==='ADMIN' && u.usuario_id!==id).length===0) throw appError_('FORBIDDEN','Debe conservarse al menos un administrador activo.');
      if (old && !active) validateUserDeactivation_(id);
      if (old && (!active || p.rol_sistema !== 'ADMIN') && automationConfig_().ownerId === id && automationConfig_().enabled) throw appError_('VALIDATION','Desactiva primero la automatización administrada por este usuario.');
      if (old && automationConfig_().enabled && automationConfig_().ownerId === id && email !== String(old.correo_corporativo||'').trim().toLowerCase()) throw appError_('FORBIDDEN','Desactiva primero la automatización antes de cambiar el correo de su administrador.');
      Object.assign(record,{nombre:text_(p.nombre,'El nombre es obligatorio.',160),correo_corporativo:email,rol_sistema:p.rol_sistema});
    } else if (p.section === 'types' || p.section === 'projects') {
      Object.assign(record,{nombre:text_(p.nombre,'El nombre es obligatorio.',160),descripcion:text_(p.descripcion||'',null,APP.MAX_TEXT)});
      if (p.section==='types') record.requiere_aprobacion=isTrue_(p.requiere_aprobacion);
      if (!active && readTable_(APP.SHEETS.recurrences).some(r=>isTrue_(r.activo) && r[p.section==='types'?'tipo_id':'proyecto_id']===id)) throw appError_('VALIDATION','Desactiva o edita primero las recurrencias que usan este registro.');
    } else if (p.section === 'delegations') {
      requireActiveUserId_(p.delegante_id); requireActiveUserId_(p.delegado_id);
      if (p.delegante_id===p.delegado_id) throw appError_('VALIDATION','El delegante y el delegado deben ser distintos.');
      if (!['GLOBAL','TIPO','PROYECTO'].includes(p.alcance_tipo)) throw appError_('VALIDATION','El alcance no es válido.');
      const start=isoDateInput_(p.fecha_inicio),end=isoDateInput_(p.fecha_fin);
      if (end<start) throw appError_('VALIDATION','La fecha final no puede ser anterior a la inicial.');
      if (p.alcance_tipo==='TIPO') requireActiveReference_('types','tipo_id',p.tipo_id);
      if (p.alcance_tipo==='PROYECTO') requireActiveReference_('projects','proyecto_id',p.proyecto_id);
      Object.assign(record,{delegante_id:p.delegante_id,delegado_id:p.delegado_id,nivel_aprobacion:'NIVEL_1',alcance_tipo:p.alcance_tipo,tipo_id:p.alcance_tipo==='TIPO'?p.tipo_id:'',proyecto_id:p.alcance_tipo==='PROYECTO'?p.proyecto_id:'',fecha_inicio:start,fecha_fin:end});
    } else {
      const type = requireActiveReference_('types','tipo_id',p.tipo_id);
      requireActiveUserId_(p.owner_id);
      if (isTrue_(type.requiere_aprobacion)) {
        requireActiveUserId_(p.aprobador_id);
        if (p.owner_id===p.aprobador_id) throw appError_('VALIDATION','El responsable no puede aprobar su propio cierre.');
      }
      if (p.proyecto_id) requireActiveReference_('projects','proyecto_id',p.proyecto_id);
      if (!APP.FREQUENCIES.includes(p.frecuencia)) throw appError_('VALIDATION','Frecuencia no válida.');
      const start=isoDateInput_(p.fecha_inicio),next=isoDateInput_(p.proxima_generacion),end=p.fecha_fin?isoDateInput_(p.fecha_fin):'';
      if (next<start || end && (end<start || next>end)) throw appError_('VALIDATION','Revisa el inicio, fin y próxima generación.');
      const days=Number(p.dias_plazo);
      if (!Number.isInteger(days)||days<0||days>3650) throw appError_('VALIDATION','El plazo debe ser un entero entre 0 y 3650 días.');
      Object.assign(record,{nombre:text_(p.nombre,'El nombre es obligatorio.',160),descripcion:text_(p.descripcion||'',null,APP.MAX_TEXT),tipo_id:p.tipo_id,proyecto_id:p.proyecto_id||'',owner_id:p.owner_id,aprobador_id:isTrue_(type.requiere_aprobacion)?p.aprobador_id:'',nivel_aprobacion:p.nivel_aprobacion==='NIVEL_2'?'NIVEL_2':'NIVEL_1',criticidad:APP.CRITICALITY.includes(p.criticidad)?p.criticidad:'MEDIA',frecuencia:p.frecuencia,fecha_inicio:start,fecha_fin:end,dias_plazo:days,proxima_generacion:next,ultimo_error:''});
    }
    if (old) { const patch=Object.assign({},record); delete patch[key]; patchRecord_(sheet,old._row,patch); }
    else appendRecord_(sheet,record);
    logEvent_('',actor.usuario_id,old?'ADMIN_UPDATE':'ADMIN_CREATE',sheet,old?JSON.stringify(old):'',JSON.stringify(record),'Registro '+id);
    return {ok:true,id:id};
  });
}

/**
 * Impide desactivar usuarios que todavía tienen responsabilidades pendientes.
 * @param {*} id - Identificador del registro.
 */
function validateUserDeactivation_(id) {
  const open=readTable_(APP.SHEETS.commitments).filter(c=>isTrue_(c.activo)&&!['CERRADO','ANULADO'].includes(c.estado));
  if (open.some(c=>c.owner_id===id || isTrue_(c.requiere_aprobacion)&&c.aprobador_actual_id===id) || readTable_(APP.SHEETS.approvals).some(a=>a.estado==='PENDIENTE'&&a.aprobador_asignado_id===id)) throw appError_('VALIDATION','Reasigna primero los compromisos y aprobaciones pendientes de esta persona.');
  if (readTable_(APP.SHEETS.recurrences).some(r=>isTrue_(r.activo)&&(r.owner_id===id||r.aprobador_id===id||r.aprobador_actual_id===id))) throw appError_('VALIDATION','Edita o desactiva primero sus recurrencias.');
  if (activeDelegations_().some(d=>d.delegante_id===id||d.delegado_id===id)) throw appError_('VALIDATION','Desactiva primero sus delegaciones.');
}
