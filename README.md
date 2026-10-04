# SD Control — administración y automatización

## Actualización de la aplicación

1. Conserva una copia del proyecto y del Sheet.
2. Reemplaza **Code.gs, Index.html, Client.html y Styles.html** en Apps Script. Mantén los nombres HTML: Index, Client y Styles. No necesitas archivos adicionales de código.
3. Guarda y actualiza la implementación para utilizar la nueva versión.
4. Ingresa como ADMIN y abre **Administración → Preparar o actualizar tablas**. Se añaden los encabezados faltantes al final de las hojas existentes y se crea NOTIFICACIONES, conservando datos, IDs y columnas adicionales. Puedes repetir esta acción. Si hay encabezados duplicados, corrígelos primero.
5. En Automatización y correos, marca **Activar ejecución cada hora** y, para enviar avisos, **Enviar notificaciones por correo**. Guarda la configuración con el administrador que se hará cargo. Google requiere autorizar correo y disparadores; completa el consentimiento si la implementación lo solicita.
6. Usa **Ejecutar ahora** para generar las instancias programadas y entregar mensajes pendientes. Revisa el resultado y los errores en Administración.

Los archivos locales no actualizan por sí solos el proyecto de Google. Las pruebas incluidas usan servicios simulados y no envían correos reales.

## Usuarios

Administración permite crear, editar, activar y desactivar usuarios. El ID se genera automáticamente, el correo se normaliza y no admite duplicados, incluso entre usuarios inactivos. Los roles admitidos son ADMIN y RESPONSABLE; los permisos se verifican en el servidor y debe quedar al menos un ADMIN activo.

Antes de desactivar una persona, reasigna sus compromisos y aprobaciones pendientes, edita o desactiva sus recurrencias y desactiva sus delegaciones. Si administra una automatización activa, debe desactivarla primero.

El alta en USUARIOS **no comparte el Sheet ni concede acceso al despliegue**. La identidad se obtiene del correo de Google activo. Al ejecutar como el usuario que accede, cada persona necesita permisos sobre el Sheet. Limita la audiencia según la organización. Los permisos de la web no impiden las ediciones directas de alguien que ya tenga acceso de edición a las hojas.

## Compromisos y seguimiento

- Creación, filtros, avance, estado abierto, descripción, fecha, evidencia y aprobación conservan el flujo existente.
- Para tipos sin aprobación, responsable o ADMIN puede cerrar directamente con evidencia y comentario.
- ADMIN puede **reasignar responsable y aprobador con motivo** desde el detalle. También se actualiza el aprobador de las solicitudes pendientes. Se conserva la evidencia y se auditan los cambios.
- Quien tenga acceso al detalle puede publicar **comentarios de seguimiento** sin reemplazar la descripción. Se guardan en HISTORIAL como eventos COMMENT y aparecen en Seguimiento.
- Responsable o ADMIN puede **anular con motivo**. Se conserva el historial y se anulan las solicitudes pendientes. Una solicitud anulada ya no puede aprobarse. El listado incluye el filtro Anulado.
- Formularios bloqueados durante el envío; creación y comentarios usan UUIDs para resistir reintentos. Las revisiones descartan respuestas antiguas y muestran la evidencia vinculada a la aprobación seleccionada.
- El responsable no puede aprobar su propio cierre, tampoco por delegación.

## Tipos, proyectos y delegaciones

Administración permite crear, editar, activar y desactivar tipos y proyectos. Desactivar una opción la retira de nuevas selecciones sin borrar registros históricos. Si una plantilla recurrente activa la usa, edita o desactiva primero esa plantilla.

El requisito de aprobación se copia al crear cada compromiso. Cambiar el tipo no altera retroactivamente los compromisos existentes.

Las delegaciones tienen delegante, delegado, fechas inclusivas de inicio y fin y alcance Global, Tipo o Proyecto. Solo aplica NIVEL_1; NIVEL_2 no se delega. Catálogos generales sigue como consulta: la gestión incorporada corresponde a tipos y proyectos.

## Recurrencias

Línea base permite crear plantillas y abrir su administración. Configura nombre, descripción, tipo, proyecto, responsable, aprobador, nivel, criticidad, frecuencia, fecha inicial, fecha final opcional, próxima generación y días de plazo.

- Frecuencias: DIARIA, SEMANAL, MENSUAL, TRIMESTRAL y ANUAL.
- Cada instancia vence tantos días después de su fecha programada como indique dias_plazo, entre 0 y 3650. Las plantillas anteriores con plazo vacío usan 7 días.
- La fecha inicial fija el día de referencia para frecuencias por meses. Una plantilla del día 31 usa el último día en meses cortos y recupera el 31 cuando es posible. En plantillas antiguas sin fecha_inicio, se guarda como referencia la próxima fecha al ejecutarlas.
- La ejecución horaria genera hasta 50 períodos pendientes, incluyendo atrasados. Puedes repetir Ejecutar ahora para completar cargas grandes.
- Los IDs combinan plantilla y fecha programada. Repetir una ejecución o recuperar una fecha anterior no duplica esa instancia.
- La próxima fecha se actualiza después de cada período. Al superar fecha_fin, la plantilla se desactiva. Un error queda en ultimo_error y no bloquea las demás plantillas.
- Si una plantilla antigua usa otra frecuencia o no tiene referencias activas válidas, edítala antes de generar.

## Correos y automatización

Se generan avisos de asignación, solicitud de aprobación, aprobación, devolución, reasignación, anulación y cierre directo. Las solicitudes avisan al aprobador asignado; los delegados consultan su bandeja según la delegación. No se envían avisos retroactivos por eventos previos a la activación.

