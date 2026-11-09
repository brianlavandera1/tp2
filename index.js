import express from 'express';
import http from 'http';
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
import verificarOrigen from './middlewares/origen.middleware.js';
import { esSuperAdmin, puedeGestionarUsuario } from './middlewares/authMiddleware.js';
import Evento from './models/Evento.js';
import { registrarActividad } from './middlewares/actividad.middleware.js';

// Rutas
import authRoutes from './routes/authRoutes.js';
import clienteRoutes from './routes/clienteRoutes.js';
import salasRoutes from './routes/salasRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import eventosRoutes from './routes/eventosRoutes.js';
import carritoRoutes from './routes/carritoRoutes.js';
import entradasRoutes from './routes/entradasRoutes.js';
import mediaRoutes from './routes/mediaRoutes.js';
import actividadRoutes from './routes/actividadRoutes.js';

// Tiempo real (Socket.IO)
import { iniciarSockets } from './sockets/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// En Vercel (y cualquier hosting con proxy) la app recibe las peticiones a través de un proxy HTTPS:
// sin esto Express cree que la conexión es HTTP, no envía la cookie de sesión "secure" y no se puede iniciar sesión
app.set('trust proxy', 1);

app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));
app.locals.categoriasEvento = Evento.CATEGORIAS;
app.locals.esSuperAdmin = esSuperAdmin;
app.locals.puedeGestionarUsuario = puedeGestionarUsuario;

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
      // Las tipografías de la marca (Anton, Archivo, Space Mono) vienen de Google Fonts
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      upgradeInsecureRequests: config.esProduccion ? [] : null
    }
  },
  // Con el valor por defecto de helmet ("no-referrer") los navegadores envían "Origin: null" al enviar
  // un formulario, y la protección CSRF (verificarOrigen) no podría reconocer al propio sitio.
  // Esta política manda el origen completo dentro del sitio y solo el dominio hacia sitios externos.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

app.use(requestLogger);
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Protección CSRF: rechaza POST/PUT/DELETE que vengan de otro sitio
app.use(verificarOrigen);

if (!config.sessionSecret) {
  console.error('❌ Falta SESSION_SECRET en el archivo .env (ver .env.example)');
  process.exit(1);
}

const sesion = session({
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
});
app.use(sesion);

// Datos comunes para todas las vistas (menú activo, usuario y contador del carrito)
app.use((req, res, next) => {
  res.locals.usuarioLogueado = req.session.usuario || null;
  res.locals.rutaActual = req.path;
  res.locals.itemsCarrito = (req.session.carrito || []).reduce((total, item) => total + item.cantidad, 0);
  next();
});

// Registro de actividad: cada sesión deja constancia de lo que hace (páginas, acciones, login/logout)
app.use(registrarActividad);

// Configuración de rutas
app.use('/actividad', actividadRoutes);
app.use('/auth', authRoutes);
app.use('/cliente/carrito', carritoRoutes);
app.use('/cliente', clienteRoutes);
app.use('/admin/salas', salasRoutes);
app.use('/admin', adminRoutes);
app.use('/admin/eventos', eventosRoutes);
app.use('/entradas', entradasRoutes);
app.use('/media', mediaRoutes);

// Centro de ayuda: se puede consultar sin iniciar sesión (explica también cómo registrarse)
app.get('/ayuda', (req, res) => res.render('ayuda'));

app.get('/', (req, res) => {
  res.redirect('/cliente/menu');
});

app.use(notFoundHandler);
app.use(errorHandler);

// En Vercel no se levanta un servidor: la plataforma usa la app exportada como función.
// En la computadora (npm run dev / npm start) se escucha en el puerto configurado.
if (!process.env.VERCEL) {
  conexion
    .then(() => {
      // El seed borra la base: se ejecuta solo a mano con `npm run seed`
      // Socket.IO necesita el servidor HTTP, por eso se crea aparte de la app de Express
      const servidor = http.createServer(app);
      iniciarSockets(servidor, sesion);
      servidor.listen(config.port, '0.0.0.0', () => {
        console.log(`🚀 Servidor corriendo en http://localhost:${config.port}`);
      });
    })
    .catch(err => {
      console.error('❌ Error crítico al iniciar la aplicación:', err);
    });
}

export default app;