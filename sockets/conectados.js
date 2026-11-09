import { Server } from 'socket.io';

// El sitio tiene varias páginas: al navegar, el navegador corta el socket y abre otro.
// Se espera un momento antes de dar de baja al usuario para que el número no salte en cada clic.
const ESPERA_AL_DESCONECTAR_MS = 4000;
const ID_VALIDO = /^[\w-]{8,64}$/;

// Conteo en tiempo real de usuarios conectados.
// Se cuenta por navegador (no por pestaña): alguien con tres pestañas abiertas es un solo usuario.
export function iniciarConectados(servidorHttp) {
  // El cliente solo escucha: no hace falta aceptar mensajes grandes
  const io = new Server(servidorHttp, { maxHttpBufferSize: 4096 });
  const usuarios = new Map(); // id del navegador → { sockets, espera }

  const avisarATodos = () => io.emit('usuarios-conectados', usuarios.size);

  io.on('connection', (socket) => {
    const enviado = socket.handshake.auth?.visitante;
    const id = typeof enviado === 'string' && ID_VALIDO.test(enviado) ? enviado : socket.id;

    const existente = usuarios.get(id);
    if (existente) {
      clearTimeout(existente.espera);
      existente.sockets += 1;
      socket.emit('usuarios-conectados', usuarios.size); // solo cambió de página: el total es el mismo
    } else {
      usuarios.set(id, { sockets: 1, espera: null });
      avisarATodos();
    }

    socket.on('disconnect', () => {
      const usuario = usuarios.get(id);
      usuario.sockets -= 1;
      if (usuario.sockets > 0) return;
      usuario.espera = setTimeout(() => {
        usuarios.delete(id);
        avisarATodos();
      }, ESPERA_AL_DESCONECTAR_MS);
    });
  });

  return io;
}
