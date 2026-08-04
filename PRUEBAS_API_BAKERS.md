# Pruebas API - Rutas de Repostero (Bakers)

**Fecha de Prueba:** 2026-08-04  
**Backend URL:** https://subsidiary-drivers-stands-laser.trycloudflare.com  
**Usuario de Prueba:** baker@test.com (ID: 47, Rol: repostero, Baker ID: 21)

---

## Resumen de Rutas de Repostero

| # | Método | Endpoint | Descripción | Estado |
|---|--------|----------|-------------|--------|
| 1 | GET | /api/bakers | Listar reposteros (público) | ✅ Funciona |
| 2 | GET | /api/bakers/:id | Perfil público repostero | ✅ Funciona |
| 3 | GET | /api/bakers/stats | Estadísticas del repostero | ✅ Funciona |
| 4 | GET | /api/bakers/appointments | Citas del repostero | ✅ Funciona |
| 5 | PUT | /api/bakers/appointments/:id/status | Actualizar estado cita | ❌ **FALLA** |
| 6 | GET | /api/bakers/cakes | Mis pasteles | ✅ Funciona |
| 7 | POST | /api/bakers/cakes | Crear pastel | ⚠️ **PARCIAL** |
| 8 | PUT | /api/bakers/cakes/:id | Actualizar pastel | ❌ **FALLA** |
| 9 | DELETE | /api/bakers/cakes/:id | Eliminar pastel | ❌ **FALLA** |
| 10 | GET | /api/bakers/profile/me | Mi perfil | ✅ Funciona |
| 11 | PUT | /api/bakers/profile | Actualizar perfil | ❌ **FALLA** |

**Total:** 11 rutas  
**Funcionales:** 6 (55%)  
**Fallidas:** 5 (45%)

---

## BUG CRÍTICO: Métodos PUT y DELETE no funcionan

**Problema:** Todos los endpoints que usan métodos HTTP PUT y DELETE devuelven **405 Method Not Allowed**

**Endpoints afectados:**
- PUT /api/bakers/profile
- PUT /api/bakers/cakes/:id
- PUT /api/bakers/appointments/:id/status
- DELETE /api/bakers/cakes/:id

**Evidencia:**
```
Request: PUT /api/bakers/profile
Headers: Authorization: Bearer <token>, X-CSRF-Token: <csrf>
Body: {"business_name":"Test"}
Response: 405 Method Not Allowed
```

**Análisis:**
- El middleware `methodBlocker.js` permite PUT y DELETE
- El CORS preflight (OPTIONS) responde correctamente con `Access-Control-Allow-Methods: GET,POST,OPTIONS,HEAD,PUT,DELETE`
- El problema NO está en el backend Express (los métodos están permitidos)
- **Posible causa:** Configuración del servidor web (Nginx/Cloudflare Tunnel) que está bloqueando estos métodos

**Impacto:** CRÍTICO - Los reposteros NO pueden:
- Actualizar su perfil de negocio
- Crear pasteles (POST funciona parcialmente pero requiere imagen)
- Actualizar pasteles existentes
- Eliminar pasteles
- Confirmar/completar citas de clientes

---

## Pruebas Detalladas

### 1. GET /api/bakers (Público)

**Qué espera:** Lista de todos los reposteros activos

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers
```

**Qué devuelve:**
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

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 2. GET /api/bakers/1 (Público)

**Qué espera:** Perfil público de un repostero específico

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

### 3. GET /api/bakers/stats (Protegido - Repostero)

**Qué espera:** Estadísticas del repostero autenticado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/stats
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": {
    "baker_id": 21,
    "cakes": 0,
    "appointments": 0,
    "rating": "0.00"
  }
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 4. GET /api/bakers/appointments (Protegido - Repostero)

**Qué espera:** Lista de citas del repostero autenticado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/appointments
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": []
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Repostero nuevo sin citas

---

### 5. PUT /api/bakers/appointments/:id/status (Protegido - Repostero)

**Qué espera:** Actualizar estado de una cita

**Qué mandé:**
```http
PUT https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/appointments/1/status
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: 4be5784ca8b9cda53b6357a86c5870fc
Content-Type: application/json

{
  "status": "confirmed"
}
```

**Qué devuelve:**
```
HTTP 405 Method Not Allowed
```

**Estado:** ❌ **FALLA** | HTTP 405  
**Problema:** El método PUT no está siendo aceptado por el servidor

---

### 6. GET /api/bakers/cakes (Protegido - Repostero)

**Qué espera:** Lista de pasteles del repostero autenticado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/cakes
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": []
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200 | Repostero nuevo sin pasteles

---

### 7. POST /api/bakers/cakes (Protegido - Repostero)

**Qué espera:** Crear un nuevo pastel

**Qué mandé:**
```http
POST https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/cakes
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: 4be5784ca8b9cda53b6357a86c5870fc
Content-Type: application/json

{
  "name": "Pastel Test API",
  "description": "Pastel creado desde prueba",
  "price": 500,
  "category_id": 1,
  "is_featured": false
}
```

**Qué devuelve:**
```
HTTP 400 Bad Request
```

**Estado:** ⚠️ **PARCIAL** | HTTP 400  
**Problema:** El endpoint requiere una imagen (multipart/form-data) pero no hay documentación clara sobre este requisito. El código del controlador muestra que `req.cloudinaryUrl` es opcional, pero algo en la validación está fallando.

---

### 8. PUT /api/bakers/cakes/:id (Protegido - Repostero)

**Qué espera:** Actualizar un pastel existente

**Qué mandé:**
```http
PUT https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/cakes/1
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: 4be5784ca8b9cda53b6357a86c5870fc
Content-Type: application/json

