import express from 'express';
import { registrarClick } from '../controllers/actividadController.js';
import { verificarAutenticacion } from '../middlewares/authMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';

const router = express.Router();

// El navegador informa cada clic de un usuario logueado (botones, enlaces, solapas del menú)
router.post('/click', verificarAutenticacion, asyncHandler(registrarClick));

export default router;
