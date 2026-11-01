import express from 'express';
import { verCarrito, agregarItem, quitarItem, checkout, procesarPago } from '../controllers/carritoController.js';
import { verificarRol } from '../middlewares/authMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';

const router = express.Router();
router.use(verificarRol(['Cliente']));

router.get('/', verCarrito);
router.post('/agregar', asyncHandler(agregarItem));
router.post('/quitar/:index', quitarItem);
router.get('/checkout', checkout);
router.post('/procesar-pago', asyncHandler(procesarPago));

export default router;