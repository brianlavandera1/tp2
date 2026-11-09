// Corre todas las pruebas automáticas: `npm test`.
//
// IMPORTANTE: cada prueba borra y vuelve a cargar la base con el seed. Por eso la conexión está
// fija acá en una base local exclusiva de pruebas y NO se puede configurar: nunca toca MongoDB Atlas.
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import mongoose from 'mongoose';

const CARPETA = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.dirname(CARPETA);
const BASE_DE_PRUEBAS = 'mongodb://127.0.0.1:27017/TP2_pruebas';
const STUB_GEMINI = pathToFileURL(path.join(CARPETA, 'stub-gemini.mjs')).href;

const entornoComun = {
  ...process.env,
  MONGODB_URI: BASE_DE_PRUEBAS,
  PORT: '3998',
  NODE_ENV: 'development',
  SESSION_SECRET: 'clave-solo-para-las-pruebas-automaticas',
  JWT_SECRET: 'clave-jwt-solo-para-las-pruebas-automaticas',
  GEMINI_MODEL: 'gemini-flash-lite-latest'
};

// [nombre, archivo, argumentos, clave de Gemini (simulada)]
const PRUEBAS = [
  ['Funcionamiento general', 'general.mjs', [], ''],
  ['Informes y carrito', 'informes.mjs', [], ''],
  ['Fotos de artistas', 'fotos.mjs', [], ''],
  ['Mejoras del sitio', 'mejoras.mjs', [], ''],
  ['Seguridad', 'seguridad.mjs', [], ''],
  ['Auditoría y roles', 'auditoria.mjs', [], ''],
  ['Exportación a Excel', 'excel.mjs', [], ''],
  ['Chat con Gemini', 'socket-chat.cjs', ['con-clave'], 'clave-simulada'],
  ['Chat sin clave de Gemini', 'socket-chat.cjs', ['sin-clave'], ''],
  ['Contador por rol', 'socket-contador.cjs', [], ''],
  ['Chat por rol', 'socket-chat-roles.cjs', [], ''],
  ['Visitas: privacidad y límites', 'socket-visitas.cjs', [], 'clave-simulada'],
  ['Cierre de sesión simultáneo', 'socket-cierre-sesion.cjs', [], 'clave-simulada']
];

const hayMongoLocal = () => new Promise((resolver) => {
  const conexion = net.connect(27017, '127.0.0.1');
  conexion.setTimeout(1500);
  conexion.once('connect', () => { conexion.destroy(); resolver(true); });
  conexion.once('timeout', () => { conexion.destroy(); resolver(false); });
  conexion.once('error', () => resolver(false));
});

const ejecutar = (argumentos, entorno) => new Promise((resolver) => {
  const proceso = spawn(process.execPath, argumentos, { cwd: RAIZ, env: entorno });
  let salida = '';
  proceso.stdout.on('data', (dato) => { salida += dato; });
  proceso.stderr.on('data', (dato) => { salida += dato; });
  proceso.on('close', (codigo) => resolver({ codigo, salida }));
});

const iniciarServidor = (entorno) => new Promise((resolver, rechazar) => {
  const servidor = spawn(process.execPath, ['--import', STUB_GEMINI, 'index.js'], { cwd: RAIZ, env: entorno });
  let salida = '';
  const limite = setTimeout(() => rechazar(new Error(`El servidor no arrancó:\n${salida}`)), 30000);
  const leer = (dato) => {
    salida += dato;
    if (salida.includes('Servidor corriendo')) { clearTimeout(limite); resolver(servidor); }
  };
  servidor.stdout.on('data', leer);
  servidor.stderr.on('data', leer);
});

const detener = (servidor) => new Promise((resolver) => {
  servidor.once('close', resolver);
  servidor.kill();
});

function resumir(salida, codigo) {
  const lineas = salida.trim().split(/\r?\n/);
  const fallas = lineas.filter((linea) => /^(FALLA|ERROR|SERVIDOR CAIDO)/.test(linea));
  const total = salida.match(/(\d+)\/(\d+) OK\s*$/);
  if (total) return { bien: total[1] === total[2] && codigo === 0, detalle: `${total[1]}/${total[2]}`, fallas };
  const comprobaciones = lineas.filter((linea) => /^OK\s/.test(linea)).length;
  return { bien: codigo === 0 && fallas.length === 0, detalle: comprobaciones ? `${comprobaciones} comprobaciones` : 'correcto', fallas };
}

// Dos ejecuciones a la vez se pisarían la base de pruebas. Este puerto hace de candado: el sistema
// lo libera solo cuando termina el proceso, incluso si se corta con Ctrl + C.
const candado = net.createServer();
await new Promise((resolver) => {
  candado.once('error', () => {
    console.error('❌ Ya hay otro npm test corriendo. Esperá a que termine, o cerralo, y volvé a intentar.');
    process.exit(1);
  });
  candado.listen(3997, '127.0.0.1', resolver);
});

if (!(await hayMongoLocal())) {
  console.error('❌ Las pruebas necesitan un MongoDB local en 127.0.0.1:27017 y no se encontró ninguno.');
  console.error('   Inicialo (por ejemplo, el servicio "MongoDB" de Windows) y volvé a correr npm test.');
  process.exit(1);
}

let hayFallas = false;
for (const [nombre, archivo, argumentos, claveGemini] of PRUEBAS) {
  const entorno = { ...entornoComun, GEMINI_API_KEY: claveGemini };
  const seed = await ejecutar([path.join('scripts', 'seed.js')], entorno);
  if (seed.codigo !== 0) { console.error(`❌ Falló el seed:\n${seed.salida}`); process.exit(1); }

  const servidor = await iniciarServidor(entorno);
  const { codigo, salida } = await ejecutar([path.join(CARPETA, archivo), ...argumentos], entorno);
  await detener(servidor);

  const { bien, detalle, fallas } = resumir(salida, codigo);
  console.log(`${bien ? '✅' : '❌'} ${nombre}: ${detalle}`);
  if (!bien) {
    hayFallas = true;
    (fallas.length ? fallas : [salida.slice(-800)]).forEach((falla) => console.log(`   ${falla}`));
  }
}

await mongoose.connect(BASE_DE_PRUEBAS);
await mongoose.connection.db.dropDatabase();
await mongoose.disconnect();

console.log(hayFallas ? '\n❌ Hay pruebas que fallaron.' : '\n✅ Todas las pruebas pasaron.');
process.exit(hayFallas ? 1 : 0);
