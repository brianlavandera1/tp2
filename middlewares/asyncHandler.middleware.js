// Envía al manejador de errores cualquier error de un controlador asíncrono
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};


export default asyncHandler;
