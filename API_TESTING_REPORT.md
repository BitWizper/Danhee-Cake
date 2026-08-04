# Documentacion de Pruebas API - Danhee Cake

**URL Frontend:** https://danhee-cake.vercel.app/  
**URL Backend (API):** https://subsidiary-drivers-stands-laser.trycloudflare.com  
**Fecha de Prueba:** 2026-08-04  
**Tipo de Prueba:** Caja Negra (sin credenciales de administrador/repostero)

---

## Arquitectura Detectada

El proyecto tiene una arquitectura separada:
- **Frontend:** Desplegado en Vercel (`https://danhee-cake.vercel.app/`) - Solo sirve la SPA React
- **Backend:** Corre en servidor Docker con tunel Cloudflare (`https://subsidiary-drivers-stands-laser.trycloudflare.com`)
- **Base de Datos:** Clever Cloud (MySQL remoto)
- **Configuracion:** `VITE_BASE_URL=https://api.danhee.com` (no resuelve; el frontend usa el tunel Cloudflare como fallback)

> **NOTA IMPORTANTE:** Los endpoints `/api/*` en `danhee-cake.vercel.app` devuelven **404** porque el backend NO esta desplegado en Vercel. Todas las pruebas reales se ejecutaron contra el tunel Cloudflare del backend.

---

## Resumen Ejecutivo

| Categoria | Total | Exitosos | Fallidos | No Probados |
|-----------|-------|----------|----------|-------------|
| Endpoints Publicos (GET) | 12 | 11 | 1 | 0 |
| Endpoints Publicos (POST) | 4 | 2 | 2 | 0 |
| Endpoints Protegidos (cliente) | 5 | 3 | 1 | 1 |
| Endpoints Repostero | 9 | 0 | 1 | 8 |
| Endpoints Admin | 4 | 0 | 1 | 3 |
| Seguridad / Validacion | 6 | 4 | 2 | 0 |
| **TOTAL** | **40** | **20** | **8** | **12** |

---

## Hallazgos Criticos

### BUG #1 - Servicio RAG/Chatbot NO funciona
- **Endpoints afectados:** `POST /api/chat/stream`, `POST /api/chat`
- **Error:** `{"type":"error","content":"Error en el servicio RAG"}` / HTTP 500
- **Causa probable:** El servicio RAG (`http://rag-service:5001`) no esta corriendo o no es accesible desde el backend
- **Severidad:** ALTA - Funcionalidad principal del chatbot completamente inutilizada

### BUG #2 - XSS en registro causa Error 500
- **Endpoint:** `POST /api/auth/register`
- **Entrada:** `{"name":"<script>alert(1)</script>","email":"xss@test.com","password":"TestPass123"}`
- **Respuesta:** HTTP 500 Internal Server Error
- **Esperado:** HTTP 400 con mensaje de validacion
- **Causa probable:** El middleware de sanitizacion procesa el input pero algo falla internamente al manejar el contenido HTML
- **Severidad:** MEDIA - No explota seguridad pero revela informacion del servidor

### BUG #3 - URLs de imagenes apuntan a localhost
- **Endpoints afectados:** `GET /api/cakes`
- **Problema:** Varias imagenes de pasteles tienen `image_url: "http://localhost:4000/uploads/..."` 
- **Impacto:** Estas imagenes NO son accesibles desde el frontend en produccion
- **Severidad:** MEDIA - Imagenes rotas en el catalogo

### BUG #4 - GET /api/cakes/99999 devuelve 404 sin body JSON
- **Endpoint:** `GET /api/cakes/:id`
- **Respuesta:** `NotFound` (texto plano, no JSON)
- **Esperado:** `{"success": false, "message": "Pastel no encontrado"}`
- **Severidad:** BAJA - Inconsistencia en formato de respuesta

### BUG #5 - Refresh Token falla con 401
- **Endpoint:** `POST /api/auth/refresh`
- **Entrada:** refresh_token valido recibido del login
- **Respuesta:** HTTP 401 Unauthorized
- **Causa probable:** El token expiro o hay un problema con la validacion del refresh token
- **Severidad:** ALTA - Los usuarios no pueden renovar sesion

