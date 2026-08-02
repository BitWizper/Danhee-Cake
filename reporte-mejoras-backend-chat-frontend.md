# Reporte de Mejoras — Backend, Chat y Frontend de Danhee

**Fecha:** 2026-08-02
**Base:** Revisión del proyecto completo (`server/`, `src/`, `server/rag/`, `docker-compose.yml`, `vercel.json`, git) + validación contra el deploy vivo (`helping-bush-mines-tanks.trycloudflare.com`).

> 📌 Nota: esta ronda el deploy **sí** corre las correcciones de seguridad (CORS estricto, JWT rotado, `role` whitelist, rate limits, chat RAG funcional, IPs enmascaradas). Los problemas restantes son de **arquitectura/infra** (túnel efímero, secretos compartidos, auth cross-site) y de **madurez** (dependencias, pagos mock, CSRF, MFA).

---

## A. Estado general por módulo

| Módulo | Funciona | Madurez |
|---|---|---|
| Frontend (Vercel SPA) | ✅ Estático OK | 🟠 Auth de sesión rota en navegador |
| Backend (Node/Express + MySQL) | ✅ API responde (CORS/auth OK) | 🟠 Infra frágil (túnel efímero) |
| Chat (SSE + RAG + Ollama/Chroma) | ✅ Responde (RAG arriba) | 🟡 Depende de contenedor RAG |
| Pagos (OXXO) | ⚠️ Mock sin persistencia | 🟠 |
| Citas | ✅ Con JWT válido | 🟡 IDOR de invitados |
| Seguridad (WAF, dashboard, rate limits) | ✅ Activo | 🟢 |

---

## B. Correcciones confirmadas (verificadas en vivo / en código)

1. ✅ **CORS**: allowlist estricta; `evil.com` → 403 limpio; sin-Origin → 200 (`/health` OK). Corrige el 500 de la ronda anterior.
2. ✅ **JWT**: secret rotado (128 hex); `change-me-in-production`, secrets previos y `alg=none` → 401.
3. ✅ **Registro**: `role` contra whitelist (`cliente`/`repostero`); `admin` rechazado → escalada por registro bloqueada.
4. ✅ **Chat RAG funcional** (`/api/chat/stream` responde con contenido).
5. ✅ **Rate limiting** en login/registro/escrituras; IP Blocker activo.
6. ✅ **Path traversal** bloqueado (images/uploads/protected-media).
7. ✅ **Uploads** protegidos (auth + firma HMAC).
8. ✅ **`server/.env` y `docker.env` NO trackeados en git**; `.env`/`.git` no expuestos (404).
9. ✅ **Headers**: HSTS, CSP, XFO:DENY, nosniff; IPs enmascaradas en dashboard.
10. ✅ **`authorize()`** sin bug de doble array (`roles.flat()`); `Math.random()` → `crypto.randomBytes`.

---

## C. Mejoras pendientes por módulo

### C1. Backend (`server/`)

**Crítico — Secretos e infraestructura**
- [ ] **🔴 Rotar `DB_PASSWORD` de producción** (misma desde la primera ronda) y **cerrar el puerto 3306** (allowlist de IPs del deploy en Clever Cloud).
- [ ] **🔴 Eliminar la credencial de BD de los reportes commiteados** en git (aparece en pentest reportes) y purgar el historial (BFG/filter-branch).
- [ ] **🟠 Separar `JWT_SECRET` por entorno**: prod no debe usar el mismo secret que `server/.env` local. Configurarlo como secret del proveedor (no en el repo ni en archivos del proyecto).
- [ ] **🟠 Host estable**: reemplazar el túnel `trycloudflare.com` (cambia de URL, timeouts) por Railway/Fly/Clever Cloud App con dominio fijo. Actualizar `FRONTEND_URL` y la URL compilada en el bundle.
- [ ] `RAG_SERVICE_SECRET`: quitar el default `${RAG_SERVICE_SECRET:-change-me-in-production}` de `docker-compose.yml:83` y configurarlo con valor fuerte.

