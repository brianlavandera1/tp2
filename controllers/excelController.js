import Transaccion from '../models/Transaccion.js';
import { construirFiltroPagos } from './adminController.js';
import { calcularInforme } from './entradasController.js';
import { enviarExcel, fechaLocal, FORMATO_PLATA, FORMATO_FECHA, FORMATO_FECHA_HORA } from '../utils/excel.js';

// Tope de compras por archivo: evita agotar la memoria y el límite de respuesta del hosting
const MAXIMO_COMPRAS = 20000;

const hoyTexto = () => fechaLocal(new Date()).toISOString().slice(0, 10);
const textoQuery = (valor) => (typeof valor === 'string' ? valor : '');
const fechaQuery = (valor) => (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : '');

// GET /admin/pagos/excel — las mismas compras que se ven en pantalla (con su búsqueda y filtro), sin paginar.
// Nunca se exportan datos de tarjeta
export const descargarPagosExcel = async (req, res) => {
  const query = await construirFiltroPagos({ busqueda: textoQuery(req.query.busqueda), filtro: textoQuery(req.query.filtro) });
  const compras = await Transaccion.find(query)
    .select('-tarjetaUltimosDigitos').sort({ fechaCompra: -1 }).limit(MAXIMO_COMPRAS).lean();

  const cuenta = (compra, campo) => compra.items.reduce((suma, item) => suma + (item[campo] || 0), 0);
  const filasCompras = compras.map(compra => ({
    comprobante: compra.comprobanteId,
    fecha: fechaLocal(compra.fechaCompra),
    cliente: compra.nombreCliente,
    canal: compra.canal || 'Online',
    medioPago: compra.medioPago,
    eventos: [...new Set(compra.items.map(item => item.nombreEvento))].join(', '),
    entradas: cuenta(compra, 'cantidad'),
    canceladas: cuenta(compra, 'cantidadCancelada'),
    subtotal: compra.subtotal,
    descuento: compra.descuentoAplicado || 0,
    total: compra.total
  }));
  const sumar = (campo) => filasCompras.reduce((suma, fila) => suma + fila[campo], 0);

  const filasDetalle = compras.flatMap(compra => compra.items.map(item => ({
    comprobante: compra.comprobanteId,
    fecha: fechaLocal(compra.fechaCompra),
    cliente: compra.nombreCliente,
    evento: item.nombreEvento,
    sector: item.tipoEntrada,
    cantidad: item.cantidad,
    canceladas: item.cantidadCancelada || 0,
    precio: item.precio
  })));

  await enviarExcel(res, `pagos-${hoyTexto()}.xlsx`, [
    {
      nombre: 'Compras',
      columnas: [
        { titulo: 'Comprobante', clave: 'comprobante', ancho: 20 },
        { titulo: 'Fecha', clave: 'fecha', ancho: 18, formato: FORMATO_FECHA_HORA },
        { titulo: 'Cliente', clave: 'cliente', ancho: 26 },
        { titulo: 'Canal', clave: 'canal', ancho: 11 },
        { titulo: 'Medio de pago', clave: 'medioPago', ancho: 18 },
        { titulo: 'Eventos', clave: 'eventos', ancho: 42 },
        { titulo: 'Entradas', clave: 'entradas', ancho: 10 },
        { titulo: 'Canceladas', clave: 'canceladas', ancho: 12 },
        { titulo: 'Subtotal', clave: 'subtotal', ancho: 14, formato: FORMATO_PLATA },
        { titulo: 'Descuento', clave: 'descuento', ancho: 14, formato: FORMATO_PLATA },
        { titulo: 'Total', clave: 'total', ancho: 14, formato: FORMATO_PLATA }
      ],
      filas: filasCompras,
      totales: {
        comprobante: 'TOTAL', entradas: sumar('entradas'), canceladas: sumar('canceladas'),
        subtotal: sumar('subtotal'), descuento: sumar('descuento'), total: sumar('total')
      }
    },
    {
      nombre: 'Detalle por evento',
      columnas: [
        { titulo: 'Comprobante', clave: 'comprobante', ancho: 20 },
        { titulo: 'Fecha', clave: 'fecha', ancho: 18, formato: FORMATO_FECHA_HORA },
        { titulo: 'Cliente', clave: 'cliente', ancho: 26 },
        { titulo: 'Evento', clave: 'evento', ancho: 40 },
        { titulo: 'Sector', clave: 'sector', ancho: 11 },
        { titulo: 'Cantidad', clave: 'cantidad', ancho: 10 },
        { titulo: 'Canceladas', clave: 'canceladas', ancho: 12 },
        { titulo: 'Precio unitario', clave: 'precio', ancho: 15, formato: FORMATO_PLATA }
      ],
      filas: filasDetalle
    }
  ]);
};

