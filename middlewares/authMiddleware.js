// Usuario autenticado: por sesión (web) o por token JWT (API, ver jwt.middleware.js)
const usuarioActual = (req) => req.session?.usuario || req.usuarioToken || null;
const esPeticionApi = (req) => Boolean(req.usuarioToken) || req.accepts(['html', 'json']) === 'json' || req.xhr;

// Sin sesión se va al login; si pedía una página del cliente, al entrar vuelve a esa página
const irAlLogin = (req, res) => {
  const volver = req.method === 'GET' && req.originalUrl.startsWith('/cliente/') ? `?volver=${encodeURIComponent(req.originalUrl)}` : '';
  return res.redirect(`/auth/login${volver}`);
};

// Protege una ruta: solo pasa quien inició sesión (o presentó un token válido)
const verificarAutenticacion = (req, res, next) => {
  const usuario = usuarioActual(req);
  if (!usuario) {
    return esPeticionApi(req) ? res.status(401).json({ error: 'Debes iniciar sesión.' }) : irAlLogin(req, res);
  }
  req.usuario = usuario;
  next();
};

// Autorización por rol: además de estar autenticado, el rol tiene que estar permitido
const verificarRol = (rolesPermitidos) => (req, res, next) => {
  const usuario = usuarioActual(req);

  if (!usuario) {
    return esPeticionApi(req) ? res.status(401).json({ error: 'Debes iniciar sesión.' }) : irAlLogin(req, res);
  }

  if (!rolesPermitidos.includes(usuario.rol)) {
    return esPeticionApi(req)
      ? res.status(403).json({ error: 'Permisos insuficientes.' })
      : res.status(403).render('errores/403', { mensaje: 'Acceso Denegado', usuarioLogueado: usuario });
  }
  req.usuario = usuario;
  next();
};

// El usuario "admin" es el superadministrador: nadie puede eliminarlo y solo él gestiona a los demás administradores
const esSuperAdmin = (usuario) => usuario?.rol === 'Administrador' && usuario?.nombreUsuario === 'admin';
const puedeGestionarUsuario = (actor, objetivo) => esSuperAdmin(actor) || objetivo?.rol !== 'Administrador';

export { verificarAutenticacion, verificarRol, esSuperAdmin, puedeGestionarUsuario };
