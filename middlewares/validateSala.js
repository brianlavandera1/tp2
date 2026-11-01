import Sala, { ZONAS, validarZonas } from '../models/Sala.js';

const camposApi = { name: 'nombre', capacity: 'capacidad', type: 'tipo', isAvailable: 'disponible', zones: 'zonas' };
const camposWeb = ['nombre', 'capacidad', 'tipo', 'disponible', 'descripcion', 'ubicacion', 'zonas', 'general', 'platea', 'vip'];

const isHtmlRequest = (req) => {
  return (req.headers.accept && req.headers.accept.includes('text/html')) || 
         (req.headers['content-type'] && req.headers['content-type'].includes('application/x-www-form-urlencoded'));
};

export const validarSalaId = (req, res, next) => {
  if (/^[a-fA-F0-9]{24}$/.test(req.params.id)) return next();
  
  if (isHtmlRequest(req)) {
    return res.redirect('/admin/salas?error=ID+inválido.');
  }
  return next(Object.assign(new Error('ID inválido.'), { status: 400 }));
};

export const validarSalaBody = async (req, res, next) => {
  const body = req.body;
  
  if (!body || typeof body !== 'object') {
    if (isHtmlRequest(req)) {
      const salas = await Sala.find();
      return res.status(400).render('Admin/salas', {
        usuarioLogueado: req.session?.usuario || null,
        salas,
        datos: req.body,
        error: 'Cuerpo de petición inválido.'
      });
    }
    return next(Object.assign(new Error('Cuerpo inválido.'), { status: 400 }));
  }

  const api = Boolean(req.esApiSalas);
  const datos = {};
  for (const key of Object.keys(body)) datos[api ? camposApi[key] : key] = body[key];

  if (!api && !datos.zonas) {
    datos.zonas = { 
      General: Number(datos.general) || 0, 
      Platea: Number(datos.platea) || 0, 
      VIP: Number(datos.vip) || 0 
    };
  }

  try {
    datos.capacidad = validarZonas(datos.zonas);
    req.salaDatos = datos;
    next();
  } catch (error) {
    // Si es una petición web (HTML), renderizamos el formulario correspondiente sin romper la app
    if (isHtmlRequest(req)) {
      const salas = await Sala.find();
      
      // Si tiene params.id significa que estábamos editando una sala existente
      if (req.params.id) {
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
          usuarioLogueado: req.session?.usuario || null,
          sala: salaObj,
          error: error.message
        });
      } else {
        // Si no tiene ID, estábamos creando una nueva sala
        return res.status(400).render('Admin/salas', {
          usuarioLogueado: req.session?.usuario || null,
          salas,
          datos: req.body,
          error: error.message
        });
      }
    }
    
    // Si es una petición API (JSON), devolvemos el error estándar
    next(Object.assign(new Error(error.message), { status: 400 }));
  }
};