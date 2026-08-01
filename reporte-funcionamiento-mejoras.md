# Danhee — Análisis del Proyecto: Funcionamiento y Mejoras

**Proyecto completo analizado:** frontend (Vercel) + backend (Node/Express + MySQL) + chat (RAG/Ollama)
**Fecha:** 2026-07-31
**Estado del deploy verificado en vivo:** Frontend OK en Vercel · Backend OK en túnel Cloudflare · Chat OK (respuesta IA real confirmada)

---

## 1. Funcionamiento actual

### Frontend (Vercel — `danhee-cake.vercel.app`)
| Funcionalidad | Estado |
|---|---|
| Landing / catálogo / explorar / diseñador 3D | ✅ Funciona (estático) |
| Login / Registro | ✅ Flujo completo (rate limit activo en `/api/auth/*`) |
| Dashboard repostero (stats, citas, catálogo CRUD) | ✅ Con JWT válido |
| Mis citas / agendar cita | ✅ Con JWT válido |
| Checkout OXXO | ⚠️ Genera comprobante mock, **no persiste orden** |
| Checkout tarjeta | ❌ Deshabilitado (por diseño, correcto) |
| Chat (streaming IA) | ✅ Respuesta RAG real confirmada |

### Backend (Node/Express, puerto 4000/5000)
- **CRUD funcional**: cakes, bakers, categories, appointments, auth (login/register/refresh/logout), payments.
- **Validaciones**: express-validator, parameterValidator, apiGuard, sqlInjectionBlocker, sanitize — buena profundidad.
- **BD**: Clever Cloud MySQL funcionando (26 usuarios, 97 pasteles, 752 mensajes).

### Chat (microservicio RAG `:5001` + Ollama + ChromaDB)
- ✅ `/api/chat/stream` responde streaming SSE con respuestas del agente (router + tools baker/customer).
- ⚠️ Historial: sesiones guardadas con `client_id=null` (la mayoría son de invitados) → `/api/chat/history` devuelve vacío para usuarios logueados.
- ⚠️ El RAG service por sí solo no valida autenticación (la valida el Node server).

---

## 2. Problemas críticos detectados (por prioridad)

### 🔴 P0 — Seguridad (afecta todo)
1. **JWT forjable**: backend corriendo con `JWT_SECRET=change-me-in-production` (docker.env tiene placeholder `TU_JWT_SECRET`). Cualquiera firma tokens admin.
2. **BD expuesta + credenciales en git**: `docker.env` commitado (git) con credenciales reales de Clever Cloud; puerto 3306 abierto a internet.
3. **CORS abierto**: `app.js:170` `return callback(null, true)`.
4. **Middlewares desactivados**: rate limiting global, WAF avanzado, ipBlocker, attackDetector (comentados en `app.js`).

### 🔴 P1 — Infraestructura (rompe la app)
5. **Backend en túnel efímero**: el bundle de Vercel apunta a `literally-justice-nat-saturday.trycloudflare.com`. Los túneles trycloudflare **cambian de URL en cada reinicio** → la app muere cuando el túnel se cae. Debes mover el backend a un host estable.

### 🟠 P2 — Funcional
6. **Pagos sin backend real**: el ticket OXXO no se guarda ni hay endpoint de orden/estado de pago. El repostero no ve pagos.
7. **Historial de chat roto para logueados**: `client_id` no se asocia correctamente en `chat_sessions` (queda null).
8. **IDOR en historial**: `/api/chat/history?client_id=X` no valida ownership.
9. **Sin verificación de email / 2FA** en registro.

### 🟡 P3 — Calidad
10. **PII sin ofuscar** en citas del repostero (`client_name`, `client_email`, `client_phone`).
11. **Token en localStorage** (vulnerable a XSS).
12. **robots.txt / security.txt con URL obsoleta** de un deploy ngrok anterior.
13. **README desactualizado** (habla de Vite template, no del proyecto).

---

