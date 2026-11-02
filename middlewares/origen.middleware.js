/**
 * Protección CSRF (Cross-Site Request Forgery) por verificación de origen.
 * En las peticiones que modifican datos (POST, PUT, PATCH, DELETE) el navegador envía el encabezado
 * Origin (o Referer). Si viene de otro sitio, se rechaza: así una página maliciosa no puede usar la
 * sesión de un usuario logueado para comprar, cancelar o borrar en su nombre.
 * Complementa a la cookie sameSite=lax. Es la defensa que recomienda OWASP junto a los tokens CSRF.
 */
const METODOS_SEGUROS = ['GET', 'HEAD', 'OPTIONS'];

const hostDe = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
};

const verificarOrigen = (req, res, next) => {
  if (METODOS_SEGUROS.includes(req.method)) return next();
  // Las peticiones con token JWT no usan cookies, así que no son vulnerables a CSRF
  if ((req.get('authorization') || '').startsWith('Bearer ')) return next();

  const origen = req.get('origin');
  const referer = req.get('referer');
  const hostPermitido = req.get('host');

  // "Origin: null" lo mandan contextos aislados (iframes sandbox, archivos locales): no es nuestro sitio
  if (origen === 'null') {
    return next(Object.assign(new Error('Solicitud bloqueada: origen no permitido (protección CSRF).'), { status: 403 }));
  }

  // Se compara el host (dominio y puerto); el protocolo puede cambiar detrás de un proxy HTTPS
  const hostOrigen = origen ? hostDe(origen) : (referer ? hostDe(referer) : undefined);

  // Sin Origin ni Referer (clientes como curl o Postman): no hay navegador, no hay riesgo de CSRF
  if (hostOrigen === undefined) return next();

  if (hostOrigen !== hostPermitido) {
    return next(Object.assign(new Error('Solicitud bloqueada: proviene de otro sitio (protección CSRF).'), { status: 403 }));
  }
  next();
};

export default verificarOrigen;
