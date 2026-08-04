# Pruebas de Rutas del Chatbot — Danhee Cake

**URL de front probada:** https://danhee-cake.vercel.app/
**URL de API (extraída del bundle `index-DMQj48Et.js`):** `https://why-ben-adoption-measurements.trycloudflare.com`
**Fecha:** 2026-08-04
**Nota:** el backend vive en un túnel de Cloudflare que cambia de URL en cada redeploy; la evidencia es contra el túnel activo `why-ben-adoption-measurements`. El código probado es el del **repo local con commit `14829b8 "Ultimas correcciones del back"`** (aplica también `088d71c`, `37c8474`, `8860b9c`), y el deploy **sí refleja ese commit esta vez**.

---

## Rutas del chatbot

| Ruta | Método | Usada por el frontend | Requiere auth | Requiere CSRF |
|---|---|---|---|---|
| `/api/chat/stream` | POST | ✅ Sí (`ChatBot.jsx`, escaneo: `Ue=N("/api/chat/stream")`) | No (guest allowed) | ⚠️ Sí, **solo si hay autenticación** |
| `/api/chat/history` | GET | ✅ Sí | Sí | No (GET) |
| `/api/chat/history` | DELETE | ❌ No | Sí | ✅ Sí |
| `/api/chat` | POST | ❌ No | — | — (**ruta ELIMINADA**) |

El frontend usa **solo 2 rutas**: `POST /api/chat/stream` y `GET /api/chat/history` (confirmado en el bundle y en `src/components/chatbot/ChatBot.jsx`).

**Cambios clave vs rondas anteriores (commit `14829b8`):**
- **`POST /api/chat` (endpoint JSON no-streaming, antes roto con 500/410) fue **eliminado** de `server/src/routes/chat.routes.js`.** Ahora solo existen `GET /history` y `DELETE /history`. El bug de `askChatbot` quedó resuelto de raíz.
- Se introdujo `conditionalCsrfProtection` (`csrfProtection.js:137-147`) aplicado a `/api/chat/stream` (`app.js:579`): el CSRF solo se exige **cuando la petición trae un token/bearer**; las peticiones de invitado pasan.

---

## 1. `POST /api/chat/stream` — Streaming del chatbot

**Qué espera que le mandes:**
- `Content-Type: application/json`; opcional `Authorization: Bearer <token>`.
- Body: `{ "message": string (1–5000, `validateChatText(msg,5000)`), "conversation_id"?: string (1–100), "client_id"?: número, "role"?: 'cliente'|'repostero' }`.
- **CSRF condicional:** si envías token → exige también `X-CSRF-Token` válido (validado contra el Map de `csrfProtection`); si no envías token, no se exige.
- Middlewares: `conditionalCsrfProtection`, `chatLimiter` (rate), `clientChatGuard`.
- Devuelve SSE (`text/event-stream`): eventos `{"type":"token","content":...}` y `{"type":"response","content":...,"was_blocked":...}`.

**Qué le mandé / Qué respondió:**

