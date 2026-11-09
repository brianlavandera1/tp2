const { io } = require('socket.io-client');
const URL = 'http://127.0.0.1:3998';
const pausa = ms => new Promise(r => setTimeout(r, ms));
const login = async () => {
  const r = await fetch(URL + '/auth/login', { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ identificador: 'cliente1', password: '123' }) });
  return r.headers.get('set-cookie').split(';')[0];
};
(async () => {
  const H = c => ({ Cookie: c, 'Content-Type': 'application/x-www-form-urlencoded' });
  for (let i = 0; i < 25; i++) {
    const c = await login();
    const s = io(URL, { forceNew: true, transports: ['polling'], extraHeaders: { Cookie: c }, reconnection: false });
    await new Promise(res => s.on('connect', res));
    const h2 = io(URL, { forceNew: true, transports: ['polling'], extraHeaders: { Cookie: c }, reconnection: false });
    await Promise.allSettled([
      fetch(URL + '/actividad/click', { method: 'POST', headers: H(c), body: 'elemento=Salir&zona=menu&pagina=/x' }),
      fetch(URL + '/cliente/menu', { headers: { Cookie: c } }),
      fetch(URL + '/auth/logout', { headers: { Cookie: c }, redirect: 'manual' }),
      fetch(URL + '/actividad/click', { method: 'POST', headers: H(c), body: 'elemento=Salir&zona=menu&pagina=/x' })
    ]);
    await pausa(60); s.disconnect(); h2.disconnect();
  }
  await pausa(500);
  const r = await fetch(URL + '/cliente/menu');
  console.log('servidor vivo tras 25 cierres de sesión en carrera:', r.status);
})().catch(e => { console.log('SERVIDOR CAIDO', e.message); process.exit(1); });
