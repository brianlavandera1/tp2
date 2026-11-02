import express from 'express';
import {
  mostrarDashboard,
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
import { mostrarGestionEntradas, mostrarValidacion, validarEntrada } from '../controllers/entradasController.js';
import { listarEntidades, crearEntidad, actualizarEntidad, eliminarEntidad } from '../controllers/entidadesController.js';
import { mostrarActividad, sugerirUsuarios } from '../controllers/actividadController.js';
import { verificarRol } from '../middlewares/authMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';
import subirFoto from '../middlewares/subirFoto.middleware.js';

const router = express.Router();

router.use(verificarRol(['Administrador', 'Supervisor', 'Lector']));

// Registro de actividad de todos los usuarios: solo lo ven Administrador y Supervisor
router.get('/actividad', verificarRol(['Administrador', 'Supervisor']), asyncHandler(mostrarActividad));
router.get('/actividad/usuarios', verificarRol(['Administrador', 'Supervisor']), asyncHandler(sugerirUsuarios));

// Panel y Gestión de Usuarios
router.get('/dashboard', asyncHandler(mostrarDashboard));
router.get('/usuarios', asyncHandler(listarUsuarios));
router.get('/crear-personal', verificarRol(['Administrador']), mostrarFormularioCrearPersonal);
router.post('/crear-personal', verificarRol(['Administrador']), asyncHandler(registrarPersonalInterno));
router.get('/usuarios/editar/:id', verificarRol(['Administrador']), asyncHandler(mostrarFormularioEditarUsuario));
router.post('/usuarios/editar/:id', verificarRol(['Administrador']), asyncHandler(actualizarUsuario));
router.post('/usuarios/eliminar/:id', verificarRol(['Administrador']), asyncHandler(eliminarUsuario));

// Auditorías, Informes y Gestión de Entradas
router.get('/pagos', asyncHandler(listarAuditoriaPagos));
router.get('/cancelaciones', asyncHandler(listarCancelaciones));
router.get('/informe', asyncHandler(mostrarGestionEntradas));

// Boletería Física y Cobros
router.get('/boleteria', verificarRol(['Administrador', 'Supervisor']), asyncHandler(mostrarBoleteria));
router.post('/boleteria/cobrar', verificarRol(['Administrador', 'Supervisor']), asyncHandler(procesarVentaFisica));

// Control de acceso en la puerta: el QR de cada entrada abre /admin/validar/:codigo
router.get('/validar', verificarRol(['Administrador', 'Supervisor']), asyncHandler(mostrarValidacion));
router.get('/validar/:codigo', verificarRol(['Administrador', 'Supervisor']), asyncHandler(mostrarValidacion));
router.post('/validar/:codigo', verificarRol(['Administrador', 'Supervisor']), asyncHandler(validarEntrada));

// Gestión de Artistas / Entidades
router.get('/entidades', asyncHandler(listarEntidades));
// El rol se verifica antes de procesar el archivo: un usuario sin permiso no llega a subir nada
router.post('/entidades/crear', verificarRol(['Administrador', 'Supervisor']), subirFoto('foto', '/admin/entidades'), asyncHandler(crearEntidad));
router.post('/entidades/editar/:id', verificarRol(['Administrador', 'Supervisor']), subirFoto('foto', '/admin/entidades'), asyncHandler(actualizarEntidad));
router.post('/entidades/eliminar/:id', verificarRol(['Administrador', 'Supervisor']), asyncHandler(eliminarEntidad));

export default router;
