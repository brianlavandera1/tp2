// Borrado lógico: "eliminar" marca el documento (eliminado, fecha y quién) y nada se pierde.
// Las búsquedas ocultan los eliminados, salvo que el filtro pida `eliminado` o busque por _id.
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
