# Mejoras Pendientes — Danhee

**Objetivo:** `https://snitch-wing-riddance.ngrok-free.dev/`
**Fecha:** 28 julio 2026
**Calificación actual:** 6.5/10 (▼0.5 vs v3 por regresiones en API)

---

## Resumen de cambios detectados (nuevo deploy)

| Aspecto | v3 | Ahora | Cambio |
|---|---|---|---|
| Bundle | `index-C_EfnfQy.js` | `index-DWsSStJg.js` | Redeploy |
| Hash | `C3206356AE58` | `8CDF94629C10` | Código modificado |
| CSP `style-src` | `'unsafe-inline'` | **eliminado** | ✅ Mejora |
| CSP `frame-*` | `frame-src 'none'` | `frame-ancestors 'none'` | ✅ Mejora |
| Mensaje pago | "Pago realizado con éxito" | "Debe verificarse con el repostero" | ✅ Más honesto |
| `/api/bakers` | 200 OK | **500 ERROR** | ❌ Regresión |
| `/api/cakes` | 404 HTML | **500 JSON** | ❌ Sigue roto |
| `/api/categories` | 404 HTML | **500 JSON** | ❌ Sigue roto |

---

## Lo que puedes mejorar (priorizado)

### 🔴 Prioridad alta

1. **`/api/bakers` devuelve 500** — Antes funcionaba, ahora lanza error interno. Revisa el backend. Los parámetros `?page=1&limit=N` ya no lo salvan.

2. **`/api/cakes` (lista) y `/api/categories` devuelven 500** — Siguen rotos desde v2. El frontend los solicita en todas las páginas de catálogo, así que la app muestra errores de conexión al usuario.

3. **Exposición de PII en citas del repostero** — `Ge` component muestra `client_name`, `client_email`, `client_phone` completos. Sin cambios desde v1.

### 🟡 Prioridad media

4. **Pago OXXO/PayPal sigue sin backend real** — El ticket OXXO se genera (API real), pero la confirmación es `setTimeout` + `alert` del lado del cliente. La orden **no se guarda en el servidor**.

5. **Sin rate limiting en endpoints públicos** — Solo `/api/auth/login` tiene límite.

6. **WAF filtra el tipo de bloqueo** — `REQUEST_BLOCKED`, `PARAMETER_FUZZING_BLOCKED`, `INVALID_PARAMETER` revelan al atacante qué regla se activó.

7. **Estabilidad del servidor** — Endpoints que funcionan intermitentemente (bakers a veces 200, a veces 500) sugieren problemas de infraestructura.

### 🟢 Prioridad baja

8. **`/api/payments/oxxo-ticket` sin autenticación** — POST acepta peticiones sin token.

9. **Paginación decorativa** — `"total":11` no limita resultados, `?limit=5` ignora.

---

## Progreso general

```
Seguridad:        ██████▒░░░░ 6.5/10
Pago tarjeta:     ██████████ 10/10 (deshabilitado correctamente)
Headers HTTP:     ██████████ 10/10 (completos y mejorados)
Confianza pago:   ████████░░ 8/10 (mensaje honesto, pero sin backend)
Protección PII:   ███░░░░░░░ 3/10
Estabilidad API:  ██░░░░░░░░ 2/10 (múltiples 500)
WAF:              ████████░░ 8/10
Rate limiting:    ██░░░░░░░░ 2/10
```

## Checklist rápido para llegar a 9/10

- [ ] Corregir 500 en `/api/bakers` (regresión crítica)
- [ ] Restaurar `/api/cakes` (lista) y `/api/categories`
- [ ] Ofuscar PII: mostrar solo nombre + email/tel parciales
- [ ] Agregar rate limiting a endpoints públicos
- [ ] Reemplazar `setTimeout` de confirmación por llamado real al backend
- [ ] Usar mensajes WAF genéricos ("Solicitud inválida" para todos)
- [ ] Estabilizar servidor (errores intermitentes)
