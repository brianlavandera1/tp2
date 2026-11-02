import crypto from 'crypto';
import Actividad from '../models/Actividad.js';

/**
 * Registro de actividad: cada petición de un usuario queda guardada al terminar
 * (navegación, acciones que modifican datos, inicio y cierre de sesión).
 * Los clics en botones, enlaces y solapas los envía el navegador a POST /actividad/click.
 */

// Nombre legible de cada acción: [método, ruta, descripción]
const ACCIONES = [
  ['POST', /^\/auth\/login$/, 'Inicio de sesión'],
  ['GET', /^\/auth\/logout$/, 'Cierre de sesión'],
  ['POST', /^\/auth\/registro$/, 'Registro de cliente'],
  ['POST', /^\/auth\/token$/, 'Pedido de token de API (JWT)'],
  ['POST', /^\/cliente\/carrito\/agregar$/, 'Agregar al carrito'],
  ['POST', /^\/cliente\/carrito\/quitar\//, 'Quitar del carrito'],
  ['POST', /^\/cliente\/carrito\/cantidad\//, 'Cambiar cantidad en el carrito'],
  ['POST', /^\/cliente\/carrito\/procesar-pago$/, 'Compra'],
  ['POST', /^\/cliente\/cancelar-entrada\//, 'Cancelar entrada'],
  ['POST', /^\/cliente\/procesar-membresia$/, 'Cambio de membresía'],
  ['POST', /^\/cliente\/configuracion$/, 'Editar perfil'],
  ['POST', /^\/admin\/crear-personal$/, 'Crear usuario'],
  ['POST', /^\/admin\/usuarios\/editar\//, 'Editar usuario'],
  ['POST', /^\/admin\/usuarios\/eliminar\//, 'Eliminar usuario'],
  ['POST', /^\/admin\/boleteria\/cobrar$/, 'Venta en boletería'],
  ['POST', /^\/admin\/validar\//, 'Validar entrada en la puerta'],
  ['POST', /^\/admin\/entidades\/crear$/, 'Crear artista'],
  ['POST', /^\/admin\/entidades\/editar\//, 'Editar artista'],
  ['POST', /^\/admin\/entidades\/eliminar\//, 'Eliminar artista'],
  ['POST', /^\/admin\/eventos$/, 'Crear evento'],
  ['POST', /^\/admin\/eventos\/(editar|actualizar)\//, 'Editar evento'],
  ['POST', /^\/admin\/eventos\/eliminar\//, 'Eliminar evento'],
  ['POST', /^\/admin\/salas$/, 'Crear sala'],
  ['POST', /^\/admin\/salas\/(editar|actualizar)\//, 'Editar sala'],
  ['POST', /^\/admin\/salas\/eliminar\//, 'Eliminar sala'],
  ['GET', /^\/admin\/pagos\/excel$/, 'Descargar Excel de pagos'],
  ['GET', /^\/admin\/informe\/excel$/, 'Descargar Excel del informe'],
  ['POST', /^\/entradas$/, 'API: emitir entrada'],
  ['PUT', /^\/entradas\//, 'API: modificar entrada'],
  ['DELETE', /^\/entradas\//, 'API: cancelar entrada']
];

// Nombre legible de cada página (navegación)
const PAGINAS = [
  [/^\/cliente\/menu/, 'Inicio del cliente'], [/^\/cliente\/comprar/, 'Cartelera'], [/^\/cliente\/carrito\/checkout/, 'Pago'],
  [/^\/cliente\/carrito/, 'Carrito'], [/^\/cliente\/mis-compras/, 'Mis entradas'], [/^\/cliente\/membresia/, 'Membresía'],
  [/^\/cliente\/configuracion/, 'Mi perfil'], [/^\/admin\/dashboard/, 'Panel'], [/^\/admin\/boleteria/, 'Boletería'],
  [/^\/admin\/validar/, 'Validar entradas'], [/^\/admin\/eventos/, 'Eventos'], [/^\/admin\/salas/, 'Salas'],
  [/^\/admin\/entidades/, 'Artistas'], [/^\/admin\/informe/, 'Informes'], [/^\/admin\/pagos/, 'Pagos'],
  [/^\/admin\/cancelaciones/, 'Cancelaciones'], [/^\/admin\/usuarios\/editar/, 'Editar usuario'],
  [/^\/admin\/usuarios/, 'Usuarios'], [/^\/admin\/crear-personal/, 'Nuevo usuario'], [/^\/admin\/actividad/, 'Actividad'],
  [/^\/auth\/login/, 'Login'], [/^\/auth\/registro/, 'Registro'], [/^\/entradas/, 'API de entradas']
];

// Datos del formulario que se pueden guardar (nunca contraseñas, tarjetas ni CVV)
const CAMPOS_SEGUROS = ['identificador', 'eventoId', 'cantidad', 'tipoEntrada', 'tipoCliente', 'medioPago', 'rol', 'nombre', 'nombreUsuario', 'sector'];
const OMITIR = [/^\/media\//, /^\/favicon/, /^\/actividad\//, /^\/css\//, /^\/js\//];

// Identificador de sesión para agrupar la actividad, derivado del real (no sirve para robar la sesión)
export const idSesionSeguro = (req) => req.sessionID ? crypto.createHash('sha256').update(req.sessionID).digest('hex').slice(0, 12) : null;

const nombrePagina = (ruta) => (PAGINAS.find(([re]) => re.test(ruta)) || [null, ruta])[1];

const detalleSeguro = (req, ruta) => {
  const partes = [];
  const id = ruta.match(/\/([a-f0-9]{24}|TICK-[0-9A-F]{10})$/i);
  if (id) partes.push(`id: ${id[1]}`);
  for (const campo of CAMPOS_SEGUROS) {
    const valor = req.body?.[campo];
    if (typeof valor === 'string' && valor.trim()) partes.push(`${campo}: ${valor.trim().slice(0, 40)}`);
  }
  if (req.file) partes.push(`archivo: ${req.file.originalname?.slice(0, 40)}`);
  return partes.join(' · ').slice(0, 300);
};

export const registrarActividad = (req, res, next) => {
  // La ruta completa se guarda ahora: dentro de cada router Express le quita el prefijo a req.path
  const ruta = req.path;
  if (['HEAD', 'OPTIONS'].includes(req.method) || OMITIR.some(re => re.test(ruta))) return next();
  const usuarioAlEntrar = req.session?.usuario || null; // para el logout (al terminar, la sesión ya no existe)
  const sesionAlEntrar = idSesionSeguro(req);

  res.on('finish', () => {
    const usuario = req.session?.usuario || req.usuarioToken || usuarioAlEntrar;
    const accionConocida = ACCIONES.find(([metodo, re]) => metodo === req.method && re.test(ruta));
    const esLogin = ruta === '/auth/login' || ruta === '/auth/token';

    // Se registra: todo lo de usuarios logueados, y los intentos de login (también los fallidos)
    if (!usuario && !(esLogin && req.method === 'POST')) return;
    // De la navegación solo interesan las páginas que se ven (no redirecciones ni recursos)
    if (req.method === 'GET' && !accionConocida && (res.statusCode !== 200 || !(res.get('content-type') || '').includes('text/html'))) return;

    const exito = res.statusCode < 400;
    let tipo = req.method === 'GET' && !accionConocida ? 'navegacion' : 'accion';
    let accion = accionConocida ? accionConocida[2] : (tipo === 'navegacion' ? `Abrió ${nombrePagina(ruta)}` : `${req.method} ${ruta}`);
    if (esLogin || ruta === '/auth/logout') tipo = 'sesion';
    if (esLogin && !exito) accion = res.statusCode === 429 ? 'Login bloqueado por demasiados intentos' : 'Intento de login fallido';

    Actividad.create({
      usuario: usuario?._id || null,
      nombreUsuario: usuario?.nombreUsuario || String(req.body?.identificador || 'anónimo').slice(0, 60),
      rol: usuario?.rol || null,
      sesionId: idSesionSeguro(req) || sesionAlEntrar,
      tipo, accion,
      detalle: tipo === 'navegacion' ? (req.originalUrl.split('?')[1] || '').slice(0, 300) : detalleSeguro(req, ruta),
      pagina: ruta.slice(0, 200),
      metodo: req.method,
      estado: res.statusCode,
      exito,
      ip: req.ip,
      navegador: (req.get('user-agent') || '').slice(0, 200)
    }).catch(error => console.error('⚠️ No se pudo registrar la actividad:', error.message));
  });

  next();
};
