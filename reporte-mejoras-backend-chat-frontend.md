# Danhee — Reporte de Mejoras (Backend + Chat + Frontend)

**Fecha:** 2026-08-01
**Cobertura:** Todo el proyecto (frontend Vercel + backend Node/Express + MySQL + chat RAG/Ollama/ChromaDB + Docker/Vercel).
**Estado verificado en vivo:** Frontend OK · Backend OK (túnel efímero) · Chat OK (respuesta RAG real confirmada) · Login/Registro OK (rate limited).

---

## 1. Lo que ya funciona bien (no tocar)

- ✅ **Auth por capas**: JWT access (15m) + refresh (7d) con secrets separados; bcrypt; rate limiters por IP (`authLimiter` 5/15m, `registerLimiter` 3/h) y brute-force protection.
- ✅ **Defensa en profundidad**: `inputSanitizer`, `parameterValidator`, `apiGuard`, `apiFuzzingGuard`, `sqlInjectionBlocker`, `methodBlocker`, WAF `advancedSecurity`, `httpsEnforcer`, bloqueo de rutas sensibles.
- ✅ **Headers**: CSP estricto, HSTS preload, nosniff, X-Frame-Options DENY, referrer-policy.
- ✅ **Chat**: streaming SSE real, validación de mensaje (regex + patrones sospechosos), `clientChatGuard`, `chatLimiter` (20/min), `RAG_SERVICE_SECRET`.
- ✅ **Privacidad**: PII enmascarada (`maskName/maskEmail/maskPhone`) en dashboards; endpoint de observabilidad del RAG eliminado.
- ✅ **Repositorio**: `docker.env` y `.env*` en `.gitignore`; `generate_secrets.cjs`; `setup-dev.js`.
- ✅ **SQLi/XSS**: parametrización + sanitización; pruebas de inyección bloqueadas.

---

## 2. Problemas críticos de funcionamiento (por prioridad)

### 🔴 P0 — El backend NO puede vivir en un túnel efímero
- El bundle desplegado apunta a `https://sep-scratch-garbage-anne.trycloudflare.com`. Los túneles `trycloudflare` **cambian de URL en cada reinicio** (el anterior `literally-justice-nat-saturday...` ya murió; se observó error 1033 con la API caída).
- Cada cambio obliga a reconstruir y re-desplegar Vercel con la nueva `VITE_BASE_URL`.
- **Acción:** alojar el backend en un host estable (VPS con dominio, Railway/Render/Fly, o un servidor con IP fija) y eliminar el túnel. Después definir `VITE_BASE_URL` en Vercel → Settings → Environment Variables.

### 🔴 P0 — El secret JWT activo es el placeholder (bug de docker-compose)
- `docker-compose.yml:16` → `JWT_SECRET=${JWT_SECRET}` sobreescribe `server/.env` y `docker.env` con una variable de shell vacía → `app.js:35` cae al fallback `change-me-in-production`.
- **Acción:** quitar esa línea del compose (o `JWT_SECRET=${JWT_SECRET:-}` no sirve; mejor no definirlo y dejar que `dotenv`/`env_file` lo cargue) y hacer que `app.js` **falle** en producción si el secret es placeholder/vacío.
- Ojo: `update-cloudflare-url.ps1:50-52` **sobrescribe `docker.env` dejándolo solo con `PUBLIC_HOST`** (borra DB/JWT). Revisar que ese script no borre secrets; mejor usar `-replace` línea por línea en vez de `Set-Content` total.

### 🟠 P1 — Pagos sin respaldo real
- El checkout OXXO genera un comprobante mock y el estado se "espera" con `setTimeout` + `alert`. No hay tabla `orders`/`payments` ni endpoint de consulta de estado.
- **Acción:** crear tablas `orders` + `payments`; `POST /api/payments/oxxo-ticket` que registre la orden (estado `pending` + folio); endpoint `GET /api/payments/:id` para que el frontend consulte el estado real.

### 🟠 P1 — Historial de chat roto para usuarios logueados (en vivo)
- Los `401` constantes en `/api/chat/history` del log de seguridad indican que el frontend pide historial sin token válido (o con token viejo tras rotar secretos). La mayoría de sesiones tienen `client_id=null` (invitados).
- El backend ya mejora: `db-config.js` ahora **actualiza** el `client_id` cuando una sesión existente lo tiene null (backfill).
- **Acción:** en `ChatBot.jsx`, asegurar que `GET /api/chat/history` siempre lleve el `Authorization` header con el token de `AuthContext` (no solo `localStorage`); y al crear sesión pasar el `user_id` real para que queden ligadas al usuario.

### 🟡 P2 — Bug en `authorize(['admin'])`
- `/api/admin/security-stats` devuelve `required_roles: [["admin"]]` y 403 **siempre** (el array llega anidado; `roles.includes('admin')` es false). El endpoint admin de estadísticas está roto.
- **Acción:** llamar `authorize('admin')` (rol plano) o aplanar `roles` dentro del middleware.

### 🟡 P2 — Detección de abuso/prompt-injection sin conectar
- `clientChatGuard.js` define `validateMessageLength`, `checkCooldown`, `checkRepeatMessages`, `checkUserRateLimit`, `detectChatAttackPatterns` con un catálogo de patrones de jailbreak/prompt injection, **pero no los invoca** (comentario "Continuar sin validaciones complejas de seguridad temporalmente").
- **Acción:** invocar las validaciones para clientes/no autenticados (manteniendo al repostero con sanitización básica).

---

