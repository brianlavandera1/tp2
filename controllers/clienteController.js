import mongoose from 'mongoose';
import Usuario from '../models/Usuario.js';
import Entrada from '../models/Entrada.js';
import Evento from '../models/Evento.js';
import Transaccion from '../models/Transaccion.js';
import Entidad from '../models/Entidad.js';
import bcrypt from 'bcrypt';
import { escapeRegex } from '../utils/escapeRegex.js';
import { generarQR, urlValidacion } from '../utils/qr.js';

// Cuántos días un evento lleva la etiqueta "Nuevo" en la portada del cliente
const PORCENTAJE_SE_AGOTA = 50;
const DIAS_NUEVO = 14;

export const mostrarMenu = async (req, res) => {
  const ahora = new Date();
  const [usuarioCompleto, entradasVigentes, eventosFuturos] = await Promise.all([
    Usuario.findById(req.session.usuario._id),
    // Para la franja "tu próxima salida": las entradas sin usar del cliente
    Entrada.find({ cliente: req.session.usuario._id, estado: 'Completado' }).select('evento').populate('evento', 'nombre fecha hora eliminado').lean(),
    // Los eventos que todavía no pasaron y tienen entradas, del más cercano al más lejano
    Evento.find({ fecha: { $gte: ahora }, entradasDisponibles: { $gt: 0 } })
      .sort({ fecha: 1 })
      .populate('sala', 'nombre').populate('entidad', 'nombre fotoActualizada fotoCredito')
  ]);

  const descuento = usuarioCompleto?.porcentajeDescuento || 0;
  const eventos = eventosFuturos.map(evento => {
    const precios = [evento.precio, evento.precioPlatea, evento.precioVIP].filter(p => p > 0);
    const desde = precios.length ? Math.min(...precios) : 0;
    const vendidas = Object.values(evento.vendidosPorZona || {}).reduce((suma, n) => suma + (Number(n) || 0), 0);
    return {
      evento,
      desde,
      desdeConDescuento: Math.round(desde * (1 - descuento)),
      esNuevo: evento.createdAt && (ahora - evento.createdAt) < DIAS_NUEVO * 24 * 60 * 60 * 1000,
      diasFaltan: Math.ceil((evento.fecha - ahora) / (24 * 60 * 60 * 1000)),
      ocupacion: Math.round(vendidas / (vendidas + evento.entradasDisponibles) * 100)
    };
  });

  // Portada: los últimos agregados. Se agotan: los que ya vendieron más de la mitad. Lo que viene: los más cercanos del resto
  const destacados = [...eventos].sort((a, b) => b.evento.createdAt - a.evento.createdAt).slice(0, 6);
  const seAgotan = eventos.filter(d => d.ocupacion >= PORCENTAJE_SE_AGOTA).sort((a, b) => b.ocupacion - a.ocupacion).slice(0, 3);
  const loQueViene = eventos.filter(d => !seAgotan.includes(d)).slice(0, 4);

  // El evento con entradas más cercano en el tiempo, cuántos días faltan y cuántas entradas tiene
  const futuras = entradasVigentes.filter(entrada => entrada.evento && !entrada.evento.eliminado && new Date(entrada.evento.fecha) >= ahora);
  const proximo = futuras.map(entrada => entrada.evento).sort((a, b) => new Date(a.fecha) - new Date(b.fecha))[0];
  const proximaSalida = proximo ? {
    evento: proximo,
    dias: Math.ceil((new Date(proximo.fecha) - ahora) / (24 * 60 * 60 * 1000)),
    entradas: futuras.filter(entrada => String(entrada.evento._id) === String(proximo._id)).length
  } : null;

  res.render('Cliente/menu', { usuarioLogueado: req.session.usuario, usuarioCompleto, destacados, seAgotan, loQueViene, proximaSalida, mensajeExito: req.query.exito });
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

// Entradas vigentes del cliente (sin las canceladas), con su evento, sala y artista.
// filtroExtra permite pedir solo las de un evento (para la descarga)
const entradasDelCliente = (req, filtroExtra = {}) =>
  Entrada.find({ cliente: req.session.usuario._id, estado: { $ne: 'Cancelada' }, ...filtroExtra })
    .sort({ _id: 1 })
    .populate({ path: 'evento', populate: ['sala', 'entidad'] });

// Un QR por entrada con la URL de validación (se muestra en la puerta del evento)
async function qrsDe(req, entradas) {
  const qrs = {};
  await Promise.all(entradas.map(async (entrada) => {
    qrs[entrada._id] = await generarQR(urlValidacion(req, entrada.codigoBoleto));
  }));
  return qrs;
}

export const mostrarMisCompras = async (req, res) => {
  const [misEntradasCompradas, misCompras] = await Promise.all([
    entradasDelCliente(req),
    Transaccion.find({ cliente: req.session.usuario._id }).sort({ fechaCompra: -1 })
  ]);
  const qrs = await qrsDe(req, misEntradasCompradas);

  // Una tarjeta por evento, como en la cartelera: si compró 3 entradas para el mismo show,
  // se ven juntas y se pasan de a una (las funciones más próximas primero)
  const grupos = new Map();
  for (const entrada of misEntradasCompradas) {
    if (entrada.evento?.eliminado) continue; // evento sacado de la cartelera: queda solo en el historial
    const clave = String(entrada.evento?._id || entrada.nombre);
    if (!grupos.has(clave)) grupos.set(clave, { evento: entrada.evento, entradas: [], personas: 0 });
    const grupo = grupos.get(clave);
    grupo.entradas.push(entrada);
    grupo.personas += entrada.cantidad || 1;
  }
  const eventosConEntradas = [...grupos.values()].sort((a, b) => new Date(a.evento?.fecha || 0) - new Date(b.evento?.fecha || 0));

  res.render('Cliente/mis-compras', { usuarioLogueado: req.session.usuario, eventosConEntradas, misCompras, qrs });
};

// GET /cliente/mis-entradas/:eventoId/descargar — todas las entradas de un evento, una debajo de la otra,
// listas para imprimir o guardar como PDF
export const descargarEntradas = async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.eventoId)) return res.redirect('/cliente/mis-compras');
  const entradas = await entradasDelCliente(req, { evento: req.params.eventoId });
  if (!entradas.length) return res.redirect('/cliente/mis-compras');
  const qrs = await qrsDe(req, entradas);
  res.render('Cliente/descargar-entradas', { usuarioLogueado: req.session.usuario, evento: entradas[0].evento, entradas, qrs });
};

