// middleware/securityAdvanced.js
// Sistema de seguridad avanzado con detección de VPN, fingerprinting y WAF

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { logSecurityEvent } = require('./auditLogger');

// Almacenamiento en memoria para IPs sospechosas y fingerprints
const suspiciousIPs = new Map();
const deviceFingerprints = new Map();
const ipHistory = new Map();
const blockedIPs = new Map();

// Configuración
const SECURITY_CONFIG = {
  // Límite de intentos antes de bloqueo temporal
  maxFailedAttempts: 10,
  blockDuration: 15 * 60 * 1000, // 15 minutos
  
  // Detección de VPN/proxy
  vpnDetection: {
    enabled: true,
    checkDatacenters: true,
    checkHostingProviders: true,
    checkTorNodes: true
  },
  
  // Fingerprinting
  fingerprinting: {
    enabled: true,
    trackUserAgent: true,
    trackAcceptLanguage: true,
    trackAcceptEncoding: true
  },
  
  // Rate limiting avanzado
  rateLimiting: {
    enabled: true,
    windowMs: 60 * 1000, // 1 minuto
    maxRequests: 100,
    burstRequests: 20
  }
};

// Lista de rangos de IP conocidos de datacenters/VPN (simplificada)
const VPN_IP_RANGES = [
  // Cloudflare
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '108.162.192.0/18',
  '131.0.72.0/22',
  '141.101.64.0/18',
  '162.158.0.0/15',
  '172.64.0.0/13',
  '173.245.48.0/20',
  '188.114.96.0/20',
  '190.93.240.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  // AWS
  '3.0.0.0/8',
  '13.32.0.0/8',
  '35.152.0.0/13',
  '52.0.0.0/8',
  '54.0.0.0/8',
  '70.132.0.0/8',
  '72.21.192.0/21',
  // Otros datacenters comunes
  '104.238.0.0/16',
  '185.180.0.0/16'
];

// Patrones de User-Agent sospechosos
const SUSPICIOUS_UA_PATTERNS = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /scraper/i,
  /curl/i,
  /wget/i,
  /python/i,
  /java/i,
  /go-http-client/i,
  /headless/i,
  /phantom/i,
  /selenium/i
];

