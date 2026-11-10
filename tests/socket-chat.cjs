const { io } = require('socket.io-client');
const URL = 'http://127.0.0.1:3998';
const conClave = process.argv[2] !== 'sin-clave';
const pausa = ms => new Promise(r => setTimeout(r, ms));
// Espera hasta que se cumpla la condición (con tope), así una computadora lenta no hace fallar la prueba.
const hasta = async (cond, max = 5000) => { const fin = Date.now() + max; while (!cond() && Date.now() < fin) await pausa(25); };
let fallas = 0;
const ver = (nombre, ok, extra = '') => { if (!ok) fallas++; console.log(`${ok ? 'OK   ' : 'FALLA'} ${nombre}${ok ? '' : ' -> ' + extra}`); };

async function cookieDe(identificador, password) {
  const r = await fetch(URL + '/auth/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ identificador, password }) });
  const c = (r.headers.get('set-cookie') || '').split(';')[0];
  if (r.status !== 302 || !c) throw new Error('login falló ' + identificador + ' ' + r.status);
  return c;
}
const abrir = (cookie, extra = {}) => {
  const s = io(URL, { forceNew: true, transports: ['websocket'], extraHeaders: cookie ? { Cookie: cookie } : {}, ...extra });
  s.mensajes = []; s.avisos = []; s.historial = null; s.pensando = [];
  s.on('mensaje', m => s.mensajes.push(m));
  s.on('aviso', m => s.avisos.push(m));
  s.on('historial', h => { s.historial = h; });
  s.on('gemini-pensando', p => s.pensando.push(p));
  return s;
};

(async () => {
  const c1 = await cookieDe('cliente1', '123');
  const adm = await cookieDe('cliente2', '123');
  const a = abrir(c1), b = abrir(adm), anon = abrir(null);
  await hasta(() => Array.isArray(a.historial) && Array.isArray(b.historial) && anon.connected); await pausa(200);
  ver('con sesión recibe historial', Array.isArray(a.historial));
  ver('sin sesión NO recibe historial', anon.historial === null);

  a.emit('mensaje', { mensaje: 'hola a todos', usuario: 'admin' }); await hasta(() => b.mensajes.at(-1)?.mensaje === 'hola a todos');
  ver('llega a otro usuario sin recargar', b.mensajes.at(-1)?.mensaje === 'hola a todos', JSON.stringify(b.mensajes));
  ver('el autor sale de la sesión, no del cliente', b.mensajes.at(-1)?.usuario === 'cliente1', JSON.stringify(b.mensajes.at(-1)));
  ver('sin sesión no lee el chat', anon.mensajes.length === 0);

  const antes = b.mensajes.length;
  anon.emit('mensaje', { mensaje: 'soy anonimo' }); await pausa(300);
  ver('sin sesión no puede escribir', b.mensajes.length === antes);

  await pausa(600);
  a.emit('mensaje', { mensaje: 'x'.repeat(501) }); await hasta(() => a.avisos.at(-1)?.includes('500'));
  ver('más de 500 caracteres se rechaza', a.avisos.at(-1)?.includes('500') && b.mensajes.length === antes, a.avisos.at(-1));
  a.emit('mensaje', 123); a.emit('mensaje', null); a.emit('mensaje', { mensaje: { a: 1 } }); await pausa(200);
  ver('datos de tipo incorrecto no rompen nada', b.mensajes.length === antes && a.connected);

  await pausa(600);
  b.emit('mensaje', { mensaje: 'uno' }); b.emit('mensaje', { mensaje: 'dos' }); await hasta(() => b.mensajes.at(-1)?.mensaje === 'uno' && b.avisos.at(-1)?.includes('rápido')); await pausa(200);
  ver('límite de velocidad', b.mensajes.at(-1)?.mensaje === 'uno' && b.avisos.at(-1)?.includes('rápido'), JSON.stringify(b.avisos));

  await pausa(600);
  if (conClave) {
    a.emit('mensaje', { mensaje: '@gemini' }); await hasta(() => a.avisos.at(-1)?.includes('pregunta'));
    ver('@gemini vacío avisa solo al que escribe', a.avisos.at(-1)?.includes('pregunta') && b.mensajes.at(-1)?.mensaje === 'uno', a.avisos.at(-1));
    await pausa(600);
    a.emit('mensaje', { mensaje: '@GEMINI   ¿Qué planes hay?' }); await hasta(() => b.mensajes.some(m => m.mensaje === '@GEMINI   ¿Qué planes hay?') && b.pensando.includes(true));
    ver('se publica la pregunta', b.mensajes.some(m => m.mensaje === '@GEMINI   ¿Qué planes hay?'), JSON.stringify(b.mensajes.slice(-2)));
    ver('avisa que está pensando', b.pensando.includes(true));
    await hasta(() => b.mensajes.at(-1)?.esIA && a.mensajes.at(-1)?.esIA && b.pensando.at(-1) === false);
    const r = b.mensajes.at(-1);
    ver('Gemini responde a todos', r?.usuario === 'Gemini' && r?.esIA === true && a.mensajes.at(-1)?.mensaje === r.mensaje, JSON.stringify(r));
    ver('sin el prefijo, modelo y contexto correctos', r?.mensaje === 'eco[¿Qué planes hay?] modelo[gemini-flash-lite-latest] contexto[si]', r?.mensaje);
    ver('deja de pensar', b.pensando.at(-1) === false);

    await pausa(600);
    const n = b.mensajes.length;
    a.emit('mensaje', { mensaje: '@gemini otra' }); await hasta(() => a.avisos.at(-1)?.includes('Esperá')); await pausa(100);
    ver('espera entre consultas', a.avisos.at(-1)?.includes('Esperá') && b.mensajes.length === n, a.avisos.at(-1));

    await pausa(600);
    b.emit('mensaje', { mensaje: 'gemini sin arroba y @gemini al medio' }); await hasta(() => b.mensajes.some(m => m.mensaje === 'gemini sin arroba y @gemini al medio')); await pausa(500);
    ver('un mensaje normal no consulta a la IA', b.mensajes.at(-1)?.usuario === 'cliente2', JSON.stringify(b.mensajes.at(-1)));

    await pausa(600);
    b.emit('mensaje', { mensaje: '@gemini FALLA' }); await hasta(() => b.mensajes.at(-1)?.esIA);
    ver('si Gemini falla avisa y el servidor sigue', b.mensajes.at(-1)?.esIA && b.mensajes.at(-1)?.mensaje.includes('No pude') && b.connected, JSON.stringify(b.mensajes.at(-1)));

    const nuevo = abrir(adm); await hasta(() => nuevo.historial);
    ver('quien entra después ve el historial', nuevo.historial?.some(m => m.esIA));
    nuevo.disconnect();
  } else {
    const n = b.mensajes.length;
    a.emit('mensaje', { mensaje: '@gemini hola' }); await hasta(() => a.avisos.at(-1)?.includes('no está configurado') && b.mensajes.length === n + 1);
    ver('sin clave avisa, publica y no se cae', a.avisos.at(-1)?.includes('no está configurado') && b.mensajes.length === n + 1, a.avisos.at(-1));
    await pausa(600);
    a.emit('mensaje', { mensaje: 'chat normal sin clave' }); await hasta(() => b.mensajes.at(-1)?.mensaje === 'chat normal sin clave');
    ver('sin clave el chat funciona igual', b.mensajes.at(-1)?.mensaje === 'chat normal sin clave');
  }

  const ajeno = io(URL, { forceNew: true, transports: ['websocket'], reconnection: false, extraHeaders: { Cookie: c1, Origin: 'https://sitio-malo.example' } });
  const resultado = await new Promise(res => { ajeno.on('connect', () => res('conectó')); ajeno.on('connect_error', () => res('rechazado')); });
  ver('otro sitio es rechazado', resultado === 'rechazado', resultado);
  const propio = io(URL, { forceNew: true, transports: ['websocket'], reconnection: false, extraHeaders: { Origin: URL } });
  const r2 = await new Promise(res => { propio.on('connect', () => res('conectó')); propio.on('connect_error', e => res(e.message)); });
  ver('el mismo sitio entra', r2 === 'conectó', r2);
  propio.disconnect();

  console.log(fallas ? `FALLAS: ${fallas}` : 'TODO OK');
  process.exit(fallas ? 1 : 0);
})().catch(e => { console.error('ERROR', e); process.exit(2); });
