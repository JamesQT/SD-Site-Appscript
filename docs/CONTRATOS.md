# Contratos de operaciones

Las fechas de negocio usan `YYYY-MM-DD`, con validación del calendario. Los IDs se conservan como cadenas; no deben editarse manualmente. Las respuestas no contienen objetos Date: el repositorio los normaliza antes de enviarlos al navegador. `_row` es una referencia interna de posición y no concede permiso de escritura.

## Lectura y sincronización

`runWithProfile(name, args, role)` ejecuta una operación permitida con el perfil efectivo solicitado; exige una cuenta real ADMIN. `role` admite ADMIN y RESPONSABLE. Las instantáneas incluyen `canSwitchProfile` para mostrar el selector a la cuenta real autorizada. Consultar [PERFILES.md](PERFILES.md).

| Operación | Entrada | Resultado |
|---|---|---|
| getAppData | Sin argumentos | AppSnapshot: usuario, detalles autorizados, listas compatibles, referencias, indicadores y versiones. |
| syncAppData | `{versions, metadataVersion, dataVersion, force?}` | SyncDelta: `details`, `removed`, `metadata`, `metadataVersion`, `dataVersion`. |
| getCommitmentDetail | `compromiso_id` | Compromiso, colaboradores, aprobaciones y evidencias autorizados. La nueva interfaz abre desde memoria local. |
| getCommitmentActivity | `compromiso_id, beforeRow?` | `{history, nextCursor, activityVersion}`; hasta 40 eventos, nuevos primero. |
| getAdminData | Sin argumentos | Tablas administrativas y estado de automatización; exige ADMIN. |

`versions` es un objeto con ID de compromiso como clave y `_syncVersion` como valor. Tiene un máximo de 20.000 claves. `force: true` evita el atajo de sincronización y fuerza catálogos y última actividad frescos. Una colección vacía de cambios y `metadata: null` permite conservar las vistas actuales. `removed` incluye IDs del cliente que ya no son visibles, incluso si fueron enviados manualmente; el cliente no puede solicitar acceso inventando un ID.

`nextCursor` es una fila exclusiva. Para cargar otra página, se envía el cursor anterior; `null` indica fin. `activityVersion` corresponde al evento más reciente del compromiso, también al consultar páginas antiguas. Si el historial se reordena manualmente, conviene volver a cargarlo desde el comienzo.

Cada detalle autorizado incluye `boardTiming: {createdOn, stateSince, ageDays, stateDays, postponed}`. Las fechas usan YYYY-MM-DD y los días se calculan en Lima. Un contador desconocido es `null`; `postponed` es verdadero si existe alguna postergación auditada. Estos indicadores participan en `_syncVersion`, sin modificar `commitment._version`. Consultar [KANBAN.md](KANBAN.md).

## Escrituras de compromisos

| Operación | Datos requeridos | Condiciones principales |
|---|---|---|
| createCommitment | `titulo, tipo_id, fecha_objetivo, request_id`; ADMIN también `owner_id`; `aprobador_id` si aplica | Referencias activas; responsable distinto del aprobador; UUID v4 para reintentos. |
| updateCommitment | `compromiso_id, expected_version, changes` | Estado abierto, permiso de gestión y versión actual. |
| submitEvidence | `compromiso_id, expected_version, comentario`; `url` o `evidencia_id`; `nombre` opcional para enlace | Responsable o ADMIN; estado abierto; requisitos cerrados; HTTPS o archivo previamente adjunto al mismo compromiso. |
| uploadCommitmentFile | `compromiso_id, expected_version, request_id, nombre, base64, comentario` | Responsable o ADMIN; versión obligatoria; máximo 5 MiB; UUID v4 ligado al archivo, autor y compromiso. Adjuntar no cambia estado. |
| saveCommitmentDependencies | `compromiso_id, expected_version, dependencies` | Responsable o ADMIN; abierto, versión obligatoria, hasta 20 IDs visibles, sin duplicados, autorreferencias ni ciclos. |
| decideApproval | `aprobacion_id, expected_version, approval_version, decision, comentario` | Solicitud pendiente y decisión APROBAR o DEVOLVER; actor asignado o delegado vigente; no autocierre. |
| reassignCommitment | `compromiso_id, expected_version, owner_id, aprobador_id, motivo` | ADMIN; compromiso no cerrado ni anulado; referencias activas y coherentes. |
| cancelCommitment | `compromiso_id, expected_version, motivo` | Responsable o ADMIN; compromiso no cerrado ni anulado. |
| addCommitmentComment | `compromiso_id, comentario, request_id` | Acceso al compromiso y UUID v4 ligado a ese compromiso y autor. |

Campos opcionales de creación: `descripcion, subtipo, proyecto_id, criticidad, nivel_aprobacion`. Los estados y enumeraciones admitidos se definen en Config.gs.

`changes` acepta únicamente `estado, porcentaje_avance, descripcion, fecha_objetivo`. Estado debe pertenecer a OPEN_STATUS; avance es un número finito entre 0 y 99. Cierre y envío a aprobación tienen operaciones propias. Los campos ausentes no se reemplazan. La interfaz omite la llamada si no detecta cambios.

