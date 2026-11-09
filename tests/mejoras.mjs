// Pruebas de seguridad, sesiones, transacciones, QR, validación y paginación
// Uso: node e2e-mejoras.mjs <puerto> <uriMongo>
import mongoose from 'mongoose';
const PUERTO = process.argv[2] || '3998';
const URI = process.argv[3] || 'mongodb://127.0.0.1:27017/TP2_pruebas';
const BASE = `http://localhost:${PUERTO}`;
const res = [];
const ok = (n, c, x = '') => res.push([c ? 'OK  ' : 'FALLA', n, x]);

function cliente() {
  let cookie = '';
  const f = async (path, { method = 'GET', form, accept = 'text/html' } = {}) => {
    const headers = { Accept: accept };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    const r = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, location: r.headers.get('location') || '', headers: r.headers, text: await r.text() };
  };
  f.cookie = () => cookie;
  return f;
}
const login = async (c, u, p = '123') => c('/auth/login', { method: 'POST', form: { identificador: u, password: p } });
const tarjeta = { medioPago: 'Tarjeta de Crédito', titular: 'Juan Perez', numeroTarjeta: '4111111111111111', vencimiento: '12/30', cvv: '123' };

await mongoose.connect(URI);
const db = mongoose.connection.db;

// ---------- Helmet ----------
const h = (await fetch(BASE + '/auth/login')).headers;
ok('helmet: Content-Security-Policy', (h.get('content-security-policy') || '').includes("default-src 'self'"));
ok('helmet: frame-ancestors none (clickjacking)', (h.get('content-security-policy') || '').includes("frame-ancestors 'none'"));
ok('helmet: X-Content-Type-Options nosniff', h.get('x-content-type-options') === 'nosniff');
ok('helmet: sin X-Powered-By', !h.get('x-powered-by'));

// ---------- Sesiones en MongoDB ----------
const c1 = cliente();
const l1 = await login(c1, 'cliente1');
const sid = decodeURIComponent(c1.cookie().split('=')[1]).slice(2).split('.')[0];
ok('login correcto', l1.location === '/cliente/menu');
ok('la sesión se guarda en la colección "sesiones"', !!(await db.collection('sesiones').findOne({ _id: sid })));

