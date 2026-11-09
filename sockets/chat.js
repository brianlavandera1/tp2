import { consultarIA, iaDisponible } from '../utils/gemini.js';

const SALA = 'chat';
const LARGO_MAXIMO = 500;
const LARGO_MAXIMO_RESPUESTA = 1500;
const HISTORIAL_MAXIMO = 50;
const ESPERA_ENTRE_MENSAJES_MS = 500;
const ESPERA_ENTRE_CONSULTAS_MS = 4000; // cuida el cupo gratuito de la clave de Gemini
const UNA_HORA_MS = 60 * 60 * 1000;
const CONSULTAS_POR_VISITA_POR_HORA = 10;
const CONSULTAS_DE_VISITAS_POR_HORA = 100;
const CONSULTA_IA = /^@gemini\b[\s,:;.-]*/i; // también vale "@Gemini, ..." o "@gemini: ..."

const leerTexto = (datos) => (typeof datos?.mensaje === 'string' ? datos.mensaje.trim() : '');

// Detrás del proxy de Render, la dirección real del visitante es la última que agrega el proxy
const direccionDe = (socket) => {
  const reenviada = socket.handshake.headers['x-forwarded-for'];
  return reenviada ? reenviada.split(',').pop().trim() : socket.handshake.address;
};

// Nunca lanza un error: si Gemini falla, la respuesta es un aviso para el usuario
const obtenerRespuesta = async (pregunta) => {
  try {
    return (await consultarIA(pregunta)).slice(0, LARGO_MAXIMO_RESPUESTA) || 'No tengo una respuesta para eso.';
  } catch (error) {
    console.error('❌ Error al consultar a Gemini:', error.message);
    return 'No pude responder en este momento. Probá de nuevo en un rato.';
  }
};

// Chat con "@gemini". Los clientes comparten una sala en tiempo real; las visitas hablan en privado
// con el asistente y con un límite de consultas. El personal de la empresa no participa.
export function registrarChat(io) {
  const historial = [];
  const ultimosEnvios = new Map(); // id de usuario → { mensaje, consulta }
  let consultasEnCurso = 0;
  let cupoVisitas = { inicio: Date.now(), total: 0, visitantes: new Map() };

  const publicar = (datos) => {
    const mensaje = { ...datos, fecha: Date.now() };
    historial.push(mensaje);
    if (historial.length > HISTORIAL_MAXIMO) historial.shift();
    io.to(SALA).emit('mensaje', mensaje);
  };

  const avisarPensando = () => io.to(SALA).emit('gemini-pensando', consultasEnCurso > 0);

  const responderEnSala = async (pregunta) => {
    consultasEnCurso += 1;
    avisarPensando();
    const respuesta = await obtenerRespuesta(pregunta);
    consultasEnCurso -= 1;
    publicar({ usuario: 'Gemini', esIA: true, mensaje: respuesta });
    avisarPensando();
  };

  const atenderCliente = (socket, usuario) => {
    socket.join(SALA);
    socket.emit('historial', historial);

    // El segundo dato indica si el mensaje se rechazó, para devolverle el texto al campo
    const avisar = (texto, rechazado = true) => socket.emit('aviso', texto, rechazado);

    socket.on('mensaje', (datos) => {
      const texto = leerTexto(datos);
      if (!texto) return;
      if (texto.length > LARGO_MAXIMO) return avisar(`El mensaje no puede superar los ${LARGO_MAXIMO} caracteres.`);

      const ahora = Date.now();
      const envios = ultimosEnvios.get(usuario._id) || { mensaje: 0, consulta: 0 };
      ultimosEnvios.set(usuario._id, envios);
      if (ahora - envios.mensaje < ESPERA_ENTRE_MENSAJES_MS) return avisar('Estás enviando mensajes muy rápido.');

      const esConsulta = CONSULTA_IA.test(texto);
      const pregunta = esConsulta ? texto.replace(CONSULTA_IA, '').trim() : '';
      if (esConsulta) {
        if (!pregunta) return avisar('Escribí tu pregunta después de @gemini.');
        if (ahora - envios.consulta < ESPERA_ENTRE_CONSULTAS_MS) return avisar('Esperá unos segundos antes de hacerle otra consulta a Gemini.');
        envios.consulta = ahora;
      }

      envios.mensaje = ahora;
      // El autor sale de la sesión del servidor: nadie puede escribir con el nombre de otro
      publicar({ usuario: usuario.nombreUsuario, esIA: false, mensaje: texto });
      if (esConsulta && iaDisponible) responderEnSala(pregunta);
      else if (esConsulta) avisar('El asistente Gemini no está configurado en este servidor.', false);
    });
  };

  // Todo lo que pasa acá se envía solo a este socket: una visita no lee ni le escribe a nadie más
  const atenderVisita = (socket) => {
    const direccion = direccionDe(socket);
    const avisar = (texto) => socket.emit('aviso', texto, true);
    const invitarARegistrarse = (texto) => socket.emit('invitar-registro', texto);
    const enviarPrivado = (datos) => socket.emit('mensaje', { ...datos, fecha: Date.now() });

    socket.on('mensaje', async (datos) => {
      const texto = leerTexto(datos);
      if (!texto) return;
      if (texto.length > LARGO_MAXIMO) return avisar(`El mensaje no puede superar los ${LARGO_MAXIMO} caracteres.`);
      const pregunta = texto.replace(CONSULTA_IA, '').trim();
      if (!pregunta) return avisar('Escribí tu pregunta.');
      if (!iaDisponible) return avisar('El asistente no está disponible en este momento.');

      const ahora = Date.now();
      if (ahora - cupoVisitas.inicio >= UNA_HORA_MS) cupoVisitas = { inicio: ahora, total: 0, visitantes: new Map() };
      const visitante = cupoVisitas.visitantes.get(direccion) || { consultas: 0, ultima: 0 };
      cupoVisitas.visitantes.set(direccion, visitante);

      if (ahora - visitante.ultima < ESPERA_ENTRE_CONSULTAS_MS) return avisar('Esperá unos segundos antes de hacer otra consulta.');
      if (visitante.consultas >= CONSULTAS_POR_VISITA_POR_HORA) return invitarARegistrarse('Llegaste al límite de consultas sin cuenta.');
      if (cupoVisitas.total >= CONSULTAS_DE_VISITAS_POR_HORA) return invitarARegistrarse('El asistente está muy solicitado en este momento.');

      visitante.consultas += 1;
      visitante.ultima = ahora;
      cupoVisitas.total += 1;

      enviarPrivado({ usuario: 'Vos', esIA: false, mensaje: texto });
      socket.emit('gemini-pensando', true);
      const respuesta = await obtenerRespuesta(pregunta);
      enviarPrivado({ usuario: 'Gemini', esIA: true, mensaje: respuesta });
      socket.emit('gemini-pensando', false);
    });
  };

  io.on('connection', (socket) => {
    const usuario = socket.request.session?.usuario;
    if (!usuario) atenderVisita(socket);
    else if (usuario.rol === 'Cliente') atenderCliente(socket, usuario);
  });
}
