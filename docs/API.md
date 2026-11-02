# API JSON de Urbana Cult

Además de las vistas web, el sistema expone una API JSON para consultar y administrar las **entradas** emitidas.

- **Base URL (local):** `http://localhost:3000`
- **Formato:** JSON (`Content-Type: application/json`). Para recibir errores en JSON enviá también `Accept: application/json`.
- **Autenticación:** con **JWT** (recomendado para la API): se pide un token en `POST /auth/token` y se envía en `Authorization: Bearer <token>`. También funciona la sesión web (cookie `connect.sid`).

---

## Autenticación

### `POST /auth/token` — JWT (recomendado para la API)

Devuelve un **JSON Web Token** firmado (HS256) que vence en 1 hora. El cuerpo puede ir en JSON o como formulario.

| Campo | Tipo | Descripción |
|---|---|---|
| `identificador` | string | Nombre de usuario o email |
| `password` | string | Contraseña |

```bash
curl -H "Content-Type: application/json" \
  -d '{"identificador":"admin","password":"123"}' \
  http://localhost:3000/auth/token
```

**200 OK**
```json
{ "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub21icmVVc3VhcmlvIjoiYWRtaW4i…", "tipo": "Bearer", "expiraEn": "1h" }
```

Contenido (payload) del token — se puede ver en [jwt.io](https://jwt.io), por eso **no lleva datos sensibles**:

```json
{
  "nombreUsuario": "admin",
  "rol": "Administrador",
  "sub": "6650f0aa…",
  "aud": "urbana-cult-api",
  "iss": "urbana-cult",
  "iat": 1793570000,
  "exp": 1793573600
}
```

Uso del token:

```bash
TOKEN=$(curl -s -H "Content-Type: application/json" -d '{"identificador":"admin","password":"123"}' http://localhost:3000/auth/token | node -pe "JSON.parse(require('fs').readFileSync(0)).token")
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/entradas
```

| Respuesta | Significado |
|---|---|
| `200` | Token emitido |
| `401` | `{ "error": "Usuario o contraseña incorrectos." }` |
| `429` | Demasiados intentos fallidos (5 en 15 minutos) |

Un token **vencido, adulterado, firmado con otra clave o emitido para otra audiencia** se rechaza con `401` y el encabezado `WWW-Authenticate: Bearer error="invalid_token"`:

```json
{ "error": "El token venció. Pedí uno nuevo." }
```

### `POST /auth/login` — sesión (formularios web)

Inicia sesión y devuelve la cookie de sesión. El cuerpo va como formulario (`application/x-www-form-urlencoded`).

| Campo | Tipo | Descripción |
|---|---|---|
| `identificador` | string | Nombre de usuario o email |
| `password` | string | Contraseña |

```bash
# Guarda la cookie de sesión en cookies.txt
curl -c cookies.txt -d "identificador=admin&password=123" http://localhost:3000/auth/login
```

| Respuesta | Significado |
|---|---|
| `302` → `/admin/dashboard` o `/cliente/menu` | Login correcto (según el rol) |
| `400` | Usuario o contraseña incorrectos |
| `429` | Demasiados intentos fallidos: se bloquea 15 minutos tras 5 errores |

### `GET /auth/logout`

Cierra la sesión (la borra de MongoDB y elimina la cookie).

---

## Entradas — `/entradas`

Todas las rutas requieren un **token** (`Authorization: Bearer <token>`) o una sesión iniciada. En los ejemplos se usa la cookie de sesión (`-b cookies.txt`); con JWT se reemplaza por `-H "Authorization: Bearer $TOKEN"`. Sin autenticación responden:

```json
{ "error": "Debes iniciar sesión." }
```
(`401 Unauthorized`)

### Modelo `Entrada`

| Campo | Tipo | Descripción |
|---|---|---|
| `_id` | ObjectId | Identificador |
| `codigoBoleto` | string | Código único (`TICK-` + 10 hexadecimales). Es lo que codifica el QR |
| `cliente` | ObjectId → Usuario | Titular |
| `evento` | ObjectId → Evento | Función |
| `transaccion` | ObjectId → Transaccion | Compra que la originó |
| `nombre` | string | Nombre del evento al momento de la compra |
| `sector` | `General` \| `Platea` \| `VIP` | Sector |
| `cantidad` | number (≥ 1) | Cantidad de personas |
| `precio` | number | Precio unitario |
| `fila`, `asiento` | string | Ubicación (por defecto `Fila Única` / `General`) |
| `estado` | `Completado` \| `Usado` | `Usado` cuando se validó en la puerta |
| `usadaEn`, `validadaPor` | date, string | Cuándo y quién la validó |
| `createdAt`, `updatedAt` | date | Marcas de tiempo |

---

### `GET /entradas`

Lista entradas. Un **cliente** recibe solo las propias; el **personal** recibe todas.
Del cliente solo se devuelven datos públicos (nunca la contraseña).

```bash
curl -b cookies.txt -H "Accept: application/json" http://localhost:3000/entradas
```

**200 OK**
```json
[
  {
    "_id": "6650f1c2a1b2c3d4e5f60718",
    "codigoBoleto": "TICK-5FB339F695",
    "cliente": { "_id": "6650f0aa…", "nombreUsuario": "cliente1", "nombre": "Juan", "apellido": "Perez", "email": "juan.perez@email.com" },
    "evento": { "_id": "6650f0bb…", "nombre": "Charly García en Vivo", "fecha": "2027-01-16T00:30:00.000Z", "hora": "21:30", "sala": "6650f0cc…" },
    "transaccion": "6650f1c2…",
    "nombre": "Charly García en Vivo",
    "sector": "VIP",
    "cantidad": 2,
    "precio": 80000,
    "estado": "Completado",
    "usadaEn": null
  }
]
```

### `GET /entradas/:id`

Devuelve una entrada. Un cliente solo puede ver las propias.

```bash
curl -b cookies.txt -H "Accept: application/json" http://localhost:3000/entradas/6650f1c2a1b2c3d4e5f60718
```

| Respuesta | Cuerpo |
|---|---|
| `200` | La entrada |
| `404` | `{ "error": "Entrada no encontrada." }` (no existe o es de otro cliente) |

### `POST /entradas` — solo Administrador

Emite una entrada manualmente. **Descuenta el cupo** del sector y toma el precio del evento (no se acepta precio en el cuerpo).

| Campo | Tipo | Obligatorio |
|---|---|---|
| `cliente` | ObjectId | Sí |
| `evento` | ObjectId | Sí |
| `sector` | `General` \| `Platea` \| `VIP` | No (por defecto `General`) |
| `cantidad` | number | No (por defecto 1) |

```bash
curl -b cookies.txt -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"cliente":"6650f0aa…","evento":"6650f0bb…","sector":"Platea","cantidad":2}' \
  http://localhost:3000/entradas
```

| Respuesta | Cuerpo |
|---|---|
| `201` | La entrada creada |
| `400` | `{ "error": "Faltan cliente o evento." }` o `{ "status": "error", "message": "Sin cupo en Platea." }` |
| `403` | `{ "error": "Permisos insuficientes." }` (no es Administrador) |

### `PUT /entradas/:id` — solo Administrador

Modifica datos que **no** afectan stock ni precio: `fila`, `asiento` y `estado`. Cualquier otro campo se ignora.

```bash
curl -X PUT -b cookies.txt -H "Content-Type: application/json" -H "Accept: application/json" \
  -d '{"fila":"F","asiento":"12"}' http://localhost:3000/entradas/6650f1c2a1b2c3d4e5f60718
```

| Respuesta | Cuerpo |
|---|---|
| `200` | La entrada actualizada |
| `404` | `{ "error": "Entrada no encontrada." }` |

### `DELETE /entradas/:id` — solo Administrador

Elimina la entrada, **devuelve el cupo** al evento y lo descuenta de la compra original para que los informes no la cuenten.

```bash
curl -X DELETE -b cookies.txt -H "Accept: application/json" http://localhost:3000/entradas/6650f1c2a1b2c3d4e5f60718
```

| Respuesta | Cuerpo |
|---|---|
| `200` | La entrada eliminada |
| `404` | `{ "error": "Entrada no encontrada." }` |

---

## Validación con QR — `/admin/validar` (Administrador y Supervisor)

El QR de cada entrada contiene la URL `/admin/validar/<codigoBoleto>`.

| Método y ruta | Descripción |
|---|---|
| `GET /admin/validar/:codigo` | Pantalla con los datos de la entrada y su estado (válida, ya usada o inexistente → `404`) |
| `POST /admin/validar/:codigo` | Marca la entrada como `Usado`. Es atómico: una entrada no puede validarse dos veces |

---

## Imágenes — `/media`

| Método y ruta | Descripción |
|---|---|
| `GET /media/artistas/:id` | Foto del artista guardada en MongoDB (`image/jpeg`, `image/png` o `image/webp`). Requiere sesión. `404` si no tiene foto |

---

## Formato de errores

Los errores no controlados responden con:

```json
{ "status": "error", "message": "Descripción del problema" }
```

| Código | Cuándo |
|---|---|
| `400` | Datos inválidos |
| `401` | Sin sesión iniciada |
| `403` | El rol no tiene permiso, o la petición vino de otro sitio (protección CSRF) |
| `404` | Recurso o ruta inexistente |
| `409` | Conflicto (por ejemplo, cancelar una entrada ya usada) |
| `429` | Demasiados intentos de login |
| `500` | Error interno (el detalle queda en el log del servidor, no se muestra al usuario) |
