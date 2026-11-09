import ExcelJS from 'exceljs';
import mongoose from 'mongoose';

const BASE = 'http://localhost:3998';
let ok = 0, mal = 0;
const t = (n, c, x = '') => { c ? ok++ : mal++; console.log(c ? 'OK  ' : 'FALLA', n, x); };
const login = async (u) => {
  const r = await fetch(BASE + '/auth/login', { method: 'POST', redirect: 'manual', headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' }, body: `identificador=${u}&password=123` });
  return r.headers.get('set-cookie').split(';')[0];
};
const baja = async (url, c) => {
  const r = await fetch(BASE + url, { headers: c ? { Cookie: c } : {}, redirect: 'manual' });
  return { r, b: Buffer.from(await r.arrayBuffer()) };
};
const leer = async (b) => { const l = new ExcelJS.Workbook(); await l.xlsx.load(b); return l; };

await mongoose.connect('mongodb://127.0.0.1:27017/TP2_pruebas');
const db = mongoose.connection.db;
const tot = await db.collection('transaccions').countDocuments();
const admin = await login('admin');

let { r, b } = await baja('/admin/pagos/excel', admin);
t('pagos 200 xlsx', r.status === 200 && r.headers.get('content-type').includes('spreadsheetml'), r.status);
t('nombre de archivo', /attachment; filename="pagos-\d{4}-\d{2}-\d{2}\.xlsx"/.test(r.headers.get('content-disposition')));
let l = await leer(b);
const h = l.getWorksheet('Compras');
t('una fila por compra + encabezado + totales', tot > 0 && h.rowCount === tot + 2, `${h.rowCount} vs ${tot}`);
t('hoja de detalle', !!l.getWorksheet('Detalle por evento'));
const col = {};
h.getRow(1).eachCell((celda, i) => { col[celda.value] = i; });
t('sin datos de tarjeta', !/tarjeta/i.test(JSON.stringify(h.getRow(1).values)));
let suma = 0;
for (let i = 2; i < tot + 2; i++) suma += h.getRow(i).getCell(col.Total).value;
t('total coincide', Math.round(suma) === Math.round(h.getRow(tot + 2).getCell(col.Total).value), suma);
const totalBD = (await db.collection('transaccions').aggregate([{ $group: { _id: null, t: { $sum: '$total' } } }]).toArray())[0].t;
t('total igual a la base', Math.round(suma) === Math.round(totalBD), totalBD);
t('fecha es fecha real', h.getRow(2).getCell(col.Fecha).value instanceof Date);

// Hora local: la compra más nueva, corrida 3 horas respecto de UTC
const nueva = await db.collection('transaccions').find().sort({ fechaCompra: -1 }).limit(1).next();
t('fecha en hora de Argentina', h.getRow(2).getCell(col.Fecha).value.getTime() === nueva.fechaCompra.getTime() - 3 * 3600 * 1000);

const uno = h.getRow(2).getCell(col.Comprobante).value;
({ r, b } = await baja('/admin/pagos/excel?busqueda=' + uno, admin));
l = await leer(b);
t('respeta la búsqueda', l.getWorksheet('Compras').rowCount === 3, l.getWorksheet('Compras').rowCount);
({ r } = await baja('/admin/pagos/excel?filtro=hoy', admin));
t('filtro hoy', r.status === 200);
({ r } = await baja('/admin/pagos/excel?busqueda[]=x&filtro[]=y', admin));
t('parámetros raros no rompen', r.status === 200, r.status);

({ r, b } = await baja('/admin/informe/excel', admin));
l = await leer(b);
t('informe 200', r.status === 200);
t('informe hojas', ['Resumen', 'Por evento', 'Por día', 'Por canal', 'Por sector'].every(n => l.getWorksheet(n)));
const hist = l.getWorksheet('Resumen').getRow(5).getCell(2).value;
const html = await (await fetch(BASE + '/admin/informe', { headers: { Cookie: admin } })).text();
t('recaudación igual a la pantalla', html.includes(hist), hist);

({ r, b } = await baja('/admin/informe/excel?fechaInicio=2026-10-20&fechaFin=2026-10-25', admin));
l = await leer(b);
t('informe por período', l.getWorksheet('Por día').rowCount === 7 && String(l.getWorksheet('Resumen').getRow(2).getCell(2).value).includes('2026-10-20'), l.getWorksheet('Por día').rowCount);
t('primer día correcto', l.getWorksheet('Por día').getRow(2).getCell(1).value.toISOString().startsWith('2026-10-20'));
({ r } = await baja('/admin/informe/excel?fechaInicio=basura', admin));
t('fecha inválida no rompe', r.status === 200, r.status);

for (const u of ['supervisor', 'lector']) {
  const c = await login(u);
  t(u + ' puede', (await baja('/admin/pagos/excel', c)).r.status === 200);
}
const cli = await login('cliente1');
t('cliente no puede pagos', (await baja('/admin/pagos/excel', cli)).r.status === 403);
t('cliente no puede informe', (await baja('/admin/informe/excel', cli)).r.status === 403);
t('sin sesión no puede', (await baja('/admin/pagos/excel')).r.status === 302);

const p = await (await fetch(BASE + '/admin/pagos?busqueda=abc&filtro=hoy', { headers: { Cookie: admin } })).text();
t('botón pagos con filtros', /href="\/admin\/pagos\/excel\?busqueda=abc&amp;filtro=hoy"/.test(p));
t('botón informe', html.includes('href="/admin/informe/excel"'));
await new Promise(res => setTimeout(res, 500));
t('queda en Actividad', await db.collection('actividades').countDocuments({ accion: 'Descargar Excel de pagos', nombreUsuario: 'admin' }) > 0);

console.log(`\n${ok}/${ok + mal} OK`);
await mongoose.disconnect();
process.exit(mal ? 1 : 0);
