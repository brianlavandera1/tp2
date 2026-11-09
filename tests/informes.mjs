// Pruebas de los arreglos del informe y del precio del carrito (servidor en :3998, base TP2_pruebas)
import mongoose from 'mongoose';
const BASE = 'http://localhost:3998';
const res = [];
const ok = (n, c, x = '') => res.push([c ? 'OK  ' : 'FALLA', n, x]);
function cliente() {
  let cookie = '';
  return async (path, { method = 'GET', form, accept = 'text/html' } = {}) => {
    const headers = { Accept: accept };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    const r = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: r.status, location: r.headers.get('location'), text: await r.text() };
  };
}
const tarjeta = { medioPago: 'Tarjeta de Crédito', titular: 'Juan Perez', numeroTarjeta: '4111111111111111', vencimiento: '12/30', cvv: '123' };

await mongoose.connect('mongodb://127.0.0.1:27017/TP2_pruebas');
const db = mongoose.connection.db;
const ev = await db.collection('eventos').findOne({ sala: { $ne: null } });
const cupoInicial = ev.entradasDisponibles;

// El seed ya trae historial de ventas: se toma la fila del informe ANTES de comprar como base
const numero = (s) => Number(String(s).replace(/[^\d]/g, ''));
const filaInforme = async (c) => {
  const html = (await c('/admin/informe')).text;
  const fila = html.slice(html.indexOf('<tbody', html.indexOf('Desglose por evento'))).split(ev.nombre)[1].split('</tr>')[0];
  const celdas = [...fila.matchAll(/<td[^>]*>([^<]*)</g)].map(m => m[1].trim()).filter(Boolean);
  // celdas: sala, cupo, vendidas, disponibles, % , $recaudado
  return { cupo: numero(celdas[1]), vendidas: numero(celdas[2]), disponibles: numero(celdas[3]), recaudado: numero(celdas.find(x => x.startsWith('$'))), texto: celdas.join(' | ') };
};
const admin0 = cliente(); await admin0('/auth/login', { method: 'POST', form: { identificador: 'admin', password: '123' } });
const base = await filaInforme(admin0);

// cliente2 (sin descuento) compra 3 General; cliente1 (VIP 30%) compra 2 General
const c2 = cliente(); await c2('/auth/login', { method: 'POST', form: { identificador: 'cliente2', password: '123' } });
await c2('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(ev._id), cantidad: '3', tipoEntrada: 'General' } });
ok('compra cliente2', (await c2('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta })).text.includes('REC-'));
const c1 = cliente(); await c1('/auth/login', { method: 'POST', form: { identificador: 'cliente1', password: '123' } });
await c1('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(ev._id), cantidad: '2', tipoEntrada: 'General' } });
ok('compra cliente1 (VIP)', (await c1('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta })).text.includes('REC-'));

// cliente2 cancela su entrada
const idCliente2 = (await db.collection('usuarios').findOne({ nombreUsuario: 'cliente2' }))._id;
const entC2 = await db.collection('entradas').findOne({ evento: ev._id, cantidad: 3, cliente: idCliente2 }, { sort: { createdAt: -1 } });
ok('cancelación', (await c2('/cliente/cancelar-entrada/' + entC2._id, { method: 'POST', accept: 'application/json' })).status === 200);
const tx = await db.collection('transaccions').findOne({ _id: entC2.transaccion });
ok('la transacción registra 3 canceladas', tx.items[0].cantidadCancelada === 3, JSON.stringify(tx.items[0]));

// Informe: solo deben contar las 2 de cliente1, cobradas con 30% de descuento
const a = cliente(); await a('/auth/login', { method: 'POST', form: { identificador: 'admin', password: '123' } });
const despues = await filaInforme(a);
const precio = ev.precio;
const esperado = Math.round(2 * precio * 0.7);
ok('informe: vendidas suma 2 (sin la cancelada)', despues.vendidas === base.vendidas + 2, `${base.vendidas} -> ${despues.vendidas}`);
ok('informe: el cupo total no cambia', despues.cupo === base.cupo && base.cupo === cupoInicial + Object.values(ev.vendidosPorZona || {}).reduce((s, n) => s + n, 0), `${base.cupo} -> ${despues.cupo}`);
ok('informe: disponibles baja 2', despues.disponibles === base.disponibles - 2, `${base.disponibles} -> ${despues.disponibles}`);
ok('informe: recaudado suma lo neto con descuento', despues.recaudado - base.recaudado === esperado, `+${despues.recaudado - base.recaudado} (esperado +${esperado})`);

// Precio cambia entre agregar al carrito y pagar
const c3 = cliente(); await c3('/auth/login', { method: 'POST', form: { identificador: 'cliente3', password: '123' } });
await c3('/cliente/carrito/agregar', { method: 'POST', accept: 'application/json', form: { eventoId: String(ev._id), cantidad: '1', tipoEntrada: 'General' } });
await db.collection('eventos').updateOne({ _id: ev._id }, { $set: { precio: precio + 1000 } });
const pago1 = await c3('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
ok('si el precio cambió, avisa y no cobra', pago1.status === 400 && pago1.text.includes('precios cambiaron'), 'status ' + pago1.status);
const pago2 = await c3('/cliente/carrito/procesar-pago', { method: 'POST', form: tarjeta });
ok('al confirmar, cobra el precio nuevo', pago2.status === 200 && pago2.text.includes('REC-'));
const tx3 = await db.collection('transaccions').findOne({}, { sort: { fechaCompra: -1 } });
ok('transacción con precio nuevo', tx3.items[0].precio === precio + 1000, String(tx3.items[0].precio));

await mongoose.disconnect();
for (const [e, n, x] of res) console.log(e, n, x ? '— ' + x : '');
console.log(`\n${res.filter(r => r[0] === 'OK  ').length}/${res.length} OK`);
