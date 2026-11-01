import mongoose from 'mongoose';
import crypto from 'crypto';
import { ZONAS } from './Sala.js';

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
  estado: { type: String, enum: ['Completado', 'Usado'], default: 'Completado' }
}, { timestamps: true });

async function cancelarEntradaZona(entradaId, clienteId) {
  const entrada = await mongoose.model('Entrada').findOne({ _id: entradaId, cliente: clienteId });
  if (!entrada) throw Object.assign(new Error('Entrada no encontrada.'), { status: 404 });
  
  await mongoose.model('Evento').prepararStockZonas(entrada.evento);
  const eliminada = await mongoose.model('Entrada').findOneAndDelete({ _id: entradaId });
  
  if (!eliminada) throw Object.assign(new Error('La entrada ya fue cancelada.'), { status: 409 });

  try {
    const sector = ZONAS.includes(eliminada.sector) ? eliminada.sector : 'General';
    await mongoose.model('Evento').liberarZona(eliminada.evento, sector, eliminada.cantidad);
  } catch (error) {
    // Rollback manual si falla la liberación de stock
    await mongoose.model('Entrada').create(eliminada.toObject());
    throw error;
  }

  await registrarCancelacionEnTransaccion(eliminada);
  return eliminada;
}

// Marca en la compra original cuántas entradas se cancelaron, para que los informes no las cuenten como vendidas
async function registrarCancelacionEnTransaccion(entrada) {
  if (!entrada.transaccion) return;
  await mongoose.model('Transaccion').updateOne(
    { _id: entrada.transaccion, items: { $elemMatch: { eventoId: entrada.evento, tipoEntrada: entrada.sector } } },
    { $inc: { 'items.$.cantidadCancelada': entrada.cantidad } }
  );
}

entradaSchema.statics.cancelarEntradaZona = cancelarEntradaZona;
entradaSchema.statics.registrarCancelacionEnTransaccion = registrarCancelacionEnTransaccion;
export default mongoose.model('Entrada', entradaSchema);