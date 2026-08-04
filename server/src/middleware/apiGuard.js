const { isDangerousValue } = require('./parameterValidator');

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const BLOCKED_REDIRECT_PARAMS = ['redirect', 'next', 'returnUrl', 'return_to', 'url'];

// Patrones específicos de SQLi (requieren contexto de ataque, no palabras individuales)
const SUSPICIOUS_PATTERNS = [
  // SQLi específico
  /union\s+(all\s+)?select/i,
  /or\s+\d+\s*=\s*\d+/i,
  /'\s*(or|and)\s*'/i,
  /;\s*(drop|delete|insert|update)\s+(table|from|into)/i,
  /--\s*$/,
  /\/\*.*\*\//,
  
  // XSS
  /<script[^>]*>.*?<\/script>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  
  // NoSQL injection
  /\$(where|ne|gt|lt|gte|lte|regex|in|nin|or|and|not|nor|exists|type|mod|elemMatch|size)\b/i,
  
  // Time-based SQLi
  /\b(sleep|benchmark|waitfor|delay)\s*\(/i
];

const normalizeText = (value) => {
  if (typeof value !== 'string') return '';
  return value.trim().toLowerCase();
};

const containsSuspiciousPattern = (value) => {
  if (typeof value !== 'string') return false;
  const normalized = normalizeText(value);
  return SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(normalized));
};

const inspectValue = (value, path = 'payload') => {
  if (typeof value === 'string') {
    if (containsSuspiciousPattern(value) || isDangerousValue(value, path)) {
      return { blocked: true, path };
    }
    return { blocked: false };
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const result = inspectValue(value[i], `${path}[${i}]`);
      if (result.blocked) return result;
    }
    return { blocked: false };
  }

  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const result = inspectValue(child, `${path}.${key}`);
      if (result.blocked) return result;
    }
  }

  return { blocked: false };
};

const apiGuard = (req, res, next) => {
  const method = (req.method || '').toUpperCase();
  const rawInput = JSON.stringify(req.body || {}) + JSON.stringify(req.query || {}) + JSON.stringify(req.params || {});

  if (MUTATING_METHODS.includes(method)) {
    const bodyResult = inspectValue(req.body, 'body');
    if (bodyResult.blocked) {
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', message: 'Solicitud inválida.' });
    }

    if (SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(rawInput))) {
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', message: 'Solicitud inválida.' });
    }
  }

  for (const paramName of BLOCKED_REDIRECT_PARAMS) {
    const value = req.query?.[paramName] || req.body?.[paramName];
    if (typeof value === 'string' && /^(https?:)?\/\//i.test(value)) {
      return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', message: 'Solicitud inválida.' });
    }
  }

  if (req.headers && typeof req.headers['content-type'] === 'string' && req.headers['content-type'].includes('javascript')) {
    return res.status(400).json({ success: false, error_code: 'INVALID_REQUEST', message: 'Solicitud inválida.' });
  }

  next();
};

module.exports = { apiGuard };