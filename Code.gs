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
  return HtmlService.createTemplateFromFile(filename).evaluate().getContent();
}
