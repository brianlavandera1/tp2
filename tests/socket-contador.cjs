const { io } = require('socket.io-client');
const URL = 'http://127.0.0.1:3998';
const pausa = ms => new Promise(r => setTimeout(r, ms));
// Espera hasta que se cumpla la condición (con tope), así una computadora lenta no hace fallar la prueba.
const hasta = async (cond, max = 5000) => { const fin = Date.now() + max; while (!cond() && Date.now() < fin) await pausa(25); };
let fallas = 0;
const ver = (n, ok, x = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${ok ? '' : ' -> ' + x}`); };
const cookie = async (u) => (await fetch(URL + '/auth/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ identificador: u, password: '123' }) })).headers.get('set-cookie').split(';')[0];
const abrir = (c, v) => { const s = io(URL, { forceNew: true, transports: ['websocket'], auth: { visitante: v }, extraHeaders: c ? { Cookie: c } : {} }); s.n = []; s.on('usuarios-conectados', x => s.n.push(x)); return s; };
(async () => {
  const adm = await cookie('admin'), cli = await cookie('cliente1');
  const a = abrir(adm, 'navegador-admin'); await hasta(() => a.n.length > 0); await pausa(200);
  ver('la empresa ve el total', a.n.at(-1) === 1, a.n);
  const c = abrir(cli, 'navegador-cliente'); await hasta(() => a.n.at(-1) === 2); await pausa(200);
  ver('un cliente suma al total', a.n.at(-1) === 2, a.n);
  ver('el cliente no recibe el número', c.n.length === 0, c.n);
  const v = abrir(null, 'navegador-visita'); await hasta(() => a.n.at(-1) === 3); await pausa(200);
  ver('una visita suma al total', a.n.at(-1) === 3, a.n);
  ver('la visita no recibe el número', v.n.length === 0, v.n);
  const a2 = abrir(adm, 'navegador-admin'); await hasta(() => a2.n.length > 0); await pausa(200);
  ver('otra pestaña del personal recibe el total sin sumar', a2.n.at(-1) === 3 && a.n.at(-1) === 3, a2.n);
  v.disconnect(); await hasta(() => a.n.at(-1) === 2, 9000);
  ver('al irse una visita baja en vivo', a.n.at(-1) === 2, a.n);
  const pag = async (r, ck) => (await (await fetch(URL + r, { headers: ck ? { Cookie: ck } : {} })).text()).includes('class="conectados"');
  ver('el sitio sin sesión no muestra el contador', !(await pag('/cliente/menu')));
  ver('el sitio del cliente no lo muestra', !(await pag('/cliente/menu', cli)));
  ver('el panel lo muestra', await pag('/admin/dashboard', adm));
  console.log(fallas ? `FALLAS: ${fallas}` : 'TODO OK'); process.exit(fallas ? 1 : 0);
})().catch(e => { console.log('ERROR', e); process.exit(2); });
