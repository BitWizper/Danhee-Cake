/**
 * Middleware de Sanitización de Inputs
 * Valida y sanitiza la longitud y contenido de los campos de entrada
 */

const { securityLogger, SEVERITY, EVENT_TYPES } = require('./securityLogger');

// Límites de longitud por campo
const FIELD_LIMITS = {
  email: 255,
  password: 128,
  name: 100,
  username: 50,
  phone: 20,
  address: 500,
  city: 100,
  description: 2000,
  message: 5000,
  title: 200,
  business_name: 200,
  specialty: 100,
  bio: 1000,
  category: 50,
  default: 1000
};

// Patrones de validación por campo
const FIELD_PATTERNS = {
  email: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
  phone: /^[+]?[\d\s-()]{10,20}$/,
  username: /^[a-zA-Z0-9_]{3,50}$/,
  password: /^.{8,128}$/ // Mínimo 8 caracteres, máximo 128
};

/**
 * Validar longitud de un campo
 */
const validateFieldLength = (fieldName, value) => {
  const limit = FIELD_LIMITS[fieldName] || FIELD_LIMITS.default;
  
  if (value && value.length > limit) {
    return {
      valid: false,
      error: `Field '${fieldName}' exceeds maximum length of ${limit} characters`,
      field: fieldName,
      providedLength: value.length,
      maxLength: limit
    };
  }
  
  return { valid: true };
};

/**
 * Validar patrón de un campo
 */
const validateFieldPattern = (fieldName, value) => {
  const pattern = FIELD_PATTERNS[fieldName];
  
  if (pattern && value && !pattern.test(value)) {
    return {
      valid: false,
      error: `Field '${fieldName}' does not match required pattern`,
      field: fieldName
    };
  }
  
  return { valid: true };
};

/**
 * Sanitizar string (eliminar caracteres peligrosos)
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  // Eliminar caracteres nulos y otros caracteres de control
  return str.replace(/[\x00-\x1F\x7F]/g, '');
};

/**
 * Detectar contenido sospechoso en input
 */
const detectSuspiciousContent = (value) => {
  if (typeof value !== 'string') return null;
  
  const suspiciousPatterns = [
    { pattern: /<script[^>]*>.*?<\/script>/gi, type: 'SCRIPT_TAG' },
    { pattern: /javascript:/gi, type: 'JAVASCRIPT_PROTOCOL' },
    { pattern: /on\w+\s*=/gi, type: 'EVENT_HANDLER' },
    { pattern: /data:[^;]*;base64/gi, type: 'DATA_URI' },
    { pattern: /\.\.[\/\\]/g, type: 'PATH_TRAVERSAL' },
    { pattern: /union\s+select/gi, type: 'SQL_INJECTION' },
    { pattern: /<iframe/gi, type: 'IFRAME_TAG' },
    { pattern: /<object/gi, type: 'OBJECT_TAG' },
    { pattern: /<embed/gi, type: 'EMBED_TAG' }
  ];
  
  for (const { pattern, type } of suspiciousPatterns) {
    if (pattern.test(value)) {
      return { type, matched: pattern.exec(value)[0] };
    }
  }
  
  return null;
};

/**
 * Validar y sanitizar objeto de request
 */
