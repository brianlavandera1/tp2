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
import { CATEGORIAS_DEMO } from './categoriasDemo.js';

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
      'Cirque du Soleil',
      'Orquesta Sinfónica Nacional',
      'Les Luthiers',
      'Fundación Konex',
      'Charly García',
      'Gustavo Cerati',
      'Bizarrap',
      'Tini Stoessel',
      'Wos',
      'Salman Salem',
      'Starbugs Comedy',
      'Beyond Experience',
      'Rokerijada',
      'Feria Nocturna'
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

    // Dos usuarios de cada rol y dos clientes de cada plan
    // [usuario, nombre, apellido, email, DNI, nacimiento, teléfono, rol, plan, descuento]
    const usuariosSeed = [
      ['admin', 'Administrador', 'Principal', 'admin@email.com', '99887766', '1980-01-01', '1100112233', 'Administrador', 'VIP', 0.3],
      ['admin2', 'Ana', 'Rossi', 'admin2@email.com', '99887755', '1982-04-12', '1100112244', 'Administrador', 'VIP', 0.3],
      ['supervisor', 'Sara', 'Lopez', 'supervisor@email.com', '23456789', '1985-03-10', '1133445566', 'Supervisor', 'ESTANDAR', 0],
      ['supervisor2', 'Tomas', 'Vega', 'supervisor2@email.com', '23456788', '1986-09-21', '1133445577', 'Supervisor', 'ESTANDAR', 0],
      ['lector', 'Luis', 'Martinez', 'lector@email.com', '34567890', '1988-07-22', '1144556677', 'Lector', 'ESTANDAR', 0],
      ['lector2', 'Elena', 'Sosa', 'lector2@email.com', '34567891', '1990-12-05', '1144556688', 'Lector', 'ESTANDAR', 0],
      ['cliente1', 'Juan', 'Perez', 'juan.perez@email.com', '12345678', '1995-05-15', '1122334455', 'Cliente', 'VIP', 0.3],
      ['cliente2', 'Maria', 'Gomez', 'maria.gomez@email.com', '45678901', '1998-11-03', '1155667788', 'Cliente', 'ESTANDAR', 0],
      ['cliente3', 'Pedro', 'Ruiz', 'pedro.ruiz@email.com', '56789012', '1992-02-18', '1166778899', 'Cliente', 'PREMIUM', 0.15],
      ['cliente4', 'Lucia', 'Torres', 'lucia.torres@email.com', '30100001', '1994-06-09', '1150000001', 'Cliente', 'VIP', 0.3],
      ['cliente5', 'Mateo', 'Diaz', 'mateo.diaz@email.com', '30100002', '2000-01-27', '1150000002', 'Cliente', 'ESTANDAR', 0],
      ['cliente6', 'Sofia', 'Romero', 'sofia.romero@email.com', '30100003', '1997-08-14', '1150000003', 'Cliente', 'PREMIUM', 0.15]
    ];
    await Usuario.insertMany(usuariosSeed.map(([nombreUsuario, nombre, apellido, email, dni, nacimiento, telefono, rol, tipoCliente, porcentajeDescuento]) => ({
      nombreUsuario, nombre, apellido, email, dni, telefono, rol, tipoCliente, porcentajeDescuento,
      password: passwordHash,
      fechaNacimiento: new Date(nacimiento)
    })));
    console.log(`👥 ${usuariosSeed.length} usuarios de prueba cargados (contraseña: 123).`);

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

    // --- EVENTOS (funciones ficticias para la demo; al menos dos por categoría, ver categoriasDemo.js) ---
    // [artista, nombre, descripción, fecha, hora, sala, precio General, Platea, VIP, cupo (opcional)]
    const eventosSeed = [
      ['Salman Salem', 'Mazyoun y Thabya', 'Obra de teatro protagonizada por Salman Salem.', '2026-11-20', '20:30', salaTeatro, 18000, 25000, 32000],
      ['Starbugs Comedy', 'Starbugs Comedy en Vivo', 'Humor físico, música y coreografías en una noche para reírse sin parar.', '2026-11-28', '22:30', salaTeatro, 24000, 32000, 45000],
      ['Beyond Experience', 'Beyond Van Gogh: Experiencia Inmersiva', 'Las obras de Van Gogh proyectadas a gran escala en una muestra para recorrer.', '2026-12-06', '16:00', salaKonex, 12000, 12000, 18000],
      ['Beyond Experience', 'Beyond Monet: Experiencia Inmersiva', 'Los paisajes de Monet con proyecciones y sonido envolvente.', '2026-12-13', '17:00', salaKonex, 12000, 12000, 18000],
      ['Rokerijada', 'Festival Rokerijada', 'Una noche de rock al aire libre con varias bandas en vivo.', '2026-12-19', '18:00', salaKonex, 15000, 20000, 28000],
      ['Feria Nocturna', 'Noche de Comida Callejera', 'Puestos de comida, luces y música para recorrer de noche.', '2027-01-09', '19:00', salaKonex, 3000, 3000, 6000],
      ['Fundación Konex', 'Visita Guiada por la Ciudad Cultural', 'Un recorrido por las salas y el patio de la Ciudad Cultural Konex.', '2027-01-23', '18:30', salaKonex, 2500, 2500, 4000],
      ['Les Luthiers', 'Les Luthiers: Grandes Hitos', 'Humor y música con instrumentos informales en un repaso por sus obras más célebres.', '2026-11-27', '21:00', salaTeatro, 30000, 40000, 55000],
      ['Gustavo Cerati', 'Homenaje Sinfónico a Gustavo Cerati', 'Sus canciones en versión sinfónica con orquesta y músicos invitados.', '2026-12-04', '21:00', salaTeatro, 22000, 30000, 42000, 20],
      ['Cirque du Soleil', 'Cirque du Soleil: Toruk', 'Circo contemporáneo con escenografía y proyecciones monumentales.', '2026-12-05', '20:00', salaEstadio, 45000, 65000, 90000],
      ['Fundación Konex', 'Ciclo Konex: Noches en el Patio', 'Música en vivo al aire libre en el patio de la Ciudad Cultural.', '2026-12-12', '19:00', salaKonex, 8000, 12000, 16000, 20],
      ['Orquesta Sinfónica Nacional', 'Gran Concierto Sinfónico de Fin de Año', 'La Orquesta Sinfónica Nacional despide el año con obras clásicas.', '2026-12-28', '22:00', salaTeatro, 5000, 8000, 12000],
      ['Charly García', 'Charly García en Vivo', 'Un recorrido por los clásicos del rock nacional.', '2027-01-15', '21:30', salaEstadio, 35000, 50000, 80000],
      ['Bizarrap', 'Bizarrap Live Session', 'Show en vivo con invitados sorpresa y producción audiovisual.', '2027-02-06', '22:00', salaEstadio, 40000, 60000, 95000],
      ['Tini Stoessel', 'Tini en Concierto', 'Show con banda, bailarines y sus canciones más escuchadas.', '2027-02-20', '21:00', salaEstadio, 38000, 55000, 85000],
      ['Wos', 'Wos en Vivo', 'Rap y rock en vivo con banda completa.', '2027-03-06', '21:00', salaEstadio, 32000, 45000, 70000]
    ];

    let eventosCargados = 0;
    for (const [artista, nombre, descripcion, fecha, hora, sala, precio, precioPlatea, precioVIP, cupo] of eventosSeed) {
      if (!artistas[artista]) continue; // artista omitido por no tener foto
      eventosCargados++;
      await Evento.create({
        nombre, descripcion, hora, precio, precioPlatea, precioVIP,
        categoria: CATEGORIAS_DEMO[nombre],
        fecha: new Date(`${fecha}T${hora}`),
        entradasDisponibles: cupo || sala.capacidad,
        sala: sala._id,
        entidad: artistas[artista]._id
      });
    }

    console.log(`🎟️ ${eventosCargados} eventos cargados en 3 salas.`);

    // --- HISTORIAL DE VENTAS DE DEMOSTRACIÓN (para que el informe y la auditoría tengan datos) ---
    const clientes = await Usuario.find({ rol: 'Cliente' });
    const ventas = await generarVentasDemo({
      clientes,
      // Los eventos con poco cupo aparecen en "Se están agotando" del inicio
      casiAgotados: ['Homenaje Sinfónico a Gustavo Cerati', 'Ciclo Konex: Noches en el Patio'],
      cancelar: ['Beyond Monet: Experiencia Inmersiva', 'Charly García en Vivo']
    });
    console.log(`📈 Historial: ${ventas.transacciones} compras de la última semana, ${ventas.entradas} entradas y ${ventas.cancelaciones} cancelaciones.`);
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