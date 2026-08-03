# Guía de Diagnóstico con Logs - Danhee Cake

## Cómo Ver los Logs

### Backend (Servidor)

Los logs del backend aparecen en la terminal donde ejecutas el servidor:

```bash
cd server
npm start
```

O si usas Docker:

```bash
docker-compose logs -f backend
```

### Frontend (Navegador)

1. Abre la aplicación en el navegador
2. Presiona `F12` para abrir DevTools
3. Ve a la pestaña **Console**
4. Intenta hacer login o register
5. Verás logs con prefijos `[LOGIN_FRONTEND]` o `[REGISTER_FRONTEND]`

---

## Qué Significan los Logs

### Backend - Login

```
[LOGIN] ========== INICIO LOGIN ==========
[LOGIN] IP: ::1 | User-Agent: Mozilla/5.0...
[LOGIN] Body recibido: { email: 'test@test.com', username: '[MISSING]' }
[LOGIN] Headers: { origin: 'http://localhost:5173', referer: '...' }
[LOGIN] Validando campos requeridos...
[LOGIN] Buscando usuario en BD...
[LOGIN] ✓ Usuario encontrado: { id: 1, email: 'test@test.com', role: 'cliente' }
[LOGIN] Verificando contraseña...
[LOGIN] ✓ Contraseña verificada correctamente
[LOGIN] Generando tokens JWT...
[LOGIN] ✓ Access token generado (expira en: 15m )
[LOGIN] ✓ Refresh token generado (expira en: 7d )
[LOGIN] Guardando refresh token en BD...
[LOGIN] ✓ Refresh token guardado en BD
[LOGIN] Estableciendo cookies...
[LOGIN] ✓ Cookies establecidas: { access_token_domain: 'current', access_token_sameSite: 'lax', ... }
[LOGIN] ✅ LOGIN EXITOSO para usuario: test@test.com | Rol: cliente
[LOGIN] ========== FIN LOGIN ==========
```

**Si ves ❌ FALLO:** El log te dice exactamente qué falló.

### Backend - Register

Similar a login, pero con prefijo `[REGISTER]`.

### Backend - CSRF

```
[CSRF] Validating token for: POST /api/auth/login
[CSRF] Token sources - Header: true Body: false Cookie: true
[CSRF] ✓ Token validated successfully
```

**Si ves ❌ FALLO:**
- `Token missing`: No se envió el token CSRF
- `Token not in server store`: El token no está en memoria (posible memory leak)
- `Token mismatch`: El token del header no coincide con el de la cookie

### Backend - Rate Limit

```
[RATE_LIMIT] ❌ RATE LIMIT EXCEDIDO - IP: ::1 | Ruta: /api/auth/login | Método: POST
[RATE_LIMIT] Límite: 10 | Ventana: 900000 ms
```

**Si ves esto:** Tu IP fue bloqueada temporalmente. Espera 15 minutos.

### Backend - IP Blocker

```
[IP_BLOCKER] ❌ IP BLOQUEADA: ::1 | Ruta: /api/auth/login
```

**Si ves esto:** Tu IP fue bloqueada por múltiples violaciones. Espera 30 minutos.

### Backend - Todas las Requests

```
[2026-08-03T01:30:00.000Z] POST /api/auth/login | IP: ::1 | Origin: http://localhost:5173
[2026-08-03T01:30:00.123Z] POST /api/auth/login → 200 (123ms)
```

Este log muestra todas las requests con su duración.

### Frontend - Login

```
[LOGIN_FRONTEND] ========== INICIO LOGIN FRONTEND ==========
[LOGIN_FRONTEND] Form data: { email: 'test@test.com', hasPassword: true }
[LOGIN_FRONTEND] Obteniendo CSRF token...
[LOGIN_FRONTEND] CSRF token obtenido: ✓
[LOGIN_FRONTEND] Haciendo request a: http://localhost:4000/api/auth/login
[LOGIN_FRONTEND] Headers: { Content-Type: 'application/json', X-CSRF-Token: 'present' }
[LOGIN_FRONTEND] Response status: 200
[LOGIN_FRONTEND] Response headers: { ... }
[LOGIN_FRONTEND] Response body: { success: true, token: '...', user: {...} }
[LOGIN_FRONTEND] ✅ Login exitoso, guardando token...
[LOGIN_FRONTEND] Token guardado en localStorage: true
[LOGIN_FRONTEND] Redirigiendo a /
[LOGIN_FRONTEND] ========== FIN LOGIN FRONTEND ==========
```

**Si ves ❌:** El log te dice exactamente en qué paso falló.

---

## Diagnóstico de Problemas Comunes

### Problema: "Credenciales inválidas"

