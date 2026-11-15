import express from 'express';
import { 
  getSalas, 
  createSala, 
  showEditSalaForm, 
  updateSala, 
  deleteSala 
} from '../controllers/salasController.js';
import { verificarRol } from '../middlewares/authMiddleware.js';
import { validarSalaBody, validarSalaId } from '../middlewares/validateSala.js';

const router = express.Router();

router.get('/', verificarRol(['Administrador', 'Supervisor', 'Lector']), getSalas);

router.post('/', verificarRol(['Administrador', 'Supervisor']), validarSalaBody, createSala);

router.get('/editar/:id', verificarRol(['Administrador', 'Supervisor']), validarSalaId, showEditSalaForm);

// Acepta /editar/:id y /actualizar/:id
router.post('/editar/:id', verificarRol(['Administrador', 'Supervisor']), validarSalaId, validarSalaBody, updateSala);
router.post('/actualizar/:id', verificarRol(['Administrador', 'Supervisor']), validarSalaId, validarSalaBody, updateSala);

router.post('/eliminar/:id', verificarRol(['Administrador', 'Supervisor']), validarSalaId, deleteSala);

export default router;