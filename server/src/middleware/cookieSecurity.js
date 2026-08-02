// middleware/cookieSecurity.js
// Protecciones avanzadas para cookies

const crypto = require('crypto');

// Generar fingerprint del cliente basado en IP y User-Agent
const generateClientFingerprint = (req) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const userAgent = req.headers['user-agent'] || 'unknown';
  const fingerprintData = `${ip}:${userAgent}`;
  return crypto.createHash('sha256').update(fingerprintData).digest('hex').substring(0, 16);
};

// Validar fingerprint del cliente
const validateClientFingerprint = (req, storedFingerprint) => {
  const currentFingerprint = generateClientFingerprint(req);
  return currentFingerprint === storedFingerprint;
};

// Generar cookie prefix seguro
const COOKIE_PREFIX = process.env.COOKIE_PREFIX || '__Secure-';

// Opciones de cookie seguras con todas las protecciones
const getSecureCookieOptions = (req, maxAge, isProduction = false) => {
  const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
  const fingerprint = generateClientFingerprint(req);
  
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
    maxAge: maxAge,
    domain: cookieDomain,
    ...(isProduction && {
      priority: 'high',
      // Additional security for production
      partitioned: true, // CHIPS (Cookies Having Independent Partitioned State)
    }),
    // Custom fingerprint validation (stored in separate cookie)
    signed: true, // Express cookie signing
  };
};

// Middleware para validar fingerprint antes de procesar request
const validateCookieFingerprint = (req, res, next) => {
  const storedFingerprint = req.cookies?.client_fingerprint;
  
  if (!storedFingerprint) {
    // Primer acceso, generar y guardar fingerprint
    const fingerprint = generateClientFingerprint(req);
    const isProduction = process.env.NODE_ENV === 'production';
    
    res.cookie('client_fingerprint', fingerprint, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000, // 24 horas
      ...(isProduction && { priority: 'high' })
    });
    
    return next();
  }
  
  // Validar que el fingerprint no haya cambiado
  if (!validateClientFingerprint(req, storedFingerprint)) {
    // Fingerprint cambió - posible robo de sesión o cambio de IP
    console.warn('[Security] Client fingerprint mismatch - possible session theft');
    
    // Limpiar cookies de sesión
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: '/' });
    res.clearCookie('client_fingerprint', { path: '/' });
    
    return res.status(401).json({
      success: false,
      error: 'SESSION_INVALID',
      message: 'Tu sesión ha sido invalidada por seguridad. Por favor inicia sesión nuevamente.'
    });
  }
  
  next();
};

// Middleware para rotar cookies (refresh tokens)
const rotateCookies = (req, res, next) => {
  const originalCookie = res.cookie;
  
  res.cookie = function(name, value, options) {
    // Si es una cookie sensible, agregar timestamp de rotación
    if (['access_token', 'refresh_token'].includes(name)) {
      options = options || {};
      options._rotatedAt = Date.now();
    }
    
    return originalCookie.call(this, name, value, options);
  };
  
  next();
};

// Middleware para detectar cookies manipuladas
const detectCookieTampering = (req, res, next) => {
  // Verificar que las cookies no tengan valores inválidos
  const suspiciousPatterns = [
    /<script/i,
    /javascript:/i,
    /data:/i,
    /\.\.\//,
  ];
  
  for (const [cookieName, cookieValue] of Object.entries(req.cookies || {})) {
    if (typeof cookieValue === 'string') {
      for (const pattern of suspiciousPatterns) {
        if (pattern.test(cookieValue)) {
          console.warn(`[Security] Suspicious pattern detected in cookie ${cookieName}`);
          
          // Limpiar todas las cookies
          Object.keys(req.cookies).forEach(cookie => {
            res.clearCookie(cookie, { path: '/' });
          });
          
          return res.status(403).json({
            success: false,
            error: 'COOKIE_TAMPERING',
            message: 'Cookie inválida detectada'
          });
        }
      }
    }
  }
  
  next();
};

module.exports = {
  generateClientFingerprint,
  validateClientFingerprint,
  getSecureCookieOptions,
  validateCookieFingerprint,
  rotateCookies,
  detectCookieTampering,
  COOKIE_PREFIX
};
