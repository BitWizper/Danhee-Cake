# Pruebas de Rutas de la API — Danhee Cake

**URL de front probada:** https://danhee-cake.vercel.app/
**URL de API (extraída del bundle `index-D-3gYTGD.js`):** `https://palmer-msg-conference-src.trycloudflare.com` *(rotó: histórico `nyc-russell-suite-furthermore`, `FcoWH_pe`...)*
**Fecha de esta ronda:** 2026-08-04

> ℹ️ **Estabilidad / cambios vs. ronda anterior:** en esta ronda el túnel estuvo **estable** y las pruebas se hicieron con usuarios **realmente registrados** (cliente `cr…@danhee.com` y repostero `rr…@danhee.com`) + token CSRF real. En la ronda previa se observó **inestabilidad de infraestructura**: el túnel de Cloudflare se cayó varias veces (HTTP 530/CF 1033) y la BD (`91.208.207.108:3306`) dio `ECONNREFUSED`, lo que provocaba 500/503 en todas las rutas con BD. Sigue dependiendo de un **túnel `trycloudflare` efímero** (cambia en cada redeploy) con la URL **hardcodeada** en el bundle.
>
> ✅ **Corrección confirmada esta ronda:** el **bug #1 anterior (JWT de usuario inexistente → 500)** quedó **RESUELTO**: ahora `/api/auth/me` (y el resto) responden **`401 USER_NOT_FOUND` "Tu cuenta ya no existe..."** para un token válido de un usuario borrado/de baja. El `authMiddleware` ya valida existencia del usuario.
> ✅ **Registro duplicado** ahora responde **400** "No se pudo completar el registro..." (antes 500 cuando la BD caía), no 500.

---

## Resumen general de rutas

| Ruta | Método | Auth | CSRF | Resultado en pruebas |
|---|---|---|---|---|
| `/api/auth/csrf-token` | GET | No | No | ✅ 200 |
| `/api/auth/register` | POST | No | ✅ | ✅ 201 (con BD) / 500 (BD caída) |
| `/api/auth/login` | POST | No | ✅ | ✅ 200 |
| `/api/auth/refresh` | POST | No | No | ⏳ (require refresh_token) |
| `/api/auth/logout` | POST | No | ✅ | ⏳ (require refresh_token) |
| `/api/auth/me` | GET | Sí | No | ✅ 200 |
| `/api/categories` | GET | Opcional | No | ✅ 200 |
| `/api/cakes` | GET | Opcional | No | ✅ 200 |
| `/api/cakes/:id` | GET | Opcional | No | ✅ 200 |
| `/api/bakers` | GET | Opcional | No | ✅ 200 |
| `/api/bakers/:id` | GET | Opcional | No | ⏳ |
| `/api/appointments/baker/:id/date/:date` | GET | No | No | ✅ 200 |
| `/api/appointments/guest` | POST | No | ✅ | ✅ 201 |
| `/api/appointments/internal` | POST | No | ✅ | ✅ 403 (solo localhost) |
| `/api/appointments` | POST | Sí | ✅ | ✅ 201 |
| `/api/appointments/my-appointments` | GET | Sí | No | ✅ 200 |
| `/api/appointments/:id` | DELETE | Sí | ✅ | ✅ 200 (dueño) / 404 |
| `/api/payments/oxxo-ticket` | POST | Sí | ✅ | ✅ 200 |
| `/api/bakers/stats` | GET | Sí (repostero) | No | ✅ 200 |
| `/api/bakers/appointments` | GET | Sí (repostero/admin) | No | ✅ 200 |
| `/api/bakers/appointments/:id/status` | PUT | Sí (repostero) | ✅ | ✅/404 |
| `/api/bakers/cakes` | GET | Sí (repostero) | No | ✅ 200 |
| `/api/bakers/cakes` | POST | Sí (repostero) | ✅ | ⏳ (multipart+Cloudinary) |
| `/api/bakers/cakes/:id` | PUT/DELETE | Sí (repostero) | ✅ | ⏳ |
| `/api/bakers/profile/me` | GET | Sí (repostero) | No | ✅ 200 |
| `/api/bakers/profile` | PUT | Sí (repostero) | ✅ | ✅ 200 |
| `/api/admin/security-stats` | GET | Sí (admin) | No | ✅ 403 para cliente |
| `/api/chat/stream` | POST | Optativo | Condicional | ✅ 200 SSE |
| `/api/chat/history` | GET | Sí | No | ✅ 200 / 401 |
| `/api/chat/history` | DELETE | Sí | ✅ | ⏳ (BD) |
| `/api/images/:filename` | GET | No (HMAC) | No | ✅ 400/403 |
| `/protected-media/:folder/:filename` | GET | No (key/Bearer) | No | ✅ 403 sin key |
| `/api` | GET | No | No | ✅ 200 |
| `/health`, `/api/health` | GET | No | No | ✅ 200 |

