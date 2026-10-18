import Sala from '../models/Sala.js';
import Evento from '../models/Evento.js';
import Entidad from '../models/Entidad.js';

const validarCupoEvento = Evento.validarCupoEvento;

const escapeRegex = (text) => text ? text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&') : '';

const isHtmlRequest = (req) => {
  return (req.headers.accept && req.headers.accept.includes('text/html')) || 
         (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded'));
};

const getEventos = async (req, res) => {
  try {
    const eventos = await Evento.find().populate('sala').populate('entidad'); 
    if (isHtmlRequest(req)) {
      return res.render('Admin/eventos', {  // 👈 Apunta a views/Admin/eventos.pug
        usuarioLogueado: req.session ? req.session.usuario : null,
        eventos, 
        salas: await Sala.find(), 
        entidades: await Entidad.find().sort({ nombre: 1 }), 
        error: req.query.error,
        exito: req.query.exito 
      });
    }
    res.json(eventos);
  } catch (error) {
    console.error('Error al obtener eventos:', error);
    res.status(500).send('Error interno al cargar los eventos.');
  }
};

const getEventoById = async (req, res) => {
  try {
    const evento = await Evento.findById(req.params.id).populate('sala').populate('entidad');
    if (!evento) return res.status(404).json({ message: 'Evento no encontrado' });
    res.json(evento);
  } catch (error) {
    res.status(500).json({ message: 'Error al buscar el evento' });
  }
};

const createEvento = async (req, res) => {
  try {
    const { nombre, descripcion, fecha, hora, precio, entradasDisponibles, sala, nombreEntidadSelect, nombreEntidadTexto } = req.body;
    const entradas = Number(entradasDisponibles);

    if (entradasDisponibles === undefined || isNaN(entradas) || entradas < 0) {
      if (isHtmlRequest(req)) return res.redirect('/admin/eventos?error=Entradas+inválidas');
      return res.status(400).json({ message: 'Las entradas disponibles deben ser un número >= 0.' });
    }

    await validarCupoEvento(sala, entradas);

    const nombreEntidadFinal = (nombreEntidadTexto && nombreEntidadTexto.trim() !== '') 
      ? nombreEntidadTexto 
      : nombreEntidadSelect;

    let entidadAsignada = null;
    if (nombreEntidadFinal && nombreEntidadFinal.trim() !== '') {
      const nombreLimpio = nombreEntidadFinal.trim();
      const regexEntidad = new RegExp(`^${escapeRegex(nombreLimpio)}$`, 'i');
      let encontrada = await Entidad.findOne({ nombre: regexEntidad });
      if (!encontrada) encontrada = await Entidad.create({ nombre: nombreLimpio });
      entidadAsignada = encontrada._id;
    }

    const nuevoEvento = new Evento({
      nombre, descripcion, fecha, hora, 
      precio: parseFloat(precio) || 5000,
      entradasDisponibles: entradas,
      sala: sala || null,
      entidad: entidadAsignada
    });

    await nuevoEvento.save();
    if (isHtmlRequest(req)) return res.redirect('/admin/eventos');
    res.status(201).json(nuevoEvento);
  } catch (error) {
    console.error('Error al crear evento:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Error interno al crear el evento' });
  }
};

const showEditEventoForm = async (req, res) => {
  try {
    const evento = await Evento.findById(req.params.id).populate('entidad');
    if (!evento) return res.redirect('/admin/eventos?error=Evento+no+encontrado');
    res.render('Admin/editarEvento', {  // 👈 Apunta a views/Admin/editarEvento.pug
      usuarioLogueado: req.session ? req.session.usuario : null,
      evento, 
      salas: await Sala.find(), 
      entidades: await Entidad.find().sort({ nombre: 1 }),
      error: req.query.error 
    });
  } catch (error) {
    res.redirect('/admin/eventos?error=Error+al+cargar+el+evento');
  }
};