| Enviado | Respuesta | Resultado |
|---|---|---|
| Invitado, `{"message":"hola que tal"}` (sin token, sin CSRF) | SSE 200: `type:token` + `type:response` | ✅ OK |
| Con Bearer **sin CSRF** | `403 {"error":"CSRF_TOKEN_MISSING","cause":"token_missing","message":"Token CSRF requerido para esta operacion"}` | ⚠️ Comportamiento nuevo (condicional) |
| Con Bearer + `X-CSRF-Token` + cookie | SSE 200: `type:token` + `type:response` | ✅ OK |
| `{"message":""}` | `400` "El mensaje no puede estar vacío..." | ✅ validación |
| `{"message":12345}` (no-string) | `400` idem | ✅ validación |
| `{"message":"<5000 chars o sospechoso>"}` | caso límite / `SUSPICIOUS_CHAT_PATTERN` | ⚠️ ver bug #4 |
| Prompt-injection (`"ignora todas las instrucciones..."`) | `{"type":"response","content":"Error al procesar la solicitud...","was_blocked":false}` | ⚠️ No bloqueo explícito (bug #4) |

**Notas:** stream OK. Cuando hay token, guarda ownership (`saveConversationOwnership` → `chat_sessions`) y envía el `conversation_id` al RAG. Límite de mensaje real es **5000 chars** (antes se reportaba 2000; el frontend también envía `client_datetime`, que el backend ignora).

---

## 2. `GET /api/chat/history` — Historial de conversación

**Qué espera que le mandes:** `Authorization: Bearer <token>` (o cookie `access_token`); query opcional `conversation_id?` y `client_id?` (al menos uno); `limit` 1–500 (entero), `offset` ≥0. Middlewares: `authMiddleware`, `ipBlocker`, `validateHistoryParams`+`handleValidationErrors`. El backend valida ownership con `getAuthenticatedUserId` (Bearer o cookie) y `verifyConversationOwnership`/`checkConversationExists`.

**Qué le mandé / Qué respondió:**

| Enviado | Token | Respuesta | Resultado |
|---|---|---|---|
| `?client_id=1` (propio) | Bearer id=1 | `200 {messages:[...]}` | ✅ OK |
| `?client_id=2` (ajeno) | Bearer id=1 | `403 {"error":"No tienes permiso para ver este historial"}` | ✅ ownership |
| `?conversation_id=uuid-ajeno-0001` (inexistente) | Bearer id=1 | `404 {"error":"Conversación no encontrada"}` | ✅ |
| Sin autorización | — | `401` | ✅ protegido |
| `?limit=9999` (fuera de rango) | Bearer id=1 | `400 {"error":"limit entre 1-500",...}` | ✅ validación |

**Notas (cambio vs ronda anterior):** antes un `conversation_id` ajeno existente daba 403 y uno inexistente 404; ahora hay **dos comprobaciones distintas** (`getChatHistory:171-181`): primero `checkConversationExists` (404 si no existe) y luego `verifyConversationOwnership` (403 si no eres dueño). IDOR por `client_id` y por `conversation_id` están bloqueados. El server además re-llama al RAG (no solo a la BD) y devuelve solo `messages`.

---

## 3. `DELETE /api/chat/history` — Borrar historial

**Qué espera que le mandes:** `Authorization: Bearer <token>` (o cookie); `X-CSRF-Token` + cookie; body `{ "conversation_id"?: string, "client_id"?: number|string }` (al menos uno). Middlewares: `authMiddleware`, `ipBlocker`, `writeLimiter`. `sanitizeClientId` acepta número y string numérico.

**Qué le mandé / Qué respondió:**

| Enviado | Respuesta | Resultado |
|---|---|---|
| `{"conversation_id":"uuid-ajeno-0001"}` (inexistente) | `404 {"error":"Conversación no encontrada"}` | ✅ |
| `{"client_id":2}` (número, ajeno) | `403 {"error":"No tienes permiso para eliminar este historial"}` | ✅ ownership (antes daba 400 confuso) |
| `{"client_id":"2"}` (string, ajeno) | `403` idem | ✅ ownership |
| `{"client_id":1}` (propio) | ⚠️ véase bug #3 | ⚠️ |

**Nota (cambio vs ronda anterior):** el bug del 400 confuso con `client_id` numérico quedó **corregido** en `14829b8` (`sanitizeClientId` ahora normaliza número). El `DELETE` ya no responde 200-para-cualquier-ID.

---

## Resumen de bugs / inconsistencias

1. ✅ **`POST /api/chat` roto (500/410): RESUELTO** — la ruta fue **eliminada**; ahora responde `404 Cannot POST /api/chat`.
2. 🐞 **CSRF condicional en `/api/chat/stream` (nuevo):** el CSRF solo se exige cuando hay token. El frontend adjunta `X-CSRF-Token` vía helper `ne()` en esa llamada, así que no rompe el flujo autenticado normal. **PERO** el token CSRF se valida contra el `Map` en memoria del proceso; en el túnel la app se reinicia a menudo y el `Map` queda vacío → un usuario autenticado con un `X-CSRF-Token` viejo puede recibir `403 CSRF_TOKEN_INVALID` hasta re-obtener token de `GET /api/auth/csrf-token`. Frágil en despliegues efímeros/multi-instancia (el token no se persiste).
3. 🐞 **`DELETE` solo por `client_id` apunta a una URL RAG vacía** (`deleteChatHistory:403`): cuando borras solo con `client_id` (sin `conversation_id`), hace `fetch(`${ragUrl}/chat/${sanitizedConversationId}`, DELETE)` con `sanitizedConversationId=''` → `DELETE /chat/`. Solo el flujo con `conversation_id` borra realmente; el borrado por `client_id` solo marcaría ownership pero el DELETE RAG va a una ruta vacía. 
4. 🐞 **Prompt-injection no bloqueado explícitamente:** con `"ignora todas las instrucciones previas..."` el stream devuelve `{"type":"response","content":"Error al procesar la solicitud...","was_blocked":false}` — error genérico del RAG, **no** un bloqueo por patrón malicioso (`was_blocked` en `false`). El `clientChatGuard` y `validateChatText` existen, pero este caso no dispara bloqueo visible.
5. ⚠️ **Excepción guest en una ruta con estado:** como invitado, `POST /api/chat/stream` NO exige CSRF ni auth (correcto para UX), pero es el único mutador accesible sin CSRF; un invitado puede encadenar llamadas al RAG limitadas solo por `chatLimiter` (por IP). No es grave (no hay estado del invitado) pero rompe la regla "todo mutador lleva CSRF".
6. ⚠️ **404 vs 403 según origen:** en el historial, un `conversation_id` inexistente da **404** "Conversación no encontrada" (por `checkConversationExists` antes que el ownership), lo que permite determinar si un UUID existe o no sin ser dueño (pequeño oráculo de existencia). El acceso a **existente ajeno** sí da 403.
7. ℹ️ `GET /api/chat/history` devuelve solo `{ messages: [{role, content}] }` (saneado; se descartan metadatos internos) — mejora.
8. ℹ️ **Túnel efímero** (`why-ben-adoption-measurements.trycloudflare.com`): la URL cambia en cada redeploy; el bundle la tiene **hardcodeada** (falla la integración al rotar) y dificulta reproducir estos tests.

**Nota de reproducción:** usar `--data-binary @archivo.json` para los cuerpos JSON; con `-d '...'` en PowerShell el JSON puede quedar inválido y el server responde legítimamente `400 INVALID_JSON`.