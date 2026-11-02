import 'dotenv/config';
import crypto from 'crypto';

const sessionSecret = process.env.SESSION_SECRET || '';

// Configuración centralizada: todo lo que depende del entorno se lee de .env (ver .env.example)
const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  mongoUriLocal: process.env.MONGODB_URI_LOCAL || 'mongodb://127.0.0.1:27017/TP2',
  sessionSecret,
  sessionMaxAgeMs: (Number(process.env.SESSION_MAX_AGE_HORAS) || 8) * 60 * 60 * 1000,
  esProduccion: process.env.NODE_ENV === 'production',

  // JWT para la API: si no se define JWT_SECRET se deriva una clave distinta a la de las sesiones
  jwtSecret: process.env.JWT_SECRET || (sessionSecret && crypto.createHmac('sha256', sessionSecret).update('jwt-urbana-cult').digest('hex')),
  jwtExpira: process.env.JWT_EXPIRA || '1h',
  jwtAudiencia: 'urbana-cult-api',
  jwtEmisor: 'urbana-cult'
};

export default config;
