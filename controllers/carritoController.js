import mongoose from 'mongoose';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';

export const verCarrito = (req, res) => {
  const carrito = req.session.carrito || [];
  const subtotal = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
  
  // Solución al bug de punto flotante de JavaScript redondeando a 2 decimales
  const desc = Number((subtotal * (req.session.usuario.porcentajeDescuento || 0)).toFixed(2));
  const total = Number((subtotal - desc).toFixed(2));

  res.render('Cliente/carrito', { 
    usuarioLogueado: req.session.usuario, 
    carrito, 
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

export const quitarItem = (req, res) => {
  if (req.session.carrito) req.session.carrito.splice(req.params.index, 1);
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

  const entradasCreadas = [];
  const reservasRealizadas = [];

  try {
    const subtotal = carrito.reduce((a, b) => a + (b.precio * b.cantidad), 0);
    const descuentoAplicado = Number((subtotal * (req.session.usuario.porcentajeDescuento || 0)).toFixed(2));
    // Id generado de antemano para vincular cada entrada con su transacción
    const transaccionId = new mongoose.Types.ObjectId();

    for (const item of carrito) {
      // 1. Reservamos la zona
      await Evento.reservarZona(item.eventoId, item.tipoEntrada, item.cantidad);
      reservasRealizadas.push({ eventoId: item.eventoId, zona: item.tipoEntrada, cantidad: item.cantidad });

      // 2. Creamos la entrada
      const nuevaEntrada = await Entrada.create({
        cliente: req.session.usuario._id, evento: item.eventoId, transaccion: transaccionId, nombre: item.nombreEvento,
        precio: item.precio, cantidad: item.cantidad, sector: item.tipoEntrada
      });
      entradasCreadas.push(nuevaEntrada._id);
    }

    // Extraemos los últimos 4 dígitos de la tarjeta para guardarlos correctamente
    const numTarjeta = req.body.numeroTarjeta ? req.body.numeroTarjeta.trim() : '';
    const ultimosDigitos = numTarjeta.length >= 4 ? numTarjeta.slice(-4) : '****';

    const nuevaTransaccion = await Transaccion.create({
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
    });

    req.session.carrito = [];
    res.render('Cliente/comprobante', { usuarioLogueado: req.session.usuario, transaccion: nuevaTransaccion });
  } catch (error) {
    // 🔄 ROLLBACK MANUAL: Si algo falla, borramos lo que creamos
    for (const entradaId of entradasCreadas) await Entrada.findByIdAndDelete(entradaId);
    for (const resv of reservasRealizadas) await Evento.liberarZona(resv.eventoId, resv.zona, resv.cantidad);
    
    res.status(400).send('No se pudo completar la transacción: ' + error.message);
  }
};