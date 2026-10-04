# Conexión con Google Apps Script

La conexión local usa `.clasp.json`, excluido de Git. La sesión OAuth se guarda fuera del repositorio en el perfil del usuario. No copiar ni publicar `.clasprc.json`.

El manifiesto `appsscript.json` se recuperó del proyecto existente. Conserva zona horaria America/Lima, V8, ejecución como propietario de la implementación y acceso MYSELF.

## Flujo de trabajo

Desde la carpeta SD-Control-Apps-Script-MVP:

```powershell
clasp.cmd show-file-status
node tools/check.cjs
clasp.cmd push
```

La lista debe contener 27 archivos: 16 módulos `.gs`, 10 HTML y el manifiesto. `.claspignore` contiene la lista explícita; actualizarla si se agrega un módulo a `project-files.json`.

`push` actualiza los archivos del editor de Google. La web publicada se actualiza después, creando una nueva versión desde Administrar implementaciones y editando la implementación existente para conservar la URL.

No ejecutar `pull` directamente sobre esta carpeta para incorporar cambios del editor: primero descargar en una carpeta separada y comparar. clasp puede descargar módulos con extensión `.js`, mientras que este repositorio usa `.gs`.

La configuración de clasp no activa sincronización automática ni publica en GitHub.
