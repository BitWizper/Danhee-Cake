const rateLimit = require('express-rate-limit');
const MemoryStore = require('express-rate-limit').MemoryStore;

// Configuración de store con límites de memoria para evitar saturación
const createMemoryStore = () => {
  return new MemoryStore({
    checkPeriod: 15 * 60 * 1000, // Limpiar entradas antiguas cada 15 minutos
    max: 10000, // Máximo 10,000 entradas en memoria
    maxAge: 24 * 60 * 60 * 1000 // Edad máxima de 24 horas
  });
};

// Rate limiting general para endpoints sensibles
exports.authLimiter = rateLimit({
  store: createMemoryStore(),
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos por ventana
  message: {
    success: false,
    message: 'Demasiados intentos. Por favor, intenta de nuevo en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // No contar intentos exitosos
  skipFailedRequests: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos. Por favor, intenta de nuevo en 15 minutos.',
      retryAfter: Math.ceil(15 * 60) // 15 minutos en segundos
    });
  }
});

// Rate limiting más estricto para registro
exports.registerLimiter = rateLimit({
  store: createMemoryStore(),
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 registros por hora por IP
  message: {
    success: false,
    message: 'Demasiados intentos de registro. Por favor, intenta de nuevo en 1 hora.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Demasiados intentos de registro. Por favor, intenta de nuevo en 1 hora.',
      retryAfter: Math.ceil(60 * 60) // 1 hora en segundos
    });
  }
});

// Rate limiting para chat endpoint (prevenir abuso de IA)
exports.chatLimiter = rateLimit({
  store: createMemoryStore(),
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 20, // máximo 20 mensajes por minuto
  message: {
    success: false,
    message: 'Demasiadas solicitudes al chat. Por favor, espera un momento.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes al chat. Por favor, espera un momento.',
      retryAfter: Math.ceil(60) // 1 minuto en segundos
    });
  }
});

// Rate limiting general para API
exports.apiLimiter = rateLimit({
  store: createMemoryStore(),
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 solicitudes por ventana
  message: {
    success: false,
    message: 'Demasiadas solicitudes. Por favor, reduce el ritmo.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes. Por favor, reduce el ritmo.',
      retryAfter: Math.ceil(15 * 60) // 15 minutos en segundos
    });
  }
});
