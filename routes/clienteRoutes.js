import express from 'express';
import { 
  mostrarMenu, 
  mostrarMembresia, 
  procesarMembresia, 
  mostrarMisCompras,
  descargarEntradas,
  cancelarEntrada, 
  mostrarComprar,
  mostrarConfiguracion,
  actualizarConfiguracion
} from '../controllers/clienteController.js';
import { verificarRol } from '../middlewares/authMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';

const router = express.Router();

// Se ven sin iniciar sesión: el inicio, la cartelera y los planes
router.get('/menu', asyncHandler(mostrarMenu));
router.get('/comprar', asyncHandler(mostrarComprar));
router.get('/membresia', asyncHandler(mostrarMembresia));

// Todo lo demás es de cada cliente
router.use(verificarRol(['Cliente']));

router.post('/procesar-membresia', asyncHandler(procesarMembresia));
router.get('/mis-compras', asyncHandler(mostrarMisCompras));
router.get('/mis-entradas/:eventoId/descargar', asyncHandler(descargarEntradas));
router.post('/cancelar-entrada/:id', asyncHandler(cancelarEntrada));

// ⚙️ Rutas de configuración de perfil
router.get('/configuracion', asyncHandler(mostrarConfiguracion));
router.post('/configuracion', asyncHandler(actualizarConfiguracion));

export default router;