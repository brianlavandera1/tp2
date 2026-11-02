import mongoose from 'mongoose';
import crypto from 'crypto';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';
import CancelacionLog from '../models/CancelacionLog.js';

/**
 * Historial de ventas de DEMOSTRACIÓN, chico a propósito: dos compras por evento en los últimos días,
 * para que el informe, el panel y la auditoría tengan algo que mostrar.
 * Todo queda consistente: se descuenta el cupo por sector, cada entrada apunta a su transacción
 * y cada cancelación deja su registro de auditoría. Sin azar: cada `npm run seed` da lo mismo.
 */

const SECTORES = ['General', 'Platea', 'VIP'];
const MEDIOS_ONLINE = ['Tarjeta de Crédito', 'Tarjeta de Débito', 'Mercado Pago'];
const MEDIOS_SUCURSAL = ['Efectivo', 'Tarjeta POS', 'Transferencia Alias'];
const DIA_MS = 24 * 60 * 60 * 1000;
const COMPRAS_POR_EVENTO = 2;
const DIAS_DE_HISTORIAL = 8; // hoy y la semana anterior: alcanza para el gráfico del panel

export async function generarVentasDemo({ clientes, cancelar = [], casiAgotados = [] }) {
  const ahora = Date.now();
  const eventos = await Evento.find().sort({ createdAt: 1 }).populate('sala');
  const transacciones = [], entradas = [], cancelaciones = [];
  let comprobante = 0;

  for (const [i, evento] of eventos.entries()) {
    const vendidos = { General: 0, Platea: 0, VIP: 0 };
    let entradasVendidas = 0;

    for (let k = 0; k < COMPRAS_POR_EVENTO; k++) {
      const casiAgotado = casiAgotados.includes(evento.nombre);
      const sector = casiAgotado ? 'General' : SECTORES[(i + k) % SECTORES.length];
      const cantidad = casiAgotado ? 6 : 1 + (i + k) % 3;
      const cliente = clientes[(i * COMPRAS_POR_EVENTO + k) % clientes.length];
      const enSucursal = k === 1 && i % 2 === 0;
      const medioPago = (enSucursal ? MEDIOS_SUCURSAL : MEDIOS_ONLINE)[i % 3];
      const cancelada = k === 1 && cancelar.includes(evento.nombre);

      // Distintos días de la última semana; las compras con (i + k * 4) múltiplo de 8 son de hoy
      const fechaCompra = new Date(ahora - ((i + k * 4) % DIAS_DE_HISTORIAL) * DIA_MS - (k + 1) * 60 * 1000);
      const precio = evento.precioDeZona(sector);
      const subtotal = precio * cantidad;
      const tasa = enSucursal ? (medioPago === 'Efectivo' ? 0.25 : 0) : (cliente.porcentajeDescuento || 0);
      const descuentoAplicado = Number((subtotal * tasa).toFixed(2));

      const transaccionId = new mongoose.Types.ObjectId();
      transacciones.push({
        _id: transaccionId,
        cliente: cliente._id,
        nombreCliente: enSucursal ? `${cliente.nombre} ${cliente.apellido} (Cajero: supervisor)` : cliente.nombreUsuario,
        items: [{ eventoId: evento._id, nombreEvento: evento.nombre, tipoEntrada: sector, cantidad, cantidadCancelada: cancelada ? cantidad : 0, precio }],
        subtotal, descuentoAplicado,
        total: Number((subtotal - descuentoAplicado).toFixed(2)),
        medioPago,
        tarjetaUltimosDigitos: enSucursal ? undefined : String(1000 + i * 37 + k),
        canal: enSucursal ? 'Sucursal' : 'Online',
        comprobanteId: `${enSucursal ? 'SUC' : 'REC'}-DEMO-${String(++comprobante).padStart(5, '0')}`,
        fechaCompra
      });

      const codigoBoleto = 'TICK-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      const base = {
        cliente: cliente._id, evento: evento._id, transaccion: transaccionId, nombre: evento.nombre,
        precio, cantidad, sector, codigoBoleto, usadaEn: null, validadaPor: null,
        fila: 'Fila Única', asiento: 'General', createdAt: fechaCompra
      };

      if (cancelada) {
        // La entrada se canceló después: no ocupa cupo, queda en estado 'Cancelada' (nada se borra)
        // y deja su registro de auditoría
        const fechaCancelacion = new Date(fechaCompra.getTime() + 60 * 60 * 1000);
        cancelaciones.push({
          cliente: cliente._id, evento: evento._id, nombreCliente: cliente.nombreUsuario,
          eventoNombre: evento.nombre, codigoBoleto, cantidad, fechaCancelacion,
          createdAt: fechaCompra, updatedAt: fechaCompra
        });
        entradas.push({ ...base, estado: 'Cancelada', canceladaEn: fechaCancelacion, canceladaPor: cliente.nombreUsuario, updatedAt: fechaCancelacion });
        continue;
      }

      vendidos[sector] += cantidad;
      entradasVendidas += cantidad;
      entradas.push({ ...base, estado: 'Completado', updatedAt: fechaCompra });
    }

    // Cupo actualizado del evento (lo vendido sale del stock y queda registrado por sector)
    await Evento.updateOne({ _id: evento._id }, {
      $set: { vendidosPorZona: vendidos },
      $inc: { entradasDisponibles: -entradasVendidas }
    });
  }

  // Inserción en bloque: se validan con el esquema y se respetan las fechas históricas
  await Transaccion.insertMany(transacciones);
  await Entrada.insertMany(entradas, { timestamps: false });
  await CancelacionLog.insertMany(cancelaciones, { timestamps: false });

  return { transacciones: transacciones.length, entradas: entradas.length, cancelaciones: cancelaciones.length };
}
