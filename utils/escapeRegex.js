// Escapa caracteres especiales para usar texto del usuario dentro de una RegExp / $regex
export const escapeRegex = (text) => text ? String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';
