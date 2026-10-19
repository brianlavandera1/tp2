import mongoose from 'mongoose';

const usuarioSchema = new mongoose.Schema({
  nombreUsuario: { type: String, required: true, unique: true },
  nombre: { 
    type: String, 
    required: true, 
    match: [/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/, 'El nombre solo debe contener letras.'] 
  },
  apellido: { 
    type: String, 
    required: true, 
    match: [/^[A-Za-zÁÉÍÓÚáéíóúÑñ\s]+$/, 'El apellido solo debe contener letras.'] 
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Por favor, ingresa un correo electrónico válido.'] 
  },
  password: { type: String, required: true },
  dni: { 
    type: String, 
    required: true, 
    match: [/^\d{7,8}$/, 'El DNI debe tener entre 7 y 8 dígitos numéricos.'] 
  },
  fechaNacimiento: { type: Date, required: true },
  telefono: { 
    type: String, 
    required: true, 
    match: [/^\d{10,15}$/, 'El teléfono debe contener entre 10 y 15 números.'] 
  },
  rol: { type: String, enum: ['Cliente', 'Administrador', 'Supervisor', 'Lector'], default: 'Cliente' },
  tipoCliente: { type: String, enum: ['ESTANDAR', 'PREMIUM', 'VIP', 'Regular'], default: 'ESTANDAR' },
  porcentajeDescuento: { type: Number, default: 0 }
}, { timestamps: true });

export default mongoose.model('Usuario', usuarioSchema);