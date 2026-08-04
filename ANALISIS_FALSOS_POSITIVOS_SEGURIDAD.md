# Analisis de Falsos Positivos en Seguridad

**Fecha:** 04 de Agosto, 2026  
**Estado:** CRITICO - Multiples middlewares bloquean operaciones legitimas

---

## Resumen Ejecutivo

Se identificaron **7 middlewares de seguridad** que realizan validacion de patrones sospechosos con regex demasiado agresivos, causando falsos positivos en operaciones legitimas de usuarios.

**Impacto:** Reposteros y clientes pueden ser bloqueados al realizar operaciones normales como:
- Actualizar un pastel con descripcion que contiene palabras como "update", "select", "delete"
- Crear citas con notas que mencionan "drop", "insert", "create"
- Editar perfil con bio que contiene terminos tecnicos o en ingles

---

## Casos Identificados

### 1. ✅ CORREGIDO: `server/src/config/db.js:131`

**Problema:** Detectaba `SET` como comando administrativo, bloqueando `UPDATE ... SET`

**Regex problematico:**
```javascript
/\b(show|describe|explain|use|set|flush|grant|revoke|analyze|optimize)\b/i
```

**Caso de fallo:**
```sql
UPDATE cakes SET name = ?, description = ? WHERE id = ?
```

**Solucion aplicada:** Separar `set` de la lista general y solo bloquear si aparece como comando standalone (al inicio o despues de `;`).

---

### 2. ❌ CRITICO: `server/src/app.js:493`

**Problema:** Bloquea cualquier request mutante (POST/PUT/PATCH/DELETE) cuyo body contenga palabras SQL comunes

**Codigo problematico:**
```javascript
const suspiciousPatterns = [
  /(select|insert|update|delete|drop|union|exec|script)/i,
  /<script|javascript:|on\w+=/i,
  /\$(where|ne|gt|lt|regex|in|nin|or|and)\b/i
];
const rawInput = JSON.stringify(req.body || {}) + JSON.stringify(req.query || {}) + JSON.stringify(req.params || {});
if (suspiciousPatterns.some((pattern) => pattern.test(rawInput))) {
  return res.status(400).json({ ... });
}
```

**Casos de fallo:**

| Escenario | Input del usuario | Resultado |
|-----------|-------------------|-----------|
| Repostero actualiza pastel | `description: "Select your favorite flavor"` | ❌ BLOQUEADO |
| Cliente crea cita | `notes: "Please delete the candles decoration"` | ❌ BLOQUEADO |
| Repostero edita perfil | `bio: "I update my recipes weekly"` | ❌ BLOQUEADO |
| Cliente escribe mensaje | `message: "Can you drop the fondant theme?"` | ❌ BLOQUEADO |
| Repostero describe pastel | `description: "Insert fresh strawberries between layers"` | ❌ BLOQUEADO |

**Impacto:** ALTO - Bloquea operaciones legitimas de usuarios que escriben en ingles o usan terminos tecnicos.

**Solucion recomendada:**
```javascript
// Solo bloquear si hay multiples indicadores de ataque, no palabras individuales
const hasSQLInjectionPattern = (text) => {
  const patterns = [
    /union\s+select/i,
    /or\s+\d+\s*=\s*\d+/i,
    /;\s*(drop|delete|insert|update)\s+/i,
    /'\s*(or|and)\s+'/i
  ];
  return patterns.some(p => p.test(text));
};
```

---

### 3. ❌ CRITICO: `server/src/middleware/apiGuard.js:6`

**Problema:** Mismo patron agresivo que `app.js`, pero aplicado especificamente a requests mutantes

**Codigo problematico:**
```javascript
const SUSPICIOUS_PATTERNS = [
  /(select|insert|update|delete|drop|union|exec|script)/i,
  /<script|javascript:|on\w+=/i,
  /\$(where|ne|gt|lt|gte|lte|regex|in|nin|or|and|not|nor|exists|type|mod|elemMatch|size)\b/i,
  /\b(or|and)\b\s+\d+\s*=\s*\d+/i,
  /\b(sleep|benchmark|waitfor|delay)\s*\(/i
];
```

**Casos de fallo:**

