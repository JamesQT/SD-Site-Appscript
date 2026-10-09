# Seguimiento de compromisos

## Kanban

El selector Seguimiento se combina con persona, búsqueda, Solo mis tareas y la casilla independiente Solo postergados. Por ejemplo, Solo postergados + 7 días o más en el mismo estado muestra compromisos que cumplen ambas condiciones:

- Estado actualizado en los últimos 3 días: cambio real del estado actual, hoy y los dos días anteriores en Lima. Crear una tarjeta no cuenta como cambio de estado.
- Solo postergados: al menos una fecha objetivo movida hacia adelante en HISTORIAL, incluidos compromisos ya cerrados si no hay otro filtro que los excluya.
- 7 días o más en el mismo estado: pendientes de cierre con fecha de estado conocida. Incluye En aprobación; excluye Cerrado y Anulado.
- Vencidos pendientes de cierre: fecha objetivo anterior a hoy y estado distinto de Cerrado o Anulado.

La cantidad mostrada indica cuántos compromisos cumplen todos los filtros. Las tarjetas muestran fecha original o referencia, desviación neta y número de postergaciones auditadas. No se añaden llamadas al servidor al filtrar.

## Fecha original y motivos

`Tracking.gs` añade al final de COMPROMISOS `fecha_objetivo_original` y `fecha_original_fuente`, preservando columnas y fórmulas existentes. La migración ocurre al crear una tarjeta (manual o recurrente) o en la primera edición de fecha de una tarjeta antigua. No requiere editar Sheets ni ejecutar una migración masiva.

Las nuevas tarjetas guardan su fecha objetivo inicial con fuente CREACION. La app no permite editar esa línea base. Las antiguas usan la fecha anterior del primer cambio de fecha disponible en HISTORIAL (fuente HISTORIAL). Si no hay rastro suficiente, se muestra la fecha actual como REFERENCIA_ACTUAL, sin afirmar que sea la original. La primera edición materializa esa referencia para no desplazarla en cambios posteriores. Las lecturas no escriben filas.

La desviación es `max(0, fecha_actual - fecha_original)` en días calendario. No es la suma de días de todas las postergaciones. El contador cuenta eventos auditados de aumento de fecha, incluso si luego se adelanta. Las modificaciones directas de Sheets sin auditoría y el historial eliminado no pueden reconstruirse con certeza. Las columnas siguen editables directamente por quienes tengan permisos de edición sobre Sheets.

Al elegir una fecha posterior, el formulario muestra Motivo de la postergación y lo exige. El servidor también lo valida bajo bloqueo antes de escribir; espacios en blanco y más de 2000 caracteres se rechazan. El historial muestra fechas anterior/nueva y motivo. Los guardados usan la versión original del formulario y conservan borradores ante conflictos. Como el resto de mutaciones, Sheets no ofrece rollback entre compromiso e historial si un servicio falla después de la primera escritura.

## Calendario

Vista mensual por fecha objetivo actual, con mes anterior/siguiente, Hoy, selector de mes, responsable y estados. Por defecto muestra pendientes de cierre, incluidos En aprobación. Todos los estados incluye cerrados y anulados. Abrir una entrega usa el detalle local existente. En móvil se presenta una agenda con los días que tienen entregas. Los registros sin fecha aparecen aparte. No sincroniza ni crea eventos en Google Calendar; es una vista de los compromisos de la propia web.

## Gestión del equipo

Disponible para ADMIN. Muestra totales y tarjetas por responsable, ordenadas por vencidos y carga pendiente. Incluye responsables anteriores que todavía tienen compromisos visibles.

La carga pendiente incluye todos los estados salvo Cerrado/Anulado. Vencidos usa fecha actual anterior a hoy. Postergados pendientes cuenta compromisos, no eventos, y Estancados usa 7 días en el estado actual. Por aprobar cuenta solicitudes pendientes asignadas a la persona; Cerrados es histórico y excluye anulados.

Cumplimiento compara la fecha de cierre con la fecha original registrada o recuperada del historial. Excluye cierres sin fecha o con fuente REFERENCIA_ACTUAL y muestra el numerador, denominador y cantidad excluida. Sin cierres comparables aparece «—». No aplica una ventana temporal; es histórico. Ver en Kanban abre el responsable y limpia los otros filtros.

Las métricas y el calendario derivan de la instantánea autorizada. Al cambiar de perfil se reconstruye el calendario y se oculta Equipo. El índice de actividad usa una nueva versión de caché para incluir primera fecha auditada y contador; sigue siendo reconstruible y se extiende al escribir eventos.

## Verificación

`node tools/test.cjs` incluye pruebas de invariabilidad, motivos, ausencia de escrituras en errores, recuperaciones antiguas, cachés, deltas, recurrencias, permisos, límites de filtros y cálculo de cumplimiento. `node tests/browser.cjs` comprueba formulario obligatorio, calendario, navegación mensual, filtros combinados, gestión y perfiles en escritorio y móvil, con servicios Google simulados.
