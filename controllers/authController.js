import Usuario from '../models/Usuario.js';
import bcrypt from 'bcrypt';

// Procesar el inicio de sesión
export const procesarLogin = async (req, res) => {
  try {
    const { identificador, password } = req.body;

    const usuario = await Usuario.findOne({ 
      $or: [
        { nombreUsuario: identificador.trim() }, 
        { email: identificador.trim() }
      ] 
    });

    if (!usuario) {
      return res.status(400).render('auth/login', { 
        error: 'Usuario o contraseña incorrectos.',
        datos: req.body 
      });
    }

    const passwordMatch = await bcrypt.compare(password, usuario.password);

    if (!passwordMatch) {
      return res.status(400).render('auth/login', { 
        error: 'Usuario o contraseña incorrectos.',
        datos: req.body 
      });
    }

    req.session.usuario = {
      _id: usuario._id,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol,
      tipoCliente: usuario.tipoCliente,
      porcentajeDescuento: usuario.porcentajeDescuento
    };

    if (usuario.rol === 'Cliente') {
      return res.redirect('/cliente/menu');
    } else {
      return res.redirect('/admin/dashboard');
    }

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