const { logSecurityEvent } = require('./auditLogger');

const validOrigins = (process.env.ALLOWED_ORIGINS || 'https://unspoken-resurrect-bountiful.ngrok-free.dev,http://localhost:5173,http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim().toLowerCase())
  .filter(Boolean);

const normalizeHost = (value) => {
  if (!value) return '';
  try {
    const url = new URL(value, 'http://example.com');
    return url.origin.toLowerCase();
  } catch {
    return value.trim().toLowerCase();
  }
};

const getRequestOrigin = (req) => {
  const origin = req.headers.origin;
  if (origin) return normalizeHost(origin);

  const referer = req.headers.referer || req.headers.referrer;
  if (referer) return normalizeHost(referer);

  return '';
};

const browserOriginGuard = (req, res, next) => {
  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    logSecurityEvent('MISSING_ORIGIN_HEADER', {
      path: req.originalUrl,
      method: req.method,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });
    return res.status(403).json({
      success: false,
      error: 'ORIGIN_REQUIRED',
      message: 'La solicitud debe provenir de un origen válido del navegador.'
    });
  }

  if (!validOrigins.includes(requestOrigin)) {
    logSecurityEvent('INVALID_ORIGIN', {
      origin: requestOrigin,
      allowedOrigins: validOrigins,
      path: req.originalUrl,
      method: req.method,
      ip: req.ip || req.socket?.remoteAddress || 'unknown'
    });
    return res.status(403).json({
      success: false,
      error: 'ORIGIN_NOT_ALLOWED',
      message: 'El origen de la solicitud no está permitido.'
    });
  }

  next();
};

module.exports = browserOriginGuard;
