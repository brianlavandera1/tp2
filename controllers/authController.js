import Usuario from '../models/Usuario.js';
import bcrypt from 'bcrypt';
import config from '../config/config.js';
import { firmarToken } from '../middlewares/jwt.middleware.js';

// Devuelve el usuario si el identificador (nombre o email) y la contraseña coinciden; si no, null
const buscarPorCredenciales = async (identificador, password) => {
  if (typeof identificador !== 'string' || typeof password !== 'string' || !identificador.trim() || !password) return null;
  const usuario = await Usuario.findOne({ $or: [{ nombreUsuario: identificador.trim() }, { email: identificador.trim() }] });
  if (!usuario) return null;
  return (await bcrypt.compare(password, usuario.password)) ? usuario : null;
};

// POST /auth/token — login para la API: devuelve un JWT para usar en "Authorization: Bearer <token>"
export const emitirToken = async (req, res) => {
  const usuario = await buscarPorCredenciales(req.body?.identificador, req.body?.password);
  if (!usuario) {
    return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
  }
  res.json({ token: firmarToken(usuario), tipo: 'Bearer', expiraEn: config.jwtExpira });
};

// Procesar el inicio de sesión
export const procesarLogin = async (req, res) => {
  try {
    const { identificador, password } = req.body;

    if (typeof identificador !== 'string' || typeof password !== 'string' || !identificador.trim() || !password) {
      return res.status(400).render('auth/login', {
        error: 'Completá usuario y contraseña.',
        datos: req.body
      });
    }

    const usuario = await buscarPorCredenciales(identificador, password);
    if (!usuario) {
      return res.status(400).render('auth/login', {
        error: 'Usuario o contraseña incorrectos.',
        datos: req.body
      });
    }

    // Se genera un id de sesión nuevo al iniciar sesión (evita la fijación de sesión)
    await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));

    req.session.usuario = {
      _id: usuario._id,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol,
      tipoCliente: usuario.tipoCliente,
      porcentajeDescuento: usuario.porcentajeDescuento
    };

    // Se guarda en MongoDB antes de redirigir, para que la próxima página ya encuentre la sesión
    await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));

    return res.redirect(usuario.rol === 'Cliente' ? '/cliente/menu' : '/admin/dashboard');

  } catch (error) {
    console.error('Error en el login:', error);
    res.status(500).render('auth/login', { 
      error: 'Ocurrió un error en el servidor.',
      datos: req.body 
    });
  }
};

// Procesar el registro de un nuevo cliente
export const registrarCliente = async (req, res) => {
  try {
    const { nombreUsuario, nombre, apellido, email, password, dni, fechaNacimiento, telefono } = req.body;

    const usuarioExistente = await Usuario.findOne({ 
      $or: [{ nombreUsuario }, { email }] 
    });

    if (usuarioExistente) {
      return res.status(400).render('auth/registro', { 
        error: 'El nombre de usuario o correo electrónico ya están registrados.',
        datos: req.body 
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await Usuario.create({
      nombreUsuario: nombreUsuario.trim(),
      nombre: nombre.trim(),
      apellido: apellido.trim(),
      email: email.trim(),
      password: hashedPassword,
      dni: dni.trim(),
      fechaNacimiento,
      telefono: telefono.trim(),
      rol: 'Cliente',
      tipoCliente: 'ESTANDAR',
      porcentajeDescuento: 0
    });

    res.redirect('/auth/login?exito=Registro exitoso. Por favor, inicia sesión.');

  } catch (error) {
    console.error('Error en el registro:', error);
    res.status(500).render('auth/registro', { 
      error: 'Ocurrió un error interno al procesar el registro.',
      datos: req.body 
    });
  }
};