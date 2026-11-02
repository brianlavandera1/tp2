import mongoose from 'mongoose';
import borradoLogico from './plugins/borradoLogico.js';
import Sala from './Sala.js';

const { ZONAS, obtenerZonas } = Sala;

const eventoSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  descripcion: { type: String, required: true },
  fecha: { type: Date, required: true },
  hora: { type: String },
  precio: { type: Number, required: true, default: 5000, min: 0 },
  // Precios opcionales por sector; si no se cargan se usa `precio` (General)
  precioPlatea: { type: Number, min: 0, default: null },
  precioVIP: { type: Number, min: 0, default: null },
  entradasDisponibles: { type: Number, default: 0, min: 0 },
  vendidosPorZona: { type: mongoose.Schema.Types.Mixed, default: undefined },
  sala: { type: mongoose.Schema.Types.ObjectId, ref: 'Sala' },
  entidad: { type: mongoose.Schema.Types.ObjectId, ref: 'Entidad' }
}, { timestamps: true });

// Operación Atómica para evitar compras simultáneas solapadas
eventoSchema.methods.venderEntradas = async function(cantidad) {
  if (cantidad <= 0) throw new Error('La cantidad debe ser mayor a cero.');
  const reservado = await mongoose.model('Evento').findOneAndUpdate(
    { _id: this._id, entradasDisponibles: { $gte: cantidad } },
    { $inc: { entradasDisponibles: -cantidad } },
    { new: true }
  );
  if (!reservado) throw new Error('No hay suficientes entradas disponibles.');
  this.entradasDisponibles = reservado.entradasDisponibles;
  return true;
};

eventoSchema.methods.precioDeZona = function(zona) {
  if (zona === 'Platea' && this.precioPlatea != null) return this.precioPlatea;
  if (zona === 'VIP' && this.precioVIP != null) return this.precioVIP;
  return this.precio;
};

async function prepararStockZonas(eventoId, session = null) {
  let evento = await mongoose.model('Evento').findById(eventoId).populate('sala').session(session);
  if (!evento) throw Object.assign(new Error('Evento no encontrado.'), { status: 404 });
  if (!evento.vendidosPorZona) {
    const entradas = await mongoose.model('Entrada').find({ evento: eventoId, estado: { $ne: 'Cancelada' } }).session(session);
    const vendidos = { General: 0, Platea: 0, VIP: 0 };
    for (const entrada of entradas) {
      const sector = ZONAS.includes(entrada.sector) ? entrada.sector : 'General';
      vendidos[sector] += entrada.cantidad;
    }
    await mongoose.model('Evento').updateOne({ _id: eventoId }, { $set: { vendidosPorZona: vendidos } }).session(session);
    evento = await mongoose.model('Evento').findById(eventoId).populate('sala').session(session);
  }
  return evento;
}

async function disponibilidadZonas(eventoId, session = null) {
  const evento = await prepararStockZonas(eventoId, session);
  const capacidades = evento.sala ? obtenerZonas(evento.sala) : null;
  const disponibles = Object.fromEntries(ZONAS.map(zona => [zona, capacidades
    ? Math.max(0, Math.min(evento.entradasDisponibles, capacidades[zona] - (evento.vendidosPorZona[zona] || 0)))
    : evento.entradasDisponibles]));
  return { evento, disponibles };
}

async function reservarZona(eventoId, zona, cantidad, session = null) {
  if (!ZONAS.includes(zona) || cantidad < 1) throw Object.assign(new Error('Sector inválido.'), { status: 400 });
  const { evento, disponibles } = await disponibilidadZonas(eventoId, session);
  if (cantidad > disponibles[zona]) throw Object.assign(new Error(`Sin cupo en ${zona}.`), { status: 400 });
  
  const filtro = { _id: eventoId, entradasDisponibles: { $gte: cantidad } };
  if (evento.sala) {
    filtro[`vendidosPorZona.${zona}`] = { $lte: obtenerZonas(evento.sala)[zona] - cantidad };
    filtro.$expr = {$lte: [{ $add: ZONAS.map(key => ({$ifNull: [`$vendidosPorZona.${key}`, 0] })) }, evento.sala.capacidad - cantidad] };
  }
  
  const reservado = await mongoose.model('Evento').findOneAndUpdate(filtro, {
    $inc: { entradasDisponibles: -cantidad, [`vendidosPorZona.${zona}`]: cantidad }
  }, { new: true, session });
  
  if (!reservado) throw Object.assign(new Error('El cupo cambió.'), { status: 400 });
  return reservado;
}

async function liberarZona(eventoId, zona, cantidad, session = null) {
  await mongoose.model('Evento').updateOne({ _id: eventoId }, {
    $inc: { entradasDisponibles: cantidad, [`vendidosPorZona.${zona}`]: -cantidad }
  }).session(session);
}

async function validarCupoEvento(salaId, entradasDisponibles, eventoId) {
  if (entradasDisponibles < 0) throw Object.assign(new Error('Stock inválido.'), { status: 400 });
  if (!salaId) return;
  const sala = await Sala.findById(salaId);
  if (!sala) throw Object.assign(new Error('Sala no encontrada.'), { status: 400 });
  let vendidos = 0;
  if (eventoId) {
    const evento = await prepararStockZonas(eventoId);
    vendidos = ZONAS.reduce((sum, zona) => sum + (evento.vendidosPorZona[zona] || 0), 0);
  }
  if (entradasDisponibles + vendidos > sala.capacidad) throw Object.assign(new Error('Supera capacidad.'), { status: 400 });
}

eventoSchema.statics = { prepararStockZonas, disponibilidadZonas, reservarZona, liberarZona, validarCupoEvento };
// Borrado lógico: "eliminar" solo marca el documento, nunca se pierde del histórico
eventoSchema.plugin(borradoLogico);

export default mongoose.model('Evento', eventoSchema);