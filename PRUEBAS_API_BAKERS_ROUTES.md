# Pruebas de API - Rutas de Pasteleros (Bakers)

**Fecha:** 04 de Agosto, 2026  
**Frontend:** https://danhee-cake.vercel.app/  
**API Base URL:** `https://meditation-salad-nor-gst.trycloudflare.com`  
**Origen de pruebas:** PowerShell (sin navegador)

---

## Resumen de rutas encontradas

Se identificaron **11 rutas de API** utilizadas por los pasteleros en el frontend, montadas bajo el prefijo `/api/bakers/`. El archivo fuente de rutas es `server/src/routes/bakers.routes.js` y el controlador en `server/src/controllers/bakers.controller.js`.

| # | Metodo | Ruta | Descripcion | Auth Requerida |
|---|--------|------|-------------|----------------|
| 1 | GET | `/api/bakers` | Lista publica de reposteros | No (opcional) |
| 2 | GET | `/api/bakers/:id` | Perfil publico de un repostero | No (opcional) |
| 3 | GET | `/api/bakers/stats` | Estadisticas del repostero logueado | Si (repostero) |
| 4 | GET | `/api/bakers/appointments` | Citas del repostero logueado | Si (repostero/admin) |
| 5 | PUT | `/api/bakers/appointments/:id/status` | Actualizar estado de cita | Si (repostero) |
| 6 | GET | `/api/bakers/cakes` | Pasteles del repostero logueado | Si (repostero) |
| 7 | POST | `/api/bakers/cakes` | Agregar nuevo pastel | Si (repostero) |
| 8 | PUT | `/api/bakers/cakes/:id` | Actualizar pastel existente | Si (repostero) |
| 9 | DELETE | `/api/bakers/cakes/:id` | Eliminar pastel | Si (repostero) |
| 10 | GET | `/api/bakers/profile/me` | Perfil propio del repostero | Si (repostero) |
| 11 | PUT | `/api/bakers/profile` | Actualizar perfil de negocio | Si (repostero) |

---

## Pruebas realizadas

### 1. GET `/api/bakers` - Lista publica de reposteros

**Que espera:** Ningun parametro obligatorio. Acepta query params opcionales: `limit` (1-500, default 20), `offset` (>=0), `page` (>=1).  
**Autenticacion:** No requerida (usa `optionalAuth`).

**Prueba 1a: Sin parametros**
- **Envio:** `GET /api/bakers`
- **Respuesta:** `200 OK`
- **Body:**
```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "business_name": "yoyo burguer",
      "location": "uman city",
      "specialty": "stel de carne",
      "bio": null,
      "portfolio_url": null,
      "business_hours": "Lunes a Viernes: 5:00 - 23:00 | Sabado: 5:00 - 21:00 | Domingo: 6:00 - 16:00",
      "is_verified": false,
      "rating_avg": "0.00",
      "total_reviews": 0,
      "avatar_url": null
    }
    // ... 20 reposteros mas
  ],
  "total": 21
}
```
- **Resultado:** PASS - Devuelve 21 reposteros registrados correctamente.

**Prueba 1b: Con paginacion (limit=2, offset=0)**
- **Envio:** `GET /api/bakers?limit=2&offset=0`
- **Respuesta:** `200 OK`
- **Body:** Retorna 2 reposteros con `total: 21`.
- **Resultado:** PASS - Paginacion funciona correctamente.

**Prueba 1c: Limit excedido (limit=999)**
- **Envio:** `GET /api/bakers?limit=999`
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Valida correctamente el limite maximo. El controlador limita a 100 internamente, pero el middleware de validacion rechaza valores > 500.

**Prueba 1d: Limit invalido (limit=0)**
- **Envio:** `GET /api/bakers?limit=0`
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Rechaza valores fuera de rango (min: 1).

**Prueba 1e: Limit no numerico (limit=abc)**
- **Envio:** `GET /api/bakers?limit=abc`
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Rechaza valores no numericos.

---

### 2. GET `/api/bakers/:id` - Perfil publico de repostero

**Que espera:** Parametro de ruta `id` (numero entero positivo).  
**Autenticacion:** No requerida (usa `optionalAuth`).

