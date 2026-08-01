// Middleware de logging de auditoría para seguridad

const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');
const auditLogFile = path.join(logDir, 'audit.log');

// Crear directorio de logs si no existe
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logAudit = (level, message, meta = {}) => {
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    ...meta
  };
  
  const logLine = JSON.stringify(logEntry) + '\n';
  fs.appendFileSync(auditLogFile, logLine, { flag: 'a' });
  
  // Mostrar logs detallados si está en desarrollo o si ENABLE_DETAILED_LOGS=true
  const showDetailedLogs = process.env.NODE_ENV !== 'production' || process.env.ENABLE_DETAILED_LOGS === 'true';
  
  if (showDetailedLogs) {
    console.log(`[AUDIT ${level}] ${message}`, meta);
  } else {
    // En producción sin ENABLE_DETAILED_LOGS, solo loggear nivel SECURITY/ALERT sin detalles
    if (level === 'SECURITY' || level === 'ALERT') {
      console.log(`[AUDIT ${level}] ${message}`);
    }
  }
};

const { getClientIP } = require('./clientIp');

const auditLogger = (req, res, next) => {
  const startTime = Date.now();
  const clientIp = getClientIP(req);
  
  // Log de solicitud
  logAudit('INFO', 'Incoming request', {
    method: req.method,
    path: req.path,
    ip: clientIp,
    proxiedIp: req.ip,
    userAgent: req.get('user-agent'),
    contentType: req.get('content-type')
  });
  
  // Capturar respuesta original
  const originalSend = res.send;
  res.send = function(data) {
    const responseTime = Date.now() - startTime;
    const statusCode = res.statusCode;
    
    // Log de respuesta
    if (statusCode >= 400) {
      logAudit('WARN', 'Request failed', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        statusCode,
        responseTime
      });
    }
    
    if (statusCode === 401 || statusCode === 403) {
      logAudit('ALERT', 'Security-related response', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        statusCode,
        userAgent: req.get('user-agent')
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// Función helper para logear eventos específicos de seguridad
const logSecurityEvent = (eventType, details) => {
  logAudit('SECURITY', eventType, details);
};

module.exports = {
  auditLogger,
  logSecurityEvent
};