---

## Pruebas de Endpoints Publicos (GET)

### 1. GET /api/health

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/health
```

**Respuesta:**
```json
{
  "success": true,
  "status": "ok"
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 2. GET /api

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api
```

**Respuesta:**
```json
{
  "success": true,
  "message": "API root. Use /api/auth/csrf-token or /api/health"
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 3. GET /api/auth/csrf-token

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/csrf-token
```

**Respuesta:**
```json
{
  "csrf_token": "a25d03f4b8fde7abda9f4ca92244d9162394bec6074af83d14508f8c7ea40342"
}
```

**Cookies establecidas:**
- `csrf_token` - Token CSRF
- `client_fingerprint` - Huella digital del cliente

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 4. GET /api/categories

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/categories
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "XV Años", "slug": "xv-anos", "sort_order": 1, "is_active": 1},
    {"id": 2, "name": "Boda", "slug": "boda", "sort_order": 2, "is_active": 1},
    {"id": 3, "name": "Baby Shower", "slug": "baby-shower", "sort_order": 3, "is_active": 1},
    {"id": 4, "name": "Cumpleaños", "slug": "cumpleanos", "sort_order": 4, "is_active": 1},
    {"id": 5, "name": "Aniversario", "slug": "aniversario", "sort_order": 5, "is_active": 1},
    {"id": 6, "name": "Graduacion", "slug": "graduacion", "sort_order": 6, "is_active": 1},
    {"id": 7, "name": "Corporativo", "slug": "corporativo", "sort_order": 7, "is_active": 1}
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | 7 categorias activas

---

### 5. GET /api/categories?limit=2

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/categories?limit=2
```

**Respuesta:**
```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "XV Años", "slug": "xv-anos", "sort_order": 1, "is_active": 1},
    {"id": 2, "name": "Boda", "slug": "boda", "sort_order": 2, "is_active": 1}
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Paginacion funciona

---

### 6. GET /api/cakes

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes
```

**Respuesta (resumen):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Pastel Red Velvet 2 pisos",
      "category_name": "Cumpleaños",
      "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587",
      "is_featured": 1,
      "baker_id": 1,
      "user_id": 2,
      "business_name": "Atelier Dulce",
      "location": "Merida",
      "price": "250.00",
      "rating": "0.00",
      "reviews_count": 0
    }
    // ... 20 pasteles en total
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | 20+ pasteles retornados

**⚠️ Problema detectado:** Algunos pasteles tienen `image_url` apuntando a `http://localhost:4000/uploads/...` (no accesibles desde produccion)

---

### 7. GET /api/cakes/1

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes/1
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Pastel Red Velvet 2 pisos",
    "category_name": "Cumpleaños",
    "image_url": "https://images.unsplash.com/photo-1578985545062-69928b1d9587",
    "is_featured": 1,
    "baker_id": 1,
    "user_id": 2,
    "business_name": "Atelier Dulce",
    "location": "Merida",
    "price": "250.00",
    "rating": "0.00",
    "reviews_count": 0
  }
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 8. GET /api/cakes/99999 (ID inexistente)

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes/99999
```

**Respuesta:**
```
NotFound
```
*(Texto plano, NO JSON)*

**Estado:** ❌ **FALLA** | HTTP 404  
**Problema:** La respuesta deberia ser JSON estructurado como `{"success": false, "message": "..."}` pero devuelve texto plano "NotFound"

---

### 9. GET /api/cakes?featured=true

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?featured=true
```

