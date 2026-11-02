// Usuario autenticado: por sesión (web) o por token JWT (API, ver jwt.middleware.js)
const usuarioActual = (req) => req.session?.usuario || req.usuarioToken || null;
const esPeticionApi = (req) => Boolean(req.usuarioToken) || req.accepts(['html', 'json']) === 'json' || req.xhr;

// Protege una ruta: solo pasa quien inició sesión (o presentó un token válido)
const verificarAutenticacion = (req, res, next) => {
  const usuario = usuarioActual(req);
  if (!usuario) {
    return esPeticionApi(req) ? res.status(401).json({ error: 'Debes iniciar sesión.' }) : res.redirect('/auth/login');
  }
  req.usuario = usuario;
  next();
};

// Autorización por rol: además de estar autenticado, el rol tiene que estar permitido
const verificarRol = (rolesPermitidos) => (req, res, next) => {
  const usuario = usuarioActual(req);

  if (!usuario) {
    return esPeticionApi(req) ? res.status(401).json({ error: 'Debes iniciar sesión.' }) : res.redirect('/auth/login');
  }

  if (!rolesPermitidos.includes(usuario.rol)) {
    return esPeticionApi(req)
      ? res.status(403).json({ error: 'Permisos insuficientes.' })
      : res.status(403).render('errores/403', { mensaje: 'Acceso Denegado', usuarioLogueado: usuario });
  }
  req.usuario = usuario;
  next();
};

export { verificarAutenticacion, verificarRol };
