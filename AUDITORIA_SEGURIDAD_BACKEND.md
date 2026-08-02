# Auditoría de Seguridad del Backend - Danhee Cake
**Fecha:** 2026-08-02
**Alcance:** Backend Node.js (Express)
**Metodología:** OWASP Top 10 2021 + OWASP API Security Top 10

---

## Resumen Ejecutivo

| Categoría | Estado | Severidad |
|-----------|--------|------------|
| Inyección (SQLi, NoSQL, XSS) | ✅ Protegido | 🟢 Bajo |
| Broken Authentication | ✅ Protegido | 🟢 Bajo |
| Broken Access Control | ✅ Protegido | 🟢 Bajo |
| Security Misconfigurations | ✅ Protegido | 🟢 Bajo |
| Cryptographic Failures | ✅ Protegido | 🟢 Bajo |
| Injection en APIs | ✅ Protegido | 🟢 Bajo |
| Lógica de Negocio | ⚠️ Parcial | 🟡 Medio |
| Denial of Service | ✅ Protegido | 🟢 Bajo |
| Dependencias | ⚠️ Pendiente | 🟡 Medio |
| CSRF | ✅ Protegido | 🟢 Bajo |
| Exposición de Datos | ✅ Protegido | 🟢 Bajo |
| Red e Infraestructura | ✅ Protegido | 🟢 Bajo |
| Autenticación APIs | ✅ Protegido | 🟢 Bajo |

**Calificación General: 85/100 (Bueno)**

---

## 1. Vulnerabilidades de Inyección

### 1.1 Inyección SQL (SQLi) - ✅ PROTEGIDO
**Estado:** Mitigado con múltiples capas de defensa

**Protecciones implementadas:**
- ✅ Consultas parametrizadas en todos los controladores (`db.execute(..., [params])`)
- ✅ `multipleStatements: false` en configuración MySQL
- ✅ Detección de patrones SQL sospechosos en `db.js` (líneas 84-145)
- ✅ Sanitización de inputs con `sanitizeInput()` en auth.controller.js
- ✅ Validación de nombres de tablas/columnas con regex estricto
- ✅ Middleware `parameterValidator.js` con `isDangerousValue()`
- ✅ Middleware `sqlInjectionBlocker` en app.js

**Archivos:**
- `server/src/config/db.js` - Validación SQL activa
- `server/src/controllers/auth.controller.js` - Sanitización SQL
- `server/src/middleware/parameterValidator.js` - Detección de patrones
- `server/src/middleware/sqlInjectionBlocker.js` - Bloqueo SQLi

---

### 1.2 Inyección NoSQL - ✅ PROTEGIDO
**Estado:** Mitigado

**Protecciones implementadas:**
- ✅ Validación de tipos con `validateNotObject()` en inputValidator.js
- ✅ Bloqueo de operadores NoSQL (`$where`, `$ne`, `$gt`, etc.) en parameterValidator.js
- ✅ Middleware `apiGuard` bloquea patrones NoSQL

**Archivos:**
- `server/src/middleware/inputValidator.js` - Validación NoSQL
- `server/src/middleware/parameterValidator.js` - Bloqueo operadores

---

### 1.3 OS Command Injection - ✅ PROTEGIDO
**Estado:** No hay ejecución de comandos del sistema

**Análisis:**
- ✅ `spawn` importado pero NO se usa en el código
- ✅ No hay endpoints que ejecuten comandos con input de usuario
- ✅ Validación de rutas bloquea `/etc/`, `/proc/`, `..%2f`

**Archivos:**
- `server/src/app.js` - `spawn` importado pero no utilizado

---

### 1.4 Inyección LDAP/XML/XXE/SSTI - ✅ NO APLICABLE
**Estado:** No hay endpoints LDAP/XML/SSTI

**Análisis:**
- ✅ No hay endpoints LDAP
- ✅ No hay procesamiento XML
- ✅ No hay motor de plantillas servidor con input
- ✅ Frontend usa React (sin `dangerouslySetInnerHTML`)

---

