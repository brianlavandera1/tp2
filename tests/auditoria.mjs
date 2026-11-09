// Pruebas: administradores protegidos, borrado lógico (nada se elimina) y registro de actividad
import mongoose from 'mongoose';
const BASE = 'http://localhost:3998';
const res = [];
const ok = (n, c, x = '') => res.push([c ? 'OK  ' : 'FALLA', n, x]);
const esperar = (ms) => new Promise(r => setTimeout(r, ms));

function cliente() {
  let cookie = '';
  return async (path, { method = 'GET', form, accept = 'text/html' } = {}) => {
    const headers = { Accept: accept, Origin: 'http://localhost:3998' };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    const r = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, location: decodeURIComponent(r.headers.get('location') || ''), text: await r.text() };
  };
}
const login = (c, u, p = '123') => c('/auth/login', { method: 'POST', form: { identificador: u, password: p } });
const tarjeta = { medioPago: 'Tarjeta de Crédito', titular: 'Juan Perez', numeroTarjeta: '4111111111111111', vencimiento: '12/30', cvv: '123' };

await mongoose.connect('mongodb://127.0.0.1:27017/TP2_pruebas');
const db = mongoose.connection.db;
const U = db.collection('usuarios'), A = db.collection('actividades');
const adminDoc = await U.findOne({ nombreUsuario: 'admin' });

// ---------- Administradores protegidos ----------
const a = cliente(); await login(a, 'admin');
const lista = async (c) => { let t = ''; for (let p = 1; p <= 5; p++) t += (await c('/admin/usuarios?pagina=' + p)).text; return t; };
const datosForm = (u, extra = {}) => ({ nombreUsuario: u.nombreUsuario, nombre: u.nombre, apellido: u.apellido, email: u.email, dni: u.dni, telefono: u.telefono, fechaNacimiento: '1985-03-10', rol: u.rol, tipoCliente: u.tipoCliente, ...extra });
const nuevoAdmin = (n, dni) => ({ nombreUsuario: n, nombre: 'Nuevo', apellido: 'Admin', email: n + '@t.com', dni, telefono: '1100000000', fechaNacimiento: '1985-03-10', rol: 'Administrador', tipoCliente: 'ESTANDAR', password: 'clave' });
const admin2Doc = await U.findOne({ nombreUsuario: 'admin2' });
const b = cliente(); await login(b, 'admin2');

// El superadministrador gestiona a los demás administradores
const listaSuper = await lista(a);
ok('admin se ve como Superadministrador', listaSuper.includes('Superadministrador'));
ok('admin ve Editar en otro administrador', listaSuper.includes(`/admin/usuarios/editar/${admin2Doc._id}`));
ok('admin ve Eliminar en otro administrador', listaSuper.includes(`/admin/usuarios/eliminar/${admin2Doc._id}`));
ok('admin no ve Eliminar en su propia cuenta', !listaSuper.includes(`/admin/usuarios/eliminar/${adminDoc._id}`));
const creado = await a('/admin/crear-personal', { method: 'POST', form: nuevoAdmin('admin3', '11223344') });
const admin3Doc = await U.findOne({ nombreUsuario: 'admin3' });
ok('admin puede crear administradores', creado.status === 302 && admin3Doc?.rol === 'Administrador');
await a(`/admin/usuarios/editar/${admin3Doc._id}`, { method: 'POST', form: datosForm(admin3Doc, { nombre: 'Cambiado' }) });
ok('admin puede editar a otro administrador', (await U.findOne({ _id: admin3Doc._id })).nombre === 'Cambiado');