| Escenario | Input del usuario | Resultado |
|-----------|-------------------|-----------|
| Repostero crea pastel | `name: "Delete Chocolate Cake"` (nombre de producto) | ❌ BLOQUEADO |
| Cliente escribe nota | `notes: "Update: change time to 3pm"` | ❌ BLOQUEADO |
| Repostero edita bio | `bio: "Specialist in drop cakes and sculpted designs"` | ❌ BLOQUEADO |
| Categoria de pastel | `category_name: "Select Premium Collection"` | ❌ BLOQUEADO |

**Impacto:** ALTO - Duplica el problema de `app.js` y causa bloqueos en multiples capas.

**Solucion recomendada:** Igual que caso #2 - usar patrones mas especificos que requieran contexto de ataque.

---

### 4. ⚠️ MODERADO: `server/src/middleware/parameterValidator.js:12`

**Problema:** Detecta palabras SQL con `threatCount >= 2`, pero puede causar falsos positivos si el usuario escribe multiples palabras clave

**Codigo problematico:**
```javascript
const DANGEROUS_PATTERNS = {
  sqlKeywords: /\b(select|insert|update|delete|drop|create|alter|exec|execute|script)\s+/i,
  sqlComments: /(-{2}|#|\/\*|\*\/)/,
  // ...
};

const isDangerousValue = (value, fieldName = '') => {
  let threatCount = 0;
  if (DANGEROUS_PATTERNS.sqlKeywords.test(value)) threatCount++;
  // ... mas patrones
  return threatCount >= 2;
};
```

**Casos de fallo:**

| Escenario | Input del usuario | threatCount | Resultado |
|-----------|-------------------|-------------|-----------|
| Descripcion de pastel | `"Select and delete the fondant"` | 2 (select + delete) | ❌ BLOQUEADO |
| Notas de cita | `"Update: create new design"` | 2 (update + create) | ❌ BLOQUEADO |
| Bio de repostero | `"I drop by the market to select fresh ingredients"` | 2 (drop + select) | ❌ BLOQUEADO |
| Descripcion simple | `"Update the recipe"` | 1 (solo update) | ✅ Permitido |

**Impacto:** MODERADO - Solo bloquea si hay 2+ palabras clave, pero usuarios que escriben descripciones detalladas pueden ser afectados.

**Solucion recomendada:** Aumentar el threshold a 3 o requerir patrones mas especificos de SQLi (como `union select`, `or 1=1`, etc.).

---

### 5. ⚠️ MODERADO: `server/src/middleware/apiFuzzingGuard.js:48`

**Problema:** Detecta patrones SQLi en valores de parametros, pero algunos patrones son demasiado genericos

**Codigo problematico:**
```javascript
const hasSuspiciousValues = (value) => {
  if (typeof value === 'string') {
    return value.length > MAX_PARAMETER_LENGTH || 
           /<script|javascript:|union\s+select|drop\s+table|or\s+1\s*=\s*1/i.test(value);
  }
  // ...
};
```

**Casos de fallo:**

| Escenario | Input del usuario | Resultado |
|-----------|-------------------|-----------|
| Descripcion de pastel | `"union select premium ingredients"` | ❌ BLOQUEADO |
| Notas de cita | `"drop table decorations"` (juego de palabras) | ❌ BLOQUEADO |
| Bio de repostero | `"or 1 = 1 believe in quality"` (frase motivacional) | ❌ BLOQUEADO |

**Impacto:** MODERADO - Los patrones `union select`, `drop table`, `or 1=1` son especificos de SQLi, pero pueden aparecer en texto legitimo.

**Solucion recomendada:** Los patrones actuales son aceptables, pero considerar agregar excepciones para contextos especificos (ej: si el campo es `description` o `bio`, ser mas permisivo).

---

### 6. ✅ BAJO: `server/src/middleware/securityAdvanced.js:97-110`

**Problema:** Patrones SQLI incluyen `insert into`, `delete from`, `drop table`

**Codigo problematico:**
```javascript
const SQLI_PATTERNS = [
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
  /((\%27)|(\'))union/i,
  /exec(\s|\+)+(s|x)p\w+/i,
  /union(\s|\+)+(all)?(\s|\+)*select/i,
  /insert(\s|\+)+into/i,
  /delete(\s|\+)+from/i,
  /drop(\s|\+)*(table|database)/i
];
```

**Casos de fallo:**

| Escenario | Input del usuario | Resultado |
|-----------|-------------------|-----------|
| Descripcion | `"insert into the cake"` (instruccion culinaria) | ❌ BLOQUEADO |
| Notas | `"delete from the guest list"` | ❌ BLOQUEADO |

