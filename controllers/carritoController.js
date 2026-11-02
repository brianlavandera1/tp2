import mongoose from 'mongoose';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';
import { conTransaccion } from '../utils/transaccion.js';

export const verCarrito = async (req, res) => {
  const carrito = req.session.carrito || [];
  // Suma a cada ítem los datos actuales del evento (foto, fecha, sala y stock), sin guardarlos en la sesión
  const eventos = await Evento.find({ _id: { $in: carrito.map(item => item.eventoId) } })
    .select('fecha hora entradasDisponibles sala entidad eliminado')
    .populate('sala', 'nombre').populate('entidad', 'fotoActualizada');
  const items = carrito.map(item => {
    const evento = eventos.find(ev => String(ev._id) === item.eventoId);
    const yaEnCarrito = carrito.filter(otro => otro.eventoId === item.eventoId).reduce((suma, otro) => suma + otro.cantidad, 0);
    return {
      ...item,
      fecha: evento?.fecha || null,
      hora: evento?.hora || null,
      sala: evento?.sala?.nombre || null,
      urlFoto: evento?.entidad?.urlFoto || null,
      // Entradas que todavía se pueden sumar a este evento
      restantes: evento && !evento.eliminado ? evento.entradasDisponibles - yaEnCarrito : 0
    };
  });
  const subtotal = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
  
  // Solución al bug de punto flotante de JavaScript redondeando a 2 decimales
  const desc = Number((subtotal * (req.session.usuario.porcentajeDescuento || 0)).toFixed(2));
  const total = Number((subtotal - desc).toFixed(2));

  res.render('Cliente/carrito', { 
    usuarioLogueado: req.session.usuario,
    carrito: items,
    subtotal,
    descuentoAplicado: desc, 
    porcentajeDescuento: (req.session.usuario.porcentajeDescuento || 0) * 100,
    total: total 
  });
};

export const agregarItem = async (req, res) => {
  try {
    const { eventoId, cantidad, tipoEntrada } = req.body;
    const evento = await Evento.findById(eventoId);
    if (!evento) return res.status(404).json({ success: false, message: 'Evento no encontrado' });

    const cantNum = parseInt(cantidad) || 1;
    if (cantNum <= 0) return res.status(400).json({ success: false, message: 'La cantidad ingresada debe ser al menos 1.' });

    if (!req.session.carrito) req.session.carrito = [];

    const cantidadYaEnCarrito = req.session.carrito
      .filter(item => item.eventoId === eventoId)
      .reduce((acc, item) => acc + item.cantidad, 0);

    const totalDeseado = cantidadYaEnCarrito + cantNum;

    if (totalDeseado > evento.entradasDisponibles) {
      const disponiblesRestantes = evento.entradasDisponibles - cantidadYaEnCarrito;
      return res.status(400).json({ success: false, message: `Stock insuficiente. Solo puedes agregar ${disponiblesRestantes} más.` });
    }

    const sectorElegido = ['General', 'Platea', 'VIP'].includes(tipoEntrada) ? tipoEntrada : 'General';
    const precioOficial = evento.precioDeZona(sectorElegido) ?? 5000;
    const index = req.session.carrito.findIndex(item => item.eventoId === eventoId && item.tipoEntrada === sectorElegido);
    
    if (index > -1) {
      req.session.carrito[index].cantidad += cantNum;
    } else {
      req.session.carrito.push({
        eventoId: evento._id.toString(), nombreEvento: evento.nombre,
        tipoEntrada: sectorElegido, precio: precioOficial, cantidad: cantNum
      });
    }

    const totalItems = req.session.carrito.reduce((acc, item) => acc + item.cantidad, 0);
    const isApi = req.accepts(['html', 'json']) === 'json' || req.xhr;
    if (isApi) return res.json({ success: true, totalItems });

    res.redirect('/cliente/comprar');
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error interno en el servidor.' });
  }
};

// Posición válida dentro del carrito, o -1 (un valor no numérico no debe terminar afectando al primer ítem)
const posicionEnCarrito = (req) => {
  const posicion = /^\d+$/.test(req.params.index) ? Number(req.params.index) : -1;
  return posicion < (req.session.carrito?.length || 0) ? posicion : -1;
};

export const quitarItem = (req, res) => {
  const posicion = posicionEnCarrito(req);
  if (posicion > -1) req.session.carrito.splice(posicion, 1);
  res.redirect('/cliente/carrito');
};

// POST /cliente/carrito/cantidad/:index — suma o resta una entrada, sin pasar el stock; en cero se quita
export const cambiarCantidad = async (req, res) => {
  const posicion = posicionEnCarrito(req);
  const paso = req.body.paso === '1' ? 1 : -1;
  if (posicion > -1) {
    const carrito = req.session.carrito;
    const item = carrito[posicion];
    if (paso === -1) {
      item.cantidad -= 1;
      if (item.cantidad <= 0) carrito.splice(posicion, 1);
    } else {
      const evento = await Evento.findById(item.eventoId).select('entradasDisponibles eliminado');
      const yaEnCarrito = carrito.filter(otro => otro.eventoId === item.eventoId).reduce((suma, otro) => suma + otro.cantidad, 0);
      if (evento && !evento.eliminado && yaEnCarrito < evento.entradasDisponibles) item.cantidad += 1;
    }
  }
  res.redirect('/cliente/carrito');
};

