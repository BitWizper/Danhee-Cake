/**
 * Middleware de Logging de Seguridad
 * Registra intentos de ataque y eventos de seguridad para auditoría
 */

const fs = require('fs');
const path = require('path');

// Directorio de logs de seguridad
const LOG_DIR = path.join(__dirname, '../../logs/security');
const LOG_FILE = path.join(LOG_DIR, 'security.log');

// Asegurar que el directorio existe
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Niveles de severidad
const SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
};

// Tipos de eventos de seguridad
const EVENT_TYPES = {
  SQL_INJECTION: 'SQL_INJECTION',
  XSS_ATTEMPT: 'XSS_ATTEMPT',
  NOSQL_INJECTION: 'NOSQL_INJECTION',
  AUTH_FAILURE: 'AUTH_FAILURE',
  BRUTE_FORCE: 'BRUTE_FORCE',
  RATE_LIMIT: 'RATE_LIMIT',
  INVALID_METHOD: 'INVALID_METHOD',
  SUSPICIOUS_IP: 'SUSPICIOUS_IP',
  FILE_UPLOAD: 'FILE_UPLOAD',
  PATH_TRAVERSAL: 'PATH_TRAVERSAL'
};

/**
 * Formatear timestamp
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Escribir log al archivo
 */
const writeLog = (entry) => {
  const logLine = JSON.stringify(entry) + '\n';
  fs.appendFileSync(LOG_FILE, logLine, { flag: 'a' });
  
  // También imprimir en consola para visibilidad inmediata
  console.log(`[SECURITY LOG] ${entry.severity} - ${entry.type}: ${entry.message}`);
};

/**
 * Registrar evento de seguridad
 */
const logSecurityEvent = (req, type, severity, details) => {
  const entry = {
    timestamp: getTimestamp(),
    type: type,
    severity: severity,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    method: req.method,
    path: req.path,
    query: req.query,
    body: type === EVENT_TYPES.AUTH_FAILURE ? { ...req.body, password: '[REDACTED]' } : req.body,
    ...details
  };
  
  writeLog(entry);
  
  // Alerta inmediata para eventos críticos
  if (severity === SEVERITY.CRITICAL || severity === SEVERITY.HIGH) {
    console.error(`⚠️  SECURITY ALERT: ${type} from IP ${entry.ip}`);
  }
};

/**
 * Middleware para logging de seguridad
 */
const securityLogger = (req, res, next) => {
  // Sobrescribir res.json para capturar respuestas de error de seguridad
  const originalJson = res.json;
  
  res.json = function(data) {
    // Registrar respuestas de error relacionadas con seguridad
    if (data.error_code && (
      data.error_code === 'SQL_INJECTION_DETECTED' ||
      data.error_code === 'XSS_DETECTED' ||
      data.error_code === 'NOSQL_INJECTION_DETECTED' ||
      data.error_code === 'INVALID_INPUT'
    )) {
      let type, severity;
      
      if (data.error_code === 'SQL_INJECTION_DETECTED') {
        type = EVENT_TYPES.SQL_INJECTION;
        severity = SEVERITY.HIGH;
      } else if (data.error_code === 'XSS_DETECTED') {
        type = EVENT_TYPES.XSS_ATTEMPT;
        severity = SEVERITY.HIGH;
      } else if (data.error_code === 'NOSQL_INJECTION_DETECTED') {
        type = EVENT_TYPES.NOSQL_INJECTION;
        severity = SEVERITY.HIGH;
      } else {
        type = 'INVALID_INPUT';
        severity = SEVERITY.LOW;
      }
      
      logSecurityEvent(req, type, severity, {
        message: data.message,
        errorCode: data.error_code
      });
    }
    
    return originalJson.call(this, data);
  };
  
  next();
};

/**
 * Logger específico para fallos de autenticación
 */
const logAuthFailure = (req, reason) => {
  logSecurityEvent(req, EVENT_TYPES.AUTH_FAILURE, SEVERITY.MEDIUM, {
    message: `Authentication failure: ${reason}`,
    reason: reason
  });
};

/**
 * Logger específico para brute force
 */
const logBruteForce = (req, attemptCount) => {
  logSecurityEvent(req, EVENT_TYPES.BRUTE_FORCE, SEVERITY.HIGH, {
    message: `Brute force attack detected - ${attemptCount} failed attempts`,
    attemptCount: attemptCount
  });
};

/**
 * Logger específico para rate limiting
 */
const logRateLimit = (req, limit) => {
  logSecurityEvent(req, EVENT_TYPES.RATE_LIMIT, SEVERITY.MEDIUM, {
    message: `Rate limit exceeded - ${limit} requests`,
    limit: limit
  });
};

/**
 * Logger específico para métodos HTTP inválidos
 */
const logInvalidMethod = (req, method) => {
  logSecurityEvent(req, EVENT_TYPES.INVALID_METHOD, SEVERITY.MEDIUM, {
    message: `Invalid HTTP method attempted: ${method}`,
    attemptedMethod: method
  });
};

/**
 * Logger específico para uploads de archivos
 */
const logFileUpload = (req, fileInfo) => {
  logSecurityEvent(req, EVENT_TYPES.FILE_UPLOAD, SEVERITY.LOW, {
    message: `File upload attempt`,
    fileName: fileInfo.originalname,
    fileSize: fileInfo.size,
    mimeType: fileInfo.mimetype
  });
};

/**
 * Logger específico para path traversal
 */
const logPathTraversal = (req, attemptedPath) => {
  logSecurityEvent(req, EVENT_TYPES.PATH_TRAVERSAL, SEVERITY.HIGH, {
    message: `Path traversal attempt detected`,
    attemptedPath: attemptedPath
  });
};

/**
 * Obtener estadísticas de seguridad (últimas 24 horas)
 */
const getSecurityStats = () => {
  try {
    if (!fs.existsSync(LOG_FILE)) {
      return { total: 0, byType: {}, bySeverity: {} };
    }
    
    const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean);
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentLogs = logs
      .map(line => JSON.parse(line))
      .filter(log => new Date(log.timestamp) > yesterday);
    
    const stats = {
      total: recentLogs.length,
      byType: {},
      bySeverity: {},
      topIPs: {}
    };
    
    recentLogs.forEach(log => {
      stats.byType[log.type] = (stats.byType[log.type] || 0) + 1;
      stats.bySeverity[log.severity] = (stats.bySeverity[log.severity] || 0) + 1;
      stats.topIPs[log.ip] = (stats.topIPs[log.ip] || 0) + 1;
    });
    
    return stats;
  } catch (error) {
    console.error('Error reading security logs:', error);
    return { total: 0, byType: {}, bySeverity: {} };
  }
};

module.exports = {
  securityLogger,
  logAuthFailure,
  logBruteForce,
  logRateLimit,
  logInvalidMethod,
  logFileUpload,
  logPathTraversal,
  logSecurityEvent,
  getSecurityStats,
  SEVERITY,
  EVENT_TYPES
};
