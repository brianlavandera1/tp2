import Entidad from '../models/Entidad.js';
import Evento from '../models/Evento.js';

// Reconoce el formato real por los primeros bytes del archivo (no confía solo en la extensión)
const detectarTipoImagen = (buffer) => {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
};

// Arma los datos de la foto subida (o lanza un error si el archivo no es una imagen válida)
const datosDeFoto = (archivo) => {
  const contentType = detectarTipoImagen(archivo.buffer);
  if (!contentType) throw Object.assign(new Error('El archivo no es una imagen JPG, PNG o WEBP válida.'), { status: 400 });
  return { foto: { data: archivo.buffer, contentType }, fotoActualizada: new Date() };
};

const mensajeDeError = (error, porDefecto) => {
  if (error.code === 11000) return 'Ya existe un artista o compañía con ese nombre.';
  return error.status === 400 ? error.message : porDefecto;
};

// GESTIÓN DE ARTISTAS / ENTIDADES
export const listarEntidades = async (req, res) => {
  const entidades = await Entidad.find().sort({ nombre: 1 });

  res.render('Admin/entidades', {
    usuarioLogueado: req.session.usuario,
    entidades,
    exito: req.query.exito || null,
    error: req.query.error || null
  });
};

export const crearEntidad = async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.redirect('/admin/entidades?error=El nombre del artista no puede estar vacío');
  }

  try {
    await Entidad.create({ nombre: nombre.trim(), ...(req.file ? datosDeFoto(req.file) : {}) });
    res.redirect('/admin/entidades?exito=Artista o compañía creado exitosamente');
  } catch (error) {
    res.redirect(`/admin/entidades?error=${encodeURIComponent(mensajeDeError(error, 'Error al registrar el artista.'))}`);
  }
};

export const actualizarEntidad = async (req, res) => {
  const { nombre, quitarFoto } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.redirect('/admin/entidades?error=El nombre del artista no puede estar vacío');
  }

  try {
    const cambios = { nombre: nombre.trim() };
    // Una foto nueva subida desde el panel reemplaza también el crédito de la anterior
    if (req.file) {
      Object.assign(cambios, datosDeFoto(req.file), { $unset: { fotoCredito: 1 } });
    } else if (quitarFoto) {
      Object.assign(cambios, { $unset: { foto: 1, fotoCredito: 1 }, fotoActualizada: null });
    }
    await Entidad.findByIdAndUpdate(req.params.id, cambios, { runValidators: true });
    res.redirect('/admin/entidades?exito=Artista actualizado correctamente');
  } catch (error) {
    res.redirect(`/admin/entidades?error=${encodeURIComponent(mensajeDeError(error, 'Error al actualizar el artista.'))}`);
  }
};

export const eliminarEntidad = async (req, res) => {
  // No se borra un artista que tiene eventos: el evento quedaría sin artista asociado
  if (await Evento.exists({ entidad: req.params.id })) {
    return res.redirect('/admin/entidades?error=No se puede eliminar un artista con eventos asociados');
  }
  // Borrado lógico: el artista queda en el histórico marcado como eliminado
  await Entidad.eliminarLogico(req.params.id, req.session.usuario);
  res.redirect('/admin/entidades?exito=Artista eliminado correctamente');
};

// Sirve la foto guardada en MongoDB. La URL lleva ?v=<fecha>, así que el navegador puede cachearla
export const mostrarFotoEntidad = async (req, res) => {
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) return res.sendStatus(404);
  const entidad = await Entidad.findById(req.params.id).select('+foto fotoActualizada');
  if (!entidad || !entidad.foto) return res.sendStatus(404);

  res.set({
    'Content-Type': entidad.foto.contentType,
    'Cache-Control': 'public, max-age=604800',
    'X-Content-Type-Options': 'nosniff'
  });
  res.send(entidad.foto.data);
};