// ---------- API sin datos sensibles ----------
const a = cliente(); await login(a, 'admin');
const ev = await db.collection('eventos').findOne({}, { sort: { fecha: 1 } });
await c1('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(ev._id), cantidad: '2', tipoEntrada: 'General' } });
const compra = await c1('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
ok('compra completa', compra.status === 200 && compra.text.includes('REC-'));
const api = JSON.parse((await a('/entradas', { accept: 'application/json' })).text);
ok('GET /entradas no expone contraseñas', api.length > 0 && api.every(e => e.cliente && !('password' in e.cliente)), JSON.stringify(Object.keys(api[0]?.cliente || {})));

// ---------- QR ----------
const entrada = await db.collection('entradas').findOne({ evento: ev._id }, { sort: { createdAt: -1 } });
const mis = await c1('/cliente/mis-compras');
ok('Mis entradas muestra el QR (SVG)', mis.text.includes('class="qr"') && mis.text.includes('<svg'));

// ---------- Validación en la puerta ----------
const l = cliente(); await login(l, 'lector');
ok('Lector no puede validar (403)', (await l('/admin/validar')).status === 403);
ok('Cliente no puede validar (403)', (await c1('/admin/validar/' + entrada.codigoBoleto)).status === 403);
const manual = await a('/admin/validar?codigo=' + entrada.codigoBoleto.toLowerCase());
ok('búsqueda manual (minúsculas) redirige a la URL del QR', manual.location === '/admin/validar/' + entrada.codigoBoleto);
const ver = await a('/admin/validar/' + entrada.codigoBoleto);
ok('entrada válida antes de usarla', ver.status === 200 && ver.text.includes('Entrada válida'));
const marcar = await a('/admin/validar/' + entrada.codigoBoleto, { method: 'POST' });
ok('marcar como usada', marcar.location.endsWith('?validada=1'));
ok('pantalla "Puede ingresar"', (await a(marcar.location)).text.includes('¡Puede ingresar!'));
const otraVez = await a('/admin/validar/' + entrada.codigoBoleto, { method: 'POST' });
ok('no se puede validar dos veces', decodeURIComponent(otraVez.location).includes('ya fue usada'));
const usada = await db.collection('entradas').findOne({ _id: entrada._id });
ok('queda guardado estado, fecha y quién validó', usada.estado === 'Usado' && !!usada.usadaEn && usada.validadaPor === 'admin');
const cancelarUsada = await c1('/cliente/cancelar-entrada/' + entrada._id, { method: 'POST', accept: 'application/json' });
ok('una entrada usada no se puede cancelar (409)', cancelarUsada.status === 409, cancelarUsada.text);
ok('Mis entradas la muestra como usada y sin botón Cancelar', (await c1('/cliente/mis-compras')).text.includes('Usada el'));
const inexistente = await a('/admin/validar/TICK-NOEXISTE00');
ok('código inexistente: 404 "Entrada inválida"', inexistente.status === 404 && inexistente.text.includes('Entrada inválida'));

// ---------- Boletería con QR (y transacción) ----------
const s = cliente(); await login(s, 'supervisor');
const ev2 = await db.collection('eventos').findOne({}, { sort: { fecha: -1 } });
const bol = await s('/admin/boleteria/cobrar', { method: 'POST', form: { dniCliente: '45678901', nombreCliente: 'Maria Gomez', eventoId: String(ev2._id), tipoEntrada: 'General', cantidad: '2', precioUnitario: String(ev2.precio), medioPago: 'Efectivo' } });
ok('ticket de boletería con QR', bol.status === 200 && bol.text.includes('<svg') && bol.text.includes('Presentá este QR'));

// ---------- Cancelación (transacción con auditoría) ----------
await c1('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(ev._id), cantidad: '1', tipoEntrada: 'Platea' } });
await c1('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
const e2 = await db.collection('entradas').findOne({ evento: ev._id, sector: 'Platea' }, { sort: { createdAt: -1 } });
const logsAntes = await db.collection('cancelacionlogs').countDocuments();
const canc = await c1('/cliente/cancelar-entrada/' + e2._id, { method: 'POST', accept: 'application/json' });
ok('cancelación registra el log de auditoría', canc.status === 200 && (await db.collection('cancelacionlogs').countDocuments()) === logsAntes + 1);

// ---------- Transacción: compra que falla a la mitad no deja nada a medias ----------
const evT = await db.collection('eventos').findOne({ _id: ev._id });
const stockAntes = evT.entradasDisponibles;
const entradasAntes = await db.collection('entradas').countDocuments();
const txAntes = await db.collection('transaccions').countDocuments();
const doc = await db.collection('sesiones').findOne({ _id: sid });
const datos = typeof doc.session === 'string' ? JSON.parse(doc.session) : doc.session;
// 1er ítem válido; 2do ítem con nombre vacío -> la Entrada no pasa la validación después de reservar el cupo del 1ro
datos.carrito = [
  { eventoId: String(ev._id), nombreEvento: evT.nombre, tipoEntrada: 'General', precio: evT.precio, cantidad: 3 },
  { eventoId: String(ev._id), nombreEvento: '', tipoEntrada: 'VIP', precio: evT.precioVIP ?? evT.precio, cantidad: 1 }
];
await db.collection('sesiones').updateOne({ _id: sid }, { $set: { session: typeof doc.session === 'string' ? JSON.stringify(datos) : datos } });
const fallida = await c1('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
const evDespues = await db.collection('eventos').findOne({ _id: ev._id });
ok('la compra fallida muestra el error en el checkout', fallida.status === 400 && fallida.text.includes('No se pudo completar la compra'), 'status ' + fallida.status);
ok('rollback: el stock no cambió', evDespues.entradasDisponibles === stockAntes, `${stockAntes} -> ${evDespues.entradasDisponibles}`);
ok('rollback: no quedaron entradas sueltas', (await db.collection('entradas').countDocuments()) === entradasAntes);
ok('rollback: no se registró la transacción', (await db.collection('transaccions').countDocuments()) === txAntes);

// ---------- Paginación ----------
const extra = Array.from({ length: 20 }, (_, i) => ({ nombreUsuario: `pag_${i}`, nombre: 'Pag', apellido: 'Test', email: `pag${i}@t.com`, password: 'x', dni: String(30000000 + i), telefono: '1100000000', fechaNacimiento: new Date('1990-01-01'), rol: 'Cliente', tipoCliente: 'ESTANDAR', porcentajeDescuento: 0, createdAt: new Date(), updatedAt: new Date() }));
await db.collection('usuarios').insertMany(extra);
const totalUsuarios = await db.collection('usuarios').countDocuments();
const p1 = await a('/admin/usuarios');
ok('usuarios: página 1 muestra 15', p1.text.includes(`Mostrando 1–15 de ${totalUsuarios} usuarios`) && (p1.text.match(/\/admin\/usuarios\/editar\//g) || []).length === 15);
const p2 = await a('/admin/usuarios?pagina=2');
ok('usuarios: página 2 muestra los siguientes', p2.text.includes(`Mostrando 16–${Math.min(30, totalUsuarios)} de ${totalUsuarios} usuarios`));
ok('página fuera de rango vuelve a la última', (await a('/admin/usuarios?pagina=999')).text.includes(`de ${totalUsuarios} usuarios`));
await db.collection('cancelacionlogs').insertMany(Array.from({ length: 17 }, (_, i) => ({ cliente: new mongoose.Types.ObjectId(), nombreCliente: 'pag', eventoNombre: 'EventoPaginado', codigoBoleto: 'TICK-P' + i, cantidad: 1, fechaCancelacion: new Date() })));
const pc = await a('/admin/cancelaciones?busqueda=EventoPaginado');
ok('cancelaciones: paginan conservando la búsqueda', pc.text.includes('de 17 cancelaciones') && pc.text.includes('busqueda=EventoPaginado&amp;pagina=2'));
ok('pagos: muestra el contador de paginación', (await a('/admin/pagos')).text.includes('transacciones'));

// ---------- Límite de intentos de login ----------
const atacante = cliente();
const fallos = [];
for (let i = 0; i < 5; i++) fallos.push((await login(atacante, 'cliente3', 'mala')).status);
ok('los primeros 5 intentos fallidos dan 400', fallos.every(x => x === 400), fallos.join(','));
const bloqueado = await login(atacante, 'cliente3', 'mala');
ok('el 6.º intento queda bloqueado (429)', bloqueado.status === 429 && bloqueado.text.includes('Demasiados intentos'));
ok('bloqueado incluso con la contraseña correcta', (await login(atacante, 'cliente3', '123')).status === 429);
ok('otro usuario no se ve afectado', (await login(cliente(), 'cliente2')).location === '/cliente/menu');

// ---------- Logout borra la sesión ----------
await c1('/auth/logout');
ok('logout borra la sesión de MongoDB', !(await db.collection('sesiones').findOne({ _id: sid })));

await mongoose.disconnect();
for (const [e, n, x] of res) console.log(e, n, x ? '— ' + x : '');
console.log(`\n${res.filter(r => r[0] === 'OK  ').length}/${res.length} OK`);
