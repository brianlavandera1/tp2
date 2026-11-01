import express from 'express';
import { procesarLogin, registrarCliente } from '../controllers/authController.js';  
import { validarRegistro } from '../middlewares/validacionesMiddleware.js';
import asyncHandler from '../middlewares/asyncHandler.middleware.js';
import limiteLogin from '../middlewares/limiteLogin.middleware.js';

const router = express.Router();

router.get('/login', (req, res) => res.render('auth/login', { error: req.query.error, exito: req.query.exito }));
router.post('/login', limiteLogin, asyncHandler(procesarLogin));
router.get('/registro', (req, res) => res.render('auth/registro', { error: req.query.error, datos: {} }));
router.post('/registro', validarRegistro, asyncHandler(registrarCliente));
// Cierra la sesión: la borra del almacén (MongoDB) y elimina la cookie del navegador
router.get('/logout', (req, res) => req.session.destroy(() => {
  res.clearCookie('connect.sid');
  res.redirect('/auth/login');
}));

export default router;