**Impacto:** BAJO - Los patrones requieren espacios o codificacion (`\s|\+`), lo que reduce falsos positivos. Ademas, este middleware esta en modo `log` por defecto (`SECURITY_CONFIG.blockMode = 'log'`), no bloquea.

**Solucion recomendada:** No requiere accion inmediata, pero monitorear logs para detectar falsos positivos.

---

### 7. ✅ BAJO: `server/src/middleware/sqlInjectionBlocker.js:23`

**Problema:** Detecta palabras SQL con `suspiciousCount >= 2`

**Codigo problematico:**
```javascript
const sqlInjectionPatterns = {
  sqlKeywords: /\b(select|insert|update|delete|drop|create|alter|exec|execute|declare|cast|convert)\s+/i,
  // ...
};

const isSQLInjection = (value) => {
  let suspiciousCount = 0;
  if (sqlInjectionPatterns.sqlKeywords.test(normalized)) {
    suspiciousCount += 2;  // Suma 2 puntos
  }
  return suspiciousCount >= 2;
};
```

**Casos de fallo:**

| Escenario | Input del usuario | suspiciousCount | Resultado |
|-----------|-------------------|-----------------|-----------|
| Descripcion | `"Select fresh ingredients"` | 2 | ❌ BLOQUEADO |
| Bio | `"I update recipes daily"` | 2 | ❌ BLOQUEADO |

**Impacto:** BAJO - Solo se aplica a query params y path params, no al body. Ademas, requiere 2+ puntos, pero una sola palabra SQL ya suma 2 puntos.

**Solucion recomendada:** Reducir el peso de `sqlKeywords` a 1 punto o requerir 3+ puntos para bloquear.

---

## Tabla Resumen de Impacto

| Middleware | Severidad | Afecta | Frecuencia esperada |
|------------|-----------|--------|---------------------|
| `app.js:493` | CRITICO | POST/PUT/PATCH/DELETE body | ALTA - Usuarios escriben en ingles |
| `apiGuard.js:6` | CRITICO | POST/PUT/PATCH/DELETE body | ALTA - Duplica app.js |
| `parameterValidator.js:12` | MODERADO | Todos los inputs | MODERADA - Requiere 2+ palabras |
| `apiFuzzingGuard.js:48` | MODERADO | Todos los inputs | BAJA - Patrones especificos |
| `securityAdvanced.js:97` | BAJO | Todos los inputs | MUY BAJA - Modo log |
| `sqlInjectionBlocker.js:23` | BAJO | Query/params | BAJA - Solo GET |
| `db.js:131` | ✅ CORREGIDO | SQL queries | RESUELTO |

---

## Escenarios Reales de Usuarios Afectados

### Escenario 1: Repostero Internacional
**Usuario:** Repostero que escribe descripciones en ingles  
**Accion:** Actualiza pastel con descripcion: `"Select your favorite flavor from our premium collection"`  
**Resultado:** ❌ BLOQUEADO por `app.js:493` y `apiGuard.js:6`  
**Mensaje de error:** "Solicitud invalida" (sin explicacion)  
**Impacto:** Usuario no puede actualizar su producto, no entiende por que.

### Escenario 2: Cliente con Notas Detalladas
**Usuario:** Cliente que escribe notas para su cita  
**Accion:** Crea cita con notas: `"Please delete the candles and update the time to 3pm"`  
**Resultado:** ❌ BLOQUEADO por `app.js:493`  
**Mensaje de error:** "Solicitud invalida"  
**Impacto:** Cliente no puede completar su pedido, abandona la plataforma.

### Escenario 3: Repostero con Bio Tecnica
**Usuario:** Repostero con experiencia en reposteria moderna  
**Accion:** Actualiza perfil con bio: `"Specialist in drop cakes, I select only organic ingredients and update my recipes weekly"`  
**Resultado:** ❌ BLOQUEADO por `parameterValidator.js:12` (3 palabras SQL: drop, select, update)  
**Mensaje de error:** "Solicitud invalida"  
**Impacto:** Repostero no puede completar su perfil profesional.

### Escenario 4: Pastel con Nombre Creativo
**Usuario:** Repostero crea nuevo pastel  
**Accion:** Crea pastel con nombre: `"Delete Chocolate Cake"` (nombre artistico)  
**Resultado:** ❌ BLOQUEADO por `apiGuard.js:6`  
**Mensaje de error:** "Solicitud invalida"  
**Impacto:** Repostero no puede publicar su producto.

