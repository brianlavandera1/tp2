import Actividad, { TIPOS_ACTIVIDAD } from '../models/Actividad.js';
import Usuario from '../models/Usuario.js';
import Evento from '../models/Evento.js';
import Sala from '../models/Sala.js';
import Entidad from '../models/Entidad.js';
import { idSesionSeguro } from '../middlewares/actividad.middleware.js';
import { paginar } from '../utils/paginar.js';
import { escapeRegex } from '../utils/escapeRegex.js';

// Límite de clics registrados por sesión y por minuto (evita que un script llene la base)
const LIMITE_CLICS_MINUTO = 120;
// Usuarios como máximo que puede abarcar una búsqueda en Actividad
const MAXIMO_COINCIDENCIAS = 30;
const clicsPorSesion = new Map();
setInterval(() => clicsPorSesion.clear(), 60 * 1000).unref();

const texto = (valor, max) => (typeof valor === 'string' ? valor.replace(/\s+/g, ' ').trim().slice(0, max) : '');

// POST /actividad/click — lo envía el navegador en cada clic en botones, enlaces y solapas
export const registrarClick = async (req, res) => {
  const usuario = req.session.usuario;
  const sesionId = idSesionSeguro(req);
  const cantidad = (clicsPorSesion.get(sesionId) || 0) + 1;
  clicsPorSesion.set(sesionId, cantidad);
  if (cantidad > LIMITE_CLICS_MINUTO) return res.sendStatus(429);

  const elemento = texto(req.body.elemento, 80);
  if (!elemento) return res.sendStatus(204);

  await Actividad.create({
    usuario: usuario._id,
    nombreUsuario: usuario.nombreUsuario,
    rol: usuario.rol,
    sesionId,
    tipo: 'click',
    accion: elemento,
    detalle: [texto(req.body.zona, 30), texto(req.body.destino, 120)].filter(Boolean).join(' → '),
    pagina: texto(req.body.pagina, 200),
    metodo: 'CLICK',
    exito: true,
    ip: req.ip,
    navegador: texto(req.get('user-agent'), 200)
  });
  res.sendStatus(204);
};

// Busca usuarios por usuario, nombre, apellido, DNI o email (incluye eliminados: su historial sigue disponible).
// Cada palabra tiene que aparecer en algún campo: "juan perez" encuentra a Juan Pérez.
// Una palabra de solo números se toma como el comienzo del DNI: "286" encuentra los DNI 286...
function buscarUsuarios(texto, limite) {
  const condiciones = texto.split(/\s+/).slice(0, 4).map(palabra => {
    const re = new RegExp(escapeRegex(palabra), 'i');
    return /^\d+$/.test(palabra)
      ? { $or: [{ dni: new RegExp(`^${palabra}`) }, { nombreUsuario: re }] }
      : { $or: [{ nombreUsuario: re }, { nombre: re }, { apellido: re }, { dni: re }, { email: re }] };
  });
  return Usuario.find({ eliminado: { $in: [true, false, null] }, $and: condiciones })
    .select('nombreUsuario nombre apellido dni email rol eliminado')
    .sort(/^\d+$/.test(texto) ? { dni: 1 } : { nombreUsuario: 1 }) // al buscar un DNI, ordenados por DNI
    .limit(limite).lean();
}

// GET /admin/actividad/usuarios?q=... — sugerencias mientras se escribe en el filtro Usuario (JSON)
export const sugerirUsuarios = async (req, res) => {
  const texto = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 80) : '';
  if (texto.length < 2) return res.json([]);
  const usuarios = await buscarUsuarios(texto, 8);
  res.json(usuarios.map(u => ({
    nombreUsuario: u.nombreUsuario,
    nombre: [u.nombre, u.apellido].filter(Boolean).join(' '),
    dni: u.dni || '',
    email: u.email || '',
    rol: u.rol,
    eliminado: !!u.eliminado
  })));
};

