import 'dotenv/config';

// Configuración centralizada: todo lo que depende del entorno se lee de .env (ver .env.example)
const config = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || '',
  mongoUriLocal: process.env.MONGODB_URI_LOCAL || 'mongodb://127.0.0.1:27017/TP2',
  sessionSecret: process.env.SESSION_SECRET || '',
  sessionMaxAgeMs: (Number(process.env.SESSION_MAX_AGE_HORAS) || 8) * 60 * 60 * 1000,
  esProduccion: process.env.NODE_ENV === 'production'
};

export default config;
