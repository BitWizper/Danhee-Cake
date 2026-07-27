const rateLimit = require('express-rate-limit');

// Almacenamiento de IPs bloqueadas
const blockedIPs = new Map();

// Función para obtener IP real del cliente (considerando proxies y headers)
const getClientIP = (req) => {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
};

// Middleware para crear rate limiter con logs
const createLimiter = (options) => {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    keyGenerator: (req) => getClientIP(req),
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.'
    },
    handler: (req, res, next, options) => {
      const ip = getClientIP(req);
      console.log(`[RATE LIMIT] IP: ${ip} - Excedió límite (${options.max}) en ${req.originalUrl}`);
      // Opcional: bloquear IP por 30 minutos después de 3 violaciones
      const violations = req.violations || 0;
      if (violations >= 3) {
        blockIP(ip, 30);
      }
      res.status(options.statusCode || 429).json({
        success: false,
        message: options.message.message || 'Demasiadas solicitudes. Por favor, intenta de nuevo más tarde.'
      });
    },
    ...options
  });
};

// Función para bloquear IP
const blockIP = (ip, durationMinutes = 30) => {
  const unblockTime = Date.now() + durationMinutes * 60 * 1000;
  blockedIPs.set(ip, unblockTime);
  console.log(`[SECURITY] IP ${ip} bloqueada por ${durationMinutes} minutos`);
};

// Función para verificar si una IP está bloqueada
const isIPBlocked = (ip) => {
  const unblockTime = blockedIPs.get(ip);
  if (unblockTime && Date.now() < unblockTime) {
    return true;
  }
  if (unblockTime) {
    blockedIPs.delete(ip); // Limpiar expirados
  }
  return false;
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
  max: 100,
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Por favor, reduce el ritmo.'
  }
});

exports.methodLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => `${getClientIP(req)}_${req.method}`,
  message: {
    success: false,
    message: 'Demasiadas solicitudes de este tipo. Por favor, reduce el ritmo.'
  }
});

exports.writeLimiter = createLimiter({
  windowMs: 10 * 60 * 1000,
  max: 30,
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
  max: 200,
  skip: (req) => {
    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    return !readMethods.includes(req.method);
  },
  message: {
    success: false,
    message: 'Demasiadas solicitudes de lectura. Por favor, espera un momento.'
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