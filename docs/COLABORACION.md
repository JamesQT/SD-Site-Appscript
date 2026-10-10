# Archivos, dependencias e informes

## Archivos de apoyo y evidencias de cierre

En el detalle de un compromiso editable, **Archivos de apoyo** permite subir material complementario con una descripción. Guardarlo en Drive conserva el estado del compromiso y no constituye por sí solo una evidencia enviada.

Para acreditar la entrega, pulsa **Cerrar con evidencia** o **Enviar evidencia a aprobación**. En ese formulario puedes **subir una imagen o archivo desde tu equipo**, seleccionar un archivo que ya está en Drive por una carga anterior o usar un enlace HTTPS. Añade el comentario de cierre y envía. La carga directa guarda el archivo en Drive y después ejecuta las reglas de cierre o aprobación; no necesitas salir del formulario ni copiar un enlace.

Ambas cargas admiten hasta 5 MiB: PDF, PNG, JPG/JPEG, WebP, TXT, CSV, DOCX, XLSX y PPTX. Se valida extensión y tamaño; no se inspecciona ni convierte el contenido del documento. Se registra un evento UPLOAD al guardar el archivo. Solo el envío de cierre registra la evidencia formal y cambia el estado, con las validaciones de permisos, versión y dependencias existentes.

**Evidencias de cierre** muestra únicamente los registros enviados. Si reutilizas un archivo de apoyo, aparece en esa sección sin duplicar el archivo físico ni repetirlo en la lista de apoyo. Se conservan las evidencias históricas: las cargas antiguas con ID UPL se reconocen como adjuntos; los registros de envío EVI siguen siendo evidencias de cierre. Las nuevas cargas usan tipo ADJUNTO en EVIDENCIAS y el envío registra ARCHIVO o ENLACE; no se añaden columnas ni se eliminan filas.

Drive y Sheets no forman una transacción conjunta. Si la subida termina pero falla el cierre, el formulario informa que el archivo ya quedó en Drive, lo selecciona y conserva el comentario. Puedes reintentar el envío sin subir otra copia. Si cierras el formulario antes de reintentarlo, el archivo queda disponible entre los archivos existentes del compromiso.

Los archivos se crean en una carpeta de Drive por Sheet y usuario que adjunta, denominada `SD Control - Evidencias - …`. La carpeta no se comparte públicamente. Cada archivo concede lectura a los participantes activos actuales, administradores y delegados vigentes que pueden aprobar. Google puede exigir un nuevo consentimiento para Drive; sus políticas organizativas pueden impedir compartir archivos. La cuenta de ejecución del despliegue debe poder crear archivos y conceder permisos. Ver [DriveApp](https://developers.google.com/apps-script/reference/drive/drive-app).

Los permisos de Drive y el acceso a la aplicación son independientes. Desactivar un usuario, cambiar responsable o añadir una delegación después de una subida no revoca ni actualiza automáticamente los permisos de archivos anteriores; el administrador debe revisarlos en Drive. La configuración del despliegue determina quién es propietario real de los archivos. Las carpetas de pruebas usan el Sheet de pruebas para evitar mezclar evidencias con producción.

Cada carga conserva un UUID mientras se reintenta sin cambiar los campos. El servidor compara contenido, nombre, descripción, autor y compromiso. Si Drive creó el archivo antes de un fallo posterior, el reintento recupera ese archivo. Cambiar los campos inicia otra solicitud. Sheets y Drive no ofrecen una transacción conjunta: puede quedar un archivo sin registro tras un fallo, recuperable al reintentar. No se borra automáticamente evidencia.

## Dependencias entre compromisos

En el detalle, marca los requisitos y pulsa **Guardar dependencias**. Se permite hasta 20 compromisos visibles. No se admite depender de sí mismo, duplicar referencias ni crear un ciclo. Guardar requisitos mantiene los demás borradores y exige la versión abierta del compromiso.

Un requisito está completo cuando existe, sigue activo y está CERRADO. Los pendientes aparecen en el detalle y en una bandera del Kanban. Impiden tanto enviar el cierre como decidir APROBAR; el servidor verifica ambas operaciones. La aplicación no mueve estados automáticamente y sigue permitiendo DEVOLVER una aprobación.

Si un requisito se anula, desaparece o queda inactivo, vuelve a contar como pendiente. Un requisito fuera del acceso del usuario se muestra con un texto genérico, sin título ni ID; un ADMIN debe revisar ese caso para editar la lista. Un ADMIN puede quitar referencias eliminadas o inactivas. La columna `dependencias_json` se agrega al final de COMPROMISOS al primer guardado, conservando columnas adicionales y fórmulas.

## Informe para reuniones

Abre **Informe** y elige responsable, proyecto, rango de fecha objetivo actual y contenido: pendientes, solo riesgos o todos los estados. Un rango con fechas excluye compromisos sin fecha; un rango invertido bloquea la exportación. Se muestran estado, avance, fecha original o referencia, entrega actual, desviación neta y temas para decidir: vencidos, bloqueos, requisitos, aprobaciones, estancamientos y postergaciones.

El informe se calcula sobre los datos sincronizados y autorizados de la pestaña, sin peticiones adicionales al filtrar. Pulsa **Actualizar** antes de una reunión para traer cambios recientes. La vista RESPONSABLE usa sus compromisos visibles aunque la cuenta real sea ADMIN.

**Descargar informe** guarda una copia HTML estática con los filtros actuales, sin scripts ni datos ocultos. **Imprimir / PDF** abre la impresión del navegador: puedes elegir Guardar como PDF. El archivo exportado contiene información visible para quien lo generó; compartirlo es una acción manual. No envía correos, no crea actas ni documentos de Google automáticamente. Las decisiones se registran desde cada compromiso.

## Verificación

`npm test` cubre reglas, permisos, versiones, ciclos, cierre con dependencias, límites, reintentos y recuperación ante fallos simulados de Drive. `npm run test:browser` comprueba formularios reales, conservación de borradores, selección de adjuntos, filtros, descarga e impresión, escritorio y móvil. Estas pruebas usan servicios de Google simulados; la autorización y las políticas reales de Drive requieren una comprobación en el despliegue.