// Los demás administradores están protegidos entre sí
const listaOtro = await lista(b);
ok('otro admin ve "Protegido" y no se ve como super', listaOtro.includes('Protegido') && !listaOtro.includes(`/admin/usuarios/editar/${admin3Doc._id}`) && !listaOtro.includes(`/admin/usuarios/eliminar/${admin3Doc._id}`));
ok('otro admin no abre la edición de un administrador', (await b(`/admin/usuarios/editar/${admin3Doc._id}`)).location.includes('protegidos'));
await b(`/admin/usuarios/editar/${admin3Doc._id}`, { method: 'POST', form: datosForm(admin3Doc, { nombre: 'Hackeado', rol: 'Cliente' }) });
const admin3Tras = await U.findOne({ _id: admin3Doc._id });
ok('otro admin no edita a un administrador por POST', admin3Tras.nombre === 'Cambiado' && admin3Tras.rol === 'Administrador');
const elimOtro = await b(`/admin/usuarios/eliminar/${admin3Doc._id}`, { method: 'POST' });
ok('otro admin no elimina a un administrador', elimOtro.location.includes('protegidos') && !(await U.findOne({ _id: admin3Doc._id })).eliminado);
const elimSuperPorOtro = await b(`/admin/usuarios/eliminar/${adminDoc._id}`, { method: 'POST' });
ok('otro admin no elimina al superadministrador', elimSuperPorOtro.location.includes('protegidos') && !(await U.findOne({ _id: adminDoc._id })).eliminado);
await b(`/admin/usuarios/editar/${adminDoc._id}`, { method: 'POST', form: datosForm(adminDoc, { nombre: 'Hackeado' }) });
ok('otro admin no edita al superadministrador', (await U.findOne({ _id: adminDoc._id })).nombre === adminDoc.nombre);
const creaOtro = await b('/admin/crear-personal', { method: 'POST', form: nuevoAdmin('admin4', '11223345') });
ok('otro admin no crea administradores', creaOtro.status === 400 && !(await U.findOne({ nombreUsuario: 'admin4' })));
ok('otro admin no tiene la opción Administrador', !(await b('/admin/crear-personal')).text.includes('<option value="Administrador"'));
const lectorDoc = await U.findOne({ nombreUsuario: 'lector2' });
const promo = await b(`/admin/usuarios/editar/${lectorDoc._id}`, { method: 'POST', form: datosForm(lectorDoc, { rol: 'Administrador' }) });
ok('otro admin no asciende a administrador', promo.status === 400 && (await U.findOne({ _id: lectorDoc._id })).rol === 'Lector');
await b(`/admin/usuarios/editar/${lectorDoc._id}`, { method: 'POST', form: datosForm(lectorDoc, { nombre: 'Editado' }) });
ok('otro admin sí edita a quien no es administrador', (await U.findOne({ _id: lectorDoc._id })).nombre === 'Editado');
const cliente5 = await U.findOne({ nombreUsuario: 'cliente5' });
await b(`/admin/usuarios/eliminar/${cliente5._id}`, { method: 'POST' });
ok('otro admin sí elimina a quien no es administrador', (await U.findOne({ _id: cliente5._id })).eliminado === true);

// Nadie elimina al superadministrador, ni él mismo; conserva su usuario y su rol
const elimSelf = await a(`/admin/usuarios/eliminar/${adminDoc._id}`, { method: 'POST' });
ok('admin no se puede eliminar a sí mismo', elimSelf.location.includes('propio') && !(await U.findOne({ _id: adminDoc._id })).eliminado);
ok('admin puede abrir su propia edición', (await a(`/admin/usuarios/editar/${adminDoc._id}`)).status === 200);
await a(`/admin/usuarios/editar/${adminDoc._id}`, { method: 'POST', form: datosForm(adminDoc, { nombreUsuario: 'otronombre', rol: 'Cliente', nombre: 'Superior' }) });
const adminTras = await U.findOne({ _id: adminDoc._id });
ok('admin edita sus datos pero conserva usuario y rol', adminTras.nombre === 'Superior' && adminTras.nombreUsuario === 'admin' && adminTras.rol === 'Administrador');

// Eliminar un administrador: lo hace el superadministrador y queda en el histórico
const elimA3 = await a(`/admin/usuarios/eliminar/${admin3Doc._id}`, { method: 'POST' });
ok('admin elimina a otro administrador (queda en el histórico)', elimA3.location.includes('eliminado') && (await U.findOne({ _id: admin3Doc._id })).eliminado === true);
ok('el administrador eliminado no puede iniciar sesión', (await login(cliente(), 'admin3', 'clave')).status === 400);

// Editar un no-admin ignora campos que no son del formulario
const sup = await U.findOne({ nombreUsuario: 'supervisor' });
await a(`/admin/usuarios/editar/${sup._id}`, { method: 'POST', form: { nombreUsuario: 'supervisor', nombre: 'Sara', apellido: 'Lopez', email: sup.email, dni: sup.dni, telefono: sup.telefono, fechaNacimiento: '1985-03-10', rol: 'Supervisor', tipoCliente: 'ESTANDAR', eliminado: 'true', porcentajeDescuento: '0.9' } });
const supDespues = await U.findOne({ _id: sup._id });
ok('editar ignora campos no permitidos (eliminado, descuento)', !supDespues.eliminado && supDespues.porcentajeDescuento === 0);

