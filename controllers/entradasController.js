import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';
import Evento from '../models/Evento.js';

// ---------- Validación de entradas en la puerta (QR) ----------
const normalizarCodigo = (codigo) => String(codigo || '').trim().toUpperCase();

// GET /admin/validar y /admin/validar/:codigo — busca la entrada y muestra si puede ingresar
export const mostrarValidacion = async (req, res) => {
  // El formulario manual envía ?codigo=...: se redirige a la URL "linda", igual a la del QR
  if (req.query.codigo) return res.redirect(`/admin/validar/${encodeURIComponent(normalizarCodigo(req.query.codigo))}`);

  const codigo = normalizarCodigo(req.params.codigo);
  const entrada = codigo
    ? await Entrada.findOne({ codigoBoleto: codigo }).populate({ path: 'evento', populate: 'sala' }).populate('cliente', 'nombre apellido dni')
    : null;

  res.status(codigo && !entrada ? 404 : 200).render('Admin/validar', {
    usuarioLogueado: req.session.usuario,
    codigo,
    entrada,
    validada: req.query.validada === '1',
    error: req.query.error || null
  });
};

// POST /admin/validar/:codigo — marca la entrada como usada (una sola vez)
export const validarEntrada = async (req, res) => {
  const codigo = normalizarCodigo(req.params.codigo);
  // Operación atómica: solo cambia si todavía no se usó, así dos escaneos simultáneos no la validan dos veces
  // (solo pasan las entradas vigentes: ni usadas ni canceladas)
  const entrada = await Entrada.findOneAndUpdate(
    { codigoBoleto: codigo, estado: 'Completado' },
    { estado: 'Usado', usadaEn: new Date(), validadaPor: req.session.usuario.nombreUsuario },
    { new: true }
  );
  if (!entrada) {
    const existente = await Entrada.findOne({ codigoBoleto: codigo }).select('estado');
    const mensaje = !existente ? 'No existe una entrada con ese código.'
      : existente.estado === 'Cancelada' ? 'Esta entrada fue cancelada y no es válida.' : 'Esta entrada ya fue usada.';
    return res.redirect(`/admin/validar/${encodeURIComponent(codigo)}?error=${encodeURIComponent(mensaje)}`);
  }
  res.redirect(`/admin/validar/${encodeURIComponent(codigo)}?validada=1`);
};

export const mostrarGestionEntradas = async (req, res) => {
  try {
    const { fechaInicio, fechaFin } = req.query;
    
    let matchFiltro = {};
    if (fechaInicio) matchFiltro.fechaCompra = { $gte: new Date(fechaInicio + 'T00:00:00') };
    if (fechaFin) matchFiltro.fechaCompra = { ...matchFiltro.fechaCompra, $lte: new Date(fechaFin + 'T23:59:59.999') };

    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    // Entradas vendidas netas (sin las canceladas) y lo efectivamente cobrado:
    // se aplica a cada ítem el mismo descuento que tuvo la compra (total / subtotal)
    const vendidasNetas = { $subtract: ["$items.cantidad", { $ifNull: ["$items.cantidadCancelada", 0] }] };
    const recaudadoNeto = { $multiply: [
      vendidasNetas, "$items.precio",
      { $cond: [{ $gt: ["$subtotal", 0] }, { $divide: ["$total", "$subtotal"] }, 1] }
    ] };

    const statsHoy = await Transaccion.aggregate([
      { $match: { fechaCompra: { $gte: inicioHoy } } },
      { $unwind: "$items" },
      { $group: { _id: null, totalTx: { $addToSet: "$_id" }, vendidas: { $sum: vendidasNetas }, recaudado: { $sum: recaudadoNeto } } }
    ]);

    // Usamos el filtro de fechas (si existe) para la agregación histórica
    const etapasAgregacion = [];
    if (Object.keys(matchFiltro).length > 0) {
      etapasAgregacion.push({ $match: matchFiltro });
    }
    etapasAgregacion.push(
      { $unwind: "$items" },
      { $group: { _id: "$items.eventoId", vendidas: { $sum: vendidasNetas }, recaudado: { $sum: recaudadoNeto } } }
    );

    const statsFiltro = await Transaccion.aggregate(etapasAgregacion);
    const totalTransaccionesFiltro = await Transaccion.countDocuments(matchFiltro);

    // Desglose del período por canal (online / boletería) y por sector
    const desglosar = (campo) => Transaccion.aggregate([
      { $match: matchFiltro },
      { $unwind: '$items' },
      { $group: { _id: campo, operaciones: { $addToSet: '$_id' }, vendidas: { $sum: vendidasNetas }, recaudado: { $sum: recaudadoNeto } } },
      { $project: { operaciones: { $size: '$operaciones' }, vendidas: 1, recaudado: { $round: ['$recaudado', 0] } } },
      { $sort: { recaudado: -1 } }
    ]);
    const [porCanal, porSector] = await Promise.all([desglosar({ $ifNull: ['$canal', 'Online'] }), desglosar('$items.tipoEntrada')]);

    // Recaudación por día: del período filtrado o, si no hay filtro, de los últimos 30 días
    const zonaHoraria = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const hastaDia = fechaFin ? new Date(fechaFin + 'T00:00:00') : new Date(inicioHoy);
    const desdeDia = fechaInicio ? new Date(fechaInicio + 'T00:00:00') : new Date(hastaDia.getTime() - 29 * 24 * 60 * 60 * 1000);
    const porDiaBD = await Transaccion.aggregate([
      { $match: { fechaCompra: { $gte: desdeDia, $lte: new Date(hastaDia.getTime() + 24 * 60 * 60 * 1000 - 1) } } },
      { $unwind: '$items' },
      { $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$fechaCompra', timezone: zonaHoraria } },
        vendidas: { $sum: vendidasNetas }, recaudado: { $sum: recaudadoNeto }
      } }
    ]);
    // Se completan los días sin ventas con 0 para que el gráfico sea continuo (máximo 92 días)
    const ventasPorDia = [];
    for (let d = new Date(desdeDia), n = 0; d <= hastaDia && n < 92; d.setDate(d.getDate() + 1), n++) {
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dia = porDiaBD.find(x => x._id === clave);
      ventasPorDia.push({ fecha: new Date(d), vendidas: dia ? dia.vendidas : 0, recaudado: dia ? Math.round(dia.recaudado) : 0 });
    }

    const eventosBD = await Evento.find().populate('sala').lean();
    let totalV = 0, totalR = 0;

    const eventos = eventosBD.map(ev => {
      const stats = statsFiltro.find(s => s._id.toString() === ev._id.toString()) || { vendidas: 0, recaudado: 0 };
      totalV += stats.vendidas; totalR += stats.recaudado;
      // entradasDisponibles ya es lo que queda: el cupo total es lo que queda + todo lo vendido (sin canceladas)
      const disponibles = Number(ev.entradasDisponibles || 0);
      const vendidasTotales = Object.values(ev.vendidosPorZona || {}).reduce((suma, n) => suma + (Number(n) || 0), 0);
      const cupo = disponibles + vendidasTotales;
      return {
        id: ev._id, nombre: ev.nombre, sala: ev.sala?.nombre || 'Sin sala',
        cupo, vendidas: stats.vendidas, disponibles,
        recaudado: Math.round(stats.recaudado), porcentaje: cupo > 0 ? Math.round((vendidasTotales / cupo) * 100) : 0
      };
    });

    res.render('Admin/entradas', {
      usuarioLogueado: req.session.usuario,
      resumenHoy: statsHoy[0] ? { totalTransacciones: statsHoy[0].totalTx.length, totalVendidas: statsHoy[0].vendidas, totalRecaudado: statsHoy[0].recaudado } : { totalTransacciones: 0, totalVendidas: 0, totalRecaudado: 0 },
      resumen: { totalTransacciones: totalTransaccionesFiltro, totalVendidas: totalV, totalRecaudado: totalR },
      eventos,
      porCanal,
      porSector,
      ventasPorDia,
      filtrosApli: { fechaInicio, fechaFin }
    });
  } catch (error) { 
    res.status(500).render('Admin/dashboard', { usuarioLogueado: req.session.usuario, error: 'Error al consultar transacciones: ' + error.message });
  }
};

