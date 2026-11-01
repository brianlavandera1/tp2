/**
 * Middleware de Logging HTTP
 * Imprime en consola detalles de las peticiones entrantes: método, URL, código de estado y tiempo de respuesta.
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const { method, originalUrl } = req;
  const timestamp = new Date().toISOString();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const statusCode = res.statusCode;
    console.log(`[${timestamp}] ${method} ${originalUrl} ${statusCode} - ${duration}ms`);
  });

  next();
};


export default requestLogger;
