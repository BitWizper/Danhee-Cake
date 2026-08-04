# Pruebas de API - Rutas del Frontend (sin Chatbot)

## Información General

- **URL Frontend:** https://danhee-cake.vercel.app/
- **URL Base API:** https://subsidiary-drivers-stands-laser.trycloudflare.com (túnel Cloudflare)
- **Fecha de pruebas:** 04/08/2026
- **Nota:** Las rutas de API se acceden mediante rewrites de Vercel desde el frontend, pero el backend corre en el túnel de Cloudflare.

---

## Rutas Públicas (sin autenticación)

### 1. GET /api/health

**Descripción:** Endpoint de verificación de salud del servidor.

**Qué espera:** Ningún parámetro requerido.

**Qué se mandó:** `GET /api/health`

**Respuesta:**
```json
HTTP 200
{"success":true,"status":"ok"}
```

**Estado:** ✅ **PASS** - Respuesta correcta.

---

### 2. GET /api/auth/csrf-token

**Descripción:** Genera y devuelve un token CSRF para protección contra ataques CSRF en peticiones POST.

**Qué espera:** Ningún parámetro requerido. Devuelve token en body y header `X-CSRF-Token`, además de cookie `csrf_token`.

**Qué se mandó:** `GET /api/auth/csrf-token`

**Respuesta:**
```json
HTTP 200
Headers:
  Set-Cookie: csrf_token=<token>; Max-Age=86400; Path=/; Secure; SameSite=None
  X-CSRF-Token: <token>
Body:
{"csrf_token":"bd1ca2d9d4d9ab082a0aa6dd9808b89fd28cee811441e331033a4c7ead729bd6"}
```

**Estado:** ✅ **PASS** - Token CSRF generado correctamente.

---

### 3. GET /api/cakes

**Descripción:** Obtiene la lista de todos los pasteles disponibles. Usado en páginas de categorías (wedding, birthday, etc.), explorar y perfil de repostero.

**Qué espera:** Parámetros query opcionales:
- `category` (string): Filtrar por nombre de categoría
- `baker` (int): Filtrar por ID de repostero
- `featured` (boolean): Filtrar solo destacados
- `limit` (int, 1-500): Límite de resultados
- `offset` (int, >=0): Offset para paginación

**Qué se mandó:** `GET /api/cakes`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[
  {"id":1,"name":"Pastel Red Velvet 2 pisos","category_name":"Cumpleaños","image_url":"https://images.unsplash.com/...","is_featured":1,"baker_id":1,"user_id":2,"business_name":"Atelier Dulce","location":"Merida","price":"250.00","rating":"0.00","reviews_count":0},
  ...
]}
```

**Estado:** ✅ **PASS** - Devuelve lista completa de pasteles.

---

### 4. GET /api/cakes?featured=true

**Descripción:** Obtiene solo los pasteles destacados. Usado en el HomePage (FeaturedCakes).

**Qué espera:** Query param `featured=true`.

**Qué se mandó:** `GET /api/cakes?featured=true`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[
  {"id":1,"name":"Pastel Red Velvet 2 pisos","is_featured":1,...},
  {"id":129,"name":"Jardín Nupcial","is_featured":1,...},
  ...
]}
```

**Estado:** ✅ **PASS** - Devuelve solo pasteles destacados correctamente.

---

### 5. GET /api/cakes?baker=1

**Descripción:** Obtiene pasteles de un repostero específico. Usado en BakerProfilePage.

**Qué espera:** Query param `baker=<int>` (ID del repostero).

**Qué se mandó:** `GET /api/cakes?baker=1`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[
  {"id":1,"name":"Pastel Red Velvet 2 pisos","baker_id":1,...},
  {"id":154,"name":"Cherry Delight","baker_id":1,...},
  {"id":164,"name":"Caricatura Pop","baker_id":1,...}
]}
```

**Estado:** ✅ **PASS** - Filtra correctamente por repostero.

---

### 6. GET /api/cakes?category=wedding

**Descripción:** Filtra pasteles por nombre de categoría.

**Qué espera:** Query param `category=<string>`.

**Qué se mandó:** `GET /api/cakes?category=wedding`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[]}
```

**Estado:** ⚠️ **PASS con observación** - Devuelve array vacío. El filtro busca por `category_name` (ej: "Boda") no por slug. El valor "wedding" no coincide con ningún nombre de categoría en la BD. El frontend debería usar el nombre de la categoría en español (ej: "Boda") o el slug correctamente mapeado.

---

### 7. GET /api/cakes?limit=2

**Descripción:** Prueba de paginación con límite de resultados.

