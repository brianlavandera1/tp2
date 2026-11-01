import mongoose from 'mongoose';
import config from './config.js';
import { detectarTransacciones, modoTransacciones } from '../utils/transaccion.js';

// Informa si el servidor conectado admite transacciones nativas
const informarTransacciones = async (conexion) => {
  await detectarTransacciones();
  console.log(`🔒 Transacciones: ${modoTransacciones()}`);
  return conexion;
};

export const conectarDB = async () => {
  const uriAtlas = config.mongoUri;
  const uriLocal = config.mongoUriLocal;

  // 1. Intentar conectar primero a MongoDB Atlas (si está definida la URI)
  if (uriAtlas) {
    try {
      console.log('🌐 Intentando conectar a MongoDB Atlas...');
      const conexion = await mongoose.connect(uriAtlas, { serverSelectionTimeoutMS: 5000 }); // Timeout de 5 segundos para no quedar esperando
      console.log(`📦 Conectado exitosamente a MongoDB Atlas: ${conexion.connection.host}`);
      return informarTransacciones(conexion);
    } catch (errorAtlas) {
      console.warn('⚠️ No se pudo conectar a MongoDB Atlas. Intentando con la base de datos local...');
    }
  }

  // 2. Si Atlas falla o no está definido, se conecta a la base de datos local
  try {
    console.log('💻 Intentando conectar a MongoDB Local...');
    const conexionLocal = await mongoose.connect(uriLocal);
    console.log(`📦 Conectado exitosamente a MongoDB Local: ${conexionLocal.connection.host}`);
    return informarTransacciones(conexionLocal);
  } catch (errorLocal) {
    console.error('❌ Error crítico: No se pudo conectar ni a Atlas ni a la base de datos local.', errorLocal.message);
    process.exit(1);
  }
};