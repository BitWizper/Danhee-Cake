# Pruebas API - Rutas de Clientes (sin Chatbot)

**Fecha de Prueba:** 2026-08-04  
**Backend URL:** https://subsidiary-drivers-stands-laser.trycloudflare.com  
**Usuario de Prueba:** testuser@example.com (ID: 44, Rol: cliente)

---

## Resumen de Rutas de Clientes

| # | Método | Endpoint | Descripción | Estado |
|---|--------|----------|-------------|--------|
| 1 | GET | /api/auth/csrf-token | Obtener token CSRF | ✅ Funciona |
| 2 | POST | /api/auth/register | Registrar usuario | ✅ Funciona |
| 3 | POST | /api/auth/login | Iniciar sesión | ✅ Funciona |
| 4 | POST | /api/auth/refresh | Renovar token | ❌ **FALLA** |
| 5 | POST | /api/auth/logout | Cerrar sesión | ⚠️ **NO PROBADO** |
| 6 | GET | /api/auth/me | Obtener usuario actual | ✅ Funciona |
| 7 | GET | /api/categories | Listar categorías | ✅ Funciona |
| 8 | GET | /api/cakes | Listar pasteles | ✅ Funciona |
| 9 | GET | /api/cakes/:id | Detalle de pastel | ✅ Funciona |
| 10 | GET | /api/bakers | Listar reposteros | ✅ Funciona |
| 11 | GET | /api/bakers/:id | Perfil de repostero | ✅ Funciona |
| 12 | GET | /api/appointments/baker/:baker_id/date/:date | Verificar disponibilidad | ⚠️ **NO PROBADO** |
| 13 | POST | /api/appointments/guest | Crear cita como invitado | ⚠️ **NO PROBADO** |
| 14 | POST | /api/appointments | Crear cita (autenticado) | ⚠️ **NO PROBADO** |
| 15 | GET | /api/appointments/my-appointments | Mis citas | ⚠️ **NO PROBADO** |
| 16 | DELETE | /api/appointments/:id | Cancelar cita | ⚠️ **NO PROBADO** |
| 17 | POST | /api/payments/oxxo-ticket | Generar ticket OXXO | ⚠️ **NO PROBADO** |

**Total:** 17 rutas  
**Funcionales:** 10 (59%)  
**Fallidas:** 1 (6%)  
**No probadas:** 6 (35%)

**NOTA:** Las pruebas se interrumpieron debido a bloqueo de IP por rate limiting (HTTP 429).

---

## Bug Crítico: Refresh Token no funciona

**Endpoint:** POST /api/auth/refresh  
**Estado:** ❌ **FALLA** | HTTP 401 Unauthorized

**Qué mandé:**
```http
POST /api/auth/refresh
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

**Impacto:** Los usuarios no pueden renovar su sesión automáticamente. Después de 15 minutos (tiempo de expiración del access_token), el usuario debe volver a iniciar sesión manualmente.

---

## Pruebas Detalladas

### 1. GET /api/auth/csrf-token

**Qué espera:** Obtener token CSRF para proteger contra ataques CSRF

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

**Cookies establecidas:**
- csrf_token
- client_fingerprint

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 2. POST /api/auth/register

**Qué espera:** Registrar un nuevo usuario

**Qué mandé:**
```http
POST /api/auth/register
Content-Type: application/json
X-CSRF-Token: <token_válido>

{
  "name": "Test User",
  "email": "testuser@example.com",
  "password": "TestPass123",
  "role": "cliente"
}
```

**Qué devuelve:**
```json
{
  "success": true,
  "message": "Usuario registrado exitosamente. Verifica tu correo si es necesario antes de continuar."
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 3. POST /api/auth/login

**Qué espera:** Iniciar sesión y obtener tokens

**Qué mandé:**
```http
POST /api/auth/login
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
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIs..."
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 4. POST /api/auth/refresh

**Qué espera:** Renovar access_token usando refresh_token

**Qué mandé:**
```http
POST /api/auth/refresh
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
**Problema:** El refresh_token no es aceptado por el servidor. Posibles causas:
- El token expiró
- Problema con la validación del token
- El token fue invalidado

---

### 5. POST /api/auth/logout

**Qué espera:** Cerrar sesión e invalidar refresh_token

**Qué mandé:**
```http
POST /api/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: <token_válido>
Content-Type: application/json

{
  "refresh_token": "from_cookie"
}
```

**Qué devuelve:**
```
⚠️ NO PROBADO - IP bloqueada por rate limiting
```

**Estado:** ⚠️ **NO PROBADO**

---

### 6. GET /api/auth/me (con token)

**Qué espera:** Obtener información del usuario autenticado

**Qué mandé:**
```http
GET /api/auth/me
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

### 7. GET /api/auth/me (sin token)

**Qué espera:** Obtener error 401 por falta de autenticación

**Qué mandé:**
```http
GET /api/auth/me
```

**Qué devuelve:**
```
HTTP 401 Unauthorized
```

**Estado:** ✅ **EXITOSO** | HTTP 401 | Protección funciona correctamente

---

### 8. GET /api/categories

**Qué espera:** Lista de categorías de pasteles

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

**Estado:** ✅ **EXITOSO** | HTTP 200 | 7 categorías

---

### 9. GET /api/cakes

**Qué espera:** Lista de pasteles disponibles

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
      "business_name": "Atelier Dulce",
      "location": "Merida",
      "price": "250.00",
      "rating": "0.00",
      "reviews_count": 0
    }
    // ... 20+ pasteles
  ]
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

**⚠️ Problema detectado:** Algunas imágenes apuntan a `http://localhost:4000/uploads/...` (no accesibles)

---

### 10. GET /api/cakes/:id

**Qué espera:** Detalle de un pastel específico

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

### 11. GET /api/bakers

**Qué espera:** Lista de reposteros registrados

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
      "business_hours": "Lunes a Viernes: 5:00 - 23:00 | Sábado: 5:00 - 21:00 | Domingo: 6:00 - 16:00",
      "is_verified": false,
      "rating_avg": "0.00",
      "total_reviews": 0,
      "avatar_url": null
    }
    // ... 20 reposteros
  ],
  "total": 20
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 12. GET /api/bakers/:id