// GET /admin/informe/excel — el informe de ventas de la pantalla, con el período elegido
export const descargarInformeExcel = async (req, res) => {
  const fechaInicio = fechaQuery(req.query.fechaInicio);
  const fechaFin = fechaQuery(req.query.fechaFin);
  const { resumen, eventos, porCanal, porSector, ventasPorDia } = await calcularInforme({ fechaInicio, fechaFin });

  const periodo = fechaInicio || fechaFin ? `${fechaInicio || 'inicio'} a ${fechaFin || 'hoy'}` : 'Histórico completo';
  const columnasDesglose = (titulo) => [
    { titulo, clave: 'nombre', ancho: 18 },
    { titulo: 'Operaciones', clave: 'operaciones', ancho: 13 },
    { titulo: 'Entradas vendidas', clave: 'vendidas', ancho: 18 },
    { titulo: 'Recaudación', clave: 'recaudado', ancho: 16, formato: FORMATO_PLATA }
  ];
  const filasDesglose = (filas) => filas.map(f => ({ nombre: f._id, operaciones: f.operaciones, vendidas: f.vendidas, recaudado: f.recaudado }));

  await enviarExcel(res, `informe-ventas-${hoyTexto()}.xlsx`, [
    {
      nombre: 'Resumen',
      columnas: [{ titulo: 'Dato', clave: 'dato', ancho: 24 }, { titulo: 'Valor', clave: 'valor', ancho: 24 }],
      filas: [
        { dato: 'Período', valor: periodo },
        { dato: 'Operaciones', valor: resumen.totalTransacciones },
        { dato: 'Entradas vendidas', valor: resumen.totalVendidas },
        { dato: 'Recaudación neta', valor: `$${Math.round(resumen.totalRecaudado).toLocaleString('es-AR')}` }
      ]
    },
    {
      nombre: 'Por evento',
      columnas: [
        { titulo: 'Evento', clave: 'nombre', ancho: 42 },
        { titulo: 'Sala', clave: 'sala', ancho: 26 },
        { titulo: 'Cupo', clave: 'cupo', ancho: 10 },
        { titulo: 'Vendidas', clave: 'vendidas', ancho: 10 },
        { titulo: 'Disponibles', clave: 'disponibles', ancho: 12 },
        { titulo: 'Ocupación', clave: 'ocupacion', ancho: 11, formato: '0%' },
        { titulo: 'Recaudación', clave: 'recaudado', ancho: 16, formato: FORMATO_PLATA }
      ],
      filas: eventos.map(e => ({ ...e, ocupacion: e.porcentaje / 100 })),
      totales: { nombre: 'TOTAL', vendidas: resumen.totalVendidas, recaudado: Math.round(resumen.totalRecaudado) }
    },
    {
      nombre: 'Por día',
      columnas: [
        { titulo: 'Día', clave: 'dia', ancho: 14, formato: FORMATO_FECHA },
        { titulo: 'Entradas vendidas', clave: 'vendidas', ancho: 18 },
        { titulo: 'Recaudación', clave: 'recaudado', ancho: 16, formato: FORMATO_PLATA }
      ],
      // Días calendario: se guardan en UTC para que Excel muestre ese mismo día
      filas: ventasPorDia.map(d => ({
        dia: new Date(Date.UTC(d.fecha.getFullYear(), d.fecha.getMonth(), d.fecha.getDate())),
        vendidas: d.vendidas,
        recaudado: d.recaudado
      }))
    },
    { nombre: 'Por canal', columnas: columnasDesglose('Canal'), filas: filasDesglose(porCanal) },
    { nombre: 'Por sector', columnas: columnasDesglose('Sector'), filas: filasDesglose(porSector) }
  ]);
};
