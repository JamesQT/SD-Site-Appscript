/** Cola de avisos, entrega y reintentos sin revertir operaciones de negocio. */

/**
 * Resume la cola de notificaciones y el estado de la automatización.
 * @returns {Object} Estado horario, propietario e indicadores de cola.
 */
function notificationStatus_() {
  const config=automationConfig_();
  const book=getSpreadsheet_();
  const queue=book.getSheetByName('NOTIFICACIONES')?readTable_('NOTIFICACIONES'):[];
  return {enabled:!!config.enabled,email:!!config.email,ownerId:config.ownerId||'',lastRun:config.lastRun||'',lastError:config.lastError||'',pending:queue.filter(n=>n.estado==='PENDIENTE').length,failed:queue.filter(n=>['ERROR','ENVIANDO'].includes(n.estado)).length};
}

/**
 * Encola avisos del evento; un fallo de cola no revierte el compromiso guardado.
 * @param {Object} c - Registro del compromiso.
 * @param {*} event - Evento de Google o del navegador.
 * @param {*} detail - Detalle autorizado o texto explicativo, según la función.
 * @param {Array<string>} recipientIds - IDs de destinatarios; se eliminan valores vacíos y duplicados.
 */
function notifyEvent_(c,event,detail,recipientIds) {
  if (!automationConfig_().email) return;
  try {
    const labels={ASSIGN:'Nuevo compromiso asignado',SUBMIT:'Solicitud de aprobación',APROBAR:'Compromiso aprobado',DEVOLVER:'Compromiso devuelto',REASSIGN:'Compromiso reasignado',CANCEL:'Compromiso anulado',CLOSE:'Compromiso cerrado'};
    appendRecords_('NOTIFICACIONES',[...new Set(recipientIds.filter(Boolean))].map(id=>({
      notificacion_id:nextId_('NTF'),compromiso_id:c.compromiso_id,usuario_id:id,evento:event,
      asunto:'SD Control · '+(labels[event]||event),mensaje:(labels[event]||event)+'\n\n'+c.titulo+'\nID: '+c.compromiso_id+'\nFecha objetivo: '+toIsoDate_(c.fecha_objetivo)+'\n\n'+(detail||''),estado:'PENDIENTE',intentos:0,created_at:new Date(),sent_at:'',ultimo_error:''
    })));
  } catch(error) {
    // Muestra el fallo de cola sin presentar como fallida una operación de negocio ya guardada.
    const config=automationConfig_();config.lastError='No se pudo registrar el aviso: '+error.message;
    PropertiesService.getScriptProperties().setProperty('SD_AUTOMATION',JSON.stringify(config));
  }
}

/**
 * Entrega avisos con cupo disponible y deja ENVIANDO para revisar interrupciones.
 * @returns {number} Cantidad de mensajes enviados en esta ejecución.
 */
function deliverNotifications_() {
  const quota=MailApp.getRemainingDailyQuota();let sent=0;
  const queue=readTable_('NOTIFICACIONES').filter(n=>n.estado==='PENDIENTE').slice(0,Math.min(20,quota));
  queue.forEach(n=>{
    const user=findById_(APP.SHEETS.users,'usuario_id',n.usuario_id);
    if (!user||!isTrue_(user.activo)) {patchRecord_('NOTIFICACIONES',n._row,{estado:'OMITIDO',ultimo_error:'Destinatario inactivo.'});return;}
    const c=findById_(APP.SHEETS.commitments,'compromiso_id',n.compromiso_id);
    const obsolete=n.evento==='SUBMIT' && (!c || c.estado!=='EN_APROBACION' || c.aprobador_actual_id!==n.usuario_id) || ['ASSIGN','REASSIGN'].includes(n.evento) && (!c || ['CERRADO','ANULADO'].includes(c.estado) || ![c.owner_id,c.aprobador_actual_id].includes(n.usuario_id));
    if (obsolete) {patchRecord_('NOTIFICACIONES',n._row,{estado:'OMITIDO',ultimo_error:'La asignación o solicitud ya no está vigente.'});return;}
    const attempts=(Number(n.intentos)||0)+1;
    // Una entrega interrumpida queda ENVIANDO para revisión; reintentar automáticamente podría duplicarla.
    patchRecord_('NOTIFICACIONES',n._row,{intentos:attempts,estado:'ENVIANDO'});SpreadsheetApp.flush();
    try {
      MailApp.sendEmail({to:user.correo_corporativo,subject:n.asunto,body:n.mensaje,name:'SD Control'});
    } catch(error) {
      patchRecord_('NOTIFICACIONES',n._row,{estado:attempts>=3?'ERROR':'PENDIENTE',ultimo_error:String(error.message).slice(0,1000)});return;
    }
    patchRecord_('NOTIFICACIONES',n._row,{estado:'ENVIADO',sent_at:new Date(),ultimo_error:''});sent++;
  });
  return sent;
}

/**
 * Reencola un aviso fallido con motivo y auditoría; exige ADMIN.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 * @returns {Object} Indicador ok después de reencolar el aviso.
 */
function retryNotification(input) {
  return withLock_(function () {
    const actor=requireAdmin_(),p=input||{};
    const n=findById_('NOTIFICACIONES','notificacion_id',p.notificacion_id);
    if (!n||!['ERROR','ENVIANDO'].includes(n.estado)) throw appError_('VALIDATION','Solo se reintentan correos con error o entrega pendiente de revisión.');
    const reason=text_(p.motivo,'Indica por qué se reintentará el correo.',APP.MAX_TEXT);
    requireActiveUserId_(n.usuario_id);
    patchRecord_('NOTIFICACIONES',n._row,{estado:'PENDIENTE',intentos:0,ultimo_error:''});
    logEvent_(n.compromiso_id,actor.usuario_id,'MAIL_RETRY','notificacion_id',n.estado,n.notificacion_id,reason);
    return {ok:true};
  });
}