// Del cliente solo se exponen datos públicos (nunca la contraseña encriptada)
const CAMPOS_PUBLICOS_CLIENTE = 'nombreUsuario nombre apellido email';

export const getEntradas = async (req, res) => res.json(
  await Entrada.find(req.usuario.rol === 'Cliente' ? { cliente: req.usuario._id } : {})
    .populate('evento', 'nombre fecha hora sala')
    .populate('cliente', CAMPOS_PUBLICOS_CLIENTE)
);
// Un cliente solo puede ver sus propias entradas
export const getEntradaById = async (req, res) => {
  const filtro = { _id: req.params.id };
  if (req.usuario.rol === 'Cliente') filtro.cliente = req.usuario._id;
  const entrada = await Entrada.findOne(filtro);
  if (!entrada) return res.status(404).json({ error: 'Entrada no encontrada.' });
  res.json(entrada);
};

// Alta manual (solo Administrador): descuenta stock y toma el precio del evento, no del body
export const createEntrada = async (req, res) => {
  const { cliente, evento: eventoId, sector = 'General' } = req.body;
  const cantidad = parseInt(req.body.cantidad, 10) || 1;
  if (!cliente || !eventoId) return res.status(400).json({ error: 'Faltan cliente o evento.' });

  const evento = await Evento.reservarZona(eventoId, sector, cantidad);
  try {
    const entrada = await Entrada.create({
      cliente, evento: evento._id, nombre: evento.nombre,
      precio: evento.precioDeZona(sector), cantidad, sector
    });
    res.status(201).json(entrada);
  } catch (error) {
    await Evento.liberarZona(eventoId, sector, cantidad);
    throw error;
  }
};

// Solo se permiten cambiar datos que no afectan stock ni precio
export const updateEntrada = async (req, res) => {
  const cambios = {};
  for (const campo of ['fila', 'asiento', 'estado']) {
    if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
  }
  const entrada = await Entrada.findByIdAndUpdate(req.params.id, cambios, { new: true, runValidators: true });
  if (!entrada) return res.status(404).json({ error: 'Entrada no encontrada.' });
  res.json(entrada);
};

// DELETE no borra: cancela la entrada (queda en el histórico), devuelve el cupo y deja el registro de auditoría
export const deleteEntrada = async (req, res) => {
  const entrada = await Entrada.cancelarEntradaZona(req.params.id, null, req.usuario.nombreUsuario);
  res.json(entrada);
};