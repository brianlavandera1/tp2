import express from 'express';
import { 
  mostrarFormularioCrearPersonal, 
  registrarPersonalInterno, 
  listarUsuarios, 
  mostrarFormularioEditarUsuario, 
  actualizarUsuario, 
  eliminarUsuario, 
  listarAuditoriaPagos, 
  listarCancelaciones, 
  mostrarBoleteria, 
  procesarVentaFisica 
} from '../controllers/adminController.js';
import { mostrarGestionEntradas } from '../controllers/entradasController.js';
import { verificarRol } from '../middlewares/authMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';
import Entidad from '../models/Entidad.js';

const router = express.Router();

router.use(verificarRol(['Administrador', 'Supervisor', 'Lector']));

// Panel y Gestión de Usuarios
router.get('/dashboard', (req, res) => res.render('Admin/dashboard', { usuarioLogueado: req.session.usuario }));
router.get('/usuarios', asyncHandler(listarUsuarios));
router.get('/crear-personal', verificarRol(['Administrador']), mostrarFormularioCrearPersonal);
router.post('/crear-personal', verificarRol(['Administrador']), asyncHandler(registrarPersonalInterno));
router.get('/usuarios/editar/:id', verificarRol(['Administrador']), asyncHandler(mostrarFormularioEditarUsuario));
router.post('/usuarios/editar/:id', verificarRol(['Administrador']), asyncHandler(actualizarUsuario));
router.post('/usuarios/eliminar/:id', verificarRol(['Administrador']), asyncHandler(eliminarUsuario));

// Auditorías, Informes y Gestión de Entradas (Rutas corregidas)
router.get('/pagos', asyncHandler(listarAuditoriaPagos));         // 👈 Actualizado a /admin/pagos
router.get('/cancelaciones', asyncHandler(listarCancelaciones));
router.get('/informe', asyncHandler(mostrarGestionEntradas));     // 👈 Actualizado a /admin/informe

// Boletería Física y Cobros
router.get('/boleteria', verificarRol(['Administrador', 'Supervisor']), asyncHandler(mostrarBoleteria));
router.post('/boleteria/cobrar', verificarRol(['Administrador', 'Supervisor']), asyncHandler(procesarVentaFisica));

// GESTIÓN DE ARTISTAS / ENTIDADES
router.get('/entidades', asyncHandler(async (req, res) => {
  const entidades = await Entidad.find().sort({ nombre: 1 });

  res.render('Admin/entidades', { 
    usuarioLogueado: req.session.usuario, 
    entidades, 
    exito: req.query.exito || null, 
    error: req.query.error || null 
  });
}));

router.post('/entidades/crear', verificarRol(['Administrador', 'Supervisor']), asyncHandler(async (req, res) => {
  const { nombre } = req.body;
  if (!nombre || !nombre.trim()) {
    return res.redirect('/admin/entidades?error=El nombre del artista no puede estar vacío');
  }

  try {
    await Entidad.create({ nombre: nombre.trim() });
    res.redirect('/admin/entidades?exito=Artista o compañía creado exitosamente');
  } catch (error) {
    let mensaje = 'Error al registrar el artista.';
    if (error.code === 11000) {
      mensaje = 'Ya existe un artista o compañía con ese nombre.';
    }
    res.redirect(`/admin/entidades?error=${encodeURIComponent(mensaje)}`);
  }
}));

router.post('/entidades/editar/:id', verificarRol(['Administrador', 'Supervisor']), asyncHandler(async (req, res) => {
  const { nombre } = req.body;
  if (nombre && nombre.trim()) {
    try {
      await Entidad.findByIdAndUpdate(req.params.id, { nombre: nombre.trim() }, { runValidators: true });
      return res.redirect('/admin/entidades?exito=Artista actualizado correctamente');
    } catch (error) {
      let mensaje = 'Error al actualizar el artista.';
      if (error.code === 11000) {
        mensaje = 'Ya existe otro artista o compañía con ese nombre.';
      }
      return res.redirect(`/admin/entidades?error=${encodeURIComponent(mensaje)}`);
    }
  }
  res.redirect('/admin/entidades');
}));

router.post('/entidades/eliminar/:id', verificarRol(['Administrador', 'Supervisor']), asyncHandler(async (req, res) => {
  await Entidad.findByIdAndDelete(req.params.id);
  res.redirect('/admin/entidades?exito=Artista eliminado correctamente');
}));

export default router;