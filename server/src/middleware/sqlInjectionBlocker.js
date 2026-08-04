/**
 * Middleware para detectar y bloquear SQL Injection en parámetros GET y query params
 * Más preciso que regex genéricos para evitar falsos positivos
 */

const sqlInjectionPatterns = {
  // Union-based SQLi
  union: /(\bunion\s+select\b|\bunion\s+all\s+select\b|\bunion\s+distinct\s+select\b)/i,
  
  // Boolean-based SQLi
  booleanBased: /(\bor\s+1\s*=\s*1\b|\band\s+1\s*=\s*1\b|\bor\s+true\b|\band\s+false\b)/i,
  
  // Time-based SQLi (SLEEP, BENCHMARK)
  timeBased: /(\bsleep\s*\(|\bbenchmark\s*\(|\bwaitfor\s+delay|\bpg_sleep)/i,
  
  // Stacked queries (;)
  stackedQueries: /;\s*\b(select|insert|update|delete|drop|create|alter|exec|execute|declare)\b/i,
  
  // Comment-based bypasses
  comments: /(-{2}|\/\*|\*\/|#|{.*?})/,
  
  // Common SQLi keywords (reducir peso de 2 a 1)
  sqlKeywords: /\b(select|insert|update|delete|drop|create|alter|exec|execute|declare|cast|convert)\s+/i,
  
  // Encoded payloads (hex, base64, unicode)
  encodedPayload: /(%27|%22|%3D|%3C|%3E|0x[0-9a-f]+|\\x[0-9a-f]+)/i,
};

/**
 * Validar si una cadena parece ser un intento de SQL Injection
 */
const isSQLInjection = (value) => {
  if (!value || typeof value !== 'string') return false;

  // Normalizar la cadena
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();

  // Evitar falsos positivos: solo alertar si hay patrones sospechosos combinados
  let suspiciousCount = 0;

  // Buscar patrones sospechosos
  if (sqlInjectionPatterns.union.test(normalized)) suspiciousCount += 3;
  if (sqlInjectionPatterns.booleanBased.test(normalized)) suspiciousCount += 3;
  if (sqlInjectionPatterns.timeBased.test(normalized)) suspiciousCount += 3;
  if (sqlInjectionPatterns.stackedQueries.test(normalized)) suspiciousCount += 3;
  if (sqlInjectionPatterns.encodedPayload.test(value)) suspiciousCount++;

  // Reducir peso de SQL keywords de 2 a 1
  if (sqlInjectionPatterns.sqlKeywords.test(normalized)) {
    suspiciousCount += 1;
  }

  // Aumentar threshold de 2 a 3 para reducir falsos positivos
  return suspiciousCount >= 3;
};

/**
 * Middleware para bloquear SQL Injection en query params y GET
 */
const sqlInjectionBlocker = (req, res, next) => {
  try {
    // Verificar parámetros de query
    for (const [param, value] of Object.entries(req.query)) {
      if (typeof value === 'string' && isSQLInjection(value)) {
        console.warn(`[SQL INJECTION DETECTED] Parámetro: ${param}, Valor: ${value.substring(0, 100)}`);
        return res.status(400).json({
          success: false,
          message: 'Solicitud rechazada: posible intento de inyección SQL',
          error: 'SQL_INJECTION_DETECTED'
        });
      }
    }

    // Verificar parámetros de ruta
    for (const [param, value] of Object.entries(req.params)) {
      if (typeof value === 'string' && isSQLInjection(value)) {
        console.warn(`[SQL INJECTION DETECTED] Parámetro de ruta: ${param}, Valor: ${value}`);
        return res.status(400).json({
          success: false,
          message: 'Solicitud rechazada: posible intento de inyección SQL',
          error: 'SQL_INJECTION_DETECTED'
        });
      }
    }

    next();
  } catch (error) {
    console.error('[SQL INJECTION BLOCKER ERROR]', error);
    next();
  }
};

module.exports = sqlInjectionBlocker;
