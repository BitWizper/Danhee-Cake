const { isDangerousValue } = require('./parameterValidator');

const MUTATING_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const BLOCKED_REDIRECT_PARAMS = ['redirect', 'next', 'returnUrl', 'return_to', 'url'];
const SUSPICIOUS_PATTERNS = [
  /(select|insert|update|delete|drop|union|exec|script)/i,
  /<script|javascript:|on\w+=/i,
  /\$(where|ne|gt|lt|gte|lte|regex|in|nin|or|and|not|nor|exists|type|mod|elemMatch|size)\b/i,
  /\b(or|and)\b\s+\d+\s*=\s*\d+/i,
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
      return res.status(400).json({ success: false, error_code: 'MALICIOUS_PAYLOAD_BLOCKED', message: 'Solicitud bloqueada por contenido sospechoso' });
    }

    if (SUSPICIOUS_PATTERNS.some((pattern) => pattern.test(rawInput))) {
      return res.status(400).json({ success: false, error_code: 'MALICIOUS_PAYLOAD_BLOCKED', message: 'Solicitud bloqueada por contenido sospechoso' });
    }
  }

  for (const paramName of BLOCKED_REDIRECT_PARAMS) {
    const value = req.query?.[paramName] || req.body?.[paramName];
    if (typeof value === 'string' && /^(https?:)?\/\//i.test(value)) {
      return res.status(400).json({ success: false, error_code: 'OPEN_REDIRECT_BLOCKED', message: 'Redirección externa bloqueada' });
    }
  }

  if (req.headers && typeof req.headers['content-type'] === 'string' && req.headers['content-type'].includes('javascript')) {
    return res.status(415).json({ success: false, error_code: 'UNSUPPORTED_CONTENT_TYPE', message: 'Content-Type no soportado' });
  }

  next();
};

module.exports = { apiGuard };