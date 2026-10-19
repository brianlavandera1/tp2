import Usuario from '../models/Usuario.js';
import Entrada from '../models/Entrada.js';
import Evento from '../models/Evento.js';
import Transaccion from '../models/Transaccion.js';
import CancelacionLog from '../models/CancelacionLog.js';
import Entidad from '../models/Entidad.js';
import bcrypt from 'bcrypt';

export const mostrarMenu = async (req, res) => {
  const usuarioCompleto = await Usuario.findById(req.session.usuario._id);
  res.render('Cliente/menu', { usuarioLogueado: req.session.usuario, usuarioCompleto, mensajeExito: req.query.exito });
};

export const mostrarMembresia = async (req, res) => {
  res.render('Cliente/membresia', { 
    usuarioLogueado: req.session.usuario, 
    usuarioCompleto: await Usuario.findById(req.session.usuario._id), 
    error: null,
    datos: {} 
  });
};

export const procesarMembresia = async (req, res) => {
  const { tipoCliente, titular, numeroTarjeta, vencimiento, cvv } = req.body;
  
  if (['PREMIUM', 'VIP'].includes(tipoCliente)) {
    if (!titular || !/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(titular.trim())) {
      return res.status(400).render('Cliente/membresia', {
        usuarioLogueado: req.session.usuario,
        usuarioCompleto: await Usuario.findById(req.session.usuario._id),
        error: 'Por favor, ingresa un titular válido (solo letras).',
        datos: req.body
      });
    }
    if (!numeroTarjeta || !/^\d{16}$/.test(numeroTarjeta.trim())) {
      return res.status(400).render('Cliente/membresia', {
        usuarioLogueado: req.session.usuario,
        usuarioCompleto: await Usuario.findById(req.session.usuario._id),
        error: 'El número de tarjeta debe tener exactamente 16 dígitos.',
        datos: req.body
      });
    }
    if (!vencimiento || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(vencimiento.trim())) {
      return res.status(400).render('Cliente/membresia', {
        usuarioLogueado: req.session.usuario,
        usuarioCompleto: await Usuario.findById(req.session.usuario._id),
        error: 'La fecha de vencimiento debe tener el formato MM/AA.',
        datos: req.body
      });
    }
    if (!cvv || !/^\d{3}$/.test(cvv.trim())) {
      return res.status(400).render('Cliente/membresia', {
        usuarioLogueado: req.session.usuario,
        usuarioCompleto: await Usuario.findById(req.session.usuario._id),
        error: 'El código CVV debe tener exactamente 3 dígitos.',
        datos: req.body
      });
    }
  }

  let porcentaje = tipoCliente === 'VIP' ? 0.30 : tipoCliente === 'PREMIUM' ? 0.15 : 0;
  const usuarioActualizado = await Usuario.findByIdAndUpdate(
    req.session.usuario._id, 
    { tipoCliente: tipoCliente || 'ESTANDAR', porcentajeDescuento: porcentaje }, 
    { new: true }
  );

  req.session.usuario.tipoCliente = usuarioActualizado.tipoCliente;
  req.session.usuario.porcentajeDescuento = usuarioActualizado.porcentajeDescuento;
  res.redirect('/cliente/menu?exito=Membresía actualizada');
};

export const mostrarMisCompras = async (req, res) => {
  const misEntradasCompradas = await Entrada.find({ cliente: req.session.usuario._id }).populate({ path: 'evento', populate: ['sala', 'entidad'] });
  const misCompras = await Transaccion.find({ cliente: req.session.usuario._id }).sort({ fechaCompra: -1 });
  
  res.render('Cliente/mis-compras', { usuarioLogueado: req.session.usuario, misEntradasCompradas, misCompras });
};

export const cancelarEntrada = async (req, res) => {
  const entradaCancelada = await Entrada.cancelarEntradaZona(req.params.id, req.session.usuario._id);
  await CancelacionLog.create({
    cliente: entradaCancelada.cliente, nombreCliente: req.session.usuario.nombreUsuario,
    eventoNombre: entradaCancelada.nombre, codigoBoleto: entradaCancelada.codigoBoleto, cantidad: entradaCancelada.cantidad
  });
  res.json({ success: true, message: 'Entrada cancelada correctamente.' });
};

