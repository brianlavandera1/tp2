import ExcelJS from 'exceljs';

// Argentina no tiene horario de verano. Excel no maneja zonas horarias: muestra la fecha tal cual se guarda,
// así que se corre a la hora local (el servidor puede estar en UTC, como en Vercel)
const DESFASE_ARGENTINA_MS = 3 * 60 * 60 * 1000;
export const fechaLocal = (fecha) => (fecha ? new Date(new Date(fecha).getTime() - DESFASE_ARGENTINA_MS) : null);

export const FORMATO_PLATA = '"$"#,##0';
export const FORMATO_FECHA = 'dd/mm/yyyy';
export const FORMATO_FECHA_HORA = 'dd/mm/yyyy hh:mm';

const COLOR_MARCA = 'FF5B3DF5';
const COLOR_TOTALES = 'FFEEEAFF';

/**
 * Agrega una hoja con encabezado de color, primera fila fija y filtros.
 * columnas: [{ titulo, clave, ancho, formato }] · filas: objetos con esas claves · totales: fila final opcional
 */
function agregarHoja(libro, { nombre, columnas, filas, totales }) {
  const hoja = libro.addWorksheet(nombre, { views: [{ state: 'frozen', ySplit: 1 }] });
  hoja.columns = columnas.map(c => ({ header: c.titulo, key: c.clave, width: c.ancho || 16, style: c.formato ? { numFmt: c.formato } : {} }));

  const encabezado = hoja.getRow(1);
  encabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  encabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_MARCA } };
  encabezado.alignment = { vertical: 'middle' };
  encabezado.height = 22;

  hoja.addRows(filas);
  if (filas.length) hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: filas.length + 1, column: columnas.length } };

  // La fila de totales queda fuera del filtro, para que no se mezcle al ordenar
  if (totales) {
    const fila = hoja.addRow(totales);
    fila.font = { bold: true };
    fila.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_TOTALES } };
  }
}

// Arma el libro y lo envía como descarga. Se manda completo (con su tamaño) porque en Vercel
// la respuesta de una función no puede ir por partes indefinidamente
export async function enviarExcel(res, nombreArchivo, hojas) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'Urbana Cult';
  libro.created = new Date();
  hojas.forEach(hoja => agregarHoja(libro, hoja));

  const archivo = Buffer.from(await libro.xlsx.writeBuffer());
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'Content-Disposition': `attachment; filename="${nombreArchivo}"`,
    'Content-Length': archivo.length,
    'Cache-Control': 'no-store'
  });
  res.send(archivo);
}