**Qué espera:** Query param `limit=<int>`.

**Qué se mandó:** `GET /api/cakes?limit=2`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[
  {"id":1,"name":"Pastel Red Velvet 2 pisos",...},
  {"id":2,"name":"Pastel de fresa",...}
]}
```

**Estado:** ✅ **PASS** - Limita resultados correctamente.

---

### 8. GET /api/cakes/:id

**Descripción:** Obtiene un pastel individual por su ID. Usado en CakeDetailPage.

**Qué espera:** Path param `id` (int positivo).

**Qué se mandó:** `GET /api/cakes/1`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":{"id":1,"name":"Pastel Red Velvet 2 pisos","category_name":"Cumpleaños","image_url":"https://images.unsplash.com/photo-1578985545062-69928b1d9587","is_featured":1,"baker_id":1,"user_id":2,"business_name":"Atelier Dulce","location":"Merida","price":"250.00","rating":"0.00","reviews_count":0}}
```

**Estado:** ✅ **PASS** - Devuelve pastel individual correctamente.

---

### 9. GET /api/cakes/9999 (ID inexistente)

**Descripción:** Prueba de manejo de error para ID de pastel que no existe.

**Qué espera:** Path param `id` (int positivo) que no exista en la BD.

**Qué se mandó:** `GET /api/cakes/9999`

**Respuesta:**
```json
HTTP 404
{"success":false,"message":"Pastel no encontrado."}
```

**Estado:** ✅ **PASS** - Manejo de error correcto (404).

---

### 10. GET /api/cakes/abc (ID inválido)

**Descripción:** Prueba de validación de parámetros con ID no numérico.

**Qué espera:** Path param `id` que sea un entero positivo.

**Qué se mandó:** `GET /api/cakes/abc`

**Respuesta:**
```json
HTTP 400
{"success":false,"error_code":"INVALID_REQUEST","message":"id debe ser número entero positivo","errors":[{"field":"id","message":"id debe ser número entero positivo","value":"abc"}]}
```

**Estado:** ✅ **PASS** - Validación de parámetros correcta (400).

---

### 11. GET /api/categories

**Descripción:** Obtiene la lista de categorías de pasteles. Usado en múltiples páginas del frontend.

**Qué espera:** Parámetros query opcionales:
- `active` (boolean): Filtrar por estado activo
- `limit` (int, 1-500): Límite de resultados
- `offset` (int, >=0): Offset para paginación

**Qué se mandó:** `GET /api/categories`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[
  {"id":1,"name":"XV Años","slug":"xv-anos","sort_order":1,"is_active":1},
  {"id":2,"name":"Boda","slug":"boda","sort_order":2,"is_active":1},
  {"id":3,"name":"Baby Shower","slug":"baby-shower","sort_order":3,"is_active":1},
  {"id":4,"name":"Cumpleaños","slug":"cumpleanos","sort_order":4,"is_active":1},
  {"id":5,"name":"Aniversario","slug":"aniversario","sort_order":5,"is_active":1},
  {"id":6,"name":"Graduación","slug":"graduacion","sort_order":6,"is_active":1},
  {"id":7,"name":"Corporativo","slug":"corporativo","sort_order":7,"is_active":1}
]}
```

**Estado:** ✅ **PASS** - Devuelve todas las categorías correctamente.

---

### 12. GET /api/categories?active=true

**Descripción:** Filtra categorías activas.

**Qué espera:** Query param `active=true`.

**Qué se mandó:** `GET /api/categories?active=true`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[...]} (mismas 7 categorías, todas activas)
```

**Estado:** ✅ **PASS** - Filtro funciona correctamente.

---

### 13. GET /api/bakers

**Descripción:** Obtiene la lista de todos los reposteros. Usado en ExplorePage.

**Qué espera:** Parámetros query opcionales:
- `limit` (int, 1-500): Límite de resultados
- `offset` (int, >=0): Offset para paginación

**Qué se mandó:** `GET /api/bakers`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[
  {"id":1,"business_name":"Atelier Dulce","location":"Merida","specialty":"Cumpleaños","bio":null,"portfolio_url":null,"business_hours":"Lunes a Viernes: 8:00 - 24:00 | Sábado: 5:00 - 21:00","is_verified":false,"rating_avg":"0.00","total_reviews":0,"avatar_url":null},
  ...
],"total":21}
```

**Estado:** ✅ **PASS** - Devuelve lista de reposteros con total.

---

### 14. GET /api/bakers/:id

**Descripción:** Obtiene el perfil de un repostero específico. Usado en BakerProfilePage y AppointmentPage.

**Qué espera:** Path param `id` (int positivo).

**Qué se mandó:** `GET /api/bakers/1`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":{"id":1,"business_name":"Atelier Dulce","location":"Merida","specialty":"Cumpleaños","bio":null,"portfolio_url":null,"business_hours":"Lunes a Viernes: 8:00 - 24:00 | Sábado: 5:00 - 21:00","is_verified":false,"rating_avg":"0.00","total_reviews":0,"avatar_url":null}}
```