Si `fecha_objetivo` aumenta respecto a la fecha actual, `updateCommitment` exige `motivo_postergacion` fuera de `changes`: texto no vacío de hasta 2000 caracteres. La comprobación ocurre antes de escribir cualquier campo. Misma fecha, adelanto y primera asignación a un registro antiguo sin fecha no requieren motivo. El evento UPDATE de fecha conserva valor anterior, nuevo, autor, fecha y motivo en `detalle`.

Los detalles incluyen `baseline: {originalDate, source, delayDays, postponementCount}`. `source` es CREACION, HISTORIAL (primera fecha disponible) o REFERENCIA_ACTUAL (origen desconocido). `delayDays` mide desviación neta positiva frente a esa referencia; `postponementCount` cuenta aumentos auditados, aunque después se adelante la entrega. `boardTiming` añade `asOfDate` y `hasStateChange` para distinguir tarjetas nuevas de cambios de estado reales.

Las versiones proceden de la vista que el usuario abrió, no de una actualización silenciosa posterior. La interfaz siempre las envía. Para compatibilidad con integraciones anteriores, el servidor conserva la entrada antigua de actualización y permite omitir versiones; cualquier integración nueva debe usar el contrato de versión documentado.

Una respuesta MutationResult contiene `{ok, id, user}` y `detail` si sigue siendo visible, o `remove: true` si se perdió acceso. Envío de evidencia añade `state` y, cuando aplica, `approvalId`; comentarios añaden `comment`. El navegador actualiza su estado solo después de una respuesta exitosa.

Subir archivo añade `archivo_id` y `evidencia_id`. Su UUID permite recuperar la misma evidencia tras un error de comunicación, incluso si posteriormente se cerró el compromiso, siempre con permiso actual. Reutilizarlo con otro contenido, nombre, descripción, autor o compromiso produce CONFLICT. Los detalles sincronizados incorporan `dependencies: {items, pending, total}`; una referencia inaccesible solo contiene un título genérico y `done`. El JSON interno de IDs no se envía al cliente. Enviar evidencia y decidir APROBAR comprueban requisitos activos y cerrados bajo bloqueo; DEVOLVER permanece disponible.

Crear y comentar conservan su UUID ante errores de comunicación. Un UUID repetido recupera el resultado anterior; no representa una nueva operación. Un comentario no puede reutilizar el UUID de otro compromiso o autor. Evidencia y decisión también validan estado y versión: repetir el envío después de completarlo se rechaza en lugar de crear otra solicitud. La entrega de correo no puede garantizar exactamente una entrega entre servicios; ENVIANDO requiere revisión manual.

## Administración y automatización

`saveAdminRecord` recibe `{section, id?, request_id, activo, ...campos}`. Secciones: users, types, projects, delegations y recurrences. `id` edita un registro existente; sin él, el UUID identifica un alta idempotente. Campos y reglas específicas se encuentran en Admin.gs y las definiciones de formulario en ClientAdmin.html. La desactivación respeta responsabilidades pendientes y exige conservar al menos un ADMIN activo.

`initializeFeatures` no recibe argumentos. Exige ADMIN, completa encabezados faltantes, crea NOTIFICACIONES cuando hace falta e instala detección de cambios en Sheets. No elimina filas ni columnas adicionales.

`saveAutomationSettings` recibe `{enabled, email}` y administra el disparador horario desde su ADMIN propietario. `runOperationsNow` ejecuta tareas pendientes como ADMIN. `retryNotification` recibe `{notificacion_id, motivo}` y solo permite estados ERROR o ENVIANDO.

Los manejadores `scheduledTasks_`, `trackSheetEdit_` y `trackSheetChange_` son privados y comprueban el ID del disparador instalado. No deben exponerse como operaciones de la interfaz ni usarse con objetos inventados en el despliegue real.

## Errores

| Código | Significado | Comportamiento de la interfaz |
|---|---|---|
| AUTH | Google no devolvió identidad o el usuario no está activo | Al sincronizar, limpia datos locales y cierra vistas y diálogos. |
| FORBIDDEN | Identidad válida sin permiso para la operación | Muestra el motivo y conserva el formulario. |
| VALIDATION | Entrada, referencia o estado inválido | Permite corregir el formulario. |
| CONFLICT | La versión mostrada ya cambió | Conserva el borrador, pide sincronización y ofrece actualizar explícitamente el detalle. |
| CONFIGURATION | Sheet, entorno o esquema incorrecto | Muestra el problema para que lo corrija administración. |
| TECHNICAL | Error de servicio o comunicación sin código de negocio | Conserva lo escrito; una sincronización fallida queda pendiente. |

El servidor lanza `Error` con prefijo `CODIGO: mensaje`, porque google.script.run transporta el mensaje del error. ClientApi reconstruye `error.code` y un mensaje sin prefijo para la interfaz. Los registros de rendimiento contienen nombres de operaciones, duraciones y conteos; no incluyen el contenido de formularios.
