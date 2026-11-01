import express from 'express';
import { mostrarFotoEntidad } from '../controllers/entidadesController.js';
import { verificarAutenticacion } from '../middlewares/authMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';

const router = express.Router();

// Imágenes guardadas en la base: las ve cualquier usuario logueado (clientes en la cartelera y personal en el panel)
router.get('/artistas/:id', verificarAutenticacion, asyncHandler(mostrarFotoEntidad));

export default router;
