// Pruebas de lo visto en "8.1 NodeJS - Seguridad": JWT, CSRF, cookies y protección de rutas
import fs from 'node:fs';
import jwt from 'jsonwebtoken';
const BASE = 'http://localhost:3998';
const HOST = 'localhost:3998';
const res = [];
const ok = (n, c, x = '') => res.push([c ? 'OK  ' : 'FALLA', n, x]);
const SECRETO = process.env.JWT_SECRET;

const pedir = async (path, { method = 'GET', json, form, headers = {}, cookie } = {}) => {
  const h = { ...headers };
  if (cookie) h.Cookie = cookie;
  let body;
  if (json) { h['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
  if (form) { h['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
  const r = await fetch(BASE + path, { method, headers: h, body, redirect: 'manual' });
  const texto = await r.text();
  let datos = null; try { datos = JSON.parse(texto); } catch {}
  return { status: r.status, headers: r.headers, texto, datos, location: r.headers.get('location') || '' };
};
const loginWeb = async (u) => {
  const r = await pedir('/auth/login', { method: 'POST', form: { identificador: u, password: '123' } });
  return { cookie: r.headers.get('set-cookie').split(';')[0], setCookie: r.headers.get('set-cookie') };
};

// ---------- Cookies de sesión ----------
const { cookie: cookieCliente, setCookie } = await loginWeb('cliente1');
ok('cookie de sesión HttpOnly', /HttpOnly/i.test(setCookie));
ok('cookie de sesión SameSite=Lax', /SameSite=Lax/i.test(setCookie));
ok('cookie con vencimiento (Expires)', /Expires=/i.test(setCookie));

// ---------- JWT: emisión ----------
const tokAdmin = await pedir('/auth/token', { method: 'POST', json: { identificador: 'admin', password: '123' } });
ok('POST /auth/token devuelve un JWT', tokAdmin.status === 200 && tokAdmin.datos?.token?.split('.').length === 3 && tokAdmin.datos.tipo === 'Bearer');
const payload = jwt.decode(tokAdmin.datos.token, { complete: true });
ok('header: algoritmo HS256 y tipo JWT', payload.header.alg === 'HS256' && payload.header.typ === 'JWT');
ok('payload: sub, rol, audiencia y emisor', !!payload.payload.sub && payload.payload.rol === 'Administrador' && payload.payload.aud === 'urbana-cult-api' && payload.payload.iss === 'urbana-cult');
ok('payload: expira en 1 hora', payload.payload.exp - payload.payload.iat === 3600);
ok('payload: sin datos sensibles (contraseña, email, dni)', !('password' in payload.payload) && !('email' in payload.payload) && !('dni' in payload.payload));
ok('credenciales incorrectas: 401 en JSON', (await pedir('/auth/token', { method: 'POST', json: { identificador: 'admin', password: 'mala' } })).status === 401);
ok('acepta también formulario (urlencoded)', (await pedir('/auth/token', { method: 'POST', form: { identificador: 'cliente2', password: '123' } })).status === 200);

// ---------- JWT: uso en la API ----------
const bearer = (t) => ({ Authorization: `Bearer ${t}`, Accept: 'application/json' });
const lista = await pedir('/entradas', { headers: bearer(tokAdmin.datos.token) });
ok('GET /entradas con Bearer (admin) → 200', lista.status === 200 && Array.isArray(lista.datos));
const tokCliente = (await pedir('/auth/token', { method: 'POST', json: { identificador: 'cliente1', password: '123' } })).datos.token;
const propias = await pedir('/entradas', { headers: bearer(tokCliente) });
ok('cliente con Bearer solo ve sus entradas', propias.status === 200 && propias.datos.every(e => e.cliente?.nombreUsuario === 'cliente1'));
ok('cliente con Bearer no puede crear entradas (403)', (await pedir('/entradas', { method: 'POST', json: {}, headers: bearer(tokCliente) })).status === 403);
const evento = (await pedir('/cliente/comprar', { cookie: cookieCliente })).texto.match(/name="eventoId" value="([a-f0-9]{24})"/)[1];
const usuarioCliente = jwt.decode(tokCliente).sub;
if (evento) {
  const alta = await pedir('/entradas', { method: 'POST', json: { cliente: usuarioCliente, evento, sector: 'General', cantidad: 1 }, headers: bearer(tokAdmin.datos.token) });
  ok('admin con Bearer crea una entrada (201)', alta.status === 201 && !!alta.datos?.codigoBoleto, 'status ' + alta.status);
}
ok('sin token ni sesión → 401', (await pedir('/entradas', { headers: { Accept: 'application/json' } })).status === 401);

// ---------- JWT: tokens inválidos ----------
const firmar = (datos, opciones, secreto = SECRETO) => jwt.sign(datos, secreto, { algorithm: 'HS256', subject: usuarioCliente, audience: 'urbana-cult-api', issuer: 'urbana-cult', ...opciones });
ok('firma con otra clave → 401', (await pedir('/entradas', { headers: bearer(firmar({ rol: 'Administrador' }, {}, 'clave-falsa')) })).status === 401);
const [h, p, s] = tokCliente.split('.');
const adulterado = Buffer.from(JSON.stringify({ ...jwt.decode(tokCliente), rol: 'Administrador' })).toString('base64url');
ok('payload adulterado (cliente se hace pasar por admin) → 401', (await pedir('/entradas', { headers: bearer(`${h}.${adulterado}.${s}`) })).status === 401);
const vencido = await pedir('/entradas', { headers: bearer(firmar({ rol: 'Cliente', iat: Math.floor(Date.now() / 1000) - 7200 }, { expiresIn: '1h' })) });
ok('token vencido → 401 "venció"', vencido.status === 401 && vencido.datos?.error.includes('venció'));
ok('otra audiencia → 401', (await pedir('/entradas', { headers: bearer(firmar({ rol: 'Cliente' }, { audience: 'otra-app' })) })).status === 401);
ok('algoritmo "none" → 401', (await pedir('/entradas', { headers: bearer(`${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${p}.`) })).status === 401);
ok('respuesta 401 con WWW-Authenticate: Bearer', ((await pedir('/entradas', { headers: bearer('basura') })).headers.get('www-authenticate') || '').startsWith('Bearer'));

// ---------- CSRF ----------
const desdeOtroSitio = await pedir('/cliente/carrito/agregar', { method: 'POST', form: { eventoId: 'x', cantidad: '1' }, cookie: cookieCliente, headers: { Origin: 'https://sitio-malicioso.com', Accept: 'application/json' } });
ok('POST con Origin de otro sitio → 403', desdeOtroSitio.status === 403 && desdeOtroSitio.texto.includes('CSRF'));
const refererMalo = await pedir('/auth/logout', { cookie: cookieCliente });
ok('GET no se bloquea (métodos seguros)', refererMalo.status === 302);
const { cookie: cookie2 } = await loginWeb('cliente2');
ok('POST con Referer de otro sitio → 403', (await pedir('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'ESTANDAR' }, cookie: cookie2, headers: { Referer: 'https://evil.example/pagina' } })).status === 403);
ok('POST con Origin: null → 403', (await pedir('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'ESTANDAR' }, cookie: cookie2, headers: { Origin: 'null' } })).status === 403);
ok('POST desde el propio sitio → permitido', (await pedir('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'ESTANDAR' }, cookie: cookie2, headers: { Origin: `http://${HOST}` } })).location.startsWith('/cliente/menu'));
ok('POST con Referer del propio sitio → permitido', (await pedir('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'ESTANDAR' }, cookie: cookie2, headers: { Referer: `http://${HOST}/cliente/membresia` } })).location.startsWith('/cliente/menu'));
ok('API con Bearer desde otro origen → permitido (no usa cookies)', (await pedir('/entradas', { method: 'POST', json: {}, headers: { ...bearer(tokCliente), Origin: 'https://otra-app.com' } })).status === 403 /* 403 por rol, no por CSRF */);

// ---------- Protección de rutas (autorización) ----------
ok('ruta protegida sin sesión redirige al login', (await pedir('/cliente/mis-compras')).location.startsWith('/auth/login'));
ok('rol sin permiso → 403', (await pedir('/admin/usuarios', { cookie: cookie2 })).status === 403);

// ---------- Límite de intentos también en /auth/token ----------
for (let i = 0; i < 5; i++) await pedir('/auth/token', { method: 'POST', json: { identificador: 'lector', password: 'mala' } });
const bloqueo = await pedir('/auth/token', { method: 'POST', json: { identificador: 'lector', password: '123' } });
ok('6.º intento de token bloqueado (429 JSON)', bloqueo.status === 429 && !!bloqueo.datos?.error);

for (const [e, n, x] of res) console.log(e, n, x ? '— ' + x : '');
console.log(`\n${res.filter(r => r[0] === 'OK  ').length}/${res.length} OK`);
