/** Contratos compartidos del servidor. Solo documentación JSDoc; no añade peticiones. */

/**
 * Usuario identificado por Google y resuelto en USUARIOS.
 * @typedef {Object} AppUser
 * @property {string} id - usuario_id persistido.
 * @property {string} name - Nombre visible.
 * @property {string} email - Correo corporativo normalizado.
 * @property {string} role - ADMIN o RESPONSABLE.
 */

/**
 * Detalle autorizado que permanece en memoria de la pestaña.
 * @typedef {Object} CommitmentDetail
 * @property {Object} commitment - Fila decorada; _version controla conflictos de escritura.
 * @property {Array<Object>} collaborators - Relaciones activas con nombre visible.
 * @property {Array<Object>} approvals - Solicitudes con _version y canDecide.
 * @property {Array<Object>} evidence - Evidencias autorizadas del compromiso.
 * @property {boolean} isTask - Pertenece a las tareas del usuario actual.
 * @property {Object} permissions - edit, close, reassign y cancel para representación de botones.
 * @property {string} activityVersion - Último ID del historial, sin cargar su contenido.
 * @property {Object} boardTiming - createdOn, stateSince, ageDays y stateDays (null si desconocidos), postponed histórico.
 * @property {string} _syncVersion - Huella del detalle completo para sincronización.
 */

/**
 * Carga inicial; el servidor filtra relaciones según el acceso actual.
 * @typedef {Object} AppSnapshot
 * @property {AppUser} user - Usuario autenticado.
 * @property {boolean} isAdmin - Indicador de representación, nunca prueba de autorización.
 * @property {Array<CommitmentDetail>} details - Datos autorizados de los compromisos visibles.
 * @property {Array<Object>} commitments - Lista derivable de details, compatible con versiones anteriores.
 * @property {Array<Object>} myTasks - Compromisos propios o de colaboración activa.
 * @property {Array<Object>} approvals - Bandeja de aprobaciones pendientes accionables.
 * @property {Array<Object>} people - Referencias de personas sin correos privados.
 * @property {Array<Object>} types - Tipos activos.
 * @property {Array<Object>} projects - Proyectos activos.
 * @property {Array<Object>} users - Usuarios activos solo para ADMIN.
 * @property {Array<Object>} recurrences - Plantillas activas solo para ADMIN.
 * @property {Array<Object>} team - Indicadores del equipo solo para ADMIN.
 * @property {Object} counts - Indicadores de la vista inicial.
 * @property {string} metadataVersion - Huella de los metadatos.
 * @property {string} dataVersion - Huella global, de acceso y de la ventana de revisión.
 */

/**
 * Resultado de una escritura de negocio. El éxito se confirma antes de aplicar cambios locales.
 * @typedef {Object} MutationResult
 * @property {boolean} ok - Operación completada.
 * @property {string} id - ID del compromiso afectado.
 * @property {AppUser} user - Identidad y rol actuales.
 * @property {CommitmentDetail} [detail] - Estado resultante si sigue siendo visible.
 * @property {boolean} [remove] - El actor ya no debe conservar el detalle en su vista.
 * @property {string} [approvalId] - Aprobación creada al enviar evidencia.
 * @property {string} [state] - Estado posterior al envío de evidencia.
 * @property {Object} [comment] - Evento COMMENT guardado o recuperado por idempotencia.
 */

/**
 * Cambios respecto a una instantánea local; no concede acceso por los IDs recibidos.
 * @typedef {Object} SyncDelta
 * @property {Array<CommitmentDetail>} details - Detalles nuevos o modificados.
 * @property {Array<string>} removed - IDs que dejaron de ser visibles.
 * @property {Object|null} metadata - Metadatos nuevos o null cuando no cambian.
 * @property {string} metadataVersion - Huella vigente de metadatos.
 * @property {string} dataVersion - Huella vigente de revisión y autorizaciones.
 */