// ---------- Borrado lógico de usuarios ----------
const c2 = await U.findOne({ nombreUsuario: 'cliente2' });
const elim = await a(`/admin/usuarios/eliminar/${c2._id}`, { method: 'POST' });
const c2Despues = await U.findOne({ _id: c2._id });
ok('eliminar usuario NO lo borra de la base', !!c2Despues && c2Despues.eliminado === true && c2Despues.eliminadoPor === 'admin' && !!c2Despues.eliminadoEn, elim.location);
ok('el usuario eliminado no aparece en la lista', !(await a('/admin/usuarios?pagina=1')).text.includes('>cliente2<'));
ok('el usuario eliminado no puede iniciar sesión', (await login(cliente(), 'cliente2')).status === 400);

// ---------- Borrado lógico de eventos, salas y artistas ----------
const salaRes = await a('/admin/salas', { method: 'POST', form: { nombre: 'Sala Auditoría', ubicacion: 'Centro', general: '50', platea: '10', vip: '5' } });
const sala = await db.collection('salas').findOne({ nombre: 'Sala Auditoría' });
await a('/admin/eventos', { method: 'POST', form: { nombre: 'Evento Auditoría', descripcion: 'd', fecha: '2027-05-01', hora: '20:00', precio: '1000', entradasDisponibles: '20', sala: String(sala._id), nombreEntidadTexto: 'Artista Auditoría' } });
const ev = await db.collection('eventos').findOne({ nombre: 'Evento Auditoría' });
const art = await db.collection('entidades').findOne({ nombre: 'Artista Auditoría' });
await a(`/admin/eventos/eliminar/${ev._id}`, { method: 'POST' });
ok('eliminar evento lo marca, no lo borra', (await db.collection('eventos').findOne({ _id: ev._id }))?.eliminado === true);
ok('el evento eliminado no está en la cartelera', !(await (async () => { const c = cliente(); await login(c, 'cliente1'); return (await c('/cliente/comprar')).text; })()).includes('Evento Auditoría'));
ok('el evento eliminado no está en el panel', !(await a('/admin/eventos')).text.includes('Evento Auditoría'));
await a(`/admin/salas/eliminar/${sala._id}`, { method: 'POST' });
ok('eliminar sala la marca, no la borra', (await db.collection('salas').findOne({ _id: sala._id }))?.eliminado === true, salaRes.location);
await a(`/admin/entidades/eliminar/${art._id}`, { method: 'POST' });
ok('eliminar artista lo marca, no lo borra', (await db.collection('entidades').findOne({ _id: art._id }))?.eliminado === true);

