// Genera PNG de prueba sin dependencias (zlib de Node): un fondo con una silueta circular
import zlib from 'node:zlib';

const crcTabla = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTabla[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
const bloque = (tipo, datos) => {
  const largo = Buffer.alloc(4); largo.writeUInt32BE(datos.length);
  const td = Buffer.concat([Buffer.from(tipo), datos]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([largo, td, crc]);
};

export function generarPNG(ancho = 600, alto = 400, semilla = 0) {
  const filas = [];
  for (let y = 0; y < alto; y++) {
    const fila = Buffer.alloc(1 + ancho * 3);
    for (let x = 0; x < ancho; x++) {
      // Fondo con luces de escenario + silueta (cabeza y hombros)
      const luz = Math.max(0, 1 - Math.hypot(x - ancho * (0.3 + semilla * 0.2), y) / (alto * 1.1));
      const cabeza = Math.hypot(x - ancho / 2, y - alto * 0.42) < alto * 0.16;
      const hombros = y > alto * 0.62 && Math.abs(x - ancho / 2) < (y - alto * 0.5) * 1.3;
      const silueta = cabeza || hombros;
      const base = silueta ? 25 : 60 + luz * 190;
      const i = 1 + x * 3;
      fila[i] = Math.min(255, base + (semilla ? 30 : 60) * luz);
      fila[i + 1] = Math.min(255, base * (semilla ? 0.7 : 0.9));
      fila[i + 2] = Math.min(255, base + (semilla ? 70 : 20));
    }
    filas.push(fila);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloque('IHDR', ihdr),
    bloque('IDAT', zlib.deflateSync(Buffer.concat(filas))),
    bloque('IEND', Buffer.alloc(0))
  ]);
}
