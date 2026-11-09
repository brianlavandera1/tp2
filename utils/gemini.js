import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';
import config from '../config/config.js';

// El comportamiento del asistente se define en un archivo de texto, sin tocar el código
const contexto = fs.readFileSync(new URL('../config/asistente.txt', import.meta.url), 'utf8');

// El modelo se inicializa una sola vez, al arrancar el servidor. Sin clave, el chat funciona igual, sin asistente.
const modelo = config.geminiApiKey
  ? new GoogleGenerativeAI(config.geminiApiKey).getGenerativeModel(
    { model: config.geminiModelo, systemInstruction: contexto },
    { timeout: 30000 }
  )
  : null;

export const iaDisponible = Boolean(modelo);

export async function consultarIA(pregunta) {
  const resultado = await modelo.generateContent(pregunta);
  return resultado.response.text().trim();
}