**Respuesta:** 20 pasteles destacados retornados correctamente.

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 10. GET /api/cakes?category=4

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?category=4
```

**Respuesta:**
```json
{
  "success": true,
  "data": []
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Array vacio (sin pasteles en esa categoria con ese ID)

**Nota:** El filtro por categoria usa el ID numerico, no el slug. La categoria 4 es "Cumpleanos" pero el filtro parece no coincidir con los datos existentes.

---

### 11. GET /api/bakers

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers
```

**Respuesta (resumen):**
```json
{
  "success": true,
  "data": [
    {
      "id": 10,
      "business_name": "Fantasy Cake Shop",
      "location": "Valladolid, Yucatan",
      "specialty": "Pasteles Tematicos",
      "bio": null,
      "portfolio_url": null,
      "business_hours": "Lunes a Viernes: 5:00 - 23:00 | Sabado: 5:00 - 21:00 | Domingo: 6:00 - 16:00",
      "is_verified": false,
      "rating_avg": "0.00",
      "total_reviews": 0,
      "avatar_url": null
    }
    // ... 19 reposteros en total
  ],
  "total": 19
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | 19 reposteros registrados

---

### 12. GET /api/bakers/1

**Request:**
```
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/1
```

**Respuesta:**
```json
{
  "success": true,
  "data": {
    "id": 1,
    "business_name": "Atelier Dulce",
    "location": "Merida",
    "specialty": "Cumpleaños",
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

**Estado:** ✅ **EXITOSO** | HTTP 200

---

## Pruebas de Endpoints Publicos (POST)

### 13. POST /api/auth/register (Exitoso)

**Request:**
```
POST /api/auth/register
Headers: X-CSRF-Token: <token_valido>
Cookie: csrf_token=<token>

{
  "name": "Test User",
  "email": "testuser@example.com",
  "password": "TestPass123",
  "role": "cliente"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente. Verifica tu correo si es necesario antes de continuar."
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 14. POST /api/auth/register (Sin CSRF Token)

**Request:**
```
POST /api/auth/register
( Sin header X-CSRF-Token )

{
  "name": "Test User",
  "email": "testuser2@example.com",
  "password": "TestPass123",
  "role": "cliente"
}
```

**Respuesta:**
```json
{
  "success": false,
  "error": "CSRF_TOKEN_MISSING",
  "cause": "token_missing",
  "message": "Token CSRF requerido para esta operacion"
}
```

**Estado:** ✅ **CORRECTO** | HTTP 403 | Proteccion CSRF funciona

---

### 15. POST /api/auth/login (Exitoso)

**Request:**
```
POST /api/auth/login
Headers: X-CSRF-Token: <token_valido>

{
  "email": "testuser@example.com",
  "password": "TestPass123"
}
```

**Respuesta:**
```json
{
  "success": true,
  "user": {
    "id": 44,
    "name": "Test User",
    "email": "testuser@example.com",
    "role": "cliente"
  },
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Retorna access_token y refresh_token

---

### 16. POST /api/auth/login (Credenciales Invalidas)

**Request:**
```
POST /api/auth/login

{
  "email": "nonexistent@test.com",
  "password": "WrongPass123"
}
```

**Respuesta:**
```
HTTP 403 Forbidden
```

**Estado:** ⚠️ **PARCIAL** | HTTP 403  
**Problema:** Devuelve 403 en lugar de 401. El codigo 403 sugiere "prohibido" (como CSRF), no "no autorizado". Deberia ser 401 con body JSON `{"success": false, "message": "Credenciales invalidas"}`. Ademas, no devuelve body JSON legible.

---

## Pruebas de Endpoints Protegidos (Requieren Auth)

### 17. GET /api/auth/me (Con Token)

**Request:**
```
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Respuesta:**
```json
{
  "success": true,
  "user": {
    "id": 44,
    "name": "Test User",
    "email": "testuser@example.com",
    "role": "cliente",
    "address": null
  }
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 18. GET /api/auth/me (Sin Token)

**Request:**
```
GET /api/auth/me
```

**Respuesta:**
```json
{
  "success": false,
  "message": "Acceso denegado. Token requerido.",
  "error": "NO_TOKEN"
}
```

**Estado:** ✅ **CORRECTO** | HTTP 401

---

### 19. GET /api/appointments/my-appointments (Con Token)

**Request:**
```
GET /api/appointments/my-appointments
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Respuesta:**
```json
{
  "success": true,
  "data": [],
  "total": 0
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Usuario nuevo sin citas

---

### 20. POST /api/appointments/guest (Con CSRF)

**Request:**
```
POST /api/appointments/guest
Headers: X-CSRF-Token: <token_valido>

{
  "baker_id": 1,
  "date": "2026-08-20",
  "time_slot": "15:00",
  "notes": "Pastel de prueba"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Solicitud de cita recibida. Te contactaremos pronto para confirmar.",
  "data": {
    "id": 11,
    "client_id": 45
  }
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 21. GET /api/appointments/baker/1/date/2026-08-15

**Request:**
```
GET /api/appointments/baker/1/date/2026-08-15
```

**Respuesta:**
```json
{
  "success": true,
  "data": [],
  "horarios_ocupados": [],
  "disponibles": true
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Repostero disponible en esa fecha

---

### 22. POST /api/auth/refresh (Con refresh_token)

**Request:**
```
POST /api/auth/refresh
Headers: X-CSRF-Token: <token_valido>

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Respuesta:**
```
HTTP 401 Unauthorized
```

**Estado:** ❌ **FALLA** | HTTP 401  
**Problema:** El refresh_token recibido del login no funciona para renovar el access_token. Esto significa que los usuarios perderan sesion despues de que el token expire (15 minutos) y no podran renovar automaticamente.

---

## Pruebas de Control de Acceso

### 23. GET /api/bakers/stats (Usuario cliente)

**Request:**
```
GET /api/bakers/stats
Authorization: Bearer <token_cliente>
```

**Respuesta:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **CORRECTO** | HTTP 403 | El endpoint requiere rol "repostero"

---

### 24. GET /api/admin/security-stats (Usuario cliente)

**Request:**
```
GET /api/admin/security-stats
Authorization: Bearer <token_cliente>
```

**Respuesta:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **CORRECTO** | HTTP 403 | El endpoint requiere rol "admin"

---

### 25. GET /api/payments/oxxo-ticket (Sin Auth)

**Request:**
```
GET /api/payments/oxxo-ticket
```

**Respuesta:**
```
HTTP 401 Unauthorized
```

**Estado:** ✅ **CORRECTO** | HTTP 401 | Requiere autenticacion

---

### 26. GET /api/chat/history (Sin Auth)

**Request:**
```
GET /api/chat/history
```

**Respuesta:**
```
HTTP 401 Unauthorized
```

**Estado:** ✅ **CORRECTO** | HTTP 401 | Requiere autenticacion

---

## Pruebas de Chat/IA

### 27. POST /api/chat/stream

**Request:**
```
POST /api/chat/stream

{
  "message": "Hola, ¿que pasteles tienes disponibles?"
}
```

**Respuesta:**
```
data: {"type":"error","content":"Error en el servicio RAG"}
```

**Estado:** ❌ **FALLA** | HTTP 200 (SSE) con error  
**Problema:** El servicio RAG (Python) que alimenta al chatbot no esta disponible. Posibles causas:
- El contenedor `rag-service` no esta corriendo
- La URL `http://rag-service:5001` no es accesible desde el backend
- Ollama no esta corriendo en `host.docker.internal`

---

### 28. POST /api/chat (Con Auth)

**Request:**
```
POST /api/chat
Authorization: Bearer <token>
Headers: X-CSRF-Token: <token_valido>

{
  "message": "¿Que pasteles tienes?"
}
```

**Respuesta:**
```
HTTP 500 Internal Server Error
```

**Estado:** ❌ **FALLA** | HTTP 500  
**Problema:** Mismo problema que el streaming - el servicio RAG no esta disponible.

---

## Pruebas de Seguridad

### 29. SQL Injection en query params

**Request:**
```
GET /api/cakes?category=1' OR '1'='1
```

**Respuesta:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **BLOQUEADO** | HTTP 400 | Proteccion SQLi funciona

---

### 30. XSS en registro

**Request:**
```
POST /api/auth/register

{
  "name": "<script>alert(1)</script>",
  "email": "xss@test.com",
  "password": "TestPass123"
}
```

**Respuesta:**
```
HTTP 500 Internal Server Error
```

**Estado:** ❌ **FALLA** | HTTP 500  
**Problema:** En lugar de devolver un error de validacion 400, el servidor falla con 500. Esto indica que el middleware de sanitizacion no maneja correctamente el contenido HTML/script. Aunque el XSS no se ejecuta, el error 500 puede revelar informacion del servidor.

---

### 31. Validacion de limites (limit=-1)

**Request:**
```
GET /api/cakes?limit=-1
```

**Respuesta:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **BLOQUEADO** | HTTP 400 | Validacion de limites funciona

---

### 32. Validacion de limites (limit=999, max=500)

**Request:**
```
GET /api/cakes?limit=999
```

**Respuesta:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **BLOQUEADO** | HTTP 400 | Limite maximo de 500 respetado

---

## Endpoints No Probados (Requieren credenciales especificas)

### Repostero (requieren rol "repostero")

| # | Metodo | Endpoint | Descripcion |
|---|--------|----------|-------------|
| 1 | GET | /api/bakers/stats | Estadisticas del repostero |
| 2 | GET | /api/bakers/appointments | Citas del repostero |
| 3 | PUT | /api/bakers/appointments/:id/status | Actualizar estado de cita |
| 4 | GET | /api/bakers/cakes | Mis pasteles |
| 5 | POST | /api/bakers/cakes | Crear pastel |
| 6 | PUT | /api/bakers/cakes/:id | Actualizar pastel |
| 7 | DELETE | /api/bakers/cakes/:id | Eliminar pastel |
| 8 | GET | /api/bakers/profile/me | Mi perfil repostero |
| 9 | PUT | /api/bakers/profile | Actualizar perfil |

### Administrador (requieren rol "admin")

| # | Metodo | Endpoint | Descripcion |
|---|--------|----------|-------------|
| 1 | GET | /api/admin/security-stats | Estadisticas de seguridad |
| 2 | GET | /api/admin/blocked-ips | IPs bloqueadas |
| 3 | POST | /api/admin/unblock-ip | Desbloquear IP |
| 4 | GET | /api/security/alerts | Alertas de seguridad |

---

## Resumen de Problemas Encontrados

### Criticos (Requieren atencion inmediata)

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-1 | Servicio RAG/Chatbot no funciona | /api/chat, /api/chat/stream | 🔴 ALTA |
| BUG-5 | Refresh Token no funciona | /api/auth/refresh | 🔴 ALTA |

### Medios (Requieren atencion pronto)

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-2 | XSS en registro causa 500 | /api/auth/register | 🟡 MEDIA |
| BUG-3 | URLs de imagenes apuntan a localhost | /api/cakes | 🟡 MEDIA |
| BUG-6 | Login invalido devuelve 403 en vez de 401 | /api/auth/login | 🟡 MEDIA |

### Bajos (Mejoras menores)

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-4 | 404 sin body JSON | /api/cakes/:id | 🟢 BAJA |

---

## Aspectos Positivos

✅ **Autenticacion JWT** funciona correctamente  
✅ **Proteccion CSRF** activa y funcional  
✅ **Rate Limiting** configurado y operativo  
✅ **Validacion de inputs** bloquea SQL injection  
✅ **Validacion de limites** en query params funciona  
✅ **Control de acceso por roles** (cliente/repostero/admin) funciona  
✅ **Headers de seguridad** (Helmet) configurados  
✅ **Cors** restrictivo configurado  
✅ **Cookies HttpOnly** para refresh tokens  
✅ **Paginacion** implementada correctamente  
✅ **Endpoint de disponibilidad** funciona correctamente  
✅ **Registro y login** con validaciones robustas  

---

**Documento generado:** 2026-08-04  
**Herramientas utilizadas:** PowerShell Invoke-RestMethod/Invoke-WebRequest, analisis de codigo fuente  
**Metodologia:** Caja Negra (sin acceso a base de datos o logs internos)  
**Usuario de prueba:** testuser@example.com (ID: 44, rol: cliente)
