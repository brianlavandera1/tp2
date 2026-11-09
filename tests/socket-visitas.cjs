const { io } = require('socket.io-client');
const URL = 'http://127.0.0.1:3998';
const pausa = ms => new Promise(r => setTimeout(r, ms));
let fallas = 0;
const ver = (n, ok, x = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${n}${ok ? '' : ' -> ' + JSON.stringify(x)}`); };
const cookie = async (u) => { const r = await fetch(URL + '/auth/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ identificador: u, password: '123' }) }); return r.headers.get('set-cookie').split(';')[0]; };
const abrir = (headers = {}) => { const s = io(URL, { forceNew: true, transports: ['websocket'], extraHeaders: headers }); s.m = []; s.a = []; s.i = []; s.h = null; s.on('mensaje', x => s.m.push(x)); s.on('aviso', x => s.a.push(x)); s.on('invitar-registro', x => s.i.push(x)); s.on('historial', x => s.h = x); return s; };
const burbuja = async (r, c) => (await (await fetch(URL + r, { headers: c ? { Cookie: c } : {} })).text()).includes('class="chat-flotante');
const ipA = { 'x-forwarded-for': '10.0.0.1' };

(async () => {
  const c1 = await cookie('cliente1'), adm = await cookie('admin');
  const cli = abrir({ Cookie: c1 }), emp = abrir({ Cookie: adm }), v1 = abrir(ipA), v2 = abrir({ 'x-forwarded-for': '10.0.0.2' });
  await pausa(600);
  ver('la visita no recibe historial de clientes', v1.h === null);

  cli.emit('mensaje', { mensaje: 'dato privado del cliente' }); await pausa(300);
  ver('la visita no lee la sala de clientes', v1.m.length === 0 && v2.m.length === 0, v1.m);

  v1.emit('mensaje', { mensaje: '@gemini ¿necesito cuenta?' }); await pausa(800);
  ver('la visita ve su mensaje como Vos', v1.m[0]?.usuario === 'Vos', v1.m);
  ver('la visita recibe a Gemini', v1.m[1]?.esIA && v1.m[1].mensaje.startsWith('eco[¿necesito cuenta?]'), v1.m);
  ver('otra visita no lo ve', v2.m.length === 0, v2.m);
  ver('los clientes no lo ven', !cli.m.some(m => m.mensaje.includes('necesito')), cli.m);
  ver('la empresa no lo ve', emp.m.length === 0, emp.m);

  v1.emit('mensaje', { mensaje: 'seguida' }); await pausa(200);
  ver('espera entre consultas', v1.a.at(-1)?.includes('Esperá'), v1.a);

  for (let i = 2; i <= 10; i++) { await pausa(4100); v1.emit('mensaje', { mensaje: `sin prefijo ${i}` }); }
  await pausa(600);
  ver('sin prefijo también responde', v1.m.some(m => m.esIA && m.mensaje.startsWith('eco[sin prefijo 2]')), v1.m.slice(-2));
  ver('hizo 10 consultas', v1.m.filter(m => m.esIA).length === 10, v1.m.length);

  await pausa(4100); v1.emit('mensaje', { mensaje: 'la once' }); await pausa(300);
  ver('al superar 10 invita a registrarse', v1.i.at(-1)?.includes('límite') && v1.m.filter(m => m.esIA).length === 10, v1.i);

  const vReco = abrir(ipA); await pausa(300); vReco.emit('mensaje', { mensaje: 'reconecto' }); await pausa(300);
  ver('reconectar no renueva el límite', vReco.i.at(-1)?.includes('límite'), vReco.i);
  vReco.disconnect();

  const vs = [];
  for (let i = 0; i < 100; i++) vs.push(abrir({ 'x-forwarded-for': `falso, 20.0.0.${i + 1}` }));
  await pausa(1500);
  vs.forEach(s => s.emit('mensaje', { mensaje: 'carga' })); await pausa(2000);
  const ok = vs.filter(s => s.m.some(m => m.esIA)).length, inv = vs.filter(s => s.i.some(t => t.includes('solicitado'))).length;
  ver('el tope general corta en 100 por hora', ok === 90, { ok, inv });
  ver('el resto recibe la invitación', inv === 10, { ok, inv });
  vs.forEach(s => s.disconnect());

  const n = cli.m.length; await pausa(600);
  cli.emit('mensaje', { mensaje: '@gemini sigo pudiendo' }); await pausa(800);
  ver('los clientes no dependen del tope de visitas', cli.m.some(m => m.esIA && m.mensaje.startsWith('eco[sigo pudiendo]')), cli.m.slice(n));

  ver('burbuja para visitas', await burbuja('/cliente/menu'));
  ver('burbuja para clientes', await burbuja('/cliente/menu', c1));
  ver('sin burbuja para la empresa en el sitio', !(await burbuja('/cliente/menu', adm)));
  ver('sin burbuja en el panel', !(await burbuja('/admin/dashboard', adm)));

  console.log(fallas ? `FALLAS: ${fallas}` : 'TODO OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.log('ERROR', e.message); process.exit(2); });
