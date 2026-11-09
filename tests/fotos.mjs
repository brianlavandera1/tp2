// Pruebas de fotos de artistas (servidor en :3998, base TP2_pruebas)
import mongoose from 'mongoose';
import { generarPNG } from './png.mjs';
const BASE = 'http://localhost:3998';
const res = [];
const ok = (n, c, x = '') => res.push([c ? 'OK  ' : 'FALLA', n, x]);

function cliente() {
  let cookie = '';
  return async (path, { method = 'GET', form, multipart, accept = 'text/html' } = {}) => {
    const headers = { Accept: accept };
    if (cookie) headers.Cookie = cookie;
    let body;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; body = new URLSearchParams(form).toString(); }
    if (multipart) body = multipart;
    const r = await fetch(BASE + path, { method, headers, body, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const buf = Buffer.from(await r.arrayBuffer());
    return { status: r.status, location: r.headers.get('location') || '', tipo: r.headers.get('content-type'), buf, text: buf.toString() };
  };
}
const formulario = (campos, archivo) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(campos)) fd.append(k, v);
  if (archivo) fd.append('foto', new Blob([archivo.datos], { type: archivo.tipo }), archivo.nombre);
  return fd;
};

await mongoose.connect('mongodb://127.0.0.1:27017/TP2_pruebas');
const db = mongoose.connection.db;
const png = generarPNG(600, 400, 0);

const a = cliente(); await a('/auth/login', { method: 'POST', form: { identificador: 'admin', password: '123' } });

// Alta con foto válida
const alta = await a('/admin/entidades/crear', { method: 'POST', multipart: formulario({ nombre: 'Artista Foto' }, { datos: png, tipo: 'image/png', nombre: 'a.png' }) });
ok('alta con foto redirige con éxito', alta.status === 302 && alta.location.includes('exito'), alta.location);
const ent = await db.collection('entidades').findOne({ nombre: 'Artista Foto' });
ok('la foto queda guardada en MongoDB', !!ent?.foto?.data && ent.foto.contentType === 'image/png' && !!ent.fotoActualizada);

const foto = await a('/media/artistas/' + ent._id);
ok('GET /media/artistas/:id devuelve la imagen', foto.status === 200 && foto.tipo === 'image/png' && foto.buf.equals(png), `${foto.status} ${foto.tipo} ${foto.buf.length}b`);

// Validaciones
const falsa = await a('/admin/entidades/crear', { method: 'POST', multipart: formulario({ nombre: 'Falso PNG' }, { datos: Buffer.from('<script>alert(1)</script> no soy una imagen'), tipo: 'image/png', nombre: 'x.png' }) });
ok('archivo disfrazado de PNG es rechazado', falsa.location.includes('error') && !(await db.collection('entidades').findOne({ nombre: 'Falso PNG' })), decodeURIComponent(falsa.location));
const gif = await a('/admin/entidades/crear', { method: 'POST', multipart: formulario({ nombre: 'Gif' }, { datos: Buffer.from('GIF89a........'), tipo: 'image/gif', nombre: 'x.gif' }) });
ok('formato no permitido (GIF) es rechazado', gif.location.includes('error') && decodeURIComponent(gif.location).includes('JPG, PNG o WEBP'), decodeURIComponent(gif.location));
const grande = await a('/admin/entidades/crear', { method: 'POST', multipart: formulario({ nombre: 'Grande' }, { datos: Buffer.concat([png, Buffer.alloc(2.5 * 1024 * 1024)]), tipo: 'image/png', nombre: 'g.png' }) });
ok('foto de más de 2 MB es rechazada', decodeURIComponent(grande.location).includes('2 MB'), decodeURIComponent(grande.location));
const sinFoto = await a('/admin/entidades/crear', { method: 'POST', multipart: formulario({ nombre: 'Sin Foto' }) });
ok('alta sin foto sigue funcionando', sinFoto.location.includes('exito'));

// Permisos
const l = cliente(); await l('/auth/login', { method: 'POST', form: { identificador: 'lector', password: '123' } });
ok('Lector no puede subir fotos (403)', (await l('/admin/entidades/crear', { method: 'POST', multipart: formulario({ nombre: 'X' }, { datos: png, tipo: 'image/png', nombre: 'a.png' }) })).status === 403);
const anon = cliente();
ok('la foto se ve sin sesión (la cartelera es pública)', (await anon('/media/artistas/' + ent._id)).status === 200);
ok('id inválido devuelve 404', (await a('/media/artistas/no-es-un-id')).status === 404);

// Listado del panel: muestra la foto y no carga los bytes en la página
const panel = await a('/admin/entidades');
ok('el panel muestra la miniatura', panel.text.includes(`/media/artistas/${ent._id}?v=`));

// Cartelera: asignamos el artista a un evento y verificamos portada y destacado
const ev = await db.collection('eventos').findOne({});
await db.collection('eventos').updateOne({ _id: ev._id }, { $set: { entidad: ent._id } });
const c = cliente(); await c('/auth/login', { method: 'POST', form: { identificador: 'cliente1', password: '123' } });
const cartelera = await c('/cliente/comprar');
ok('tarjeta del evento con la foto de fondo', cartelera.text.includes(`--foto:url('/media/artistas/${ent._id}?v=`) && cartelera.text.includes('portada-foto'));
ok('portada de la cartelera con artista destacado', cartelera.text.includes('hero con-foto') && cartelera.text.includes('Destacado: Artista Foto'));
ok('el cliente puede ver la foto', (await c('/media/artistas/' + ent._id)).status === 200);

// Edición: cambiar nombre conserva la foto; quitar foto la borra
await a(`/admin/entidades/editar/${ent._id}`, { method: 'POST', multipart: formulario({ nombre: 'Artista Renombrado' }) });
const renombrado = await db.collection('entidades').findOne({ _id: ent._id });
ok('editar solo el nombre conserva la foto', renombrado.nombre === 'Artista Renombrado' && !!renombrado.foto);
const png2 = generarPNG(300, 200, 1);
await a(`/admin/entidades/editar/${ent._id}`, { method: 'POST', multipart: formulario({ nombre: 'Artista Renombrado' }, { datos: png2, tipo: 'image/png', nombre: 'b.png' }) });
ok('reemplazar la foto', (await a('/media/artistas/' + ent._id)).buf.equals(png2));
await a(`/admin/entidades/editar/${ent._id}`, { method: 'POST', multipart: formulario({ nombre: 'Artista Renombrado', quitarFoto: '1' }) });
const sinFotoAhora = await db.collection('entidades').findOne({ _id: ent._id });
ok('quitar foto la elimina de la base', !sinFotoAhora.foto && sinFotoAhora.fotoActualizada === null);
ok('después de quitarla, la URL devuelve 404', (await a('/media/artistas/' + ent._id)).status === 404);
ok('la cartelera vuelve al degradé sin foto', !(await c('/cliente/comprar')).text.includes(`/media/artistas/${ent._id}`));

await mongoose.disconnect();
for (const [e, n, x] of res) console.log(e, n, x ? '— ' + x : '');
console.log(`\n${res.filter(r => r[0] === 'OK  ').length}/${res.length} OK`);
