# Archivos, dependencias e informes

## Adjuntar archivos desde la web

Abre un compromiso editable y usa **Adjuntar archivo**: selecciona el archivo, escribe su descripción y pulsa **Subir a Drive**. Admite hasta 5 MiB, en PDF, PNG, JPG/JPEG, WebP, TXT, CSV, DOCX, XLSX y PPTX. Se valida extensión y tamaño; no se inspecciona ni convierte el contenido del documento.

Adjuntar registra una evidencia y un evento UPLOAD, conservando estado y borradores de otros formularios. Para cerrar o enviar a aprobación, usa el flujo de evidencia habitual y selecciona el archivo en **Evidencia** en lugar de introducir un enlace. Se registra su vinculación a esa solicitud sin duplicar el archivo de Drive. También puedes seguir usando enlaces HTTPS.

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