// ---------- Entradas canceladas quedan en el histórico ----------
const c1 = cliente(); await login(c1, 'cliente1');
const evC = await db.collection('eventos').findOne({ eliminado: { $ne: true } }, { sort: { fecha: 1 } });
await c1('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(evC._id), cantidad: '1', tipoEntrada: 'General' } });
await c1('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
const idC1 = (await U.findOne({ nombreUsuario: 'cliente1' }))._id;
const entrada = await db.collection('entradas').findOne({ cliente: idC1, evento: evC._id }, { sort: { createdAt: -1 } });
await c1('/cliente/cancelar-entrada/' + entrada._id, { method: 'POST', accept: 'application/json' });
const entradaDespues = await db.collection('entradas').findOne({ _id: entrada._id });
ok('cancelar NO borra la entrada: queda "Cancelada"', entradaDespues?.estado === 'Cancelada' && entradaDespues.canceladaPor === 'cliente1' && !!entradaDespues.canceladaEn);
ok('la cancelada no aparece en Mis entradas', !(await c1('/cliente/mis-compras')).text.includes(entrada.codigoBoleto));
const valid = await a('/admin/validar/' + entrada.codigoBoleto);
ok('validar una cancelada muestra "Entrada cancelada"', valid.text.includes('Entrada cancelada') && !valid.text.includes('Marcar como usada'));
const intento = await a('/admin/validar/' + entrada.codigoBoleto, { method: 'POST' });
ok('una cancelada no se puede marcar como usada', intento.location.includes('cancelada'));
// DELETE de la API también cancela (no borra)
await c1('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(evC._id), cantidad: '2', tipoEntrada: 'General' } });
await c1('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
const entrada2 = await db.collection('entradas').findOne({ cliente: idC1, evento: evC._id, estado: 'Completado' }, { sort: { createdAt: -1 } });
const stockAntes = (await db.collection('eventos').findOne({ _id: evC._id })).entradasDisponibles;
const borrarApi = await a('/entradas/' + entrada2._id, { method: 'DELETE', accept: 'application/json' });
ok('DELETE /entradas/:id cancela y devuelve el cupo', borrarApi.status === 200 && (await db.collection('entradas').findOne({ _id: entrada2._id })).estado === 'Cancelada' && (await db.collection('eventos').findOne({ _id: evC._id })).entradasDisponibles === stockAntes + 2);

// ---------- Registro de actividad ----------
const malo = cliente(); await login(malo, 'cliente1', 'incorrecta');
for (let i = 0; i < 3; i++) await c1('/actividad/click', { method: 'POST', form: { elemento: 'Cartelera', zona: 'menú', destino: '/cliente/comprar', pagina: '/cliente/menu' } });
ok('click sin sesión no se registra', (await cliente()('/actividad/click', { method: 'POST', form: { elemento: 'X' } })).status === 302);
await c1('/cliente/comprar');
await c1('/auth/logout');
await esperar(400); // el registro se guarda al terminar cada respuesta

const buscar = (f) => A.findOne(f);
ok('registra inicio de sesión', !!(await buscar({ nombreUsuario: 'admin', tipo: 'sesion', accion: 'Inicio de sesión', exito: true })));
ok('registra intentos de login fallidos', !!(await buscar({ nombreUsuario: 'cliente1', accion: 'Intento de login fallido', exito: false })));
ok('registra cierre de sesión con el usuario', !!(await buscar({ nombreUsuario: 'cliente1', accion: 'Cierre de sesión' })));
ok('registra páginas visitadas', !!(await buscar({ nombreUsuario: 'cliente1', tipo: 'navegacion', accion: 'Abrió Cartelera' })));
ok('registra compras', !!(await buscar({ nombreUsuario: 'cliente1', tipo: 'accion', accion: 'Compra', exito: true })));
ok('registra cancelaciones', !!(await buscar({ nombreUsuario: 'cliente1', accion: 'Cancelar entrada' })));
ok('registra eliminaciones con el id', !!(await buscar({ nombreUsuario: 'admin', accion: 'Eliminar usuario', detalle: new RegExp(String(c2._id)) })));
ok('registra ediciones', !!(await buscar({ nombreUsuario: 'admin', accion: 'Editar usuario' })));
ok('registra validaciones en la puerta', !!(await buscar({ nombreUsuario: 'admin', accion: 'Validar entrada en la puerta' })));
ok('registra cada clic (3 en "Cartelera")', (await A.countDocuments({ nombreUsuario: 'cliente1', tipo: 'click', accion: 'Cartelera' })) === 3);
ok('cada registro tiene sesión, IP y navegador', !!(await buscar({ nombreUsuario: 'cliente1', tipo: 'accion', sesionId: /^[a-f0-9]{12}$/, ip: { $ne: null }, navegador: { $ne: '' } })));
const sensibles = await A.countDocuments({ $or: [{ detalle: /4111|password|cvv|numeroTarjeta/i }, { accion: /4111/ }] });
ok('nunca guarda contraseñas ni tarjetas', sensibles === 0, `${sensibles} registro(s) sensibles`);

// ---------- Quién puede ver la actividad ----------
const s = cliente(); await login(s, 'supervisor');
const l = cliente(); await login(l, 'lector');
const c3 = cliente(); await login(c3, 'cliente3');
ok('Administrador ve la actividad', (await a('/admin/actividad')).status === 200);
ok('Supervisor ve la actividad', (await s('/admin/actividad')).status === 200);
ok('Lector NO ve la actividad (403)', (await l('/admin/actividad')).status === 403);
ok('Cliente NO ve la actividad (403)', (await c3('/admin/actividad')).status === 403);
const pagina = await a('/admin/actividad?usuario=cliente1');
ok('la pantalla muestra el ranking de clics', pagina.text.includes('Botones y solapas más usados') && pagina.text.includes('3 veces'));
ok('filtra por usuario', pagina.text.includes('Compra') && !pagina.text.includes('>Validar entrada en la puerta<'));
ok('muestra el histórico de eliminados', (await a('/admin/actividad')).text.includes('Evento Auditoría') && (await a('/admin/actividad')).text.includes('cliente2 (Cliente)'));
const sesion = (await buscar({ nombreUsuario: 'cliente1', tipo: 'accion', accion: 'Compra' })).sesionId;
ok('filtra por sesión', (await a('/admin/actividad?sesion=' + sesion)).text.includes('Compra'));

await mongoose.disconnect();
for (const [e, n, x] of res) console.log(e, n, x ? '— ' + x : '');
console.log(`\n${res.filter(r => r[0] === 'OK  ').length}/${res.length} OK`);