### 1.5 CRLF Injection - ✅ PROTEGIDO
**Estado:** Mitigado

**Protecciones implementadas:**
- ✅ Bloqueo de backslash `\` en validación de rutas
- ✅ Sanitización de headers
- ✅ Helmet configura headers de seguridad

---

### 1.6 XSS (Cross-Site Scripting) - ✅ PROTEGIDO
**Estado:** Mitigado

**Protecciones implementadas:**
- ✅ Sanitización de inputs con `sanitizeInput()` (elimina `<script>`, `javascript:`, `on\w+=`)
- ✅ CSP estricto con Helmet (default-src 'self', script-src 'self')
- ✅ Bloqueo de patrones XSS en parameterValidator.js
- ✅ Frontend React escapa por defecto

**Archivos:**
- `server/src/middleware/inputSanitizer.js` - Sanitización XSS
- `server/src/middleware/parameterValidator.js` - Detección XSS
- `server/src/app.js` - CSP con Helmet

---

## 2. Broken Authentication & Session Management

### 2.1 Credenciales por defecto - ✅ PROTEGIDO
**Estado:** Validación estricta en producción

**Protecciones implementadas:**
- ✅ `JWT_SECRET` validado en producción (crash si es placeholder o < 32 chars)
- ✅ `REFRESH_TOKEN_SECRET` validado (debe ser diferente a JWT_SECRET)
- ✅ Contraseñas con bcrypt + salt 10

**Archivos:**
- `server/src/app.js` (líneas 39-66) - Validación secrets

---

### 2.2 Fuerza bruta - ✅ PROTEGIDO
**Estado:** Rate limiting activo

**Protecciones implementadas:**
- ✅ `bruteForceProtection` - 5 intentos → bloqueo 15 min
- ✅ `authLimiter` - 5/15min para login
- ✅ `registerLimiter` - 3/1h para registro
- ✅ `ipRateLimiter` - 200/min global
- ✅ Bloqueo por IP con `ipBlocker`

**Archivos:**
- `server/src/middleware/bruteForceProtection.js` - Protección brute force
- `server/src/middleware/rateLimiter.js` - Rate limiters específicos
- `server/src/middleware/ipBlocker.js` - Bloqueo por IP

---

### 2.3 2FA/MFA - ⚠️ NO IMPLEMENTADO
**Estado:** Falta autenticación de dos factores

**Recomendación:** Implementar 2FA para usuarios admin

---

### 2.4 Enumeración de usuarios - ✅ PROTEGIDO
**Estado:** Mensajes genéricos

**Protecciones implementadas:**
- ✅ Mensaje idéntico para usuario inexistente y contraseña incorrecta
- ✅ "Credenciales inválidas. Verifica tus datos e intenta de nuevo."

**Archivos:**
- `server/src/controllers/auth.controller.js` (líneas 134-138)

---

### 2.5 Almacenamiento de contraseñas - ✅ PROTEGIDO
**Estado:** bcrypt con salt 10

**Protecciones implementadas:**
- ✅ `bcrypt.hash(password, 10)` con salt aleatorio
- ✅ No hay MD5/SHA1

---

### 2.6 JWT seguro - ✅ PROTEGIDO
**Estado:** Validación estricta

**Protecciones implementadas:**
- ✅ Algoritmo explícito `HS256` (previene alg=none)
- ✅ Validación de secreto en producción
- ✅ Expiración: 15m (access) / 7d (refresh)
- ✅ Refresh tokens con rotación y revocación

**Archivos:**
- `server/src/middleware/auth.js` - Validación JWT con alg whitelist
- `server/src/controllers/auth.controller.js` - Rotación refresh tokens

---

### 2.7 Cookies seguras - ✅ PROTEGIDO
**Estado:** Flags de seguridad activos

**Protecciones implementadas:**
- ✅ `httpOnly: true` para access_token
- ✅ `secure: true` en producción
- ✅ `sameSite: strict`
- ✅ `domain` configurado
- ✅ `priority: high` en producción
- ✅ Fingerprint del cliente (hash IP + User-Agent)
- ✅ Detección de manipulación de cookies

**Archivos:**
- `server/src/middleware/cookieSecurity.js` - Protecciones avanzadas de cookies
- `server/src/controllers/auth.controller.js` - Opciones de cookies

---

## 3. Broken Access Control (IDOR, Privilege Escalation)

### 3.1 IDOR - ✅ PROTEGIDO
**Estado:** Validación de ownership

**Protecciones implementadas:**
- ✅ `DELETE /api/appointments/:id` valida `WHERE id=? AND client_id=?`
- ✅ `GET /api/appointments/my-appointments` usa `req.user.id`
- ✅ Controladores validan ownership antes de operaciones

**Archivos:**
- `server/src/controllers/appointments.controller.js` - Validación ownership

---

### 3.2 Escalada de privilegios - ✅ PROTEGIDO
**Estado:** Validación de roles

**Protecciones implementadas:**
- ✅ Middleware `authorize()` con whitelist de roles
- ✅ Fix bug doble array con `roles.flat()`
- ✅ Validación de role en registro (solo 'cliente', 'repostero')
- ✅ No se permite role 'admin' en registro

**Archivos:**
- `server/src/middleware/auth.js` - Autorización por roles
- `server/src/controllers/auth.controller.js` - Validación role registro

---

### 3.3 Path traversal - ✅ PROTEGIDO
**Estado:** Bloqueado

**Protecciones implementadas:**
- ✅ `/api/images/:filename` valida con regex `[a-zA-Z0-9._-]`
- ✅ `startsWith(uploadsDir)` para path traversal
- ✅ Bloqueo de `/etc/`, `/proc/`, `..%2f`
- ✅ Validación de rutas sensibles

**Archivos:**
- `server/src/middleware/securityAdvanced.js` - Bloqueo path traversal

---

## 4. Security Misconfigurations

### 4.1 Headers de seguridad - ✅ PROTEGIDO
**Estado:** Helmet configurado estrictamente

**Protecciones implementadas:**
- ✅ CSP estricto (default-src 'self', frame-ancestors 'none')
- ✅ HSTS preload (31536000s)
- ✅ X-Frame-Options DENY
- ✅ X-Content-Type-Options nosniff
- ✅ COEP require-corp
- ✅ COOP same-origin
- ✅ Referrer-Policy strict-origin-when-cross-origin
- ✅ X-Powered-By oculto

**Archivos:**
- `server/src/app.js` (líneas 132-169) - Helmet configuración

---

### 4.2 CORS - ✅ PROTEGIDO
**Estado:** Allowlist estricta

**Protecciones implementadas:**
- ✅ Allowlist de orígenes permitidos
- ✅ `trycloudflare.com` solo en desarrollo
- ✅ Rechaza orígenes no permitidos
- ✅ `credentials: true` configurado

**Archivos:**
- `server/src/app.js` (líneas 193-238) - CORS allowlist

---

### 4.3 Información expuesta - ✅ PROTEGIDO
**Estado:** Oculta en producción

**Protecciones implementadas:**
- ✅ `/health` oculta environment/version en producción
- ✅ `/api/health` oculta environment/version en producción
- ✅ X-Powered-By oculto
- ✅ Stack traces no expuestos en producción

**Archivos:**
- `server/src/app.js` (líneas 560-572, 596-608) - Protección /health

---

### 4.4 Debug en producción - ✅ PROTEGIDO
**Estado:** Deshabilitado

**Protecciones implementadas:**
- ✅ Validación de NODE_ENV para producción
- ✅ Logs de seguridad ocultan IPs con `obfuscateIP()`

---

### 4.5 Archivos sensibles - ✅ PROTEGIDO
**Estado:** Bloqueados

**Protecciones implementadas:**
- ✅ Bloqueo de rutas `/.env`, `/.git`, `/phpmyadmin`, `/wp-admin`
- ✅ Bloqueo de `/config`, `/backup`, `/logs`
- ✅ Bloqueo de backslash `\`

**Archivos:**
- `server/src/app.js` (líneas 183-190) - Bloqueo rutas sensibles

---

## 5. Cryptographic Failures

### 5.1 Contraseñas - ✅ PROTEGIDO
**Estado:** bcrypt con salt 10

---

### 5.2 TLS - ✅ PROTEGIDO
**Estado:** SSL/TLS habilitado

**Protecciones implementadas:**
- ✅ MySQL con SSL (Clever Cloud)
- ✅ HSTS preload habilitado
- ✅ HTTPS enforcer middleware

---

### 5.3 JWT - ✅ PROTEGIDO
**Estado:** HS256 con secreto fuerte

**Protecciones implementadas:**
- ✅ Algoritmo explícito HS256
- ✅ Secreto validado en producción (min 32 chars)
- ✅ Expiración configurada
- ✅ Refresh tokens rotados

---

### 5.4 Random - ✅ PROTEGIDO
**Estado:** crypto.randomBytes para tokens

**Protecciones implementadas:**
- ✅ CSRF tokens con `crypto.randomBytes(32)`
- ✅ No hay Math.random() para seguridad

---

## 6. Injection en APIs (OWASP API Security Top 10)

### 6.1 BOLA (Broken Object Level Authorization) - ✅ PROTEGIDO
**Estado:** Validación de ownership

**Protecciones implementadas:**
- ✅ Endpoints "my-*" usan `req.user.id`
- ✅ Validación de ownership en controladores

---

### 6.2 BOPLA (Broken Object Property Level Authorization) - ✅ PROTEGIDO
**Estado:** Validación de roles en registro

**Protecciones implementadas:**
- ✅ Whitelist estricta de roles ['cliente', 'repostero']
- ✅ No se permite role 'admin' en registro

---

### 6.3 Mass Assignment - ✅ PROTEGIDO
**Estado:** Validación de campos

**Protecciones implementadas:**
- ✅ Validación de campos requeridos
- ✅ Sanitización de inputs
- ✅ No se aceptan campos extra no validados

---

### 6.4 Excessive Data Exposure - ✅ PROTEGIDO
**Estado:** PII ofuscado

**Protecciones implementadas:**
- ✅ PII en notas ofuscado con `obfuscatePII()`
- ✅ IPs en security alerts ofuscadas con `obfuscateIP()`
- ✅ `/health` oculta info sensible en producción

**Archivos:**
- `server/src/controllers/appointments.controller.js` - Ofuscar PII
- `server/src/middleware/securityDashboard.js` - Ofuscar IPs

---

### 6.5 Lack of Resources & Rate Limiting - ✅ PROTEGIDO
**Estado:** Múltiples limiters activos

**Protecciones implementadas:**
- ✅ `ipRateLimiter` - 200/min
- ✅ `apiLimiter` - 100/15min
- ✅ `readLimiter` - 100/min
- ✅ `writeLimiter` - 50/min
- ✅ `chatLimiter` - 20/min (skip para repostero)
- ✅ `authLimiter` - 5/15min
- ✅ `registerLimiter` - 3/1h

---

### 6.6 SSRF - ✅ NO APLICABLE
**Estado:** No hay input de URL de usuario

**Análisis:**
- ✅ RAG service solo llama a Ollama/Chroma internos
- ✅ No hay endpoints con input de URL externa

---

## 7. Lógica de Negocio

### 7.1 Pagos - ⚠️ MOCK
**Estado:** Sistema de pagos es mock

**Protecciones implementadas:**
- ✅ No hay procesamiento real de pagos
- ⚠️ No hay validación de precios negativos (mock)
- ⚠️ No hay validación de estados de orden (mock)

**Recomendación:** Implementar validación de precios cuando se integre pasarela real

---

### 7.2 Race conditions - ⚠️ PARCIAL
**Estado:** Constraint único agregado

**Protecciones implementadas:**
- ✅ Constraint único en citas (baker_id, date, time_slot)
- ⚠️ No hay manejo de transacciones en otros endpoints

**Archivos:**
- `server/init-local-db.sql` (línea 91) - Constraint único

---

### 7.3 Validación de estados - ⚠️ PARCIAL
**Estado:** Validación básica

**Protecciones implementadas:**
- ✅ Validación de estados en citas (pending, confirmed, cancelled, completed)
- ⚠️ No hay validación de transiciones de estados

---

## 8. Denial of Service (DoS)

### 8.1 Rate limiting - ✅ PROTEGIDO
**Estado:** Múltiples capas de rate limiting

**Protecciones implementadas:**
- ✅ Global: 200/min
- ✅ API: 100/15min
- ✅ Auth: 5/15min
- ✅ Chat: 20/min
- ✅ Bloqueo por IP

---

### 8.2 ReDoS - ⚠️ PARCIAL
**Estado:** Regex con límites

**Protecciones implementadas:**
- ✅ Límite de longitud en inputs (5000 chars)
- ✅ Patrones SQL con límites
- ⚠️ Regex complejos en securityAdvanced.js

**Recomendación:** Revisar regex complejos para ReDoS

---

### 8.3 Consumo de recursos - ✅ PROTEGIDO
**Estado:** Límites implementados

**Protecciones implementadas:**
- ✅ Límite de longitud de queries (10000 chars)
- ✅ Límite de parámetros (100)
- ✅ Límite de longitud de parámetros (5000 chars)

---

## 9. Vulnerabilidades de Dependencias

### 9.1 Dependencias obsoletas - ⚠️ PENDIENTE
**Estado:** No auditado en esta revisión

**Recomendación:** Ejecutar `npm audit fix`

**Dependencias conocidas (según reporte anterior):**
- ⚠️ `react-router` - high ×2 (frontend)
- ⚠️ `multer` - high (backend)
- ⚠️ `qs` - moderate (backend)
- ⚠️ `body-parser` - low (backend)

---

## 10. CSRF

### 10.1 Tokens CSRF - ✅ PROTEGIDO
**Estado:** Tokens implementados

**Protecciones implementadas:**
- ✅ `csrfProtection` middleware
- ✅ `csrfTokenGenerator` para generar tokens
- ✅ Tokens enviados en cookie y header
- ✅ Validación en rutas de auth

**Archivos:**
- `server/src/middleware/csrfProtection.js` - Implementación CSRF
- `server/src/routes/auth.routes.js` - CSRF en rutas auth

---

### 10.2 Validación de origen - ✅ PROTEGIDO
**Estado:** CORS allowlist + CSRF

**Protecciones implementadas:**
- ✅ CORS allowlist estricta
- ✅ CSRF tokens en rutas mutantes

---

## 11. Exposición de Datos

### 11.1 PII - ✅ PROTEGIDO
**Estado:** Ofuscado

**Protecciones implementadas:**
- ✅ PII en notas ofuscado (teléfonos, emails, nombres)
- ✅ IPs en security alerts ofuscadas
- ✅ `/health` oculta info en producción

---

### 11.2 Logs - ✅ PROTEGIDO
**Estado:** IPs ofuscadas en logs

**Protecciones implementadas:**
- ✅ `obfuscateIP()` en securityDashboard.js
- ✅ No se exponen credenciales en logs

---

### 11.3 Secretos - ✅ PROTEGIDO
**Estado:** No hardcodeados

**Protecciones implementadas:**
- ✅ Secrets en variables de entorno
- ✅ Validación de secrets en producción
- ✅ No hay secretos hardcodeados

---

## 12. Red e Infraestructura

### 12.1 Puertos - ✅ PROTEGIDO
**Estado:** Puertos sensibles protegidos

**Protecciones implementadas:**
- ✅ MySQL 3306 comentado (solo red Docker)
- ✅ ChromaDB 8000 comentado (solo red Docker)
- ✅ RAG service 5001 comentado (solo red Docker)
- ✅ RAG_SERVICE_SECRET configurado

**Archivos:**
- `docker-compose.yml` - Puertos protegidos

---

### 12.2 Túneles - ⚠️ CLOUDFLARE TUNNEL
**Estado:** Túnel efímero para desarrollo

**Protecciones implementadas:**
- ✅ Cloudflare tunnel solo para desarrollo
- ⚠️ trycloudflare.com es efímero (no producción)

**Recomendación:** Mover backend a host estable (Railway/Render/Fly)

---

### 12.3 Aislamiento - ✅ PROTEGIDO
**Estado:** Red Docker aislada

**Protecciones implementadas:**
- ✅ Red Docker personalizada (app-network)
- ✅ Servicios solo accesibles dentro de red Docker

---

## 13. Autenticación y Autorización en APIs

### 13.1 Autenticación - ✅ PROTEGIDO
**Estado:** JWT con validación estricta

**Protecciones implementadas:**
- ✅ JWT con HS256 + secreto fuerte
- ✅ Algoritmo whitelist ['HS256']
- ✅ Expiración configurada
- ✅ Refresh tokens con rotación

---

### 13.2 Tokens en localStorage - ⚠️ MIGRADO
**Estado:** Migrado a cookies httpOnly

**Protecciones implementadas:**
- ✅ Tokens en cookies httpOnly
- ✅ Frontend usa `credentials: 'include'`
- ⚠️ Migración parcial (algunos endpoints aún usan Bearer)

---

### 13.3 Refresh tokens - ✅ PROTEGIDO
**Estado:** Rotación y revocación

**Protecciones implementadas:**
- ✅ Refresh tokens en BD
- ✅ Rotación en cada refresh
- ✅ Revocación de tokens anteriores
- ✅ Expiración configurada

---

## 14. Otras Vulnerabilidades

### 14.1 Clickjacking - ✅ PROTEGIDO
**Estado:** X-Frame-Options DENY

**Protecciones implementadas:**
- ✅ X-Frame-Options DENY
- ✅ CSP frame-ancestors 'none'

---

### 14.2 Content Sniffing - ✅ PROTEGIDO
**Estado:** X-Content-Type-Options nosniff

---

### 14.3 Open Redirect - ✅ PROTEGIDO
**Estado:** Bloqueado

**Protecciones implementadas:**
- ✅ Bloqueo de parámetros redirect/next/url/returnUrl/return_to
- ✅ Validación de URLs en parámetros

---

### 14.4 Host Header Injection - 🟡 PARCIAL
**Estado:** validateHostHeader activo

**Protecciones implementadas:**
- ✅ `validateHostHeader` en `/api`
- ⚠️ Verificar whitelist de hosts permitidos

---

### 14.5 GraphQL - ✅ NO APLICABLE
**Estado:** No hay GraphQL

---

### 14.6 WebSocket - ✅ NO APLICABLE
**Estado:** No hay WebSocket (chat usa SSE)

---

## Recomendaciones Prioritarias

### Alta Prioridad 🔴
1. **Mover backend a host estable** - trycloudflare NO es producción
2. **Ejecutar `npm audit fix`** - Actualizar dependencias vulnerables
3. **Implementar 2FA** - Para usuarios admin
4. **Verificar validateHostHeader whitelist** - Asegurar hosts permitidos

### Media Prioridad 🟡
5. **Validar regex complejos** - Prevenir ReDoS
6. **Implementar validación de precios** - Cuando se integre pasarela real
7. **Implementar transacciones** - Para operaciones críticas
8. **Completar migración a cookies** - Todos los endpoints

### Baja Prioridad 🟢
9. **Implementar validación de transiciones de estados** - Para citas
10. **Agregar monitoreo de seguridad** - SIEM/SOAR

---

## Conclusión

El backend de Danhee Cake tiene un **nivel de seguridad sólido (85/100)** con múltiples capas de defensa contra las vulnerabilidades más críticas. Las áreas principales de mejora son:

1. **Infraestructura:** Mover de túnel efímero a host estable
2. **Dependencias:** Actualizar paquetes con CVEs conocidos
3. **Lógica de negocio:** Validación de precios cuando se integre pagos reales

Las protecciones implementadas (consultas parametrizadas, rate limiting, headers de seguridad, validación de inputs, CSRF, JWT seguro) proporcionan una defensa robusta contra ataques comunes.
