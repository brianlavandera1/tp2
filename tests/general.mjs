// Pruebas de punta a punta contra el servidor en :3998 (base TP2_pruebas)
import mongoose from 'mongoose';
const BASE = 'http://localhost:3998';
const resultados = [];
const ok = (nombre, cond, extra = '') => { resultados.push([cond ? 'OK  ' : 'FALLA', nombre, extra]); };

function cliente() {
  let cookie = '';
  return async (path, { method = 'GET', form, json, accept = 'text/html' } = {}) => {
    const headers = { Accept: accept };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (json) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    const r = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, location: r.headers.get('location'), text: await r.text() };
  };
}

await mongoose.connect('mongodb://127.0.0.1:27017/TP2_pruebas');
const db = mongoose.connection.db;
const evento = await db.collection('eventos').findOne({ sala: { $ne: null } });
const stock0 = evento.entradasDisponibles;
const PASS = '123';

// ---------- Auth ----------
const anon = cliente();
ok('GET / lleva al inicio público', (await anon('/')).location === '/cliente/menu');
ok('login con clave incorrecta da 400', (await anon('/auth/login', { method: 'POST', form: { identificador: 'cliente1', password: 'x' } })).status === 400);
const sinCampos = await anon('/auth/login', { method: 'POST', form: {} });
ok('login sin campos no rompe (no 500)', sinCampos.status !== 500, 'status ' + sinCampos.status);
const inicioPublico = await anon('/cliente/menu');
ok('el inicio se ve sin sesión', inicioPublico.status === 200 && inicioPublico.text.includes('Iniciar sesión') && !inicioPublico.text.includes('/cliente/mis-compras') && !inicioPublico.text.includes('Hola,'));
const carteleraPublica = await anon('/cliente/comprar');
ok('la cartelera se ve sin sesión y pide entrar para comprar', carteleraPublica.status === 200 && carteleraPublica.text.includes('Iniciá sesión para comprar') && !carteleraPublica.text.includes('btn btn-agregar') && !carteleraPublica.text.includes('aria-label="Ver carrito"'));
const planesPublicos = await anon('/cliente/membresia');
ok('los planes se ven sin sesión y no piden tarjeta', planesPublicos.status === 200 && planesPublicos.text.includes('Iniciá sesión para elegir tu plan') && !planesPublicos.text.includes('id="datos-pago"') && !planesPublicos.text.includes('Tu plan'));
ok('la ayuda se ve sin sesión', (await anon('/ayuda')).status === 200);
for (const ruta of ['/auth/login', '/auth/registro']) ok(ruta + ' se puede cerrar con la cruz', (await anon(ruta)).text.includes('id="cerrar-acceso"'));
for (const ruta of ['/cliente/mis-compras', '/cliente/configuracion', '/cliente/carrito', '/cliente/carrito/checkout']) {
  ok(`${ruta} sin sesión pide login y recuerda la página`, (await anon(ruta)).location === `/auth/login?volver=${encodeURIComponent(ruta)}`);
}
ok('el panel sigue cerrado sin sesión', (await anon('/admin/dashboard')).location === '/auth/login');
ok('agregar al carrito sin sesión no funciona', (await anon('/cliente/carrito/agregar', { method: 'POST', form: { cantidad: '1' } })).status === 302);
ok('contratar un plan sin sesión no funciona', (await anon('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'VIP' } })).status === 302);
const formVolver = (volver) => ({ identificador: 'cliente2', password: '123', volver });
ok('el login recuerda a dónde volver', (await anon('/auth/login?volver=' + encodeURIComponent('/cliente/comprar#evento-1'))).text.includes('name="volver"'));
ok('al entrar vuelve a la página pedida', (await cliente()('/auth/login', { method: 'POST', form: formVolver('/cliente/mis-compras') })).location === '/cliente/mis-compras');
for (const malo of ['https://otro.com', '//otro.com', '/admin/dashboard', '/cliente/../admin/dashboard']) {
  ok(`no redirige afuera con volver=${malo}`, (await cliente()('/auth/login', { method: 'POST', form: formVolver(malo) })).location === '/cliente/menu');
}
const personal = cliente();
ok('el personal entra a su panel aunque venga volver', (await personal('/auth/login', { method: 'POST', form: { identificador: 'admin', password: '123', volver: '/cliente/comprar' } })).location === '/admin/dashboard');
const carteleraPersonal = await personal('/cliente/comprar');
ok('el personal mira la cartelera sin comprar ni descuento', carteleraPersonal.status === 200 && carteleraPersonal.text.includes('La compra online es para cuentas de cliente') && !carteleraPersonal.text.includes('class="sector-original"') && !carteleraPersonal.text.includes('btn btn-agregar'));
ok('salir vuelve al sitio público', (await personal('/auth/logout')).location === '/');

// Registro
const nuevo = { nombreUsuario: 'prueba_e2e', nombre: 'Juan', apellido: 'Perez', email: 'e2e@test.com', password: 'abc123', dni: '12345678', fechaNacimiento: '1995-05-05', telefono: '1122334455' };
const reg = await anon('/auth/registro', { method: 'POST', form: nuevo });
ok('registro de cliente redirige a login', reg.status === 302, 'status ' + reg.status);
const regDup = await anon('/auth/registro', { method: 'POST', form: nuevo });
ok('registro duplicado da 400', regDup.status === 400);
ok('registro con DNI inválido da 400', (await anon('/auth/registro', { method: 'POST', form: { ...nuevo, nombreUsuario: 'otro', email: 'o@t.com', dni: '12' } })).status === 400);
const loginNuevo = await anon('/auth/login', { method: 'POST', form: { identificador: 'e2e@test.com', password: 'abc123' } });
ok('login del cliente recién registrado (por email)', loginNuevo.location === '/cliente/menu');

// ---------- Cliente ----------
const c = cliente();
ok('login cliente1', (await c('/auth/login', { method: 'POST', form: { identificador: 'cliente1', password: PASS } })).location === '/cliente/menu');
for (const p of ['/cliente/menu', '/cliente/comprar', '/cliente/membresia', '/cliente/mis-compras', '/cliente/configuracion', '/cliente/carrito'])
  { const r = await c(p); ok('cliente GET ' + p, r.status === 200, 'status ' + r.status); }
const busq = await c('/cliente/comprar?buscar=' + encodeURIComponent('('));
ok('búsqueda con "(" no rompe', busq.status === 200, 'status ' + busq.status);
ok('cliente no entra a /admin/dashboard (403)', (await c('/admin/dashboard')).status === 403);

// Carrito y compra
const add = await c('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(evento._id), cantidad: '2', tipoEntrada: 'VIP' } });
ok('agregar 2 VIP al carrito', JSON.parse(add.text).success === true, add.text);
const addMucho = await c('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(evento._id), cantidad: '99999', tipoEntrada: 'General' } });
ok('agregar más que el stock da 400', addMucho.status === 400);
const carrito = await c('/cliente/carrito');
ok('carrito muestra el ítem', carrito.text.includes('VIP'));
const pagoMalo = await c('/cliente/carrito/procesar-pago', { method: 'POST', form: { medioPago: 'Tarjeta', titular: '', numeroTarjeta: '12', vencimiento: 'xx', cvv: '1' } });
ok('pago con tarjeta inválida es rechazado', pagoMalo.status !== 200 || !pagoMalo.text.includes('REC-'), 'status ' + pagoMalo.status);
// si el pago malo pasó, el carrito ya se vació: lo volvemos a llenar
await c('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(evento._id), cantidad: '2', tipoEntrada: 'VIP' } });
const pago = await c('/cliente/carrito/procesar-pago', { method: 'POST', form: { medioPago: 'Tarjeta', titular: 'Juan Perez', numeroTarjeta: '4111111111111111', vencimiento: '12/30', cvv: '123' } });
ok('pago válido muestra comprobante', pago.status === 200 && pago.text.includes('REC-'), 'status ' + pago.status);
const evDespues = await db.collection('eventos').findOne({ _id: evento._id });
ok('stock bajó después de la compra', evDespues.entradasDisponibles < stock0, `${stock0} -> ${evDespues.entradasDisponibles}`);
const entrada = await db.collection('entradas').findOne({ evento: evento._id, sector: 'VIP' }, { sort: { createdAt: -1 } });
ok('entrada VIP creada con código único', !!entrada && /^TICK-[0-9A-F]{10}$/.test(entrada.codigoBoleto), entrada?.codigoBoleto);
ok('mis-compras muestra el ticket', (await c('/cliente/mis-compras')).text.includes(entrada.codigoBoleto));

// API /entradas
const misEntradas = JSON.parse((await c('/entradas', { accept: 'application/json' })).text);
ok('GET /entradas solo devuelve las propias', misEntradas.every(e => String(e.cliente._id) === String(entrada.cliente)));
const c2 = cliente();
await c2('/auth/login', { method: 'POST', form: { identificador: 'prueba_e2e', password: 'abc123' } });
ok('otro cliente no ve una entrada ajena (404)', (await c2('/entradas/' + entrada._id, { accept: 'application/json' })).status === 404);
ok('otro cliente no puede cancelar entrada ajena', (await c2('/cliente/cancelar-entrada/' + entrada._id, { method: 'POST', accept: 'application/json' })).status === 404);

// Cancelación
const stockAntesCancel = (await db.collection('eventos').findOne({ _id: evento._id })).entradasDisponibles;
const cancel = await c('/cliente/cancelar-entrada/' + entrada._id, { method: 'POST', accept: 'application/json' });
ok('cancelar entrada propia', cancel.status === 200, cancel.text);
const stockPostCancel = (await db.collection('eventos').findOne({ _id: evento._id })).entradasDisponibles;
ok('cancelar devuelve el stock', stockPostCancel === stockAntesCancel + entrada.cantidad, `${stockAntesCancel} -> ${stockPostCancel} (cantidad ${entrada.cantidad})`);
const log = await db.collection('cancelacionlogs').findOne({ codigoBoleto: entrada.codigoBoleto });
ok('cancelación queda en el log con su evento', !!log && String(log.evento) === String(evento._id));
const tx = entrada.transaccion && await db.collection('transaccions').findOne({ _id: entrada.transaccion });
ok('entrada vinculada a su transacción online', !!tx && tx.canal === 'Online');

// Membresía y configuración
ok('membresía VIP con tarjeta inválida da 400', (await c('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'VIP', titular: 'Juan', numeroTarjeta: '1', vencimiento: '12/30', cvv: '123' } })).status === 400);
ok('membresía ESTANDAR', (await c('/cliente/procesar-membresia', { method: 'POST', form: { tipoCliente: 'ESTANDAR' } })).status === 302);
const conf = await c('/cliente/configuracion', { method: 'POST', form: { nombre: 'Ana', apellido: 'Gomez', email: 'no-es-un-email', telefono: '1122334455' } });
const u1 = await db.collection('usuarios').findOne({ nombreUsuario: 'cliente1' });
ok('configuración rechaza email inválido', u1.email !== 'no-es-un-email', 'email guardado: ' + u1.email);

// ---------- Admin ----------
const a = cliente();
ok('login admin', (await a('/auth/login', { method: 'POST', form: { identificador: 'admin', password: PASS } })).location === '/admin/dashboard');
for (const p of ['/admin/dashboard', '/admin/usuarios', '/admin/crear-personal', '/admin/pagos', '/admin/pagos?filtro=hoy&busqueda=cliente', '/admin/cancelaciones', '/admin/informe', '/admin/boleteria', '/admin/entidades', '/admin/salas', '/admin/eventos', '/admin/eventos/editar/' + evento._id, '/admin/salas/editar/' + evento.sala, '/admin/usuarios/editar/' + u1._id])
  { const r = await a(p); ok('admin GET ' + p, r.status === 200, 'status ' + r.status); }
const pagosRegex = await a('/admin/pagos?busqueda=' + encodeURIComponent('('));
ok('búsqueda de pagos con "(" no rompe', pagosRegex.status === 200, 'status ' + pagosRegex.status);

// Crear personal y loguearse con él
const sup = { nombreUsuario: 'super_e2e', nombre: 'Sara', apellido: 'Lopez', email: 'sup@test.com', password: 'clave123', dni: '23456789', telefono: '1199887766', fechaNacimiento: '1990-01-01', rol: 'Supervisor', tipoCliente: 'ESTANDAR' };
ok('admin crea Supervisor', (await a('/admin/crear-personal', { method: 'POST', form: sup })).status === 302);
const lec = { ...sup, nombreUsuario: 'lector_e2e', email: 'lec@test.com', dni: '34567890', rol: 'Lector' };
await a('/admin/crear-personal', { method: 'POST', form: lec });
const supDb = await db.collection('usuarios').findOne({ nombreUsuario: 'super_e2e' });
ok('contraseña del personal guardada encriptada', supDb?.password?.startsWith('$2'), supDb?.password?.startsWith('$2') ? '' : 'se guardó en texto plano');
const s = cliente();
ok('Supervisor puede iniciar sesión', (await s('/auth/login', { method: 'POST', form: { identificador: 'super_e2e', password: 'clave123' } })).location === '/admin/dashboard');
const l = cliente();
ok('Lector puede iniciar sesión', (await l('/auth/login', { method: 'POST', form: { identificador: 'lector_e2e', password: 'clave123' } })).location === '/admin/dashboard');

const salaZonasMalas = await a('/admin/salas', { method: 'POST', form: { nombre: 'Sin zonas', capacidad: '0', general: '0', platea: '0', vip: '0' } });
ok('sala con sectores inválidos muestra error (no 500)', salaZonasMalas.status === 400, 'status ' + salaZonasMalas.status);
ok('login muestra mensaje de registro exitoso', (await anon('/auth/login?exito=Registro+exitoso')).text.includes('Registro exitoso'));
ok('boletería rechaza sector inválido', (await s('/admin/boleteria/cobrar', { method: 'POST', form: { dniCliente: '45678901', nombreCliente: 'Pedro', eventoId: String(evento._id), tipoEntrada: 'Pullman', cantidad: '1', precioUnitario: '100', medioPago: 'Efectivo' } })).status === 400);

// Permisos por rol
ok('Lector no entra a boletería', (await l('/admin/boleteria')).status === 403);
ok('Lector no puede crear eventos', (await l('/admin/eventos', { method: 'POST', form: { nombre: 'x' } })).status === 403);
ok('Lector ve eventos', (await l('/admin/eventos')).status === 200);
ok('Supervisor no crea personal', (await s('/admin/crear-personal')).status === 403);

// Salas y eventos
const salaMala = await a('/admin/salas', { method: 'POST', form: { nombre: '', capacidad: '10', general: '5', platea: '0', vip: '0' } });
ok('crear sala inválida no da 500', salaMala.status !== 500, 'status ' + salaMala.status);
const salaOk = await a('/admin/salas', { method: 'POST', form: { nombre: 'Sala E2E', capacidad: '100', ubicacion: 'Centro', general: '60', platea: '30', vip: '10' } });
ok('crear sala válida', salaOk.status === 302 && !String(salaOk.location).includes('error'), salaOk.location);
const salaNueva = await db.collection('salas').findOne({ nombre: 'Sala E2E' });
const evNuevo = await a('/admin/eventos', { method: 'POST', form: { nombre: 'Evento E2E', descripcion: 'desc', fecha: '2027-01-10', hora: '20:00', precio: '1000', precioPlatea: '2000', precioVIP: '', entradasDisponibles: '50', sala: String(salaNueva?._id), nombreEntidadTexto: 'Artista E2E' } });
ok('crear evento con precios por sector', evNuevo.status === 302, 'status ' + evNuevo.status);
const evDb = await db.collection('eventos').findOne({ nombre: 'Evento E2E' });
ok('precioPlatea=2000 y precioVIP vacío=null', evDb?.precioPlatea === 2000 && evDb?.precioVIP === null, JSON.stringify({ p: evDb?.precioPlatea, v: evDb?.precioVIP }));
const evMucho = await a('/admin/eventos', { method: 'POST', form: { nombre: 'Excede', descripcion: 'd', fecha: '2027-01-10', precio: '1', entradasDisponibles: '500', sala: String(salaNueva?._id) } });
ok('evento con más entradas que la sala es rechazado', evMucho.status === 400 || String(evMucho.location).includes('error'), 'status ' + evMucho.status);
ok('editar evento', (await a('/admin/eventos/editar/' + evDb._id, { method: 'POST', form: { nombre: 'Evento E2E', precio: '1500', precioVIP: '3000', entradasDisponibles: '50' } })).status === 302);
const c3 = cliente(); await c3('/auth/login', { method: 'POST', form: { identificador: 'prueba_e2e', password: 'abc123' } });
await c3('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(evDb._id), cantidad: '1', tipoEntrada: 'VIP' } });
ok('carrito usa el precio VIP del evento', (await c3('/cliente/carrito')).text.includes('3.000'));

// Boletería
const stockBolAntes = (await db.collection('eventos').findOne({ _id: evDb._id })).entradasDisponibles;
const bol = await s('/admin/boleteria/cobrar', { method: 'POST', form: { dniCliente: '45678901', nombreCliente: 'Pedro Ruiz', eventoId: String(evDb._id), tipoEntrada: 'General', cantidad: '3', precioUnitario: '1500', medioPago: 'Efectivo' } });
ok('venta en boletería imprime ticket', bol.status === 200, 'status ' + bol.status);
const stockBolDespues = (await db.collection('eventos').findOne({ _id: evDb._id })).entradasDisponibles;
ok('boletería descuenta stock', stockBolDespues === stockBolAntes - 3, `${stockBolAntes} -> ${stockBolDespues}`);
const entBol = await db.collection('entradas').findOne({ evento: evDb._id, cantidad: 3 });
const txBol = entBol?.transaccion && await db.collection('transaccions').findOne({ _id: entBol.transaccion });
ok('venta de boletería guarda canal Sucursal y entrada vinculada', txBol?.canal === 'Sucursal');
ok('entidades sigue funcionando tras moverla al controlador', (await a('/admin/entidades')).status === 200 && (await a('/admin/entidades')).text.includes('Banda E2E') === false);
const bolMucho = await s('/admin/boleteria/cobrar', { method: 'POST', form: { dniCliente: '45678901', nombreCliente: 'Pedro Ruiz', eventoId: String(evDb._id), tipoEntrada: 'General', cantidad: '9999', precioUnitario: '1', medioPago: 'Efectivo' } });
ok('boletería rechaza vender más que el stock', bolMucho.status === 400, 'status ' + bolMucho.status);

// Entidades, usuarios
ok('crear entidad', (await a('/admin/entidades/crear', { method: 'POST', form: { nombre: 'Banda E2E' } })).status === 302);
ok('editar usuario', (await a('/admin/usuarios/editar/' + u1._id, { method: 'POST', form: { nombreUsuario: 'cliente1', nombre: 'Ana', apellido: 'Gomez', email: u1.email, dni: u1.dni, telefono: u1.telefono, fechaNacimiento: '1990-01-01', rol: 'Cliente', tipoCliente: 'ESTANDAR' } })).status === 302);
ok('Supervisor no elimina usuarios', (await s('/admin/usuarios/eliminar/' + supDb._id, { method: 'POST' })).status === 403);
ok('logout', (await a('/auth/logout')).location === '/');
ok('después del logout no entra a admin', (await a('/admin/dashboard')).location === '/auth/login');

await mongoose.disconnect();
for (const [e, n, x] of resultados) console.log(e, n, x ? '— ' + x : '');
console.log(`\n${resultados.filter(r => r[0] === 'OK  ').length}/${resultados.length} OK`);
