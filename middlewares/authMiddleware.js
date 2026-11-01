const verificarAutenticacion = (req, res, next) => {
  const isApi = req.accepts(['html', 'json']) === 'json' || req.xhr;
  if (!req.session?.usuario) {
    return isApi ? res.status(401).json({ error: 'Debes iniciar sesión.' }) : res.redirect('/auth/login');
  }
  next();
};

const verificarRol = (rolesPermitidos) => (req, res, next) => {
  const isApi = req.accepts(['html', 'json']) === 'json' || req.xhr;
  const usuario = req.session?.usuario;

  if (!usuario) {
    return isApi ? res.status(401).json({ error: 'Debes iniciar sesión.' }) : res.redirect('/auth/login');
  }

  if (!rolesPermitidos.includes(usuario.rol)) {
    return isApi 
      ? res.status(403).json({ error: 'Permisos insuficientes.' }) 
      : res.status(403).render('errores/403', { mensaje: 'Acceso Denegado', usuarioLogueado: usuario });
  }
  next();
};

export { verificarAutenticacion, verificarRol };