**Seguridad**
- [ ] **🟠 Reparar auth cross-site**: cookies `SameSite=Lax` no viajan en `fetch()` cross-site entre Vercel y el túnel. Opciones: mismo dominio (subdominio), `SameSite=None; Secure`, o Bearer funcional.
- [ ] **CSRF**: validar el token contra el almacén (hoy cualquier `X-CSRF-Token` pasa si no hay cookie); quitar código muerto (`csrfTokens` Map). Emitir `csrf_token` con `httpOnly` no es opción si JS debe leerlo — usar header doble de origen o token en `Map`.
- [ ] **Validación estricta de parámetros**: rechazar `offset[]` (arrays) en paginación.
- [ ] **No confiar en `body.role`** al registrar (ya validado, pero mantener); no reutilizar JWT en HMAC de imágenes (crear `IMAGE_TOKEN_SECRET`).
- [ ] Revisar `client_fingerprint` (IP+UA): falsos positivos en usuarios móviles; considerar firmar cookies en vez de IP estricta.
- [ ] Ofuscar `notes` en citas (email/teléfono/nombre ya están enmascarados).
- [ ] Añadir **2FA/MFA** y respuestas de login uniformes contra enumeración.

**Dependencias (`server/`)**
- [ ] `multer` 1.0.0–2.1.1 → **alta ×2** (GHSA-72gw-mp4g-v24j, GHSA-3p4h-7m6x-2hcm) — subir a ≥2.1.1 (DoS por uploads anidados/abortados).
- [ ] `qs` 6.11.1–6.15.1 → moderada (GHSA-q8mj-m7cp-5q26).
- [ ] `body-parser` → baja (GHSA-v422-hmwv-36x6).

### C2. Chat / RAG (`server/rag/`)

- [ ] **Verificar la disponibilidad del contenedor RAG**: funciona ahora, pero si Ollama/ChromaDB caen, `/api/chat/stream` vuelve a "Error en el servicio RAG". Monitorizar y reintentar.
- [ ] Configurar `RAG_SERVICE_SECRET` con valor fuerte (hoy default `change-me-in-production`).
- [ ] No exponer el puerto `5001` de RAG al exterior (red interna en compose).
- [ ] Añadir **persistencia/respuesta de fallback**: si RAG está caído, devolver respuesta amable en vez de error crudo.
- [ ] Límite de tokens/longitud del prompt para evitar abuso de costo del LLM.

### C3. Frontend (`src/`)

- [ ] **🟠 Unificar la autenticación**: `AuthContext` usa cookies (`credentials: 'include'`) pero `main.jsx` lee `localStorage.getItem('token')` que **nunca se escribe** → el interceptor nunca agrega `Authorization`. Decidir UN mecanismo:
  - Cookie: arreglar dominio/SameSite para que la cookie viaje cross-site (o mover API al mismo dominio).
  - Bearer: guardar el token real y que el interceptor lo aplique a la URL absoluta del backend (hoy `VITE_BASE_URL`/`window.location.origin` → `/api` en Vercel da **404**).
- [ ] Configurar `VITE_BASE_URL` en el build de Vercel con el dominio estable del backend (el bundle actual tiene hardcodeado el túnel `helping-bush-mines-tanks.trycloudflare.com`).
- [ ] Ofuscar `notes` en `MyAppointmentsPage.jsx`.
- [ ] **Dependencias (raíz)**: `react-router`/`react-router-dom` ≥7.12.0-pre.0 → **alta ×2** (GHSA-qwww-vcr4-c8h2). Evaluar `npm audit fix --force` (downgrade a 7.11.0) o actualizar a versión corregida.

---

## D. Checkpoint del despliegue (Vercel + túnel)

| Elemento | Estado |
|---|---|
| SPA estática | ✅ HTTPS + HSTS + nosniff |
| Bundle actual | `index-DVoLsGEe.js` (rolldown) |
| Backend en bundle | `https://helping-bush-mines-tanks.trycloudflare.com` (efímero) |
| `/api/*` en Vercel | ❌ 404 (sin proxy/función serverless) |
| `/health` backend | ✅ 200 (con y sin Origin) |
| CORS | ✅ evil.com → 403 |
| JWT forjado (secret conocido) | ✅ 401; con secret local del `.env` → 200 (riesgo de diseño) |
| Chat | ✅ RAG responde |
| Login/registro (rate limit) | ✅ 429 controlado |
| BD pública 3306 | 🔴 Abierta, credencial sin rotar |

---

## E. Notas finales

- El backend está **funcionalmente estable y seguro** en esta ventana (CORS/auth/rate limits/RAG OK). La deuda se concentra en: **secretos compartidos dev/prod + BD pública con credencial en el historial** (crítico), **túnel efímero** (disponibilidad), **auth cross-site rota en navegador** y **dependencias altas**.
- **Prioridad inmediata:** (1) rotar BD + cerrar 3306 + purgar credenciales del historial; (2) secretos por entorno; (3) host estable; (4) arreglar la sesión en el navegador; (5) `npm audit fix` en `server/` y evaluar `react-router`.
