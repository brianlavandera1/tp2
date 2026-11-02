import mongoose from 'mongoose';
import crypto from 'crypto';
import { ZONAS } from './Sala.js';
import { conTransaccion } from '../utils/transaccion.js';
import './CancelacionLog.js';

const entradaSchema = new mongoose.Schema({
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  evento: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento', required: true },
  // Compra (online o boletería) que originó la entrada
  transaccion: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaccion' },
  nombre: { type: String, required: true },
  descripcion: String,
  precio: { type: Number, required: true, min: 0 },
  cantidad: { type: Number, required: true, min: 1 },
  fila: { type: String, default: 'Fila Única' },
  asiento: { type: String, default: 'General' },
  sector: { type: String, enum: ZONAS, default: 'General' },
  // 10 caracteres hexadecimales aleatorios + índice único para evitar códigos repetidos
  codigoBoleto: { type: String, unique: true, default: () => 'TICK-' + crypto.randomBytes(5).toString('hex').toUpperCase() },
  // 'Usado' = ya validada en la puerta con el QR · 'Cancelada' = cancelada (no se borra: queda en el histórico)
  estado: { type: String, enum: ['Completado', 'Usado', 'Cancelada'], default: 'Completado', index: true },
  usadaEn: { type: Date, default: null },
  validadaPor: { type: String, default: null },
  canceladaEn: { type: Date, default: null },
  canceladaPor: { type: String, default: null }
}, { timestamps: true });

/**
 * Cancela una entrada en una sola transacción. La entrada NO se borra: pasa a estado 'Cancelada'
 * (queda en el histórico), devuelve el cupo, se descuenta de la compra original y deja el registro de auditoría.
 * `quien` = nombre del usuario que cancela (el cliente o un administrador).
 */
async function cancelarEntradaZona(entradaId, clienteId, quien) {
  const Entrada = mongoose.model('Entrada');
  const filtro = clienteId ? { _id: entradaId, cliente: clienteId } : { _id: entradaId };
  const entrada = await Entrada.findOne(filtro);
  if (!entrada) throw Object.assign(new Error('Entrada no encontrada.'), { status: 404 });
  if (entrada.estado === 'Usado') throw Object.assign(new Error('La entrada ya fue usada y no se puede cancelar.'), { status: 409 });
  if (entrada.estado === 'Cancelada') throw Object.assign(new Error('La entrada ya fue cancelada.'), { status: 409 });

  await mongoose.model('Evento').prepararStockZonas(entrada.evento);

  return conTransaccion(async ({ session, alDeshacer }) => {
    const eliminada = await Entrada.findOneAndUpdate(
      { _id: entradaId, estado: 'Completado' },
      { estado: 'Cancelada', canceladaEn: new Date(), canceladaPor: quien || 'sistema' },
      { new: true, session }
    );
    if (!eliminada) throw Object.assign(new Error('La entrada ya fue cancelada o usada.'), { status: 409 });
    alDeshacer(() => Entrada.updateOne({ _id: entradaId }, { estado: 'Completado', canceladaEn: null, canceladaPor: null }));

    const sector = ZONAS.includes(eliminada.sector) ? eliminada.sector : 'General';
    await mongoose.model('Evento').liberarZona(eliminada.evento, sector, eliminada.cantidad, session);
    alDeshacer(() => mongoose.model('Evento').reservarZona(eliminada.evento, sector, eliminada.cantidad));

    await registrarCancelacionEnTransaccion(eliminada, session);
    alDeshacer(() => registrarCancelacionEnTransaccion({ ...eliminada.toObject(), cantidad: -eliminada.cantidad }));

    await new (mongoose.model('CancelacionLog'))({
      cliente: eliminada.cliente, evento: eliminada.evento, nombreCliente: quien || 'sistema',
      eventoNombre: eliminada.nombre, codigoBoleto: eliminada.codigoBoleto, cantidad: eliminada.cantidad
    }).save({ session });

    return eliminada;
  });
}

// Marca en la compra original cuántas entradas se cancelaron, para que los informes no las cuenten como vendidas
async function registrarCancelacionEnTransaccion(entrada, session = null) {
  if (!entrada.transaccion) return;
  await mongoose.model('Transaccion').updateOne(
    { _id: entrada.transaccion, items: { $elemMatch: { eventoId: entrada.evento, tipoEntrada: entrada.sector } } },
    { $inc: { 'items.$.cantidadCancelada': entrada.cantidad } },
    { session }
  );
}

entradaSchema.statics.cancelarEntradaZona = cancelarEntradaZona;
entradaSchema.statics.registrarCancelacionEnTransaccion = registrarCancelacionEnTransaccion;
export default mongoose.model('Entrada', entradaSchema);