## 3. Mejoras por módulo

### Backend (`server/`)
| Área | Mejora | Esfuerzo |
|---|---|---|
| Config/Secrets | Fallo duro si `JWT_SECRET` placeholder/vacío en prod; mover secrets a secret manager (Vercel env / Docker secrets); NO escribir `docker.env` completo desde scripts | Bajo |
| CORS | Usar la allowlist real en vez de `callback(null, true)` | Bajo |
| BD | Rotar credenciales; whitelist de IPs; `--ssl` habilitado (hoy `--ssl=0`); verificar migraciones reproducibles (no solo `benchmark_stress_cakes` de prueba) | Medio |
| Auth | Verificación de email al registrar; opción 2FA/TOTP; **rotación de refresh tokens** con revocación; logout que invalide refresh en BD | Medio |
| Appointments | Validar solapamiento de citas por baker/fecha/hora; límite de notas; notificación al repostero (email/in-app) | Medio |
| Pagos | Modelo real de órdenes + estado + folio (P1) | Medio |
| Admin | Arreglar `authorize`; endpoint de stats con IPs ofuscadas y audit-log | Bajo |
| Logs/Monitoring | Persistir rate-limit/brute-force (hoy `Map` en memoria se pierde al reiniciar); alertas; dashboard admin real | Medio |
| API | Rechazar arrays/objetos en query params (p. ej. `offset[]`) en vez de ignorarlos | Bajo |
| Imágenes | El token de `/api/images` usa `process.env.JWT_SECRET || 'default-secret'`: el fallback `default-secret` debe eliminarse | Bajo |
| Dependencias | `npm audit` periódico; pinnear imágenes Docker (mysql, chromadb, cloudflared) | Bajo |

### Chat / RAG (`server/rag/`)
| Área | Mejora | Esfuerzo |
|---|---|---|
| Auth | Aunque `RAG_SERVICE_SECRET` está configurado, si faltara el RAG aceptaría todo (modo dev). Fallar cerrado por defecto | Bajo |
| Abuso | Conectar las validaciones de `clientChatGuard` (cooldown, repetidos, rate limit por usuario, prompt-injection) | Medio |
| Historial | Asociar `client_id` correcto desde el alta de sesión; probar flujo completo logueado (la mayoría de sesiones quedan `client_id=null`) | Medio |
| Stream | El streaming tarda/expira bajo carga (timeouts observados). Añadir heartbeat SSE, timeout razonable y cola para Ollama | Medio |
| Herramientas del agente | Revisar `baker-tools.js`/`customer-tools.js`: el agente puede crear citas/catálogo — validar que el `user_id` usado provenga del JWT verificado (no del texto del prompt) | Alto |
| Ingesta | Verificar que la knowledge base (`danhee_knowledge_base.pdf`, `cake_sizes.pdf`) esté indexada en ChromaDB y documentar el proceso de re-ingesta | Bajo |
| Evaluación | Hay scripts (`evaluate-rag.js`, `evaluar-agente.js`): integrarlos a CI para medir regresiones del agente | Medio |

### Frontend (`src/`)
| Área | Mejora | Esfuerzo |
|---|---|---|
| Sesión | Mover `token` de `localStorage` a cookie `httpOnly` + CSRF; mínimo: `sessionStorage` y limpiar `user` con datos sensibles | Medio |
| Chat | Enviar siempre el token en `history`/`stream`; manejar `401` (refresh + reintento); mostrar estado del historial | Medio |
| Checkout | Sustituir `setTimeout`+`alert` por consulta real al estado de la orden | Medio |
| Estados de carga | Manejar errores de red de forma consistente (el túnel caído = pantallas vacías sin aviso) | Bajo |
| Accesibilidad/UX | Labels, foco, mensajes de error inline en formularios | Bajo |
| Tests | Agregar al menos Vitest + Testing Library para auth, carrito y checkout; ESLint ya existe? (verificar) | Medio |

### Infraestructura / DevOps
| Área | Mejora |
|---|---|
| Hosting | Backend estable (eliminar trycloudflare); ver `update-cloudflare-url.ps1` solo como fallback dev |
| Vercel | `vercel.json` correcto para SPA (rewrites); definir `VITE_BASE_URL` como env var (no hardcode en build) |
| CI/CD | Pipeline de build + test + deploy; escaneo de secrets (gitleaks/trivy) para evitar re-commit de `.env` |
| Docker | `docker-compose` con secrets no-vacíos; database/chromadb sin exponer puertos al host (ya comentados ✓) |
| Docs | README desactualizado (habla de Vite template); actualizar con arquitectura real, cómo correr, y manual de despliegue |

---

## 4. Checklist hacia producción

- [ ] Backend en host estable + `VITE_BASE_URL` correcta en Vercel
- [ ] `JWT_SECRET`/`REFRESH_TOKEN_SECRET` rotados **de nuevo** y sin fallback en prod (crash si placeholder)
- [ ] Credenciales de BD rotadas y BD sin acceso público
- [ ] CORS con allowlist
- [ ] `authorize('admin')` corregido
- [ ] `clientChatGuard` validaciones activas
- [ ] Pagos con órdenes reales
- [ ] Historial de chat funcional para usuarios logueados (token en todas las llamadas)
- [ ] Verificación de email + 2FA (opcional pero recomendado)
- [ ] Token fuera de `localStorage`
- [ ] `npm audit` limpio + imágenes Docker pinnadas
- [ ] README/documentación actualizada
- [ ] CI/CD con tests y escaneo de secrets
