export const POR_PAGINA = 15;

/**
 * Consulta paginada genérica: cuenta el total y trae solo la página pedida (?pagina=N).
 * Devuelve los documentos y los datos que usa el mixin `paginacion` de las vistas.
 */
export async function paginar(modelo, filtro, req, { orden = { _id: -1 }, populate = null, porPagina = POR_PAGINA } = {}) {
  const total = await modelo.countDocuments(filtro);
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const pagina = Math.min(Math.max(1, parseInt(req.query.pagina, 10) || 1), totalPaginas);

  let consulta = modelo.find(filtro).sort(orden).skip((pagina - 1) * porPagina).limit(porPagina);
  if (populate) consulta = consulta.populate(populate);
  const docs = await consulta;

  // Los enlaces de página conservan la búsqueda y los filtros activos
  const params = new URLSearchParams(
    Object.entries(req.query).filter(([clave, valor]) => clave !== 'pagina' && typeof valor === 'string' && valor !== '')
  );
  const consultaBase = params.toString();

  return {
    docs,
    paginacion: {
      pagina,
      totalPaginas,
      total,
      desde: total ? (pagina - 1) * porPagina + 1 : 0,
      hasta: Math.min(pagina * porPagina, total),
      url: (n) => `${req.baseUrl}${req.path}?${consultaBase ? consultaBase + '&' : ''}pagina=${n}`
    }
  };
}
