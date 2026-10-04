/** Configuración, constantes y esquema compatible de Sheets. */
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
  MAX_TEXT: 2000,
  ROLES: ['ADMIN','RESPONSABLE'],
  CRITICALITY: ['BAJA','MEDIA','ALTA','CRITICA'],
  APPROVAL_LEVELS: ['NIVEL_1','NIVEL_2'],
  FREQUENCIES: ['DIARIA','SEMANAL','MENSUAL','TRIMESTRAL','ANUAL'],
  EDITABLE_FIELDS: ['estado','porcentaje_avance','descripcion','fecha_objetivo'],
  ACTIVITY_PAGE_SIZE: 40,
  SYNC_INTERVAL_MS: 60000,
  FULL_CHECK_INTERVAL_MS: 300000,
  CATALOG_CACHE_SECONDS: 300,
  HTML_COMPONENTS: ['Styles','Client','ClientCore','ClientApi','ClientAdmin','ClientViews','ClientApprovals','ClientCommitments','ClientEvents']
});

/**
 * Resuelve el Sheet del entorno, sin cambiar el ID de producción por defecto.
 * @returns {string} ID configurado mediante SD_SPREADSHEET_ID o el ID original.
 * @throws {Error} Si el entorno PRUEBAS no tiene un Sheet distinto de producción.
 */
function spreadsheetId_() {
  if(readContext_ && readContext_.sheetId) return readContext_.sheetId;
  const properties=PropertiesService.getScriptProperties();
  const configured=properties.getProperty('SD_SPREADSHEET_ID');
  if (environment_()==='PRUEBAS' && (!configured || configured===APP.SPREADSHEET_ID)) {
    throw appError_('CONFIGURATION','El entorno PRUEBAS necesita un SD_SPREADSHEET_ID distinto al de producción.');
  }
  const id=configured || APP.SPREADSHEET_ID;
  if(readContext_) readContext_.sheetId=id;
  return id;
}

/** Devuelve el entorno declarado en las propiedades del proyecto. */
function environment_() {
  if(readContext_ && readContext_.environment) return readContext_.environment;
  const value=PropertiesService.getScriptProperties().getProperty('SD_ENV') || 'PRODUCCION';
  if (!['PRODUCCION','PRUEBAS'].includes(value)) throw appError_('CONFIGURATION','SD_ENV debe ser PRODUCCION o PRUEBAS.');
  if(readContext_) readContext_.environment=value;
  return value;
}

/** Expone únicamente constantes de interfaz; no incluye IDs ni propiedades privadas. */
function getClientConfig_() {
  return {roles:APP.ROLES,criticality:APP.CRITICALITY,levels:APP.APPROVAL_LEVELS,
    frequencies:APP.FREQUENCIES,status:APP.STATUS,openStatus:APP.OPEN_STATUS,
    editableFields:APP.EDITABLE_FIELDS,maxText:APP.MAX_TEXT,syncIntervalMs:APP.SYNC_INTERVAL_MS,environment:environment_()};
}

const EXTRA_SCHEMAS = {
  USUARIOS: ['usuario_id','nombre','correo_corporativo','rol_sistema','activo','created_at','updated_at','updated_by'],
  TIPOS_COMPROMISO: ['tipo_id','nombre','descripcion','requiere_aprobacion','activo','created_at','updated_at','updated_by'],
  PROYECTOS: ['proyecto_id','nombre','descripcion','activo','created_at','updated_at','updated_by'],
  DELEGACIONES: ['delegacion_id','delegante_id','delegado_id','nivel_aprobacion','alcance_tipo','tipo_id','proyecto_id','fecha_inicio','fecha_fin','activo','created_at','updated_at','updated_by'],
  RECURRENCIAS: ['recurrencia_id','nombre','descripcion','tipo_id','proyecto_id','owner_id','aprobador_id','nivel_aprobacion','criticidad','frecuencia','fecha_inicio','fecha_fin','dias_plazo','proxima_generacion','activo','created_at','updated_at','updated_by','ultimo_error'],
  NOTIFICACIONES: ['notificacion_id','compromiso_id','usuario_id','evento','asunto','mensaje','estado','intentos','created_at','sent_at','ultimo_error']
};