const validateAndSanitizeObject = (obj, req) => {
  const errors = [];
  const sanitized = {};
  
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Validar longitud
      const lengthValidation = validateFieldLength(key, value);
      if (!lengthValidation.valid) {
        errors.push(lengthValidation);
        continue;
      }
      
      // Validar patrón si aplica
      const patternValidation = validateFieldPattern(key, value);
      if (!patternValidation.valid) {
        errors.push(patternValidation);
        continue;
      }
      
      // Detectar contenido sospechoso
      const suspicious = detectSuspiciousContent(value);
      if (suspicious) {
        securityLogger.logSecurityEvent(req, EVENT_TYPES.XSS_ATTEMPT, SEVERITY.HIGH, {
          message: `Suspicious content detected in field '${key}'`,
          field: key,
          suspiciousType: suspicious.type,
          matched: suspicious.matched
        });
        
        errors.push({
          valid: false,
          error: `Suspicious content detected in field '${key}'`,
          field: key,
          suspiciousType: suspicious.type
        });
        continue;
      }
      
      // Sanitizar
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      // Recursivo para objetos anidados
      const nestedResult = validateAndSanitizeObject(value, req);
      if (nestedResult.errors.length > 0) {
        errors.push(...nestedResult.errors);
      } else {
        sanitized[key] = nestedResult.sanitized;
      }
    } else {
      sanitized[key] = value;
    }
  }
  
  return { errors, sanitized };
};

/**
 * Middleware de sanitización de inputs
 */
const inputSanitizer = (options = {}) => {
  const { strict = true, logSuspicious = true } = options;
  
  return (req, res, next) => {
    // Excluir rutas de chat (tienen su propia validación específica)
    if (req.originalUrl.startsWith('/api/chat/')) {
      return next();
    }
    
    // Validar y sanitizar query params
    if (req.query && Object.keys(req.query).length > 0) {
      const queryResult = validateAndSanitizeObject(req.query, req);
      
      if (queryResult.errors.length > 0) {
        if (strict) {
          return res.status(400).json({
            success: false,
            error_code: 'INVALID_QUERY_PARAMS',
            message: 'Invalid query parameters',
            errors: queryResult.errors
          });
        }
      }
      
      req.query = queryResult.sanitized;
    }
    
    // Validar y sanitizar body
    if (req.body && Object.keys(req.body).length > 0) {
      const bodyResult = validateAndSanitizeObject(req.body, req);
      
      if (bodyResult.errors.length > 0) {
        if (strict) {
          return res.status(400).json({
            success: false,
            error_code: 'INVALID_BODY',
            message: 'Invalid request body',
            errors: bodyResult.errors
          });
        }
      }
      
      req.body = bodyResult.sanitized;
    }
    
    // Validar y sanitizar params
    if (req.params && Object.keys(req.params).length > 0) {
      const paramsResult = validateAndSanitizeObject(req.params, req);
      
      if (paramsResult.errors.length > 0) {
        if (strict) {
          return res.status(400).json({
            success: false,
            error_code: 'INVALID_PARAMS',
            message: 'Invalid URL parameters',
            errors: paramsResult.errors
          });
        }
      }
      
      req.params = paramsResult.sanitized;
    }
    
    next();
  };
};

/**
 * Middleware específico para validación de campos específicos
 */
const validateFields = (fields) => {
  return (req, res, next) => {
    const errors = [];
    
    for (const field of fields) {
      const value = req.body[field.name];
      
      if (field.required && !value) {
        errors.push({
          field: field.name,
          error: `Field '${field.name}' is required`
        });
        continue;
      }
      
      if (value) {
        // Validar longitud
        if (field.maxLength && value.length > field.maxLength) {
          errors.push({
            field: field.name,
            error: `Field '${field.name}' exceeds maximum length of ${field.maxLength}`
          });
        }
        
        // Validar patrón
        if (field.pattern && !field.pattern.test(value)) {
          errors.push({
            field: field.name,
            error: `Field '${field.name}' does not match required pattern`
          });
        }
        
        // Validar tipo
        if (field.type && typeof value !== field.type) {
          errors.push({
            field: field.name,
            error: `Field '${field.name}' must be of type ${field.type}`
          });
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error_code: 'VALIDATION_ERROR',
        message: 'Field validation failed',
        errors
      });
    }
    
    next();
  };
};

module.exports = {
  inputSanitizer,
  validateFields,
  validateFieldLength,
  validateFieldPattern,
  sanitizeString,
  detectSuspiciousContent,
  validateAndSanitizeObject,
  FIELD_LIMITS,
  FIELD_PATTERNS
};