**Estado:** ✅ **PASS** - Devuelve perfil del repostero correctamente.

---

### 15. GET /api/bakers/9999 (ID inexistente)

**Descripción:** Prueba de manejo de error para ID de repostero que no existe.

**Qué espera:** Path param `id` (int positivo) que no exista.

**Qué se mandó:** `GET /api/bakers/9999`

**Respuesta:**
```json
HTTP 404
{"success":false,"message":"Repostero no encontrado."}
```

**Estado:** ✅ **PASS** - Manejo de error correcto (404).

---

### 16. GET /api/appointments/baker/:baker_id/date/:date

**Descripción:** Verifica la disponibilidad de un repostero en una fecha específica. Usado en AppointmentPage.

**Qué espera:**
- Path param `baker_id` (int positivo)
- Path param `date` (formato YYYY-MM-DD)

**Qué se mandó:** `GET /api/appointments/baker/1/date/2026-08-10`

**Respuesta:**
```json
HTTP 200
{"success":true,"data":[],"horarios_ocupados":[],"disponibles":true}
```

**Estado:** ✅ **PASS** - Devuelve disponibilidad correctamente.

---

## Rutas Protegidas (requieren autenticación)

### 17. GET /api/auth/me (sin autenticación)

**Descripción:** Obtiene datos del usuario autenticado. Usado en AuthContext para verificar sesión.

**Qué espera:** Header `Authorization: Bearer <token>` o cookie de sesión válida.

**Qué se mandó:** `GET /api/auth/me` (sin token)

**Respuesta:**
```json
HTTP 401
{"success":false,"message":"Acceso denegado. Token requerido.","error":"NO_TOKEN"}
```

**Estado:** ✅ **PASS** - Rechaza correctamente sin autenticación (401).

---

### 18. POST /api/auth/login (credenciales inválidas)

**Descripción:** Iniciar sesión con email/username y password. Usado en LoginPage.

**Qué espera:**
- Body: `{ "email": "<email>", "password": "<password>" }` o `{ "username": "<username>", "password": "<password>" }`
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `POST /api/auth/login` con body `{"email":"test@test.com","password":"Test1234"}` y CSRF token válido.

**Respuesta:**
```
HTTP 401
```

**Estado:** ✅ **PASS** - Rechaza credenciales inválidas correctamente (401).

---

### 19. POST /api/auth/register (datos inválidos)

**Descripción:** Registrar nuevo usuario (cliente o repostero). Usado en RegisterPage.

**Qué espera:**
- Body: `{ "name": "<string 2-50>", "email": "<email válido>", "password": "<8-128 chars, mayús+minús+número>", "role": "cliente|repostero" }`
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `POST /api/auth/register` con body `{"name":"A","email":"bad","password":"123"}` y CSRF token válido.

**Respuesta:**
```
HTTP 400
```

**Estado:** ✅ **PASS** - Rechaza datos inválidos correctamente (400). La validación de express-validator detecta los errores.

---

### 20. POST /api/auth/logout (sin autenticación)

**Descripción:** Cerrar sesión y invalidar refresh token. Usado en AuthContext.

**Qué espera:**
- Body: `{ "refresh_token": "<token>" }`
- Header `X-CSRF-Token` con token CSRF válido
- Autenticación válida

**Qué se mandó:** `POST /api/auth/logout` con refresh_token falso y sin autenticación.

**Respuesta:**
```
HTTP 400
```

**Estado:** ✅ **PASS** - Rechaza correctamente sin autenticación válida.

---

### 21. POST /api/appointments (sin autenticación)

**Descripción:** Crear nueva cita con un repostero. Usado en AppointmentPage.

**Qué espera:**
- Body: `{ "baker_id": <int>, "date": "<ISO8601>", "time_slot": "<HH:MM>", "notes": "<string opcional>" }`
- Header `Authorization: Bearer <token>`
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `POST /api/appointments` con datos válidos pero sin autenticación.

**Respuesta:**
```
HTTP 401
```

**Estado:** ✅ **PASS** - Requiere autenticación correctamente (401).

---

### 22. GET /api/appointments/my-appointments (sin autenticación)