// 🎟️ Cartelera con búsqueda inteligente por texto (incluyendo entidades/artistas) y filtro por fecha
export const mostrarComprar = async (req, res) => {
  try {
    const { buscar, fecha } = req.query;
    let query = {};

    if (buscar) {
      // Buscamos entidades coincidentes con el texto ingresado
      const entidadesCoincidentes = await Entidad.find({
        nombre: { $regex: buscar, $options: 'i' }
      });
      const entidadesIds = entidadesCoincidentes.map(e => e._id);

      query.$or = [
        { nombre: { $regex: buscar, $options: 'i' } },
        { descripcion: { $regex: buscar, $options: 'i' } },
        { entidad: { $in: entidadesIds } }
      ];
    }

    if (fecha) {
      const inicio = new Date(`${fecha}T03:00:00.000Z`);
      const fin = new Date(new Date(`${fecha}T03:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - 1);
      
      query.fecha = { $gte: inicio, $lte: fin };
    }

    const eventosDisponibles = await Evento.find(query).populate('sala entidad');

    res.render('Cliente/comprar', { 
      usuarioLogueado: req.session.usuario, 
      eventos: eventosDisponibles, 
      totalItemsCarrito: req.session.carrito?.length || 0, 
      busqueda: buscar || '',
      filtroFecha: fecha || ''
    });
  } catch (error) {
    console.error('Error al mostrar cartelera:', error);
    res.status(500).send('Error interno del servidor');
  }
};

// ⚙️ Configuración de Perfil
export const mostrarConfiguracion = async (req, res) => {
  const usuario = await Usuario.findById(req.session.usuario._id);
  res.render('Cliente/configuracion', { 
    usuarioLogueado: req.session.usuario, 
    usuarioCompleto: usuario, 
    usuario, 
    mensajeExito: req.query.exito,
    error: null 
  });
};

export const actualizarConfiguracion = async (req, res) => {
  try {
    const { nombre, apellido, email, telefono, nuevaPassword } = req.body;
    const regexLetras = /^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/;
    const regexTelefono = /^\d{10,15}$/;
    const usuarioId = req.session.usuario._id;

    const usuarioActual = await Usuario.findById(usuarioId);

    if (!nombre || !regexLetras.test(nombre.trim()) || !apellido || !regexLetras.test(apellido.trim())) {
      return res.status(400).render('Cliente/configuracion', { 
        usuarioLogueado: req.session.usuario, 
        usuarioCompleto: usuarioActual, 
        usuario: { ...usuarioActual.toObject(), ...req.body }, 
        error: 'El nombre y el apellido solo deben contener letras.' 
      });
    }

    if (!telefono || !regexTelefono.test(telefono.trim())) {
      return res.status(400).render('Cliente/configuracion', { 
        usuarioLogueado: req.session.usuario, 
        usuarioCompleto: usuarioActual, 
        usuario: { ...usuarioActual.toObject(), ...req.body }, 
        error: 'El teléfono debe contener entre 10 y 15 números.' 
      });
    }

    const datosActualizar = { 
      nombre: nombre.trim(), 
      apellido: apellido.trim(), 
      email: email.trim(), 
      telefono: telefono.trim() 
    };

    if (nuevaPassword && nuevaPassword.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      datosActualizar.password = await bcrypt.hash(nuevaPassword.trim(), salt);
    }

    await Usuario.findByIdAndUpdate(usuarioId, datosActualizar);
    
    req.session.usuario.nombreUsuario = req.body.nombreUsuario || req.session.usuario.nombreUsuario;

    res.redirect('/cliente/configuracion?exito=Perfil actualizado correctamente.');
  } catch (error) {
    const usuarioActual = await Usuario.findById(req.session.usuario._id);
    res.status(400).render('Cliente/configuracion', { 
      usuarioLogueado: req.session.usuario, 
      usuarioCompleto: usuarioActual, 
      usuario: usuarioActual, 
      error: 'Ocurrió un error al actualizar los datos.' 
    });
  }
};