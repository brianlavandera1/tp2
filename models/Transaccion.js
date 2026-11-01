import mongoose from 'mongoose';
import { ZONAS } from './Sala.js';

const itemTransaccionSchema = new mongoose.Schema({
  eventoId: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento', required: true },
  nombreEvento: { type: String, required: true },
  tipoEntrada: { type: String, enum: ZONAS, required: true },
  cantidad: { type: Number, required: true, min: 1 },
  // Entradas de este ítem que el cliente canceló después (no se cuentan como vendidas)
  cantidadCancelada: { type: Number, default: 0, min: 0 },
  precio: { type: Number, required: true, min: 0 }
}, { _id: false });

const transaccionSchema = new mongoose.Schema({
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  nombreCliente: { type: String, required: true },
  items: {
    type: [itemTransaccionSchema],
    validate: [items => items.length > 0, 'La transacción debe tener al menos un ítem.']
  },
  subtotal: { type: Number, required: true, min: 0 },
  descuentoAplicado: { type: Number, default: 0, min: 0 },
  total: { type: Number, required: true, min: 0 },
  medioPago: { type: String, required: true },
  tarjetaUltimosDigitos: String,
  // Online = compra del cliente por la web; Sucursal = venta en boletería física
  canal: { type: String, enum: ['Online', 'Sucursal'], default: 'Online' },
  comprobanteId: { type: String, required: true, unique: true },
  fechaCompra: { type: Date, default: Date.now }
});

export default mongoose.models.Transaccion || mongoose.model('Transaccion', transaccionSchema);
