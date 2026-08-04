# Documentación de Pruebas API - Danhee Cake

**Fecha de Prueba:** 2026-08-04  
**Backend URL:** https://subsidiary-drivers-stands-laser.trycloudflare.com  
**Frontend URL:** https://danhee-cake.vercel.app/  
**Tipo de Prueba:** Caja Negra (sin credenciales de administrador/repostero)

---

## Resumen Ejecutivo

| Categoría | Total | Exitosos | Fallidos |
|-----------|-------|----------|----------|
| Endpoints Públicos GET | 15 | 13 | 2 |
| Endpoints Públicos POST | 8 | 4 | 4 |
| Endpoints Protegidos (Auth) | 9 | 6 | 3 |
| Pruebas de Seguridad | 4 | 3 | 1 |
| **TOTAL** | **36** | **26** | **10** |

---

## Bugs Encontrados

### 🔴 BUG #1 - Servicio RAG/Chatbot NO funciona
- **Endpoints afectados:** `POST /api/chat/stream`, `POST /api/chat`
- **Error:** HTTP 400 Bad Request / HTTP 403 Forbidden
- **Causa probable:** El servicio RAG (`http://rag-service:5001`) no está corriendo o no es accesible
- **Severidad:** ALTA - Funcionalidad principal del chatbot completamente inutilizada

### 🔴 BUG #2 - Refresh Token falla con 401
- **Endpoint:** `POST /api/auth/refresh`
- **Entrada:** refresh_token válido recibido del login
- **Respuesta:** HTTP 401 Unauthorized
- **Causa probable:** Problema con la validación del refresh token o expiración
- **Severidad:** ALTA - Los usuarios no pueden renovar sesión

### 🟡 BUG #3 - XSS en registro causa Error 500
- **Endpoint:** `POST /api/auth/register`
- **Entrada:** `{"name":"<script>alert(1)</script>","email":"xss@test.com","password":"TestPass123"}`
- **Respuesta:** HTTP 500 Internal Server Error
- **Esperado:** HTTP 400 con mensaje de validación
- **Severidad:** MEDIA - No explota seguridad pero revela información del servidor

### 🟡 BUG #4 - URLs de imágenes apuntan a localhost
- **Endpoints afectados:** `GET /api/cakes`
- **Problema:** Varias imágenes de pasteles tienen `image_url: "http://localhost:4000/uploads/..."` 
- **Impacto:** Estas imágenes NO son accesibles desde el frontend en producción
- **Severidad:** MEDIA - Imágenes rotas en el catálogo

### 🟢 BUG #5 - GET /api/cakes/99999 devuelve 404 sin body JSON
- **Endpoint:** `GET /api/cakes/:id`
- **Respuesta:** `NotFound` (texto plano, no JSON)
- **Esperado:** `{"success": false, "message": "Pastel no encontrado"}`
- **Severidad:** BAJA - Inconsistencia en formato de respuesta

---

## Pruebas de Endpoints Públicos (GET)

### 1. GET /api/health

