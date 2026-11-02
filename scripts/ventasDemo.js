import mongoose from 'mongoose';
import crypto from 'crypto';
import Usuario from '../models/Usuario.js';
import Evento from '../models/Evento.js';
import Entrada from '../models/Entrada.js';
import Transaccion from '../models/Transaccion.js';
import CancelacionLog from '../models/CancelacionLog.js';

/**
 * Historial de ventas de DEMOSTRACIÓN para que el informe, el panel y la auditoría tengan datos.
 * Genera clientes, compras online y ventas de boletería de los últimos 45 días (y de hoy),
 * con descuentos y algunas cancelaciones. Todo queda consistente: se descuenta el cupo por sector,
 * cada entrada apunta a su transacción y cada cancelación deja su registro de auditoría.
 * Usa un generador aleatorio con semilla fija: cada `npm run seed` produce los mismos datos.
 */

// Generador pseudoaleatorio reproducible (mulberry32)
function crearAzar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NOMBRES = ['Lucía', 'Mateo', 'Valentina', 'Santiago', 'Martina', 'Benjamín', 'Sofía', 'Joaquín', 'Camila', 'Tomás', 'Julieta', 'Facundo', 'Agustina', 'Nicolás', 'Florencia', 'Lautaro', 'Micaela', 'Franco', 'Abril', 'Ignacio'];
const APELLIDOS = ['González', 'Rodríguez', 'Fernández', 'López', 'Martínez', 'Díaz', 'Pérez', 'Sánchez', 'Romero', 'Sosa', 'Álvarez', 'Torres', 'Ruiz', 'Ramírez', 'Flores', 'Acosta', 'Benítez', 'Medina', 'Herrera', 'Suárez'];
const PLANES = [['ESTANDAR', 0], ['ESTANDAR', 0], ['ESTANDAR', 0], ['PREMIUM', 0.15], ['VIP', 0.3]];