export const checkout = (req, res) => {
  const carrito = req.session.carrito || [];
  if (carrito.length === 0) return res.redirect('/cliente/carrito');

  const subtotal = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
  const desc = Number((subtotal * (req.session.usuario.porcentajeDescuento || 0)).toFixed(2));

  res.render('Cliente/checkout', { 
    usuarioLogueado: req.session.usuario, 
    subtotal, 
    descuentoAplicado: desc, 
    porcentajeDescuento: (req.session.usuario.porcentajeDescuento || 0) * 100,
    total: Number((subtotal - desc).toFixed(2)), 
    error: null, 
    datos: {}
  });
};

export const procesarPago = async (req, res) => {
  const carrito = req.session.carrito || [];
  if (!carrito.length) return res.redirect('/cliente/carrito');

  // Validación de la tarjeta en el servidor (la del navegador se puede saltear)
  const { titular = '', numeroTarjeta = '', vencimiento = '', cvv = '' } = req.body;
  let errorTarjeta = null;
  if (!/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/.test(titular.trim())) errorTarjeta = 'Por favor, ingresa un titular válido (solo letras).';
  else if (!/^\d{16}$/.test(numeroTarjeta.trim())) errorTarjeta = 'El número de tarjeta debe tener exactamente 16 dígitos.';
  else if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(vencimiento.trim())) errorTarjeta = 'La fecha de vencimiento debe tener el formato MM/AA.';
  else if (!/^\d{3}$/.test(cvv.trim())) errorTarjeta = 'El código CVV debe tener exactamente 3 dígitos.';

  const volverAlCheckout = (mensaje) => {
    const subtotal = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
    const desc = Number((subtotal * (req.session.usuario.porcentajeDescuento || 0)).toFixed(2));
    return res.status(400).render('Cliente/checkout', {
      usuarioLogueado: req.session.usuario,
      subtotal,
      descuentoAplicado: desc,
      porcentajeDescuento: (req.session.usuario.porcentajeDescuento || 0) * 100,
      total: Number((subtotal - desc).toFixed(2)),
      error: mensaje,
      datos: { medioPago: req.body.medioPago, titular, vencimiento }
    });
  };

  if (errorTarjeta) return volverAlCheckout(errorTarjeta);

  // El precio se guardó al agregar al carrito: se vuelve a consultar por si el evento cambió desde entonces
  const cambios = [];
  for (const item of carrito) {
    const evento = await Evento.findById(item.eventoId);
    if (!evento) {
      req.session.carrito = carrito.filter(i => i !== item);
      return res.redirect('/cliente/carrito');
    }
    const precioActual = evento.precioDeZona(item.tipoEntrada);
    if (precioActual !== item.precio) {
      cambios.push(`${item.nombreEvento} (${item.tipoEntrada}): $${item.precio} → $${precioActual}`);
      item.precio = precioActual;
    }
  }
  if (cambios.length) {
    return volverAlCheckout(`Algunos precios cambiaron desde que agregaste las entradas: ${cambios.join(', ')}. Revisá el nuevo total y confirmá el pago.`);
  }

  const subtotal = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
  const descuentoAplicado = Number((subtotal * (req.session.usuario.porcentajeDescuento || 0)).toFixed(2));
  // Solo se guardan los últimos 4 dígitos de la tarjeta
  const numTarjeta = req.body.numeroTarjeta ? req.body.numeroTarjeta.trim() : '';
  const ultimosDigitos = numTarjeta.length >= 4 ? numTarjeta.slice(-4) : '****';

  try {
    // Reserva de cupos + entradas + transacción: o se guarda todo, o nada
    const nuevaTransaccion = await conTransaccion(async ({ session, alDeshacer }) => {
      // Id generado de antemano para vincular cada entrada con su transacción
      const transaccionId = new mongoose.Types.ObjectId();

      for (const item of carrito) {
        await Evento.reservarZona(item.eventoId, item.tipoEntrada, item.cantidad, session);
        alDeshacer(() => Evento.liberarZona(item.eventoId, item.tipoEntrada, item.cantidad));

        const entrada = await new Entrada({
          cliente: req.session.usuario._id, evento: item.eventoId, transaccion: transaccionId, nombre: item.nombreEvento,
          precio: item.precio, cantidad: item.cantidad, sector: item.tipoEntrada
        }).save({ session });
        alDeshacer(() => Entrada.findByIdAndDelete(entrada._id));
      }

      return new Transaccion({
        _id: transaccionId,
        canal: 'Online',
        cliente: req.session.usuario._id,
        nombreCliente: req.session.usuario.nombreUsuario,
        items: carrito,
        subtotal,
        descuentoAplicado,
        total: Number((subtotal - descuentoAplicado).toFixed(2)),
        medioPago: req.body.medioPago || 'Tarjeta',
        tarjetaUltimosDigitos: ultimosDigitos,
        comprobanteId: 'REC-' + Date.now()
      }).save({ session });
    });

    req.session.carrito = [];
    res.render('Cliente/comprobante', { usuarioLogueado: req.session.usuario, transaccion: nuevaTransaccion });
  } catch (error) {
    volverAlCheckout(`No se pudo completar la compra: ${error.message}`);
  }
};