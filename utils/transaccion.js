import mongoose from 'mongoose';

// null = todavía no se detectó; true = replica set / Atlas; false = servidor standalone
let soportaTransacciones = null;

// Las transacciones de MongoDB necesitan un replica set (Atlas lo es); en un mongod local se compensa a mano.
export async function detectarTransacciones() {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  soportaTransacciones = Boolean(hello.setName || hello.msg === 'isdbgrid');
  return soportaTransacciones;
}

// Ejecuta `trabajo(ctx)` de forma atómica. Con transacción nativa, un error descarta todo;
// sin ella, se ejecutan en orden inverso los pasos registrados con ctx.alDeshacer.
export async function conTransaccion(trabajo) {
  if (soportaTransacciones === null) await detectarTransacciones();
  const compensaciones = [];
  const ctx = { session: null, alDeshacer: fn => compensaciones.push(fn) };

  if (soportaTransacciones) {
    const session = await mongoose.startSession();
    try {
      let resultado;
      // withTransaction reintenta solo ante errores transitorios (por ejemplo, conflictos de escritura)
      await session.withTransaction(async () => {
        compensaciones.length = 0;
        ctx.session = session;
        resultado = await trabajo(ctx);
      });
      return resultado;
    } finally {
      await session.endSession();
    }
  }

  try {
    return await trabajo(ctx);
  } catch (error) {
    for (const deshacer of compensaciones.reverse()) {
      try {
        await deshacer();
      } catch (errorAlDeshacer) {
        console.error('❌ No se pudo revertir un paso de la operación:', errorAlDeshacer);
      }
    }
    throw error;
  }
}