**Qué espera:** Perfil público de un repostero

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

## Rutas No Probadas (IP Bloqueada)

Las siguientes rutas no pudieron probarse debido a que la IP fue bloqueada por rate limiting:

### 13. GET /api/appointments/baker/:baker_id/date/:date

**Qué espera:** Verificar disponibilidad de un repostero en una fecha

**Endpoint:**
```http
GET /api/appointments/baker/1/date/2026-09-15
```

**Estado:** ⚠️ **NO PROBADO**

---

### 14. POST /api/appointments/guest

**Qué espera:** Crear cita como invitado (sin autenticación)

**Endpoint:**
```http
POST /api/appointments/guest
Content-Type: application/json
X-CSRF-Token: <token>

{
  "baker_id": 1,
  "date": "2026-09-15",
  "time_slot": "10:00",
  "notes": "Pastel de cumpleaños"
}
```

**Estado:** ⚠️ **NO PROBADO**

---

### 15. POST /api/appointments (autenticado)

**Qué espera:** Crear cita como usuario autenticado

**Endpoint:**
```http
POST /api/appointments
Authorization: Bearer <token>
X-CSRF-Token: <token>
Content-Type: application/json

{
  "baker_id": 1,
  "date": "2026-09-20",
  "time_slot": "14:00",
  "notes": "Pastel de bodas"
}
```

**Estado:** ⚠️ **NO PROBADO**

---

### 16. GET /api/appointments/my-appointments

**Qué espera:** Obtener citas del usuario autenticado

**Endpoint:**
```http
GET /api/appointments/my-appointments
Authorization: Bearer <token>
```

**Estado:** ⚠️ **NO PROBADO**

---

### 17. DELETE /api/appointments/:id

**Qué espera:** Cancelar una cita

**Endpoint:**
```http
DELETE /api/appointments/:id
Authorization: Bearer <token>
X-CSRF-Token: <token>
```

**Estado:** ⚠️ **NO PROBADO**

---

### 18. POST /api/payments/oxxo-ticket

**Qué espera:** Generar ticket de pago OXXO

**Endpoint:**
```http
POST /api/payments/oxxo-ticket
Authorization: Bearer <token>
X-CSRF-Token: <token>
Content-Type: application/json

{
  "orderId": "order_123",
  "amount": 500.00
}
```

**Estado:** ⚠️ **NO PROBADO**

---

## Resumen de Bugs Encontrados

### 🔴 CRÍTICO

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-1 | Refresh Token no funciona | POST /api/auth/refresh | 🔴 ALTA |

### 🟡 MEDIO

| ID | Problema | Endpoint | Severidad |
|----|----------|----------|-----------|
| BUG-2 | URLs de imágenes apuntan a localhost | GET /api/cakes | 🟡 MEDIA |

---

## Aspectos Positivos

✅ Autenticación JWT funciona correctamente  
✅ Protección CSRF activa y funcional  
✅ Validación de inputs bloquea SQL injection  
✅ Control de acceso por roles funciona  
✅ Endpoints públicos (categorías, pasteles, reposteros) funcionan  
✅ Paginación implementada correctamente  
✅ Rate limiting previene abuso  

---

## Próximos Pasos

1. **Prioridad ALTA:** Corregir bug de refresh token
2. **Prioridad MEDIA:** Corregir URLs de imágenes (localhost → Cloudinary)
3. **Prioridad BAJA:** Completar pruebas de appointments y payments cuando IP sea desbloqueada

---

**Documento generado:** 2026-08-04  
**Herramientas utilizadas:** PowerShell Invoke-WebRequest/Invoke-RestMethod  
**Metodología:** Caja Negra con credenciales de cliente  
**Nota:** Pruebas interrumpidas por bloqueo de IP (rate limiting)