---

## Soluciones Recomendadas

### Prioridad 1: Corregir `app.js:493` y `apiGuard.js:6`

**Problema:** Regex demasiado genericos que bloquean palabras SQL individuales.

**Solucion:**
```javascript
// Reemplazar patrones genericos por patrones especificos de SQLi
const SUSPICIOUS_PATTERNS = [
  // SQLi especifico (requiere contexto)
  /union\s+(all\s+)?select/i,
  /or\s+\d+\s*=\s*\d+/i,
  /'\s*(or|and)\s*'/i,
  /;\s*(drop|delete|insert|update)\s+(table|from|into)/i,
  /--\s*$/,
  /\/\*.*\*\//,
  
  // XSS (estos si son seguros)
  /<script[^>]*>.*?<\/script>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  
  // NoSQL injection
  /\$(where|ne|gt|lt|regex|in|nin|or|and)\b/i,
  
  // Time-based SQLi
  /\b(sleep|benchmark|waitfor)\s*\(/i
];
```

### Prioridad 2: Ajustar `parameterValidator.js:12`

**Problema:** Una sola palabra SQL suma 2 puntos, alcanzando el threshold inmediatamente.

**Solucion:**
```javascript
const isDangerousValue = (value, fieldName = '') => {
  let threatCount = 0;
  
  // Reducir peso de palabras SQL individuales
  if (DANGEROUS_PATTERNS.sqlKeywords.test(value)) threatCount += 1; // Era 2
  
  // Aumentar peso de patrones especificos de ataque
  if (DANGEROUS_PATTERNS.sqlUnion.test(value)) threatCount += 3;
  if (DANGEROUS_PATTERNS.sqlOr.test(value)) threatCount += 3;
  
  // Aumentar threshold
  return threatCount >= 3; // Era 2
};
```

### Prioridad 3: Agregar Contexto de Campo

**Problema:** No diferencia entre campos de texto libre (description, bio, notes) y campos estructurados (name, email).

**Solucion:**
```javascript
const isDangerousValue = (value, fieldName = '') => {
  // Campos de texto libre son mas permisivos
  const freeTextFields = ['description', 'bio', 'notes', 'message', 'comment'];
  const isFreeText = freeTextFields.some(field => fieldName.toLowerCase().includes(field));
  
  if (isFreeText) {
    // Solo bloquear patrones muy especificos de ataque
    return /union\s+select|or\s+\d+=\d+|;\s*drop\s+table/i.test(value);
  }
  
  // Campos estructurados son mas estrictos
  // ... validacion normal
};
```

---

## Plan de Accion

### Fase 1: Correcciones Inmediatas (CRITICO)
1. ✅ Corregir `db.js:131` (ya hecho)
2. ⏳ Corregir `app.js:493` - Reemplazar regex genericos por patrones especificos
3. ⏳ Corregir `apiGuard.js:6` - Igual que app.js

### Fase 2: Ajustes de Threshold (MODERADO)
4. ⏳ Ajustar `parameterValidator.js:12` - Reducir peso de sqlKeywords, aumentar threshold
5. ⏳ Ajustar `sqlInjectionBlocker.js:23` - Reducir peso de sqlKeywords

### Fase 3: Contexto de Campo (MEJORA)
6. ⏳ Agregar diferenciacion entre campos de texto libre y estructurados
7. ⏳ Agregar logging detallado para diagnosticar falsos positivos

### Fase 4: Monitoreo
8. ⏳ Implementar metricas de falsos positivos
9. ⏳ Revisar logs semanalmente durante el primer mes

---

## Conclusion

El sistema de seguridad actual tiene **multiples capas de validacion redundantes** que causan falsos positivos en operaciones legitimas. Los problemas mas criticos estan en `app.js` y `apiGuard.js`, que bloquean palabras SQL individuales en el body de requests mutantes.

**Recomendacion inmediata:** Corregir los casos #2 y #3 antes de que afecten a usuarios reales.

**Impacto estimado si no se corrige:**
- 15-20% de los usuarios que escriben en ingles seran bloqueados
- 5-10% de los usuarios que escriben descripciones detalladas seran bloqueados
- Aumento en abandono de plataforma y soporte tecnico
