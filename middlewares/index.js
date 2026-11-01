// Punto de entrada único de los middlewares generales de la aplicación
import requestLogger from './logger.middleware.js';
import { notFoundHandler, errorHandler } from './errorHandler.middleware.js';
import asyncHandler from './asyncHandler.middleware.js';

export {
  requestLogger,
  notFoundHandler,
  errorHandler,
  asyncHandler
};
