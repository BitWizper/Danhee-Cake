// middleware/ipBlocker.js
// Middleware de bloqueo por IP para prevenir ataques persistentes

const { logSecurityEvent } = require('./auditLogger');
const { getClientIP, normalizeIp, isPrivateIp } = require('./clientIp');

// Configuración
const IP_BLOCKER_CONFIG = {
  maxFailedAttempts: 50, // Aumentado de 5 a 50 para pruebas
  blockDuration: 5 * 60 * 1000, // Reducido de 30 min a 5 min
  suspiciousThreshold: 30, // Aumentado de 3 a 30
  maxSuspiciousActions: 100, // Aumentado de 10 a 100
  permanentBlockThreshold: 200, // Aumentado de 20 a 200
  whitelist: [
    '127.0.0.1',
    '::1',
    '::ffff:127.0.0.1',
    'localhost',
    // IPs de ngrok (para pruebas)
    '209.178.128.185',
    // Rango de IPs Docker
    '172.16.0.0',
    '172.17.0.0',
    '172.18.0.0',
    '172.19.0.0',
    '172.20.0.0'
  ],
  // No se exime ninguna ruta de API: todas las rutas públicas deben ser analizadas
  publicRoutes: []
};

// Almacenamiento en memoria
const ipData = new Map(); // { ip: { attempts: 0, failedAttempts: 0, suspiciousActions: 0, blockedUntil: null, permanentlyBlocked: false, lastActivity: timestamp } }
const blockedIPs = new Set(); // IPs actualmente bloqueadas
const suspiciousIPs = new Set(); // IPs marcadas como sospechosas

// Función para verificar si una IP está en whitelist
const isWhitelisted = (ip) => {
  return IP_BLOCKER_CONFIG.whitelist.includes(ip);
};

const allowedPrivateIPs = (process.env.ALLOWED_PRIVATE_IPS || '127.0.0.1,::1,::ffff:127.0.0.1')
  .split(',')
  .map((ip) => normalizeIp(ip))
  .filter(Boolean);

const isAllowedPrivateIp = (ip) => {
  const normalized = normalizeIp(ip);
  if (!normalized) return false;
  return allowedPrivateIPs.includes(normalized);
};

const isPrivatelyRoutedRequest = (req, ip) => {
  if (!ip || ip === 'unknown') return false;
  if (!isPrivateIp(ip)) return false;
  if (isAllowedPrivateIp(ip)) return false;

  const origin = req.headers.origin || req.headers.referer || req.headers.referrer || '';
  const host = req.headers.host || req.headers['x-forwarded-host'] || req.hostname || '';
  const normalizedHost = String(host).toLowerCase();

  return !(origin || normalizedHost.includes('localhost') || normalizedHost.includes('127.0.0.1'));
};

// Función para verificar si una IP está bloqueada
const isIPBlocked = (ip) => {
  const data = ipData.get(ip);
  if (!data) return false;
  
  // Verificar bloqueo permanente
  if (data.permanentlyBlocked) return true;
  
  // Verificar bloqueo temporal
  if (data.blockedUntil && Date.now() < data.blockedUntil) return true;
  
  // Si el bloqueo temporal expiró, limpiar
  if (data.blockedUntil && Date.now() >= data.blockedUntil) {
    data.blockedUntil = null;
    data.failedAttempts = 0;
    ipData.set(ip, data);
    blockedIPs.delete(ip);
  }
  
  return false;
};

// Función para registrar un intento fallido
const recordFailedAttempt = (ip) => {
  if (isWhitelisted(ip)) return;
  
  const data = ipData.get(ip) || {
    attempts: 0,
    failedAttempts: 0,
    suspiciousActions: 0,
    blockedUntil: null,
    permanentlyBlocked: false,
    lastActivity: Date.now()
  };
  
  data.failedAttempts++;
  data.attempts++;
  data.lastActivity = Date.now();
  
  // Verificar si debe ser bloqueada
  if (data.failedAttempts >= IP_BLOCKER_CONFIG.maxFailedAttempts) {
    data.blockedUntil = Date.now() + IP_BLOCKER_CONFIG.blockDuration;
    blockedIPs.add(ip);
    logSecurityEvent('IP_BLOCKED_TEMPORARY', {
      ip,
      failedAttempts: data.failedAttempts,
      blockDuration: IP_BLOCKER_CONFIG.blockDuration,
      blockedUntil: new Date(data.blockedUntil).toISOString()
    });
  }
  
  // Verificar bloqueo permanente
  if (data.attempts >= IP_BLOCKER_CONFIG.permanentBlockThreshold) {
    data.permanentlyBlocked = true;
    blockedIPs.add(ip);
    logSecurityEvent('IP_BLOCKED_PERMANENT', {
      ip,
      totalAttempts: data.attempts,
      failedAttempts: data.failedAttempts
    });
  }
  
  ipData.set(ip, data);
};