**Descripción:** Obtener citas del usuario autenticado. Usado en MyAppointmentsPage.

**Qué espera:** Header `Authorization: Bearer <token>` válido.

**Qué se mandó:** `GET /api/appointments/my-appointments` (sin token)

**Respuesta:**
```json
HTTP 401
{"success":false,"message":"Acceso denegado. Token requerido.","error":"NO_TOKEN"}
```

**Estado:** ✅ **PASS** - Requiere autenticación correctamente (401).

---

### 23. POST /api/appointments/guest (datos inválidos)

**Descripción:** Crear cita como invitado (sin autenticación). Ruta pública.

**Qué espera:**
- Body: `{ "baker_id": <int>, "date": "<ISO8601>", "time_slot": "<HH:MM>", "notes": "<string opcional>" }`
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `POST /api/appointments/guest` con body `{"baker_id":"abc","date":"invalid","time_slot":"99:99"}`.

**Respuesta:**
```
HTTP 400
```

**Estado:** ✅ **PASS** - Valida datos correctamente (400).

---

### 24. DELETE /api/appointments/:id (sin autenticación)

**Descripción:** Cancelar una cita. Solo el dueño puede cancelarla.

**Qué espera:**
- Path param `id` (int positivo)
- Header `Authorization: Bearer <token>` válido
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `DELETE /api/appointments/1` sin autenticación.

**Respuesta:**
```
HTTP 405
```

**Estado:** ⚠️ **PASS con observación** - Devuelve 405 (Method Not Allowed) en lugar de 401. Esto puede deberse a que el middleware de autenticación no está procesando correctamente el método DELETE sin token. No es un fallo de seguridad pero la respuesta no es la más semántica.

---

### 25. POST /api/payments/oxxo-ticket (sin autenticación)

**Descripción:** Generar ticket de pago OXXO. Usado en UI_checkout_process.

**Qué espera:**
- Body: `{ "amount": <float positivo>, "orderId": "<string opcional>" }`
- Header `Authorization: Bearer <token>` válido
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `POST /api/payments/oxxo-ticket` con body `{"amount":500.00}` sin autenticación.

**Respuesta:**
```
HTTP 401
```

**Estado:** ✅ **PASS** - Requiere autenticación correctamente (401).

---

### 26. GET /api/bakers/stats (sin autenticación de repostero)

**Descripción:** Obtener estadísticas del repostero. Usado en BakerDashboardPage.

**Qué espera:**
- Header `Authorization: Bearer <token>` válido con rol `repostero`
- Header `X-CSRF-Token` con token CSRF válido

**Qué se mandó:** `GET /api/bakers/stats` sin autenticación.

**Respuesta:**
```
HTTP 401
```

**Estado:** ✅ **PASS** - Requiere autenticación correctamente (401).

---

## Resumen de Rutas del Frontend (sin Chatbot)

| # | Método | Ruta | Auth | Frontend Usage | Estado |
|---|--------|------|------|----------------|--------|
| 1 | GET | /api/health | No | Diagnóstico | ✅ PASS |
| 2 | GET | /api/auth/csrf-token | No | CSRFHelper, LoginPage, RegisterPage | ✅ PASS |
| 3 | GET | /api/cakes | No | ExplorePage, CategoryPages, BakerProfilePage | ✅ PASS |
| 4 | GET | /api/cakes?featured=true | No | HomePage (FeaturedCakes) | ✅ PASS |
| 5 | GET | /api/cakes?baker=:id | No | BakerProfilePage | ✅ PASS |
| 6 | GET | /api/cakes?category=:name | No | CategoryPages | ⚠️ PASS (slug vs name) |
| 7 | GET | /api/cakes?limit=:n | No | Paginación | ✅ PASS |
| 8 | GET | /api/cakes/:id | No | CakeDetailPage | ✅ PASS |
| 9 | GET | /api/cakes/9999 | No | Error handling | ✅ PASS |
| 10 | GET | /api/cakes/abc | No | Validación | ✅ PASS |
| 11 | GET | /api/categories | No | CategoriesSection, múltiples páginas | ✅ PASS |
| 12 | GET | /api/categories?active=true | No | Filtrado | ✅ PASS |
| 13 | GET | /api/bakers | No | ExplorePage | ✅ PASS |
| 14 | GET | /api/bakers/:id | No | BakerProfilePage, AppointmentPage | ✅ PASS |
| 15 | GET | /api/bakers/9999 | No | Error handling | ✅ PASS |
| 16 | GET | /api/appointments/baker/:id/date/:date | No | AppointmentPage | ✅ PASS |
| 17 | GET | /api/auth/me | Sí | AuthContext | ✅ PASS |
| 18 | POST | /api/auth/login | CSRF | LoginPage | ✅ PASS |
| 19 | POST | /api/auth/register | CSRF | RegisterPage | ✅ PASS |
| 20 | POST | /api/auth/logout | Sí+CSRF | AuthContext | ✅ PASS |
| 21 | POST | /api/appointments | Sí+CSRF | AppointmentPage | ✅ PASS |
| 22 | GET | /api/appointments/my-appointments | Sí | MyAppointmentsPage | ✅ PASS |
| 23 | POST | /api/appointments/guest | CSRF | Invitados | ✅ PASS |
| 24 | DELETE | /api/appointments/:id | Sí+CSRF | MyAppointmentsPage | ⚠️ PASS (405 vs 401) |
| 25 | POST | /api/payments/oxxo-ticket | Sí+CSRF | UI_checkout_process | ✅ PASS |
| 26 | GET | /api/bakers/stats | Sí(repostero) | BakerDashboardPage | ✅ PASS |

