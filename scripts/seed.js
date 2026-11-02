import mongoose from 'mongoose';
import config from '../config/config.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

import Usuario from '../models/Usuario.js';
import Sala from '../models/Sala.js';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';
import Entidad from '../models/Entidad.js';
import CancelacionLog from '../models/CancelacionLog.js';
import Actividad from '../models/Actividad.js';
import { generarVentasDemo } from './ventasDemo.js';

const __filename = fileURLToPath(import.meta.url);

// Fotos de artistas con licencia Creative Commons (Wikimedia Commons) y sus créditos
const carpetaFotos = path.join(path.dirname(__filename), 'seed-fotos');
const creditosFotos = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(carpetaFotos, 'creditos.json'), 'utf8'));
  } catch {
    return [];
  }
})();

// Devuelve los campos de foto de un artista, o {} si no hay archivo (el seed sigue funcionando sin fotos)
function fotoDeArtista(nombre) {
  const credito = creditosFotos.find(c => c.artista === nombre);
  const ruta = credito && path.join(carpetaFotos, credito.archivo);
  if (!ruta || !fs.existsSync(ruta)) return {};
  return {
    foto: { data: fs.readFileSync(ruta), contentType: 'image/jpeg' },
    fotoActualizada: new Date(),
    fotoCredito: { autor: credito.autor, licencia: credito.licencia, licenciaUrl: credito.licenciaUrl, fuente: credito.fuente }
  };
}

async function conectarBaseDeDatos() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(config.mongoUri || config.mongoUriLocal);
  }
  
  await Promise.all([
    Usuario.init(),
    Sala.init(),
    Evento.init(),
    Entrada.init(),
    Transaccion.init(),
    Entidad.init()
  ]);
}

