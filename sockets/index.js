import { Server } from 'socket.io';
import { registrarConectados } from './conectados.js';
import { registrarChat } from './chat.js';

// El chat usa la cookie de sesión: igual que en los formularios, se rechaza lo que venga de otro sitio
const mismoSitio = (req) => {
  const origen = req.headers.origin;
  if (!origen) return true;
  try {
    return new URL(origen).host === req.headers.host;
  } catch {
    return false;
  }
};

// La sesión se lee una sola vez, al conectarse: así no se consulta MongoDB en cada paquete.
// Express-session puede avisar un error después de responder (si la sesión se cerró justo en ese momento):
// ese segundo aviso se ignora, porque Socket.IO intentaría responder de nuevo y el servidor se caería.
const sesionAlConectarse = (sesion) => (req, res, next) => {
  if (req._query.sid !== undefined) return next();
  let avisado = false;
  sesion(req, res, (error) => {
    if (avisado) return;
    avisado = true;
    next(error);
  });
};

export function iniciarSockets(servidorHttp, sesion) {
  const io = new Server(servidorHttp, {
    maxHttpBufferSize: 4096, // alcanza de sobra para un mensaje de chat
    allowRequest: (req, responder) => responder(null, mismoSitio(req))
  });

  // Cada socket conoce la sesión de Express (quién inició sesión)
  io.engine.use(sesionAlConectarse(sesion));

  registrarConectados(io);
  registrarChat(io);
  return io;
}
