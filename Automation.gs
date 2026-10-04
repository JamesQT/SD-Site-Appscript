/** Configuración horaria, coordinación de tareas y generación recurrente. */

/**
 * Obtiene la configuración persistida de recurrencias y correos.
 * @returns {Object} Configuración persistida o valores desactivados por defecto.
 */
function automationConfig_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('SD_AUTOMATION')||'{"enabled":false,"email":false}');
}

/**
 * Configura el disparador horario y los correos con el ADMIN propietario.
 * @param {Object} input - Datos de la operación; consultar docs/CONTRATOS.md.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 * @returns {Object} Indicador ok después de guardar configuración y disparador.
 */
function saveAutomationSettings(input) {
  return withLock_(function () {
    const actor=requireAdmin_(),p=input||{},config=automationConfig_();
    const enabled=isTrue_(p.enabled),email=isTrue_(p.email);
    if (config.enabled && config.ownerId!==actor.usuario_id) throw appError_('VALIDATION','La automatización debe administrarla la persona que la activó.');
    ensureExtraSchema_();
    // Comprueba el consentimiento de correo antes de reemplazar el disparador existente.
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

/**
 * Ejecuta recurrencias y entregas bajo bloqueo y autorización administrativa.
 * @throws {Error} Si falla la autorización, validación o, cuando corresponde, control de versión; no existe rollback entre hojas.
 * @returns {Object} Resultado de generación y entrega.
 */
function runOperationsNow() {
  return withLock_(function () { const actor=requireAdmin_(); ensureExtraSchema_(); return runOperations_(actor.usuario_id); });
}

/**
 * Ejecuta la tarea horaria solo para el disparador y ADMIN propietario vigentes.
 * @param {*} event - Evento de Google o del navegador.
 * @returns {Object|undefined} Resultado de operaciones, o undefined si el evento no es vigente.
 */
function scheduledTasks_(event) {
  return withLock_(function () {
    const config=automationConfig_();
    if (!config.enabled||!event||String(event.triggerUid)!==String(config.triggerId)) return;
    const owner=findById_(APP.SHEETS.users,'usuario_id',config.ownerId);
    if (!owner||!isTrue_(owner.activo)||owner.rol_sistema!=='ADMIN') throw appError_('FORBIDDEN','El administrador de la automatización ya no está activo.');
    return runOperations_(owner.usuario_id);
  });
}

/**
 * Coordina generación y correo, registrando resultado y errores de la ejecución.
 * @param {*} actorId - ID del administrador que ejecuta la operación.
 * @returns {Object} Resumen de instancias generadas, mensajes enviados y errores.
 */
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

/**
 * Calcula el siguiente período preservando el día de referencia en meses cortos.
 * @param {*} iso - Fecha en formato YYYY-MM-DD.
 * @param {string} frequency - Frecuencia admitida en APP.FREQUENCIES.
 * @param {string} anchor - Fecha de referencia que conserva el día de las recurrencias mensuales.
 * @returns {string} Fecha del período siguiente.
 */
function nextRecurrenceDate_(iso,frequency,anchor) {
  if (frequency==='DIARIA'||frequency==='SEMANAL') return shiftDays_(iso,frequency==='DIARIA'?1:7);
  const months={MENSUAL:1,TRIMESTRAL:3,ANUAL:12}[frequency];
  if (!months) throw appError_('VALIDATION','Frecuencia no válida: '+frequency);
  const d=new Date(isoDateInput_(iso)+'T12:00:00Z');
  const day=Number(isoDateInput_(anchor||iso).slice(8,10));
  d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);
  const last=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();
  d.setUTCDate(Math.min(day,last));return d.toISOString().slice(0,10);
}

/**
 * Genera instancias idempotentes y avanza cada plantilla después de persistirlas.
 * @param {*} actorId - ID del administrador que ejecuta la operación.
 * @returns {Object} Resumen con generated y errors.
 */
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
      if (next<start) throw appError_('VALIDATION','Próxima generación anterior al inicio.');
      const type=requireActiveReference_('types','tipo_id',r.tipo_id);
      requireActiveUserId_(r.owner_id);
      const approver=r.aprobador_id||r.aprobador_actual_id||'';
      if (isTrue_(type.requiere_aprobacion)) { requireActiveUserId_(approver);if(approver===r.owner_id) throw appError_('VALIDATION','Responsable y aprobador iguales.'); }
      if(r.proyecto_id) requireActiveReference_('projects','proyecto_id',r.proyecto_id);
      const days=r.dias_plazo===''||r.dias_plazo==null?7:Number(r.dias_plazo);
      if(!Number.isInteger(days)||days<0||days>3650) throw appError_('VALIDATION','Plazo no válido.');
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
