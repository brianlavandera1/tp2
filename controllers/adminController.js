import Usuario from '../models/Usuario.js';
import CancelacionLog from '../models/CancelacionLog.js';
import Transaccion from '../models/Transaccion.js';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { conTransaccion } from '../utils/transaccion.js';
import { generarQR, urlValidacion } from '../utils/qr.js';
import { paginar } from '../utils/paginar.js';
import bcrypt from 'bcrypt';
import { escapeRegex } from '../utils/escapeRegex.js';
import { ZONAS } from '../models/Sala.js';

// Panel principal: indicadores del día calculados desde la base
export const mostrarDashboard = async (req, res) => {
  const inicioHoy = new Date();
  inicioHoy.setHours(0, 0, 0, 0);
  const ahora = new Date();

  const [ventasHoy] = await Transaccion.aggregate([
    { $match: { fechaCompra: { $gte: inicioHoy } } },
    { $unwind: '$items' },
    { $group: {
      _id: null,
      entradas: { $sum: { $subtract: ['$items.cantidad', { $ifNull: ['$items.cantidadCancelada', 0] }] } },
      recaudado: { $sum: { $multiply: [
        { $subtract: ['$items.cantidad', { $ifNull: ['$items.cantidadCancelada', 0] }] }, '$items.precio',
        { $cond: [{ $gt: ['$subtotal', 0] }, { $divide: ['$total', '$subtotal'] }, 1] }
      ] } }
    } }
  ]);

  const [eventosActivos, proximoEvento, cancelacionesHoy, totalClientes] = await Promise.all([
    Evento.countDocuments({ fecha: { $gte: ahora } }),
    Evento.findOne({ fecha: { $gte: ahora } }).sort({ fecha: 1 }).populate('sala'),
    CancelacionLog.countDocuments({ fechaCancelacion: { $gte: inicioHoy } }),
    Usuario.countDocuments({ rol: 'Cliente' })
  ]);

  res.render('Admin/dashboard', {
    usuarioLogueado: req.session.usuario,
    indicadores: {
      entradasHoy: ventasHoy ? ventasHoy.entradas : 0,
      recaudadoHoy: ventasHoy ? Math.round(ventasHoy.recaudado) : 0,
      eventosActivos,
      cancelacionesHoy,
      totalClientes
    },
    proximoEvento
  });
};

export const mostrarFormularioCrearPersonal =(req, res) => res.render('Admin/crear-personal', { usuarioLogueado: req.session.usuario, error: null, datos: {} });

export const registrarPersonalInterno = async (req, res) => {
  try {
    const { password } = req.body;
    if (!password || !password.trim()) throw new Error('La contraseña es obligatoria.');
    // Se guarda encriptada, igual que en el registro de clientes (si no, el login con bcrypt falla)
    await Usuario.create({ ...req.body, password: await bcrypt.hash(password.trim(), 10) });
    res.redirect('/admin/usuarios?exito=Usuario creado');
  } catch (error) {
    let mensajeError = 'Error al crear usuario. Verifica los datos.';
    if (error.code === 11000) {
      const campo = Object.keys(error.keyValue)[0];
      mensajeError = `El ${campo} ingresado ya está registrado en el sistema.`;
    } else if (error.message) {
      mensajeError = error.message;
    }
    // Devolvemos los datos previos para que el formulario no se borre
    const { password, ...datosSinPassword } = req.body;
    res.status(400).render('Admin/crear-personal', {
      error: mensajeError,
      usuarioLogueado: req.session.usuario,
      datos: datosSinPassword
    });
  }
};

export const listarUsuarios = async (req, res) => {
  const { docs: usuarios, paginacion } = await paginar(Usuario, {}, req, { orden: { createdAt: -1 } });
  res.render('Admin/usuarios', { usuarioLogueado: req.session.usuario, usuarios, paginacion, exito: req.query.exito });
};

export const mostrarFormularioEditarUsuario = async (req, res) => {
  const usuarioAEditar = await Usuario.findById(req.params.id);
  res.render('Admin/editarUsuario', { usuarioLogueado: req.session.usuario, usuarioAEditar });
};

