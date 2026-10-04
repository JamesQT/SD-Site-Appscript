/** Códigos de error estables para la interfaz y los contratos de operaciones. */

/**
 * Crea un error cuyo código sobrevive al transporte de google.script.run.
 * @param {string} code - AUTH, FORBIDDEN, VALIDATION, CONFLICT o CONFIGURATION.
 * @param {string} message - Explicación adecuada para mostrar al usuario.
 * @returns {Error} Error con código y mensaje; el llamador lo lanza.
 */
function appError_(code,message) {
  const error=new Error(code+': '+message);
  error.code=code;
  return error;
}
