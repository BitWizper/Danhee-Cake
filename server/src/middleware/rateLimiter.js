const rateLimit = require('express-rate-limit');
const { persistBlock, isPersistedBlocked, clearExpiredBlocks } = require('./securityDashboard');
const { getClientIP } = require('./clientIp');

// Almacenamiento de IPs bloqueadas
const blockedIPs = new Map();

// Función para bloquear IP
const blockIP = (ip, durationMinutes = 30) => {
  const unblockTime = Date.now() + durationMinutes * 60 * 1000;
  blockedIPs.set(ip, unblockTime);
  persistBlock(ip, durationMinutes, 'rate_limit');
  console.log(`[SECURITY] IP ${ip} bloqueada por ${durationMinutes} minutos`);
};

// Función para verificar si una IP está bloqueada
const isIPBlocked = (ip) => {
  clearExpiredBlocks();
  const unblockTime = blockedIPs.get(ip);
  if (unblockTime && Date.now() < unblockTime) {
    return true;
  }
  if (unblockTime) {
    blockedIPs.delete(ip);
  }
  return isPersistedBlocked(ip);
};

// Middleware para verificar IP bloqueada
const ipBlocker = (req, res, next) => {
  const ip = getClientIP(req);
  if (isIPBlocked(ip)) {
    console.log(`[SECURITY] Intento bloqueado desde IP: ${ip}`);
    return res.status(403).json({
      success: false,
      message: 'Tu IP ha sido temporalmente bloqueada por exceder los límites de seguridad.'
    });
  }
  next();
};

// Middleware para crear rate limiter con logs
const createLimiter = (options = {}) => {
  const defaultMessage = {
    success: false,
    message: 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.'
  };

  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => getClientIP(req),
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: false,
    message: defaultMessage,
    handler: (req, res, next, limiterOptions) => {
      const ip = getClientIP(req);
      console.log(`[RATE LIMIT] IP: ${ip} - Excedió límite (${limiterOptions.max}) en ${req.originalUrl}`);
      const violations = req.violations || 0;
      if (violations >= 3) {
        blockIP(ip, 30);
      }
      res.status(limiterOptions.statusCode || 429).json({
        success: false,
        message: limiterOptions.message?.message || defaultMessage.message
      });
    },
    ...options,
    message: {
      ...defaultMessage,
      ...(options.message || {})
    }
  });
};

// Rate limiters
exports.authLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: false,
  message: {
    success: false,
    message: 'Demasiados intentos de inicio de sesión. Por favor, intenta de nuevo en 15 minutos.'
  }
});

exports.registerLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: {
    success: false,
    message: 'Demasiados intentos de registro. Por favor, intenta de nuevo en 1 hora.'
  }
});

exports.chatLimiter = createLimiter({
  windowMs: 1 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Demasiadas solicitudes al chat. Por favor, espera un momento.'
  }
});

exports.apiLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Por favor, reduce el ritmo.'
  }
});

exports.methodLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: (req) => `${getClientIP(req)}_${req.method}`,
  message: {
    success: false,
    message: 'Demasiadas solicitudes de este tipo. Por favor, reduce el ritmo.'
  }
});

exports.writeLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  skip: (req) => {
    const writeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    return !writeMethods.includes(req.method);
  },
  message: {
    success: false,
    message: 'Demasiadas operaciones de escritura. Por favor, espera un momento.'
  }
});

exports.readLimiter = createLimiter({
  windowMs: 1 * 60 * 1000,
  max: 50,
  skip: (req) => {
    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    return !readMethods.includes(req.method);
  },
  message: {
    success: false,
    message: 'Demasiadas solicitudes de lectura. Por favor, espera un momento.'
  }
});

exports.bakersLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: {
    success: false,
    message: 'Demasiadas consultas al directorio de reposteros. Por favor, intenta de nuevo más tarde.'
  }
});

exports.bruteForceLimiter = createLimiter({
  windowMs: 30 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Demasiados intentos fallidos. Tu IP ha sido temporalmente bloqueada.'
  },
  skipSuccessfulRequests: false
});

// Exportar utilidades
exports.ipBlocker = ipBlocker;
exports.blockIP = blockIP;
exports.isIPBlocked = isIPBlocked;
exports.getClientIP = getClientIP;