export const actualizarUsuario = async (req, res) => {
  try {
    // La contraseña nunca se guarda tal cual: si viene vacía se ignora, si no se encripta
    const { password, ...cambios } = req.body;
    if (password && password.trim()) cambios.password = await bcrypt.hash(password.trim(), 10);
    await Usuario.findByIdAndUpdate(req.params.id, cambios, { runValidators: true });
    res.redirect('/admin/usuarios?exito=Usuario actualizado');
  } catch (error) {
    let mensajeError = 'Error al actualizar usuario.';
    if (error.code === 11000) {
      const campo = Object.keys(error.keyValue)[0];
      mensajeError = `El ${campo} ingresado ya está registrado por otro usuario.`;
    } else if (error.message) {
      mensajeError = error.message;
    }
    const usuarioAEditar = await Usuario.findById(req.params.id) || { _id: req.params.id, ...req.body };
    res.status(400).render('Admin/editarUsuario', { usuarioLogueado: req.session.usuario, usuarioAEditar, error: mensajeError });
  }
};

export const eliminarUsuario = async (req, res) => {
  await Usuario.findByIdAndDelete(req.params.id);
  res.redirect('/admin/usuarios?exito=Eliminado');
};

export const listarAuditoriaPagos = async (req, res) => {
  try {
    const { busqueda, filtro } = req.query;
    let query = {};

    if (filtro === 'hoy') {
      const inicioHoy = new Date();
      inicioHoy.setHours(0, 0, 0, 0);
      const finHoy = new Date();
      finHoy.setHours(23, 59, 59, 999);
      
      query.fechaCompra = { $gte: inicioHoy,$lte: finHoy };
    }

    if (busqueda && busqueda.trim()) {
      const termino = busqueda.trim();
      const regex = new RegExp(escapeRegex(termino), 'i');
      const esObjectId = /^[a-fA-F0-9]{24}$/.test(termino);

      const usuariosCoincidentes = await Usuario.find({
        $or: [{ email: regex }, { nombreUsuario: regex }, { dni: regex }, { nombre: regex }, { apellido: regex }]
      }).select('_id');
      
      const usuariosIds = usuariosCoincidentes.map(u => u._id);

      const condiciones = [
        { comprobanteId: regex }, { nombreCliente: regex }, { medioPago: regex },
        { 'items.nombreEvento': regex }, { 'items.tipoEntrada': regex }, { cliente: { $in: usuariosIds } }
      ];

      if (esObjectId) {
        condiciones.push({ _id: termino }, { cliente: termino }, { 'items.eventoId': termino });
      }

      if (query.fechaCompra) {
        query = { $and: [ { fechaCompra: query.fechaCompra }, {$or: condiciones } ] };
      } else {
        query = { $or: condiciones };
      }
    }

    const { docs: compras, paginacion } = await paginar(Transaccion, query, req, { orden: { fechaCompra: -1 }, populate: 'cliente' });

    res.render('Admin/auditoriaPagos', {
      usuarioLogueado: req.session.usuario,
      compras,
      paginacion,
      busqueda: busqueda || '',
      filtroActual: filtro || ''
    });
  } catch (error) {
    console.error('Error al listar las transacciones:', error);
    res.status(500).send('Error interno al obtener el historial de pagos');
  }
};

export const listarCancelaciones = async (req, res) => {
  try {
    const { busqueda } = req.query;
    let query = {};

    if (busqueda && busqueda.trim()) {
      const termino = busqueda.trim();
      const regex = new RegExp(escapeRegex(termino), 'i');
      const esObjectId = /^[a-fA-F0-9]{24}$/.test(termino);

      const condiciones = [{ nombreCliente: regex }, { eventoNombre: regex }, { codigoBoleto: regex }];
      if (esObjectId) condiciones.push({ _id: termino }, { cliente: termino }, { evento: termino });
      query = { $or: condiciones };
    }

    const { docs: cancelaciones, paginacion } = await paginar(CancelacionLog, query, req, { orden: { fechaCancelacion: -1 } });

    res.render('Admin/cancelaciones', { usuarioLogueado: req.session.usuario, cancelaciones, paginacion, busqueda: busqueda || '' });
  } catch (error) {
    console.error('Error al listar cancelaciones:', error);
    res.status(500).send('Error interno al obtener el historial de cancelaciones');
  }
};

