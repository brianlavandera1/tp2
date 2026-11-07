import mongoose from 'mongoose';
import borradoLogico from './plugins/borradoLogico.js';

export const ZONAS = Object.freeze(['General', 'Platea', 'VIP']);
const errorDatos = message => Object.assign(new Error(message), { status: 400 });
export function validarZonas(zonas) {
  if (!zonas || typeof zonas !== 'object' || Array.isArray(zonas) ||
      Object.keys(zonas).length !== ZONAS.length || Object.keys(zonas).some(key => !ZONAS.includes(key))) {
    throw errorDatos('Debe detallar las capacidades de General, Platea y VIP.');
  }
  if (ZONAS.some(zona => !Number.isSafeInteger(zonas[zona]) || zonas[zona] < 0)) {
    throw errorDatos('Cada zona debe tener una capacidad entera mayor o igual a 0.');
  }
  const total = ZONAS.reduce((sum, zona) => sum + zonas[zona], 0);
  if (!Number.isSafeInteger(total) || total < 1) throw errorDatos('La capacidad total debe ser un entero mayor a 0.');
  return total;
}

export function obtenerZonas(sala) {
  return sala?.zonas || { General: sala?.capacidad || 0, Platea: 0, VIP: 0 };
}
const zonaSchema = new mongoose.Schema(Object.fromEntries(ZONAS.map(zona => [zona, {
  type: Number, required: true, min: 0, validate: Number.isSafeInteger
}])), { _id: false });

const salaSchema = new mongoose.Schema({
  nombre: { type: String, required: [true, 'El nombre es obligatorio.'], trim: true, unique: true },
  descripcion: { type: String, trim: true, default: '' },
  capacidad: {
    type: Number,
    required: [true, 'La capacidad es obligatoria.'],
    min: [1, 'La capacidad mínima es 1.'],
    validate: { validator: Number.isSafeInteger, message: 'La capacidad debe ser un entero válido.' }
  },
  zonas: { type: zonaSchema, required: true },
  ubicacion: { type: String, trim: true, default: '' },
  disponible: { type: Boolean, default: true }
}, { timestamps: true, versionKey: false });

// Reglas compartidas del dominio de salas, accesibles desde el modelo.
salaSchema.statics.ZONAS = ZONAS;
salaSchema.statics.validarZonas = validarZonas;
salaSchema.statics.obtenerZonas = obtenerZonas;
salaSchema.methods.obtenerZonas = function() { return obtenerZonas(this); };

salaSchema.pre('validate', function() {
  try {
    this.capacidad = validarZonas(this.zonas?.toObject());
  } catch (error) { this.invalidate('zonas', error.message); }
});

salaSchema.methods.obtenerInformacion = function() {
  return { id: this._id, nombre: this.nombre, descripcion: this.descripcion,
    capacidad: this.capacidad, ubicacion: this.ubicacion, zonas: this.zonas, disponible: this.disponible };
};

// Protege la distribución y las referencias de eventos existentes.
salaSchema.statics.actualizarConZonas = async function(id, datos) {
  const sala = await this.findById(id);
  if (!sala) return null;
  if (ZONAS.some(zona => obtenerZonas(sala)[zona] !== datos.zonas[zona]) &&
      await mongoose.model('Evento').exists({ sala: id })) {
    throw Object.assign(new Error('No se puede cambiar la distribución de una sala con eventos vinculados.'), { status: 409 });
  }
  sala.set(datos);
  return await sala.save();
};
salaSchema.statics.eliminarConEventos = async function(id, usuario) {
  if (await mongoose.model('Evento').exists({ sala: id })) {
    throw Object.assign(new Error('No se puede eliminar una sala con eventos vinculados.'), { status: 409 });
  }
  return await this.eliminarLogico(id, usuario);
};


// Borrado lógico: "eliminar" solo marca el documento, nunca se pierde del histórico
salaSchema.plugin(borradoLogico);

export default mongoose.model('Sala', salaSchema);
