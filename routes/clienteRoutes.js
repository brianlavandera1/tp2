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
router.use(verificarRol(['Cliente']));

router.get('/menu', asyncHandler(mostrarMenu));
router.get('/membresia', asyncHandler(mostrarMembresia));
router.post('/procesar-membresia', asyncHandler(procesarMembresia));
router.get('/mis-compras', asyncHandler(mostrarMisCompras));
router.get('/mis-entradas/:eventoId/descargar', asyncHandler(descargarEntradas));
router.post('/cancelar-entrada/:id', asyncHandler(cancelarEntrada));
router.get('/comprar', asyncHandler(mostrarComprar));

// ⚙️ Rutas de configuración de perfil
router.get('/configuracion', asyncHandler(mostrarConfiguracion));
router.post('/configuracion', asyncHandler(actualizarConfiguracion));

export default router;