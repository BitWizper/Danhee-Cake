# Reporte de Seguridad — Danhee v5

**Calificación:** 8.5/10 ▲▲ (+2 puntos vs v4)

---

## Mejoras detectadas en este deploy

| Issue | Antes | Ahora | Cambio |
|---|---|---|---|
| PII en citas | `client_name`, `email`, `phone` visibles | **Ofuscado**: `Ge()`, `Fe()`, `Xe()` | ✅ CORREGIDO |
| `/api/bakers` | 500 error | **200 OK** (11 bakers) | ✅ CORREGIDO |
| `/api/cakes` (lista) | 500 error | **200 OK** (27 cakes) | ✅ CORREGIDO |
| `/api/categories` | 500 error | **200 OK** (7 categorías) | ✅ CORREGIDO |
| OXXO sin auth | POST sin token | **Requiere `Bearer` + login** | ✅ CORREGIDO |
| Auto-auth en fetch | No existía | **Interceptor global** agrega token a `/api/*` | ✅ NUEVO |
| Bundle hash | `8CDF94629C10` | `419EF75DE01D` | Nuevo build |
| Bundle size | 165,853 bytes | **167,749 bytes** (+1,896) | Creció |

## Lo que aún puedes mejorar

### 🟡 Prioridad media

1. **Rate limiting solo en login** — `/api/bakers`, `/api/cakes` no tienen límite de peticiones.

2. **Sin backend de pagos real** — La confirmación OXXO/PayPal sigue siendo `setTimeout` + `alert` local. El ticket OXXO se genera en el servidor, pero la orden nunca se guarda.

3. **WAF filtra tipo de bloqueo** — `REQUEST_BLOCKED`, `PARAMETER_FUZZING_BLOCKED`, `INVALID_PARAMETER` revelan al atacante qué regla se activó.

### 🟢 Prioridad baja

4. **Paginación decorativa** — `"total":11` en `/api/bakers` pero `?limit=5` no funciona, siempre devuelve todos.

5. **No hay `subresource-integrity`** en los `<script>` tags del SPA.

---

## Progreso general

```
Seguridad:        ████████▒░░ 8.5/10
Pago tarjeta:     ██████████ 10/10 (deshabilitado)
Protección PII:   ██████████ 10/10 (ofuscado)
Headers HTTP:     ██████████ 10/10
APIs funcionales: ██████████ 10/10 (todas OK)
Autenticación:    ██████████ 10/10 (interceptor global)
Backend pagos:    ██████░░░░░ 6/10 (ticket OXXO real, confirmación fake)
Rate limiting:    ██░░░░░░░░░ 2/10
WAF:              ████████░░░ 8/10
```

## Checklist para llegar a 10/10

- [ ] Agregar rate limiting a `/api/bakers`, `/api/cakes`, `/api/categories`
- [ ] Reemplazar `setTimeout` de confirmación por POST real al backend que guarde la orden
- [ ] Usar mensajes WAF genéricos ("Solicitud inválida" para todos los casos)
- [ ] Implementar paginación real en `/api/bakers` (honrar `?limit=N`)
- [ ] Agregar `integrity` hashes a los scripts del SPA

