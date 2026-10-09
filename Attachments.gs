/** Archivos de evidencia privados en Drive; no realiza transiciones de cierre. */
const EVIDENCE_MIME=Object.freeze({pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',txt:'text/plain',csv:'text/csv',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'});

/**
 * Calcula la huella de bytes para reconocer un reintento incluso tras un fallo entre servicios.
 * @param {Array<number>} bytes - Contenido binario del archivo.
 * @returns {string} SHA-256 hexadecimal.
 */
function fileDigest_(bytes) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,bytes).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
}

/**
 * Recupera o crea una carpeta por Sheet y usuario, aislando también el entorno de pruebas.
 * @param {Object} actor - Usuario que adjunta los archivos.
 * @returns {Folder} Carpeta privada para las evidencias de ese Sheet.
 */
function evidenceFolder_(actor) {
  const properties=PropertiesService.getScriptProperties(),key='SD_EVIDENCE_FOLDER_'+hashValue_([spreadsheetId_(),actor.usuario_id]).slice(0,20),id=properties.getProperty(key);
  if(id) {
    try{return DriveApp.getFolderById(id);}catch(error){throw appError_('CONFIGURATION','No se puede acceder a la carpeta de evidencias. Revisa los permisos de Drive.');}
  }
  const folder=DriveApp.createFolder('SD Control - Evidencias - '+actor.nombre+' - '+hashValue_(spreadsheetId_()).slice(0,8));
  properties.setProperty(key,folder.getId());return folder;
}

/**
 * Concede lectura a participantes activos y administradores, sin enlaces públicos.
 * @param {File} file - Archivo recién creado o recuperado por reintento.
 * @param {Object} commitment - Compromiso autorizado.
 * @param {Object} actor - Usuario que adjunta el archivo.
 */
function shareEvidenceFile_(file,commitment,actor) {
  const participants=new Set([actor.usuario_id,commitment.owner_id,commitment.aprobador_actual_id]);
  readTable_(APP.SHEETS.collaborators).filter(r=>r.compromiso_id===commitment.compromiso_id&&isTrue_(r.activo)).forEach(r=>participants.add(r.usuario_id));
  const delegations=activeDelegations_();
  const emails=readTable_(APP.SHEETS.users).filter(u=>isTrue_(u.activo)&&(participants.has(u.usuario_id)||u.rol_sistema==='ADMIN'||commitment.aprobador_actual_id&&canApprove_({aprobador_asignado_id:commitment.aprobador_actual_id},commitment,u,delegations))).map(u=>String(u.correo_corporativo||'').trim()).filter(Boolean);
  if(emails.length)file.addViewers([...new Set(emails)]);
}

/**
 * Adjunta hasta 5 MiB, con versión, acceso y UUID de reintento ligado a contenido y autor.
 * @param {Object} input - compromiso_id, expected_version, request_id, nombre, base64 y comentario.
 * @returns {MutationResult} Detalle autorizado con archivo_id y evidencia_id.
 */
function uploadCommitmentFile(input) {
  return withLock_(function(){
    const p=input||{},access=authorizedCommitment_(p.compromiso_id),actor=access.actor,c=access.commitment;
    if(!canManageCommitment_(c,actor))throw appError_('FORBIDDEN','No puedes adjuntar archivos a este compromiso.');
    const id=requestRecordId_('UPL',p.request_id),name=text_(p.nombre,'Selecciona un archivo.',180).replace(/[\/\\\x00-\x1f]/g,'_');
    const extension=name.split('.').pop().toLowerCase(),mime=EVIDENCE_MIME[extension],base64=p.base64;
    if(!mime)throw appError_('VALIDATION','Formato permitido: PDF, imágenes PNG/JPG/WebP, TXT/CSV y Office DOCX/XLSX/PPTX.');
    if(typeof base64!=='string'||!base64||base64.length>Math.ceil(5*1024*1024/3)*4||base64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw appError_('VALIDATION','El archivo no es válido o supera 5 MiB.');
    let bytes;try{bytes=Utilities.base64Decode(base64);}catch(error){throw appError_('VALIDATION','Contenido de archivo inválido.');}
    if(!bytes.length||bytes.length>5*1024*1024||Utilities.base64Encode(bytes)!==base64)throw appError_('VALIDATION','El archivo no es válido o supera 5 MiB.');
    const digest=fileDigest_(bytes),comment=text_(p.comentario,'Describe el archivo que adjuntas.',APP.MAX_TEXT);
    const previous=findById_(APP.SHEETS.evidence,'evidencia_id',id);
    if(previous) {
      if(previous.compromiso_id!==c.compromiso_id||previous.usuario_id!==actor.usuario_id||previous.archivo_hash!==digest||previous.nombre_archivo!==name||previous.comentario!==comment)throw appError_('CONFLICT','Ese identificador ya corresponde a otro archivo.');
      return mutationResult_(c.compromiso_id,actor,{archivo_id:previous.drive_file_id,evidencia_id:id});
    }
    if(!APP.OPEN_STATUS.includes(c.estado)||!isTrue_(c.activo))throw appError_('VALIDATION','Solo puedes adjuntar antes del envío a aprobación o cierre.');
    if(!p.expected_version)throw appError_('VALIDATION','Falta la versión del compromiso.');
    assertExpectedVersion_(c,p.expected_version);
    const folder=evidenceFolder_(actor),fileName=id+'--'+hashValue_([c.compromiso_id,actor.usuario_id]).slice(0,12)+'--'+name,found=folder.getFilesByName(fileName);
    let file;
    if(found.hasNext()) {
      file=found.next();
      if(file.getDescription()&&file.getDescription()!==JSON.stringify([c.compromiso_id,actor.usuario_id,digest])||fileDigest_(file.getBlob().getBytes())!==digest)throw appError_('CONFLICT','No se puede reutilizar este archivo. Usa una nueva solicitud.');
      if(!file.getDescription())file.setDescription(JSON.stringify([c.compromiso_id,actor.usuario_id,digest]));
    } else {
      file=folder.createFile(Utilities.newBlob(bytes,mime,fileName));
      file.setDescription(JSON.stringify([c.compromiso_id,actor.usuario_id,digest]));
    }
    shareEvidenceFile_(file,c,actor);
    const sheet=getSheet_(APP.SHEETS.evidence),headers=tableHeaders_(APP.SHEETS.evidence);
    if(!headers.includes('archivo_hash')) {
      if(headers.length+1>sheet.getMaxColumns())sheet.insertColumnsAfter(sheet.getMaxColumns(),1);
      sheet.getRange(1,headers.length+1).setValue('archivo_hash');invalidateTable_(APP.SHEETS.evidence,true);
    }
    appendRecord_(APP.SHEETS.evidence,{evidencia_id:id,compromiso_id:c.compromiso_id,aprobacion_id:'',usuario_id:actor.usuario_id,fecha_subida:new Date(),tipo_evidencia:'ARCHIVO',nombre_archivo:name,drive_file_id:file.getId(),url_drive:file.getUrl(),comentario:comment,archivo_hash:digest});
    logEvent_(c.compromiso_id,actor.usuario_id,'UPLOAD','','','',name);
    return mutationResult_(c.compromiso_id,actor,{archivo_id:file.getId(),evidencia_id:id});
  });
}
