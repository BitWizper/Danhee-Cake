/**
 * Middleware de Protección contra Brute Force
 * Bloquea IPs después de múltiples intentos fallidos de autenticación
 */

const { securityLogger, logBruteForce, SEVERITY } = require('./securityLogger');

// Almacenamiento en memoria para tracking de intentos fallidos
const failedAttempts = new Map();

// Configuración
const MAX_FAILED_ATTEMPTS = 5;
const BLOCK_DURATION = 15 * 60 * 1000; // 15 minutos
const ATTEMPT_WINDOW = 15 * 60 * 1000; // 15 minutos

/**
 * Limpiar entradas antiguas
 */
const cleanupOldAttempts = () => {
  const now = Date.now();
  for (const [key, value] of failedAttempts.entries()) {
    if (now - value.lastAttempt > ATTEMPT_WINDOW) {
      failedAttempts.delete(key);
    }
  }
};

// Limpiar cada 5 minutos
setInterval(cleanupOldAttempts, 5 * 60 * 1000);

/**
 * Obtener información de intentos para una IP
 */
const getAttemptInfo = (ip) => {
  const now = Date.now();
  let info = failedAttempts.get(ip);
  
  if (!info || now - info.lastAttempt > ATTEMPT_WINDOW) {
    info = {
      count: 0,
      lastAttempt: now,
      blocked: false,
      blockUntil: 0,
      attempts: []
    };
    failedAttempts.set(ip, info);
  }
  
  return info;
};

/**
 * Registrar intento fallido
 */
const recordFailedAttempt = (req, identifier = null) => {
  const ip = req.ip || req.connection.remoteAddress;
  const info = getAttemptInfo(ip);
  
  info.count++;
  info.lastAttempt = Date.now();
  info.attempts.push({
    timestamp: Date.now(),
    path: req.path,
    method: req.method,
    identifier: identifier
  });
  
  // Mantener solo los últimos 10 intentos
  if (info.attempts.length > 10) {
    info.attempts = info.attempts.slice(-10);
  }
  
  // Verificar si debe bloquear
  if (info.count >= MAX_FAILED_ATTEMPTS && !info.blocked) {
    info.blocked = true;
    info.blockUntil = Date.now() + BLOCK_DURATION;
    
    logBruteForce(req, info.count);
  }
  
  return info;
};

/**
 * Middleware de protección contra brute force
 */
const bruteForceProtection = (options = {}) => {
  const maxAttempts = options.maxAttempts || MAX_FAILED_ATTEMPTS;
  const blockDuration = options.blockDuration || BLOCK_DURATION;
  const attemptWindow = options.attemptWindow || ATTEMPT_WINDOW;
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const info = getAttemptInfo(ip);
    
    console.log('[BruteForce] IP:', ip, 'Intentos:', info.count, 'Bloqueada:', info.blocked, 'BlockUntil:', info.blockUntil);
    
    // Verificar si la IP está bloqueada
    if (info.blocked && Date.now() < info.blockUntil) {
      const remainingTime = Math.ceil((info.blockUntil - Date.now()) / 1000);
      console.log('[BruteForce]  IP bloqueada por brute force:', ip, 'Tiempo restante:', remainingTime, 's');
      
      return res.status(429).json({
        success: false,
        error_code: 'IP_BLOCKED_BRUTE_FORCE',
        message: `Too many failed authentication attempts. IP blocked for ${remainingTime} seconds.`,
        retry_after: remainingTime
      });
    }
    
    console.log('[BruteForce] ✅ IP permitida:', ip);
    
    // Agregar headers informativos
    res.setHeader('X-Auth-Attempts-Remaining', Math.max(0, maxAttempts - info.count));
    
    // Sobrescribir res.json para detectar fallos de autenticación
    const originalJson = res.json;
    res.json = function(data) {
      // Detectar fallos de autenticación
      if (res.statusCode === 401 || (data.success === false && data.error_code === 'INVALID_CREDENTIALS')) {
        const identifier = req.body?.email || req.body?.username || 'unknown';
        recordFailedAttempt(req, identifier);
        
        // Actualizar header de intentos restantes
        const updatedInfo = getAttemptInfo(ip);
        res.setHeader('X-Auth-Attempts-Remaining', Math.max(0, maxAttempts - updatedInfo.count));
      }
      
      // Si es exitoso, resetear contador
      if (res.statusCode === 200 && data.success === true) {
        info.count = 0;
        info.attempts = [];
        info.blocked = false;
        info.blockUntil = 0;
      }
      
      return originalJson.call(this, data);
    };
    
    next();
  };
};

/**
 * Middleware específico para login
 */
const loginBruteForceProtection = bruteForceProtection({
  maxAttempts: 5,
  blockDuration: 15 * 60 * 1000,
  attemptWindow: 15 * 60 * 1000
});

/**
 * Middleware específico para registro
 */
const registerBruteForceProtection = bruteForceProtection({
  maxAttempts: 10,
  blockDuration: 30 * 60 * 1000,
  attemptWindow: 30 * 60 * 1000
});

/**
 * Obtener estadísticas de brute force
 */
const getBruteForceStats = () => {
  const stats = {
    totalIPs: failedAttempts.size,
    blockedIPs: 0,
    activeIPs: 0,
    topOffenders: []
  };
  
  const now = Date.now();
  const entries = [];
  
  for (const [ip, info] of failedAttempts.entries()) {
    if (now - info.lastAttempt < ATTEMPT_WINDOW) {
      entries.push({ ip, ...info });
      stats.activeIPs++;
      if (info.blocked && now < info.blockUntil) {
        stats.blockedIPs++;
      }
    }
  }
  
  // Top 10 IPs con más intentos
  stats.topOffenders = entries
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map(e => ({ 
      ip: e.ip, 
      count: e.count, 
      blocked: e.blocked,
      lastAttempt: new Date(e.lastAttempt).toISOString()
    }));
  
  return stats;
};

/**
 * Desbloquear una IP manualmente
 */
const unblockIP = (ip) => {
  const info = failedAttempts.get(ip);
  if (info) {
    info.blocked = false;
    info.blockUntil = 0;
    info.count = 0;
    info.attempts = [];
    return true;
  }
  return false;
};

/**
 * Limpiar todas las entradas
 */
const clearAll = () => {
  failedAttempts.clear();
};

module.exports = {
  bruteForceProtection,
  loginBruteForceProtection,
  registerBruteForceProtection,
  getBruteForceStats,
  unblockIP,
  clearAll,
  recordFailedAttempt
};