async function poblarBaseDeDatos() {
  const esEjecucionDirecta = process.argv[1] && path.resolve(process.argv[1]) === __filename;
  
  try {
    await conectarBaseDeDatos();
    console.log('📦 Conectado a MongoDB para seed...');

    await Entrada.deleteMany({});
    await Transaccion.deleteMany({});
    await Evento.deleteMany({});
    await Sala.deleteMany({});
    await Usuario.deleteMany({});
    await Entidad.deleteMany({});
    await CancelacionLog.deleteMany({});
    await Actividad.deleteMany({});

    console.log('🧹 Base de datos limpiada.');

    const entidadesSeed = [
      'Fuerza Bruta',
      'Cirque du Soleil',
      'Orquesta Sinfónica Nacional',
      'Les Luthiers',
      'Fundación Konex',
      'Charly García',
      'Gustavo Cerati',
      'Bizarrap',
      'Tini Stoessel',
      'Wos'
    ];

    // Cada artista se guarda con su foto de scripts/seed-fotos. Para que la demo se vea completa,
    // un artista sin foto no se carga (y tampoco sus funciones)
    const artistas = {};
    for (const nombre of entidadesSeed) {
      const foto = fotoDeArtista(nombre);
      if (!foto.foto) {
        console.warn(`⚠️ ${nombre} no tiene foto en scripts/seed-fotos: se omite junto con sus funciones.`);
        continue;
      }
      artistas[nombre] = await Entidad.create({ nombre, ...foto });
    }
    console.log(`🎭 ${Object.keys(artistas).length} artistas cargados, todos con foto.`);

    const passwordHash = await bcrypt.hash('123', 10);

    await Usuario.findOneAndUpdate(
      { nombreUsuario: 'admin' },
      {
        nombre: 'Administrador',
        apellido: 'Principal',
        email: 'admin@email.com',
        password: passwordHash,
        dni: '99887766',
        fechaNacimiento: new Date('1980-01-01'),
        telefono: '1100112233',
        rol: 'Administrador',
        tipoCliente: 'VIP',
        porcentajeDescuento: 0.3
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    const cliente1 = await Usuario.findOneAndUpdate(
      { nombreUsuario: 'cliente1' },
      {
        nombre: 'Juan',
        apellido: 'Perez',
        email: 'juan.perez@email.com',
        password: passwordHash,
        dni: '12345678',
        fechaNacimiento: new Date('1995-05-15'),
        telefono: '1122334455',
        rol: 'Cliente',
        tipoCliente: 'VIP',
        porcentajeDescuento: 0.3
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Usuario.findOneAndUpdate(
      { nombreUsuario: 'supervisor' },
      {
        nombre: 'Sara',
        apellido: 'Lopez',
        email: 'supervisor@email.com',
        password: passwordHash,
        dni: '23456789',
        fechaNacimiento: new Date('1985-03-10'),
        telefono: '1133445566',
        rol: 'Supervisor',
        tipoCliente: 'ESTANDAR',
        porcentajeDescuento: 0
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Usuario.findOneAndUpdate(
      { nombreUsuario: 'lector' },
      {
        nombre: 'Luis',
        apellido: 'Martinez',
        email: 'lector@email.com',
        password: passwordHash,
        dni: '34567890',
        fechaNacimiento: new Date('1988-07-22'),
        telefono: '1144556677',
        rol: 'Lector',
        tipoCliente: 'ESTANDAR',
        porcentajeDescuento: 0
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Usuario.findOneAndUpdate(
      { nombreUsuario: 'cliente2' },
      {
        nombre: 'Maria',
        apellido: 'Gomez',
        email: 'maria.gomez@email.com',
        password: passwordHash,
        dni: '45678901',
        fechaNacimiento: new Date('1998-11-03'),
        telefono: '1155667788',
        rol: 'Cliente',
        tipoCliente: 'ESTANDAR',
        porcentajeDescuento: 0
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    await Usuario.findOneAndUpdate(
      { nombreUsuario: 'cliente3' },
      {
        nombre: 'Pedro',
        apellido: 'Ruiz',
        email: 'pedro.ruiz@email.com',
        password: passwordHash,
        dni: '56789012',
        fechaNacimiento: new Date('1992-02-18'),
        telefono: '1166778899',
        rol: 'Cliente',
        tipoCliente: 'PREMIUM',
        porcentajeDescuento: 0.15
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    console.log('👥 6 usuarios de prueba cargados (contraseña: 123).');

    // --- SALAS ---
    const salaTeatro = await Sala.create({
      nombre: 'Teatro Gran Rex',
      descripcion: 'Sala clásica céntrica',
      zonas: { General: 300, Platea: 150, VIP: 50 },
      ubicacion: 'Av. Corrientes 857, CABA'
    });
    const salaEstadio = await Sala.create({
      nombre: 'Estadio Luna Park',
      descripcion: 'Estadio cubierto para grandes shows',
      zonas: { General: 6000, Platea: 1500, VIP: 500 },
      ubicacion: 'Av. Eduardo Madero 470, CABA'
    });
    const salaKonex = await Sala.create({
      nombre: 'Ciudad Cultural Konex',
      descripcion: 'Centro cultural con patio y sala principal',
      zonas: { General: 1000, Platea: 150, VIP: 50 },
      ubicacion: 'Sarmiento 3131, CABA'
    });

    // --- EVENTOS (funciones ficticias para la demo, en orden de fecha) ---
    // [artista, nombre, descripción, fecha, hora, sala, precio General, Platea, VIP]
    const eventosSeed = [
      ['Fuerza Bruta', 'Fuerza Bruta: Wayra', 'Experiencia inmersiva 360° con acrobacias aéreas (función viernes).', '2026-11-20', '21:00', salaKonex, 18000, 24000, 32000],
      ['Fuerza Bruta', 'Fuerza Bruta: Wayra', 'Experiencia inmersiva 360° con acrobacias aéreas (función sábado).', '2026-11-21', '20:30', salaKonex, 18000, 24000, 32000],
      ['Les Luthiers', 'Les Luthiers: Grandes Hitos', 'Humor y música con instrumentos informales en un repaso por sus obras más célebres.', '2026-11-27', '21:00', salaTeatro, 30000, 40000, 55000],
      ['Gustavo Cerati', 'Homenaje Sinfónico a Gustavo Cerati', 'Sus canciones en versión sinfónica con orquesta y músicos invitados.', '2026-12-04', '21:00', salaTeatro, 22000, 30000, 42000],
      ['Cirque du Soleil', 'Cirque du Soleil: Toruk', 'Circo contemporáneo con escenografía y proyecciones monumentales.', '2026-12-05', '20:00', salaEstadio, 45000, 65000, 90000],
      ['Fundación Konex', 'Ciclo Konex: Noches en el Patio', 'Música en vivo al aire libre en el patio de la Ciudad Cultural.', '2026-12-12', '19:00', salaKonex, 8000, 12000, 16000],
      ['Orquesta Sinfónica Nacional', 'Gran Concierto Sinfónico de Fin de Año', 'La Orquesta Sinfónica Nacional despide el año con obras clásicas.', '2026-12-28', '22:00', salaTeatro, 5000, 8000, 12000],
      ['Charly García', 'Charly García en Vivo', 'Un recorrido por los clásicos del rock nacional.', '2027-01-15', '21:30', salaEstadio, 35000, 50000, 80000],
      ['Bizarrap', 'Bizarrap Live Session', 'Show en vivo con invitados sorpresa y producción audiovisual.', '2027-02-06', '22:00', salaEstadio, 40000, 60000, 95000],
      ['Tini Stoessel', 'Tini en Concierto', 'Show con banda, bailarines y sus canciones más escuchadas.', '2027-02-20', '21:00', salaEstadio, 38000, 55000, 85000],
      ['Wos', 'Wos en Vivo', 'Rap y rock en vivo con banda completa.', '2027-03-06', '21:00', salaEstadio, 32000, 45000, 70000]
    ];

    let eventosCargados = 0;
    for (const [artista, nombre, descripcion, fecha, hora, sala, precio, precioPlatea, precioVIP] of eventosSeed) {
      if (!artistas[artista]) continue; // artista omitido por no tener foto
      eventosCargados++;
      await Evento.create({
        nombre, descripcion, hora, precio, precioPlatea, precioVIP,
        fecha: new Date(`${fecha}T${hora}`),
        entradasDisponibles: sala.capacidad,
        sala: sala._id,
        entidad: artistas[artista]._id
      });
    }

    console.log(`🎟️ ${eventosCargados} eventos cargados en 3 salas.`);

    // --- HISTORIAL DE VENTAS DE DEMOSTRACIÓN (para que el informe y la auditoría tengan datos) ---
    const clientesBase = await Usuario.find({ rol: 'Cliente' });
    const ventas = await generarVentasDemo({ passwordHash, clientesBase });
    console.log(`📈 Historial: ${ventas.transacciones} compras de los últimos 45 días, ${ventas.entradas} entradas vigentes, ${ventas.cancelaciones} cancelaciones y ${ventas.clientes} clientes de demostración.`);
    console.log('✨ ¡Seed ejecutado por completo!');

  } catch (error) {
    console.error('❌ Error en seed:', error);
    process.exitCode = 1;
  } finally {
    if (esEjecucionDirecta) {
      await mongoose.disconnect();
    }
  }
}

export { conectarBaseDeDatos, poblarBaseDeDatos };

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  poblarBaseDeDatos();
}