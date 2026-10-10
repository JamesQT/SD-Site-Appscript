# Kanban y checklist

El menú Kanban muestra los compromisos autorizados agrupados por estado, con búsqueda local y filtro de mis tareas. Cada tarjeta abre el detalle y muestra responsable, fecha, criticidad, avance y pasos completados.

El selector Seguimiento permite ver cambios de estado recientes, postergados, estancados y vencidos. La línea base y los motivos se explican en [SEGUIMIENTO.md](SEGUIMIENTO.md), junto al calendario y la gestión del equipo.

Los botones «Responsable» permiten seleccionar una persona del equipo o «Todos». Filtran por `owner_id`, se combinan con búsqueda y «Solo mis tareas», y conservan la selección durante las actualizaciones. Cada botón muestra el número de compromisos visibles de esa persona antes de los otros filtros; incluye personas sin tarjetas (0) y responsables antiguos que todavía tienen tarjetas visibles. No amplían el acceso del perfil ni realizan consultas al servidor. La selección activa se distingue por color y `aria-pressed`; los botones admiten teclado y se distribuyen en varias líneas en móvil.

Las tarjetas muestran días desde creación y días en el estado actual, contados como días calendario en America/Lima (hoy = 0). El segundo contador se basa en cambios reales de `estado` en HISTORIAL, incluidos envío a aprobación, devolución, cierre y anulación. Comentarios, checklist, descripción y cambios de fecha no lo reinician. Si nunca hubo cambio y sigue Pendiente, se usa la creación. Para estados avanzados sin evento registrado se muestra «Estado: sin historial»; si falta creación, «Sin fecha de creación».

La bandera «⚑ Postergado» indica que HISTORIAL contiene al menos un cambio de `fecha_objetivo` hacia una fecha posterior. Adelantarla, guardar la misma fecha o asignarla inicialmente no activa la bandera. La bandera permanece aunque después se adelante la fecha; identifica compromisos que han tenido alguna postergación. No se infieren modificaciones antiguas o directas en Sheets que no quedaron auditadas.

Estos datos se reconstruyen desde el historial existente y comparten su índice de caché. No se añaden columnas ni llamadas al abrir tarjetas. Las mutaciones actualizan el índice y la sincronización renueva los días al cambiar de fecha, sin alterar la versión de edición del compromiso.

Arrastrar o usar Mover a permite cambiar entre Pendiente, En curso y Bloqueado, si el usuario puede editar. Para pasar a En aprobación o Cerrado se abre el formulario de evidencias existente, según requiere_aprobacion. Las tarjetas ya enviadas no pueden moverse para saltarse una decisión. Anular requiere el motivo desde el detalle.

El detalle permite añadir, editar, marcar y eliminar hasta 40 pasos de 160 caracteres. Guardar checklist conserva los borradores de avance y comentario; cada edición verifica la versión completa del compromiso bajo bloqueo. Solo los responsables, colaboradores activos y administradores autorizados pueden editar, y únicamente en estados abiertos. Los demás accesos muestran los pasos en lectura.

## Pantalla completa y tarjetas compactas

El botón **Pantalla completa** oculta la navegación y expande el tablero al espacio disponible. Solicita además pantalla completa al navegador cuando está permitido; si el contenedor de Google bloquea esa API, conserva la expansión dentro de la web. Las seis columnas permanecen en una fila, con desplazamiento horizontal en pantallas pequeñas y desplazamiento vertical independiente para las tarjetas de cada columna.

Al expandir se activa **Vista compacta**, que reduce espacios y tamaño de las tarjetas. Conserva título, responsable, vencimiento, criticidad, contadores, banderas, avance y selector de estado. Proyecto, línea base y resumen de checklist se consultan en el detalle. La casilla también funciona en el tablero normal y puede desmarcarse durante la expansión.

Se sale con **Salir de pantalla completa** o Escape. Si hay un diálogo abierto, Escape cierra primero el diálogo. Cambiar de vista o de perfil también cierra la expansión; la densidad seleccionada se conserva durante la sesión. Los filtros y los formularios siguen funcionando y estos controles no consultan al servidor.

## Persistencia y compatibilidad

`Checklist.gs` añade `checklist_json` al final de COMPROMISOS al primer guardado autorizado. No hace falta preparar tablas manualmente. Los registros antiguos se muestran sin pasos. La migración conserva columnas y fórmulas; una lista dañada produce un error de configuración para evitar su sobrescritura silenciosa.

La lista contiene objetos `{id, title, done}`. Su contenido participa en la versión y sincronización de la fila y genera eventos CHECKLIST en HISTORIAL. El checklist informa pasos completados; no recalcula porcentaje_avance ni impone nuevos requisitos de cierre.

`ClientBoard.html` reutiliza los detalles locales. Abrir tarjetas, filtrar y consultar pasos no añade peticiones de lectura.

## Validación

`node tools/test.cjs` comprueba autorización, versiones, migración, límites y frontera de aprobación. `node tests/browser.cjs` prueba selector y arrastre, filtros, persistencia de pasos, conservación de borradores, evidencias y adaptación móvil, además de los flujos existentes. Verifica también reducción de tarjetas, expansión nativa y alternativa, seis columnas alineadas, detalle dentro de pantalla completa, salida con Escape y ausencia de consultas adicionales.
