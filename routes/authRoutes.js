import express from 'express';
import { procesarLogin, registrarCliente } from '../controllers/authController.js';  
import { validarRegistro } from '../middlewares/validacionesMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';

const router = express.Router();

router.get('/login', (req, res) => res.render('auth/login', { error: req.query.error, exito: req.query.exito }));
router.post('/login', asyncHandler(procesarLogin));
router.get('/registro', (req, res) => res.render('auth/registro', { error: req.query.error, datos: {} }));
router.post('/registro', validarRegistro, asyncHandler(registrarCliente));
router.get('/logout', (req, res) => req.session.destroy(() => res.redirect('/auth/login')));

export default router;