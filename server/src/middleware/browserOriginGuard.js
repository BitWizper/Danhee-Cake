const { logSecurityEvent } = require('./auditLogger');

const getValidOrigins = () => {
  const origins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || 'http://localhost:5173,http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim().toLowerCase())
    .filter(Boolean);

  // En desarrollo, permitir también orígenes de trycloudflare.com para tunnels
  if (process.env.NODE_ENV !== 'production') {
    // Agregar patrones para túneles de desarrollo
    origins.push('https://redeem-bundle-distinction-advertisement.trycloudflare.com');
    // También permitir cualquier subdominio de trycloudflare.com
    origins.push('.trycloudflare.com');
  }

  return origins;
};

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
  const validOrigins = getValidOrigins();

  if (!requestOrigin) {
    // Permitir GET/HEAD directos desde el navegador que no incluyen Origin
    if (['GET', 'HEAD'].includes(req.method)) {
      return next();
    }

    // Permitir solicitudes desde localhost/127.0.0.1 sin Origin header (para desarrollo)
    const ip = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || 'unknown';
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === 'localhost';
    
    if (isLocalhost) {
      return next();
    }

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

  // Verificar si el origen está en la lista de orígenes permitidos o si coincide con un patrón
  const isOriginAllowed = validOrigins.some(allowedOrigin => {
    if (allowedOrigin.startsWith('.')) {
      // Patrón de dominio (ej: .trycloudflare.com)
      return requestOrigin.endsWith(allowedOrigin) || requestOrigin.endsWith(allowedOrigin.substring(1));
    }
    return allowedOrigin === requestOrigin;
  });

  if (!isOriginAllowed) {
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
