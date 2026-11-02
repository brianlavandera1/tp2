import express from 'express';
import { mostrarFotoEntidad } from '../controllers/entidadesController.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';

const router = express.Router();

// Imágenes guardadas en la base: son públicas porque la cartelera se ve sin iniciar sesión
router.get('/artistas/:id', asyncHandler(mostrarFotoEntidad));

export default router;