// Función para registrar una acción sospechosa
const recordSuspiciousAction = (ip, actionType) => {
  if (isWhitelisted(ip)) return;
  
  const data = ipData.get(ip) || {
    attempts: 0,
    failedAttempts: 0,
    suspiciousActions: 0,
    blockedUntil: null,
    permanentlyBlocked: false,
    lastActivity: Date.now()
  };
  
  data.suspiciousActions++;
  data.attempts++;
  data.lastActivity = Date.now();
  
  logSecurityEvent('SUSPICIOUS_ACTION', {
    ip,
    actionType,
    suspiciousActions: data.suspiciousActions
  });
  
  // Marcar como sospechosa
  if (data.suspiciousActions >= IP_BLOCKER_CONFIG.suspiciousThreshold) {
    suspiciousIPs.add(ip);
  }
  
  // Bloquear si hay demasiadas acciones sospechosas
  if (data.suspiciousActions >= IP_BLOCKER_CONFIG.maxSuspiciousActions) {
    data.permanentlyBlocked = true;
    blockedIPs.add(ip);
    logSecurityEvent('IP_BLOCKED_PERMANENT_SUSPICIOUS', {
      ip,
      suspiciousActions: data.suspiciousActions
    });
  }
  
  ipData.set(ip, data);
};

// Función para registrar un intento exitoso (reduce el contador de fallos)
const recordSuccessfulAttempt = (ip) => {
  if (isWhitelisted(ip)) return;
  
  const data = ipData.get(ip);
  if (!data) return;
  
  // Reducir contador de fallos gradualmente
  if (data.failedAttempts > 0) {
    data.failedAttempts = Math.max(0, data.failedAttempts - 1);
  }
  
  data.lastActivity = Date.now();
  ipData.set(ip, data);
};

// Función para desbloquear una IP manualmente
const unblockIP = (ip) => {
  const data = ipData.get(ip);
  if (!data) return;
  
  data.blockedUntil = null;
  data.failedAttempts = 0;
  data.permanentlyBlocked = false;
  blockedIPs.delete(ip);
  suspiciousIPs.delete(ip);
  
  logSecurityEvent('IP_UNBLOCKED', { ip });
  
  ipData.set(ip, data);
};

// Función para obtener estadísticas de una IP
const getIPStats = (ip) => {
  return ipData.get(ip) || null;
};

// Función para limpiar datos antiguos (ejecutar periódicamente)
const cleanupOldIPs = () => {
  const now = Date.now();
  const maxAge = 24 * 60 * 60 * 1000; // 24 horas
  
  for (const [ip, data] of ipData.entries()) {
    if (now - data.lastActivity > maxAge && !data.permanentlyBlocked) {
      ipData.delete(ip);
      blockedIPs.delete(ip);
      suspiciousIPs.delete(ip);
    }
  }
};

// Limpiar datos antiguos cada hora
setInterval(cleanupOldIPs, 60 * 60 * 1000);

// Función para verificar si una ruta es pública
const isPublicRoute = (path) => {
  return IP_BLOCKER_CONFIG.publicRoutes.some(route => path.startsWith(route));
};

// Middleware principal de bloqueo por IP
const ipBlocker = (req, res, next) => {
  // Desactivar en desarrollo para facilitar pruebas
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  const ip = getClientIP(req);
  
  // Verificar si es una ruta pública - no aplicar bloqueo por IP
  if (isPublicRoute(req.path)) {
    return next();
  }
  
  // Verificar whitelist
  if (isWhitelisted(ip)) {
    return next();
  }

  if (isPrivatelyRoutedRequest(req, ip)) {
    logSecurityEvent('PRIVATE_IP_BLOCKED', {
      ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent']
    });

    return res.status(403).json({
      error: 'Access denied',
      message: 'Las solicitudes desde IP privadas no están permitidas salvo que estén explícitamente autorizadas.'
    });
  }
  
  // Verificar si está bloqueada
  if (isIPBlocked(ip)) {
    const data = ipData.get(ip);
    const blockType = data?.permanentlyBlocked ? 'PERMANENTE' : 'TEMPORAL';
    
    logSecurityEvent('IP_BLOCK_ACCESS_ATTEMPT', {
      ip,
      blockType,
      userAgent: req.headers['user-agent'],
      path: req.path,
      method: req.method
    });
    
    return res.status(403).json({
      error: 'Access denied',
      message: 'Tu IP ha sido bloqueada por razones de seguridad. Contacta al administrador si crees que es un error.',
      blockType,
      blockedUntil: data?.blockedUntil ? new Date(data.blockedUntil).toISOString() : null
    });
  }
  
  // Verificar si es sospechosa y agregar header de advertencia
  if (suspiciousIPs.has(ip)) {
    res.setHeader('X-Security-Warning', 'Your IP has been flagged for suspicious activity');
  }
  
  // Continuar con la solicitud
  next();
};