export const cancelarEntrada = async (req, res) => {
  // La cancelación y su registro de auditoría se guardan juntos, dentro de la misma transacción
  await Entrada.cancelarEntradaZona(req.params.id, req.session.usuario._id, req.session.usuario.nombreUsuario);
  res.json({ success: true, message: 'Entrada cancelada correctamente.' });
};

// 🎟️ Cartelera con búsqueda inteligente por texto (incluyendo entidades/artistas) y filtro por fecha
export const mostrarComprar = async (req, res) => {
  try {
    const { buscar, fecha } = req.query;
    let query = {};

    if (buscar) {
      const patron = escapeRegex(buscar);
      // Buscamos entidades coincidentes con el texto ingresado
      const entidadesCoincidentes = await Entidad.find({
        nombre: { $regex: patron, $options: 'i' }
      });
      const entidadesIds = entidadesCoincidentes.map(e => e._id);

      query.$or = [
        { nombre: { $regex: patron, $options: 'i' } },
        { descripcion: { $regex: patron, $options: 'i' } },
        { entidad: { $in: entidadesIds } }
      ];
    }

    if (fecha) {
      const inicio = new Date(`${fecha}T03:00:00.000Z`);
      const fin = new Date(new Date(`${fecha}T03:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000 - 1);
      
      query.fecha = { $gte: inicio, $lte: fin };
    }

    // Las funciones más próximas primero
    const eventosDisponibles = await Evento.find(query).sort({ fecha: 1 }).populate('sala entidad');

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

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).render('Cliente/configuracion', {
        usuarioLogueado: req.session.usuario,
        usuarioCompleto: usuarioActual,
        usuario: { ...usuarioActual.toObject(), ...req.body },
        error: 'Por favor, ingresa un correo electrónico válido.'
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

    await Usuario.findByIdAndUpdate(usuarioId, datosActualizar, { runValidators: true });

    res.redirect('/cliente/configuracion?exito=Perfil actualizado correctamente.');
  } catch (error) {
    const usuarioActual = await Usuario.findById(req.session.usuario._id);
    res.status(400).render('Cliente/configuracion', {
      usuarioLogueado: req.session.usuario,
      usuarioCompleto: usuarioActual,
      usuario: usuarioActual,
      error: error.code === 11000 ? 'Ese correo electrónico ya está registrado por otro usuario.' : 'Ocurrió un error al actualizar los datos.'
    });
  }
};