// Patrones de ataque SQLi
const SQLI_PATTERNS = [
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
  /(\%3D)|(=)[^\n]*((\%27)|(\')|(\-\-)|(\%3B)|(;))/i,
  /\w*((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i,
  /((\%27)|(\'))union/i,
  /exec(\s|\+)+(s|x)p\w+/i,
  /union(\s|\+)+(all)?(\s|\+)*select/i,
  /insert(\s|\+)+into/i,
  /delete(\s|\+)+from/i,
  /drop(\s|\+)*(table|database)/i
];

// Patrones de ataque XSS
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi,
  /<iframe[^>]*>/gi,
  /<object[^>]*>/gi,
  /<embed[^>]*>/gi,
  /eval\s*\(/gi,
  /expression\s*\(/gi
];

// Patrones de ataque RCE
const RCE_PATTERNS = [
  /\|\s*\w+/i,
  /;\s*\w+/i,
  /&&\s*\w+/i,
  /\$\([^)]+\)/i,
  /`[^`]+`/i,
  /\$\{[^}]+\}/i,
  /<\?php/i,
  /<\?=/i
];

// Función para generar fingerprint del dispositivo
function generateDeviceFingerprint(req) {
  const userAgent = req.headers['user-agent'] || '';
  const acceptLanguage = req.headers['accept-language'] || '';
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const accept = req.headers['accept'] || '';
  
  const fingerprintData = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${accept}`;
  return crypto.createHash('sha256').update(fingerprintData).digest('hex');
}

// Función para verificar si una IP está en rango de VPN
function isVPNOrDatacenterIP(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') return false;
  
  // Verificar si es IPv6
  if (ip.includes(':')) return false;
  
  const ipParts = ip.split('.').map(Number);
  if (ipParts.length !== 4) return false;
  
  const ipNum = (ipParts[0] << 24) + (ipParts[1] << 16) + (ipParts[2] << 8) + ipParts[3];
  
  for (const range of VPN_IP_RANGES) {
    const [rangeIP, mask] = range.split('/');
    const maskNum = parseInt(mask);
    const rangeParts = rangeIP.split('.').map(Number);
    const rangeNum = (rangeParts[0] << 24) + (rangeParts[1] << 16) + (rangeParts[2] << 8) + rangeParts[3];
    const maskValue = 0xFFFFFFFF << (32 - maskNum);
    
    if ((ipNum & maskValue) === (rangeNum & maskValue)) {
      return true;
    }
  }
  
  return false;
}

// Función para detectar User-Agent sospechoso
function isSuspiciousUserAgent(userAgent) {
  if (!userAgent) return true;
  
  for (const pattern of SUSPICIOUS_UA_PATTERNS) {
    if (pattern.test(userAgent)) {
      return true;
    }
  }
  
  return false;
}

// Función para detectar patrones de ataque en request
function detectAttackPatterns(req) {
  const url = req.url;
  const body = req.body ? JSON.stringify(req.body) : '';
  const query = req.query ? JSON.stringify(req.query) : '';
  const headers = JSON.stringify(req.headers);
  
  const combinedInput = `${url} ${body} ${query} ${headers}`;
  
  // Verificar SQLi
  for (const pattern of SQLI_PATTERNS) {
    if (pattern.test(combinedInput)) {
      return { type: 'SQL_INJECTION', pattern: pattern.toString() };
    }
  }
  
  // Verificar XSS
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(combinedInput)) {
      return { type: 'XSS', pattern: pattern.toString() };
    }
  }
  
  // Verificar RCE
  for (const pattern of RCE_PATTERNS) {
    if (pattern.test(combinedInput)) {
      return { type: 'RCE', pattern: pattern.toString() };
    }
  }
  
  return null;
}

// Función para verificar si una IP está bloqueada
function isIPBlocked(ip) {
  const blocked = blockedIPs.get(ip);
  if (!blocked) return false;
  
  if (Date.now() > blocked.expiry) {
    blockedIPs.delete(ip);
    return false;
  }
  
  return true;
}

// Función para bloquear una IP temporalmente
function blockIP(ip, duration = SECURITY_CONFIG.blockDuration) {
  blockedIPs.set(ip, {
    blockedAt: Date.now(),
    expiry: Date.now() + duration,
    reason: 'Suspicious activity detected'
  });
}

// Función para registrar historial de IP
function trackIPHistory(ip, fingerprint) {
  if (!ipHistory.has(ip)) {
    ipHistory.set(ip, []);
  }
  
  const history = ipHistory.get(ip);
  history.push({
    timestamp: Date.now(),
    fingerprint,
    userAgent: req.headers['user-agent']
  });
  
  // Mantener solo las últimas 50 entradas
  if (history.length > 50) {
    history.shift();
  }
  
  // Detectar cambios de IP sospechosos (mismo fingerprint, diferente IP)
  if (history.length > 1) {
    const lastEntry = history[history.length - 2];
    if (lastEntry.fingerprint === fingerprint && lastEntry.ip !== ip) {
      return {
        detected: true,
        previousIP: lastEntry.ip,
        message: 'IP change detected with same device fingerprint'
      };
    }
  }
  
  return { detected: false };
}

// Middleware principal de seguridad avanzada
const advancedSecurity = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const fingerprint = generateDeviceFingerprint(req);
  const userAgent = req.headers['user-agent'] || '';
  
  // 1. Verificar si IP está bloqueada
  if (isIPBlocked(ip)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Your IP has been temporarily blocked due to suspicious activity'
    });
  }
  
  // 2. Detectar VPN/Datacenter
  if (SECURITY_CONFIG.vpnDetection.enabled && isVPNOrDatacenterIP(ip)) {
    suspiciousIPs.set(ip, {
      reason: 'VPN/Datacenter IP detected',
      timestamp: Date.now(),
      ip
    });
    
    // Registrar en auditoría
    logSecurityEvent('VPN_DETECTED', {
      ip,
      userAgent,
      fingerprint
    });
    
    // No bloquear automáticamente, pero marcar como sospechoso
  }
  
  // 3. Detectar User-Agent sospechoso
  if (isSuspiciousUserAgent(userAgent)) {
    suspiciousIPs.set(ip, {
      reason: 'Suspicious User-Agent',
      timestamp: Date.now(),
      userAgent,
      ip
    });
    
    logSecurityEvent('SUSPICIOUS_UA', {
      ip,
      userAgent,
      fingerprint
    });
  }
  
  // 4. Detectar patrones de ataque (WAF)
  const attackPattern = detectAttackPatterns(req);
  if (attackPattern) {
    blockIP(ip);
    
    logSecurityEvent('ATTACK_PATTERN_DETECTED', {
      ip,
      attackType: attackPattern.type,
      pattern: attackPattern.pattern,
      url: req.url,
      userAgent
    });
    
    return res.status(403).json({
      error: 'Attack detected',
      message: 'Your request was blocked due to suspicious patterns'
    });
  }
  
  // 5. Rate limiting con fingerprinting
  if (SECURITY_CONFIG.rateLimiting.enabled) {
    const key = `${ip}_${fingerprint}`;
    
    if (!deviceFingerprints.has(key)) {
      deviceFingerprints.set(key, {
        count: 1,
        resetTime: Date.now() + SECURITY_CONFIG.rateLimiting.windowMs
      });
    } else {
      const data = deviceFingerprints.get(key);
      
      // Reset si expiró la ventana
      if (Date.now() > data.resetTime) {
        data.count = 1;
        data.resetTime = Date.now() + SECURITY_CONFIG.rateLimiting.windowMs;
      } else {
        data.count++;
        
        // Bloquear si excede el límite
        if (data.count > SECURITY_CONFIG.rateLimiting.maxRequests) {
          blockIP(ip);
          
          logSecurityEvent('RATE_LIMIT_EXCEEDED', {
            ip,
            fingerprint,
            count: data.count,
            url: req.url
          });
          
          return res.status(429).json({
            error: 'Too many requests',
            message: 'Rate limit exceeded. Please try again later.'
          });
        }
      }
      
      deviceFingerprints.set(key, data);
    }
  }
  
  // 6. Rastrear historial de IP para detectar cambios
  const ipChange = trackIPHistory(ip, fingerprint);
  if (ipChange.detected) {
    logSecurityEvent('IP_CHANGE_DETECTED', {
      currentIP: ip,
      previousIP: ipChange.previousIP,
      fingerprint,
      message: ipChange.message
    });
    
    // Considerar bloquear si hay múltiples cambios de IP
    suspiciousIPs.set(ip, {
      reason: 'Multiple IP changes detected',
      timestamp: Date.now(),
      ip,
      fingerprint
    });
  }
  
  // Agregar información de seguridad al request para uso posterior
  req.securityInfo = {
    ip,
    fingerprint,
    isVPN: isVPNOrDatacenterIP(ip),
    isSuspiciousUA: isSuspiciousUserAgent(userAgent),
    suspiciousIPs: suspiciousIPs.has(ip)
  };
  
  next();
};

