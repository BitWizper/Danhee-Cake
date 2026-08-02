# Reporte de Mejoras — Backend, Chat y Frontend de Danhee

**Fecha:** 2026-08-02
**Base:** Revisión de código del proyecto completo (`server/`, `src/`, `server/rag/`, `docker-compose.yml`, config Vercel) + validación contra el despliegue vivo (túnel `navigation-rivers-naval-excellence.trycloudflare.com`).

> 📌 Nota importante: a diferencia de la ronda anterior, **el deploy ahora SÍ corre el código de seguridad corregido**: JWT con secret rotado (el placeholder `change-me-in-production` ya no funciona), CORS con allowlist, IPs enmascaradas en el log, `roles.flat()` en `authorize()`. Sin embargo, la migración a auth por cookie introdujo una **regresión funcional grave** (sesión rota cross-origin) y el CORS estricto **rompe `/health` y todo request sin `Origin`** en producción.

---

## A. Estado general por módulo

| Módulo | Funciona | Madurez |
|---|---|---|
| Frontend (Vercel SPA) | ✅ Estático OK | 🟠 Auth rota en navegador |
| Backend (Node/Express + MySQL) | ⚠️ Solo con navegador/origen permitido; 500 sin `Origin` | 🟠 Infra frágil |
| Chat (Node server + RAG + Ollama + ChromaDB) | ❌ `Error en el servicio RAG` | 🟠 |
| Pagos (OXXO) | ⚠️ Mock sin persistencia | 🟠 |
| Citas | ✅ Con JWT válido (Bearer) | 🟡 |
| Seguridad (dashboard, IPs, WAF) | ✅ Activo | 🟢 |

---

## B. Correcciones ya desplegadas (verificadas en vivo)

1. **JWT con secret real rotado**: el deploy rechaza tokens firmados con `change-me-in-production` (`INVALID_TOKEN`). ✅
2. **CORS restrictivo**: `Origin: https://evil.com` → rechazado; `https://danhee-cake.vercel.app` → 200. ✅
3. **IPs enmascaradas en el dashboard de seguridad** (`172.18.***.***`). ✅
4. **`authorize()` sin bug de doble array**: `roles.flat()` en `auth.js:105`. ✅
5. **CSRF tokens + CSP dinámico + `crypto.randomBytes`** en el código (commits `a9005e1`, `b36d9ab`, `60b0415`). ✅
6. **Rate limiters / IP Blocker activos** (403/503 en el histórico del log de seguridad). ✅

---

## C. Mejoras pendientes por módulo

### C1. Backend (`server/`)

**Crítico — Seguridad**
- [x] ~~Rotar `JWT_SECRET`/`REFRESH_TOKEN_SECRET`~~ (hecho en deploy, pero ver abajo el punto de secretos en repo).
- [ ] **🔴 Sacar secretos del repositorio**: `docker.env` (raíz) está commiteado con `DB_PASSWORD`, `JWT_SECRET` y `REFRESH_TOKEN_SECRET` reales. Mover a secrets del proveedor, añadir `*.env` al `.gitignore` y purgar el historial de git que los contenga.
- [ ] **🔴 Rotar `DB_PASSWORD`** (sigue igual desde la ronda inicial) y **cerrar el MySQL público 3306** (allowlist de IPs del deploy en Clever Cloud).
- [ ] **`RAG_SERVICE_SECRET`**: configurarlo en `server/.env` y `docker.env`; hoy `docker-compose.yml:83` usa el default inseguro `${RAG_SERVICE_SECRET:-change-me-in-production}` y el servicio de chat falla (`Error en el servicio RAG`).
- [ ] Eliminar fallbacks tipo `default-secret`/`change-me-in-production` de `createHmac(...)` y `requireEnv` — usar clave dedicada `IMAGE_TOKEN_SECRET` (no reutilizar el JWT).
- [ ] **No confiar en `body.role`** en registro; asignar `cliente` por defecto.

**Crítico — Funcionalidad (regresiones del deploy nuevo)**
- [ ] **CORS en producción**: los requests sin `Origin` (curl, `/health`, healthchecks, cron) devuelven **500**. El `errorHandler` debe mapear los errores CORS a 403 (busca `'CORS no permitido'` pero el error real es `'Not allowed by CORS'`), o permitir sin origen desde hosts confiables. Corregir `app.js:231`.
- [ ] **Autenticación cross-origin rota**: cookies `SameSite=Strict` en `trycloudflare.com` nunca llegan desde `vercel.app`. Definir un único dominio para la API (subdominio del mismo sitio) o usar `SameSite=Lax` con dominio explícito; o volver a Bearer con `localStorage`. Hoy el navegador recibe **401 en `/api/auth/me`** (confirmado en el log de seguridad).
- [ ] **Host estable**: el túnel efímero cambia de URL en cada reinicio y rompe todo (CORS, cookies, integraciones). Desplegar en Railway/Fly/Clever Cloud App con dominio propio.

### C2. Chat / RAG (`server/rag/`)

- [ ] **Reparar el servicio RAG**: `POST /api/chat/stream` → `{"type":"error","content":"Error en el servicio RAG"}` en vivo. Verificar contenedor RAG (Ollama/ChromaDB), `RAG_SERVICE_SECRET` y conectividad de red.
- [ ] Configurar `RAG_SERVICE_SECRET` con valor fuerte y quitar el fallback.
- [ ] No exponer el puerto `5001` en `docker-compose.yml` (red interna); el frontend no debe alcanzar RAG directamente.

### C3. Frontend (`src/`)

- [ ] **Unificar la autenticación**: `AuthContext` usa cookies (`credentials: 'include'`), pero `main.jsx` sigue inyectando `Authorization: Bearer` solo para URLs relativas `/api`. Decidir UN mecanismo:
  - Si es Bearer: volver a guardar `token` en `localStorage` y que el interceptor lo aplique a la URL absoluta del backend.
  - Si es cookie: eliminar el interceptor y arreglar dominio/SameSite del backend.
- [ ] **Ofuscar `notes`** en `MyAppointmentsPage.jsx` (email/teléfono/nombre ya están enmascarados, pero el campo de notas no).
- [ ] Revisar `VITE_BASE_URL`/URL del backend: apuntar a un host estable, no al túnel efímero.

---

## D. Checkpoint del despliegue (Vercel)

| Elemento | Estado |
|---|---|
| SPA estática | ✅ Funciona, HTTPS + HSTS |
| Bundle actual | `index-C87BJ8H4.js` (177 KB) |
| Backend en bundle | `https://navigation-rivers-naval-excellence.trycloudflare.com` (efímero) |
| `vercel.json` | Solo rewrites SPA; no proxya `/api/*` |
| Login real (navegador) | ❌ 401 en `/api/auth/me` (cookie no viaja) |
| Chat (navegador) | ❌ Error RAG |
| `/health` (curl) | ❌ 500 (sin `Origin`) |
| `/api/security/alerts` (Bearer admin) | ✅ 200 |

---

## E. Notas finales

- El avance de seguridad es real y medible (CORS cerrado, JWT placeholder inválido, IPs enmascaradas, WAF activo), pero la configuración de despliegue **no es estable**: túnel efímero + auth por cookie cross-origin + 500 sin `Origin` dejan la app funcionalmente inoperante para usuarios reales.
- **Prioridad absoluta**: (1) sacar secretos del repo y rotar DB/refrescar historial; (2) host estable con dominio propio; (3) arreglar autenticación cross-origin; (4) reparar RAG/chat; (5) corregir el 500 de CORS sin `Origin`.
