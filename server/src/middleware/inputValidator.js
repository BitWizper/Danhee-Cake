/**
 * Middleware de validación y sanitización de inputs para prevenir ataques
 * Protege contra SQLi, XSS, NoSQL injection, y otros ataques comunes
 */

const validator = require('validator');

// Sanitización básica de strings
const sanitizeString = (value, maxLength = 1000) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  
  // Eliminar caracteres peligrosos
  let sanitized = value
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/@@/g, '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .trim();
  
  // Limitar longitud
  if (maxLength > 0) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
};

// Validar que sea un número
const validateNumber = (value, min = null, max = null) => {
  if (value === null || value === undefined) return true;
  const num = Number(value);
  if (isNaN(num)) return false;
  if (min !== null && num < min) return false;
  if (max !== null && num > max) return false;
  return true;
};

// Validar email
const validateEmail = (email) => {
  if (!email) return true;
  return validator.isEmail(email);
};

// Validar URL
const validateUrl = (url) => {
  if (!url) return true;
  return validator.isURL(url, { protocols: ['http', 'https'] });
};

// Validar que no sea un objeto/array (prevención NoSQL)
const validateNotObject = (value) => {
  if (value === null || value === undefined) return true;
  return typeof value !== 'object';
};

// Middleware de validación de request body
const validateRequestBody = (schema) => {
  return (req, res, next) => {
    const body = req.body;
    
    // Si no hay body, continuar
    if (!body || typeof body !== 'object') {
      return next();
    }
    
    const errors = [];
    
    // Validar según el schema proporcionado
    if (schema) {
      for (const [field, rules] of Object.entries(schema)) {
        const value = body[field];
        
        // Validar tipo
        if (rules.type && value !== null && value !== undefined) {
          if (rules.type === 'string' && typeof value !== 'string') {
            errors.push(`${field} debe ser un texto`);
          }
          if (rules.type === 'number' && !validateNumber(value)) {
            errors.push(`${field} debe ser un número`);
          }
          if (rules.type === 'email' && !validateEmail(value)) {
            errors.push(`${field} debe ser un email válido`);
          }
          if (rules.type === 'url' && !validateUrl(value)) {
            errors.push(`${field} debe ser una URL válida`);
          }
        }
        
        // Validar que no sea objeto (NoSQL injection)
        if (!validateNotObject(value)) {
          errors.push(`${field} tiene formato inválido`);
        }
        
        // Validar longitud
        if (rules.minLength && value && value.length < rules.minLength) {
          errors.push(`${field} debe tener al menos ${rules.minLength} caracteres`);
        }
        if (rules.maxLength && value && value.length > rules.maxLength) {
          errors.push(`${field} no debe exceder ${rules.maxLength} caracteres`);
        }
        
        // Validar rango numérico
        if (rules.min !== undefined && !validateNumber(value, rules.min)) {
          errors.push(`${field} debe ser al menos ${rules.min}`);
        }
        if (rules.max !== undefined && !validateNumber(value, null, rules.max)) {
          errors.push(`${field} no debe exceder ${rules.max}`);
        }
        
        // Sanitizar string
        if (rules.sanitize && typeof value === 'string') {
          body[field] = sanitizeString(value, rules.maxLength || 1000);
        }
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Datos inválidos',
        errors
      });
    }
    
    next();
  };
};

// Middleware de validación de parámetros de ruta
const validateParams = (schema) => {
  return (req, res, next) => {
    const params = req.params;
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = params[field];
      
      if (rules.type === 'number' && !validateNumber(value)) {
        errors.push(`${field} debe ser un número`);
      }
      
      if (rules.required && !value) {
        errors.push(`${field} es requerido`);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros inválidos',
        errors
      });
    }
    
    next();
  };
};

// Middleware de validación de query params
const validateQuery = (schema) => {
  return (req, res, next) => {
    const query = req.query;
    const errors = [];
    
    for (const [field, rules] of Object.entries(schema)) {
      const value = query[field];
      
      if (rules.type === 'number' && value && !validateNumber(value)) {
        errors.push(`${field} debe ser un número`);
      }
      
      if (rules.type === 'email' && value && !validateEmail(value)) {
        errors.push(`${field} debe ser un email válido`);
      }
      
      // Sanitizar
      if (rules.sanitize && typeof value === 'string') {
        query[field] = sanitizeString(value, rules.maxLength || 100);
      }
    }
    
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Parámetros de consulta inválidos',
        errors
      });
    }
    
    next();
  };
};

// Middleware para prevenir ataques de métodos HTTP no permitidos
const validateMethod = (allowedMethods) => {
  return (req, res, next) => {
    if (!allowedMethods.includes(req.method)) {
      return res.status(405).json({
        success: false,
        message: 'Método no permitido'
      });
    }
    next();
  };
};

module.exports = {
  sanitizeString,
  validateNumber,
  validateEmail,
  validateUrl,
  validateNotObject,
  validateRequestBody,
  validateParams,
  validateQuery,
  validateMethod
};
