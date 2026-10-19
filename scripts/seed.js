import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcrypt';

import Usuario from '../models/Usuario.js';
import Sala from '../models/Sala.js';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';
import Entidad from '../models/Entidad.js'; 

const __filename = fileURLToPath(import.meta.url);

async function conectarBaseDeDatos() {
  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/TP2');
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

    console.log('🧹 Base de datos limpiada.');

    const entidadesSeed = [
      { nombre: 'Fuerza Bruta' },
      { nombre: 'Cirque du Soleil' },
      { nombre: 'Orquesta Sinfónica Nacional' },
      { nombre: 'Les Luthiers' },
      { nombre: 'Fundación Konex' },
      { nombre: 'Charly García' },
      { nombre: 'Gustavo Cerati' },
      { nombre: 'Bizarrap' },
      { nombre: 'Tini Stoessel' },
      { nombre: 'Wos' }
    ];

    const entidadesGuardadas = [];
    for (const ent of entidadesSeed) {
      const encontrada = await Entidad.findOneAndUpdate(
        { nombre: ent.nombre },
        { $set: ent },
        { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
      );
      entidadesGuardadas.push(encontrada);
    }
    console.log(`🎭 ${entidadesGuardadas.length} entidades culturales cargadas con éxito.`);

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

    const salaTeatro = await Sala.findOneAndUpdate(
      { nombre: 'Teatro Gran Rex' },
      {
        nombre: 'Teatro Gran Rex',
        descripcion: 'Sala clásica céntrica',
        capacidad: 500,
        zonas: { General: 300, Platea: 150, VIP: 50 },
        ubicacion: 'Centro Histórico'
      },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    );

    // --- EVENTOS CON MÚLTIPLES FECHAS ---
    const eventoCultural1 = await Evento.create({
      nombre: 'Espectáculo Visual - Wayra',
      descripcion: 'Experiencia inmersiva 360 (Función Viernes)',
      fecha: new Date('2026-11-10T21:00:00'),
      hora: '21:00',
      precio: 8500,
      entradasDisponibles: 195,
      sala: salaTeatro._id,
      entidad: entidadesGuardadas[0]._id 
    });

    const eventoCultural2 = await Evento.create({
      nombre: 'Espectáculo Visual - Wayra',
      descripcion: 'Experiencia inmersiva 360 (Función Sábado)',
      fecha: new Date('2026-11-11T20:30:00'),
      hora: '20:30',
      precio: 9000,
      entradasDisponibles: 200,
      sala: salaTeatro._id,
      entidad: entidadesGuardadas[0]._id 
    });

    const eventoMusica = await Evento.create({
      nombre: 'Gran Concierto Sinfónico',
      descripcion: 'Show en vivo con orquesta completa',
      fecha: new Date('2026-12-28T22:00:00'),
      hora: '22:00',
      precio: 5000,
      entradasDisponibles: 116,
      sala: salaTeatro._id,
      entidad: entidadesGuardadas[2]._id 
    });

    console.log('🎟️ Eventos con múltiples fechas y datos cargados con éxito.');
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