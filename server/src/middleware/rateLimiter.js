const rateLimit = require('express-rate-limit');

// Rate limiting general para endpoints sensibles
exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por ventana
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
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Por favor, reduce el ritmo.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
