import mongoose from 'mongoose';

const cancelacionSchema = new mongoose.Schema({
  cliente: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
  evento: { type: mongoose.Schema.Types.ObjectId, ref: 'Evento' },
  nombreCliente: { type: String, required: true },
  eventoNombre: { type: String, required: true },
  codigoBoleto: { type: String, required: true },
  cantidad: { type: Number, default: 1, min: 1 },
  fechaCancelacion: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.models.CancelacionLog || mongoose.model('CancelacionLog', cancelacionSchema);
