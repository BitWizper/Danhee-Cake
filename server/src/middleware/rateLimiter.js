const rateLimit = require('express-rate-limit');

// Función para obtener IP real del cliente (considerando proxies)
const getClientIP = (req) => {
  return req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
};

// Rate limiting general para endpoints sensibles
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por ventana
  keyGenerator: (req) => getClientIP(req),
  message: {
    success: false,
    message: 'Demasiados intentos. Por favor, intenta de nuevo en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // No contar intentos exitosos
});

// Rate limiting más estricto para registro
exports.registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por hora por IP
  keyGenerator: (req) => getClientIP(req),
  message: {
    success: false,
    message: 'Demasiados intentos de registro. Por favor, intenta de nuevo en 1 hora.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para chat endpoint (prevenir abuso de IA)
exports.chatLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // máximo 20 mensajes por minuto
  keyGenerator: (req) => getClientIP(req),
  message: {
    success: false,
    message: 'Demasiadas solicitudes al chat. Por favor, espera un momento.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting general para API
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 solicitudes por ventana
  keyGenerator: (req) => getClientIP(req),
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Por favor, reduce el ritmo.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting específico por método HTTP para protección adicional
exports.methodLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // máximo 50 solicitudes por método por ventana
  keyGenerator: (req) => `${getClientIP(req)}_${req.method}`,
  message: {
    success: false,
    message: 'Demasiadas solicitudes de este tipo. Por favor, reduce el ritmo.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting específico para operaciones de escritura (POST, PUT, DELETE, PATCH)
exports.writeLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 30, // máximo 30 operaciones de escritura por ventana
  keyGenerator: (req) => getClientIP(req),
  skip: (req) => {
    // Solo aplicar a métodos de escritura
    const writeMethods = ['POST', 'PUT', 'DELETE', 'PATCH'];
    return !writeMethods.includes(req.method);
  },
  message: {
    success: false,
    message: 'Demasiadas operaciones de escritura. Por favor, espera un momento.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting específico para operaciones de lectura (GET)
exports.readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 200, // máximo 200 solicitudes de lectura por minuto
  keyGenerator: (req) => getClientIP(req),
  skip: (req) => {
    // Solo aplicar a métodos de lectura
    const readMethods = ['GET', 'HEAD', 'OPTIONS'];
    return !readMethods.includes(req.method);
  },
  message: {
    success: false,
    message: 'Demasiadas solicitudes de lectura. Por favor, espera un momento.'
  },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting para prevenir ataques de fuerza bruta en endpoints específicos
exports.bruteForceLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutos
  max: 10, // máximo 10 intentos
  keyGenerator: (req) => getClientIP(req),
  message: {
    success: false,
    message: 'Demasiados intentos fallidos. Tu IP ha sido temporalmente bloqueada.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false // Contar todos los intentos, incluso exitosos
});
