import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuración (variables de entorno) y conexión modularizada
import config from './config/config.js';
import { conectarDB } from './config/db.js';

// Middlewares
import { requestLogger, notFoundHandler, errorHandler } from './middlewares/index.js';

// Rutas
import authRoutes from './routes/authRoutes.js';
import clienteRoutes from './routes/clienteRoutes.js';
import salasRoutes from './routes/salasRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import eventosRoutes from './routes/eventosRoutes.js';
import carritoRoutes from './routes/carritoRoutes.js';
import entradasRoutes from './routes/entradasRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// La conexión arranca primero: el almacén de sesiones usa la misma conexión (Atlas o local)
const conexion = conectarDB();

// Encabezados de seguridad HTTP. Las vistas usan estilos y scripts escritos dentro de Pug,
// por eso se permiten 'unsafe-inline'; todo lo demás queda limitado al propio sitio.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      scriptSrcAttr: ["'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.esProduccion ? [] : null
    }
  }
}));

app.use(requestLogger);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!config.sessionSecret) {
  console.error('❌ Falta SESSION_SECRET en el archivo .env (ver .env.example)');
  process.exit(1);
}

app.use(session({
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  // Las sesiones se guardan en MongoDB (colección "sesiones"): sobreviven a un reinicio del servidor
  // y MongoDB borra solas las vencidas (índice TTL)
  store: MongoStore.create({
    clientPromise: conexion.then(m => m.connection.getClient()),
    collectionName: 'sesiones',
    ttl: Math.round(config.sessionMaxAgeMs / 1000)
  }),
  cookie: {
    httpOnly: true,               // el JavaScript del navegador no puede leer la cookie
    sameSite: 'lax',              // protección básica contra CSRF
    secure: config.esProduccion,  // solo HTTPS en producción
    maxAge: config.sessionMaxAgeMs
  }
}));

// Datos comunes para todas las vistas (menú activo, usuario y contador del carrito)
app.use((req, res, next) => {
  res.locals.usuarioLogueado = req.session.usuario || null;
  res.locals.rutaActual = req.path;
  res.locals.itemsCarrito = (req.session.carrito || []).reduce((total, item) => total + item.cantidad, 0);
  next();
});

// Configuración de rutas
app.use('/auth', authRoutes);
app.use('/cliente/carrito', carritoRoutes);
app.use('/cliente', clienteRoutes);
app.use('/admin/salas', salasRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/eventos', eventosRoutes);
app.use('/entradas', entradasRoutes);
app.use('/media', mediaRoutes);

app.get('/', (req, res) => {
  res.redirect('/auth/login');
});

app.use(notFoundHandler);
app.use(errorHandler);

conexion
  .then(() => {
    // El seed borra la base: se ejecuta solo a mano con `npm run seed`
    app.listen(config.port, '0.0.0.0', () => {
      console.log(`🚀 Servidor corriendo en http://localhost:${config.port}`);
    });
  })
  .catch(err => {
    console.error('❌ Error crítico al iniciar la aplicación:', err);
  });