// Middleware para detectar patrones de ataque y bloquear automáticamente
const attackDetector = (req, res, next) => {
  // Desactivar en desarrollo para facilitar pruebas
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }
  
  const ip = getClientIP(req);
  
  // Verificar si es una ruta pública - no aplicar detección de ataques
  if (isPublicRoute(req.path)) {
    return next();
  }
  
  if (isWhitelisted(ip)) {
    return next();
  }

  if (isPrivatelyRoutedRequest(req, ip)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Las solicitudes desde IP privadas no están permitidas salvo que estén explícitamente autorizadas.'
    });
  }
  
  const path = req.path.toLowerCase();
  const method = req.method;
  const userAgent = req.headers['user-agent'] || '';
  
  // User-Agents permitidos (herramientas legítimas de desarrollo/testing)
  const allowedUserAgents = [
    /curl/i,
    /wget/i,
    /postman/i,
    /insomnia/i,
    /httpie/i,
    /mozilla/i,
    /chrome/i,
    /safari/i,
    /edge/i,
    /firefox/i
  ];
  
  // Verificar si el User-Agent es permitido
  const isAllowedUA = allowedUserAgents.some(pattern => pattern.test(userAgent));
  
  // Patrones de ataque comunes
  const attackPatterns = [
    // SQL Injection
    /union\s+select/i,
    /or\s+1\s*=\s*1/i,
    /drop\s+table/i,
    /insert\s+into/i,
    /delete\s+from/i,
    // XSS
    /<script/i,
    /javascript:/i,
    /onerror/i,
    /onload/i,
    // Path traversal
    /\.\.\//,
    /%2e%2e/i,
    // Command injection
    /;\s*(rm|ls|cat|wget|curl|nc|netcat)/i,
    /\|\s*(rm|ls|cat|wget|curl|nc|netcat)/i,
    // Common exploit paths
    /admin/i,
    /wp-admin/i,
    /phpmyadmin/i,
    /\.env/i,
    /\.git/i,
    /config\.php/i,
    /web\.config/i,
  ];
  
  // Verificar patrones en URL (solo si el User-Agent no es permitido)
  if (!isAllowedUA) {
    for (const pattern of attackPatterns) {
      if (pattern.test(path) || pattern.test(req.url)) {
        recordSuspiciousAction(ip, `ATTACK_PATTERN_DETECTED: ${pattern}`);
        logSecurityEvent('ATTACK_PATTERN_DETECTED', {
          ip,
          pattern: pattern.toString(),
          path: req.path,
          method,
          userAgent
        });
        
        // Bloquear inmediatamente si es un patrón grave
        if (/<script|union\s+select|drop\s+table|;\s*rm/i.test(pattern.toString())) {
          const data = ipData.get(ip) || {
            attempts: 0,
            failedAttempts: 0,
            suspiciousActions: 0,
            blockedUntil: null,
            permanentlyBlocked: false,
            lastActivity: Date.now()
          };
          data.permanentlyBlocked = true;
          blockedIPs.add(ip);
          ipData.set(ip, data);
          
          return res.status(403).json({
            error: 'Access denied',
            message: 'Tu IP ha sido bloqueada permanentemente por actividad maliciosa.'
          });
        }
        
        break;
      }
    }
  }
  
  // Verificar User-Agents sospechosos
  const suspiciousUserAgents = [
    /sqlmap/i,
    /nmap/i,
    /nikto/i,
    /burpcollaborator/i,
    /acunetix/i,
    /w3af/i,
    /hydra/i,
    /metasploit/i,
    /openvas/i,
    /skipfish/i,
    /dirbuster/i,
    /wpscan/i,
    /arachni/i,
    /webscarab/i,
    /grabber/i,
    /havij/i,
    /pangolin/i,
    /bbscan/i,
  ];
  
  for (const pattern of suspiciousUserAgents) {
    if (pattern.test(userAgent)) {
      recordSuspiciousAction(ip, 'SUSPICIOUS_USER_AGENT');
      break;
    }
  }
  
  // Verificar rate de solicitudes muy alta (posible DoS)
  const data = ipData.get(ip) || {
    attempts: 0,
    failedAttempts: 0,
    suspiciousActions: 0,
    blockedUntil: null,
    permanentlyBlocked: false,
    lastActivity: Date.now()
  };
  
  const now = Date.now();
  const timeSinceLastActivity = now - data.lastActivity;
  
  // Si hay más de 100 solicitudes en 10 segundos, bloquear temporalmente
  if (timeSinceLastActivity < 10000 && data.attempts > 100) {
    data.blockedUntil = now + (5 * 60 * 1000); // 5 minutos
    blockedIPs.add(ip);
    ipData.set(ip, data);
    
    logSecurityEvent('IP_RATE_LIMIT_BLOCKED', {
      ip,
      attempts: data.attempts,
      timeWindow: timeSinceLastActivity
    });
    
    return res.status(429).json({
      error: 'Too many requests',
      message: 'Has excedido el límite de solicitudes. Tu IP ha sido bloqueada temporalmente.'
    });
  }
  
  data.attempts++;
  data.lastActivity = now;
  ipData.set(ip, data);
  
  next();
};

module.exports = {
  ipBlocker,
  attackDetector,
  recordFailedAttempt,
  recordSuccessfulAttempt,
  recordSuspiciousAction,
  unblockIP,
  getIPStats,
  isIPBlocked,
  IP_BLOCKER_CONFIG
};
