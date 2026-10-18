import Sala from '../models/Sala.js';
import Evento from '../models/Evento.js';

const isHtmlRequest = (req) => {
  return (req.headers.accept && req.headers.accept.includes('text/html')) || 
         (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded'));
};

const getSalas = async (req, res) => {
  try {
    const salas = await Sala.find();
    if (isHtmlRequest(req)) {
      return res.render('Admin/salas', {  // 👈 Apunta a views/Admin/salas.pug
        usuarioLogueado: req.session ? req.session.usuario : null,
        salas,
        error: req.query.error || null,
        exito: req.query.exito || null,
        datos: {}
      });
    }
    res.json(salas);
  } catch (error) {
    console.error('Error al obtener salas:', error);
    res.status(500).send('Error interno al cargar las salas.');
  }
};

const getSalaById = async (req, res) => {
  try {
    const sala = await Sala.findById(req.params.id);
    if (!sala) return res.status(404).json({ message: 'Sala no encontrada' });
    res.json(sala);
  } catch (error) {
    res.status(500).json({ message: 'Error al obtener la sala' });
  }
};

const createSala = async (req, res) => {
  try {
    const datos = req.salaDatos || {
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      capacidad: Number(req.body.capacidad),
      zonas: {
        General: Number(req.body.general) || 0,
        Platea: Number(req.body.platea) || 0,
        VIP: Number(req.body.vip) || 0
      },
      ubicacion: req.body.ubicacion
    };

    const nuevaSala = new Sala(datos);
    await nuevaSala.save();

    if (isHtmlRequest(req)) return res.redirect('/admin/salas?exito=Sala+creada+correctamente');
    res.status(201).json(nuevaSala);
  } catch (error) {
    console.error('Error al crear sala:', error);
    let mensajeError = error.message;
    if (error.code === 11000) {
      mensajeError = 'Ya existe una sala registrada con ese nombre.';
    }
    if (isHtmlRequest(req)) {
      const salas = await Sala.find();
      return res.status(400).render('Admin/salas', {
        usuarioLogueado: req.session ? req.session.usuario : null,
        salas,
        datos: req.body,
        error: mensajeError
      });
    }
    res.status(400).json({ message: mensajeError });
  }
};

const showEditSalaForm = async (req, res) => {
  try {
    const sala = await Sala.findById(req.params.id);
    if (!sala) return res.redirect('/admin/salas?error=Sala+no+encontrada');
    res.render('Admin/editarSala', {  // 👈 Apunta a views/Admin/editarSala.pug
      usuarioLogueado: req.session ? req.session.usuario : null,
      sala,
      error: req.query.error || null 
    });
  } catch (error) {
    res.redirect('/admin/salas?error=Error+al+cargar+la+sala');
  }
};

const updateSala = async (req, res) => {
  try {
    const datos = req.salaDatos || {
      nombre: req.body.nombre,
      descripcion: req.body.descripcion,
      capacidad: Number(req.body.capacidad),
      zonas: {
        General: Number(req.body.general) || 0,
        Platea: Number(req.body.platea) || 0,
        VIP: Number(req.body.vip) || 0
      },
      ubicacion: req.body.ubicacion
    };

    const salaActualizada = await Sala.findByIdAndUpdate(
      req.params.id,
      datos,
      { new: true, runValidators: true }
    );

    if (!salaActualizada) {
      if (isHtmlRequest(req)) return res.redirect('/admin/salas?error=Sala+no+encontrada');
      return res.status(404).json({ message: 'Sala no encontrada' });
    }

    if (isHtmlRequest(req)) return res.redirect('/admin/salas?exito=Sala+actualizada+correctamente');
    res.json(salaActualizada);
  } catch (error) {
    console.error('Error al actualizar sala:', error);
    let mensajeError = error.message;
    if (error.code === 11000) {
      mensajeError = 'Ya existe una sala registrada con ese nombre.';
    }
    if (isHtmlRequest(req)) {
      const salaObj = {
        _id: req.params.id,
        nombre: req.body.nombre || '',
        ubicacion: req.body.ubicacion || '',
        capacidad: req.body.capacidad || '',
        descripcion: req.body.descripcion || '',
        zonas: {
          General: req.body.general !== undefined ? req.body.general : 0,
          Platea: req.body.platea !== undefined ? req.body.platea : 0,
          VIP: req.body.vip !== undefined ? req.body.vip : 0
        }
      };
      return res.status(400).render('Admin/editarSala', {
        usuarioLogueado: req.session ? req.session.usuario : null,
        sala: salaObj,
        error: mensajeError
      });
    }
    res.status(400).json({ message: mensajeError });
  }
};

const deleteSala = async (req, res) => {
  try {
    const tieneEventos = await Evento.exists({ sala: req.params.id });
    if (tieneEventos) {
      if (isHtmlRequest(req)) return res.redirect('/admin/salas?error=No+se+puede+eliminar+una+sala+con+eventos+asociados');
      return res.status(400).json({ message: 'No se puede eliminar una sala con eventos asociados' });
    }

    const salaEliminada = await Sala.findByIdAndDelete(req.params.id);
    if (!salaEliminada) {
      if (isHtmlRequest(req)) return res.redirect('/admin/salas?error=Sala+no+encontrada');
      return res.status(404).json({ message: 'Sala no encontrada' });
    }

    if (isHtmlRequest(req)) return res.redirect('/admin/salas?exito=Sala+eliminada+correctamente');
    res.json({ message: 'Sala eliminada correctamente', sala: salaEliminada });
  } catch (error) {
    res.status(500).json({ message: 'Error al eliminar la sala' });
  }
};

export {
  getSalas,
  getSalaById,
  createSala,
  showEditSalaForm,
  updateSala,
  deleteSala
};