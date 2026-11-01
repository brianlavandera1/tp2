import multer from 'multer';
import { TIPOS_FOTO, TAMANO_MAXIMO_FOTO } from '../models/Entidad.js';

// La foto queda en memoria (req.file.buffer) y el controlador la guarda en MongoDB
const subida = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: TAMANO_MAXIMO_FOTO, files: 1 },
  fileFilter: (req, file, cb) => {
    if (TIPOS_FOTO.includes(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('La foto debe ser JPG, PNG o WEBP.'), { status: 400 }));
  }
});

/**
 * Procesa un formulario multipart con un campo de archivo opcional.
 * Si la foto no es válida vuelve a `rutaError` con el mensaje, en lugar de cortar con un 500.
 */
const subirFoto = (campo, rutaError) => (req, res, next) => {
  subida.single(campo)(req, res, (error) => {
    if (!error) return next();
    const mensaje = error.code === 'LIMIT_FILE_SIZE'
      ? 'La foto no puede superar los 2 MB.'
      : error.message || 'No se pudo procesar la foto.';
    res.redirect(`${rutaError}?error=${encodeURIComponent(mensaje)}`);
  });
};

export default subirFoto;
