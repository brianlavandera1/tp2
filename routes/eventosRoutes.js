import express from 'express';
import { 
  getEventos, 
  createEvento, 
  showEditEventoForm, 
  updateEvento, 
  deleteEvento 
} from '../controllers/eventosController.js';
import { verificarRol } from '../middlewares/authMiddleware.js';

const router = express.Router();

router.get('/', verificarRol(['Administrador', 'Supervisor', 'Lector']), getEventos);

router.post('/', verificarRol(['Administrador', 'Supervisor']), createEvento);

router.get('/editar/:id', verificarRol(['Administrador', 'Supervisor']), showEditEventoForm);

router.post('/editar/:id', verificarRol(['Administrador', 'Supervisor']), updateEvento);
router.post('/actualizar/:id', verificarRol(['Administrador', 'Supervisor']), updateEvento);

router.post('/eliminar/:id', verificarRol(['Administrador', 'Supervisor']), deleteEvento);

export default router;