Los avisos se guardan en NOTIFICACIONES y se entregan en la ejecución horaria o con Ejecutar ahora. Por defecto, correos y automatización están desactivados hasta guardar la configuración.

La tarea programada se ejecuta desde la cuenta del ADMIN que la activó. Solo esa persona puede administrar una automatización que sigue activa. Una vez desactivada, otro ADMIN puede tomarla a su cargo.

Se entregan hasta 20 mensajes por ejecución, respetando el cupo disponible de MailApp. Sin cupo, quedan pendientes. Se omiten destinatarios inactivos y avisos de asignación o aprobación que ya no están vigentes.

Después de tres errores de entrega, un mensaje queda en ERROR. Si una ejecución se interrumpe durante la entrega, puede quedar ENVIANDO. Comprueba si ya llegó antes de reintentar: enviar correo y escribir en Sheets no son una transacción única. Administración → Correos muestra los últimos 100 avisos y permite reintentar ERROR y ENVIANDO con motivo. Todas las filas permanecen en NOTIFICACIONES.

Un fallo de entrega no deshace el compromiso guardado. La configuración muestra la última ejecución y los errores de generación o de registro de avisos.

Referencias: [MailApp](https://developers.google.com/apps-script/reference/mail/mail-app) y [disparadores temporales](https://developers.google.com/apps-script/reference/script/clock-trigger-builder).

## Estructura y compatibilidad

Se añaden metadatos de auditoría faltantes a USUARIOS, TIPOS_COMPROMISO, PROYECTOS y DELEGACIONES. RECURRENCIAS añade, si faltan, referencias, nivel, fechas, dias_plazo, ultimo_error y metadatos de auditoría. Se crea NOTIFICACIONES para la cola de correo. HISTORIAL conserva su estructura y almacena comentarios y eventos administrativos.

El ID del Sheet y America/Lima se conservan. Los IDs anteriores siguen siendo válidos; las altas y compromisos nuevos usan UUIDs, y las instancias recurrentes usan plantilla y fecha. No edites los IDs manualmente. EVIDENCIAS sigue guardando enlaces HTTPS: no sube archivos ni verifica sus permisos. Sustituye los datos ficticios antes de operar.

## Pruebas

### Navegación local y sincronización

Para instalar esta actualización, reemplaza juntos Code.gs, Client.html, Index.html y Styles.html, guarda y actualiza la implementación de Apps Script con una nueva versión. No requiere cambios adicionales al esquema de las hojas si ya instalaste las funciones anteriores.

El inicio carga una instantánea de los compromisos autorizados, permisos, evidencias y aprobaciones. Abrir detalles o revisar aprobaciones utiliza esa memoria del navegador: cero llamadas al servidor. Historial y comentarios anteriores se consultan al pulsar Ver historial y comentarios, en páginas de 40 eventos. Las respuestas de ventanas cerradas se descartan.

La web consulta cambios cada 60 segundos mientras está visible, al volver a la pestaña y al pulsar Actualizar. El servidor vuelve a verificar usuario y acceso, lee las tablas y devuelve únicamente detalles modificados, eliminaciones de acceso y metadatos modificados. Esta sincronización no es una suscripción en tiempo real. Los datos locales permanecen en memoria de la pestaña; no se persisten en localStorage.

Los formularios envían solamente campos modificados y la versión que se mostró al abrirlos. El servidor valida permisos y versión bajo bloqueo antes de escribir. Si alguien cambió el compromiso, rechaza el guardado y conserva el borrador; copia lo necesario antes de pulsar Descartar edición y actualizar detalle. Una operación devuelve el detalle afectado y actualiza la pantalla sin recargar toda la aplicación. Las escrituras agrupan campos por fila y eventos de auditoría por operación, conservando fórmulas y columnas adicionales.

En las pruebas con Sheets simuladas, cambiar tres campos requiere dos escrituras: una fila de compromiso y un bloque de auditoría. Se verificaron sincronización sin cambios, filtrado por permisos, revocación de acceso, conflictos sin escrituras y conservación de borradores en Chrome. Son conteos de llamadas, no una medición de segundos en Google. La carga inicial tiene más datos; guardar y sincronizar todavía dependen de la latencia de Apps Script. El historial y la sincronización leen los rangos usados de sus tablas.

Para medir el despliegue real, revisa los mensajes SD_PERF en los registros de ejecución de Apps Script: duración del servidor, lecturas y aperturas. La consola del navegador registra SD_RPC con la duración completa de cada llamada, incluida la comunicación. Compara varias aperturas bajo condiciones semejantes; la latencia de Google y de la red sigue influyendo.

Con Node.js, desde esta carpeta:

```powershell
node tests/server.cjs
node tests/sync.cjs
node tests/browser.cjs
```

La prueba de navegador requiere Playwright y Chrome. SD_NODE_MODULES permite indicar el directorio de módulos que contiene Playwright. Las pruebas cubren permisos, conservación del esquema y datos, usuarios y duplicados, tipos, proyectos, delegaciones, reasignación, comentarios, anulación, aprobación/devolución, cierre directo, recurrencias y calendario, cuotas y reintentos de correo, formularios y respuestas fuera de orden.

Antes de operar, verifica con cuentas de prueba en el despliegue real: alta y acceso, reasignación, envío y devolución, cierre directo, anulación, generación recurrente repetida y recepción del correo. Los permisos de Workspace, consentimientos y entrega real no se verifican con servicios simulados.
