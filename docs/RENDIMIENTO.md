# Tiempos de respuesta

## Optimizaciones de la versión 3.5

- La web solicita `getAppData({compact:true})` y sincroniza con `compact:true`. Omite listas de compromisos, tareas y aprobaciones duplicadas, usuarios administrativos completos e indicadores derivables. El navegador los calcula desde los detalles autorizados. El contrato antiguo sigue disponible para integraciones que no envían compact.
- La sincronización compara una huella de fuentes antes de construir cada detalle. Solo construye detalles nuevos o modificados. La huella incorpora compromiso, relaciones, evidencia, actividad, actor efectivo, referencias, delegaciones, día de negocio y resumen autorizado de requisitos. Cerrar un requisito invalida también los detalles dependientes.
- Se indexan compromisos y relaciones por ID, y métricas del equipo por responsable. Se elimina un resumen de equipo duplicado en cada guardado. El informe calcula riesgos una vez por compromiso durante cada renderizado.
- La fecha de negocio se calcula una vez por petición. El navegador reutiliza su formateador de fechas y la fecha de la instantánea, evitando recorrer todos los detalles para cada tarjeta.
- Las vistas se representan al abrirlas. Un cambio invalida las demás vistas, que se actualizarán al entrar, sin pedir datos de nuevo. Volver a una vista sin cambios reutiliza su DOM. Al cambiar perfil, revocar acceso o cerrar sesión se elimina contenido obsoleto; los borradores activos siguen protegidos.
- Mover una tarjeta bloquea los controles existentes durante el envío; no reconstruye el tablero para bloquearlo y volverlo a habilitar. El estado confirmado sigue llegando del servidor.
- Los resúmenes de caché que superan 30.000 caracteres se fragmentan con `putAll/getAll`, hasta 30 bloques seguros para Unicode. El manifiesto se publica al final con claves de generación únicas. Si falta un bloque, falla el servicio o caduca una entrada se reconstruye desde Sheets. Los valores de más de 870.000 caracteres no se cachean. No se cachean permisos.

## Evidencia reproducible

`node tools/test.cjs` incluye `tests/response-time.cjs`. Sobre una carga simulada con 255 compromisos visibles:

| Métrica | Resultado |
|---|---|
| Respuesta completa compatible | 813.805 bytes |
| Respuesta compacta | 478.240 bytes: 41% menos |
| Detalles construidos tras un comentario | 1 de 255 |
| Detalles construidos al forzar lectura sin cambios | 0 |
| Detalles construidos al cerrar un requisito con un dependiente | 2 |

Son tamaños JSON y conteos de trabajo sobre servicios simulados, no porcentajes de reducción de segundos en Google. Las pruebas comprueban también equivalencia de detalles entre contratos, permisos, invalidación, pérdida de fragmentos y Unicode. La regresión de navegador comprueba navegación, inicio sin vistas ocultas, formularios, perfiles, Kanban, informes, móvil y borradores.

## Medir en el despliegue

- Consola del navegador: `SD_RPC` registra tiempo total desde el envío hasta recibir respuesta; `SD_RENDER` registra tiempo por vista representada.
- Ejecuciones de Apps Script: `SD_PERF` registra duración del servidor, lecturas, aperturas y detalles construidos; `SD_LOCK` registra espera del bloqueo y tiempo retenido.
- Comparar varias repeticiones de carga inicial, apertura de detalle, cambio de estado y Actualizar, incluyendo primer acceso y accesos posteriores. Usar mediana y percentil 95; no sumar métricas de operaciones distintas ni interpretar el mock de reloj fijo como latencia real.

La sincronización sin cambios conserva cinco lecturas de tablas de acceso para detectar revocaciones. Sheets sigue requiriendo lecturas completas de las tablas usadas y hashes de fuentes. Cerrados y anulados siguen disponibles en memoria para conservar informes, calendario, métricas y apertura local. Subir a Drive mantiene el bloqueo durante creación y compartición: `SD_LOCK` permite detectar si genera espera entre usuarios; separar esa operación requiere reserva y confirmación con autorización fresca para mantener reintentos y consistencia. No se incrementó el intervalo de sincronización ni se ocultó la espera con confirmaciones anticipadas.

Apps Script, red y servicios de Google conservan su propia latencia, especialmente al iniciar una ejecución. Esta entrega reduce trabajo repetido, datos transferidos y DOM; no garantiza una duración absoluta de extremo a extremo. Límites y operaciones agrupadas de CacheService: [documentación de Google](https://developers.google.com/apps-script/reference/cache/cache).
