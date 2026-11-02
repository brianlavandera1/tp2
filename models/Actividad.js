import mongoose from 'mongoose';

/**
 * Registro de actividad (auditoría): cada sesión deja constancia de todo lo que hace.
 *  - sesion:     inicio y cierre de sesión (y los intentos fallidos)
 *  - navegacion: cada página que se abre
 *  - accion:     cada operación que modifica datos (comprar, editar, eliminar, cancelar, validar...)
 *  - click:      cada clic en botones, enlaces y solapas del menú (lo envía el navegador)
 * Nunca se guardan contraseñas ni datos de tarjetas.
 */
export const TIPOS_ACTIVIDAD = Object.freeze(['sesion', 'navegacion', 'accion', 'click']);

const actividadSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
  nombreUsuario: { type: String, default: 'anónimo' },
  rol: { type: String, default: null },
  sesionId: { type: String, default: null },
  tipo: { type: String, enum: TIPOS_ACTIVIDAD, required: true },
  accion: { type: String, required: true, maxlength: 120 },
  detalle: { type: String, default: '', maxlength: 300 },
  pagina: { type: String, default: '', maxlength: 200 },
  metodo: { type: String, default: null },
  estado: { type: Number, default: null },
  exito: { type: Boolean, default: true },
  ip: { type: String, default: null },
  navegador: { type: String, default: '', maxlength: 200 },
  fecha: { type: Date, default: Date.now, index: true }
}, { versionKey: false });

// Índices compuestos para los filtros de la pantalla de Actividad (siempre ordenada por fecha)
actividadSchema.index({ nombreUsuario: 1, fecha: -1 });
actividadSchema.index({ sesionId: 1, fecha: -1 });
actividadSchema.index({ tipo: 1, fecha: -1 });

export default mongoose.models.Actividad || mongoose.model('Actividad', actividadSchema, 'actividades');