export const mostrarBoleteria = async (req, res) => {
  try {
    const rolActual = req.session.usuario && req.session.usuario.rol;
    if (rolActual !== 'Administrador' && rolActual !== 'Supervisor') {
      return res.status(403).send('Acceso denegado.');
    }
    
    const eventos = await Evento.find(); 
    res.render('Admin/boleteria', { usuarioLogueado: req.session.usuario, eventos });
  } catch (error) {
    res.status(500).send('Error interno del servidor.');
  }
};

export const procesarVentaFisica = async (req, res) => {
  try {
    const rolActual = req.session.usuario && req.session.usuario.rol;
    if (rolActual !== 'Administrador' && rolActual !== 'Supervisor') {
      throw new Error('Acceso denegado.');
    }

    const cajeroActivo = req.session.usuario.nombreUsuario;
    const { dniCliente, nombreCliente, eventoId, medioPago, precioUnitario } = req.body;
    const cantidad = parseInt(req.body.cantidad, 10);
    const tipoEntrada = (req.body.tipoEntrada || '').trim();

    if (!ZONAS.includes(tipoEntrada)) throw new Error(`El sector debe ser uno de: ${ZONAS.join(', ')}.`);
    if (!Number.isInteger(cantidad) || cantidad < 1) throw new Error('La cantidad debe ser al menos 1.');
    if (isNaN(parseFloat(precioUnitario)) || parseFloat(precioUnitario) < 0) throw new Error('El precio unitario no es válido.');

    let cliente = await Usuario.findOne({ dni: dniCliente });
    if (!cliente) {
      // Cuenta interna sin acceso: la contraseña aleatoria se guarda encriptada
      const passwordSegura = await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10);
      cliente = await Usuario.create({
        nombreUsuario: `cliente_${dniCliente}`,
        nombre: nombreCliente.split(' ')[0],
        apellido: 'Sucursal',
        dni: dniCliente,
        rol: 'Cliente',
        email: `cajero_${cajeroActivo}_${dniCliente}@sucursal.com`,
        password: passwordSegura,
        telefono: '0000000000',
        fechaNacimiento: new Date('1990-01-01')
      });
    }

    const subtotal = parseFloat(precioUnitario) * cantidad;
    // El pago en efectivo tiene 25% de descuento
    const descuentoAplicado = medioPago === 'Efectivo' ? subtotal * 0.25 : 0;
    const total = subtotal - descuentoAplicado;

    // Reserva del cupo + entrada + venta en una sola transacción (misma lógica que la compra online)
    const { nuevaVenta, entradaCreada } = await conTransaccion(async ({ session, alDeshacer }) => {
      const evento = await Evento.reservarZona(eventoId, tipoEntrada, cantidad, session);
      alDeshacer(() => Evento.liberarZona(eventoId, tipoEntrada, cantidad));
      const transaccionId = new mongoose.Types.ObjectId();

      const entrada = await new Entrada({
        cliente: cliente._id, evento: evento._id, transaccion: transaccionId, nombre: evento.nombre,
        precio: parseFloat(precioUnitario), cantidad, sector: tipoEntrada
      }).save({ session });
      alDeshacer(() => Entrada.findByIdAndDelete(entrada._id));

      const venta = await new Transaccion({
        _id: transaccionId,
        comprobanteId: `SUC-${Date.now()}`,
        cliente: cliente._id,
        nombreCliente: `${cliente.nombre} ${cliente.apellido} (Cajero: ${cajeroActivo})`,
        medioPago,
        subtotal,
        descuentoAplicado,
        total,
        canal: 'Sucursal',
        items: [{ eventoId: evento._id, nombreEvento: evento.nombre, tipoEntrada, cantidad, precio: parseFloat(precioUnitario) }]
      }).save({ session });

      return { nuevaVenta: venta, entradaCreada: entrada };
    });

    const qr = await generarQR(urlValidacion(req, entradaCreada.codigoBoleto));
    res.render('Admin/imprimirTicket', { venta: nuevaVenta, cajero: cajeroActivo, entrada: entradaCreada, qr });
  } catch (error) {
    try {
      const eventos = await Evento.find();
      res.status(400).render('Admin/boleteria', { 
        usuarioLogueado: req.session.usuario, 
        eventos, 
        error: error.message,
        datosPrevios: req.body 
      });
    } catch (fetchError) {
      res.status(500).send('Ocurrió un error grave al intentar cargar la boletería.');
    }
  }
};