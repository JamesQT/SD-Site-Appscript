# Instalación, pruebas y recuperación

## Instalar la versión modular

1. Guarda una copia del proyecto de Apps Script y del Sheet actual. La copia local previa a esta reorganización está en `SD-Control-Apps-Script-antes-modularizar` dentro del espacio de trabajo.
2. En el proyecto existente, reemplaza Code, Client, Index y Styles por sus nuevas versiones.
3. Crea archivos de **secuencia de comandos** para todos los demás `.gs` de la raíz y archivos de **HTML** para todos los nuevos `Client*.html`. El editor añade las extensiones; escribe nombres como Auth, Repository y ClientApi.
4. Usa `project-files.json` como lista exacta: 16 archivos de servidor y 10 HTML. Los componentes HTML parciales incluyen su bloque `<script>`; copia todo su contenido, incluidas esas etiquetas.
5. Conserva la configuración del despliegue y del manifiesto existentes. Guarda todo antes de publicar una nueva versión desde Administrar implementaciones.
6. Entra como ADMIN y pulsa **Administración → Preparar o actualizar tablas**. Además del esquema, esta acción instala dos disparadores para el Sheet: edición y cambio estructural. Autoriza los permisos de Google si se solicitan. Repetir la acción desde la misma cuenta no duplica esos disparadores.
7. Abre nuevamente la web. Comprueba apertura de detalle, actualización, aprobación y seguimiento con datos de prueba.

Sube únicamente los `.gs` y `.html` de la **raíz**. No subas tests, tools, docs, package.json, project-files.json ni el código histórico ubicado en tests/baseline-detail.gs. Este último contiene funciones antiguas solo para comparar rendimiento local; subirlo produciría definiciones duplicadas.

El administrador que prepara las tablas queda como propietario de la detección de cambios. Otro ADMIN puede repetir la preparación sin duplicar los disparadores de ese propietario activo. Si el propietario deja de ser ADMIN activo, otro ADMIN puede preparar las tablas y asumirla. Google no permite que una cuenta vea o elimine disparadores de otra; sus disparadores antiguos pueden retirarse desde la cuenta original. Solo los IDs vigentes registrados por la app procesan eventos.

El disparador horario de recurrencias/correos se configura por separado y conserva su flujo anterior. Preparar tablas no habilita envío de correo.

## Entorno separado de pruebas

Se incorporó configuración para aislar pruebas; esta entrega no creó un Sheet ni otro proyecto en tu cuenta.

1. Crea una copia del Sheet y un **proyecto de Apps Script separado** con las mismas fuentes.
2. En Configuración del proyecto → Propiedades de la secuencia de comandos, define:

| Propiedad | Valor |
|---|---|
| SD_ENV | PRUEBAS |
| SD_SPREADSHEET_ID | ID de la copia del Sheet, distinto al de producción |

3. Publica el proyecto de prueba con una audiencia limitada y tus cuentas de prueba. Se mostrará **Entorno de pruebas** en la barra superior.
4. Ejecuta Preparar tablas en esa copia. Correos y ejecución horaria están desactivados por defecto en un proyecto nuevo; actívalos solo si necesitas probarlos con destinatarios de prueba.

PRUEBAS rechaza un ID ausente o igual al ID de producción definido en Config.gs. PRODUCCION mantiene el Sheet original por defecto y permite definir SD_SPREADSHEET_ID para una instalación propia.

Las propiedades pertenecen al proyecto, no a una versión publicada. No uses el mismo proyecto para producción y pruebas cambiando sus propiedades: afectaría ambos despliegues y disparadores. Al copiar un proyecto, conserva solo las dos propiedades de entorno necesarias; SD_AUTOMATION, SD_REVISIONS y SD_CHANGE_TRACKING se generan en el nuevo proyecto durante su operación.

## Verificación local

Desde la carpeta del proyecto:

```powershell
npm run check
npm test
npm run test:browser
```

La comprobación valida el inventario, sintaxis, inclusiones y JSDoc de funciones. Las suites de servidor simulan Sheets, identidad, bloqueo, propiedades, caché, correo y disparadores: no usan tu cuenta ni tus hojas. Chrome verifica formularios, selección de aprobación, conservación de borradores y filas, paginación, respuestas de diálogos cerrados, indicador de pruebas y revocación de acceso.

La prueba de navegador necesita Chrome y Playwright. Usa SD_NODE_MODULES si Playwright está en otra ubicación. No se añadió una instalación automática de dependencias ni un servicio externo a la app.

## Prueba de aceptación en Google

- Abre varios compromisos y aprobaciones después de la carga inicial: deben usar los datos locales.
- Con dos sesiones, cambia un compromiso en una y pulsa Actualizar en la otra. La lista debe actualizarse y un borrador abierto debe conservarse con advertencia.
- Intenta guardar ese borrador antiguo: debe aparecer conflicto sin sobrescribir la modificación reciente. Copia el texto necesario antes de descartar y actualizar el detalle.
- Cambia un proyecto directamente en Sheets y confirma la detección mediante el disparador instalado. Para cambios de otro script o API, pulsa Actualizar o espera la revisión completa periódica.
- Comprueba comentario repetido, aprobación/devolución, cierre directo, anulación y generación recurrente repetida.
- Si activas correo, verifica consentimiento, cuota y entrega real; las simulaciones no prueban esos aspectos de Workspace.
- Revisa SD_PERF en las ejecuciones de Apps Script y SD_RPC en la consola del navegador. Compara varias ejecuciones; los arranques y la red pueden variar.

## Control de versiones

La copia de trabajo en `C:/CodexLab/Proyecto 1/SD-Control-Apps-Script-MVP` tiene un repositorio Git. Se conservaron una versión anterior y la reorganización para revisar diferencias o recuperar fuentes. El ZIP y la copia de Descargas contienen los archivos de trabajo; no incluyen la carpeta .git. No se configuró un remoto ni se publicó código fuera del equipo.

Antes de publicar cambios posteriores, ejecuta las pruebas y registra un commit descriptivo. Mantén `.clasp.json`, credenciales y artefactos fuera del repositorio. `.gitignore` excluye configuración personal y capturas de pruebas. Git conserva código; para datos de Sheets utiliza copias o el historial de versiones de Google.

## Recuperación

Para volver a la versión anterior de la web, selecciona su versión desde Administrar implementaciones. Para corregir las fuentes, usa el historial Git o la copia previa local. No mezcles el Code.gs monolítico anterior con los nuevos módulos: vuelve al conjunto completo de una versión.

Si abandonas esta versión, retira desde la cuenta instaladora los disparadores trackSheetEdit_ y trackSheetChange_ que ya no necesites. No borres los datos ni las columnas añadidas para intentar revertir la interfaz. La auditoría registra cambios, pero Sheets no revierte automáticamente escrituras parciales entre pestañas.
