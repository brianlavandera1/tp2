import express from 'express';
import { verificarRol, verificarAutenticacion } from '../middlewares/authMiddleware.js';
import { autenticarToken } from '../middlewares/jwt.middleware.js';
import { 
  getEntradas, 
  getEntradaById, 
  createEntrada, 
  updateEntrada, 
  deleteEntrada 
} from '../controllers/entradasController.js';

const router = express.Router();

// 1. Requerir autenticación previa: sesión (web) o token JWT en "Authorization: Bearer ..." (API)
router.use(autenticarToken);
router.use(verificarAutenticacion);

// 2. Consultas (los clientes solo ven sus propias entradas)
router.get('/', getEntradas);
router.get('/:id', getEntradaById);

// 3. Altas, modificaciones o eliminaciones sensibles exclusivas para Administrador
// (los clientes compran por /cliente/carrito, que valida stock y cobra)
router.post('/', verificarRol(['Administrador']), createEntrada);
router.put('/:id', verificarRol(['Administrador']), updateEntrada);
router.delete('/:id', verificarRol(['Administrador']), deleteEntrada);

export default router;