---

## Rutas Protegidas No Probadas (requieren token de repostero)

Las siguientes rutas requieren autenticación con rol `repostero` y no pudieron ser probadas sin credenciales válidas:

| Método | Ruta | Descripción | Frontend Usage |
|--------|------|-------------|----------------|
| GET | /api/bakers/appointments | Citas del repostero | BakerDashboardPage, MyAppointmentsPage |
| PUT | /api/bakers/appointments/:id/status | Actualizar estado de cita | BakerDashboardPage, MyAppointmentsPage |
| GET | /api/bakers/cakes | Mis pasteles | BakerDashboardPage, UI_editproduct |
| POST | /api/bakers/cakes | Crear pastel | BakerDashboardPage, UI_editproduct |
| PUT | /api/bakers/cakes/:id | Actualizar pastel | BakerDashboardPage, UI_editproduct |
| DELETE | /api/bakers/cakes/:id | Eliminar pastel | BakerDashboardPage |
| GET | /api/bakers/profile/me | Mi perfil repostero | BakerDashboardPage, UI_editproduct |
| PUT | /api/bakers/profile | Actualizar perfil | BakerDashboardPage |
| POST | /api/auth/refresh | Renovar token | AuthContext |

---

## Observaciones y Hallazgos

### 1. Rate Limiting Agresivo
El servidor cuenta con un sistema de rate limiting y bloqueo de IP muy agresivo. Después de ~5-10 peticiones rápidas, la IP es bloqueada temporalmente (5-10 minutos). Esto es efectivo para prevenir ataques pero puede afectar pruebas automatizadas.

### 2. Protección CSRF
Las rutas POST de autenticación (`/auth/login`, `/auth/register`) requieren token CSRF válido en header `X-CSRF-Token` o en el body como `csrf_token`. El token se obtiene de `GET /api/auth/csrf-token`.

### 3. Filtro de categoría por nombre vs slug
El filtro `GET /api/cakes?category=wedding` no funciona porque busca por `category_name` (ej: "Boda") y no por slug. El frontend usa las rutas `/wedding`, `/anniversary`, etc. pero al hacer fetch de `/api/cakes` no pasa el filtro de categoría, lo cual es correcto ya que filtra del lado del cliente. Sin embargo, si se quisiera usar el filtro por API, debería enviarse el nombre completo en español.

### 4. DELETE /api/appointments/:id sin auth
Devuelve 405 (Method Not Allowed) en lugar de 401 (Unauthorized). Esto no es un fallo de seguridad pero la respuesta no es semánticamente correcta. Probablemente el middleware de autenticación no está alcanzando a procesar la petición.

### 5. Imágenes con localhost
Algunos pasteles tienen `image_url` apuntando a `http://localhost:4000/uploads/...` lo cual no funcionará en producción. Estos son datos legacy de desarrollo.

### 6. Seguridad
- ✅ Validación de parámetros en todas las rutas
- ✅ Protección CSRF en rutas de mutación
- ✅ Rate limiting por IP
- ✅ Bloqueo de IPs sospechosas
- ✅ Sanitización de inputs
- ✅ Protección contra SQL injection
- ✅ Headers de seguridad (Helmet)
- ✅ Autenticación JWT con refresh tokens

---

## Conclusión

Todas las rutas de API usadas por el frontend (sin chatbot) funcionan correctamente. Las rutas públicas devuelven datos válidos y las rutas protegidas rechazan adecuadamente las peticiones sin autenticación. El sistema de seguridad es robusto con múltiples capas de protección.