// Función para obtener estadísticas de seguridad
const getSecurityStats = () => {
  return {
    suspiciousIPs: suspiciousIPs.size,
    blockedIPs: blockedIPs.size,
    trackedFingerprints: deviceFingerprints.size,
    ipHistoryEntries: ipHistory.size
  };
};

// Función para limpiar datos antiguos
const cleanupOldData = () => {
  const now = Date.now();
  
  // Limpiar IPs bloqueadas expiradas
  for (const [ip, data] of blockedIPs.entries()) {
    if (now > data.expiry) {
      blockedIPs.delete(ip);
    }
  }
  
  // Limpiar fingerprints antiguos
  for (const [key, data] of deviceFingerprints.entries()) {
    if (now > data.resetTime) {
      deviceFingerprints.delete(key);
    }
  }
  
  // Limpiar historial de IP antiguo (más de 24 horas)
  const oneDayAgo = now - (24 * 60 * 60 * 1000);
  for (const [ip, history] of ipHistory.entries()) {
    const filteredHistory = history.filter(entry => entry.timestamp > oneDayAgo);
    if (filteredHistory.length === 0) {
      ipHistory.delete(ip);
    } else {
      ipHistory.set(ip, filteredHistory);
    }
  }
};

// Ejecutar limpieza cada hora
setInterval(cleanupOldData, 60 * 60 * 1000);

module.exports = {
  advancedSecurity,
  getSecurityStats,
  cleanupOldData,
  isVPNOrDatacenterIP,
  isSuspiciousUserAgent,
  detectAttackPatterns,
  blockIP,
  isIPBlocked
};