> ⏳ = no se completó un flujo feliz end-to-end (por límites de prueba: requiere multipart/upload, o refresh_token real de una sesión previa que se consumió). Usé refresh_token basura → `400 refresh_token inválido` (no se reporta como bug).

---

## 1. RUTAS DE AUTH (`/api/auth`)

### `GET /api/auth/csrf-token`
**Qué espera:** nada. Genera y devuelve un token CSRF.
**Envié:** `GET` sin headers.
**Respondió:** `200 {"csrf_token":"<64hex>"}` + `Set-Cookie: csrf_token` (SameSite=None, httpOnly:false, secure) + `client_fingerprint` cookie. ✅

### `POST /api/auth/register`
**Qué espera:** JSON `{ name, email, password, role? }`; requiere header `X-CSRF-Token` (de `/auth/csrf-token`) + cookie. Validaciones: nombre 2–120 solo letras/espacios; email válido; password ≥8 con mayúscula+minúscula+dígito; `role` ∈ {cliente, repostero}.
**Envié/Respondí:**
- Válido (email único), con CSRF → **`201`** "Usuario registrado exitosamente..." ✅
- `password:"corto1"` → **`400 INVALID_BODY`** "La contraseña debe tener al menos 8 caracteres" ✅ (capa `express-validator`)
- `role:"admin"` → **`400`** "El rol debe ser cliente o repostero" ✅ (escalada de rol bloqueada)
- Sin CSRF → **`403 CSRF_TOKEN_MISSING`** ✅
- Con la **BD caída** → **`500 INTERNAL_SERVER_ERROR`** ⚠️ (falta manejo; el catch hace `next(err)` → 500).

### `POST /api/auth/login`
**Qué espera:** JSON `{ email o username, password }` + CSRF.
**Envié/Respondí:**
- Credenciales reales válidas + CSRF → **`200`** `{ user:{id,email,role}, token, refresh_token }` ✅
- Email inexistente → `400 "Credenciales inválidas..."` (o 500 si BD caída).
- **Nota de consistencia:** devuelve los campos `token` y `refresh_token` (snake-camel), no `access_token`. El `AuthContext` del front lee `localStorage.getItem('token')`, así que coincide, pero conviene un solo nombre estándar.

### `POST /api/auth/refresh`  /  `POST /api/auth/logout`
**Qué esperan:** JSON `{ refresh_token }` (≥32 chars). Refresh NO pide CSRF (está en `publicPaths`); logout sí (pasa por el CSRF global `/api`).
**Envié/Respondí:** `refresh_token` basura de 50 chars → **`400 "refresh_token inválido"`** (validación OK). ✅ No probé un flujo feliz real (el refresh real emitiría un access nuevo).

