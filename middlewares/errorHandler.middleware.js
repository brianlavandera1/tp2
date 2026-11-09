const notFoundHandler = (req, res, next) => {
  const error = new Error(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);
  error.status = 404;
  next(error);
};

const errorHandler = (err, req, res, next) => {
  console.error('❌ Error interno:', err);
  // Si la respuesta ya salió (por ejemplo, la sesión se cerró mientras terminaba otra petición) no se puede enviar otra
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor.';
  
  if (req.accepts(['html', 'json']) === 'json' || req.xhr) {
    return res.status(status).json({ status: 'error', message });
  }

  const usuario = req.session?.usuario;
  const volver = !usuario ? '/auth/login' : usuario.rol === 'Cliente' ? '/cliente/menu' : '/admin/dashboard';
  // Los errores 500 no muestran detalles internos al usuario (quedan en el log de arriba)
  const mensaje = status >= 500 ? 'Ocurrió un problema en el servidor. Intentá de nuevo en unos minutos.' : message;

  // Pug escapa el mensaje (que puede incluir la URL pedida), así que no se inyecta HTML
  res.status(status).render('errores/error', { status, mensaje, volver }, (errorVista, html) => {
    if (errorVista) return res.type('text').send(`Error ${status}: ${mensaje}`);
    res.send(html);
  });
};

// Exportación explícita para que index.js lo pueda leer
export { notFoundHandler, errorHandler };