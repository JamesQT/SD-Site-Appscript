# Arquitectura de SD Control

SD Control continúa funcionando dentro de Google Workspace: HTML Service para la web, Apps Script para las reglas y Sheets para la persistencia. Los archivos `.gs` comparten el entorno global del proyecto; no son paquetes importables. La separación establece responsabilidades y facilita revisión, pruebas y mantenimiento.

## Servidor

| Archivo | Responsabilidad |
|---|---|
| Code.gs | `doGet` e inclusión de componentes HTML autorizados. |
| Config.gs | Constantes, esquema compatible, selección del Sheet y configuración pública de interfaz. |
| Contracts.gs | Tipos JSDoc de instantáneas, detalles, sincronización y escrituras. |
| Errors.gs | Códigos estables que sobreviven al transporte de Apps Script. |
| Auth.gs | Identidad, acceso, responsabilidad, aprobación y alcance de delegaciones. |
| Validation.gs | Texto, fechas, enlaces, referencias e identificadores. |
| Repository.gs | Lecturas normalizadas, contexto por petición, bloqueo y escrituras agrupadas. |
| Commitments.gs | Creación, avance, reasignación y anulación. |
| Approvals.gs | Evidencias y decisiones de aprobación. |
| Activity.gs | Comentarios, historial paginado y auditoría. |
| Sync.gs | Instantáneas autorizadas, versiones y respuestas incrementales. |
| Performance.gs | Revisiones por tabla, caché de catálogos e índice de última actividad. |
| Changes.gs | Disparadores instalables para ediciones humanas y cambios estructurales en Sheets. |
| Admin.gs | Gestión de usuarios, catálogos, delegaciones y recurrencias; preparación del esquema. |
| Notifications.gs | Cola persistente, entrega y reintento de correos. |
| Automation.gs | Configuración horaria y generación de instancias recurrentes. |

No debe añadirse lógica de negocio a Code.gs. Una operación pública autentica en el servidor, valida sus referencias y utiliza el repositorio para escribir. Las funciones auxiliares terminan en `_`, por lo que no son invocables desde `google.script.run`. No se autoriza una operación porque el navegador muestre su botón.

## Navegador

`Index.html` define la página y `Styles.html` su presentación. `Client.html` evalúa la configuración pública e incluye los componentes siguientes dentro de un único cierre privado. Ninguna función o estado de negocio se exporta a `window`.

| Componente HTML | Responsabilidad |
|---|---|
| ClientCore | Estado y utilidades de presentación, escape de HTML y formularios. |
| ClientApi | Comunicación, carga inicial, cambios locales y sincronización. |
| ClientAdmin | Formularios administrativos y vistas de administración, recurrencias y equipo. |
| ClientViews | Navegación, indicadores, filtros y actualización de tablas por ID. |
| ClientApprovals | Bandeja, selección de revisión y versiones de decisiones. |
| ClientCommitments | Detalle, creación, seguimiento y actividad paginada. |
| ClientEvents | Manejadores de clic y envío, doble clic y arranque de la aplicación. |

Cada componente parcial contiene JavaScript envuelto en `<script>` para que HTML Service lo interprete correctamente. `include` lee ese bloque y extrae su contenido para insertarlo dentro del único cierre privado de Client.html. No se evalúa JavaScript suelto como plantilla HTML ni se insertan etiquetas script anidadas. Los componentes no deben abrirse como páginas independientes.

## Ciclo de una operación

1. Al iniciar, `getAppData` resuelve identidad y visibilidad y devuelve una instantánea autorizada.
2. El navegador abre detalles y aprobaciones desde esa instantánea, sin RPC adicional.
3. Una edición envía ID, versión mostrada y campos modificados. Crear y comentar incorporan un UUID que se conserva durante reintentos.
4. El servidor toma un bloqueo del proyecto, vuelve a validar identidad, permisos, estado y versión y escribe por bloques.
5. La respuesta contiene el detalle afectado o `remove`; el navegador la aplica sin recargar toda la app.
6. La sincronización periódica comprueba cambios y acceso. Una respuesta iniciada antes de una escritura no puede sobrescribir su resultado.

