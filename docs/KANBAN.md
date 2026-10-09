# Kanban y checklist

El menú Kanban muestra los compromisos autorizados agrupados por estado, con búsqueda local y filtro de mis tareas. Cada tarjeta abre el detalle y muestra responsable, fecha, criticidad, avance y pasos completados.

Arrastrar o usar Mover a permite cambiar entre Pendiente, En curso y Bloqueado, si el usuario puede editar. Para pasar a En aprobación o Cerrado se abre el formulario de evidencias existente, según requiere_aprobacion. Las tarjetas ya enviadas no pueden moverse para saltarse una decisión. Anular requiere el motivo desde el detalle.

El detalle permite añadir, editar, marcar y eliminar hasta 40 pasos de 160 caracteres. Guardar checklist conserva los borradores de avance y comentario; cada edición verifica la versión completa del compromiso bajo bloqueo. Solo los responsables, colaboradores activos y administradores autorizados pueden editar, y únicamente en estados abiertos. Los demás accesos muestran los pasos en lectura.

## Persistencia y compatibilidad

`Checklist.gs` añade `checklist_json` al final de COMPROMISOS al primer guardado autorizado. No hace falta preparar tablas manualmente. Los registros antiguos se muestran sin pasos. La migración conserva columnas y fórmulas; una lista dañada produce un error de configuración para evitar su sobrescritura silenciosa.

La lista contiene objetos `{id, title, done}`. Su contenido participa en la versión y sincronización de la fila y genera eventos CHECKLIST en HISTORIAL. El checklist informa pasos completados; no recalcula porcentaje_avance ni impone nuevos requisitos de cierre.

`ClientBoard.html` reutiliza los detalles locales. Abrir tarjetas, filtrar y consultar pasos no añade peticiones de lectura.

## Validación

`node tools/test.cjs` comprueba autorización, versiones, migración, límites y frontera de aprobación. `node tests/browser.cjs` prueba selector y arrastre, filtros, persistencia de pasos, conservación de borradores, evidencias y adaptación móvil, además de los flujos existentes.
