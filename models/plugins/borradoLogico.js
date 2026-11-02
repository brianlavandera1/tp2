/**
 * Plugin de Mongoose: BORRADO LÓGICO.
 * En el sistema nada se elimina físicamente: "eliminar" marca el documento con
 * eliminado = true, la fecha y quién lo hizo. Así queda todo en el histórico.
 *
 * Las búsquedas (find, findOne, countDocuments, exists...) ocultan solas los eliminados, salvo que:
 *  - el filtro pida explícitamente el campo `eliminado` (por ejemplo, la lista de eliminados), o
 *  - el filtro busque por `_id` (populate y findById): así una entrada vieja sigue mostrando su evento.
 */
export default function borradoLogico(schema) {
  schema.add({
    eliminado: { type: Boolean, default: false, index: true },
    eliminadoEn: { type: Date, default: null },
    eliminadoPor: { type: String, default: null }
  });

  const ocultarEliminados = function () {
    const filtro = this.getFilter();
    if ('eliminado' in filtro || '_id' in filtro) return;
    this.where({ eliminado: { $ne: true } });
  };
  for (const operacion of ['find', 'findOne', 'countDocuments', 'findOneAndUpdate', 'updateOne', 'updateMany']) {
    schema.pre(operacion, ocultarEliminados);
  }

  // Marca el documento como eliminado (no lo borra)
  schema.statics.eliminarLogico = function (id, usuario) {
    return this.findOneAndUpdate(
      { _id: id, eliminado: { $ne: true } },
      { eliminado: true, eliminadoEn: new Date(), eliminadoPor: usuario?.nombreUsuario || 'sistema' },
      { new: true }
    );
  };
}
