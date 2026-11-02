// Completa la categoría de los eventos de demostración que todavía no tienen una.
// No borra nada ni pisa una categoría ya elegida. Uso: npm run categorias
import mongoose from 'mongoose';
import config from '../config/config.js';
import { CATEGORIAS_DEMO } from './categoriasDemo.js';

await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 20000 });
const eventos = mongoose.connection.db.collection('eventos');

let actualizados = 0;
for (const [nombre, categoria] of Object.entries(CATEGORIAS_DEMO)) {
  const resultado = await eventos.updateMany({ nombre, categoria: { $exists: false } }, { $set: { categoria } });
  actualizados += resultado.modifiedCount;
}

console.log(`Categorías asignadas: ${actualizados} evento(s).`);
await mongoose.disconnect();
