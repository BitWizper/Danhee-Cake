// middleware/cookieSecurity.js
// Protecciones avanzadas para cookies

const crypto = require('crypto');

// Generar fingerprint del cliente basado solo en User-Agent (no IP para evitar falsos positivos)
const generateClientFingerprint = (req) => {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const acceptLanguage = req.headers['accept-language'] || 'unknown';
  const acceptEncoding = req.headers['accept-encoding'] || 'unknown';
  const fingerprintData = `${userAgent}:${acceptLanguage}:${acceptEncoding}`;
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
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
      path: '/'
    });
    
    return next();
  }
  
  // Validar que el fingerprint no haya cambiado
  const currentFingerprint = generateClientFingerprint(req);
  if (currentFingerprint !== storedFingerprint) {
    // Fingerprint cambió - posible robo de sesión o cambio legítimo de configuración
    console.warn('[Security] Client fingerprint mismatch - possible session theft or browser config change');
    
    // Marcar la anomalía en el request para que middlewares posteriores puedan decidir
    req.fingerprintMismatch = true;
    
    // Actualizar el fingerprint pero mantener la sesión activa
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('client_fingerprint', currentFingerprint, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 días
      path: '/'
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

// Middleware para requerir re-autenticación en acciones sensibles cuando hay fingerprint mismatch
const requireReauthOnFingerprintMismatch = (req, res, next) => {
  if (req.fingerprintMismatch) {
    // Acciones sensibles que requieren re-autenticación
    const sensitivePaths = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/appointments',
      '/api/payments',
      '/api/admin'
    ];
    
    const isSensitivePath = sensitivePaths.some(path => req.path.startsWith(path));
    
    if (isSensitivePath) {
      console.warn('[Security] Blocking sensitive action due to fingerprint mismatch');
      return res.status(403).json({
        success: false,
        message: 'Se detectó un cambio en tu navegador. Por seguridad, recarga la página y vuelve a intentar.'
      });
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
  COOKIE_PREFIX,
  requireReauthOnFingerprintMismatch
};