## 3. Plan de mejora por módulo

### Backend (`server/`)
1. **Rotar secretos** y quitarlos del repo:
   ```powershell
   # Generar secretos fuertes
   node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
   ```
   - `git rm --cached docker.env` y añadirlo a `.gitignore`.
   - Cargarlos como variables de entorno del proveedor (Clever Cloud env vars / secret manager).
2. **Restringir la BD**: en Clever Cloud, configurar firewall/whitelist de IPs (solo el servidor).
3. **Reactivar defensas** en `app.js`:
   - `ipRateLimiter`, `apiLimiter`/`readLimiter`/`writeLimiter`/`methodLimiter`.
   - `advancedSecurity` (ajustando falsos positivos), `ipBlocker` + `attackDetector`.
4. **CORS con allowlist** real (solo `https://danhee-cake.vercel.app` y `localhost:5173`).
5. **Auth**:
   - JWT: forzar fallo en producción si `JWT_SECRET` es placeholder (quitar `change-me-in-production`).
   - Refresh tokens: rotación con revocación por usuario + expiración corta del access token.
   - Verificación de email al registrar + opción de 2FA/TOTP.
6. **Pagos**: crear tabla `orders` + `payments`; endpoint real `POST /api/payments/oxxo-ticket` que guarde la orden con estado `pending`; el frontend consulta el estado real en vez de `setTimeout`.
7. **Chat**:
   - Asociar `client_id` real al crear sesión (usar `user_id` del JWT, ya disponible en el body a RAG).
   - Validar ownership en `/api/chat/history` y `DELETE /api/chat/history` (que `client_id` == `req.user.id`).
   - Aplicar `chatLimiter` al `/api/chat/stream` (hoy definido sin limitador en `app.js:480`).
8. **Logs**: `robots.txt` y `security.txt` apuntan a una URL muerta — actualizar al dominio real.

### Frontend (`src/`)
1. **Config de API**: usa `import.meta.env.VITE_BASE_URL`. Al desplegar en Vercel, definir esa variable apuntando al backend estable (NO dejar la URL de trycloudflare hardcodeada).
2. **Ofuscar PII**: en las citas del repostero mostrar `cliente@****.com` y teléfono parcial (`****1234`).
3. **Mover token de `localStorage` a cookie `httpOnly`** (requiere endpoint de refresh + CSRF token) — o al menos reducir el tiempo de vida.
4. **Checkout**: reemplazar `setTimeout` + `alert` por consulta al estado real de la orden en el backend.

### Despliegue Vercel
- `vercel.json` actualmente solo sirve el SPA (rewrites). No hay serverless functions. OK si el backend vive aparte.
- En el dashboard de Vercel → Settings → Environment Variables, agregar:
  - `VITE_BASE_URL=https://<backend-estable>` (la URL del backend con la API).

### Chat (microservicio RAG `server/rag/`)
- Validar auth en los endpoints directos del RAG (hoy solo el Node server valida).
- `GET /chat/history?client_id=X` → agregar ownership (client_id debe venir firmado o validarse contra el Node server).
- Revisar `/observability/logs/:sessionId` (expone info sin auth).
- Ingesta de documentos: revisar que la knowledge base (`danhee_knowledge_base.pdf`, `cake_sizes.pdf`) esté indexada en ChromaDB.

---

## 4. Checklist para producción

- [ ] Backend en host estable (no trycloudflare/ngrok)
- [ ] `VITE_BASE_URL` apuntando a ese backend (Vercel env var)
- [ ] JWT_SECRET fuerte, rotado, fuera del repo
- [ ] BD no accesible públicamente (firewall)
- [ ] CORS allowlist
- [ ] Middlewares de seguridad reactivados
- [ ] Pagos con órdenes reales en BD
- [ ] Historial de chat con ownership + client_id correcto
- [ ] PII ofuscada en frontend
- [ ] Verificación de email + 2FA
- [ ] robots.txt / security.txt actualizados
