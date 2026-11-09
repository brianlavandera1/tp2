// El sitio tiene varias páginas: al navegar, el navegador corta el socket y abre otro.
// Se espera un momento antes de dar de baja al usuario para que el número no salte en cada clic.
const ESPERA_AL_DESCONECTAR_MS = 4000;
const SALA_PERSONAL = 'personal';
const ID_VALIDO = /^[\w-]{8,64}$/;

// Conteo en tiempo real de usuarios conectados. Se cuenta a todos, pero el número solo lo recibe el personal.
// Se cuenta por navegador (no por pestaña): alguien con tres pestañas abiertas es un solo usuario.
export function registrarConectados(io) {
  const usuarios = new Map(); // id del navegador → { sockets, espera }

  const avisarAlPersonal = () => io.to(SALA_PERSONAL).emit('usuarios-conectados', usuarios.size);

  io.on('connection', (socket) => {
    const usuarioSesion = socket.request.session?.usuario;
    const esPersonal = Boolean(usuarioSesion) && usuarioSesion.rol !== 'Cliente';
    if (esPersonal) socket.join(SALA_PERSONAL);

    const enviado = socket.handshake.auth?.visitante;
    const id = typeof enviado === 'string' && ID_VALIDO.test(enviado) ? enviado : socket.id;

    const existente = usuarios.get(id);
    if (existente) {
      clearTimeout(existente.espera);
      existente.sockets += 1;
      if (esPersonal) socket.emit('usuarios-conectados', usuarios.size); // solo cambió de página: el total es el mismo
    } else {
      usuarios.set(id, { sockets: 1, espera: null });
      avisarAlPersonal();
    }

    socket.on('disconnect', () => {
      const usuario = usuarios.get(id);
      usuario.sockets -= 1;
      if (usuario.sockets > 0) return;
      usuario.espera = setTimeout(() => {
        usuarios.delete(id);
        avisarAlPersonal();
      }, ESPERA_AL_DESCONECTAR_MS);
    });
  });
}
