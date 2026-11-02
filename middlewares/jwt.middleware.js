import jwt from 'jsonwebtoken';
import config from '../config/config.js';

/**
 * Autenticación por token para la API (alternativa a la sesión).
 * Si la petición trae `Authorization: Bearer <token>`, se verifica la firma, la expiración,
 * la audiencia y el emisor. Si es válido, el usuario queda en req.usuarioToken.
 * Si no trae token, sigue de largo y se usa la sesión como siempre.
 */
export const autenticarToken = (req, res, next) => {
  const encabezado = req.get('authorization') || '';
  if (!encabezado.startsWith('Bearer ')) return next();

  try {
    const datos = jwt.verify(encabezado.slice(7).trim(), config.jwtSecret, {
      algorithms: ['HS256'],
      audience: config.jwtAudiencia,
      issuer: config.jwtEmisor
    });
    req.usuarioToken = { _id: datos.sub, nombreUsuario: datos.nombreUsuario, rol: datos.rol };
    next();
  } catch (error) {
    const mensaje = error.name === 'TokenExpiredError' ? 'El token venció. Pedí uno nuevo.' : 'Token inválido.';
    res.set('WWW-Authenticate', 'Bearer error="invalid_token"');
    res.status(401).json({ error: mensaje });
  }
};

// Firma un token con los datos mínimos del usuario (nunca la contraseña ni datos sensibles)
export const firmarToken = (usuario) => jwt.sign(
  { nombreUsuario: usuario.nombreUsuario, rol: usuario.rol },
  config.jwtSecret,
  {
    algorithm: 'HS256',
    subject: String(usuario._id),
    expiresIn: config.jwtExpira,
    audience: config.jwtAudiencia,
    issuer: config.jwtEmisor
  }
);
