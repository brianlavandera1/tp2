import mongoose from 'mongoose';
import borradoLogico from './plugins/borradoLogico.js';

export const TIPOS_FOTO = Object.freeze(['image/jpeg', 'image/png', 'image/webp']);
export const TAMANO_MAXIMO_FOTO = 2 * 1024 * 1024; // 2 MB

const entidadSchema = new mongoose.Schema({
  nombre: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // Foto del artista guardada en la propia base (sirve igual en Atlas y en local).
  // select: false evita traer los bytes en cada listado: se piden solo al servir la imagen.
  foto: {
    type: new mongoose.Schema({
      data: { type: Buffer, required: true },
      contentType: { type: String, enum: TIPOS_FOTO, required: true }
    }, { _id: false }),
    select: false,
    default: undefined
  },
  // Marca de la última foto subida: indica si hay foto sin cargarla y sirve para refrescar la caché del navegador
  fotoActualizada: { type: Date, default: null },
  // Atribución de la foto cuando tiene licencia Creative Commons (la exige la licencia)
  fotoCredito: {
    type: new mongoose.Schema({
      autor: { type: String, trim: true },
      licencia: { type: String, trim: true },
      licenciaUrl: { type: String, trim: true },
      fuente: { type: String, trim: true }
    }, { _id: false }),
    default: undefined
  }
}, { timestamps: true });

// URL pública de la foto (null si el artista no tiene)
entidadSchema.virtual('urlFoto').get(function () {
  return this.fotoActualizada ? `/media/artistas/${this._id}?v=${this.fotoActualizada.getTime()}` : null;
});

// Forzamos el nombre de la colección a 'entidades' para evitar el 'entidads'
// Borrado lógico: "eliminar" solo marca el documento, nunca se pierde del histórico
entidadSchema.plugin(borradoLogico);

export default mongoose.models.Entidad || mongoose.model('Entidad', entidadSchema, 'entidades');
