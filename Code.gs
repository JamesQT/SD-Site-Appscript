/** Entrada de la web e inclusión de componentes HTML. */

/**
 * Sirve la página principal de SD Control mediante HTML Service.
 * @returns {HtmlOutput} Página evaluada para la aplicación web.
 */
function doGet() {
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle('SD Control — Solution Development');
}

/**
 * Inserta un componente HTML del proyecto en una plantilla.
 * @param {*} filename - Nombre del componente HTML.
 * @returns {string} Contenido evaluado del componente autorizado.
 */
function include(filename) {
  if (!APP.HTML_COMPONENTS.includes(filename)) throw appError_('VALIDATION','Componente HTML no permitido.');
  if(filename.startsWith('Client') && filename!=='Client') {
    // HTML Service debe recibir un bloque script, no JavaScript suelto con cadenas HTML.
    // Extraemos solo su contenido para conservar el cierre privado único de Client.html.
    const content=HtmlService.createHtmlOutputFromFile(filename).getContent();
    const script=content.match(/^\s*<script>\s*([\s\S]*?)\s*<\/script>\s*$/);
    if(!script) throw appError_('CONFIGURATION','El componente '+filename+' debe estar envuelto en <script>.');
    return script[1];
  }
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
