// Middleware de sanitización para prevenir inyección de código y SQLi

const sqlInjectionPatterns = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC|ALTER|CREATE|TRUNCATE)\b)/i,
  /(;|--|\/\*|\*\/|@@)/,
  /(\bOR\b.*=.*=)/i,
  /(\bAND\b.*=.*=)/i,
  /(\bXOR\b.*=.*=)/i,
  /('(\s)*(=|OR|AND|XOR))/i,
  /("(\s)*(=|OR|AND|XOR))/i,
  /(\b(1=1|1 = 1)\b)/i,
  /(\b(true\s*=\s*true)\b)/i,
  /(\b(false\s*=\s*false)\b)/i,
  /(\bwaitfor\s+delay\b)/i,
  /(\bsleep\b)/i,
  /(\bbenchmark\b)/i
];

const xssPatterns = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<img[^>]+src[^>]*>/gi,
  /<embed[^>]*>/gi,
  /<object[^>]*>/gi
];

const sanitizeString = (str) => {
  if (typeof str !== 'string') return str;
  
  // Trim espacios
  let sanitized = str.trim();
  
  // Detectar patrones SQL injection
  for (const pattern of sqlInjectionPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error('Input contiene patrones sospechosos de SQL injection');
    }
  }
  
  // Detectar patrones XSS
  for (const pattern of xssPatterns) {
    if (pattern.test(sanitized)) {
      throw new Error('Input contiene patrones sospechosos de XSS');
    }
  }
  
  // Escapar caracteres especiales HTML
  sanitized = sanitized
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
  
  return sanitized;
};

const sanitizeObject = (obj) => {
  if (!obj || typeof obj !== 'object') return obj;
  
  const sanitized = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else if (Array.isArray(value)) {
        sanitized[key] = value.map(item => 
          typeof item === 'string' ? sanitizeString(item) : item
        );
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value);
      } else {
        sanitized[key] = value;
      }
    }
  }
  return sanitized;
};

// Middleware para sanitizar body, query y params
const sanitizeMiddleware = (req, res, next) => {
  try {
    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }
    next();
  } catch (error) {
    console.error('[Sanitize] Error de sanitización:', error.message);
    console.error('[Sanitize] IP:', req.ip);
    console.error('[Sanitize] Path:', req.path);
    return res.status(400).json({
      success: false,
      message: 'Input contiene caracteres o patrones no permitidos'
    });
  }
};

module.exports = sanitizeMiddleware;
