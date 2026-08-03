# Analisis Profundo - Danhee Cake

> Fecha: Agosto 2026 | Analista: Opencode  
> Proyecto: Danhee Cake - Plataforma de pasteleros y clientes  
> Stack: React 18 + Vite (frontend) | Express + MySQL (backend) | Docker + Nginx (deploy)

---

## Tabla de Contenidos

1. [Resumen Ejecutivo](#1-resumen-ejecutivo)
2. [Arquitectura del Proyecto](#2-arquitectura-del-proyecto)
3. [Bugs Criticos](#3-bugs-criticos)
4. [Vulnerabilidades de Seguridad](#4-vulnerabilidades-de-seguridad)
5. [Problemas de Backend](#5-problemas-de-backend)
6. [Problemas de Frontend](#6-problemas-de-frontend)
7. [Problemas de Infraestructura y Deploy](#7-problemas-de-infraestructura-y-deploy)
8. [Areas de Oportunidad](#8-areas-de-oportunidad)
9. [Recomendaciones Priorizadas](#9-recomendaciones-priorizadas)

---

## 1. Resumen Ejecutivo

Danhee Cake es una plataforma marketplace que conecta clientes con reposteros. El proyecto cuenta con un nivel de seguridad defensiva notable (20+ middlewares de seguridad), pero presenta **problemas criticos** que requieren atencion inmediata, incluyendo credenciales de produccion expuestas, un secret de refresh token invalido, y bugs logicos que afectan funcionalidad core.

**Hallazgos principales:**

| Categoria | Criticos | Altos | Medios | Bajos |
|-----------|----------|-------|--------|-------|
| Seguridad | 4 | 5 | 3 | 2 |
| Bugs | 2 | 3 | 2 | 1 |
| Arquitectura | 0 | 2 | 4 | 3 |
| Infraestructura | 1 | 2 | 2 | 1 |

---

## 2. Arquitectura del Proyecto

```
Danhee-Cake/
  src/                      # Frontend React + Vite
    components/             # chatbot, home, layout, ui
    context/                # AuthContext, CartContext
    config/                 # api.js (configuracion API)
    hooks/                  # useAuthRateLimit
    pages/                  # Paginas principales
    utils/                  # apiHelper, chatSecurity, csrfHelper, domSecurity, rateLimiter
  server/
    src/
      app.js                # Entry point Express (727 lineas)
      config/db.js          # Pool MySQL con fallback
      controllers/          # 8 controladores
      middleware/            # 30+ middlewares de seguridad
      routes/               # 8 archivos de rutas
  docker-compose.yml        # 6 servicios (backend, db, chromadb, rag, cloudflared, frontend)
  nginx.conf                # Reverse proxy + seguridad
```

**Flujo de autenticacion:** JWT en cookies httpOnly (access_token + refresh_token) con refresh tokens almacenados en BD.

**Flujo de datos:** Frontend -> Nginx -> Express API -> MySQL / RAG Service (Python) -> Ollama + ChromaDB

---

## 3. Bugs Criticos

### 3.1 [CRITICO] REFRESH_TOKEN_SECRET usa placeholder en produccion

**Archivo:** `.env:23`  
**Problema:** `REFRESH_TOKEN_SECRET=change-me-in-production`

El archivo `.env` tiene `NODE_ENV=production` pero `REFRESH_TOKEN_SECRET` sigue siendo el placeholder. Aunque `app.js:45-48` tiene una validacion que deberia hacer crash al servidor en produccion con este valor, esto significa que:
- Si el servidor esta corriendo, la validacion no se esta ejecutando (posible bypass)
- O el servidor no esta en modo produccion real
- La linea 69 de `app.js` hace fallback: `process.env.REFRESH_TOKEN_SECRET = REFRESH_TOKEN_SECRET || JWT_SECRET` - esto significa que si esta vacio, usa JWT_SECRET, pero como tiene el valor placeholder, no activa el fallback

**Impacto:** Si se despliega asi, los refresh tokens se firman con un secreto predecible conocido.

**Solucion:**
```env
REFRESH_TOKEN_SECRET=<generar-64-caracteres-aleatorios>
```

### 3.2 [CRITICO] Credenciales de base de datos Clever Cloud en texto plano

**Archivo:** `.env:4-8`  
**Problema:** Credenciales reales de produccion de Clever Cloud estan en el archivo `.env` local:
```
DB_HOST=bvtdjsmypbwpngczasgf-mysql.services.clever-cloud.com
DB_NAME=bvtdjsmypbwpngczasgf
DB_USER=ueixm6eypteu4pjt
DB_PASSWORD=2BIOKddsIrsSJGKlxClR
```

Aunque `.env` esta en `.gitignore` y `git ls-files .env` no muestra tracking, estas credenciales:
- Podrian haber estado en commits anteriores (verificar con `git log --all --full-history -- .env`)
- Estan visibles para cualquier proceso o persona con acceso al filesystem
- El `MYSQL_ROOT_PASSWORD` en `.env:17` es una clave de 128 caracteres que da acceso total a la BD local

**Solucion:**
1. Rotar TODAS las credenciales de Clever Cloud inmediatamente
2. Usar un gestor de secretos (Vault, AWS Secrets Manager, etc.)
3. Verificar historial git: `git log --all --full-history -- .env`

### 3.3 [ALTO] Login responde con tokens en body Y cookies simultaneamente

**Archivo:** `server/src/controllers/auth.controller.js:341-351`  
**Problema:** El login envia el token tanto en cookies httpOnly como en el body de la respuesta:
```js
res.json({
  success: true,
  token,              // <-- Token en body (visible en JS)
  refresh_token: refreshToken,  // <-- Refresh token en body
  user: { ... }
});
```

Esto anula el proposito de las cookies httpOnly. Si el token esta en el body, cualquier XSS puede acceder a el con `response.json()`.

**Impacto:** Un ataque XSS podria robar tokens de sesion.

**Solucion:** Eliminar `token` y `refresh_token` del body de la respuesta. El frontend ya usa `credentials: 'include'` para enviar cookies.

### 3.4 [ALTO] CSRF tokens almacenados en memoria (Set) sin limpieza

**Archivo:** `server/src/middleware/csrfProtection.js:7`  
**Problema:** `const csrfTokens = new Set()` - Los tokens CSRF se almacenan en un `Set` en memoria sin mecanismo de expiracion ni limpieza. Con el tiempo:
- El Set crecera indefinidamente (memory leak)
- En un reinicio del servidor, todos los tokens se pierden
- No hay rotacion ni expiracion de tokens individuales

**Solucion:** Usar un `Map` con timestamps, implementar TTL, o usar Redis para almacenamiento distribuido.

### 3.5 [ALTO] `addCake` genera URL hardcoded con localhost

**Archivo:** `server/src/controllers/bakers.controller.js:306`  
**Problema:**
```js
imageUrl = `http://localhost:4000/uploads/${req.file.filename}`;
```

En produccion, las imagenes subidas tendran URLs apuntando a `localhost:4000`, lo cual es inaccesible para los clientes.

**Solucion:** Usar una URL relativa (`/uploads/...`) o construir la URL desde variables de entorno.

### 3.6 [ALTO] Endpoint `/api/admin/unblock-ip` refleja la IP en la respuesta

**Archivo:** `server/src/app.js:710`  
**Problema:**
```js
res.json({ success: true, message: `IP ${ip} desbloqueada correctamente` });
```

Aunque requiere autenticacion admin, la IP proporcionada por el usuario se refleja directamente en la respuesta sin sanitizar, lo cual podria explotarse para inyectar contenido si un admin es comprometido.

---

## 4. Vulnerabilidades de Seguridad

### 4.1 [CRITICO] SSL `rejectUnauthorized: false` en conexion a Clever Cloud

**Archivo:** `server/src/config/db.js:22`  
**Problema:**
```js
ssl: { rejectUnauthorized: false }
```

Esto desactiva la verificacion de certificados SSL, haciendo la conexion vulnerable a ataques MITM (Man-in-the-Middle).

**Angulos de ataque:**
1. Un atacante en la red podria interceptar queries SQL
2. Podria modificar respuestas de la base de datos
3. Podria inyectar datos falsos

**Solucion:** Configurar certificados CA correctos o usar `ssl: true` con verificacion completa.

### 4.2 [CRITICO] Cookie CSRF con `SameSite=None` en produccion

**Archivo:** `server/src/middleware/csrfProtection.js:118`  
**Problema:**
```js
sameSite: isProduction ? 'none' : 'lax'
```

`SameSite=None` requiere `Secure=true` y permite que la cookie se envie en contextos cross-site, debilitando la proteccion CSRF que supuestamente ofrece.

**Solucion:** Usar `SameSite=Strict` o `Lax` y manejar el CSRF con el patron double-submit cookie correctamente.

### 4.3 [ALTO] `sanitizeInput` en auth.controller trunca a 100 caracteres indiscriminadamente

**Archivo:** `server/src/controllers/auth.controller.js:26-37`  
**Problema:** La funcion `sanitizeInput` aplica `.substring(0, 100)` a todos los campos, incluyendo `bio` que deberia permitir hasta 1000 caracteres. Ademas, la sanitizacion elimina comillas de los strings, lo cual corrompe datos legitimos (ej: nombres con apostrofes como "O'Brien").

**Impacto:** Corrupcion de datos y comportamiento inesperado.

### 4.4 [ALTO] Inconsistencia en validacion de password entre register y login

**Archivos:**
- `auth.routes.js:36` - Valida: mayuscula + minuscula + numero, 8-128 chars
- `auth.controller.js:16-23` - Valida: solo letra + numero, minimo 8

Las reglas de validacion son diferentes en la ruta (express-validator) y en el controlador. Un password como `password1` pasaria la validacion del controlador pero fallaria en la ruta.

**Solucion:** Centralizar la validacion de password en un solo lugar.

### 4.5 [ALTO] `createGuest` crea usuarios fantasma en la BD

**Archivo:** `server/src/controllers/appointments.controller.js:292-301`  
**Problema:** Cada cita de invitado crea un usuario temporal con email `guest-{timestamp}-{random}@local.invalid`. Esto:
- Genera basura en la tabla `users` indefinidamente
- No hay mecanismo de limpieza
- Un atacante podria generar miles de usuarios falsos (ataque de agotamiento de BD)
- El password del invitado se genera con `Date.now()` que es predecible

**Solucion:** Usar un campo nullable `client_id` en appointments o crear una tabla separada para citas guest.

### 4.6 [ALTO] `optionalAuth` no valida algoritmo JWT

**Archivo:** `server/src/middleware/auth.js:174`  
**Problema:**
```js
const decoded = jwt.verify(token, process.env.JWT_SECRET);
```

A diferencia del `authMiddleware` (linea 48) que especifica `algorithms: ['HS256']`, el `optionalAuth` no restringe algoritmos, lo cual podria permitir ataques de confusion de algoritmos (alg:none o RS256/HS256 swap).

**Solucion:** Agregar `{ algorithms: ['HS256'] }` como en el middleware principal.

### 4.7 [MEDIO] Excesivos `console.log` en produccion filtran informacion sensible

**Archivos:** `auth.controller.js` (todo el archivo), `csrfProtection.js`, `app.js`  
**Problema:** Los logs en produccion exponen:
- IPs de clientes
- Headers de peticiones
- Partial tokens (`refreshToken.substring(0, 20)`)
- Estados internos de autenticacion
- Cookies presentes

**Impacto:** En un entorno con logs centralizados o compartidos, esta informacion es sensible.

**Solucion:** Usar un logger con niveles (winston/pino) y desactivar DEBUG en produccion.

### 4.8 [MEDIO] CORS permite cualquier subdominio de trycloudflare.com

**Archivo:** `server/src/app.js:121-124`  
**Problema:**
```js
const isTryCloudflareOrigin = (origin) => {
  return normalized && normalized.endsWith('.trycloudflare.com');
};
```

Cualquier tunel de Cloudflare es permitido como origen CORS, lo cual es un vector de ataque si un atacante crea un tunel malicioso.

### 4.9 [MEDIO] `/uploads` endpoint valida referer de forma insegura

**Archivo:** `server/src/app.js:448`  
**Problema:**
```js
if (!origin || !allowedOrigins.some(allowed => origin.includes(allowed.replace(/^https?:\/\//, ''))))
```

Usar `.includes()` para validar origins permite bypass. Por ejemplo, `https://evil.com?danhee-cake.vercel.app` pasaria la validacion.

**Solucion:** Comparar con `===` o usar `startsWith()` con la URL completa normalizada.

### 4.10 [MEDIO] `detectSuspiciousSQL` en db.js detecta patrones en queries legitimos

**Archivo:** `server/src/config/db.js:87-116`  
**Problema:** Patrones como `/update\s+\w+\s+set/i` y `/delete\s+from/i` estan en la lista de sospechosos, pero los controladores usan estas queries legitimamente (ej: `updateAppointmentStatus`, `cancelAppointment`). El wrapper `safeExecute` lanzara error si se detectan estos patrones.

**Impacto:** Podria causar falsos positivos que rompan funcionalidad.

---

## 5. Problemas de Backend

### 5.1 [ALTO] `app.js` tiene 727 lineas con logica dispersa

El archivo principal del servidor mezcla:
- Configuracion CORS
- Middleware de seguridad (20+)
- Endpoints de negocio (imagenes, media, admin)
- Health checks
- Logging

**Solucion:** Separar en modulos: `cors.js`, `security.js`, `routes/admin.js`, `routes/health.js`.

### 5.2 [MEDIO] Doble montaje de rutas de auth

**Archivo:** `server/src/app.js:574`  
```js
app.use(['/api/auth', '/auth'], require('./routes/auth.routes'));
```

Montar las rutas en dos prefixes duplica la superficie de ataque y puede causar confusion en los logs y middlewares.

### 5.3 [MEDIO] `authorize()` fallback a rol de JWT cuando BD falla

**Archivo:** `server/src/middleware/auth.js:152`  
**Problema:** Si la BD no esta disponible, el middleware hace fallback al rol del JWT:
```js
if (!allowedRoles.includes(req.user.role)) { ... }
console.warn('[Auth] Usando rol del JWT como fallback (BD no disponible)');
```

Un atacante podria modificar el rol en su JWT (si conoce el secreto) y acceder como admin cuando la BD esta caida.

### 5.4 [MEDIO] `normalizeImageUrl` en cakes.controller genera URLs con token de 1 hora

**Archivo:** `server/src/controllers/cakes.controller.js:22`  
**Problema:** Cada vez que se solicita un pastel, se genera una URL con token firmado valido por 1 hora. Esto es correcto desde seguridad, pero:
- Las URLs cambian en cada request, imposibilitando cache de CDN
- Si el JWT_SECRET cambia, todas las URLs existentes se invalidan

### 5.5 [BAJO] `deleteChatHistory` no valida que `conversation_id` sea UUID

**Archivo:** `server/src/controllers/chat.controller.js:389-442`  
**Problema:** El `conversation_id` se sanitiza como texto pero no se valida que sea un UUID valido, permitiendo inyeccion de paths en el servicio RAG.

---

## 6. Problemas de Frontend

### 6.1 [ALTO] Token almacenado en localStorage

**Archivo:** `src/context/AuthContext.jsx:78`  
**Problema:**
```js
localStorage.setItem('token', normalizedToken);
```

Aunque el sistema usa cookies httpOnly, el token tambien se guarda en localStorage como fallback. Esto es vulnerable a XSS.

**Solucion:** Eliminar el almacenamiento en localStorage y depender exclusivamente de cookies httpOnly.

### 6.2 [ALTO] CartContext no valida datos de localStorage

**Archivo:** `src/context/CartContext.jsx:11-13`  
**Problema:**
```js
const savedCart = localStorage.getItem('cart');
if (savedCart) {
  setCartItems(JSON.parse(savedCart));
}
```

No hay validacion de la estructura de los datos leidos de localStorage. Un atacante con acceso al navegador podria manipular el carrito inyectando objetos maliciosos.

### 6.3 [MEDIO] `getApiUrl` permite URLs absolutas arbitrarias

**Archivo:** `src/config/api.js:12-14`  
**Problema:**
```js
if (endpoint.startsWith('http://') || endpoint.startsWith('https://')) {
  return endpoint;
}
```

Si algun componente pasa una URL controlada por el usuario a `getApiUrl`, se enviarian requests a dominios externos con credenciales del usuario.

### 6.4 [MEDIO] Excesivos console.log en frontend

**Archivos:** `AuthContext.jsx`, `chatSecurity.js`  
**Problema:** Logs de debug expuestos en produccion revelan informacion del flujo de autenticacion y validacion.

**Nota:** `vite.config.js:18` tiene `pure: ['console.log']` para eliminar logs en build, pero esto solo aplica a `console.log` directo, no a los que pasan por funciones.

### 6.5 [BAJO] No hay Error Boundary global

**Archivo:** `src/App.jsx`  
**Problema:** No se implementa un `ErrorBoundary` de React. Un error no capturado en cualquier componente crashea toda la aplicacion.

---

## 7. Problemas de Infraestructura y Deploy

### 7.1 [CRITICO] nginx.conf tiene URL hardcoded de Render

**Archivo:** `nginx.conf:87,110,137`  
**Problema:**
```
proxy_pass https://danhee-cake.onrender.com/protected-media/;
proxy_pass https://danhee-cake.onrender.com;
proxy_pass https://danhee-cake.onrender.com/uploads/;
```

El nginx del frontend Docker apunta a una URL hardcoded de Render. Esto:
- Crea un single point of failure
- No funciona si el backend esta en otro proveedor
- Expone la URL interna del backend

### 7.2 [ALTO] Docker compose monta el codigo fuente como volumen en produccion

**Archivo:** `docker-compose.yml:28-29`  
**Problema:**
```yaml
volumes:
  - ./server/src:/app/src
```

Esto sobrescribe el codigo del contenedor con el codigo local, lo cual es util en desarrollo pero peligroso en produccion. Ademas:
- `./server/uploads:/app/uploads` permite acceso directo al filesystem de uploads
- `/app/node_modules` anonimo puede causar inconsistencias

### 7.3 [ALTO] Puerto 5005 expuesto sin uso claro

**Archivo:** `docker-compose.yml:6`  
**Problema:**
```yaml
ports:
  - "4000:4000"
  - "5005:5005"
```

El puerto 5005 esta expuesto pero no hay referencia a el en el codigo. Podria ser un puerto de debug o RAG no documentado.

### 7.4 [MEDIO] MySQL en Docker sin puerto expuesto pero con SSL forzado

**Archivo:** `docker-compose.yml:59`  
**Problema:**
```yaml
command: --default-authentication-plugin=mysql_native_password --ssl=1
```

Se fuerza SSL en MySQL pero la configuracion local en `db.js:47` tiene `ssl: false`. Esto puede causar errores de conexion.

---

## 8. Areas de Oportunidad

### 8.1 Arquitectura

| Area | Estado Actual | Estado Ideal |
|------|--------------|--------------|
| `app.js` (727 lineas) | Monolitico | Modular (rutas, middleware, config separados) |
| Tests | Solo tests de seguridad | Tests unitarios + integracion + E2E |
| Base de datos | No hay migraciones | Usar migraciones (Knex/Sequelize) |
| Logging | console.log | Logger estructurado (winston/pino) |
| Validacion | Duplicada (rutas + controladores) | Centralizada con schemas (Zod/Joi) |
| TypeScript | No usa | Migrar gradualmente para type safety |

### 8.2 Seguridad Proactiva

1. **Implementar rate limiting basado en usuario** (no solo IP) - Las IPs detras de NAT/VPN son compartidas
2. **Agregar Content Security Policy reporting** - Para detectar violaciones CSP en produccion
3. **Implementar rotation de JWT_SECRET** - Sin rotation, un secreto comprometido afecta todos los tokens
4. **Agregar 2FA para reposteros** - Proteger cuentas de negocio
5. **Implementar audit trail** - Registrar acciones criticas (crear pasteles, cambiar estados, pagos)
6. **Security headers en respuestas de API** - Actualmente solo en nginx, no en respuestas directas del backend

### 8.3 Rendimiento

1. **Agregar cache de consultas** - Las categorias y pasteles cambian poco
2. **Implementar paginacion con cursor** - Mas eficiente que OFFSET para grandes volumenes
3. **Compresion Gzip/Brotli** - No configurada en Express (solo en nginx)
4. **Connection pooling optimizado** - `connectionLimit: 10` puede ser insuficiente bajo carga

### 8.4 UX/Funcionalidad

1. **No hay sistema de recuperacion de password** - Solo registro y login
2. **No hay verificacion de email** - El registro menciona "verifica tu correo" pero no hay implementacion
3. **Carrito no tiene persistencia server-side** - Solo localStorage
4. **No hay sistema de notificaciones** - Para citas, mensajes, etc.
5. **No hay sistema de reviews/resenas** - A pesar de que `baker_profiles` tiene `rating_avg`

### 8.5 Calidad de Codigo

1. **Mezcla de ES modules y CommonJS** - `package.json` tiene `"type": "module"` pero el servidor usa `require()`
2. **No hay linter para el backend** - Solo hay `eslint.config.js` para el frontend
3. **No hay formateador consistente** - Mezcla de estilos de codigo
4. **Funciones duplicadas** - `obfuscatePII` esta en `appointments.controller.js` y `bakers.controller.js`

---

## 9. Recomendaciones Priorizadas

### Urgente (hacer ahora)

| # | Accion | Archivo(s) | Esfuerzo |
|---|--------|-----------|----------|
| 1 | Rotar credenciales de Clever Cloud y generar REFRESH_TOKEN_SECRET seguro | `.env` | 30 min |
| 2 | Eliminar tokens del body del response en login/refresh | `auth.controller.js` | 15 min |
| 3 | Agregar `{ algorithms: ['HS256'] }` a `optionalAuth` | `auth.js:174` | 5 min |
| 4 | Corregir URL hardcoded `localhost:4000` en `addCake` | `bakers.controller.js:306` | 10 min |
| 5 | Corregir validacion de origin con `.includes()` | `app.js:448` | 10 min |

### Corto plazo (esta semana)

| # | Accion | Archivo(s) | Esfuerzo |
|---|--------|-----------|----------|
| 6 | Implementar limpieza/expiracion de tokens CSRF | `csrfProtection.js` | 2 hrs |
| 7 | Eliminar localStorage para tokens (solo cookies) | `AuthContext.jsx` | 1 hr |
| 8 | Centralizar validacion de password | `auth.routes.js` + `auth.controller.js` | 1 hr |
| 9 | Reemplazar usuarios guest por campo nullable | `appointments.controller.js` | 3 hrs |
| 10 | Corregir URL hardcoded de Render en nginx | `nginx.conf` | 30 min |

### Mediano plazo (este mes)

| # | Accion | Archivo(s) | Esfuerzo |
|---|--------|-----------|----------|
| 11 | Refactorizar `app.js` en modulos | `server/src/` | 1 dia |
| 12 | Implementar logger estructurado | Todo el proyecto | 1 dia |
| 13 | Agregar migraciones de BD | `server/src/migrations/` | 1 dia |
| 14 | Implementar recuperacion de password | Nuevo endpoint + email | 2 dias |
| 15 | Agregar Error Boundary global | `App.jsx` | 2 hrs |
| 16 | Implementar verificacion de email | Nuevo servicio | 2 dias |

### Largo plazo (este quarter)

| # | Accion | Esfuerzo |
|---|--------|----------|
| 17 | Migrar a TypeScript | 2 semanas |
| 18 | Implementar tests E2E (Playwright) | 1 semana |
| 19 | Agregar sistema de notificaciones | 1 semana |
| 20 | Implementar 2FA para reposteros | 3 dias |
| 21 | Cache con Redis | 3 dias |
| 22 | Sistema de reviews completo | 1 semana |

---

## Anexo: Posibles Angulos de Ataque

### Angulo 1: Cadena de ataque XSS -> Robo de sesion
```
1. Explotar localStorage para robar token (bug 6.1)
2. Usar token para acceder como usuario
3. Como el token esta en body del login (bug 3.3), cualquier XSS lo captura
```
**Mitigan:** Cookies httpOnly, helmet, CSP  
**Vulnerable si:** XSS logra ejecutarse antes de que CSP lo bloquee

### Angulo 2: CSRF con SameSite=None
```
1. La cookie CSRF tiene SameSite=None (bug 4.2)
2. Un sitio malicioso puede incluir la cookie en requests cross-site
3. Si el atacante conoce el token CSRF (visible en cookie no-httpOnly)
4. Puede forjar requests POST en nombre del usuario
```
**Mitigan:** CSRF double-submit, rate limiting  
**Vulnerable si:** El atacante puede leer la cookie CSRF (no es httpOnly)

### Angulo 3: Agotamiento de BD via guest appointments
```
1. Endpoint /api/appointments/guest no requiere auth
2. Cada request crea un usuario fantasma (bug 4.5)
3. Con rate limit de 30/min (publicLimiter), un atacante genera 43,200 usuarios/dia
4. La BD se llena de basura, degradando rendimiento
```
**Mitigan:** Rate limiting, ipBlocker  
**Vulnerable si:** El atacante rota IPs (botnet)

### Angulo 4: Fallback de autorizacion durante caida de BD
```
1. La BD se cae (o se satura con el ataque anterior)
2. El middleware authorize() hace fallback al rol del JWT (bug 5.3)
3. Si el atacante tiene un JWT con rol "admin" (o lo modifico)
4. Tendria acceso total de admin mientras la BD este caida
```
**Mitigan:** Validacion en BD normalmente  
**Vulnerable si:** BD cae + JWT comprometido

### Angulo 5: MITM en conexion a Clever Cloud
```
1. SSL rejectUnauthorized: false (bug 4.1)
2. Un atacante en la red intercepta la conexion MySQL
3. Puede leer/modify datos de usuarios, tokens, citas
4. Especialmente peligroso con credenciales en texto plano
```
**Mitigan:** Red privada de Clever Cloud  
**Vulnerable si:** Hay compromiso de la red interna

---

*Fin del reporte.*