**Backend muestra:**
```
[LOGIN] ❌ FALLO: Usuario no encontrado para: test@test.com
```

**Causa:** El usuario no existe o el email está mal escrito.

**Solución:** Registra el usuario primero.

---

### Problema: "Token CSRF requerido"

**Backend muestra:**
```
[CSRF] ❌ FALLO: Token missing - Cookie: false Provided: true
```

**Causa:** La cookie CSRF no se estableció correctamente.

**Solución:** 
1. Limpia las cookies del navegador
2. Recarga la página
3. Intenta de nuevo

---

### Problema: "Demasiadas solicitudes"

**Backend muestra:**
```
[RATE_LIMIT] ❌ RATE LIMIT EXCEDIDO - IP: ::1
```

**Causa:** Hiciste demasiados intentos en poco tiempo.

**Solución:** Espera 15 minutos (login) o 1 hora (register).

---

### Problema: "Tu IP ha sido bloqueada"

**Backend muestra:**
```
[IP_BLOCKER] ❌ IP BLOQUEADA: ::1
```

**Causa:** Múltiples violaciones de rate limit.

**Solución:** Espera 30 minutos o reinicia el servidor.

---

### Problema: Login exitoso pero no redirige

**Frontend muestra:**
```
[LOGIN_FRONTEND] ✅ Login exitoso, guardando token...
[LOGIN_FRONTEND] Token guardado en localStorage: true
[LOGIN_FRONTEND] Redirigiendo a /
```

**Pero no redirige:**

**Causa:** Problema con React Router o el contexto de autenticación.

**Solución:**
1. Verifica la consola del navegador por errores de JavaScript
2. Recarga la página manualmente
3. Verifica que el token esté en localStorage:
   ```javascript
   console.log(localStorage.getItem('token'));
   ```

---

### Problema: "Error de conexión"

**Frontend muestra:**
```
[LOGIN_FRONTEND] ❌ ERROR: TypeError: Failed to fetch
```

**Causa:** El backend no está corriendo o hay un problema de red.

**Solución:**
1. Verifica que el backend esté corriendo: `curl http://localhost:4000/health`
2. Verifica que `VITE_BASE_URL` en `.env` sea correcto
3. Verifica que no haya un firewall bloqueando

---

## Logs en Producción

En producción, los logs aparecen en:

- **Vercel (Frontend):** Dashboard de Vercel → Logs
- **Backend (Docker):** `docker-compose logs -f backend`
- **Backend (Cloudflare Tunnel):** `docker-compose logs -f cloudflared`

---

## Desactivar Logs en Producción

Si quieres desactivar los logs detallados en producción, cambia:

```javascript
// En auth.controller.js, csrfProtection.js, etc.
if (process.env.NODE_ENV !== 'production') {
  console.log('[LOGIN] ...');
}
```

O simplemente elimina los `console.log` antes de hacer deploy.

---

## Ejemplo de Diagnóstico Completo

**Usuario reporta:** "No puedo hacer login, dice credenciales inválidas"

**Pasos de diagnóstico:**

1. **Ver logs del backend:**
   ```
   [LOGIN] ========== INICIO LOGIN ==========
   [LOGIN] Body recibido: { email: 'test@test.com', username: '[MISSING]' }
   [LOGIN] Buscando usuario en BD...
   [LOGIN] ❌ FALLO: Usuario no encontrado para: test@test.com
   ```

2. **Conclusión:** El usuario no existe en la base de datos.

3. **Solución:** Registrar el usuario primero o verificar que el email esté bien escrito.

---

**Usuario reporta:** "Hago login pero no me deja acceder a las páginas"

**Pasos de diagnóstico:**

1. **Ver logs del frontend:**
   ```
   [LOGIN_FRONTEND] ✅ Login exitoso, guardando token...
   [LOGIN_FRONTEND] Token guardado en localStorage: true
   [LOGIN_FRONTEND] Redirigiendo a /
   ```

2. **Ver logs del backend:**
   ```
   [2026-08-03T01:30:00.000Z] GET /api/auth/me | IP: ::1 | Origin: http://localhost:5173
   [2026-08-03T01:30:00.123Z] GET /api/auth/me → 401 (5ms)
   ```

3. **Conclusión:** El token no se está enviando en las requests subsecuentes.

4. **Solución:** Verificar que `main.jsx` esté agregando el token a los headers.

---

## Soporte

Si los logs no te ayudan a diagnosticar el problema, abre un issue en GitHub con:

1. Los logs completos del backend
2. Los logs completos del frontend (captura de pantalla de la consola)
3. El mensaje de error exacto que ves
4. Pasos para reproducir el problema
