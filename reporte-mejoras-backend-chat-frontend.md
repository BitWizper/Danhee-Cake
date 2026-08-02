# Reporte de Mejoras — Backend, Chat y Frontend de Danhee

**Fecha:** 2026-08-01
**Base:** Revisión de código del proyecto completo (`server/`, `src/`, `server/rag/`, `docker-compose.yml`, config Vercel) + validación contra el despliegue vivo.

> 📌 Nota importante: durante la revisión, el repositorio **cambió en vivo** (commits nuevos: "eliminar fallback secrets", "mejorar chat SSE", "persistir rate-limit"). Este reporte refleja **tanto** el estado del deploy como el del código local, marcando lo que ya está corregido en el código pero **aún no desplegado**.

---

## A. Estado general por módulo

| Módulo | Funciona | Madurez |
|---|---|---|
| Frontend (Vercel SPA) | ✅ Estático OK | 🟡 Deuda de auth |
| Backend (Node/Express + MySQL) | ⚠️ Intermitente (túnel caído) | 🟠 Crítico en infra |
| Chat (Node server + RAG + Ollama + ChromaDB) | ❌ Caído en producción (timeout) | 🟠 |
| Pagos (OXXO) | ⚠️ Mock sin persistencia | 🟠 |
| Citas | ✅ Con JWT válido (y con JWT forjado) | 🟡 |

---

## B. Correcciones ya hechas en el código (pero NO en el deploy)

1. **JWT crash-on-invalid en producción** (`app.js`): si `JWT_SECRET` es placeholder/corto → `process.exit(1)`. ✅
2. **CORS con allowlist real** (`app.js`): rechaza orígenes no permitidos; wildcard trycloudflare solo en dev. ✅
3. **Auth por cookie** (`auth.js`): lee `access_token` de cookie o Bearer; whitelist `algorithms:['HS256']`. ✅
4. **CSRF en rutas de auth** (`csrfProtection`, `csrfTokenGenerator`). ✅
5. **PII masking** en citas del frontend (`maskEmail`, `maskPhone`, `maskName`). ✅
6. **Ownership en historial de chat** (`getChatHistory`/`deleteChatHistory`). ✅
7. **Rate limiters reactivados** (429 observados en vivo). ✅

> ⚠️ **Problema de raíz para TODO lo anterior:** el deploy no corre este código. La app viva sigue con fallback `change-me-in-production`, CORS abierto y sin CSRF.

---

## C. Mejoras pendientes por módulo

### C1. Backend (`server/`)

**Crítico — Despliegue e infraestructura**
- [ ] **Host estable**: reemplazar el túnel trycloudflare (efímero y caído con frecuencia) por un servicio con dominio fijo (Railway, Render, Fly.io, o Clever Cloud App). Fijar `FRONTEND_URL` y `VITE_BASE_URL` al dominio estable en Vercel.
- [ ] **`docker-compose.yml`**: cambiar `JWT_SECRET=${JWT_SECRET}` por `${JWT_SECRET:?error}` para que falle si la variable no está definida en el shell host (evita el fallback silencioso al placeholder). Aplicar lo mismo a `REFRESH_TOKEN_SECRET`, `DB_PASSWORD`.
- [ ] **Rotar `DB_PASSWORD`** (sigue siendo la misma credencial histórica) y **cerrar 3306** (firewall/whitelist en Clever Cloud).
- [ ] **Configurar `RAG_SERVICE_SECRET`** en `server/.env` y `docker.env` (hoy solo existe en `.env.example`). Quitar la exposición del puerto `5001` en compose (red interna).

**Seguridad**
- [ ] Eliminar el fallback `change-me-in-production` de `requireEnv('JWT_SECRET', ...)` — dejar sin fallback (el crash en producción ya cubre el caso, pero el fallback es innecesario y peligroso).
- [ ] **Separar el secreto HMAC de imágenes**: `createHmac('sha256', process.env.JWT_SECRET || 'default-secret')` debe usar una clave dedicada `IMAGE_TOKEN_SECRET`, no el JWT.
- [ ] **Validar `role` en registro**: nunca confiar en `body.role` sin verificación; idealmente no permitir `role` en el body (asignar `cliente` por defecto y crear reposteros vía flujo admin).
- [ ] **Corregir `authorize(['admin'])`**: `required_roles: [["admin"]]` — el doble array rompe la comparación para admins legítimos (falso 403). Usar `authorize('admin')`.
- [ ] **Endpoint de citas "invitado"**: validar ownership del `client_id` del body (hoy se persiste el que mande el cliente).
- [ ] **Constraint único** en `appointments (baker_id, date, time_slot)` para evitar doble reserva (race condition).
- [ ] **chatLimiter**: no eximir por `role` de un JWT verificable-cliente (hoy `skip` si role==repostero; con JWT forjable se evita el límite). Limitar por sesión/ID también.

**Funcional / datos**
- [ ] **Pagos reales**: crear tablas `orders`/`payments`, persistir el ticket OXXO con estado `pending`, y un endpoint de consulta de estado. Hoy el ticket se genera y se pierde.
- [ ] **No duplicar PII en notas de citas**: el frontend arma `notes: "Cliente: Mily. ..."` y el backend la guarda — ofuscar o usar campos dedicados `client_name`/`client_phone` (ya existen) y dejar `notes` solo como texto libre.
- [ ] **Verificación de email + 2FA/TOTP** opcional.
- [ ] **Revisar `/api/security/alerts`**: expone IPs completas de clientes — enmascarar IPs de usuarios finales (solo staff/admin).

