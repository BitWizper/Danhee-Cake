/**
 * 🔒 Parameter Validator Middleware
 * Valida y sanitiza TODOS los parámetros (query, body, params)
 * Detecta patrones de ataque antes de que lleguen a los controladores
 */

const { query, param, body, validationResult } = require('express-validator');

// Patrones peligrosos comunes a buscar en cualquier parámetro
const DANGEROUS_PATTERNS = {
  // SQL Injection patterns
  sqlKeywords: /\b(select|insert|update|delete|drop|create|alter|exec|execute|script)\s+/i,
  sqlComments: /(-{2}|#|\/\*|\*\/)/,
  sqlUnion: /union(\s+all)?\s+select/i,
  sqlOr: /\bor\b\s+\d+\s*=\s*\d+|\bor\b\s*['"](.*)['"]?\s*=/i,
  sqlSleep: /\b(sleep|benchmark|waitfor|delay)\s*\(/i,
  
  // NoSQL Injection patterns
  noSqlOperators: /\$(?:where|ne|gt|lt|gte|lte|regex|in|nin|and|or|not|nor|exists|type|text|mod|ref|function|eq|elemMatch|size)\b/,
  
  // XSS patterns
  scriptTag: /<script[^>]*>|<\/script>|javascript:|onerror=|onload=|onclick=|<iframe/i,
  
  // Command Injection
  commandSeparators: /[;|`&$()]/,
  
  // Path Traversal
  pathTraversal: /\.\.[\/\\]/,
};

/**
 * Valida un string contra patrones peligrosos
 * @param {string} value - Valor a validar
 * @param {string} fieldName - Nombre del campo (para logging)
 * @returns {boolean} true si es peligroso, false si es seguro
 */
const isDangerousValue = (value, fieldName = '') => {
  if (typeof value !== 'string') return false;
  
  // Normalizar el valor
  const normalized = value.toLowerCase().trim();
  
  // Contar patrones peligrosos encontrados
  let threatCount = 0;
  
  if (DANGEROUS_PATTERNS.sqlKeywords.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.sqlComments.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.sqlUnion.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.sqlOr.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.sqlSleep.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.noSqlOperators.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.scriptTag.test(value)) threatCount++;
  if (DANGEROUS_PATTERNS.commandSeparators.test(value) && threatCount > 0) threatCount++;
  if (DANGEROUS_PATTERNS.pathTraversal.test(value)) threatCount++;
  
  // Requerir 2+ patrones para alertar (reduce falsos positivos)
  return threatCount >= 2;
};

/**
 * Sanitiza un string eliminando caracteres peligrosos
 * @param {string} value - Valor a sanitizar
 * @returns {string} Valor sanitizado
 */
const sanitizeValue = (value) => {
  if (typeof value !== 'string') return value;
  
  return value
    .replace(/[<>]/g, '') // Remove < >
    .replace(/['";]/g, '') // Remove quotes
    .replace(/--/g, '') // Remove SQL comments
    .replace(/\/\*/g, '') // Remove /* 
    .replace(/\*\//g, '') // Remove */
    .replace(/;\s*(select|insert|update|delete|drop|create)/gi, '') // Remove stacked queries
    .trim()
    .substring(0, 5000); // Limitar longitud
};

/**
 * Middleware que valida parámetros en todas las rutas
 * Rechaza requestos con patrones sospechosos
 */
const validateAllParameters = (req, res, next) => {
  // Excluir rutas de chat (tienen su propia validación específica)
  if (req.originalUrl.startsWith('/api/chat/')) {
    return next();
  }
  
  const mutatingMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
  const isMutatingRequest = mutatingMethods.includes(req.method?.toUpperCase());

  // Validar parámetros query
  for (const [key, value] of Object.entries(req.query || {})) {
    if (isDangerousValue(value, `query.${key}`)) {
      console.log(`[SECURITY] Parámetro peligroso detectado en query: ${key}=${value}`);
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_REQUEST',
        message: 'Solicitud inválida.'
      });
    }
  }
  
  // Validar parámetros path (req.params)
  for (const [key, value] of Object.entries(req.params || {})) {
    if (isDangerousValue(value, `param.${key}`)) {
      console.log(`[SECURITY] Parámetro peligroso detectado en path: ${key}=${value}`);
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_REQUEST',
        message: 'Solicitud inválida.'
      });
    }
  }
  
  // Validar body (excepto tipos específicos como archivos)
  if (req.body && typeof req.body === 'object') {
    const validateBodyRecursive = (obj, prefix = '') => {
      for (const [key, value] of Object.entries(obj)) {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        
        if (typeof value === 'string' && isDangerousValue(value, fieldPath)) {
          console.log(`[SECURITY] Parámetro peligroso detectado en body: ${fieldPath}=${value}`);
          return {
            error: true,
            fieldPath,
            value
          };
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
          const result = validateBodyRecursive(value, fieldPath);
          if (result.error) return result;
        } else if (Array.isArray(value)) {
          for (let i = 0; i < value.length; i++) {
            if (typeof value[i] === 'string' && isDangerousValue(value[i], `${fieldPath}[${i}]`)) {
              console.log(`[SECURITY] Parámetro peligroso detectado en body array: ${fieldPath}[${i}]=${value[i]}`);
              return {
                error: true,
                fieldPath: `${fieldPath}[${i}]`,
                value: value[i]
              };
            }
          }
        }
      }
      return { error: false };
    };
    
    const result = validateBodyRecursive(req.body);
    if (result.error) {
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_REQUEST',
        message: 'Solicitud inválida.'
      });
    }
  }

  // Bloqueo adicional para peticiones mutantes: si el payload parece malicioso, no permitir que avance
  if (isMutatingRequest && req.body && typeof req.body === 'object') {
    const bodyText = JSON.stringify(req.body);
    if (isDangerousValue(bodyText, 'body.raw')) {
      console.log(`[SECURITY] Payload malicioso bloqueado antes de la mutación: ${bodyText}`);
      return res.status(400).json({
        success: false,
        error_code: 'INVALID_REQUEST',
        message: 'Solicitud inválida.'
      });
    }
  }
  
  next();
};

/**
 * Validadores específicos reutilizables
 */
const validators = {
  // ID integer
  validateId: () => param('id')
    .isInt({ min: 1 }).withMessage('id debe ser un número entero positivo')
    .toInt(),
  
  // Email
  validateEmail: (fieldName = 'email') => body(fieldName)
    .trim()
    .isEmail().withMessage('Email inválido')
    .normalizeEmail()
    .isLength({ max: 100 }).withMessage('Email demasiado largo'),
  
  // Password
  validatePassword: () => body('password')
    .isLength({ min: 8, max: 128 }).withMessage('Contraseña entre 8-128 caracteres')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Contraseña débil'),
  
  // Nombre
  validateName: (fieldName = 'name') => body(fieldName)
    .trim()
    .notEmpty().withMessage(`${fieldName} requerido`)
    .isLength({ min: 2, max: 100 }).withMessage(`${fieldName} entre 2-100 caracteres`)
    .matches(/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s-]+$/).withMessage(`${fieldName} solo letras y espacios`),
  
  // Descripción
  validateDescription: (fieldName = 'description') => body(fieldName)
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage(`${fieldName} máximo 2000 caracteres`),
  
  // Precio
  validatePrice: (fieldName = 'price') => body(fieldName)
    .optional()
    .isFloat({ min: 0, max: 999999 }).withMessage(`${fieldName} debe ser número positivo`),
  
  // Número entero
  validateInt: (fieldName) => body(fieldName)
    .optional()
    .isInt().withMessage(`${fieldName} debe ser número entero`),
  
  // Boolean
  validateBoolean: (fieldName) => body(fieldName)
    .optional()
    .isBoolean().withMessage(`${fieldName} debe ser true o false`),
  
  // Query limit
  validateLimit: () => query('limit')
    .optional()
    .isInt({ min: 1, max: 1000 }).withMessage('limit entre 1-1000')
    .toInt(),
  
  // Query offset
  validateOffset: () => query('offset')
    .optional()
    .isInt({ min: 0 }).withMessage('offset debe ser positivo')
    .toInt(),
  
  // ISO Date
  validateDate: (fieldName = 'date') => body(fieldName)
    .isISO8601().withMessage(`${fieldName} debe ser fecha válida (ISO8601)`)
    .toDate(),
  
  // URL
  validateURL: (fieldName) => body(fieldName)
    .optional()
    .isURL().withMessage(`${fieldName} debe ser URL válida`),
};

module.exports = {
  validateAllParameters,
  validators,
  isDangerousValue,
  sanitizeValue,
  DANGEROUS_PATTERNS
};