La versión de fila `_version` sirve para conflictos de escritura. La versión de detalle `_syncVersion` incluye relaciones, evidencia y actividad y sirve para sincronizar. `dataVersion` combina revisiones, tablas de acceso y ventana temporal; no es una credencial ni un permiso.

## Rendimiento y coherencia

Una sincronización sin cambios lee USUARIOS, COMPROMISOS, COMPROMISO_USUARIO, APROBACIONES y DELEGACIONES. Comprueba identidad y contenido que puede alterar el acceso antes de omitir la reconstrucción del resto. No guarda permisos en CacheService. La prueba administrativa pasó de 10 a 5 lecturas completas para este caso; esos conteos no representan segundos de latencia real.

La caché de catálogos utiliza claves por Sheet y revisión, con duración máxima solicitada de 300 segundos. Google puede expulsar entradas antes; un fallo o una ausencia provoca una lectura de Sheets. Administración y escrituras consultan datos frescos. El índice de actividad almacena solo el último ID por compromiso; cuando existe, añadir eventos lo extiende sin recorrer nuevamente el historial. No almacena comentarios ni autoriza acceso.

Las escrituras de la web marcan revisiones y las publican bajo bloqueo, incluso si una operación falla después de una escritura parcial. Preparar tablas instala disparadores de edición y cambio estructural desde la cuenta del administrador. Google no dispara esos eventos por escrituras de otros scripts o APIs; por eso **Actualizar** fuerza lecturas nuevas y se hace una revisión completa periódica por ventanas de cinco minutos. Un cambio externo no vigilado puede aparecer en la siguiente sincronización tras esa ventana, más el tiempo de ejecución y red.

Las filas del listado se reutilizan por ID y solo se reemplazan celdas con campos visibles modificados. Los filtros trabajan con índices locales. Una sincronización vacía no reconstruye vistas. Formularios de avance y revisión conservan sus borradores ante cambios externos.

## Límites que permanecen

- Sheets no ofrece una transacción entre varias hojas. El bloqueo coordina scripts de este proyecto; no bloquea una edición manual o una escritura desde otro proyecto.
- La identidad disponible depende de la configuración del despliegue y de Workspace.
- Historial bajo demanda todavía lee su rango usado para filtrar y paginar. El índice reduce las lecturas repetidas para obtener su último ID, no convierte Sheets en una base con índices físicos.
- La carga inicial conserva cerrados y anulados visibles. No se cambió ese comportamiento; una carga separada del archivo histórico puede evaluarse cuando el volumen lo justifique.
- No se implementaron escrituras sin conexión ni persistencia de datos de usuarios en localStorage.
- El entorno de pruebas configurable requiere otro proyecto y una copia del Sheet; no se crearon recursos en Google desde esta sesión.

## Convenciones de mantenimiento

Cada archivo inicia con su responsabilidad y cada función declarada tiene JSDoc de propósito, parámetros y retorno cuando corresponde. Las operaciones que escriben explican autorización y límites de transacción. Los comentarios internos explican decisiones, como preservación de fórmulas, bloqueo, idempotencia o descarte de respuestas antiguas.

Actualiza comentarios, contratos y pruebas al cambiar una regla. Evita agregar comentarios que repitan una asignación evidente. Constantes de roles, estados, criticidad, frecuencias y límites se definen en Config.gs; la interfaz recibe sus valores mediante `getClientConfig_`.

`project-files.json` enumera todas las fuentes desplegables. `tools/check.cjs` valida ese inventario, la sintaxis, las inclusiones y la presencia de documentación de funciones. Los scripts locales y tests no se suben al editor de Apps Script.

Referencias oficiales: [buenas prácticas](https://developers.google.com/apps-script/guides/support/best-practices), [funciones privadas y comunicación](https://developers.google.com/apps-script/guides/html/communication), [caché](https://developers.google.com/apps-script/reference/cache/cache) y [disparadores instalables](https://developers.google.com/apps-script/guides/triggers/installable).