### `GET /api/auth/me`
**Qué espera:** `Authorization: Bearer <token>` (o cookie `access_token`).
**Envié/Respondí:**
- Token real → **`200`** `{ user:{id,name,email,role,address} }` ✅
- Sin token → **`401 NO_TOKEN`** "Acceso denegado. Token requerido." ✅
- Token forjado con **usuario inexistente** → **`500`** ⚠️ (ver bug #1).

---

## 2. CATÁLOGO (`/api/categories`, `/api/cakes`, `/api/bakers`)

### `GET /api/categories`
**Qué espera:** query `active?` (true/false/0/1), `limit?` 1–500, `offset?` ≥0.
**Envié/Respondí:** `GET /api/categories?limit=2` → **`200`** con `data:[{id,name,slug,sort_order,is_active}]` ✅

### `GET /api/cakes`
**Qué espera:** query `category?`, `baker?` (int≥1), `featured?` (true/false/0/1), `limit?`, `offset?`.
**Envié/Respondí:** `GET /api/cakes?limit=2` → **`200`** con lista de pasteles. ⚠️ **El catálogo expone campos internos**: `user_id`, `baker_id`, y para la imagen devuelve URLs a la **ruta legacy `/api/images/<archivo>?token=<HMAC>&expires=...`** (ver rutas misc). Con `limit=9999` → **`400`** `limit entre 1-500` ✅

### `GET /api/cakes/:id`
**Envié/Respondí:** `GET /api/cakes/1` → **`200`** `{ success, data:{...pastel} }`. ✅

### `GET /api/bakers`
**Envié/Respondí:** `GET /api/bakers?limit=2` → **`200`** `{ data:[...baker_profiles...], total }`. ✅

---

## 3. CITAS (`/api/appointments`)

### `GET /api/appointments/baker/:baker_id/date/:date`
**Qué espera:** parámetros de ruta `baker_id` (int≥1), `date` (`YYYY-MM-DD`).
**Envié/Respondí:** `GET /api/appointments/baker/1/date/2026-08-05` → **`200`** `{ success, data:[], horarios_ocupados:[], disponibles:true }` ✅

### `POST /api/appointments` (autenticado)
**Qué espera:** `Authorization` + **CSRF**; body `{ baker_id, date, time_slot:"HH:MM", notes? }`.
**Envié/Respondí (token real + CSRF):** → **`201`** `{ success, message:"Cita solicitada exitosamente.", data:{id:12} }` ✅
- Sin CSRF → **`403 CSRF_TOKEN_MISSING`** ✅
- Sin token → `401` (el CSRF del app-global corre primero, así que primero dará 403 si falta CSRF).

### `POST /api/appointments/guest`
**Qué espera:** mismo body que create; **CSRF** (aunque sea "invitado"); tasa `publicLimiter`.
**Envié/Respondí:** con CSRF → **`201`** `{ ..., data:{id:13, client_id:45} }` ✅ ; sin CSRF → **`403`** ✅

### `POST /api/appointments/internal` (chatbot, solo backend)
**Qué espera:** body de cita + **CSRF**; comprobación de que la petición venga de localhost.
**Envié/Respondí:** forzando `X-Forwarded-For: 127.0.0.1` + CSRF → **`403`** "Este endpoint solo es accesible desde localhost." ✅ (el spoofing no lo burla).

### `GET /api/appointments/my-appointments`
**Qué espera:** `Authorization`.
**Envié/Respondí (token real):** → **`200`** `{ success, data:[], total:0 }` ✅. Con token forjado id inexistente → `500` ⚠️ (bug #1).

### `DELETE /api/appointments/:id`
**Qué espera:** `Authorization` + **CSRF**; param `id`.
**Envié/Respondí:** con token/CSRF sobre una cita no perteneciente → **`500`** en una prueba con token forjado (bug #1). Con token real y cita propia: devuelve 200/404 según dueño (no llegué a eliminar una propia por inestabilidad del túnel).

### `PUT /api/bakers/appointments/:id/status` (en backbone de reposteros)
**Qué espera:** `Authorization` + **CSRF**; param `id`; body `{ status }` donde status ∈ **{pending, confirmed, completed, cancelled}** (en inglés).
**Envié/Respondí:**
- `{"status":"confirmada"}` (español) → **`400`** "Estado no válido." ✅ (valor fuera de la lista)
- `{"status":"confirmed"}` siendo repostero que **no es dueño** del repostero de la cita → **`404`** "Cita no encontrada o sin permiso." ✅
- ⚠️ **Inconsistencia idioma-estados:** los estados validados son en inglés, pero la app/producto es en español. El frontend actual **no llama a este endpoint** (no apareció en el bundle), por lo que hoy es prácticamente inservible desde la UI (bug #5).

---

## 4. REPOSTEROS (`/api/bakers`) — protegidas

### `GET /api/bakers/stats` (repostero)
**Envié/Respondí (repostero real):** → **`200`** `{ baker_id, cakes, appointments, rating }` ✅. Con cliente → **`403`** "Se requiere uno de los siguientes roles: repostero" ✅

### `GET /api/bakers/appointments` (repostero/admin)
**Envié/Respondí (repostero real):** → **`200`** `{ success, data:[], total }` ✅. Con `limit=9999` → **`400`** `limit entre 1-500` ✅

### `GET /api/bakers/cakes` (repostero)
**Envié/Respondí (repostero real):** → **`200`** `{ success, data:[] }` ✅. Con cliente → **`403`** ✅

### `POST /api/bakers/cakes` (repostero) y `PUT/DELETE /api/bakers/cakes/:id`
**Qué esperan:** `Authorization` + **CSRF**; `POST` es multipart/form-data con campo `image` (`uploadWithSignatureCheck('image')` + `uploadToCloudinary`). **No completé un alta creativa** por requerir subir imagen real con firma; documenté el pipeline de middlewares.

### `GET /api/bakers/profile/me` (repostero)
**Envié/Respondí (repostero real):** → **`200`** `{ data:{ id, user_id, business_name, location, ..., is_verified, rating_avg, total_reviews } }` ✅

### `PUT /api/bakers/profile` (repostero)
**Qué espera:** `Authorization` + **CSRF**; body con `business_name|location|specialty|bio|business_hours`.
**Envié/Respondí (repostero real + CSRF):** → **`200`** "Perfil actualizado correctamente." ✅

---

## 5. PAGOS (`/api/payments`)

### `POST /api/payments/oxxo-ticket`
**Qué espera:** `Authorization` + **CSRF**; body `{ orderId?, amount }` (amount 0.01–1000000). Middlewares: `paymentGuard`, `writeLimiter`.
**Envié/Respondí (token real + CSRF):** → **`200`** `{ reference:"27F404F6A567", amount:150.5, expiresAt, instructions, printUrl }` ✅
- Sin CSRF → `403 CSRF_TOKEN_MISSING` (el middleware `/api` global de CSRF corre **antes** que `authMiddleware`, por lo que una petición sin CSRF da 403 CSRF en lugar de 401 aunque falte también el token — inconsistencia de orden, bug #6).
- Con token forjado id inexistente → podía dar 500 (bug #1).

---

## 6. ADMIN

### `GET /api/admin/security-stats`
**Qué espera:** `Authorization` (rol **admin**).
**Envié/Respondí:**
- Con cliente real → **`403`** `{ message:"Acceso denegado. Se requiere uno de los siguientes roles: admin", required_roles:["admin"] }` ✅
- No pude emitir un token admin real (register no permite `admin`); con token forjado id inexistente daba 500 (bug #1). No validado feliz.

---

## 7. CHAT (`/api/chat`) — detalle en `pruebas-rutas-chatbot.md`

### `POST /api/chat/stream`
**Qué espera:** JSON `{ message (1–5000), conversation_id? }`; CSRF **condicional** (solo si hay auth); `chatLimiter`, `clientChatGuard`.
**Envié/Respondí:** invitado `{"message":"hola"}` → **`200` SSE** (`type:token` + `type:response`) ✅.

### `GET /api/chat/history`
**Envié/Respondí:** sin token → **`401`** ✅; con token → 200 (o 500 si BD/chat_sessions caída) ⚠️.

### `DELETE /api/chat/history`
**Envié/Respondí:** requiere `Authorization` + CSRF; durante esa ventana BD caída → `500` (bug #1/infra). Ver doc de chat para casos de ownership.

---

## 8. OTRAS / MISC

### `GET /api/images/:filename` (legacy, HMAC)
**Qué espera:** `filename` + `token` + `expires` (firma HMAC-SHA256 con `JWT_SECRET` sobre `filename|expires`).
**Envié/Respondí:** `GET /api/images/x.jpg` sin params → **`400`** `Parámetros inválidos` ✅; con token/expires inválidos → **`403`** ✅.

### `GET /protected-media/:folder/:filename`
**Qué espera:** `folder` ∈ {public,dist,uploads} + `X-MEDIA-KEY` o `?key=` o `Authorization Bearer`.
**Envié/Respondí:** `GET /protected-media/public/x.txt` sin key → **`403`** `Acceso denegado` ✅.

### `GET /api`, `GET /health`, `GET /api/health`
**Envié/Respondí:** → **`200`**. ✅

---

## 🐞 Bugs / inconsistencias encontradas

**✅ Resueltas en esta/última iteración:**
- **JWT de usuario inexistente → 500** (**correcta** a `401 USER_NOT_FOUND "Tu cuenta ya no existe..."`). Se valida existencia del usuario en el auth de las rutas autenticadas.
- **Registro duplicado** → ahora `400` limpio (no 500).

**Hallazgos activos (de esta ronda, con el deploy estable):**

1. 🐞 **`time_slot` solo valida formato, no la validez real de la hora → 500 o dato inválido.** La validación de citas (`appointments.routes.js`) usa solo `time_slot` debe coincidir con `HH:MM` (`\d{2}:\d{2}`), sin rango. Resultados:
   - `time_slot:"99:99"` → **`500 INTERNAL_SERVER_ERROR`** (reproducible; el DB choca con la hora inválida y no se captura).
   - `time_slot:"25:00"` → **`201`** (acepta y persiste una hora inexistente).
   - `time_slot:"09:00"` → `201` correcto.
   → Debería validarse rango real (0–23h, 0–59min) y rechazar con `400`, no 500 ni persistir horas inválidas.

2. 🐞 **`DELETE /api/appointments/:id` no es idempotente:** cancelar 2 veces la misma cita devolvió **`200` "Cita cancelada exitosamente"** en ambas; solo un id inexistente responde `404`. Confirma que el controlador no revisa el **estado** de la cita (una ya `cancelled` vuelve a reportar éxito en vez de 410/409/404).

3. ⚠️ **El token CSRF es reutilizable (no se rota/consume tras usarse):** el MISO `X-CSRF-Token` + cookie sirvió para 2 `POST /api/auth/login` exitosos consecutivos. `csrfProtection` valida contra el Map pero **no elimina/invalida el token después de cada uso** → mayor ventana de reuso si un token se filtra. (Conveniente rotar/de un-solo-uso.)

4. 🐞 **Inestabilidad de la infraestructura (afecta a todo; visto en la ronda previa):** el túnel de Cloudflare se cayó repetidamente (530/CF 1033) y la **BD Clever Cloud dio `ECONNREFUSED`** en una ventana. Cuando la BD no responde, **registro/login y todas las rutas con base de datos devuelven 500/503** ("No se pudieron obtener... Intente de nuevo"). Un despliegue que depende de un **túnel `trycloudflare` efímero + una BD intermitente** no es estable; además el bundle tiene la URL del túnel **hardcodeada** (al rotar, el front pierde la API).

5. 🐞 **Nombres de campos del login:** `login` devuelve `token` y `refresh_token`; no hay `access_token`. Coherente con el `AuthContext` del front pero inconsistente con el resto del contrato API.

6. ⚠️ **CSRF exigido en rutas "públicas/guest":** `/api/appointments/guest`, `/api/appointments/internal`, `/api/payments/*`, etc. requieren `X-CSRF-Token` (solo `chat/stream`, `auth/refresh`, `auth/csrf-token` están exentas). Un invitado sin CSRF recibe 403. No rompe (el front lo envía), pero "ruta pública" + "CSRF obligatorio" es confuso.

7. ⚠️ **Orden de middlewares: CSRF antes que auth:** el guard `/api` de CSRF corre antes de `authMiddleware`; `/api/payments/oxxo-ticket` sin token **ni** CSRF responde `403 CSRF_TOKEN_MISSING` en vez de `401 NO_TOKEN`. Menor, pero revela el endpoint a no autenticados con un error distinto.

8. ⚠️ **Estados de cita en inglés, producto en español:** `PUT /api/bakers/appointments/:id/status` acepta solo `pending|confirmed|completed|cancelled`. El frontend **no implementa** esta operación (no aparece en el bundle); si se enviara `confirmada`/`cancelada` → `400 "Estado no válido."` Rotura latente.

9. ⚠️ **`GET /api/cakes` expone información interna:** `user_id`, `baker_id`, y URLs hacia la ruta **legacy** `/api/images/...?token=<HMAC>&expires=<ts>` (firma con `JWT_SECRET`, misma clave del login). Documentado como LEGACY.

10. ⚠️ **Mensaje ambiguo de permisos:** `PUT .../appointments/:id/status` de un repostero no-dueño responde `404 "Cita no encontrada o sin permiso"`: no filtra existencia (bien), pero mezcla 403/404 en un solo código.

---

### Reproducción / herramientas
- Registrar y loguearse: `GET /api/auth/csrf-token` → guardar `X-CSRF-Token` + cookie; luego `POST /api/auth/register|login` con `X-CSRF-Token` + `Cookie: csrf_token=...`.
- Usar `--data-binary @archivo.json` para los cuerpos; con `-d '...'` en PowerShell el JSON se puede corromper y el server responde `400 INVALID_JSON`.
- El login emite el access en el campo `token` (campo `refresh_token` aparte).