// GET /admin/actividad — solo Administrador y Supervisor
export const mostrarActividad = async (req, res) => {
  const { usuario, tipo, buscar, sesion } = req.query;
  // Solo se aceptan fechas AAAA-MM-DD (lo que envía el <input type="date">)
  const fechaValida = (valor) => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : '');
  const desde = fechaValida(req.query.desde);
  const hasta = fechaValida(req.query.hasta);

  // Filtro común para la tabla y los resúmenes
  const filtro = {};

  // BÚSQUEDA LIBRE DE USUARIO: por usuario, nombre, apellido, DNI o email.
  // Primero se buscan los usuarios que coinciden (colección chica) y después su actividad
  // con nombreUsuario $in [...], que usa el índice nombreUsuario + fecha.
  const textoUsuario = typeof usuario === 'string' ? usuario.trim().slice(0, 80) : '';
  let coincidencias = [];
  if (textoUsuario) {
    const encontrados = await buscarUsuarios(textoUsuario, MAXIMO_COINCIDENCIAS + 1);
    // Si el texto es exactamente un nombre de usuario (por ejemplo, al hacer clic en uno), se muestra solo ese
    const exacto = encontrados.find(u => u.nombreUsuario.toLowerCase() === textoUsuario.toLowerCase());
    coincidencias = exacto ? [exacto] : encontrados.slice(0, MAXIMO_COINCIDENCIAS);
    // El texto tal cual también cuenta: así aparecen los intentos de login con un usuario inexistente
    filtro.nombreUsuario = { $in: [...new Set([textoUsuario, ...coincidencias.map(u => u.nombreUsuario)])] };
    coincidencias.hayMas = !exacto && encontrados.length > MAXIMO_COINCIDENCIAS;
  }
  if (typeof sesion === 'string' && /^[a-f0-9]{12}$/.test(sesion)) filtro.sesionId = sesion;
  if (TIPOS_ACTIVIDAD.includes(tipo)) filtro.tipo = tipo;
  const textoBuscar = typeof buscar === 'string' ? buscar.trim().slice(0, 80) : '';
  if (textoBuscar) {
    const re = new RegExp(escapeRegex(textoBuscar), 'i');
    filtro.$or = [{ accion: re }, { detalle: re }, { pagina: re }];
  }

  // VENTANA DE TIEMPO: para no recorrer toda la colección (que crece con cada clic),
  // solo se consulta un período acotado y los datos más viejos se traen al buscarlos.
  //  - sin filtros: últimas 24 horas
  //  - con texto o tipo pero sin fechas: últimos 7 días
  //  - un usuario o una sesión puntual: todo su historial (va por índice, es rápido)
  //  - con fechas: el período pedido, hasta 92 días
  const DIA = 24 * 60 * 60 * 1000;
  const MAXIMO_DIAS = 92;
  let ventana;
  if (desde || hasta) {
    const fin = hasta ? new Date(`${hasta}T23:59:59.999`) : new Date();
    let inicio = desde ? new Date(`${desde}T00:00:00`) : new Date(fin.getTime() - 30 * DIA);
    if ((fin - inicio) > MAXIMO_DIAS * DIA) inicio = new Date(fin.getTime() - MAXIMO_DIAS * DIA);
    filtro.fecha = { $gte: inicio, $lte: fin };
    ventana = { tipo: 'periodo', inicio, fin, recortado: desde && new Date(`${desde}T00:00:00`) < inicio };
  } else if (filtro.nombreUsuario || filtro.sesionId) {
    ventana = { tipo: 'todo' };
  } else if (filtro.tipo || filtro.$or) {
    filtro.fecha = { $gte: new Date(Date.now() - 7 * DIA) };
    ventana = { tipo: 'semana' };
  } else {
    filtro.fecha = { $gte: new Date(Date.now() - DIA) };
    ventana = { tipo: 'dia' };
  }

  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);

  const [registros, hoy, masClickeados, porUsuario, sesiones] = await Promise.all([
    // Solo los campos que muestra la tabla, como objetos planos (lean)
    paginar(Actividad, filtro, req, { orden: { fecha: -1 }, porPagina: 25, campos: '-navegador -usuario -__v', liviano: true }),
    Actividad.aggregate([
      { $match: { fecha: { $gte: inicioHoy } } },
      { $group: { _id: null, registros: { $sum: 1 }, usuarios: { $addToSet: '$nombreUsuario' }, sesiones: { $addToSet: '$sesionId' }, clics: { $sum: { $cond: [{ $eq: ['$tipo', 'click'] }, 1, 0] } }, fallidos: { $sum: { $cond: ['$exito', 0, 1] } } } }
    ]),
    // Botones, enlaces y solapas más usados (cuántas veces se hizo clic en cada uno)
    Actividad.aggregate([
      { $match: { ...filtro, tipo: 'click' } },
      { $group: { _id: { elemento: '$accion', pagina: '$pagina' }, veces: { $sum: 1 }, usuarios: { $addToSet: '$nombreUsuario' } } },
      { $sort: { veces: -1 } }, { $limit: 12 }
    ]),
    // Actividad por usuario
    Actividad.aggregate([
      { $match: filtro },
      { $group: {
        _id: '$nombreUsuario', rol: { $last: '$rol' }, total: { $sum: 1 }, ultima: { $max: '$fecha' },
        clics: { $sum: { $cond: [{ $eq: ['$tipo', 'click'] }, 1, 0] } },
        acciones: { $sum: { $cond: [{ $eq: ['$tipo', 'accion'] }, 1, 0] } },
        paginas: { $sum: { $cond: [{ $eq: ['$tipo', 'navegacion'] }, 1, 0] } }
      } },
      { $sort: { ultima: -1 } }, { $limit: 12 }
    ]),
    // Sesiones recientes: qué hizo cada sesión, de principio a fin
    Actividad.aggregate([
      { $match: { ...filtro, sesionId: { $ne: null } } },
      { $group: { _id: '$sesionId', usuario: { $last: '$nombreUsuario' }, rol: { $last: '$rol' }, inicio: { $min: '$fecha' }, fin: { $max: '$fecha' }, eventos: { $sum: 1 }, ip: { $last: '$ip' } } },
      { $sort: { fin: -1 } }, { $limit: 10 }
    ])
  ]);

  // Histórico de lo eliminado (borrado lógico): nada se pierde
  const conEliminados = { eliminado: true };
  const [usuariosEliminados, eventosEliminados, salasEliminadas, artistasEliminados] = await Promise.all([
    Usuario.find(conEliminados).select('nombreUsuario rol eliminadoEn eliminadoPor').sort({ eliminadoEn: -1 }).limit(20),
    Evento.find(conEliminados).select('nombre eliminadoEn eliminadoPor').sort({ eliminadoEn: -1 }).limit(20),
    Sala.find(conEliminados).select('nombre eliminadoEn eliminadoPor').sort({ eliminadoEn: -1 }).limit(20),
    Entidad.find(conEliminados).select('nombre eliminadoEn eliminadoPor').sort({ eliminadoEn: -1 }).limit(20)
  ]);
  const eliminados = [
    ...usuariosEliminados.map(d => ({ tipo: 'Usuario', nombre: `${d.nombreUsuario} (${d.rol})`, en: d.eliminadoEn, por: d.eliminadoPor })),
    ...eventosEliminados.map(d => ({ tipo: 'Evento', nombre: d.nombre, en: d.eliminadoEn, por: d.eliminadoPor })),
    ...salasEliminadas.map(d => ({ tipo: 'Sala', nombre: d.nombre, en: d.eliminadoEn, por: d.eliminadoPor })),
    ...artistasEliminados.map(d => ({ tipo: 'Artista', nombre: d.nombre, en: d.eliminadoEn, por: d.eliminadoPor }))
  ].sort((a, b) => b.en - a.en);

  const resumenHoy = hoy[0] || { registros: 0, usuarios: [], sesiones: [], clics: 0, fallidos: 0 };

  res.render('Admin/actividad', {
    usuarioLogueado: req.session.usuario,
    registros: registros.docs,
    paginacion: registros.paginacion,
    resumenHoy: { ...resumenHoy, usuarios: resumenHoy.usuarios.length, sesiones: resumenHoy.sesiones.length },
    masClickeados, porUsuario, sesiones, eliminados,
    coincidencias,
    ventana,
    tipos: TIPOS_ACTIVIDAD,
    filtros: { usuario: textoUsuario, tipo: filtro.tipo || '', desde, hasta, buscar: textoBuscar, sesion: filtro.sesionId || '' }
  });
};
