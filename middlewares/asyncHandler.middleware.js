/**
 * Middleware wrapper para controladores asíncronos.
 * Transfiere automáticamente cualquier error o promesa rechazada a next(err).
 *
 * @param {Function} fn - Función del controlador (req, res, next) => Promise
 * @returns {Function} 
 */
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};


export default asyncHandler;