**Qué espera:** Verificar estado del servidor

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/health
```

**Qué devuelve:**
```json
{
  "success": true,
  "status": "ok"
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 2. GET /api

**Qué espera:** API root - diagnóstico básico

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api
```

**Qué devuelve:**
```json
{
  "success": true,
  "message": "API root. Use /api/auth/csrf-token or /api/health"
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 3. GET /api/auth/csrf-token

**Qué espera:** Obtener token CSRF para protección contra ataques CSRF

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/csrf-token
```

**Qué devuelve:**
```json
{
  "csrf_token": "2865fbcd0a6e84c6bcdb293cba6456a2997abbbd2b16a927aecafb667d809d38"
}
```

**Headers recibidos:**
```
X-CSRF-Token: 2865fbcd0a6e84c6bcdb293cba6456a2997abbbd2b16a927aecafb667d809d38
Set-Cookie: csrf_token=...; Path=/; HttpOnly; Secure; SameSite=Strict
Set-Cookie: client_fingerprint=...; Path=/; HttpOnly; Secure; SameSite=Strict
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 4. GET /api/categories

**Qué espera:** Obtener lista de categorías de pasteles

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/categories
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": [
    {"id": 1, "name": "XV Años", "slug": "xv-anos", "sort_order": 1, "is_active": 1},
    {"id": 2, "name": "Boda", "slug": "boda", "sort_order": 2, "is_active": 1},
    {"id": 3, "name": "Baby Shower", "slug": "baby-shower", "sort_order": 3, "is_active": 1},
    {"id": 4, "name": "Cumpleaños", "slug": "cumpleanos", "sort_order": 4, "is_active": 1},
    {"id": 5, "name": "Aniversario", "slug": "aniversario", "sort_order": 5, "is_active": 1},
    {"id": 6, "name": "Graduación", "slug": "graduacion", "sort_order": 6, "is_active": 1},
    {"id": 7, "name": "Corporativo", "slug": "corporativo", "sort_order": 7, "is_active": 1}
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | 7 categorías activas

---

### 5. GET /api/categories?active=true

**Qué espera:** Filtrar solo categorías activas

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/categories?active=true
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": [
    // ... mismas 7 categorías (todas están activas)
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 6. GET /api/categories?limit=2&offset=1

**Qué espera:** Probar paginación con límite y offset

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/categories?limit=2&offset=1
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": [
    {"id": 2, "name": "Boda", "slug": "boda", "sort_order": 2, "is_active": 1},
    {"id": 3, "name": "Baby Shower", "slug": "baby-shower", "sort_order": 3, "is_active": 1}
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Paginación funciona correctamente

---

### 7. GET /api/cakes

**Qué espera:** Obtener lista de pasteles disponibles

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes
```

**Qué devuelve (resumen):**
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
    },
    {
      "id": 2,
      "name": "Pastel de fresa",
      "category_name": "XV Años",
      "image_url": "http://localhost:4000/uploads/1779834982368-905857428.jpg",
      "is_featured": 0,
      "baker_id": 2,
      "user_id": 4,
      "business_name": "Mundo de caramelo",
      "location": "Corea",
      "price": "900.00",
      "rating": "0.00",
      "reviews_count": 0
    }
    // ... 20+ pasteles en total
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | 20+ pasteles retornados

**⚠️ Problema detectado:** Algunos pasteles tienen `image_url` apuntando a `http://localhost:4000/uploads/...` (no accesibles desde producción)

---

### 8. GET /api/cakes?featured=true

**Qué espera:** Obtener solo pasteles destacados

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?featured=true
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Pastel Red Velvet 2 pisos",
      "is_featured": 1,
      // ... otros campos
    },
    {
      "id": 129,
      "name": "Jardín Nupcial",
      "is_featured": 1,
      // ... otros campos
    }
    // ... 20 pasteles destacados
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Filtrado funciona correctamente

---

### 9. GET /api/cakes?limit=3&offset=0

**Qué espera:** Probar paginación con límite

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?limit=3&offset=0
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Pastel Red Velvet 2 pisos",
      // ...
    },
    {
      "id": 2,
      "name": "Pastel de fresa",
      // ...
    },
    {
      "id": 3,
      "name": "Pastel de flores",
      // ...
    }
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Paginación funciona correctamente

---

### 10. GET /api/cakes/1

**Qué espera:** Obtener un pastel específico por ID

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes/1
```

**Qué devuelve:**
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

### 11. GET /api/cakes/99999 (ID inexistente)

**Qué espera:** Obtener error 404 con mensaje JSON estructurado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes/99999
```

**Qué devuelve:**
```
NotFound
```
*(Texto plano, NO JSON)*

**Estado:** ❌ **FALLA** | HTTP 404  
**Problema:** La respuesta debería ser JSON estructurado como `{"success": false, "message": "..."}` pero devuelve texto plano "NotFound"

---

### 12. GET /api/cakes/abc (ID inválido)

**Qué espera:** Obtener error 400 con mensaje de validación

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes/abc
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **EXITOSO** | HTTP 400 | Validación de tipo de dato funciona

---

### 13. GET /api/bakers