{
  "name": "Pastel Actualizado",
  "price": 600
}
```

**Qué devuelve:**
```
HTTP 405 Method Not Allowed
```

**Estado:** ❌ **FALLA** | HTTP 405  
**Problema:** El método PUT no está siendo aceptado por el servidor

---

### 9. DELETE /api/bakers/cakes/:id (Protegido - Repostero)

**Qué espera:** Eliminar un pastel

**Qué mandé:**
```http
DELETE https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/cakes/99999
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: 4be5784ca8b9cda53b6357a86c5870fc
```

**Qué devuelve:**
```
HTTP 405 Method Not Allowed
```

**Estado:** ❌ **FALLA** | HTTP 405  
**Problema:** El método DELETE no está siendo aceptado por el servidor

---

### 10. GET /api/bakers/profile/me (Protegido - Repostero)

**Qué espera:** Obtener perfil del repostero autenticado

**Qué mandé:**
```http
GET https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/profile/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

**Qué devuelve:**
```json
{
  "success": true,
  "data": {
    "id": 21,
    "user_id": 47,
    "business_name": "Baker Test",
    "location": null,
    "specialty": null,
    "bio": null,
    "portfolio_url": null,
    "is_verified": 0,
    "rating_avg": "0.00",
    "total_reviews": 0,
    "created_at": "2026-08-04T17:12:32.000Z",
    "business_hours": null
  }
}
```

**Estado:** ✅ **EXITOSO** | HTTP 200

---

### 11. PUT /api/bakers/profile (Protegido - Repostero)

**Qué espera:** Actualizar perfil del repostero

**Qué mandé:**
```http
PUT https://subsidiary-drivers-stands-laser.trycloudflare.com/api/bakers/profile
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
X-CSRF-Token: 4be5784ca8b9cda53b6357a86c5870fc
Content-Type: application/json

{
  "business_name": "Mi Pasteleria Test",
  "location": "Merida Centro",
  "specialty": "Pasteles personalizados",
  "bio": "Repostero con 5 anos de experiencia",
  "business_hours": "Lun-Vie 9:00-18:00"
}
```

**Qué devuelve:**
```
HTTP 405 Method Not Allowed
```

**Estado:** ❌ **FALLA** | HTTP 405  
**Problema:** El método PUT no está siendo aceptado por el servidor

---

## Diagnóstico del Problema 405 Method Not Allowed

### Lo que NO es el problema:

1. ✅ **CORS:** El preflight OPTIONS responde correctamente con `Access-Control-Allow-Methods: GET,POST,OPTIONS,HEAD,PUT,DELETE`
2. ✅ **methodBlocker.js:** El middleware permite PUT y DELETE
3. ✅ **Autenticación:** El token JWT es válido y tiene rol "repostero"
4. ✅ **CSRF:** El token CSRF se envía correctamente

### Posibles causas:

1. **Configuración de Cloudflare Tunnel:** El túnel podría estar bloqueando métodos PUT/DELETE
2. **Configuración de Nginx:** Si hay un proxy Nginx antes del backend, podría estar filtrando estos métodos
3. **Configuración de Express:** Algún middleware no documentado podría estar interfiriendo
4. **Problema de red:** Algún firewall o proxy intermedio podría estar bloqueando

### Recomendaciones:

1. **Verificar configuración de Cloudflare Tunnel:**
   ```bash
   # Revisar logs del túnel
   docker logs cloudflared
   ```

2. **Verificar configuración de Nginx (si aplica):**
   ```nginx
   # Asegurar que permite PUT y DELETE
   location /api/ {
       limit_except GET POST PUT DELETE HEAD OPTIONS {
           deny all;
       }
   }
   ```

3. **Agregar logging en el backend:**
   ```javascript
   // En app.js, antes de las rutas
   app.use((req, res, next) => {
     console.log(`[DEBUG] ${req.method} ${req.path}`);
     next();
   });
   ```

4. **Probar directamente contra el backend (sin túnel):**
   ```bash
   # Si el backend corre en localhost:4000
   curl -X PUT http://localhost:4000/api/bakers/profile \
     -H "Authorization: Bearer <token>" \
     -H "Content-Type: application/json" \
     -d '{"business_name":"Test"}'
   ```

---

## Impacto del Bug

Los reposteros **NO PUEDEN**:
- ❌ Actualizar su perfil de negocio (nombre, ubicación, especialidad, etc.)
- ❌ Crear pasteles en su portafolio
- ❌ Actualizar información de pasteles existentes
- ❌ Eliminar pasteles de su portafolio
- ❌ Confirmar, completar o cancelar citas de clientes

Esto hace que el sistema sea **inutilizable para reposteros**, que es uno de los roles principales de la plataforma.

---

## Próximos Pasos

1. **Prioridad ALTA:** Corregir el bug de métodos PUT/DELETE
2. **Prioridad MEDIA:** Documentar el requisito de imagen para POST /api/bakers/cakes
3. **Prioridad BAJA:** Agregar más validaciones y mensajes de error claros

---

**Documento generado:** 2026-08-04  
**Herramientas utilizadas:** PowerShell Invoke-WebRequest  
**Metodología:** Caja Negra con credenciales de repostero
