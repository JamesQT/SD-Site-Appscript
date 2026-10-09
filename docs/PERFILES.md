# Selector de perfil de vista

Solo las cuentas con rol ADMIN en USUARIOS ven «Ver como» junto al nombre, con Administrador y Responsable. Cambiar a Responsable conserva usuario, correo e identificador y solicita una instantánea filtrada por sus responsabilidades, colaboraciones y aprobaciones. Las pantallas administrativas desaparecen y las escrituras se autorizan con los permisos de Responsable.

No selecciona otra persona. No cambia rol_sistema en Sheets. Crear un compromiso en esta vista lo asigna a la propia cuenta y la auditoría conserva su identidad real. Esta vista permite operaciones reales sobre los compromisos autorizados; no es una simulación de solo lectura.

## Servidor

`runWithProfile(name, args, role)` autentica la cuenta real, exige ADMIN y valida tanto el perfil como una lista explícita de operaciones. `readContext_.viewActor` aplica el rol efectivo solo durante esa petición y se restaura con finally, incluso en errores. `actualUser_` identifica la cuenta real; `requireUser_` devuelve el actor efectivo cuando existe. El bloqueo, las reglas de evidencia, la aprobación y la validación de versiones siguen en las operaciones existentes.

`getAppData` expone `canSwitchProfile` según la cuenta real e `isAdmin` según el perfil efectivo. La huella de sincronización incluye el actor efectivo, por lo que no se reutiliza el atajo de una vista distinta. Ninguna preferencia se guarda en propiedades globales o en USUARIOS.

## Navegador

La selección pertenece a la página actual. Recargar o abrir otra pestaña inicia la vista normal de la cuenta. Al alternar se sustituye la instantánea completa, se invalidan actividad y selección de aprobación y se descartan respuestas administrativas anteriores. Las llamadas de Responsable pasan por `runWithProfile` y las de la vista normal conservan sus operaciones habituales.

Si hay una escritura, sincronización o formulario abierto con cambios pendientes, el selector conserva su valor y pide terminar o cerrar el formulario. Si no carga la nueva vista, se conserva la anterior. Un Responsable real no ve el selector y no puede obtener un perfil ADMIN llamando al endpoint.

## Verificación

`tests/profiles.cjs` comprueba identidad, filtrado, operaciones propias, denegación administrativa, aislamiento de sincronización, rechazo de operaciones arbitrarias y roles guardados sin cambios. La suite de navegador comprueba alternancia, ocultación de menús, conservación de borradores y retorno a Administrador.