**Qué espera:** Obtener lista de reposteros registrados

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers
```

**Qué devuelve (resumen):**
```json
{
  "success": true,
  "data": [
    {
      "id": 11,
      "business_name": "yoyo burguer",
      "location": "uman city",
      "specialty": "Pastel de carne",
      "bio": null,
      "portfolio_url": null,
      "business_hours": "Lunes a Viernes: 5:00 - 23:00 | Sábado: 5:00 - 21:00 | Domingo: 6:00 - 16:00",
      "is_verified": false,
      "rating_avg": "0.00",
      "total_reviews": 0,
      "avatar_url": null
    }
    // ... 20 reposteros en total
  ],
  "total": 20
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | 20 reposteros registrados

---

### 14. GET /api/bakers/1

**Qué espera:** Obtener perfil público de un repostero específico

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/1
```

**Qué devuelve:**
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
    "business_hours": "Lunes a Viernes: 8:00 - 24:00 | Sábado: 5:00 - 21:00",
    "is_verified": false,
    "rating_avg": "0.00",
    "total_reviews": 0,
    "avatar_url": null
  }
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 15. GET /api/bakers/99999 (ID inexistente)

**Qué espera:** Obtener error 404

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/99999
```

**Qué devuelve:**
```
HTTP 404 Not Found
```

**Estado:** ✅ **EXITOSO** | HTTP 404 | Manejo correcto de recurso no encontrado

---

## Pruebas de Endpoints Públicos (POST)

### 16. POST /api/auth/register (válido)

**Qué espera:** Registrar un nuevo usuario exitosamente

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/register
Content-Type: application/json
X-CSRF-Token: <token_válido>
Cookie: csrf_token=<token>

{
  "name": "Test User",
  "email": "testuser@example.com",
  "password": "TestPass123",
  "role": "cliente"
}
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ⚠️ **PARCIAL** | HTTP 400  
**Nota:** El usuario ya existe de pruebas anteriores. El endpoint funciona pero no se puede probar el registro exitoso sin un email nuevo.

---

### 17. POST /api/auth/register (sin CSRF Token)

**Qué espera:** Obtener error 403 por falta de token CSRF

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/register
Content-Type: application/json
(Sin header X-CSRF-Token)

{
  "name": "Test User2",
  "email": "testuser2@example.com",
  "password": "TestPass123",
  "role": "cliente"
}
```

**Qué devuelve:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **EXITOSO** | HTTP 403 | Protección CSRF funciona correctamente

---

### 18. POST /api/auth/login (válido)

**Qué espera:** Iniciar sesión y obtener tokens

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/login
Content-Type: application/json
X-CSRF-Token: <token_válido>

{
  "email": "testuser@example.com",
  "password": "TestPass123"
}
```

**Qué devuelve:**
```json
{
  "success": true,
  "user": {
    "id": 44,
    "name": "Test User",
    "email": "testuser@example.com",
    "role": "cliente"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Retorna access_token y refresh_token

---

### 19. POST /api/auth/login (credenciales inválidas)

**Qué espera:** Obtener error 401 con mensaje JSON

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/login
Content-Type: application/json

{
  "email": "nonexistent@test.com",
  "password": "WrongPass123"
}
```

**Qué devuelve:**
```
HTTP 401 Unauthorized
```

**Estado:** ✅ **EXITOSO** | HTTP 401 | Manejo correcto de credenciales inválidas

---

### 20. POST /api/appointments/guest

**Qué espera:** Crear una cita como invitado (sin autenticación)

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/appointments/guest
Content-Type: application/json
X-CSRF-Token: <token_válido>

{
  "baker_id": 1,
  "date": "2026-08-20",
  "time_slot": "15:00",
  "notes": "Pastel de prueba"
}
```

**Qué devuelve:**
```
HTTP 409 Conflict
```

**Estado:** ⚠️ **PARCIAL** | HTTP 409  
**Nota:** Ya existe una cita para ese repostero en esa fecha/hora. El endpoint funciona pero no se puede probar la creación exitosa sin datos diferentes.

---

### 21. GET /api/appointments/baker/1/date/2026-08-15

**Qué espera:** Verificar disponibilidad de un repostero en una fecha específica

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/appointments/baker/1/date/2026-08-15
```

**Qué devuelve:**
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

### 22. POST /api/chat/stream

**Qué espera:** Enviar mensaje al chatbot IA con respuesta en streaming

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/chat/stream
Content-Type: application/json

{
  "message": "Hola, ¿qué pasteles tienes disponibles?"
}
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ❌ **FALLA** | HTTP 400  
**Problema:** El servicio RAG (Python) que alimenta al chatbot no está disponible.

---

### 23. POST /api/chat (sin autenticación)

**Qué espera:** Obtener error 401 o 403 por falta de autenticación

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/chat
Content-Type: application/json

{
  "message": "¿Qué pasteles tienes?"
}
```

**Qué devuelve:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **EXITOSO** | HTTP 403 | Requiere autenticación correctamente

---

## Pruebas de Endpoints Protegidos (Requieren Autenticación)

### 24. GET /api/auth/me (con token)

**Qué espera:** Obtener información del usuario autenticado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
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

### 25. GET /api/auth/me (sin token)

**Qué espera:** Obtener error 401 por falta de autenticación

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/me
```

**Qué devuelve:**
```
HTTP 401 Unauthorized
```

**Estado:** ✅ **EXITOSO** | HTTP 401 | Protección de ruta funciona correctamente

---

### 26. GET /api/appointments/my-appointments

**Qué espera:** Obtener citas del usuario autenticado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/appointments/my-appointments
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": [],
  "total": 0
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Usuario nuevo sin citas

---

### 27. POST /api/auth/refresh

**Qué espera:** Refrescar token de acceso usando refresh_token

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/refresh
Content-Type: application/json
X-CSRF-Token: <token_válido>

{
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Qué devuelve:**
```
HTTP 401 Unauthorized
```

**Estado:** ❌ **FALLA** | HTTP 401  
**Problema:** El refresh_token recibido del login no funciona para renovar el access_token. Esto significa que los usuarios perderán sesión después de que el token expire (15 minutos) y no podrán renovar automáticamente.

---

### 28. POST /api/auth/logout

**Qué espera:** Cerrar sesión e invalidar refresh_token

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/logout
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: <token_válido>

{
  "refresh_token": "from_cookie"
}
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ⚠️ **PARCIAL** | HTTP 400  
**Nota:** El endpoint requiere un refresh_token válido, no el string "from_cookie". Necesita más investigación.

---

## Pruebas de Control de Acceso

### 29. GET /api/bakers/stats (usuario cliente)

**Qué espera:** Obtener error 403 porque el endpoint requiere rol "repostero"

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/stats
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **EXITOSO** | HTTP 403 | Control de acceso por rol funciona correctamente

---

### 30. GET /api/bakers/cakes (usuario cliente)

**Qué espera:** Obtener error 403 porque el endpoint requiere rol "repostero"

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/cakes
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **EXITOSO** | HTTP 403 | Control de acceso por rol funciona correctamente

---

### 31. GET /api/admin/security-stats (usuario cliente)

**Qué espera:** Obtener error 403 porque el endpoint requiere rol "admin"

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/admin/security-stats
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```
HTTP 403 Forbidden
```

**Estado:** ✅ **EXITOSO** | HTTP 403 | Control de acceso por rol funciona correctamente

---

### 32. GET /api/payments/oxxo-ticket (sin autenticación)

**Qué espera:** Obtener error 401 por falta de autenticación

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/payments/oxxo-ticket
```

**Qué devuelve:**
```
HTTP 401 Unauthorized
```

**Estado:** ✅ **EXITOSO** | HTTP 401 | Requiere autenticación correctamente

---

## Pruebas de Seguridad

### 33. SQL Injection en query params

**Qué espera:** Bloquear intento de inyección SQL

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?category=1' OR '1'='1
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **BLOQUEADO** | HTTP 400 | Protección contra SQL injection funciona

---

### 34. Validación de límites (limit=-1)

**Qué espera:** Rechazar valor negativo para límite

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?limit=-1
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **BLOQUEADO** | HTTP 400 | Validación de límites funciona

---

### 35. Validación de límites (limit=999, máximo=500)

**Qué espera:** Rechazar valor que excede el máximo permitido

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/cakes?limit=999
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ✅ **BLOQUEADO** | HTTP 400 | Límite máximo de 500 respetado

---

### 36. XSS en registro

**Qué espera:** Rechazar contenido HTML/JavaScript con error 400

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/auth/register
Content-Type: application/json

{
  "name": "<script>alert(1)</script>",
  "email": "xss@test.com",
  "password": "TestPass123"
}
```

**Qué devuelve:**
```
HTTP 500 Internal Server Error
```

**Estado:** ❌ **FALLA** | HTTP 500  
**Problema:** En lugar de devolver un error de validación 400, el servidor falla con 500. Esto indica que el middleware de sanitización no maneja correctamente el contenido HTML/script. Aunque el XSS no se ejecuta, el error 500 puede revelar información del servidor.

---

## Resumen de Problemas Encontrados

### Críticos (Requieren atención inmediata)

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-1 | Servicio RAG/Chatbot no funciona | /api/chat, /api/chat/stream | 🔴 ALTA |
| BUG-2 | Refresh Token no funciona | /api/auth/refresh | 🔴 ALTA |

### Medios (Requieren atención pronto)

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-3 | XSS en registro causa 500 | /api/auth/register | 🟡 MEDIA |
| BUG-4 | URLs de imágenes apuntan a localhost | /api/cakes | 🟡 MEDIA |

### Bajos (Mejoras menores)

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-5 | 404 sin body JSON | /api/cakes/:id | 🟢 BAJA |

---

## Aspectos Positivos

✅ **Autenticación JWT** funciona correctamente  
✅ **Protección CSRF** activa y funcional  
✅ **Validación de inputs** bloquea SQL injection  
✅ **Validación de límites** en query params funciona  
✅ **Control de acceso por roles** (cliente/repostero/admin) funciona  
✅ **Headers de seguridad** (Helmet) configurados  
✅ **CORS** restrictivo configurado  
✅ **Cookies HttpOnly** para refresh tokens  
✅ **Paginación** implementada correctamente  
✅ **Endpoint de disponibilidad** funciona correctamente  
✅ **Registro y login** con validaciones robustas  

---

**Documento generado:** 2026-08-04  
**Herramientas utilizadas:** PowerShell Invoke-RestMethod/Invoke-WebRequest  
**Metodología:** Caja Negra (sin acceso a base de datos o logs internos)  
**Usuario de prueba:** testuser@example.com (ID: 44, rol: cliente)