// Qué tan vendida está cada función (proporción del cupo, con tope de entradas por evento)
const DEMANDA = {
  'Les Luthiers: Grandes Hitos': 0.9,
  'Homenaje Sinfónico a Gustavo Cerati': 0.62,
  'Gran Concierto Sinfónico de Fin de Año': 0.35,
  'Ciclo Konex: Noches en el Patio': 0.22,
  'Cirque du Soleil: Toruk': 0.05,
  'Charly García en Vivo': 0.05,
  'Bizarrap Live Session': 0.045,
  'Tini en Concierto': 0.035,
  'Wos en Vivo': 0.025
};
const TOPE_ENTRADAS_POR_EVENTO = 460;
const OCUPACION_MAXIMA_SECTOR = 0.9; // siempre queda lugar para probar compras
const DIAS_DE_HISTORIAL = 45;
const DIA_MS = 24 * 60 * 60 * 1000;
const sinAcentos = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function generarVentasDemo({ passwordHash, clientesBase = [] }) {
  const azar = crearAzar(20261101);
  const entero = (min, max) => min + Math.floor(azar() * (max - min + 1));
  const elegir = (lista) => lista[Math.floor(azar() * lista.length)];

  // 1. Clientes de demostración (además de los usuarios de prueba)
  const nuevosClientes = NOMBRES.map((nombre, i) => {
    const apellido = APELLIDOS[(i * 7) % APELLIDOS.length];
    const [tipoCliente, porcentajeDescuento] = PLANES[i % PLANES.length];
    return {
      nombreUsuario: `${sinAcentos(nombre)}.${sinAcentos(apellido)}`.replace(/[^a-z.]/g, ''),
      nombre, apellido,
      email: `${sinAcentos(nombre)}.${sinAcentos(apellido)}${i}@demo.com`.replace(/[^a-z0-9.@]/g, ''),
      password: passwordHash,
      dni: String(30100000 + i * 3711),
      fechaNacimiento: new Date(1975 + (i % 25), i % 12, 1 + (i % 27)),
      telefono: String(1150000000 + i * 1234),
      rol: 'Cliente', tipoCliente, porcentajeDescuento
    };
  });
  const clientes = [...clientesBase, ...(await Usuario.insertMany(nuevosClientes))];

  // 2. Ventas por evento
  const ahora = new Date();
  const inicioHoy = new Date(ahora); inicioHoy.setHours(0, 0, 0, 0);
  const eventos = await Evento.find().populate('sala');
  const transacciones = [], entradas = [], cancelaciones = [];
  let comprobante = 0;

  for (const evento of eventos) {
    const zonas = evento.sala.zonas.toObject();
    const objetivo = Math.min(TOPE_ENTRADAS_POR_EVENTO, Math.round(evento.sala.capacidad * (DEMANDA[evento.nombre] ?? 0.1)));
    const vendidos = { General: 0, Platea: 0, VIP: 0 };
    let entradasVendidas = 0;
    let intentos = 0;

    while (entradasVendidas < objetivo && intentos++ < 2000) {
      const r = azar();
      const sector = r < 0.6 ? 'General' : r < 0.88 ? 'Platea' : 'VIP';
      const cantidad = entero(1, sector === 'VIP' ? 2 : 4);
      if (vendidos[sector] + cantidad > Math.floor(zonas[sector] * OCUPACION_MAXIMA_SECTOR)) continue;

      // Fecha: la mayoría en los últimos 45 días (más hacia el final) y algunas de hoy; nunca después de la función
      const esDeHoy = azar() < 0.022;
      const limite = Math.min(ahora.getTime(), evento.fecha.getTime() - DIA_MS);
      const fechaCompra = esDeHoy
        ? new Date(Math.min(limite, inicioHoy.getTime() + azar() * (ahora - inicioHoy)))
        : new Date(Math.min(limite, inicioHoy.getTime() - DIA_MS * 0.01) - Math.pow(azar(), 1.3) * (DIAS_DE_HISTORIAL - 1) * DIA_MS);

      const cliente = elegir(clientes);
      const enSucursal = azar() < 0.22;
      const precio = evento.precioDeZona(sector);
      const subtotal = precio * cantidad;
      const medioPago = enSucursal
        ? elegir(['Efectivo', 'Efectivo', 'Tarjeta POS', 'Transferencia Alias'])
        : elegir(['Tarjeta de Crédito', 'Tarjeta de Crédito', 'Tarjeta de Débito', 'Mercado Pago']);
      const tasa = enSucursal ? (medioPago === 'Efectivo' ? 0.25 : 0) : (cliente.porcentajeDescuento || 0);
      const descuentoAplicado = Number((subtotal * tasa).toFixed(2));
      const cancelada = !esDeHoy && azar() < 0.06;

      const transaccionId = new mongoose.Types.ObjectId();
      transacciones.push({
        _id: transaccionId,
        cliente: cliente._id,
        nombreCliente: enSucursal ? `${cliente.nombre} ${cliente.apellido} (Cajero: supervisor)` : cliente.nombreUsuario,
        items: [{ eventoId: evento._id, nombreEvento: evento.nombre, tipoEntrada: sector, cantidad, cantidadCancelada: cancelada ? cantidad : 0, precio }],
        subtotal, descuentoAplicado,
        total: Number((subtotal - descuentoAplicado).toFixed(2)),
        medioPago,
        tarjetaUltimosDigitos: enSucursal ? undefined : String(entero(1000, 9999)),
        canal: enSucursal ? 'Sucursal' : 'Online',
        comprobanteId: `${enSucursal ? 'SUC' : 'REC'}-DEMO-${String(++comprobante).padStart(5, '0')}`,
        fechaCompra
      });

      const codigoBoleto = 'TICK-' + crypto.randomBytes(5).toString('hex').toUpperCase();
      if (cancelada) {
        // La entrada se canceló después: no ocupa cupo, queda en estado 'Cancelada' (nada se borra)
        // y deja su registro de auditoría
        const fechaCancelacion = new Date(Math.min(limite, fechaCompra.getTime() + azar() * 5 * DIA_MS));
        cancelaciones.push({
          cliente: cliente._id, evento: evento._id, nombreCliente: cliente.nombreUsuario,
          eventoNombre: evento.nombre, codigoBoleto, cantidad, fechaCancelacion,
          createdAt: fechaCompra, updatedAt: fechaCompra
        });
        entradas.push({
          cliente: cliente._id, evento: evento._id, transaccion: transaccionId, nombre: evento.nombre,
          precio, cantidad, sector, codigoBoleto, estado: 'Cancelada', usadaEn: null, validadaPor: null,
          canceladaEn: fechaCancelacion, canceladaPor: cliente.nombreUsuario,
          fila: 'Fila Única', asiento: 'General', createdAt: fechaCompra, updatedAt: fechaCancelacion
        });
        continue;
      }

      vendidos[sector] += cantidad;
      entradasVendidas += cantidad;
      entradas.push({
        cliente: cliente._id, evento: evento._id, transaccion: transaccionId, nombre: evento.nombre,
        precio, cantidad, sector, codigoBoleto, estado: 'Completado', usadaEn: null, validadaPor: null,
        fila: 'Fila Única', asiento: 'General', createdAt: fechaCompra, updatedAt: fechaCompra
      });
    }

    // Cupo actualizado del evento (lo vendido sale del stock y queda registrado por sector)
    await Evento.updateOne({ _id: evento._id }, {
      $set: { vendidosPorZona: vendidos },
      $inc: { entradasDisponibles: -entradasVendidas }
    });
  }

  // Inserción en bloque: se validan con el esquema y se respetan las fechas históricas
  await Transaccion.insertMany(transacciones);
  await Entrada.insertMany(entradas, { timestamps: false });
  await CancelacionLog.insertMany(cancelaciones, { timestamps: false });

  return { clientes: nuevosClientes.length, transacciones: transacciones.length, entradas: entradas.length, cancelaciones: cancelaciones.length };
}
