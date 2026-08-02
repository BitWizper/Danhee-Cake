// middleware/csrfProtection.js
// Middleware de protección CSRF usando tokens

const crypto = require('crypto');

// Almacenamiento de tokens CSRF en memoria (en producción usar Redis o base de datos)
const csrfTokens = new Map();

// Generar token CSRF
const generateCSRFToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

// Middleware para generar y validar token CSRF
const csrfProtection = (req, res, next) => {
  // Solo aplicar a métodos que modifican estado
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // En desarrollo, desactivar CSRF para facilitar las pruebas
  if (process.env.NODE_ENV !== 'production') {
    console.log('[CSRF] CSRF protection disabled in development');
    return next();
  }

  // Obtener token del header o del body
  const csrfTokenFromHeader = req.headers['x-csrf-token'];
  const csrfTokenFromBody = req.body?.csrf_token;
  const csrfTokenFromCookie = req.cookies?.csrf_token;

  const providedToken = csrfTokenFromHeader || csrfTokenFromBody || csrfTokenFromCookie;

  if (!providedToken) {
    console.log('[CSRF] No CSRF token provided');
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_MISSING',
      message: 'Token CSRF requerido para esta operación'
    });
  }

  // Verificar token (en producción verificar contra token almacenado por sesión)
  // Por ahora, usamos una validación simple basada en cookie
  if (csrfTokenFromCookie && providedToken !== csrfTokenFromCookie) {
    console.log('[CSRF] CSRF token mismatch');
    return res.status(403).json({
      success: false,
      error: 'CSRF_TOKEN_INVALID',
      message: 'Token CSRF inválido'
    });
  }

  console.log('[CSRF] Token validated successfully');
  next();
};

// Middleware para generar token CSRF y enviarlo en cookie
const generateCSRFTokenMiddleware = (req, res, next) => {
  const token = generateCSRFToken();
  
  // Enviar token como cookie httpOnly
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie('csrf_token', token, {
    httpOnly: false, // No httpOnly para que JavaScript pueda leerlo
    secure: isProduction,
    sameSite: 'lax', // Cambiado de 'strict' a 'lax' para permitir cross-origin
    path: '/',
    maxAge: 24 * 60 * 60 * 1000 // 24 horas
  });

  // También enviarlo en header para facilitar el acceso
  res.setHeader('X-CSRF-Token', token);

  next();
};

// Middleware opcional que solo genera token sin forzar validación
const csrfTokenGenerator = (req, res, next) => {
  const token = generateCSRFToken();
  
  console.log('[CSRF] Generating token:', token.substring(0, 8) + '...');
  console.log('[CSRF] Origin:', req.headers.origin);
  console.log('[CSRF] Referer:', req.headers.referer);
  
  res.cookie('csrf_token', token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax', // Cambiado de 'strict' a 'lax' para permitir cross-origin
    path: '/',
    maxAge: 24 * 60 * 60 * 1000
  });

  res.setHeader('X-CSRF-Token', token);
  console.log('[CSRF] Token sent in header and cookie');
  next();
};

module.exports = {
  csrfProtection,
  generateCSRFTokenMiddleware,
  csrfTokenGenerator,
  generateCSRFToken
};
