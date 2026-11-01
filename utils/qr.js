import QRCode from 'qrcode';

// URL que codifica el QR de cada entrada: al escanearla, el personal abre la pantalla de validación
export const urlValidacion = (req, codigoBoleto) =>
  `${req.protocol}://${req.get('host')}/admin/validar/${encodeURIComponent(codigoBoleto)}`;

// Genera el QR como SVG (texto) para insertarlo directo en la vista, sin archivos ni servicios externos
export const generarQR = (texto) => QRCode.toString(texto, {
  type: 'svg',
  margin: 1,
  errorCorrectionLevel: 'M',
  color: { dark: '#12101f', light: '#ffffff' }
});