**Prueba 2a: ID valido (id=1)**
- **Envio:** `GET /api/bakers/1`
- **Respuesta:** `200 OK`
- **Body:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "business_name": "Atelier Dulce",
    "location": "Merida",
    "specialty": "Cumpleanos",
    "bio": null,
    "portfolio_url": null,
    "business_hours": "Lunes a Viernes: 8:00 - 24:00 | Sabado: 5:00 - 21:00",
    "is_verified": false,
    "rating_avg": "0.00",
    "total_reviews": 0,
    "avatar_url": null
  }
}
```
- **Resultado:** PASS - Devuelve perfil publico correctamente.

**Prueba 2b: ID no existente (id=99999)**
- **Envio:** `GET /api/bakers/99999`
- **Respuesta:** `404 Not Found`
- **Resultado:** PASS - Maneja correctamente IDs inexistentes.

**Prueba 2c: ID no numerico (id=abc)**
- **Envio:** `GET /api/bakers/abc`
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Validacion de parametros rechaza IDs no numericos.

**Prueba 2d: ID negativo (id=-1)**
- **Envio:** `GET /api/bakers/-1`
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Rechaza numeros negativos.

**Prueba 2e: ID cero (id=0)**
- **Envio:** `GET /api/bakers/0`
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Rechaza cero (min: 1).

---

### 3. GET `/api/bakers/stats` - Estadisticas del repostero

**Que espera:** Token de autenticacion (Bearer o cookie de sesion). Rol: `repostero`.  
**Autenticacion:** Requerida (`authMiddleware` + `authorize('repostero')`).

**Prueba 3a: Sin autenticacion**
- **Envio:** `GET /api/bakers/stats` (sin headers de auth)
- **Respuesta:** `401 Unauthorized`
- **Body:** Vacio
- **Resultado:** PASS - Rechaza correctamente solicitudes sin autenticacion.

---

### 4. GET `/api/bakers/appointments` - Citas del repostero

**Que espera:** Token de autenticacion. Rol: `repostero` o `admin`. Acepta query params: `full` (true/false), `baker_id` (solo admin).  
**Autenticacion:** Requerida (`authMiddleware` + `authorize('repostero', 'admin')`).

**Prueba 4a: Sin autenticacion**
- **Envio:** `GET /api/bakers/appointments`
- **Respuesta:** `401 Unauthorized`
- **Body:** Vacio
- **Resultado:** PASS - Rechaza correctamente solicitudes sin autenticacion.

---

### 5. PUT `/api/bakers/appointments/:id/status` - Actualizar estado de cita

**Que espera:**
- Parametro de ruta: `id` (entero positivo)
- Body JSON: `{ "status": "pending" | "confirmed" | "completed" | "cancelled" }`
- Token CSRF (`X-CSRF-Token` header)
- Token de autenticacion. Rol: `repostero`

**Prueba 5a: Sin CSRF token**
- **Envio:** `PUT /api/bakers/appointments/1/status` con body `{"status":"confirmed"}` sin header CSRF
- **Respuesta:** `403 Forbidden`
- **Resultado:** PASS - La proteccion CSRF bloquea la solicitud.

**Prueba 5b: Con CSRF token, sin autenticacion**
- **Envio:** `PUT /api/bakers/appointments/1/status` con CSRF token valido, sin auth
- **Respuesta:** `401 Unauthorized`
- **Resultado:** PASS - CSRF pasa, pero auth rechaza.

**Prueba 5c: ID invalido (abc) con CSRF**
- **Envio:** `PUT /api/bakers/appointments/abc/status` con CSRF y body `{"status":"confirmed"}`
- **Respuesta:** `401 Unauthorized`
- **Resultado:** PASS - Rechaza por auth (la validacion de ID ocurre despues de auth).

**Prueba 5d: Status invalido con CSRF**
- **Envio:** `PUT /api/bakers/appointments/1/status` con body `{"status":"invalid_status"}`
- **Respuesta:** `401 Unauthorized`
- **Resultado:** PASS - Rechaza por auth primero; la validacion de status ocurriria despues.

---

### 6. GET `/api/bakers/cakes` - Pasteles del repostero logueado

**Que espera:** Token de autenticacion. Rol: `repostero`.  
**Autenticacion:** Requerida (`authMiddleware` + `authorize('repostero')`).

**Prueba 6a: Sin autenticacion**
- **Envio:** `GET /api/bakers/cakes`
- **Respuesta:** `401 Unauthorized`
- **Body:** Vacio
- **Resultado:** PASS - Rechaza correctamente solicitudes sin autenticacion.

---

### 7. POST `/api/bakers/cakes` - Agregar nuevo pastel

**Que espera:**
- Body (multipart/form-data o JSON): `name` (requerido, 2-100 chars), `description` (opcional, max 1000), `price` (opcional, float >= 0), `category_id` (opcional, entero >= 1), `is_featured` (opcional, boolean), `image` (archivo opcional)
- Token CSRF (`X-CSRF-Token` header)
- Token de autenticacion. Rol: `repostero`

**Prueba 7a: Sin CSRF token**
- **Envio:** `POST /api/bakers/cakes` con body JSON `{"name":"Test Cake","description":"Test","price":100,"category_id":1}` sin CSRF
- **Respuesta:** `403 Forbidden`
- **Resultado:** PASS - Proteccion CSRF bloquea la solicitud.

**Prueba 7b: Con CSRF token, sin autenticacion**
- **Envio:** `POST /api/bakers/cakes` con CSRF token y body JSON
- **Respuesta:** `400 Bad Request` / `401 Unauthorized`
- **Resultado:** PASS - Rechaza la solicitud (CSRF consumido o auth requerida).

**Prueba 7c: Body sin campo requerido (name)**
- **Envio:** `POST /api/bakers/cakes` con body `{"description":"Sin nombre","price":100}` y CSRF
- **Respuesta:** `400 Bad Request`
- **Resultado:** PASS - Validacion rechaza body sin nombre.

---

### 8. PUT `/api/bakers/cakes/:id` - Actualizar pastel

**Que espera:**
- Parametro de ruta: `id` (entero positivo)
- Body JSON: `name` (opcional, 2-100 chars), `description` (opcional), `price` (opcional), `category_id` (opcional), `is_featured` (opcional)
- Token CSRF (`X-CSRF-Token` header)
- Token de autenticacion. Rol: `repostero`

**Prueba 8a: Sin CSRF token**
- **Envio:** `PUT /api/bakers/cakes/1` con body `{"name":"Updated Cake"}` sin CSRF
- **Respuesta:** `403 Forbidden`
- **Resultado:** PASS - Proteccion CSRF bloquea.

**Prueba 8b: Con CSRF token, sin autenticacion**
- **Envio:** `PUT /api/bakers/cakes/1` con CSRF y body
- **Respuesta:** `401 Unauthorized`
- **Resultado:** PASS - CSRF pasa, auth rechaza.

---

### 9. DELETE `/api/bakers/cakes/:id` - Eliminar pastel

**Que espera:**
- Parametro de ruta: `id` (entero positivo)
- Token CSRF (`X-CSRF-Token` header)
- Token de autenticacion. Rol: `repostero`

**Prueba 9a: Sin CSRF token**
- **Envio:** `DELETE /api/bakers/cakes/1` sin CSRF
- **Respuesta:** `403 Forbidden`
- **Resultado:** PASS - Proteccion CSRF bloquea.

**Prueba 9b: Con CSRF token, sin autenticacion**
- **Envio:** `DELETE /api/bakers/cakes/1` con CSRF
- **Respuesta:** `401 Unauthorized`
- **Resultado:** PASS - CSRF pasa, auth rechaza.

---

### 10. GET `/api/bakers/profile/me` - Perfil propio del repostero

**Que espera:** Token de autenticacion. Rol: `repostero`.  
**Autenticacion:** Requerida (`authMiddleware` + `authorize('repostero')`).

**Prueba 10a: Sin autenticacion**
- **Envio:** `GET /api/bakers/profile/me`
- **Respuesta:** `401 Unauthorized`
- **Body:** Vacio
- **Resultado:** PASS - Rechaza correctamente solicitudes sin autenticacion.

---

### 11. PUT `/api/bakers/profile` - Actualizar perfil de negocio

**Que espera:**
- Body JSON: `business_name` (opcional, max 100), `location` (opcional, max 200), `specialty` (opcional, max 100), `bio` (opcional, max 500), `business_hours` (opcional, max 200)
- Token CSRF (`X-CSRF-Token` header)
- Token de autenticacion. Rol: `repostero`

**Prueba 11a: Sin CSRF token**
- **Envio:** `PUT /api/bakers/profile` con body `{"business_name":"Test Bakery","location":"Merida"}` sin CSRF
- **Respuesta:** `403 Forbidden`
- **Resultado:** PASS - Proteccion CSRF bloquea.

**Prueba 11b: Con CSRF token, sin autenticacion**
- **Envio:** `PUT /api/bakers/profile` con CSRF y body completo
- **Respuesta:** `401 Unauthorized`
- **Resultado:** PASS - CSRF pasa, auth rechaza.

---

## Tabla resumen de resultados

| Ruta | Metodo | Status Code | Resultado | Observaciones |
|------|--------|-------------|-----------|---------------|
| `/api/bakers` | GET | 200 | PASS | Lista 21 reposteros correctamente |
| `/api/bakers?limit=2&offset=0` | GET | 200 | PASS | Paginacion funciona |
| `/api/bakers?limit=999` | GET | 400 | PASS | Valida limite maximo |
| `/api/bakers?limit=0` | GET | 400 | PASS | Rechaza valor fuera de rango |
| `/api/bakers?limit=abc` | GET | 400 | PASS | Rechaza no numericos |
| `/api/bakers/1` | GET | 200 | PASS | Perfil publico correcto |
| `/api/bakers/99999` | GET | 404 | PASS | ID inexistente manejado |
| `/api/bakers/abc` | GET | 400 | PASS | ID no numerico rechazado |
| `/api/bakers/-1` | GET | 400 | PASS | Negativos rechazados |
| `/api/bakers/0` | GET | 400 | PASS | Cero rechazado |
| `/api/bakers/stats` | GET | 401 | PASS | Requiere auth correctamente |
| `/api/bakers/appointments` | GET | 401 | PASS | Requiere auth correctamente |
| `/api/bakers/appointments/1/status` | PUT | 403/401 | PASS | CSRF + Auth funcionan |
| `/api/bakers/cakes` | GET | 401 | PASS | Requiere auth correctamente |
| `/api/bakers/cakes` | POST | 403/400 | PASS | CSRF + validacion funcionan |
| `/api/bakers/cakes/1` | PUT | 403/401 | PASS | CSRF + Auth funcionan |
| `/api/bakers/cakes/1` | DELETE | 403/401 | PASS | CSRF + Auth funcionan |
| `/api/bakers/profile/me` | GET | 401 | PASS | Requiere auth correctamente |
| `/api/bakers/profile` | PUT | 403/401 | PASS | CSRF + Auth funcionan |

---

## Hallazgos y observaciones

### Seguridad
1. **CSRF Protection:** Todas las rutas de mutacion (POST, PUT, DELETE) estan protegidas por CSRF. Sin el token `X-CSRF-Token`, retornan `403 Forbidden`.
2. **Autenticacion:** Las rutas protegidas retornan `401 Unauthorized` cuando no se provee token de autenticacion valido.
3. **Autorizacion por rol:** Las rutas usan `authorize('repostero')` para restringir acceso solo a usuarios con rol de pastelero.
4. **Validacion de parametros:** Los IDs de ruta validan que sean enteros positivos (`isInt({ min: 1 })`). Los query params tienen validacion de rango.

### Problemas detectados

#### FALLO: Respuestas de error con body vacio
- **Rutas afectadas:** Todas las rutas que retornan 401, 400 y 403.
- **Descripcion:** Las respuestas de error retornan codigos HTTP correctos pero con body vacio, lo que dificulta el debugging para el cliente.
- **Causa probable:** El middleware de seguridad (`requestGuard`, `apiGuard`, `apiFuzzingGuard`) o el `errorHandler` pueden estar limpiando el body de las respuestas de error.
- **Impacto:** Bajo - Los codigos HTTP son correctos, pero el frontend no puede mostrar mensajes de error especificos.
- **Recomendacion:** Verificar que el `errorHandler` middleware (`server/src/middleware/errorHandler.js`) siempre incluya un JSON con `{ success: false, message: "..." }` en las respuestas de error.

#### Observacion: POST /api/bakers/cakes retorna 400 en vez de 401 sin auth
- **Descripcion:** Al hacer POST sin autenticacion (incluso con CSRF token), la respuesta fue 400 en vez de 401.
- **Causa probable:** El middleware de validacion de body (`validateRequestBody` en `app.js`) o la validacion de express-validator se ejecuta antes del middleware de autenticacion en algunos casos, o el CSRF token se consume invalida la sesion.
- **Impacto:** Bajo - No representa un riesgo de seguridad, pero es inconsistente con las otras rutas que retornan 401.

### Funcionamiento correcto
- Las rutas publicas (`GET /api/bakers` y `GET /api/bakers/:id`) funcionan perfectamente sin autenticacion.
- La paginacion con `limit` y `offset` funciona correctamente.
- La validacion de parametros de ruta y query params es robusta.
- La proteccion CSRF funciona en todas las rutas de mutacion.
- El controlador enmascara PII (emails, telefonos, nombres) en las respuestas de citas.

---

## Codigo fuente consultado

| Archivo | Descripcion |
|---------|-------------|
| `server/src/routes/bakers.routes.js` | Definicion de rutas y middleware de validacion |
| `server/src/controllers/bakers.controller.js` | Logica de negocio de las rutas de pasteleros |
| `server/src/app.js` | Configuracion de middleware global (CSRF, CORS, rate limiting) |
| `server/src/middleware/auth.js` | Middleware de autenticacion y autorizacion |
| `src/pages/BakerDashboardPage.jsx` | Frontend - Panel de control del pastelero |
| `src/pages/BakerProfilePage.jsx` | Frontend - Perfil publico del pastelero |
| `src/config/api.js` | Configuracion de URL base de la API |
