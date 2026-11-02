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
      const conexion = await mongoose.connect(uriAtlas, { serverSelectionTimeoutMS: 10000 }); // Hasta 10 segundos: el primer pedido en Vercel o una red lenta pueden tardar
      console.log(`📦 Conectado exitosamente a MongoDB Atlas: ${conexion.connection.host}`);
      return informarTransacciones(conexion);
    } catch (errorAtlas) {
      // En Vercel no existe una base local: se informa el motivo real (usuario/clave, IP no habilitada en Atlas...)
      if (process.env.VERCEL) throw new Error(`No se pudo conectar a MongoDB Atlas: ${errorAtlas.message}`);
      console.warn(`⚠️ No se pudo conectar a MongoDB Atlas (${errorAtlas.message}). Intentando con la base de datos local...`);
    }
  }

  if (process.env.VERCEL) {
    throw new Error('Falta la variable MONGODB_URI en Vercel (Settings → Environment Variables).');
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