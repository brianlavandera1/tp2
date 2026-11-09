// Reemplaza solo la llamada HTTP a Google: el SDK real corre completo.
const original = globalThis.fetch;
globalThis.fetch = async (url, op) => {
  if (!String(url).includes('generativelanguage.googleapis.com')) return original(url, op);
  const cuerpo = JSON.parse(op.body);
  const pregunta = cuerpo.contents[0].parts[0].text;
  const sistema = cuerpo.systemInstruction?.parts?.[0]?.text || '';
  if (pregunta.includes('FALLA')) return new Response(JSON.stringify({ error: { code: 429, message: 'cuota' } }), { status: 429, headers: { 'content-type': 'application/json' } });
  await new Promise(r => setTimeout(r, 300));
  const texto = `eco[${pregunta}] modelo[${String(url).match(/models\/([^:]+)/)[1]}] contexto[${sistema.includes('Urbana Cult') ? 'si' : 'no'}]`;
  return new Response(JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: texto }] }, finishReason: 'STOP' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
};
