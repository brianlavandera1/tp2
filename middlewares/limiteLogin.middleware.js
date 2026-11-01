/**
 * Middleware de límite de intentos de login (protección contra fuerza bruta).
 * Cuenta solo los intentos FALLIDOS por combinación IP + usuario dentro de una ventana de tiempo.
 * Al superar el máximo bloquea temporalmente; un login correcto reinicia el contador.
 */
const VENTANA_MS = 15 * 60 * 1000; // 15 minutos
const MAXIMO_FALLOS = 5;

const intentos = new Map(); // clave -> { fallos, desde }

// Limpieza periódica para que el Map no crezca indefinidamente
setInterval(() => {
  const ahora = Date.now();
  for (const [clave, registro] of intentos) {
    if (ahora - registro.desde > VENTANA_MS) intentos.delete(clave);
  }
}, VENTANA_MS).unref();

const limiteLogin = (req, res, next) => {
  const usuario = String(req.body?.identificador || '').trim().toLowerCase();
  const clave = `${req.ip}|${usuario}`;
  const ahora = Date.now();
  const registro = intentos.get(clave);

  if (registro && ahora - registro.desde > VENTANA_MS) intentos.delete(clave);

  const actual = intentos.get(clave);
  if (actual && actual.fallos >= MAXIMO_FALLOS) {
    const minutos = Math.ceil((VENTANA_MS - (ahora - actual.desde)) / 60000);
    res.set('Retry-After', String(minutos * 60));
    return res.status(429).render('auth/login', {
      error: `Demasiados intentos fallidos. Probá de nuevo en ${minutos} minuto(s).`,
      datos: { identificador: req.body?.identificador }
    });
  }

  // Al terminar la respuesta: 400 = credenciales inválidas (suma un fallo), 302 = login correcto (reinicia)
  res.on('finish', () => {
    if (res.statusCode === 400) {
      const r = intentos.get(clave) || { fallos: 0, desde: Date.now() };
      r.fallos += 1;
      intentos.set(clave, r);
    } else if (res.statusCode === 302) {
      intentos.delete(clave);
    }
  });

  next();
};

export default limiteLogin;