const updateEvento = async (req, res) => {
  try {
    const { nombre, descripcion, fecha, hora, precio, entradasDisponibles, sala, nombreEntidadSelect, nombreEntidadTexto } = req.body;
    const updateData = {};

    if (nombre) updateData.nombre = nombre;
    if (descripcion) updateData.descripcion = descripcion;
    if (fecha) updateData.fecha = fecha;
    if (hora) updateData.hora = hora;
    if (precio !== undefined) updateData.precio = parseFloat(precio);
    if (entradasDisponibles !== undefined) updateData.entradasDisponibles = Number(entradasDisponibles);
    if (sala) updateData.sala = sala;

    const nombreEntidadFinal = (nombreEntidadTexto && nombreEntidadTexto.trim() !== '') 
      ? nombreEntidadTexto 
      : nombreEntidadSelect;

    if (nombreEntidadFinal && nombreEntidadFinal.trim() !== '') {
      const nombreLimpio = nombreEntidadFinal.trim();
      const regexEntidad = new RegExp(`^${escapeRegex(nombreLimpio)}$`, 'i');
      let encontrada = await Entidad.findOne({ nombre: regexEntidad });
      if (!encontrada) encontrada = await Entidad.create({ nombre: nombreLimpio });
      updateData.entidad = encontrada._id;
    }

    const actual = await Evento.findById(req.params.id);
    if (!actual) return res.status(404).json({ message: 'Evento no encontrado' });
    await validarCupoEvento(sala || actual.sala, updateData.entradasDisponibles ?? actual.entradasDisponibles, actual._id);

    const eventoActualizado = await Evento.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });

    if (!eventoActualizado) {
      if (isHtmlRequest(req)) return res.redirect('/admin/eventos?error=Evento+no+encontrado');
      return res.status(404).json({ message: 'Evento no encontrado' });
    }

    if (isHtmlRequest(req)) return res.redirect('/admin/eventos');
    res.json(eventoActualizado);
  } catch (error) {
    console.error('Error al actualizar evento:', error);
    res.status(error.status || 500).json({ message: error.status ? error.message : 'Error al actualizar el evento' });
  }
};

const deleteEvento = async (req, res) => {
  try {
    const eventoEliminado = await Evento.findByIdAndDelete(req.params.id);
    if (!eventoEliminado) {
      if (isHtmlRequest(req)) return res.redirect('/admin/eventos?error=Evento+no+encontrado');
      return res.status(404).json({ message: 'Evento no encontrado' });
    }
    if (isHtmlRequest(req)) return res.redirect('/admin/eventos');
    res.json({ message: 'Evento eliminado correctamente', evento: eventoEliminado });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar el evento' });
  }
};

const actualizarEntidad = async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) return res.redirect('/admin/entidades?error=El+nombre+del+artista+es+obligatorio');
    
    await Entidad.findByIdAndUpdate(req.params.id, { nombre: nombre.trim() }, { runValidators: true });
    res.redirect('/admin/entidades?exito=Artista/Compañía+actualizado+correctamente');
  } catch (error) {
    res.redirect('/admin/entidades?error=Error:+Ya+existe+una+entidad+con+ese+nombre');
  }
};

const eliminarEntidad = async (req, res) => {
  try {
    const tieneEventos = await Evento.exists({ entidad: req.params.id });
    if (tieneEventos) {
      return res.redirect('/admin/entidades?error=No+se+puede+eliminar+un+artista+con+eventos+activos');
    }
    await Entidad.findByIdAndDelete(req.params.id);
    res.redirect('/admin/entidades?exito=Artista/Compañía+eliminado+correctamente');
  } catch (error) {
    res.redirect('/admin/entidades?error=Error+al+eliminar+el+artista');
  }
};

export { 
  getEventos, 
  getEventoById, 
  createEvento, 
  showEditEventoForm, 
  updateEvento, 
  deleteEvento,
  actualizarEntidad,
  eliminarEntidad 
};