### C2. Chat (Node server + RAG)

**Roto en producción**
- [ ] **RAG/Ollama caído**: `/api/chat` y `/api/chat/stream` dan timeout en vivo. Revisar el arranque de Ollama + ChromaDB + el `TaskRouter`. Agregar healthcheck en el `rag-service` y mensajes de fallback inmediato en el Node server (hoy espera a que el fetch falle → timeout).
- [ ] **`RAG_SERVICE_SECRET` sin configurar** → el RAG corre en "modo inseguro" y acepta cualquier request. Configurarlo en ambos lados y bloquear el puerto 5001 del host.

**Funcional**
- [ ] **Asociación `client_id` real**: la mayoría de `chat_sessions` tiene `client_id=null` (invitado). Cuando el usuario está autenticado, el Node server envía `user_id`, pero las sesiones viejas quedaron con null → `/api/chat/history` devuelve vacío. Hacer backfill/migración por `conversation_id`.
- [ ] **SSE**: el frontend parsea chunks `data:` y tipos `token`/`error` — asegurar `keep-alive`, `retry`, y manejo de desconexión (cleanup del `AbortController`).
- [ ] **Validación del mensaje**: el `validateChatText` bloquea `--`, `/*`, `..`, `sleep(`, `benchmark(`. Revisar falsos positivos con números telefónicos/emails legítimos (p.ej. `+52-999...`).

**Seguridad**
- [ ] **Rate limit del chat sin bypass por rol forjable** (ver C1).
- [ ] **Ownership en RAG directo**: `/chat/history/:conversationId` y `DELETE /chat/*` deben validar que `user_id` coincida con el dueño (hoy el Node server lo valida, pero el RAG directo no).
- [ ] **No exponer `conversation_id` en URLs de logs** en el RAG.

### C3. Frontend (`src/`)

**Auth — resolver la contradicción (bloqueante)**
- [ ] **Unificar**: `main.jsx` interceptor (localStorage + solo URLs relativas `/api`) vs `AuthContext` (cookies + `credentials:'include'`) vs backend (cookie o Bearer).
  - Opción A (recomendada): volver a **Bearer en memoria** (sin localStorage) + `getApiUrl` absoluto, con el token en estado React y refresh vía `/api/auth/refresh`. Mover el Bearer al interceptor pero con URL absoluta (chequear `getApiUrl`).
  - Opción B: cookies httpOnly con `SameSite=lax` + `COOKIE_DOMAIN` correcto + CSRF en todos los mutating. (⚠️ Con backend en `trycloudflare.com` y app en `vercel.app`, las cookies **no viajan** — requiere el host estable del C1.)
- [ ] **Sacar `token` de localStorage** (hoy `main.jsx` lee `localStorage.getItem('token')`; exfiltrable por XSS).
- [ ] **`apiHelper.js`**: adjuntar el Bearer automáticamente (hoy las páginas lo repiten manualmente y el interceptor global casi nunca aplica porque las URLs son absolutas).

**Checkout**
- [ ] Reemplazar `setTimeout` + `alert` en `UI_checkout_process.jsx` por consulta real al estado de la orden (requiere C1 pagos).
- [ ] Validar precios/cantidades en el backend, no solo en el carrito.

**PII / UX**
- [ ] Ofuscar `notes` en la vista de repostero (o eliminar la duplicación de nombre/teléfono).
- [ ] `robots.txt` / `security.txt`: el SPA no los sirve en Vercel — generar con un endpoint serverless o añadirlos a `public/`.

**Calidad**
- [ ] Tests: existe `src/test/AuthContext.test.jsx` y `setup.js` — ampliar cobertura (login flow, chat, checkout, citas). Verificar si hay script `test` en `package.json`.
- [ ] `npm audit fix` (react-router high).

---

## D. Checkpoint del despliegue (Vercel)

1. Frontend: `VITE_BASE_URL=https://<backend-estable>` como variable de entorno (NO hardcodear el túnel en el bundle).
2. Backend: correr con `NODE_ENV=production` + secrets fuertes en el entorno del proveedor.
3. BD: cerrar 3306, rotar password, conectar solo desde el host del backend.
4. RAG: `RAG_SERVICE_SECRET` + red interna.
5. Verificar en vivo: `curl -I https://<backend>/health`, `GET /api/cakes`, `POST /api/auth/login` (200/401), `POST /api/chat/stream` (SSE), `OPTIONS` con `Origin: evil.com` → **debe** devolver 403.

---

## E. Notas finales

- El **deploy actual y el código local están desincronizados**: las correcciones de seguridad existen en el repo pero el servidor vivo ejecuta una versión anterior. **Primera acción: desplegar el código actual.**
- La **prioridad #1 es el host estable**; sin él, ninguna mejora de seguridad es sostenible (el túnel se cae y la URL cambia, rompiendo todo).
- Puntaje sugerido de madurez actual: **~35/100**; con las acciones de la sección C1-C3 completas, objetivo: **70+/100**.
