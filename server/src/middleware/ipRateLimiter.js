/**
 * Middleware de Rate Limiting por IP
 * Limita el número de solicitudes por dirección IP
 */

const { securityLogger, logRateLimit, SEVERITY } = require('./securityLogger');

// Almacenamiento en memoria para rate limiting por IP
const ipStore = new Map();

// Configuración
const DEFAULT_WINDOW_MS = 60 * 1000; // 1 minuto
const DEFAULT_MAX_REQUESTS = 100; // 100 solicitudes por minuto

/**
 * Limpiar entradas antiguas del store
 */
const cleanupOldEntries = () => {
  const now = Date.now();
  for (const [key, value] of ipStore.entries()) {
    if (now - value.resetTime > DEFAULT_WINDOW_MS) {
      ipStore.delete(key);
    }
  }
};

// Limpiar cada 5 minutos
setInterval(cleanupOldEntries, 5 * 60 * 1000);

/**
 * Obtener información de rate limiting para una IP
 */
const getIpInfo = (ip) => {
  const now = Date.now();
  let info = ipStore.get(ip);
  
  if (!info || now - info.resetTime > DEFAULT_WINDOW_MS) {
    info = {
      count: 0,
      resetTime: now + DEFAULT_WINDOW_MS,
      blocked: false,
      blockUntil: 0
    };
    ipStore.set(ip, info);
  }
  
  return info;
};

/**
 * Middleware de rate limiting por IP
 */
const ipRateLimiter = (options = {}) => {
  const windowMs = options.windowMs || DEFAULT_WINDOW_MS;
  const maxRequests = options.maxRequests || DEFAULT_MAX_REQUESTS;
  const skipSuccessfulRequests = options.skipSuccessfulRequests || false;
  
  return (req, res, next) => {
    // Eximir a reposteros del rate limiting por IP
    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const jwt = require('jsonwebtoken');
        const token = authHeader.slice(7);
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role === 'repostero') {
          return next();
        }
      } catch (error) {
        // Continuar con verificación normal
      }
    }
    
    const ip = req.ip || req.connection.remoteAddress;
    const info = getIpInfo(ip);
    
    // Verificar si la IP está bloqueada
    if (info.blocked && Date.now() < info.blockUntil) {
      const remainingTime = Math.ceil((info.blockUntil - Date.now()) / 1000);
      
      return res.status(429).json({
        success: false,
        error_code: 'IP_BLOCKED',
        message: `IP temporarily blocked due to excessive requests. Try again in ${remainingTime} seconds.`,
        retry_after: remainingTime
      });
    }
    
    // Incrementar contador
    info.count++;
    
    // Verificar límite
    if (info.count > maxRequests) {
      // Bloquear IP por 5 minutos
      info.blocked = true;
      info.blockUntil = Date.now() + (5 * 60 * 1000);
      
      logRateLimit(req, maxRequests);
      
      return res.status(429).json({
        success: false,
        error_code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests from this IP. Please try again later.',
        retry_after: 300
      });
    }
    
    // Agregar headers de rate limiting
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - info.count));
    res.setHeader('X-RateLimit-Reset', new Date(info.resetTime).toISOString());
    
    // Si la solicitud es exitosa y skipSuccessfulRequests es true, decrementar contador
    if (skipSuccessfulRequests) {
      const originalSend = res.send;
      res.send = function(data) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          info.count = Math.max(0, info.count - 1);
        }
        return originalSend.call(this, data);
      };
    }
    
    next();
  };
};

/**
 * Rate limiting más estricto para endpoints sensibles
 */
const strictRateLimiter = ipRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 10 // 10 solicitudes por minuto
});

/**
 * Rate limiting para endpoints de autenticación
 */
const authRateLimiter = ipRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutos
  maxRequests: 5 // 5 intentos por 15 minutos
});

/**
 * Rate limiting para API general
 */
const apiRateLimiter = ipRateLimiter({
  windowMs: 60 * 1000, // 1 minuto
  maxRequests: 50 // 50 solicitudes por minuto
});

/**
 * Obtener estadísticas de rate limiting
 */
const getRateLimitStats = () => {
  const stats = {
    totalIPs: ipStore.size,
    blockedIPs: 0,
    activeIPs: 0,
    topRequesters: []
  };
  
  const now = Date.now();
  const entries = [];
  
  for (const [ip, info] of ipStore.entries()) {
    if (now - info.resetTime < DEFAULT_WINDOW_MS) {
      entries.push({ ip, ...info });
      stats.activeIPs++;
      if (info.blocked && now < info.blockUntil) {
        stats.blockedIPs++;
      }
    }
  }
  
  // Top 10 IPs con más solicitudes
  stats.topRequesters = entries
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(e => ({ ip: e.ip, count: e.count, blocked: e.blocked }));
  
  return stats;
};

/**
 * Desbloquear una IP manualmente
 */
const unblockIP = (ip) => {
  const info = ipStore.get(ip);
  if (info) {
    info.blocked = false;
    info.blockUntil = 0;
    info.count = 0;
    return true;
  }
  return false;
};

/**
 * Limpiar todas las entradas
 */
const clearAll = () => {
  ipStore.clear();
};

module.exports = {
  ipRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  apiRateLimiter,
  getRateLimitStats,
  unblockIP,
  clearAll
};
